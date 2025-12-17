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
  const [graphLoading, setGraphLoading] = React.useState(false);
  const [graphMe, setGraphMe] = React.useState<any | null>(null);
  const [graphError, setGraphError] = React.useState<string | null>(null);
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [usersData, setUsersData] = React.useState<any | null>(null);
  const [usersError, setUsersError] = React.useState<string | null>(null);

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
    } catch {
      setTokens(null);
      setMsClaims(null);
    }
  }, []);

  const testGraphMe = async () => {
    setGraphLoading(true);
    setGraphError(null);
    setGraphMe(null);
    try {
      let token = tokens?.accessToken;
      if (!token) {
        // Pas de token en session: tenter d'en obtenir un frais
        token = await getFreshMicrosoftAccessToken({ scopes: ['User.Read'] }) || undefined;
      }
      if (!token) {
        setGraphError('Impossible d’acquérir un jeton Microsoft. Réessaie la connexion Microsoft.');
        return;
      }
      let res = await fetch('https://graph.microsoft.com/v1.0/me', {
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
            res = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${fresh}` } });
          }
        }
        if (!res.ok) {
          setGraphError(`Graph /me HTTP ${res.status}: ${txt}`);
          return;
        }
      }
      const data = await res.json();
      setGraphMe(data);
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

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 text-black">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold text-black">Identité & Claims (Debug)</h1>

        <section className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-black mb-2">Utilisateur</h2>
          <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto text-black">{JSON.stringify(info, null, 2)}</pre>
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
