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
  // Option B: whitelist temporary supervisor access based on email typed on login screen
  const SUPERVISOR_WHITELIST = ["i.brai@mars-marketing.fr"]; // temporary
  type SupervisorChoice = 'fr' | 'civ' | 'leads' | null;
  const [supervisorChoice, setSupervisorChoice] = useState<SupervisorChoice>(null);

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

  useEffect(() => {
    const reason = localStorage.getItem('logoutReason');
    if (reason === 'inactivity') {
      setError("Votre session a expiré après 30 minutes d'inactivité.");
      localStorage.removeItem('logoutReason');
    }
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
  const isSupervisorAllowed = SUPERVISOR_WHITELIST.includes(normalizedEmail);
  const supervisorTargetPath = supervisorChoice
    ? `/dashboard/superviseur/${supervisorChoice}`
    : null;

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
        localStorage.setItem('activeRegion', selectedRegion);
        localStorage.setItem('activeMission', mission);
        setRegion(selectedRegion);
        // If supervisor choice is selected and allowed, prioritize supervisor dashboards
        if (isSupervisorAllowed && supervisorTargetPath) {
          try { sessionStorage.setItem('supervisorTarget', supervisorTargetPath); } catch {}
          navigate(supervisorTargetPath);
          try { sessionStorage.removeItem('supervisorTarget'); } catch {}
        } else if (mission === 'ORANGE_LEADS') {
          navigate('/leads/dashboard');
        } else {
          navigate(selectedRegion === 'CIV' ? '/dashboard/civ' : '/dashboard/fr');
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
      const success = await loginWithMicrosoft();
      if (success) {
        localStorage.setItem('activeRegion', selectedRegion);
        localStorage.setItem('activeMission', mission);
        setRegion(selectedRegion);
        if (isSupervisorAllowed && supervisorTargetPath) {
          try { sessionStorage.setItem('supervisorTarget', supervisorTargetPath); } catch {}
          navigate(supervisorTargetPath);
          try { sessionStorage.removeItem('supervisorTarget'); } catch {}
        } else if (mission === 'ORANGE_LEADS') {
          navigate('/leads/dashboard');
        } else {
          navigate(selectedRegion === 'CIV' ? '/dashboard/civ' : '/dashboard/fr');
        }
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
    <div className="min-h-screen flex flex-col items-center justify-start p-4 pt-10 pb-16 bg-gradient-to-b from-cactus-600 to-cactus-800">
      <div className="w-full max-w-md">
        <div className="text-center mb-10 flex flex-col items-center">
          <img
            src="/cactus-tech-logo.svg"
            alt="Logo Cactus Tech"
            className="w-60 max-w-full h-auto mb-5 drop-shadow-lg"
          />
          <p className="text-cactus-100 text-lg">
            SaaS TMK Solution powered by IA
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-lg w-full">
          <div className="p-6 pt-6">
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
              <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-3">
                <p className="text-xs font-medium text-gray-700">Mission</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleMissionSelect('CANAL_PLUS')}
                    aria-pressed={mission === 'CANAL_PLUS'}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 text-sm font-semibold ${
                      mission === 'CANAL_PLUS'
                        ? 'bg-gray-900 text-white border-gray-900 shadow-lg shadow-gray-900/30 focus:ring-gray-900'
                        : 'bg-white text-gray-900 border-gray-300 hover:border-gray-400 hover:bg-gray-100 focus:ring-gray-400'
                    }`}
                  >
                    <span className="block text-base font-semibold tracking-wide">CANAL+</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMissionSelect('ORANGE_LEADS')}
                    aria-pressed={mission === 'ORANGE_LEADS'}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 text-sm font-semibold ${
                      mission === 'ORANGE_LEADS'
                        ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-400/40 focus:ring-orange-400'
                        : 'bg-white text-gray-900 border-orange-200 hover:border-orange-300 hover:bg-orange-50 focus:ring-orange-300'
                    }`}
                  >
                    <span className="block text-base font-semibold tracking-wide">ORANGE LEADS</span>
                  </button>
                </div>
              </div>
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
              {/* Supervisor quick access (Option B - temporary whitelist) */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-blue-900">Espace Superviseur</p>
                  <span className="text-[10px] text-blue-700">Accès temporaire</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                        className={
                          `w-full rounded-lg border px-3 py-2 text-center text-sm font-semibold transition ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600 shadow'
                              : 'bg-white text-blue-900 border-blue-300 hover:bg-blue-100'
                          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
                        }
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                </div>
                {!isSupervisorAllowed && (
                  <p className="mt-2 text-[11px] text-blue-900/80">
                    Indiquez un email autorisé pour activer l'accès superviseur. Accès accordé à: i.brai@mars-marketing.fr
                  </p>
                )}
                {isSupervisorAllowed && supervisorChoice && (
                  <p className="mt-2 text-[11px] text-blue-900/80">Cible choisie: {supervisorChoice.toUpperCase()}</p>
                )}
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

            {/* Lien discret vers l'inscription */}
            <div className="mt-3 flex justify-center">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-full border border-cactus-600/30 bg-white/90 px-4 py-2 text-sm font-medium text-cactus-700 hover:bg-cactus-50 shadow-sm"
              >
                Créer un compte
              </Link>
            </div>
          </form>

          <div className="mt-8 pb-2 flex justify-center">
            <button
              type="button"
              onClick={() => navigate("/admin/login")}
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-white/15 bg-black/85 px-7 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-white shadow-[0_24px_60px_rgba(0,0,0,0.55)] transition-all duration-300 hover:scale-105 hover:border-white/35 hover:bg-black focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <span className="pointer-events-none absolute inset-0 -translate-y-full bg-gradient-to-br from-white/45 via-white/10 to-transparent opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100" />
              <span>ADMIN</span>
              <span className="h-px w-8 bg-white/40" aria-hidden="true" />
              <span className="text-[10px] tracking-[0.2em] text-white/60 normal-case">Accès sécurisé</span>
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
