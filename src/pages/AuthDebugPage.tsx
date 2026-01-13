import React from "react";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { getIdTokenResult } from "firebase/auth";
import { getFreshMicrosoftAccessToken } from "../services/msGraphToken";

const redact = (s?: string | null, head = 6, tail = 4) => {
  if (!s) return "";
  if (s.length <= head + tail) return s;
  return s.slice(0, head) + "…" + s.slice(-tail);
};

const AuthDebugPage: React.FC = () => {
  const [info, setInfo] = React.useState<any | null>(null);
  const [claims, setClaims] = React.useState<any | null>(null);
  const [providerData, setProviderData] = React.useState<any[]>([]);
  const [tokens, setTokens] = React.useState<{ accessToken?: string; idToken?: string } | null>(null);
  const [msClaims, setMsClaims] = React.useState<any | null>(null);
  const [msIdClaims, setMsIdClaims] = React.useState<any | null>(null);
  const [graphLoading, setGraphLoading] = React.useState(false);
  const [graphMe, setGraphMe] = React.useState<any | null>(null);
  const [graphError, setGraphError] = React.useState<string | null>(null);
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [usersData, setUsersData] = React.useState<any | null>(null);
  const [usersError, setUsersError] = React.useState<string | null>(null);
  const [groupsLoading, setGroupsLoading] = React.useState(false);
  const [groupsData, setGroupsData] = React.useState<any[] | null>(null);
  const [groupsError, setGroupsError] = React.useState<string | null>(null);
  const [resolveLoading, setResolveLoading] = React.useState(false);
  const [resolveError, setResolveError] = React.useState<string | null>(null);

  const computedDisplayName = React.useMemo(() => {
    const nameFromClaims = typeof claims?.name === 'string' ? claims.name : undefined;
    const graphName = typeof graphMe?.displayName === 'string' && graphMe.displayName.trim() ? graphMe.displayName : undefined;
    const graphGiven = typeof graphMe?.givenName === 'string' ? graphMe.givenName : '';
    const graphSurname = typeof graphMe?.surname === 'string' ? graphMe.surname : '';
    const graphComposed = `${graphGiven} ${graphSurname}`.trim();
    const composedOk = graphComposed.length > 0 ? graphComposed : undefined;
    return info?.displayName || graphName || composedOk || nameFromClaims || null;
  }, [info?.displayName, graphMe, claims]);

  const computedCountry = React.useMemo(() => {
    try {
      const fromLocal = (typeof window !== 'undefined') ? String(localStorage.getItem('activeRegion') || '').toUpperCase() : '';
      if (fromLocal === 'FR') return 'France';
      if (fromLocal === 'CIV') return 'Côte d’ivoire';
    } catch {}
    // Préférer la valeur exacte configurée dans Azure AD
    if (typeof graphMe?.country === 'string' && graphMe.country.trim().length > 0) {
      return graphMe.country.trim(); // ex: "France" ou "Côte d’ivoire"
    }
    const usage = String(graphMe?.usageLocation || graphMe?.officeLocation || '').trim().toUpperCase();
    if (usage) {
      if (['FR','FRA','FRANCE'].includes(usage)) return 'France';
      if (['CI','CIV','CÔTE D’IVOIRE','COTE D’IVOIRE','CÔTE D\'IVOIRE','COTE D\'IVOIRE'].includes(usage)) return 'Côte d’ivoire';
      return usage;
    }
    const namesBlob = Array.isArray(groupsData)
      ? groupsData.map(g => `${String(g?.displayName || '')} ${String(g?.id || '')}`).join(' ').toUpperCase()
      : '';
    if (namesBlob.includes('CIV') || namesBlob.includes('CÔTE D’IVOIRE') || namesBlob.includes('COTE D’IVOIRE')) return 'Côte d’ivoire';
    if (namesBlob.includes('FR')) return 'France';
    return null;
  }, [graphMe, groupsData]);

  React.useEffect(() => {
    const u = auth.currentUser;
    const snapshot: any = {};
    if (u) {
      snapshot.uid = u.uid;
      snapshot.email = u.email;
      snapshot.displayName = u.displayName;
      snapshot.emailVerified = u.emailVerified;
      snapshot.photoURL = u.photoURL;
      snapshot.providerId = u.providerId;
      snapshot.providerData = u.providerData?.map(p => ({
        providerId: p?.providerId,
        uid: p?.uid,
        email: p?.email,
        displayName: p?.displayName,
        phoneNumber: p?.phoneNumber,
      })) || [];
      setProviderData(snapshot.providerData);
      // Try to enrich with Firestore user profile (companyName)
      const ref = doc(db, "users", u.uid);
      getDoc(ref).then(d => {
        const data = d.exists() ? d.data() : {} as any;
        if (typeof data?.companyName === "string" && data.companyName.trim().length > 0) {
          snapshot.companyName = data.companyName.trim();
        }
        setInfo(snapshot);
      }).catch(() => {
        setInfo(snapshot);
      });
      getIdTokenResult(u, true).then(r => setClaims(r?.claims || null)).catch(() => setClaims(null));
    } else {
      setInfo({ note: "Aucun utilisateur connecté" });
    }
    try {
      const accessToken = sessionStorage.getItem("ms_access_token") || undefined;
      const idToken = sessionStorage.getItem("ms_id_token") || undefined;
      setTokens({ accessToken, idToken });
      // Try decode MS access token to reveal scopes (scp)
      if (accessToken && accessToken.split(".").length === 3) {
        try {
          const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          setMsClaims(payload);
        } catch {
          setMsClaims(null);
        }
      } else {
        setMsClaims(null);
      }
      // Decode Microsoft ID token to inspect potential group claims
      if (idToken && idToken.split('.').length === 3) {
        try {
          const idPayload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          setMsIdClaims(idPayload);
        } catch {
          setMsIdClaims(null);
        }
      } else {
        setMsIdClaims(null);
      }
    } catch {
      setTokens(null);
      setMsClaims(null);
      setMsIdClaims(null);
    }
  }, []);

  const testGraphMe = async () => {
    setGraphLoading(true);
    setGraphError(null);
    setGraphMe(null);
    try {
      // Always try to get a fresh token to avoid expiry issues
      let token = await getFreshMicrosoftAccessToken({ scopes: ['User.Read'] }) || tokens?.accessToken || undefined;
      // Sync local state from sessionStorage when we try fresh acquisition
      try {
        const accessToken = sessionStorage.getItem('ms_access_token') || undefined;
        const idToken = sessionStorage.getItem('ms_id_token') || undefined;
        setTokens({ accessToken, idToken });
        if (accessToken && accessToken.split('.').length === 3) {
          try { setMsClaims(JSON.parse(atob(accessToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))); } catch { setMsClaims(null); }
        }
        if (idToken && idToken.split('.').length === 3) {
          try { setMsIdClaims(JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))); } catch { setMsIdClaims(null); }
        }
      } catch {}
      if (!token) {
        setGraphError('Impossible d’acquérir un jeton Microsoft. Réessaie la connexion Microsoft.');
        return;
      }
      const meUrl = 'https://graph.microsoft.com/v1.0/me?$select=displayName,givenName,surname,mail,userPrincipalName,country,usageLocation,officeLocation';
      let res = await fetch(meUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        // Si token expiré, ré-acquérir et réessayer une fois
        if (res.status === 401 && /Lifetime validation failed|InvalidAuthenticationToken/i.test(txt)) {
          const fresh = await getFreshMicrosoftAccessToken({ scopes: ['User.Read'] });
          if (fresh) {
            token = fresh;
            res = await fetch(meUrl, { headers: { Authorization: `Bearer ${fresh}` } });
            try {
              const accessToken = sessionStorage.getItem('ms_access_token') || undefined;
              const idToken = sessionStorage.getItem('ms_id_token') || undefined;
              setTokens({ accessToken, idToken });
            } catch {}
          }
        }
        if (!res.ok) {
          setGraphError(`Graph /me HTTP ${res.status}: ${txt}`);
          return;
        }
      }
      const data = await res.json();
      // Try to fetch groups to present everything together
      const fetchMemberOf = async (bearer: string) => {
        const url = 'https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName';
        return fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
      };
      let memberGroups: any[] | null = null;
      try {
        let gr = await fetchMemberOf(token!);
        if (!gr.ok) {
          const txt = await gr.text().catch(() => '');
          if (gr.status === 401 || gr.status === 403) {
            const fresh2 = await getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All', 'Directory.Read.All'] });
            if (fresh2) {
              token = fresh2;
              gr = await fetchMemberOf(fresh2);
              try {
                const accessToken = sessionStorage.getItem('ms_access_token') || undefined;
                const idToken = sessionStorage.getItem('ms_id_token') || undefined;
                setTokens({ accessToken, idToken });
              } catch {}
            }
          }
          if (!gr.ok) {
            // keep /me data but surface groups error in dedicated section
            setGroupsError(`Graph /me/memberOf HTTP ${gr.status}: ${txt}`);
          }
        }
        if (gr.ok) {
          const j = await gr.json();
          const items: any[] = Array.isArray(j?.value) ? j.value : [];
          const groups = items.filter((it) => String(it?.['@odata.type'] || '').toLowerCase().includes('group'))
                               .map((g) => ({ id: g?.id, displayName: g?.displayName }));
          memberGroups = groups;
          setGroupsData(groups);
        }
      } catch {}
      setGraphMe(memberGroups ? { ...data, memberOf: memberGroups } : data);
    } catch (e: any) {
      setGraphError(String(e?.message || e));
    } finally {
      setGraphLoading(false);
    }
  };

  const testGraphUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    setUsersData(null);
    try {
      let token = tokens?.accessToken || (await getFreshMicrosoftAccessToken({ scopes: ['User.ReadBasic.All'] }) || undefined);
      if (!token) { setUsersError('Impossible d’acquérir un jeton Microsoft.'); return; }
      let res = await fetch('https://graph.microsoft.com/v1.0/users?$top=1', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        if (res.status === 401 && /Lifetime validation failed|InvalidAuthenticationToken/i.test(txt)) {
          const fresh = await getFreshMicrosoftAccessToken({ scopes: ['User.ReadBasic.All'] });
          if (fresh) {
            token = fresh;
            res = await fetch('https://graph.microsoft.com/v1.0/users?$top=1', { headers: { Authorization: `Bearer ${fresh}` } });
          }
        }
        if (!res.ok) { setUsersError(`Graph /users HTTP ${res.status}: ${txt}`); return; }
      }
      const data = await res.json();
      setUsersData(data);
    } catch (e: any) {
      setUsersError(String(e?.message || e));
    } finally {
      setUsersLoading(false);
    }
  };

  const testGraphGroups = async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    setGroupsData(null);
    try {
      // Always try to get a fresh token with Group.Read.All and Directory.Read.All
      let token = await getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All', 'Directory.Read.All'] }) || tokens?.accessToken || undefined;
      try {
        const accessToken = sessionStorage.getItem('ms_access_token') || undefined;
        const idToken = sessionStorage.getItem('ms_id_token') || undefined;
        setTokens({ accessToken, idToken });
      } catch {}
      // Even if we have a token, ensure it has the needed scope by reauth if memberOf fails
      const fetchMemberOf = async (bearer: string) => {
        const url = 'https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName';
        return fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
      };
      if (!token) { setGroupsError('Impossible d’acquérir un jeton Microsoft avec Group.Read.All.'); return; }
      let res = await fetchMemberOf(token);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        // If unauthorized or insufficient scope, try reauth with explicit Group.Read.All once
        if ((res.status === 401 || res.status === 403)) {
          const fresh = await getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All', 'Directory.Read.All'] });
          if (fresh) {
            token = fresh;
            res = await fetchMemberOf(fresh);
            try {
              const accessToken = sessionStorage.getItem('ms_access_token') || undefined;
              const idToken = sessionStorage.getItem('ms_id_token') || undefined;
              setTokens({ accessToken, idToken });
            } catch {}
          }
        }
        if (!res.ok) { setGroupsError(`Graph /me/memberOf HTTP ${res.status}: ${txt}`); return; }
      }
      const json = await res.json();
      const items: any[] = Array.isArray(json?.value) ? json.value : [];
      // Keep only items that look like groups
      const groups = items.filter((it) => {
        const t = String(it?.['@odata.type'] || '').toLowerCase();
        return t.includes('group');
      }).map((g) => ({ id: g?.id, displayName: g?.displayName }));
      setGroupsData(groups);
    } catch (e: any) {
      setGroupsError(String(e?.message || e));
    } finally {
      setGroupsLoading(false);
    }
  };

  const resolveGroupNames = async () => {
    setResolveLoading(true);
    setResolveError(null);
    try {
      const current = Array.isArray(groupsData) ? groupsData : [];
      const missing = current.filter(g => !g?.displayName || String(g.displayName).trim().length === 0).map(g => String(g?.id || ''));
      if (missing.length === 0) {
        setResolveError('Tous les groupes ont déjà un displayName.');
        return;
      }
      // Tente avec Group.Read.All et Directory.Read.All pour maximiser les chances
      let token = await getFreshMicrosoftAccessToken({ scopes: ['Group.Read.All', 'Directory.Read.All'] }) || tokens?.accessToken || undefined;
      if (!token) { setResolveError('Impossible d’acquérir un jeton Microsoft avec Group.Read.All.'); return; }
      const fetchOne = async (id: string) => {
        const url = `https://graph.microsoft.com/v1.0/groups/${encodeURIComponent(id)}?$select=id,displayName`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`Graph /groups/${id} HTTP ${res.status}: ${txt}`);
        }
        return res.json();
      };
      const results = await Promise.allSettled(missing.map(id => fetchOne(id)));
      const nameMap: Record<string, string | undefined> = {};
      const errors: string[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const obj: any = r.value;
          const id = String(obj?.id || '');
          const dn = typeof obj?.displayName === 'string' ? obj.displayName : undefined;
          if (id) nameMap[id] = dn;
        } else {
          const msg = String((r as any).reason?.message || (r as any).reason || 'Erreur inconnue');
          errors.push(msg);
        }
      }
      if (errors.length > 0) {
        const combined = errors.join('\n');
        const needsConsent = /Authorization_RequestDenied|Insufficient privileges/i.test(combined);
        setResolveError(needsConsent
          ? combined + '\nConseil: accordez le consentement administrateur aux permissions Microsoft Graph « Group.Read.All » et/ou « Directory.Read.All » pour l’application Microsoft utilisée par Firebase (App Registration), puis reconnectez-vous.'
          : combined);
      }
      const updated = current.map(g => ({ id: g?.id, displayName: nameMap[String(g?.id || '')] ?? g?.displayName }));
      setGroupsData(updated);
    } catch (e: any) {
      setResolveError(String(e?.message || e));
    } finally {
      setResolveLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 text-black">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold text-black">Identité & Claims (Debug)</h1>

        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-black mb-2">Utilisateur</h2>
          <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto text-black">{JSON.stringify(info, null, 2)}</pre>
          {computedDisplayName && (
            <p className="mt-2 text-xs text-black"><span className="font-semibold">Nom détecté:</span> {computedDisplayName}</p>
          )}
          {computedCountry && (
            <p className="mt-1 text-xs text-black"><span className="font-semibold">Pays détecté:</span> {computedCountry}</p>
          )}
          {(graphMe?.country || graphMe?.usageLocation) && (
            <p className="mt-1 text-[11px] text-gray-800">Azure AD (Graph): country = {String(graphMe?.country || '') || '—'}, usageLocation = {String(graphMe?.usageLocation || '') || '—'}</p>
          )}
          {!computedDisplayName && (
            <p className="mt-2 text-[11px] text-gray-800">Le champ `displayName` est absent. Rafraîchis le jeton Microsoft pour récupérer les claims, ou vérifie le profil Azure AD.</p>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-black mb-2">Provider Data</h2>
          <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto text-black">{JSON.stringify(providerData, null, 2)}</pre>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-black mb-2">Token Claims (ID Token)</h2>
          <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto text-black">{JSON.stringify(claims, null, 2)}</pre>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-black mb-2">Microsoft Tokens (Session - Debug uniquement)</h2>
          <ul className="text-xs text-black">
            <li>Access Token: {redact(tokens?.accessToken)}</li>
            <li>ID Token: {redact(tokens?.idToken)}</li>
          </ul>
          <p className="text-[11px] text-black mt-2">Conseil: ces valeurs sont masquées et stockées seulement en sessionStorage.</p>
          <div className="mt-3">
            <button
              type="button"
              onClick={testGraphMe}
              disabled={graphLoading}
              className="px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
            >
              {graphLoading ? 'Test /me…' : 'Tester Microsoft Graph /me'}
            </button>
            <button
              type="button"
              onClick={testGraphUsers}
              disabled={usersLoading}
              className="ml-2 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
            >
              {usersLoading ? 'Test /users…' : 'Tester Graph /users?$top=1'}
            </button>
            <button
              type="button"
              onClick={testGraphGroups}
              disabled={groupsLoading}
              className="ml-2 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
            >
              {groupsLoading ? 'Groupes…' : 'Tester Graph /me/memberOf'}
            </button>
            <button
              type="button"
              onClick={async () => {
                // Force reauth and refresh tokens with needed scopes
                const fresh = await getFreshMicrosoftAccessToken({ scopes: ['User.Read', 'Group.Read.All'] });
                try {
                  const accessToken = sessionStorage.getItem('ms_access_token') || undefined;
                  const idToken = sessionStorage.getItem('ms_id_token') || undefined;
                  setTokens({ accessToken, idToken });
                  // Re-decode claims
                  if (accessToken && accessToken.split('.').length === 3) {
                    try { setMsClaims(JSON.parse(atob(accessToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))); } catch { setMsClaims(null); }
                  }
                  if (idToken && idToken.split('.').length === 3) {
                    try { setMsIdClaims(JSON.parse(atob(idToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))); } catch { setMsIdClaims(null); }
                  }
                } catch {}
              }}
              className="ml-2 px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
            >
              Rafraîchir jeton Microsoft
            </button>
          </div>
        </section>

        {msClaims && (
          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-black mb-2">Microsoft Access Token claims</h2>
            <div className="text-xs text-black space-y-2">
              {msClaims.scp && (
                <p><span className="font-semibold">Scopes (scp):</span> {String(msClaims.scp)}</p>
              )}
              {msClaims.aud && (
                <p><span className="font-semibold">Audience (aud):</span> {String(msClaims.aud)}</p>
              )}
              <pre className="bg-gray-50 rounded p-3 overflow-x-auto">{JSON.stringify(msClaims, null, 2)}</pre>
            </div>
          </section>
        )}

        {(graphError || graphMe) && (
          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-black mb-2">Microsoft Graph /me</h2>
            {graphError && (
              <p className="text-xs text-red-700">{graphError}</p>
            )}
            {graphMe && (
              <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">{JSON.stringify(graphMe, null, 2)}</pre>
            )}
          </section>
        )}

        {(msIdClaims?.groups || groupsError || (groupsData && groupsData.length >= 0)) && (
          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-black mb-2">Groupes (SSO)</h2>
            {Array.isArray(msIdClaims?.groups) && msIdClaims!.groups.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-black font-semibold">Depuis ID Token (claim `groups`):</p>
                <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">{JSON.stringify(msIdClaims!.groups, null, 2)}</pre>
              </div>
            )}
            {groupsError && (
              <p className="text-xs text-red-700">{groupsError}</p>
            )}
            {groupsData && (
              <div>
                <p className="text-xs text-black font-semibold">Depuis Microsoft Graph /me/memberOf:</p>
                <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">{JSON.stringify(groupsData, null, 2)}</pre>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resolveGroupNames}
                    disabled={resolveLoading}
                    className="px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
                  >
                    {resolveLoading ? 'Résolution…' : 'Résoudre noms de groupes'}
                  </button>
                  {resolveError && (
                    <span className="text-[11px] text-red-700">{resolveError}</span>
                  )}
                </div>
              </div>
            )}
            {!Array.isArray(msIdClaims?.groups) && !groupsData && !groupsError && (
              <p className="text-[11px] text-gray-800">Aucun groupe détecté. Essaie le bouton « Tester Graph /me/memberOf » (peut nécessiter le consentement administratif pour la permission <code>Group.Read.All</code>).</p>
            )}
          </section>
        )}

        {(usersError || usersData) && (
          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-black mb-2">Microsoft Graph /users?$top=1</h2>
            <p className="text-[11px] text-gray-800 mb-2">Nécessite habituellement un consentement administrateur pour <code>User.ReadBasic.All</code>.</p>
            {usersError && (
              <p className="text-xs text-red-700">{usersError}</p>
            )}
            {usersData && (
              <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">{JSON.stringify(usersData, null, 2)}</pre>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default AuthDebugPage;
