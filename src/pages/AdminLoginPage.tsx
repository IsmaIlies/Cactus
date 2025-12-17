import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { auth as firebaseAuth } from "../firebase";

const ALLOWED_ADMINS = [
  "i.boultame@mars-marketing.fr",
  "i.brai@mars-marketing.fr",
  "i.boultame@orange.mars-marketing.fr",
  "i.brai@orange.mars-marketing.fr",
];

const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, loginWithMicrosoft, logout, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!ALLOWED_ADMINS.includes(normalizedEmail)) {
        setError("Accès refusé. Identifiants réservés à l'équipe Cactus.");
        return;
      }

      const { success, message } = await login(normalizedEmail, password);
      if (success) {
        localStorage.setItem("adminAuth", "1");
        navigate("/admin/dashboard");
      } else {
        setError(message || "Identifiants invalides. Veuillez réessayer.");
      }
    } catch (err) {
      setError("Impossible de vous connecter pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const hint = email.trim().toLowerCase();
      const ok = await loginWithMicrosoft(hint);
      if (!ok) {
        setError("Échec de la connexion avec Microsoft. Veuillez réessayer.");
        return;
      }
      const signedEmail = (firebaseAuth.currentUser?.email || user?.email || "").toLowerCase();
      if (!ALLOWED_ADMINS.includes(signedEmail)) {
        setError("Accès refusé. Réservé à l'équipe Cactus.");
        try { await logout(); } catch {}
        return;
      }
      localStorage.setItem("adminAuth", "1");
      navigate("/admin/dashboard");
    } catch (err) {
      setError("Impossible de vous connecter pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-full text-white"
      style={{
        background:
          "radial-gradient(circle at center, #0b1d38 0%, #050a13 55%, #010307 100%)",
      }}
    >
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="mb-10 text-center">
          <p className="text-xs uppercase tracking-[0.65em] text-white/50">Cactus</p>
          <h1 className="mt-3 text-5xl font-semibold tracking-[0.15em]">Admin Access</h1>
        </div>

        <div className="w-full max-w-md">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_35px_120px_rgba(0,0,0,0.55)] backdrop-blur">
            <div className="absolute inset-x-0 -top-1 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="admin-email"
                  className="text-xs uppercase tracking-[0.25em] text-white/60"
                >
                  Identifiant admin
                </label>
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                  placeholder="admin@cactus-tech.fr"
                  required
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="admin-password"
                  className="text-xs uppercase tracking-[0.25em] text-white/60"
                >
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 pr-12 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                    placeholder="••••••••"
                    required
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 transition hover:text-white"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full items-center justify-center overflow-hidden rounded-full border border-sky-500/45 bg-gradient-to-r from-[#123861] via-[#0b2240] to-[#071126] px-6 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-white shadow-[0_28px_75px_rgba(15,40,80,0.45)] transition-all duration-300 hover:scale-105 hover:border-sky-300/70 focus:outline-none focus:ring-2 focus:ring-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.32),transparent_55%),radial-gradient(circle_at_75%_85%,rgba(120,180,255,0.25),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="pointer-events-none absolute inset-0 -translate-y-full bg-gradient-to-br from-white/55 via-transparent to-transparent opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100" />
                <span className="relative">{loading ? "Connexion..." : "Connexion"}</span>
              </button>

              <div className="relative my-2 flex items-center justify-center">
                <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">ou</span>
              </div>

              <button
                type="button"
                onClick={handleMicrosoftLogin}
                disabled={loading}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-white/15 bg-[#111b2d] px-6 py-3 text-sm font-semibold text-white shadow-[0_22px_60px_rgba(15,23,42,0.55)] transition-all duration-300 hover:scale-[1.02] hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Se connecter avec Microsoft"
              >
                <ShieldCheck className="h-4 w-4 text-white/80" />
                <span>Se connecter avec Microsoft</span>
              </button>
            </form>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="group relative mt-6 flex w-full items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-r from-[#0c1b33] via-[#081528] to-[#050b17] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/80 shadow-[0_18px_55px_rgba(5,10,25,0.55)] transition-all duration-300 hover:scale-105 hover:border-white/35 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.28),transparent_55%),radial-gradient(circle_at_80%_85%,rgba(120,150,220,0.2),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="pointer-events-none absolute inset-0 -translate-y-full bg-gradient-to-br from-white/35 via-transparent to-transparent opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100" />
              <span className="relative">Retour à l'espace principal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
