import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { roleFromAzureGroups, spacesFromAzureGroups } from "../services/userSpaces";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const location = useLocation();
  const pathname = (location?.pathname || '').toLowerCase();
  const ALLOW_ALL_ROUTES = (
    import.meta.env.VITE_ALLOW_ALL_ROUTES === 'true' ||
    (typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search || '').get('allowAll') === '1' ||
      window.localStorage.getItem('ALLOW_ALL_ROUTES') === '1'
    ))
  );

  if (loading) {
    // Afficher un loader ou rien pendant que l'état auth est en cours de chargement
    return <div>Chargement...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Mode "autoriser tout" (tests): on court-circuite les contrôles AAD/Graph
  if (ALLOW_ALL_ROUTES) {
    return <>{children}</>;
  }

  

  // ===============================
  // CONTRÔLE D'ACCÈS PAR GROUPES AAD
  // ===============================
  // Objectif:
  //  - Quand un utilisateur appartient à un groupe Azure AD donné,
  //    il ne doit avoir accès QU'À une liste restreinte d'URL.
  //  - Toute tentative d'accès à une autre URL protégée est BLOQUÉE (403).
  //  - Les routes publiques (login, reset, etc.) ne sont PAS concernées par ce filtre.
  // 
  // Principe d’implémentation:
  //  1) On lit les groupes AAD depuis le ms_id_token (stocké en sessionStorage).
  //  2) On dérive un rôle et des "espaces" autorisés via roleFromAzureGroups/spacesFromAzureGroups.
  //  3) On calcule une liste D'URL AUTORISÉES en fonction de ces groupes/espaces.
  //  4) On BLOQUE uniquement les zones protégées suivantes si non autorisées:
  //     - "/dashboard/superviseur/*" (zones superviseur FR/CIV/LEADS)
  //     - "/dashboard/fr/*" et "/dashboard/civ/*" (zones agents CANAL)
  //     - "/leads/*" (zone LEADS agent)
  //  NOTE: on laisse passer le reste (admin, pages techniques) pour ne pas casser des flux existants.

  // 1) Récupérer les groupes depuis l'ID token Microsoft (si présent)
  const getAzureGroups = (): Array<string | { id?: string; displayName?: string }> => {
    try {
      const idToken = sessionStorage.getItem('ms_id_token') || undefined;
      if (idToken && idToken.split('.').length === 3) {
        const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (Array.isArray(payload?.groups)) {
          const raw = payload.groups as string[];
          const guid = /^[0-9a-fA-F-]{36}$/;
          return raw.map(v => guid.test(String(v)) ? { id: String(v) } : { displayName: String(v) });
        }
      }
    } catch {}
    // Fallback: tenter de récupérer les groupes via Microsoft Graph
    try {
      const alreadyFetched = sessionStorage.getItem('ms_graph_groups_guard_fetched') === '1';
      // Première tentative non interactive (ne pas ouvrir de popup si possible)
      if (!alreadyFetched) {
        return [];
      }
    } catch {}
    return [];
  };

  // Si aucun groupe trouvé via ID token, effectuer un fetch Graph (une seule fois par session)
  const groupsInit = React.useMemo(() => getAzureGroups(), []);
  const [groups, setGroups] = React.useState<Array<string | { id?: string; displayName?: string }>>(groupsInit);
  const [groupsLoading, setGroupsLoading] = React.useState(false);
  // Éviter un faux 403 au premier rendu: tant que nous n'avons pas tenté
  // d'interroger Microsoft Graph pour les groupes, on affiche un écran d'attente.
  const hasAttemptedFetch = (() => {
    try { return sessionStorage.getItem('ms_graph_groups_guard_fetched') === '1'; } catch { return true; }
  })();
  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (groups && groups.length) return;
      try {
        setGroupsLoading(true);
        const alreadyFetched = sessionStorage.getItem('ms_graph_groups_guard_fetched') === '1';
        if (alreadyFetched) return;
        const mod = await import('../services/msGraphToken');
        // Essai non interactif d'abord
        const tokenSilent = await mod.getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All','Directory.Read.All'], interactive: false });
        let fetched: Array<{ id?: string; displayName?: string }> = [];
        if (tokenSilent) {
          const res = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', { headers: { Authorization: `Bearer ${tokenSilent}` } });
          if (res.ok) {
            const j = await res.json().catch(() => ({}));
            const items: any[] = Array.isArray(j?.value) ? j.value : [];
            fetched = items.map(it => ({ id: it?.id, displayName: it?.displayName }));
          }
        }
        // Si rien, faire une tentative interactive unique
        if (!fetched.length) {
          const tokenI = await mod.getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All','Directory.Read.All'], interactive: true });
          if (tokenI) {
            const resI = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName', { headers: { Authorization: `Bearer ${tokenI}` } });
            if (resI.ok) {
              const jI = await resI.json().catch(() => ({}));
              const itemsI: any[] = Array.isArray(jI?.value) ? jI.value : [];
              fetched = itemsI.map(it => ({ id: it?.id, displayName: it?.displayName }));
            }
          }
        }
        try { sessionStorage.setItem('ms_graph_groups_guard_fetched', '1'); } catch {}
        if (!cancelled && fetched.length) setGroups(fetched);
      } catch {}
      finally { if (!cancelled) setGroupsLoading(false); }
    };
    run();
    return () => { cancelled = true; };
  }, [groups]);

  // Utiliser les groupes résolus (ID token ou Graph)
  if (!ALLOW_ALL_ROUTES && isAuthenticated && (!groups || groups.length === 0) && !hasAttemptedFetch) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b1220', color: '#e2e8f0' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Vérification des droits Azure…</h1>
          <p style={{ opacity: 0.85 }}>Initialisation de vos groupes avant d'appliquer les accès.</p>
        </div>
      </div>
    );
  }
  

  // 2) Déduire un rôle et des espaces depuis les groupes
  const role = roleFromAzureGroups(groups) || '';
  const spaces = spacesFromAzureGroups(groups);

  // 3) Calculer les URL autorisées par groupe/rôle
  //    Règles CLÉS ci-dessous (claires et en français):
  //
  //  - Groupe « [MO] Sup LEADS » (ou GUID 54ef3c7c-1ec1-4c1c-aece-7db95d00737d):
  //      Accès AUTORISÉ UNIQUEMENT à: 
  //        • /dashboard/superviseur/leads/*
  //  - Groupe « [MO] Sup Canal » (ou GUID c38dce07-743e-40c6-aab9-f46dc0ea9adb):
  //      Accès AUTORISÉ UNIQUEMENT à:
  //        • /dashboard/superviseur/fr/*
  //  - Groupe « SUPERVISEUR CANAL+ CIV » (via nom/heuristique):
  //      Accès AUTORISÉ UNIQUEMENT à:
  //        • /dashboard/superviseur/civ/*
  //  - Groupe « [MO] Agent Canal » (agents FR):
  //      Accès AUTORISÉ UNIQUEMENT à:
  //        • /dashboard/fr/*
  //        • /dashboard/fr/teamchat (si utilisé)
  //  - Groupe « [MO] Agent LEADS »:
  //      Accès AUTORISÉ UNIQUEMENT à:
  //        • /leads/*
  //
  //  - Si aucun groupe n’est détecté mais que des "espaces" sont déduits, on applique:
  //        CANAL_FR → /dashboard/fr/*
  //        CANAL_CIV → /dashboard/civ/*
  //        LEADS     → /leads/*
  //
  //  - Toute autre URL protégée ci‑dessus est INTERDITE (403) pour l’utilisateur courant.

  const idsLower = groups.map(g => typeof g === 'string' ? String(g).toLowerCase() : String((g as any)?.id || '').toLowerCase());
  const namesUpper = groups.map(g => typeof g === 'string' ? '' : String((g as any)?.displayName || '').toUpperCase());

  const hasSupLeads = idsLower.includes('54ef3c7c-1ec1-4c1c-aece-7db95d00737d') || namesUpper.some(n => n.includes('SUP') && n.includes('LEADS')) || role.includes('SUPERVISEUR LEADS');
  const hasSupCanalFR = idsLower.includes('c38dce07-743e-40c6-aab9-f46dc0ea9adb') || namesUpper.some(n => n.includes('SUP') && n.includes('CANAL') && !n.includes('CIV')) || role.includes('SUPERVISEUR CANAL+ FR');
  const hasSupCanalFRStrictGuid = idsLower.includes('c38dce07-743e-40c6-aab9-f46dc0ea9adb');
  const hasSupCanalCIV = namesUpper.some(n => n.includes('SUP') && (n.includes('CIV') || n.includes('CÔTE D’IVOIRE') || n.includes("COTE D'IVOIRE"))) || role.includes('SUPERVISEUR CANAL+ CIV');
  const isAgentCanal = namesUpper.some(n => n.includes('AGENT') && n.includes('CANAL')) || role.includes('AGENT CANAL+ FR');
  const isAgentLeads = namesUpper.some(n => n.includes('AGENT') && n.includes('LEADS')) || role.includes('AGENT LEADS');
  // Cas strict demandé: groupe GUID [MO] Agent LEADS → n'autoriser que /leads/dashboard
  const hasAgentLeadsStrictGuid = idsLower.includes('2fc9a8c8-f140-49fc-9ca8-8501b1b954d6');
  // Cas strict demandé: groupe GUID [MO] Agent Canal → n'autoriser que /dashboard/fr (exact)
  const hasAgentCanalStrictGuid = idsLower.includes('6a2b7859-58d6-430f-a23a-e856956b333d');
  // Cas strict demandé: groupe GUID [MO - CACTUS] Sup LEADS → n'autoriser que /leads/dashboard et /dashboard/superviseur/leads
  const hasSupLeadsStrictGuid = idsLower.includes('54ef3c7c-1ec1-4c1c-aece-7db95d00737d');

  // Raccourci ciblé: si l'utilisateur a des signaux "Sup LEADS" et
  // vise une sous-route LEADS superviseur (incl. /dashboard2), autoriser immédiatement.
  // Cela évite les faux 403 quand les claims Graph ne sont pas encore disponibles en local.
  const isSupLeadsLike = (
    hasSupLeadsStrictGuid ||
    hasSupLeads ||
    role.includes('SUPERVISEUR LEADS') ||
    (Array.isArray(spaces) && spaces.includes('LEADS')) ||
    // Indicateur explicite posé après login Microsoft
    (() => { try { return sessionStorage.getItem('forceSupervisorLeads') === '1'; } catch { return false; } })() ||
    // Fallback local simple via lastSpace
    (() => { try { return (localStorage.getItem('lastSpace') || '') === 'LEADS'; } catch { return false; } })()
  );
  if (isSupLeadsLike && (pathname.startsWith('/dashboard/superviseur/leads/'))) {
    return <>{children}</>;
  }

  // Construit la liste d'expressions simples "startsWith" autorisées
  const allowedStartsWith: string[] = [];
  const allowedExact: string[] = [];

  if (hasSupLeads) {
    // Superviseur LEADS → accès superviseur + accès agents LEADS
    allowedStartsWith.push('/dashboard/superviseur/leads/');
    allowedStartsWith.push('/leads/');
  }
  if (hasSupCanalFR) {
    // Superviseur CANAL FR → accès superviseur + accès agents FR
    allowedStartsWith.push('/dashboard/superviseur/fr/');
    allowedStartsWith.push('/dashboard/fr/');
    // Autoriser la racine superviseur générique
    allowedExact.push('/dashboard/superviseur');
  }
  if (hasSupCanalCIV) {
    // Superviseur CANAL CIV → accès superviseur + accès agents CIV
    allowedStartsWith.push('/dashboard/superviseur/civ/');
    allowedStartsWith.push('/dashboard/civ/');
  }
  if (isAgentCanal) {
    // Agent Canal FR → uniquement /dashboard/fr/* (inclut les sous‑pages comme teamchat)
    allowedStartsWith.push('/dashboard/fr/');
  }
  // Autorisation stricte par GUID pour Agent Canal, même si le nom n'est pas présent
  if (hasAgentCanalStrictGuid) {
    allowedExact.push('/dashboard/fr');
  }
  // Autorisation stricte par GUID pour Agent LEADS, même si le nom n'est pas présent
  if (hasAgentLeadsStrictGuid) {
    // Autoriser la page et toutes ses sous-pages (ex: /leads/dashboard/fr)
    allowedExact.push('/leads/dashboard');
    allowedStartsWith.push('/leads/dashboard/');
  } else if (isAgentLeads) {
    // Agent LEADS générique → /leads/*
    allowedStartsWith.push('/leads/');
  }

  // Fallback via "espaces" si aucun groupe clair n'a été détecté
  if (!allowedStartsWith.length && Array.isArray(spaces) && spaces.length) {
    for (const s of spaces) {
      if (s === 'CANAL_FR') allowedStartsWith.push('/dashboard/fr/');
      if (s === 'CANAL_CIV') allowedStartsWith.push('/dashboard/civ/');
      if (s === 'LEADS') {
        // Par défaut pour LEADS sans info de groupe, restreindre à /leads/dashboard (agent)
        allowedExact.push('/leads/dashboard');
      }
    }
  }

  // Fallback supplémentaire: utiliser le rôle/missions locaux si aucun groupe/espaces n'a défini de droits
  if (!allowedStartsWith.length && !allowedExact.length) {
    try {
      const roleLc = String(user?.role || '').toUpperCase();
      const mission = (typeof window !== 'undefined') ? (window.localStorage.getItem('activeMission') || '') : '';
      const lastSpace = (typeof window !== 'undefined') ? (window.localStorage.getItem('lastSpace') || '') : '';
      const region = (typeof window !== 'undefined') ? (window.localStorage.getItem('activeRegion') || '') : '';
      const isAgentLeadsLocal = roleLc.includes('AGENT LEADS') || mission === 'ORANGE_LEADS' || lastSpace === 'LEADS';
      if (isAgentLeadsLocal) {
        allowedExact.push('/leads/dashboard');
      }
      // Fallback contrôlé pour Canal FR quand les claims de groupes sont absents
      const isCanalFrLocal = (mission === 'CANAL_PLUS' && String(region).toUpperCase() === 'FR') || lastSpace === 'CANAL_FR';
      if (isCanalFrLocal) {
        allowedExact.push('/dashboard/fr');
      }
      // Fallback contrôlé Superviseur Canal FR: autoriser superviseur FR et agent FR
      const regionUpper = String(region).toUpperCase();
      const isSupCanalFrLocal = mission === 'CANAL_PLUS' && regionUpper === 'FR';
      if (isSupCanalFrLocal) {
        allowedExact.push('/dashboard/superviseur');
        allowedExact.push('/dashboard/superviseur/fr');
        allowedStartsWith.push('/dashboard/superviseur/fr/');
        allowedStartsWith.push('/dashboard/fr/');
      }
    } catch {}
  }

  // Si l'utilisateur appartient au groupe strict Agent LEADS, on verrouille
  // toute autre autorisation potentielle et on n'autorise QUE /leads/dashboard
  if (hasAgentLeadsStrictGuid) {
    // Verrouillage: uniquement /leads/dashboard et ses sous-routes
    allowedStartsWith.length = 0;
    allowedExact.length = 0;
    allowedExact.push('/leads/dashboard');
    allowedStartsWith.push('/leads/dashboard/');
  }
  if (hasAgentCanalStrictGuid) {
    // Verrouillage: uniquement /dashboard/fr (pas de sous-routes)
    allowedStartsWith.length = 0;
    allowedExact.length = 0;
    allowedExact.push('/dashboard/fr');
  }
  if (hasSupCanalFRStrictGuid) {
    // Verrouillage: /dashboard/superviseur (racine), et toutes les sous-pages FR côté superviseur et agent
    allowedStartsWith.length = 0;
    allowedExact.length = 0;
    allowedExact.push('/dashboard/superviseur');
    allowedExact.push('/dashboard/superviseur/fr');
    allowedExact.push('/dashboard/fr');
    // Autoriser sous‑pages FR
    allowedStartsWith.push('/dashboard/superviseur/fr/');
    allowedStartsWith.push('/dashboard/fr/');
  }
  if (hasSupLeadsStrictGuid) {
    // Verrouillage Sup LEADS: uniquement /leads/dashboard et /dashboard/superviseur/leads (chemins exacts)
    allowedStartsWith.length = 0;
    allowedExact.length = 0;
    // Autoriser la page agent LEADS
    allowedExact.push('/leads/dashboard');
    // Autoriser la racine superviseur LEADS et toutes ses sous-pages (dont /dashboard2)
    allowedExact.push('/dashboard/superviseur/leads');
    // Autoriser explicitement la vue dashboard2 côté superviseur LEADS
    allowedExact.push('/dashboard/superviseur/leads/dashboard2');
    allowedStartsWith.push('/dashboard/superviseur/leads/');
  }

  // 4) Appliquer le blocage uniquement sur les zones protégées ciblées
  const isTargetedProtectedArea = (
    pathname === '/leads/dashboard' ||
    pathname === '/leads' ||
    pathname === '/leads/' ||
    pathname.startsWith('/dashboard/superviseur/') ||
    pathname === '/dashboard/superviseur' ||
    pathname === '/dashboard/superviseur/' ||
    pathname.startsWith('/dashboard/fr/') ||
    pathname === '/dashboard/fr' ||
    pathname === '/dashboard/fr/' ||
    pathname.startsWith('/dashboard/civ/') ||
    pathname === '/dashboard/civ' ||
    pathname === '/dashboard/civ/' ||
    pathname.startsWith('/leads/')
  );

  if (isTargetedProtectedArea) {
    const isAllowedPrefix = allowedStartsWith.some(prefix => {
      // Autoriser le préfixe + le chemin exact sans slash final
      const exact = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      return pathname === exact || pathname.startsWith(prefix);
    });
    const isAllowedExact = allowedExact.includes(pathname);
    const isAllowed = isAllowedPrefix || isAllowedExact;
    // Dernier fallback contrôlé: si aucun groupe n'est résolu et qu'on vise
    // exactement /leads/dashboard, autoriser l'accès pour éviter un faux 403
    // en environnement où les claims Graph sont indisponibles.
    if (!isAllowed && pathname === '/leads/dashboard' && (!groups || groups.length === 0)) {
      // Autoriser uniquement si l'état local indique clairement l'espace LEADS
      try {
        const mission = (typeof window !== 'undefined') ? (window.localStorage.getItem('activeMission') || '') : '';
        const lastSpace = (typeof window !== 'undefined') ? (window.localStorage.getItem('lastSpace') || '') : '';
        const isLeadsLocal = mission === 'ORANGE_LEADS' || lastSpace === 'LEADS';
        if (isLeadsLocal) {
          return <>{children}</>;
        }
      } catch {}
      // Sinon, on bloque comme prévu
    }
    if (!isAllowed) {
      
      if (groupsLoading) {
        return (
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b1220', color: '#e2e8f0' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Vérification des droits Azure…</h1>
              <p style={{ opacity: 0.85 }}>Chargement de vos groupes pour appliquer les accès.</p>
            </div>
          </div>
        );
      }
      // Redirection douce pour le strict GUID Agent LEADS quand l'utilisateur tape /leads ou /leads/
      if (hasAgentLeadsStrictGuid && (pathname === '/leads' || pathname === '/leads/')) {
        return <Navigate to="/leads/dashboard" replace />;
      }
      // Redirections douces pour le strict GUID Sup LEADS
      if (hasSupLeadsStrictGuid) {
        // Normaliser /leads ou /leads/ vers /leads/dashboard
        if (pathname === '/leads' || pathname === '/leads/') {
          return <Navigate to="/leads/dashboard" replace />;
        }
        // Normaliser /dashboard/superviseur/leads/ (slash final) ou /dashboard/superviseur/leads/dashboard2
        if (pathname === '/dashboard/superviseur/leads/' || pathname === '/dashboard/superviseur/leads/dashboard2') {
          return <Navigate to="/dashboard/superviseur/leads" replace />;
        }
      }
      // Accès refusé → afficher une petite page 403 explicite
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0b1220', color: '#e2e8f0', padding: '2rem', textAlign: 'center'
        }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>403 — Accès refusé</h1>
            <p style={{ opacity: 0.85, maxWidth: 680, margin: '0 auto' }}>
              Vous n'êtes pas autorisé à consulter cette page. Votre accès est limité selon votre groupe Azure AD.
              Veuillez utiliser le menu ou revenir à une URL autorisée par votre rôle.
            </p>
            <div style={{ marginTop: 24 }}>
              <button
                onClick={() => {
                  try { localStorage.setItem('logoutReason', 'access_denied_403'); } catch {}
                  try { logout(); } catch {}
                  try { window.location.href = '/login'; } catch {}
                }}
                style={{
                  background: '#334155',
                  color: '#e2e8f0',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
