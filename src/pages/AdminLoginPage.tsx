import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const ALLOWED_ADMINS = [
  "i.boultame@mars-marketing.fr",
  "i.brai@mars-marketing.fr",
];

const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Renseigne ton email et ton mot de passe admin.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!ALLOWED_ADMINS.includes(normalizedEmail)) {
      setError("Accès refusé : ton adresse n'est pas autorisée pour l'espace admin.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      localStorage.setItem("adminAuth", "1");
      navigate("/admin/dashboard");
    }, 400);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-gray-800 flex items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-md">
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-white/10 via-white/5 to-transparent rounded-3xl blur-2xl" />
        <div className="rounded-3xl border border-white/10 bg-black/70 backdrop-blur-xl p-8 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.9)]">
          <div className="mb-8 text-center">
            <p className="text-xs uppercase tracking-[0.4em] text-white/40 mb-3">Admin Access</p>
            <h1 className="text-3xl font-semibold text-white">Espace Administration</h1>
            <p className="mt-2 text-sm text-white/60">
              Interface sécurisée pour les administrateurs. Accès réservé aux utilisateurs habilités.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="adminEmail" className="text-xs uppercase tracking-[0.3em] text-white/40">
                Email admin
              </label>
              <input
                id="adminEmail"
                type="email"
                autoComplete="off"
                placeholder="admin@cactus-tech.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="peer mt-2 w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/30 shadow-inner transition focus:outline-none focus:ring-2 focus:ring-cyan-400/80 focus:border-cyan-400/60 focus:bg-black/60 peer-valid:border-cyan-400/60 peer-valid:ring-2 peer-valid:ring-cyan-400/60 peer-valid:bg-black/60"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="adminPassword" className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Mot de passe
                </label>
                <Link to="/forgot-password" className="text-xs text-white/50 hover:text-white/80">
                  Mot de passe oublié ?
                </Link>
              </div>
              <input
                id="adminPassword"
                type="password"
                autoComplete="off"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="peer mt-2 w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/30 shadow-inner transition focus:outline-none focus:ring-2 focus:ring-cyan-400/80 focus:border-cyan-400/60 focus:bg-black/60 peer-valid:border-cyan-400/60 peer-valid:ring-2 peer-valid:ring-cyan-400/60 peer-valid:bg-black/60"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-gradient-to-r from-gray-900 via-black to-gray-900 text-sm font-semibold uppercase tracking-[0.3em] text-white transition-all duration-300 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.2),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="absolute -inset-20 translate-x-[-100%] rotate-12 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition-all duration-500 group-hover:translate-x-[120%] group-hover:opacity-100" />
              <span className="relative z-10">{loading ? "Connexion..." : "Connexion admin"}</span>
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/40">
            Besoin d'un accès ? Contacte un admin Cactus Tech.
          </p>

          <div className="mt-6 flex items-center justify-center">
            <Link
              to="/login"
              className="text-xs uppercase tracking-[0.3em] text-white/50 hover:text-white/80"
            >
              Retour login standard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
