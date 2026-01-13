import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../firebase";
import SpacePickerModal from "../components/SpacePickerModal";
import { fetchUserSpaces, AppSpace, spaceToRoute, getSpacesFromRole, roleFromAzureGroups } from "../services/userSpaces";
import { spacesFromAzureGroups } from "../services/userSpaces";
// auth import removed (region selection is manual, no Firestore region fetch needed)
import { useRegion } from '../contexts/RegionContext';
import { Eye, EyeOff, ShieldCheck } from "lucide-react";

const LoginPage = () => {
  
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [networkOk, setNetworkOk] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [spaceChoices, setSpaceChoices] = useState<AppSpace[]>([]);
  const [spaceEmail, setSpaceEmail] = useState<string | null>(null);
  const [msAuthDetail, setMsAuthDetail] = useState<{ code?: string; message?: string } | null>(null);
  // Option B: whitelist temporary supervisor access based on email typed on login screen
  const SUPERVISOR_WHITELIST = [
    "m.sahraoui@orange.mars-marketing.fr",
    "f.moursi@orange.mars-marketing.fr",
    "i.brai@orange.mars-marketing.fr",
    "l.raynaud@mars-marketing.fr",
    "l.raynaud@orange.mars-marketing.fr",
    "m.demauret@mars-marketing.fr",
    "i.boultame@mars-marketing.fr",
    "j.allione@mars-marketing.fr",
    "j.pariolleau@mars-marketing.fr",
    "olivier@evenmedia.fr",
    "m.maimoun@mars-marketing.fr",
    "m.maimoun@orange.mars-marketing.fr",
    "s.karabagli@mars-marketing.fr",
    "s.karabagli@orange.mars-marketing.fr",
    "a.gouet@mars-marketing.fr",
    "a.gouet@orange.mars-marketing.fr",
    "i.brai@mars-marketing.fr",

  ]; // temporary
  type SupervisorChoice = 'fr' | 'civ' | 'leads' | null;
  const [supervisorChoice, setSupervisorChoice] = useState<SupervisorChoice>(null);

  const testConnectivity = async () => {
    setTesting(true);
    setNetworkOk(null);
    try {
      // Petite requête rapide vers Firebase public endpoint (no auth needed)
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch('https://www.googleapis.com/generate_204', { signal: ctrl.signal });
      clearTimeout(t);
      setNetworkOk(res.ok);
    } catch {
      setNetworkOk(false);
    } finally {
      setTesting(false);
    }
  };

  const { login, loginWithMicrosoft } = useAuth();
  const { setRegion } = useRegion();
  const [searchParams] = useSearchParams();
  const [selectedRegion, setSelectedRegion] = useState<'FR' | 'CIV'>(() => (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || 'FR');
  const [mission, setMission] = useState<'CANAL_PLUS' | 'ORANGE_LEADS'>(() => {
    try {
      const stored = localStorage.getItem('activeMission');
      return stored === 'ORANGE_LEADS' ? 'ORANGE_LEADS' : 'CANAL_PLUS';
    } catch {
      return 'CANAL_PLUS';
    }
  });
  const navigate = useNavigate();

  const normalizedEmail = email.trim().toLowerCase();
  // Autoriser soit l'email complet whitelisté, soit le simple identifiant (partie avant @)
  const supervisorLocalParts = SUPERVISOR_WHITELIST.map(e => e.split('@')[0]);
  const inputHasAt = normalizedEmail.includes('@');
  const inputLocal = normalizedEmail.split('@')[0];
  const isSupervisorAllowed = inputHasAt
    ? SUPERVISOR_WHITELIST.includes(normalizedEmail)
    : supervisorLocalParts.includes(inputLocal);
  const supervisorTargetPath = supervisorChoice
    ? `/dashboard/superviseur/${supervisorChoice}`
    : null;

  // Détecte si le domaine courant est autorisé pour SSO OAuth (Firebase Authorized Domains)
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(host);
  const allowedAuthDomains = useMemo(() => [
    'cactus-labs.fr',
    'cactus-mm.web.app',
    'cactus-mm.firebaseapp.com',
  ], []);
  const isOnAllowedDomain = useMemo(() => {
    if (!host) return true; // SSR/unknown, ne bloque pas
    if (isLocalHost) return true;
    return allowedAuthDomains.some(d => host === d || host.endsWith('.' + d));
  }, [host, allowedAuthDomains, isLocalHost]);

  // Récupération des détails d'erreur SSO Microsoft si disponibles (posés par AuthContext)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('lastMicrosoftError');
      if (raw) {
        const parsed = JSON.parse(raw);
        setMsAuthDetail({ code: parsed?.code, message: parsed?.message });
      }
    } catch {}
  }, []);

  // Auto-SignIn si "?sso=1&hint=..." présent (utile après redirection vers domaine canonique)
  useEffect(() => {
    const sso = searchParams.get('sso');
    const hint = (searchParams.get('hint') || '').trim();
    const already = sessionStorage.getItem('ssoTriggered') === '1';
    const isLogged = !!user || !!auth.currentUser;
    // Ne pas déclencher le SSO auto si l'utilisateur est déjà connecté ou si déjà tenté
    if (sso === '1' && !isLogged && !already) {
      if (hint && !email) setEmail(hint);
      try { sessionStorage.setItem('ssoTriggered', '1'); } catch {}
      // Lance SSO automatiquement avec le hint
      setTimeout(() => {
        handleMicrosoftLogin();
      }, 0);
    }
  }, [searchParams, user]);

  const handleMissionSelect = (value: 'CANAL_PLUS' | 'ORANGE_LEADS') => {
    setMission(value);
    try {
      localStorage.setItem('activeMission', value);
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { success, message } = await login(email, password);
      if (success) {
        // Si une session impose LEADS, appliquer immédiatement et sortir
        try {
          if (sessionStorage.getItem('forceSupervisorLeads') === '1') {
            try { localStorage.setItem('lastSpace', 'LEADS'); } catch {}
            try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
            navigate('/dashboard/superviseur/leads/dashboard2');
            return;
          }
        } catch {}
        localStorage.setItem('activeRegion', selectedRegion);
        localStorage.setItem('activeMission', mission);
        setRegion(selectedRegion);
        // Préférer les espaces basés sur le rôle/groupe lorsqu'ils sont disponibles (même logique que le flux SSO Microsoft)
        try {
          const currentEmail = (auth.currentUser?.email || email || '').toLowerCase();
          // Résoudre le rôle à partir des claims pour déterminer les espaces
          let roleSpaces: AppSpace[] = [];
          try {
            const tokenResult = await (await import('firebase/auth')).getIdTokenResult(auth.currentUser!, true);
            const role = typeof tokenResult.claims.role === 'string' ? tokenResult.claims.role : undefined;
            roleSpaces = getSpacesFromRole(role);
          } catch {}
          const { spaces: fsSpaces, defaultSpace } = await fetchUserSpaces(currentEmail);
          // Si le groupe LEADS est présent, router immédiatement vers LEADS (superviseur)
          try {
            let groupsLocal: Array<{ id?: string; displayName?: string }> = [];
            const idToken = sessionStorage.getItem('ms_id_token') || undefined;
            if (idToken && idToken.split('.').length === 3) {
              const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
              if (Array.isArray(payload?.groups)) {
                const raw = payload.groups as string[];
                const guid = /^[0-9a-fA-F-]{36}$/;
                groupsLocal = raw.map(v => guid.test(String(v)) ? { id: String(v) } : { displayName: String(v) });
              }
            }
            const idsLower = groupsLocal.map(g => String(g?.id || '').toLowerCase());
            const namesUpper = groupsLocal.map(g => String(g?.displayName || '').toUpperCase());
            const hasLeadsGroup = idsLower.includes('54ef3c7c-1ec1-4c1c-aece-7db95d00737d') || namesUpper.some((n: string) => n.includes('SUP') && n.includes('LEADS'));
            if (hasLeadsGroup) {
              try { localStorage.setItem('lastSpace', 'LEADS'); } catch {}
              try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
              try { sessionStorage.setItem('forceSupervisorLeads', '1'); } catch {}
              navigate('/dashboard/superviseur/leads/dashboard2');
              return;
            }
            // Fallback interactif Graph: tenter une fois de récupérer les groupes pour détecter LEADS avant tout FR/CIV
            try {
              const alreadyInteractive = sessionStorage.getItem('ms_graph_groups_interactive_login') === '1';
              if (!alreadyInteractive) {
                const tokenI = await (await import('../services/msGraphToken')).getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All','Directory.Read.All'], interactive: true });
                if (tokenI) {
                  const resI = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', { headers: { Authorization: `Bearer ${tokenI}` } });
                  if (resI.ok) {
                    const jI = await resI.json().catch(() => ({}));
                    const itemsI: any[] = Array.isArray(jI?.value) ? jI.value : [];
                    const idsI = itemsI.map(it => String(it?.id || '').toLowerCase());
                    const namesI = itemsI.map(it => String(it?.displayName || '').toUpperCase());
                    const hasLeadsI = idsI.includes('54ef3c7c-1ec1-4c1c-aece-7db95d00737d') || namesI.some((n: string) => n.includes('SUP') && n.includes('LEADS'));
                    if (hasLeadsI) {
                      try { localStorage.setItem('lastSpace', 'LEADS'); } catch {}
                      try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
                      try { sessionStorage.setItem('forceSupervisorLeads', '1'); } catch {}
                      navigate('/dashboard/superviseur/leads/dashboard2');
                      return;
                    }
                  }
                }
                try { sessionStorage.setItem('ms_graph_groups_interactive_login', '1'); } catch {}
              }
            } catch {}
          } catch {}
          // Préférence forte: espaces dérivés des groupes Azure (LEADS prioritaire), puis rôle, puis Firestore
          const spacesFromGroups = (() => {
            try {
              // Reutiliser la détection effectuée au-dessus
              // On re-compute groups pour extraire aussi les espaces
              let groups: (string | { id?: string; displayName?: string })[] = [];
              const idToken = sessionStorage.getItem('ms_id_token') || undefined;
              if (idToken && idToken.split('.').length === 3) {
                const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
                if (Array.isArray(payload?.groups)) {
                  const raw = payload.groups as string[];
                  const guid = /^[0-9a-fA-F-]{36}$/;
                  groups = raw.map(v => guid.test(String(v)) ? { id: String(v) } : { displayName: String(v) });
                }
              }
              return spacesFromAzureGroups(groups);
            } catch { return []; }
          })();
          const spaces = spacesFromGroups.length ? spacesFromGroups : (roleSpaces.length ? roleSpaces : fsSpaces);

          const last = ((): AppSpace | null => {
            const v = localStorage.getItem('lastSpace');
            return v === 'CANAL_FR' || v === 'CANAL_CIV' || v === 'LEADS' ? (v as AppSpace) : null;
          })();

          const pickSupervisorSpace = (choice: SupervisorChoice | null): AppSpace | null => {
            if (!choice) return null;
            if (choice === 'fr') return 'CANAL_FR';
            if (choice === 'civ') return 'CANAL_CIV';
            if (choice === 'leads') return 'LEADS';
            return null;
          };
          // Détection automatique du statut superviseur via groupes Azure (ID token ou Graph)
          let supervisorFromAzure = false;
          try {
            let groups: (string | { id?: string; displayName?: string })[] = [];
            const idToken = sessionStorage.getItem('ms_id_token') || undefined;
            if (idToken && idToken.split('.').length === 3) {
              const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
              if (Array.isArray(payload?.groups)) {
                const raw = payload.groups as string[];
                const guid = /^[0-9a-fA-F-]{36}$/;
                groups = raw.map(v => guid.test(String(v)) ? { id: String(v) } : { displayName: String(v) });
              }
            }
            if (!groups.length) {
              const token = await (await import('../services/msGraphToken')).getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All','Directory.Read.All'] });
              if (token) {
                const res = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                  const j = await res.json().catch(() => ({}));
                  const items: any[] = Array.isArray(j?.value) ? j.value : [];
                  groups = items.map(it => ({ id: it?.id, displayName: it?.displayName }));
                }
              }
            }
            const r = roleFromAzureGroups(groups);
            supervisorFromAzure = !!r && String(r).toUpperCase().includes('SUPERVISEUR');
            // Fallback direct par ID via variable d'env ou ID connu
            try {
              const moId = (import.meta as any)?.env?.VITE_AZURE_GROUP_MO_SUP_CANAL_ID as string | undefined;
              const ids = groups.map(g => typeof g === 'string' ? String(g).toLowerCase() : String((g as any)?.id || '').toLowerCase());
              if (moId && ids.includes(String(moId).toLowerCase())) supervisorFromAzure = true;
              if (ids.includes('c38dce07-743e-40c6-aab9-f46dc0ea9adb')) supervisorFromAzure = true;
            } catch {}
          } catch {}

          const navigateToSpace = (space: AppSpace, supervisor?: boolean) => {
            try { localStorage.setItem('lastSpace', space); } catch {}
            if (space === 'LEADS') {
              try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
            } else {
              try { localStorage.setItem('activeMission', 'CANAL_PLUS'); } catch {}
            }
            if (space === 'CANAL_FR') { try { localStorage.setItem('activeRegion', 'FR'); } catch {}; setRegion('FR'); }
            if (space === 'CANAL_CIV') { try { localStorage.setItem('activeRegion', 'CIV'); } catch {}; setRegion('CIV'); }
            const path = spaceToRoute(space, supervisorFromAzure || supervisor);
            navigate(path);
          };

          if (spaces.length === 0) {
            // Si l'utilisateur est détecté superviseur via Azure, router directement vers dashboard superviseur FR/CIV
            if (supervisorFromAzure) {
              try {
                const token = await (await import('../services/msGraphToken')).getFreshMicrosoftAccessToken({ scopes: ['User.Read'] });
                let region: 'FR' | 'CIV' = 'FR';
                if (token) {
                  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=country,usageLocation', { headers: { Authorization: `Bearer ${token}` } });
                  if (res.ok) {
                    const j = await res.json().catch(() => ({}));
                    const usage = String(j?.usageLocation || '').trim().toUpperCase();
                    const rawCountry = String(j?.country || '').trim().toUpperCase();
                    if (['CI','CIV','CÔTE D’IVOIRE',"COTE D'IVOIRE"].includes(usage) || ['CI','CIV','CÔTE D’IVOIRE',"COTE D'IVOIRE"].includes(rawCountry)) {
                      region = 'CIV';
                    } else {
                      region = 'FR';
                    }
                  }
                }
                try { localStorage.setItem('activeRegion', region); } catch {}
                setRegion(region);
                navigate(region === 'CIV' ? '/dashboard/superviseur/civ' : '/dashboard/superviseur/fr');
              } catch {
                // Fallback superviseur France
                try { localStorage.setItem('activeRegion', 'FR'); } catch {}
                setRegion('FR');
                navigate('/dashboard/superviseur/fr');
              }
            } else {
              // Repli sur la sélection mission/région lorsqu'aucun mapping n'existe
              if (isSupervisorAllowed && supervisorTargetPath) {
                try { sessionStorage.setItem('supervisorTarget', supervisorTargetPath); } catch {}
                navigate(supervisorTargetPath);
                try { sessionStorage.removeItem('supervisorTarget'); } catch {}
              } else if (mission === 'ORANGE_LEADS') {
                navigate('/leads/dashboard');
              } else {
                navigate(selectedRegion === 'CIV' ? '/dashboard/civ' : '/dashboard/fr');
              }
            }
          } else if (spaces.length === 1) {
            const sole = spaces[0];
            const requestedSupSpace = pickSupervisorSpace(supervisorChoice);
            const supervisorOk = (supervisorFromAzure) || (isSupervisorAllowed && !!requestedSupSpace && sole === requestedSupSpace);
            navigateToSpace(sole, supervisorOk);
          } else {
            const preferred = (last && spaces.includes(last)) ? last : (defaultSpace && spaces.includes(defaultSpace) ? defaultSpace : null);
            if (preferred) {
              const requestedSupSpace = pickSupervisorSpace(supervisorChoice);
              const supervisorOk = (supervisorFromAzure) || (isSupervisorAllowed && !!requestedSupSpace && preferred === requestedSupSpace);
              navigateToSpace(preferred, supervisorOk);
            } else {
              setSpaceChoices(spaces);
              setSpaceEmail(currentEmail);
              setSpaceModalOpen(true);
            }
          }
        } catch {
          // En cas d'échec, revenir au choix mission/région
          if (mission === 'ORANGE_LEADS') {
            navigate('/leads/dashboard');
          } else {
            navigate(selectedRegion === 'CIV' ? '/dashboard/civ' : '/dashboard/fr');
          }
        }
      } else {
        setError(message || "Identifiants invalides");
      }
    } catch (err) {
      setError("Une erreur est survenue. Veuillez réessayer plus tard.");
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setError("");
    setLoading(true);

    try {
      // Passer l'email saisi comme login_hint et pour tentative de pré-liaison
      const success = await loginWithMicrosoft(normalizedEmail);
      if (success) {
        // Raccourci explicite : si l'utilisateur est dans la whitelist superviseur
        // ET que la mission sélectionnée est ORANGE_LEADS, on le route directement
        // vers le dashboard superviseur LEADS, sans dépendre des groupes Azure.
        try {
          const supLeadsShortcut = isSupervisorAllowed && mission === 'ORANGE_LEADS';
          if (supLeadsShortcut) {
            try { localStorage.setItem('lastSpace', 'LEADS'); } catch {}
            try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
            try { sessionStorage.setItem('forceSupervisorLeads', '1'); } catch {}
            navigate('/dashboard/superviseur/leads/dashboard2');
            return;
          }
        } catch {}
        // Si une session impose LEADS, appliquer immédiatement et sortir (flux SSO)
        try {
          if (sessionStorage.getItem('forceSupervisorLeads') === '1') {
            try { localStorage.setItem('lastSpace', 'LEADS'); } catch {}
            try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
            navigate('/dashboard/superviseur/leads/dashboard2');
            return;
          }
        } catch {}
        // Rafraîchissement conditionnel du token Microsoft: uniquement si le claim "groups" manque
        try {
          const alreadyRefreshed = sessionStorage.getItem('ms_token_refreshed') === '1';
          const idToken0 = sessionStorage.getItem('ms_id_token') || undefined;
          const hasGroups = (() => {
            if (idToken0 && idToken0.split('.').length === 3) {
              try {
                const payload = JSON.parse(atob(idToken0.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
                return Array.isArray(payload?.groups) && (payload.groups as any[]).length > 0;
              } catch { return false; }
            }
            return false;
          })();
          if (!hasGroups && !alreadyRefreshed) {
            await (await import('../services/msGraphToken')).getFreshMicrosoftAccessToken({
              scopes: ['openid','profile','email','User.Read','Group.Read.All','Directory.Read.All'],
            });
            try { sessionStorage.setItem('ms_token_refreshed', '1'); } catch {}
          }
        } catch {}
        // Nouveau flux: détermine l'espace autorisé via Firestore userSpaces
        const emailAfter = (auth.currentUser?.email || normalizedEmail || '').toLowerCase();
        // 1) Prefer role-based spaces from user claims to be fully automatic
        const roleSpaces = getSpacesFromRole(user?.role);
        // Détection automatique du statut superviseur via groupes Azure (ID token ou Graph)
        let supervisorFromAzure = false;
        try {
          let groups: (string | { id?: string; displayName?: string })[] = [];
          const idToken = sessionStorage.getItem('ms_id_token') || undefined;
          if (idToken && idToken.split('.').length === 3) {
            const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
            if (Array.isArray(payload?.groups)) {
              const raw = payload.groups as string[];
              const guid = /^[0-9a-fA-F-]{36}$/;
              groups = raw.map(v => guid.test(String(v)) ? { id: String(v) } : { displayName: String(v) });
            }
          }
          if (!groups.length) {
            const token = await (await import('../services/msGraphToken')).getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All','Directory.Read.All'] });
            if (token) {
              const res = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', { headers: { Authorization: `Bearer ${token}` } });
              if (res.ok) {
                const j = await res.json().catch(() => ({}));
                const items: any[] = Array.isArray(j?.value) ? j.value : [];
                groups = items.map(it => ({ id: it?.id, displayName: it?.displayName }));
              }
            }
          }
          const r = roleFromAzureGroups(groups);
          supervisorFromAzure = !!r && String(r).toUpperCase().includes('SUPERVISEUR');
          try {
            const moId = (import.meta as any)?.env?.VITE_AZURE_GROUP_MO_SUP_CANAL_ID as string | undefined;
            const ids = groups.map(g => typeof g === 'string' ? String(g).toLowerCase() : String((g as any)?.id || '').toLowerCase());
            if (moId && ids.includes(String(moId).toLowerCase())) supervisorFromAzure = true;
            if (ids.includes('c38dce07-743e-40c6-aab9-f46dc0ea9adb')) supervisorFromAzure = true;
          } catch {}
        } catch {}
        const { spaces: fsSpaces, defaultSpace } = await fetchUserSpaces(emailAfter);
        // Si le groupe LEADS est présent, router immédiatement vers LEADS (superviseur)
        try {
          const groupsLocal: any[] = [];
          const idToken = sessionStorage.getItem('ms_id_token') || undefined;
          if (idToken && idToken.split('.').length === 3) {
            const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
            if (Array.isArray(payload?.groups)) {
              const raw = payload.groups as string[];
              const guid = /^[0-9a-fA-F-]{36}$/;
              for (const v of raw) groupsLocal.push(guid.test(String(v)) ? { id: String(v) } : { displayName: String(v) });
            }
          }
          const idsLower = groupsLocal.map((g: any) => String(g?.id || '').toLowerCase());
          const namesUpper = groupsLocal.map((g: any) => String(g?.displayName || '').toUpperCase());
          // Redirection immédiate pour Agent LEADS (GUID strict) vers l'espace agent LEADS
          const hasAgentLeadsStrictGuid = idsLower.includes('2fc9a8c8-f140-49fc-9ca8-8501b1b954d6');
          if (hasAgentLeadsStrictGuid) {
            try { localStorage.setItem('lastSpace', 'LEADS'); } catch {}
            try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
            navigate('/leads/dashboard');
            return;
          }
          // Redirection immédiate pour Agent CANAL (GUID strict) vers l'espace agent FR
          const hasAgentCanalStrictGuid = idsLower.includes('6a2b7859-58d6-430f-a23a-e856956b333d');
          if (hasAgentCanalStrictGuid) {
            try { localStorage.setItem('lastSpace', 'CANAL_FR'); } catch {}
            try { localStorage.setItem('activeMission', 'CANAL_PLUS'); } catch {}
            try { localStorage.setItem('activeRegion', 'FR'); } catch {}
            try { setRegion('FR'); } catch {}
            navigate('/dashboard/fr');
            return;
          }
          // Redirection superviseur LEADS si groupe superviseur détecté
          const hasLeadsGroup = idsLower.includes('54ef3c7c-1ec1-4c1c-aece-7db95d00737d') || namesUpper.some((n: string) => n.includes('SUP') && n.includes('LEADS'));
          if (hasLeadsGroup) {
            try { localStorage.setItem('lastSpace', 'LEADS'); } catch {}
            try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
            try { sessionStorage.setItem('forceSupervisorLeads', '1'); } catch {}
            navigate('/dashboard/superviseur/leads/dashboard2');
            return;
          }
          // Fallback interactif Graph (flux Microsoft): une seule tentative pour détecter LEADS si le token ID ne contient pas les groupes
          try {
            const alreadyInteractive = sessionStorage.getItem('ms_graph_groups_interactive_login') === '1';
            if (!alreadyInteractive) {
              const tokenI = await (await import('../services/msGraphToken')).getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All','Directory.Read.All'], interactive: true });
              if (tokenI) {
                const resI = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', { headers: { Authorization: `Bearer ${tokenI}` } });
                if (resI.ok) {
                  const jI = await resI.json().catch(() => ({}));
                  const itemsI: any[] = Array.isArray(jI?.value) ? jI.value : [];
                  const idsI = itemsI.map(it => String(it?.id || '').toLowerCase());
                  const namesI = itemsI.map(it => String(it?.displayName || '').toUpperCase());
                  const hasLeadsI = idsI.includes('54ef3c7c-1ec1-4c1c-aece-7db95d00737d') || namesI.some((n: string) => n.includes('SUP') && n.includes('LEADS'));
                  if (hasLeadsI) {
                    try { localStorage.setItem('lastSpace', 'LEADS'); } catch {}
                    try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
                    try { sessionStorage.setItem('forceSupervisorLeads', '1'); } catch {}
                    navigate('/dashboard/superviseur/leads/dashboard2');
                    return;
                  }
                }
              }
              try { sessionStorage.setItem('ms_graph_groups_interactive_login', '1'); } catch {}
            }
          } catch {}
        } catch {}
        // Préférence forte: espaces dérivés des groupes Azure (LEADS prioritaire), puis rôle, puis Firestore
        const spacesFromGroups = (() => {
          try {
            let groups: (string | { id?: string; displayName?: string })[] = [];
            const idToken = sessionStorage.getItem('ms_id_token') || undefined;
            if (idToken && idToken.split('.').length === 3) {
              const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
              if (Array.isArray(payload?.groups)) {
                const raw = payload.groups as string[];
                const guid = /^[0-9a-fA-F-]{36}$/;
                groups = raw.map(v => guid.test(String(v)) ? { id: String(v) } : { displayName: String(v) });
              }
            }
            return spacesFromAzureGroups(groups);
          } catch { return []; }
        })();
        const spaces = spacesFromGroups.length ? spacesFromGroups : (roleSpaces.length ? roleSpaces : fsSpaces);

        const last = ((): AppSpace | null => {
          const v = localStorage.getItem('lastSpace');
          return v === 'CANAL_FR' || v === 'CANAL_CIV' || v === 'LEADS' ? (v as AppSpace) : null;
        })();

        const pickSupervisorSpace = (choice: SupervisorChoice | null): AppSpace | null => {
          if (!choice) return null;
          if (choice === 'fr') return 'CANAL_FR';
          if (choice === 'civ') return 'CANAL_CIV';
          if (choice === 'leads') return 'LEADS';
          return null;
        };

        const navigateToSpace = (space: AppSpace, supervisor?: boolean) => {
          try { localStorage.setItem('lastSpace', space); } catch {}
          // Rétro-compat: positionner mission/region pour les composants existants
          if (space === 'LEADS') {
            try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
          } else {
            try { localStorage.setItem('activeMission', 'CANAL_PLUS'); } catch {}
          }
          if (space === 'CANAL_FR') {
            try { localStorage.setItem('activeRegion', 'FR'); } catch {}
            setRegion('FR');
          } else if (space === 'CANAL_CIV') {
            try { localStorage.setItem('activeRegion', 'CIV'); } catch {}
            setRegion('CIV');
          }
          const path = spaceToRoute(space, supervisorFromAzure || supervisor);
          navigate(path);
        };

        if (spaces.length === 0) {
          // Aucun mapping trouvé: si superviseur détecté via Azure, router direct vers dashboard superviseur FR/CIV
          if (supervisorFromAzure) {
            try {
              const token = await (await import('../services/msGraphToken')).getFreshMicrosoftAccessToken({ scopes: ['User.Read'] });
              let region: 'FR' | 'CIV' = 'FR';
              if (token) {
                const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=country,usageLocation', { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                  const j = await res.json().catch(() => ({}));
                  const usage = String(j?.usageLocation || '').trim().toUpperCase();
                  const rawCountry = String(j?.country || '').trim().toUpperCase();
                  if (['CI','CIV','CÔTE D’IVOIRE',"COTE D'IVOIRE"].includes(usage) || ['CI','CIV','CÔTE D’IVOIRE',"COTE D'IVOIRE"].includes(rawCountry)) {
                    region = 'CIV';
                  } else {
                    region = 'FR';
                  }
                }
              }
              try { localStorage.setItem('activeRegion', region); } catch {}
              setRegion(region);
              navigate(region === 'CIV' ? '/dashboard/superviseur/civ' : '/dashboard/superviseur');
            } catch {
              try { localStorage.setItem('activeRegion', 'FR'); } catch {}
              setRegion('FR');
              navigate('/dashboard/superviseur');
            }
          } else {
            // Fallback logique actuelle pour ne pas bloquer
            if (isSupervisorAllowed && supervisorTargetPath) {
              try { sessionStorage.setItem('supervisorTarget', supervisorTargetPath); } catch {}
              navigate(supervisorTargetPath);
              try { sessionStorage.removeItem('supervisorTarget'); } catch {}
            } else if (mission === 'ORANGE_LEADS') {
              navigate('/leads/dashboard');
            } else {
              navigate(selectedRegion === 'CIV' ? '/dashboard/civ' : '/dashboard/fr');
            }
          }
        } else if (spaces.length === 1) {
          const sole = spaces[0];
          const requestedSupSpace = pickSupervisorSpace(supervisorChoice);
          const supervisorOk = (supervisorFromAzure) || (isSupervisorAllowed && !!requestedSupSpace && sole === requestedSupSpace);
          navigateToSpace(sole, supervisorOk);
        } else {
          // Multi-espaces: tenter default/last sinon ouvrir modal
          const preferred = (last && spaces.includes(last))
            ? last
            : (defaultSpace && spaces.includes(defaultSpace) ? defaultSpace : null);
          if (preferred) {
            const requestedSupSpace = pickSupervisorSpace(supervisorChoice);
            const supervisorOk = (supervisorFromAzure) || (isSupervisorAllowed && !!requestedSupSpace && preferred === requestedSupSpace);
            navigateToSpace(preferred, supervisorOk);
          } else {
            setSpaceChoices(spaces);
            setSpaceEmail(emailAfter);
            setSpaceModalOpen(true);
          }
        }
      } else {
        // Lire le dernier code d'erreur conservé par AuthContext pour afficher un message précis
        let detail: { code?: string; message?: string } | null = null;
        try {
          const raw = localStorage.getItem('lastMicrosoftError');
          if (raw) detail = JSON.parse(raw);
        } catch {}
        setMsAuthDetail(detail);
        const code = (detail?.code || '').toLowerCase();
        if (code === 'auth/unauthorized-domain' || code === 'auth/invalid-auth-domain') {
          setError("Domaine non autorisé pour l'authentification. Utilisez le bouton ci‑dessous pour basculer vers le domaine officiel.");
        } else if (code === 'auth/network-request-failed') {
          setError("Échec réseau pendant la connexion Microsoft. Vérifiez la connexion ou un éventuel proxy/VPN.");
        } else if (code === 'auth/popup-closed-by-user') {
          setError("Fenêtre Microsoft fermée avant la validation.");
        } else {
          setError("Échec de la connexion avec Microsoft. Veuillez réessayer.");
        }
      }
    } catch (err) {
      setError("Une erreur est survenue. Veuillez réessayer plus tard.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <SpacePickerModal
        open={spaceModalOpen}
        email={spaceEmail}
        spaces={spaceChoices}
        onClose={() => setSpaceModalOpen(false)}
        onSelect={(space) => {
          const requestedSupSpace = supervisorChoice === 'fr' ? 'CANAL_FR' : supervisorChoice === 'civ' ? 'CANAL_CIV' : supervisorChoice === 'leads' ? 'LEADS' : null;
          const supervisorOk = isSupervisorAllowed && !!requestedSupSpace && requestedSupSpace === space;
          try { localStorage.setItem('lastSpace', space); } catch {}
          if (space === 'LEADS') {
            try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
          } else {
            try { localStorage.setItem('activeMission', 'CANAL_PLUS'); } catch {}
          }
          if (space === 'CANAL_FR') {
            try { localStorage.setItem('activeRegion', 'FR'); } catch {}
            setRegion('FR');
          } else if (space === 'CANAL_CIV') {
            try { localStorage.setItem('activeRegion', 'CIV'); } catch {}
            setRegion('CIV');
          }
          setSpaceModalOpen(false);
          navigate(spaceToRoute(space, supervisorOk));
        }}
      />
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-320px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-cactus-500/25 blur-3xl" />
        <div className="absolute bottom-[-240px] right-[-200px] h-[680px] w-[680px] rounded-full bg-gradient-to-br from-cactus-400/30 via-transparent to-transparent blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_62%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(8,145,178,0.12),rgba(15,23,42,0.85))]" />
        <div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-soft-light [background-image:linear-gradient(180deg,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)];[background-size:60px_60px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-16 px-5 py-16 sm:px-8 lg:flex-row lg:items-center lg:gap-20">
  <section className="mx-auto flex w-full max-w-2xl flex-col items-center text-center lg:mx-auto lg:w-[48%] lg:items-center lg:text-center">
          <div className="relative flex items-center justify-center mb-8">
            <div className="relative z-10 flex flex-col items-center">
              <img
                src="/cactus-tech-logo.svg"
                alt="Logo Cactus Tech"
                className="h-24 w-auto lg:h-28 drop-shadow-[0_18px_48px_rgba(6,182,212,0.35)]"
              />
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-1 text-[11px] uppercase tracking-[0.35em] text-cyan-200 backdrop-blur animate-badge-pulse shadow-[0_0_16px_2px_rgba(34,211,238,0.15)] transition-all duration-300 hover:scale-105 hover:shadow-cyan-400/40 hover:bg-cyan-400/20 cursor-pointer">
            <span className="transition-colors duration-300 group-hover:text-cyan-100">Mars Marketing SaaS</span>
          </div>
          <div className="mt-14 h-1 w-3/4 self-center mx-auto bg-gradient-to-r from-transparent via-cyan-400/60 via-30% via-green-400/60 via-70% to-transparent sm:w-2/3 lg:w-1/2 rounded-full relative overflow-hidden animate-shimmer shadow-[0_0_24px_2px_rgba(34,211,238,0.10)]">
            <span className="absolute left-0 top-0 h-full w-full bg-gradient-to-r from-transparent via-cyan-200/80 via-30% via-green-200/80 via-70% to-transparent opacity-70 blur-[3px] animate-shimmer-move" />
          </div>

        </section>

        <section className="relative mx-auto w-full max-w-lg">
          <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-white/10 via-white/0 to-transparent blur-2xl" />
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-[0_35px_60px_-25px_rgba(8,15,33,0.9)] backdrop-blur-xl glassmorphism-card">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-24 right-12 h-56 w-56 rounded-full bg-cactus-400/25 blur-3xl" />
              <div className="absolute -bottom-24 left-10 h-52 w-52 rounded-full bg-emerald-500/15 blur-3xl" />
            </div>
            <div className="relative p-8 sm:p-10">
              <div className="mb-8 space-y-2 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-cactus-400/40 bg-cactus-500/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-cactus-100/90">
                  Espace agents
                </div>
                <p className="text-sm text-slate-400">
                  Identifie-toi pour accéder à ton environnement personnalisé.
                </p>
              </div>

              {/* SSO migration notice */}
              <div className="relative mb-6 overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-emerald-500/10 to-transparent p-4">
                <div className="pointer-events-none absolute inset-0 opacity-60">
                  <div className="absolute -top-24 right-10 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
                  <div className="absolute -bottom-28 left-6 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl" />
                </div>
                <div className="relative flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 rounded-lg border border-white/15 bg-white/10 p-2 text-cyan-200 shadow-[0_0_22px_rgba(34,211,238,0.25)]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-200/80">Important</p>
                    <h3 className="mt-1 text-sm font-semibold text-white">Migration SSO Microsoft (@orange.mars-marketing.fr)</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-blue-100/85">
                      Une fois connecté, merci de <span className="font-semibold text-cyan-200">lier et migrer votre compte</span> vers votre adresse
                      <span className="mx-1 rounded-md border border-cyan-300/40 bg-cyan-500/10 px-1.5 py-0.5 text-[12px] text-cyan-100">@orange.mars-marketing.fr</span>.
                      L’authentification par email + mot de passe sera bientôt retirée.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-blue-100/80">
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">1. Connexion</span>
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">2. Lier Microsoft</span>
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">3. Migrer vers @orange</span>
                    </div>
                  </div>
                </div>
                <span className="pointer-events-none absolute inset-x-6 bottom-0 h-[1px] animate-[shimmer_2.6s_ease_infinite] bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
              </div>

              {/* Alerte domaine non autorisé + bouton bascule */}
              {!isOnAllowedDomain && (
                <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-amber-100">
                  <p className="text-sm font-medium">Ce domaine n’est pas autorisé pour le SSO Microsoft.</p>
                  <p className="mt-1 text-[13px]">Cliquez ci‑dessous pour ouvrir la page de connexion sur le domaine officiel puis reprendre l’authentification.</p>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const hint = encodeURIComponent(normalizedEmail);
                        window.location.href = `https://cactus-labs.fr/login?sso=1&hint=${hint}`;
                      }}
                      className="rounded-lg border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-sm font-semibold hover:border-amber-300/80 hover:bg-amber-500/20"
                    >
                      Basculer vers cactus-labs.fr
                    </button>
                  </div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="space-y-2">
                    <div
                      className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 shadow-sm shadow-red-900/20"
                      role="alert"
                    >
                      <span className="block sm:inline">{error}</span>
                    </div>
                    {msAuthDetail?.code && (
                      <div className="rounded-lg border border-white/10 bg-slate-900/70 px-4 py-3 text-[11px] text-slate-200">
                        <p className="font-medium">Détails techniques:</p>
                        <p className="mt-1">{msAuthDetail.code}</p>
                        {msAuthDetail.message && <p className="mt-1 opacity-80 truncate">{msAuthDetail.message}</p>}
                      </div>
                    )}
                    {error.toLowerCase().includes('réseau') && (
                      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[11px] leading-relaxed text-amber-100">
                        <p className="mb-1 font-medium">Dépannage réseau rapide :</p>
                        <ul className="ml-4 list-disc space-y-0.5 text-left">
                          <li>Vérifie si tu es connecté (Wi‑Fi / 4G)</li>
                          <li>Désactive provisoirement VPN / Proxy / Adblock</li>
                          <li>Essaye en navigation privée ou autre navigateur</li>
                          <li>Teste: <button type="button" onClick={testConnectivity} className="underline decoration-dotted text-amber-200 hover:text-amber-100 disabled:opacity-60" disabled={testing}>{testing ? 'Test...' : 'Ping internet'}</button></li>
                        </ul>
                        {networkOk === true && <p className="mt-2 text-emerald-300">Ping OK : la connexion générale fonctionne.</p>}
                        {networkOk === false && <p className="mt-2 text-red-200">Échec du ping : problème de connexion ou blocage sortant.</p>}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-400">
                  {networkOk !== null && (
                    <span className={networkOk ? 'text-emerald-300' : 'text-red-300'}>
                      Test: {networkOk ? 'OK' : 'Échec'}
                    </span>
                  )}
                </div>

                <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-[inset_0_1px_0_0_rgba(148,163,184,0.05)]">
                  <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-slate-400">Mission</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => handleMissionSelect('CANAL_PLUS')}
                        aria-pressed={mission === 'CANAL_PLUS'}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cactus-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                          mission === 'CANAL_PLUS'
                            ? 'bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 text-white border-cactus-400/60 shadow-lg shadow-cactus-900/30'
                            : 'bg-slate-950/40 text-slate-200 border-white/10 hover:border-cactus-400/40 hover:bg-slate-900/60'
                        }`}
                      >
                        <span className="block text-base font-semibold tracking-wide">CANAL+</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMissionSelect('ORANGE_LEADS')}
                        aria-pressed={mission === 'ORANGE_LEADS'}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                          mission === 'ORANGE_LEADS'
                            ? 'bg-gradient-to-r from-orange-500 to-orange-400 text-white border-orange-400/70 shadow-lg shadow-orange-500/40'
                            : 'bg-slate-950/40 text-slate-200 border-orange-300/30 hover:border-orange-300/60 hover:bg-orange-500/10'
                        }`}
                      >
                        <span className="block text-base font-semibold tracking-wide">ORANGE LEADS</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.3em] text-slate-400">Région</p>
                    <div className="flex items-center gap-6 text-xs text-slate-200">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="region"
                          value="FR"
                          checked={selectedRegion === 'FR'}
                          onChange={() => setSelectedRegion('FR')}
                          className="accent-cactus-500"
                        />
                        <span>France (FR)</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="region"
                          value="CIV"
                          checked={selectedRegion === 'CIV'}
                          onChange={() => setSelectedRegion('CIV')}
                          className="accent-cactus-500"
                        />
                        <span>Côte d'Ivoire (CIV)</span>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-100">Espace superviseur</p>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-blue-200">Accès temporaire</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {([
                        { key: 'fr', label: 'CANAL+ FR' },
                        { key: 'civ', label: 'CANAL+ CIV' },
                        { key: 'leads', label: 'LEADS' },
                      ] as Array<{key: Exclude<SupervisorChoice, null>, label: string}>).map(btn => {
                        const active = supervisorChoice === btn.key;
                        const disabled = !isSupervisorAllowed;
                        return (
                          <button
                            key={btn.key}
                            type="button"
                            disabled={disabled}
                            onClick={() => setSupervisorChoice(btn.key)}
                            title={disabled ? 'Réservé — saisir un email autorisé' : 'Choisir ce tableau superviseur'}
                            className={`w-full rounded-lg border px-3 py-2 text-center text-sm font-semibold transition ${
                              active
                                ? 'border-blue-200/70 bg-blue-400/30 text-white shadow-lg shadow-blue-900/30'
                                : 'border-blue-200/50 bg-blue-500/10 text-blue-100 hover:border-blue-200/80 hover:bg-blue-400/20'
                            } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            {btn.label}
                          </button>
                        );
                      })}
                    </div>
                    {/* Rien à afficher si !isSupervisorAllowed, bloc supprimé */}
                    {isSupervisorAllowed && supervisorChoice && (
                      <p className="mt-2 text-[11px] text-blue-100/80">Cible choisie: {supervisorChoice.toUpperCase()}</p>
                    )}
                  </div>

                  {/* Diagnostic avancé retiré */}
                </div>

                <div className="space-y-6 rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-[inset_0_1px_0_0_rgba(148,163,184,0.05)]">
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1 block text-sm font-medium text-slate-200"
                    >
                      Email ou nom d'utilisateur
                    </label>
                    <input
                      id="email"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field border-white/10 bg-slate-900/70 text-slate-100 placeholder-slate-500 focus:border-cactus-400 focus:ring-cactus-400/70"
                      placeholder="ex : a.hubert@mars-marketing.fr ou a.hubert"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="password"
                        className="block text-sm font-medium text-slate-200"
                      >
                        Mot de passe
                      </label>
                      <Link
                        to="/forgot-password"
                        className="text-sm text-cactus-200 hover:text-cactus-100"
                      >
                        Mot de passe oublié ?
                      </Link>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field border-white/10 bg-slate-900/70 pr-12 text-slate-100 placeholder-slate-500 focus:border-cactus-400 focus:ring-cactus-400/70"
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                      >
                        {showPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* SSO Microsoft */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleMicrosoftLogin}
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300/40 bg-blue-500/10 px-4 py-3 text-sm font-semibold text-blue-100 transition hover:border-blue-300/70 hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    <ShieldCheck className="h-5 w-5" />
                    <span>Se connecter avec Microsoft</span>
                  </button>
                  <div className="relative py-2 text-center text-xs text-slate-400">
                    <span className="relative bg-slate-900/70 px-3">ou</span>
                    <span className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/10" />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full overflow-hidden rounded-xl py-3 font-semibold shadow-lg shadow-cactus-900/40 transition hover:shadow-cactus-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cactus-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    {loading ? "Connexion..." : "Se connecter"}
                  </button>
                </div>

                {/* Bouton "Créer un compte" rétabli */}
                <div className="mt-4 text-center">
                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cactus-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    Créer un compte
                  </Link>
                </div>
              </form>

              <div className="mt-10 flex justify-center pb-2">
                <button
                  type="button"
                  onClick={() => navigate("/admin/login")}
                  className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-black/70 px-7 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-white shadow-[0_24px_60px_rgba(0,0,0,0.55)] transition-all duration-300 hover:scale-105 hover:border-white/30 hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-y-full bg-gradient-to-br from-white/40 via-white/10 to-transparent opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100" />
                  <span>ADMIN</span>
                  <span className="h-px w-8 bg-white/40" aria-hidden="true" />
                  <span className="text-[10px] tracking-[0.2em] text-white/60 normal-case">Accès sécurisé</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
