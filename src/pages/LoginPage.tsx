import React, { useEffect, useState } from "react";
import { firebaseConfig } from "../firebase";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
// auth import removed (region selection is manual, no Firestore region fetch needed)
import { useRegion } from '../contexts/RegionContext';
import { Eye, EyeOff } from "lucide-react";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [networkOk, setNetworkOk] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [testing, setTesting] = useState(false);
  const [advRunning, setAdvRunning] = useState(false);
  const [advResults, setAdvResults] = useState<any | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  useEffect(() => {
    const handlerOnline = () => setIsOnline(true);
    const handlerOffline = () => setIsOnline(false);
    window.addEventListener('online', handlerOnline);
    window.addEventListener('offline', handlerOffline);
    return () => {
      window.removeEventListener('online', handlerOnline);
      window.removeEventListener('offline', handlerOffline);
    };
  }, []);

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

  interface DiagResultEntry {
    name: string;
    ok: boolean;
    status?: number;
    code?: string;
    detail?: string;
    latencyMs?: number;
  }

  const runAdvancedDiagnostics = async () => {
    setAdvRunning(true);
    setAdvResults(null);
    const results: DiagResultEntry[] = [];
    const apiKey = firebaseConfig.apiKey;
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const timedFetch = async (name: string, fn: () => Promise<Response>) => {
      const start = performance.now();
      try {
        const r = await fn();
        const latencyMs = Math.round(performance.now() - start);
        return { name, response: r, latencyMs };
      } catch (e: any) {
        const latencyMs = Math.round(performance.now() - start);
        throw { name, error: e, latencyMs };
      }
    };

    // 1. Endpoint IdentityToolkit (attendu: HTTP 400 avec erreur JSON)
    try {
      const { response, latencyMs } = await timedFetch('identity_signin', () => fetch(signInUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'diag@example.com', password: 'wrong', returnSecureToken: true })
      }));
      let code: string | undefined;
      try {
        const data = await response.json();
        code = data?.error?.message;
      } catch {}
      results.push({ name: 'API IdentityToolkit (signIn)', ok: true, status: response.status, code, latencyMs, detail: code ? `Réponse: ${code}` : 'Pas de code' });
    } catch (e: any) {
      results.push({ name: 'API IdentityToolkit (signIn)', ok: false, detail: e?.error?.message || String(e), latencyMs: e?.latencyMs });
    }

    // 2. Requête vers ton propre hosting (pour vérifier qu’il accède bien à ton domaine)
    try {
      const { response, latencyMs } = await timedFetch('self_host', () => fetch('/', { cache: 'no-store' }));
      results.push({ name: 'Accès domaine application', ok: response.ok, status: response.status, latencyMs });
    } catch (e: any) {
      results.push({ name: 'Accès domaine application', ok: false, detail: e?.error?.message || String(e) });
    }

    // 3. Vérifier si hors ligne entre temps
    results.push({ name: 'Statut navigateur', ok: navigator.onLine, detail: navigator.onLine ? 'en ligne' : 'hors ligne' });

    setAdvResults({ timestamp: new Date().toISOString(), results });
    setAdvRunning(false);
  };
  const { login, loginWithMicrosoft } = useAuth();
  const { setRegion } = useRegion();
  const [selectedRegion, setSelectedRegion] = useState<'FR' | 'CIV'>(() => (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || 'FR');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
  const { success, message } = await login(email, password);
      if (success) {
        localStorage.setItem('activeRegion', selectedRegion);
        setRegion(selectedRegion);
        navigate(selectedRegion === 'CIV' ? '/dashboard/civ' : '/dashboard/fr');
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
      const success = await loginWithMicrosoft();
      if (success) {
        localStorage.setItem('activeRegion', selectedRegion);
        setRegion(selectedRegion);
        navigate(selectedRegion === 'CIV' ? '/dashboard/civ' : '/dashboard/fr');
      } else {
        setError("Échec de la connexion avec Microsoft. Veuillez réessayer.");
      }
    } catch (err) {
      setError("Une erreur est survenue. Veuillez réessayer plus tard.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-cactus-600 to-cactus-800">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-white mb-2">Cactus</h1>
          <p className="text-cactus-100">
            Plateforme d'assistance à la télévente
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg w-full max-h-[80vh] flex flex-col">
          {/* Conteneur scroll interne */}
          <div className="p-6 pt-6 scroll-beauty scroll-fade flex-1">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="space-y-2">
                <div
                  className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded"
                  role="alert"
                >
                  <span className="block sm:inline">{error}</span>
                </div>
                {error.toLowerCase().includes('réseau') && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded text-xs leading-relaxed">
                    <p className="font-medium mb-1">Dépannage réseau rapide :</p>
                    <ul className="list-disc ml-4 space-y-0.5">
                      <li>Vérifie si tu es connecté (Wi‑Fi / 4G)</li>
                      <li>Désactive provisoirement VPN / Proxy / Adblock</li>
                      <li>Essaye en navigation privée ou autre navigateur</li>
                      <li>Teste: <button type="button" onClick={testConnectivity} className="underline text-amber-900 hover:text-amber-700 disabled:opacity-60" disabled={testing}>{testing ? 'Test...' : 'Ping internet'}</button></li>
                    </ul>
                    {networkOk === true && <p className="mt-1 text-green-700">Ping OK : la connexion générale fonctionne.</p>}
                    {networkOk === false && <p className="mt-1 text-red-700">Échec du ping : problème de connexion ou blocage sortant.</p>}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className={isOnline ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                Statut réseau : {isOnline ? 'En ligne' : 'Hors ligne'}
              </span>
              {networkOk !== null && (
                <span className={networkOk ? 'text-green-600' : 'text-red-600'}>
                  Test: {networkOk ? 'OK' : 'Échec'}
                </span>
              )}
            </div>

            <div className="pt-2 border-t border-gray-200 space-y-2">
              <div className="bg-gray-50 border border-gray-200 rounded p-3">
                <p className="text-xs font-medium text-gray-700 mb-2">Région</p>
                <div className="flex items-center gap-6 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="region"
                      value="FR"
                      checked={selectedRegion === 'FR'}
                      onChange={() => setSelectedRegion('FR')}
                      className="accent-cactus-600"
                    />
                    <span>France (FR)</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="region"
                      value="CIV"
                      checked={selectedRegion === 'CIV'}
                      onChange={() => setSelectedRegion('CIV')}
                      className="accent-cactus-600"
                    />
                    <span>Côte d'Ivoire (CIV)</span>
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if(!showDiag) { setShowDiag(true); runAdvancedDiagnostics(); } else setShowDiag(false); }}
                className="text-xs text-cactus-700 hover:text-cactus-600 underline"
              >
                {showDiag ? 'Masquer diagnostic avancé' : 'Afficher diagnostic avancé'}
              </button>
              {showDiag && (
                <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Diagnostic réseau</span>
                    <button
                      type="button"
                      onClick={runAdvancedDiagnostics}
                      disabled={advRunning}
                      className="px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                    >{advRunning ? 'Analyse…' : 'Relancer'}</button>
                  </div>
                  {!advResults && <p className="text-gray-500">Collecte en cours…</p>}
                  {advResults && (
                    <ul className="space-y-1">
                      {advResults.results.map((r: any, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className={`mt-0.5 inline-block w-2 h-2 rounded-full ${r.ok ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          <div className="flex-1">
                            <span className="font-medium">{r.name}</span>
                            <span className="ml-1 text-[10px] text-gray-500">{r.latencyMs != null ? r.latencyMs + 'ms' : ''}</span>
                            {r.status && <span className="ml-2 text-[10px] text-gray-500">HTTP {r.status}</span>}
                            {r.code && <span className="ml-2 text-[10px] text-gray-500">{r.code}</span>}
                            {r.detail && <div className="text-[11px] text-gray-600">{r.detail}</div>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {advResults && (
                    <div className="pt-2 border-t border-gray-200 space-y-1 text-[11px] text-gray-600">
                      <p><strong>Interprétation rapide :</strong></p>
                      <ul className="list-disc ml-4 space-y-0.5">
                        <li>Si "API IdentityToolkit" = rouge mais "Accès domaine application" = vert → blocage ciblé (pare-feu / filtrage sur *.googleapis.com).</li>
                        <li>Si tout est rouge → perte de connexion ou DNS.</li>
                        <li>Si seulement "Accès domaine application" est rouge → cache / service worker local à nettoyer.</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email ou nom d'utilisateur
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="ex : a.hubert@mars-marketing.fr ou a.hubert"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Mot de passe
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-cactus-600 hover:text-cactus-500"
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
                  className="input-field pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 flex items-center justify-center"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <div className="mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">ou</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleMicrosoftLogin}
              disabled={loading}
              className="mt-4 w-full btn-secondary py-3 flex items-center justify-center"
            >
              <svg
                className="h-5 w-5 mr-2"
                viewBox="0 0 21 21"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M10 1H1V10H10V1Z" fill="#F25022" />
                <path d="M20 1H11V10H20V1Z" fill="#7FBA00" />
                <path d="M10 11H1V20H10V11Z" fill="#00A4EF" />
                <path d="M20 11H11V20H20V11Z" fill="#FFB900" />
              </svg>
              Se connecter avec Microsoft
            </button>
          </div>

          <div className="mt-6 text-center pb-2">
            <p className="text-sm text-gray-600">
              Vous n'avez pas de compte ?{" "}
              <Link
                to="/register"
                className="font-medium text-cactus-600 hover:text-cactus-500"
              >
                S'inscrire
              </Link>
            </p>
          </div>
          </div>{/* fin scroll */}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
