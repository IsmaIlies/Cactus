import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { fetchUserSpaces, getSpacesFromRole, spaceToRoute, AppSpace, roleFromAzureGroups, spacesFromAzureGroups } from "../services/userSpaces";
import { getFreshMicrosoftAccessToken } from "../services/msGraphToken";

// Redirection automatique basée sur le rôle
// Choisit l'espace et la route par défaut sans passer par des boutons
const RoleRedirect: React.FC = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return <div>Chargement...</div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  const role = (user.role || "").trim().toUpperCase();
  const countryRaw = (user.country || '').trim();
  const country = countryRaw.toUpperCase();
  const isSupervisor = role.includes("SUPERVISEUR");

  // 1) Espaces selon rôle
  let spaces: AppSpace[] = getSpacesFromRole(role);
  let defaultSpace: AppSpace | undefined;

  const email = (user.email || "").toLowerCase();

  const [target, setTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const decide = async () => {
      try {
        // Garde-fou: si une session force explicitement LEADS, router directement.
        try {
          if (sessionStorage.getItem('forceSupervisorLeads') === '1') {
            setTarget('/dashboard/superviseur/leads/dashboard2');
            return;
          }
        } catch {}

        // Raccourci de debug: autoriser ?go=leads pour forcer l'espace LEADS immédiatement
        try {
          const params = new URLSearchParams(window.location.search);
          const go = (params.get('go') || '').toLowerCase();
          if (go === 'leads') {
            try { localStorage.setItem('lastSpace', 'LEADS'); } catch {}
            try { localStorage.setItem('activeMission', 'ORANGE_LEADS'); } catch {}
            try { sessionStorage.setItem('forceSupervisorLeads', '1'); } catch {}
            setTarget('/dashboard/superviseur/leads/dashboard2');
            return;
          }
        } catch {}

        // Essayer de dériver le rôle/espaces directement depuis les groupes Azure (ID token d'abord, Graph si possible)
        let azureGroups: (string | { id?: string; displayName?: string })[] = [];
        try {
          const idToken = sessionStorage.getItem('ms_id_token') || undefined;
          if (idToken && idToken.split('.').length === 3) {
            const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
            if (Array.isArray(payload?.groups)) {
              const raw = payload.groups as string[];
              const guid = /^[0-9a-fA-F-]{36}$/;
              azureGroups = raw.map(v => guid.test(String(v)) ? { id: String(v) } : { displayName: String(v) });
            }
          }
        } catch {}
        if (!azureGroups.length) {
          // Ne tente la récupération Graph qu'une seule fois par session pour éviter des prompts répétés
          const alreadyFetched = sessionStorage.getItem('ms_graph_groups_fetched') === '1';
          if (!alreadyFetched) {
            try {
              const token = await getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All', 'Directory.Read.All'], interactive: false });
              if (token) {
                const res = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                  const j = await res.json().catch(() => ({}));
                  const items: any[] = Array.isArray(j?.value) ? j.value : [];
                  azureGroups = items.map(it => ({ id: it?.id, displayName: it?.displayName }));
                }
              }
            } catch {}
            try { sessionStorage.setItem('ms_graph_groups_fetched', '1'); } catch {}
          }
        }

        // Si toujours vide (ou si LEADS non détecté) et qu'on n'a pas encore tenté l'interactif, on force un fetch interactif one-shot
        try {
          const alreadyInteractive = sessionStorage.getItem('ms_graph_groups_interactive') === '1';
          const hasLeadsEasy = Array.isArray(azureGroups) && azureGroups.some(g => {
            const id = typeof g === 'string' ? String(g).toLowerCase() : String((g as any)?.id || '').toLowerCase();
            const name = typeof g === 'string' ? '' : String((g as any)?.displayName || '').toUpperCase();
            return id === '54ef3c7c-1ec1-4c1c-aece-7db95d00737d' || (name.includes('SUP') && name.includes('LEADS'));
          });
          if (!alreadyInteractive && (!azureGroups.length || !hasLeadsEasy)) {
            const tokenI = await getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All', 'Directory.Read.All'], interactive: true });
            if (tokenI) {
              const resI = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', { headers: { Authorization: `Bearer ${tokenI}` } });
              if (resI.ok) {
                const jI = await resI.json().catch(() => ({}));
                const itemsI: any[] = Array.isArray(jI?.value) ? jI.value : [];
                azureGroups = itemsI.map(it => ({ id: it?.id, displayName: it?.displayName }));
              }
            }
            try { sessionStorage.setItem('ms_graph_groups_interactive', '1'); } catch {}
          }
        } catch {}
        const roleOverride = roleFromAzureGroups(azureGroups) || role;
        const spacesOverride = spacesFromAzureGroups(azureGroups);
        // Détection explicite du groupe LEADS par ID/nom pour forcer la priorité LEADS
        const idsLower = azureGroups.map(g => typeof g === 'string' ? String(g).toLowerCase() : String((g as any)?.id || '').toLowerCase());
        const namesUpper = azureGroups.map(g => typeof g === 'string' ? '' : String((g as any)?.displayName || '').toUpperCase());
        const hasLeadsGroup = idsLower.includes('54ef3c7c-1ec1-4c1c-aece-7db95d00737d') || namesUpper.some(n => n.includes('SUP') && n.includes('LEADS'));
        // Détection Agent Canal (non superviseur)
        let isAgentCanal = namesUpper.some(n => n.includes('AGENT') && n.includes('CANAL') && n.includes('MO'));
        try {
          const moAgentId = (import.meta as any)?.env?.VITE_AZURE_GROUP_MO_AGENT_CANAL_ID as string | undefined;
          if (moAgentId) {
            const idLc = String(moAgentId).toLowerCase();
            if (idsLower.includes(idLc)) isAgentCanal = true;
          }
        } catch {}
        // Fallback direct par ID via variable d'env si le rôle n'a pas été dérivé
        let supervisorFromAzure = (roleOverride || '').includes('SUPERVISEUR');
        try {
          const moId = (import.meta as any)?.env?.VITE_AZURE_GROUP_MO_SUP_CANAL_ID as string | undefined;
          const ids = idsLower;
          // Si LEADS est détecté, ignorer les fallbacks Canal
          if (!hasLeadsGroup) {
            if (moId && ids.includes(String(moId).toLowerCase())) supervisorFromAzure = true;
            if (ids.includes('c38dce07-743e-40c6-aab9-f46dc0ea9adb')) supervisorFromAzure = true;
          } else {
            supervisorFromAzure = true;
          }
        } catch {}

        // Redirection externe demandée: Agent Canal (non superviseur) → cactus-labs.fr/dashboard/fr
        if (!cancelled && isAgentCanal && !supervisorFromAzure) {
          try {
            window.location.href = 'https://cactus-labs.fr/dashboard/fr';
            return;
          } catch {}
        }
        // Redirection externe demandée: Agent LEADS (non superviseur) → cactus-labs.fr/leads/dashboard
        let isAgentLeads = namesUpper.some(n => n.includes('AGENT') && n.includes('LEADS') && n.includes('MO'));
        try {
          const moAgentLeadsId = (import.meta as any)?.env?.VITE_AZURE_GROUP_MO_AGENT_LEADS_ID as string | undefined;
          if (moAgentLeadsId) {
            const idLc = String(moAgentLeadsId).toLowerCase();
            if (idsLower.includes(idLc)) isAgentLeads = true;
          }
        } catch {}
        if (!cancelled && isAgentLeads && !supervisorFromAzure) {
          try {
            window.location.href = 'https://cactus-labs.fr/leads/dashboard';
            return;
          } catch {}
        }

        // Priorité aux groupes Azure (espaces issus du rôle)
        let chosen: AppSpace | null = null;
        let spacesLocal: AppSpace[] = spaces.slice();
        if (hasLeadsGroup) {
          spacesLocal = ['LEADS'];
        } else if (spacesOverride.length) {
          spacesLocal = spacesOverride;
        }
        if (spacesLocal.length) {
          // Quand des espaces viennent du rôle (groupes), ignorer Firestore et les préférences locales
          chosen = spacesLocal[0];
        } else {
          // 2) Compléter via Firestore si nécessaire (si aucun espace trouvé via rôle)
          const fs = await fetchUserSpaces(email);
          spacesLocal = fs.spaces;
          defaultSpace = fs.defaultSpace;
          // 3) Choisir préférence: lastSpace -> defaultSpace -> premier
          const last = (() => {
            const v = localStorage.getItem("lastSpace");
            return v === "CANAL_FR" || v === "CANAL_CIV" || v === "LEADS" ? (v as AppSpace) : null;
          })();
          if (last && spacesLocal.includes(last)) chosen = last;
          else if (defaultSpace && spacesLocal.includes(defaultSpace)) chosen = defaultSpace;
          else if (spacesLocal.length) chosen = spacesLocal[0];
        }

        // 4) Fallback mission/région si aucun espace déterminé
        if (!chosen) {
          // Ignorer la mission locale: router selon le pays Azure en priorité
          const regionPref = country.includes('CIV') || country.includes('CÔTE D’IVOIRE') || country.includes("COTE D'IVOIRE") ? 'CIV' : 'FR';
          setTarget(regionPref === "CIV" ? "/dashboard/civ" : "/dashboard/fr");
          return;
        }

        try { localStorage.setItem("lastSpace", chosen); } catch {}
        // Forcer la mission CANAL_PLUS quand les groupes définissent l'espace
        try { localStorage.setItem("activeMission", chosen === "LEADS" ? "ORANGE_LEADS" : "CANAL_PLUS"); } catch {}

        // Construire la route depuis l'espace choisi
        const isSupervisorFinal = supervisorFromAzure || (roleOverride || '').includes('SUPERVISEUR');
        let path = spaceToRoute(chosen, isSupervisorFinal);
        // Pour superviseur, n'override la route que pour CANAL (FR/CIV). Laisser LEADS aller vers /dashboard/superviseur/leads/dashboard2.
        if (isSupervisorFinal && chosen !== 'LEADS') {
          const fr = country.includes('FR');
          const civ = country.includes('CIV') || country.includes('CÔTE D’IVOIRE') || country.includes("COTE D'IVOIRE");
          if (fr) path = '/dashboard/superviseur/fr';
          else if (civ) path = '/dashboard/superviseur/civ';
        }
        if (!cancelled) setTarget(path);
      } catch {
        // En cas d'erreur, aller sur FR par défaut
        if (!cancelled) setTarget("/dashboard/fr");
      }
    };
    decide();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, role, isSupervisor]);

  if (!target) return <div>Chargement...</div>;
  return <Navigate to={target} replace />;
};

export default RoleRedirect;
