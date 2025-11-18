import React, { useEffect, useState } from "react";
import { firebaseConfig } from "../firebase";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
// auth import removed (region selection is manual, no Firestore region fetch needed)
import { useRegion } from '../contexts/RegionContext';
import { Eye, EyeOff, Cpu, ShieldCheck, Sparkles } from "lucide-react";

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
  const SUPERVISOR_WHITELIST = [
    "i.brai@mars-marketing.fr",
    "l.raynaud@mars-marketing.fr",
    "m.demauret@mars-marketing.fr",
    "i.boultame@mars-marketing.fr",
    "j.allione@mars-marketing.fr",
    "j.pariolleau@mars-marketing.fr",
    "olivier@evenmedia.fr",
    "m.maimoun@mars-marketing.fr",
    "s.karabagli@mars-marketing.fr",
    "a.gouet@mars-marketing.fr",
  ]; // temporary
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
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
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
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="space-y-2">
                    <div
                      className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 shadow-sm shadow-red-900/20"
                      role="alert"
                    >
                      <span className="block sm:inline">{error}</span>
                    </div>
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
                  <span className={isOnline ? 'text-emerald-300 font-medium' : 'text-red-300 font-medium'}>
                    Statut réseau : {isOnline ? 'En ligne' : 'Hors ligne'}
                  </span>
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

                <div className="flex justify-center">
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 rounded-full border border-cactus-400/30 bg-cactus-500/10 px-4 py-2 text-sm font-medium text-cactus-100 transition hover:border-cactus-300/60 hover:bg-cactus-500/20"
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
