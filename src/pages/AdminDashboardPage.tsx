import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Users, UserCheck2 } from "lucide-react";
import { collection, onSnapshot, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db } from "../firebase";

type NavItem = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "users", label: "Utilisateurs" },
  { id: "reports", label: "Rapports" },
  { id: "operations", label: "Opérations" },
  { id: "settings", label: "Paramètres" },
];

const ACTIVITY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours

const toMillis = (input: unknown): number | undefined => {
  if (!input) return undefined;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (input instanceof Date) return input.getTime();
  if (typeof input === "object") {
    const maybeTs = input as { toDate?: () => Date; seconds?: number; milliseconds?: number };
    if (typeof maybeTs.toDate === "function") return maybeTs.toDate()!.getTime();
    if (typeof maybeTs.milliseconds === "number") return maybeTs.milliseconds;
    if (typeof maybeTs.seconds === "number") return maybeTs.seconds * 1000;
  }
  return undefined;
};

const readStringField = (data: Record<string, any>, keys: string[]) => {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
};

const dataHasTruthyBoolean = (data: Record<string, any>, keys: string[]) =>
  keys.some((key) => data[key] === true);

const readTimestampMs = (data: Record<string, any>, keys: string[]) => {
  for (const k of keys) {
    const parsed = toMillis(data[k]);
    if (typeof parsed === "number") return parsed;
  }
  return undefined;
};

const isUserConsideredActive = (data: Record<string, any> | undefined | null) => {
  if (!data || typeof data !== "object") return false;
  if (dataHasTruthyBoolean(data, ["isActive", "active", "isOnline", "enabled"])) return true;

  const status = readStringField(data, ["status", "state", "activity", "activityStatus"]);
  if (status) {
    const normalized = status.toLowerCase();
    if (["active", "actif", "online", "en ligne"].includes(normalized)) return true;
  }

  const lastActivityMs = readTimestampMs(data, ["lastActive", "lastActivity", "lastLogin", "lastSeenAt", "updatedAt"]);
  if (typeof lastActivityMs === "number") {
    return Date.now() - lastActivityMs <= ACTIVITY_WINDOW_MS;
  }

  return false;
};

const StatCard: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  value: React.ReactNode;
  helperText?: string | React.ReactNode;
}> = ({ icon: Icon, title, value, helperText }) => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-[#06111b] to-[#04101a] p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(6,182,212,0.12),transparent_55%),radial-gradient(circle_at_85%_80%,rgba(59,130,246,0.06),transparent_60)]" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-400/40 bg-cyan-400/8 p-3">
            {Icon ? <Icon className="h-5 w-5 text-cyan-300" aria-hidden="true" /> : null}
          </div>
          <p className="text-xs uppercase tracking-[0.35em] text-blue-100/70">{title}</p>
        </div>
        <p className="text-4xl font-semibold text-white">{value}</p>
        {helperText ? <p className="text-xs text-blue-100/60">{helperText}</p> : null}
      </div>
    </div>
  );
};

const formatStatValue = (v: number, loading?: boolean) => (loading ? "..." : v.toLocaleString());

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = React.useState<string>("dashboard");
  const [sidebarOpen, setSidebarOpen] = React.useState<boolean>(true);
  const [userStats, setUserStats] = React.useState({ totalUsers: 0, activeUsers: 0 });
  const [statsLoading, setStatsLoading] = React.useState<boolean>(true);
  const [statsError, setStatsError] = React.useState<string | null>(null);

  const { isAuthenticated } = useAuth();

  React.useEffect(() => {
    if (!isAuthenticated && localStorage.getItem("adminAuth") !== "1") {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate, isAuthenticated]);

  React.useEffect(() => {
    let isMounted = true;
    setStatsLoading(true);
    setStatsError(null);

    // Only subscribe if the user is actually authenticated. Do not bypass rules with a local flag.
    if (!isAuthenticated) {
      if (localStorage.getItem("adminAuth") === "1") {
        setStatsError(
          "Mode admin local activé — mais les abonnements Firestore exigent une authentification. Connectez-vous pour afficher ces statistiques."
        );
      } else {
        setStatsError("Accès refusé : authentification requise pour afficher ces statistiques.");
      }
      setStatsLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot: QuerySnapshot<DocumentData>) => {
        if (!isMounted) return;
        let active = 0;
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (isUserConsideredActive(data)) active += 1;
        });
        setUserStats({ totalUsers: snapshot.size, activeUsers: active });
        setStatsLoading(false);
      },
      (error) => {
        if (!isMounted) return;
        // eslint-disable-next-line no-console
        console.error("Failed to subscribe to admin user stats", error);
        if (error && (error.code === "permission-denied" || error.code === "unauthenticated")) {
          setStatsError("Accès refusé par les règles Firestore (permission-denied). Vérifiez vos rôles/claims ou connectez-vous avec un compte admin.");
        } else {
          setStatsError("Impossible de récupérer les statistiques utilisateurs.");
        }
        setStatsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isAuthenticated]);

  const handleLogout = () => {
    localStorage.removeItem("adminAuth");
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#050e1b] via-[#040812] to-black text-white">
      <button
        onClick={() => setSidebarOpen((prev) => !prev)}
        style={{ left: sidebarOpen ? (window.innerWidth >= 768 ? "17.5rem" : "16rem") : "1rem" }}
        className="fixed top-5 z-50 inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-gradient-to-r from-[#0a1a2c] via-[#060e1b] to-[#03080f] px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-[0_14px_38px_-22px_rgba(6,182,212,0.8)] transition hover:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
      >
        <span className="relative flex h-4 w-5 flex-col justify-between">
          <span className="h-[2px] w-full bg-cyan-200"></span>
          <span className="h-[2px] w-full bg-cyan-200"></span>
          <span className="h-[2px] w-full bg-cyan-200"></span>
        </span>
        <span>Menu</span>
      </button>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex min-h-screen w-full flex-col gap-6 py-10 md:flex-row">
        <aside
          className={`fixed inset-y-0 left-0 z-40 h-full w-64 transform border border-cyan-400/10 bg-gradient-to-b from-[#08162a] via-[#050f1d] to-[#02060c] backdrop-blur-xl shadow-[0_25px_60px_-45px_rgba(6,182,212,0.55)] transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="border-b border-white/10 px-6 py-8">
            <p className="text-xs uppercase tracking-[0.4em] text-blue-200/60">Admin</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Cactus Console</h2>
          </div>
          <nav className="space-y-1 px-2 py-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                    activeSection === item.id
                      ? "bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-transparent text-white border border-cyan-400/40"
                      : "text-blue-100/70 hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4 text-cyan-300" aria-hidden="true" />}
                    <span>{item.label}</span>
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full transition ${
                      activeSection === item.id ? "bg-cyan-400" : "bg-white/20"
                    }`}
                  />
                </button>
              );
            })}
          </nav>
          <div className="border-t border-white/10 px-6 py-6">
            <button
              onClick={handleLogout}
              className="group relative inline-flex h-11 w-full items-center justify-center overflow-hidden rounded-xl border border-cyan-400/20 bg-gradient-to-r from-[#071225] via-[#040b16] to-[#02060c] text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:border-cyan-300/40"
            >
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.2),transparent_60)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="absolute -inset-20 translate-x-[-100%] rotate-12 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition-all duration-500 group-hover:translate-x-[120%] group-hover:opacity-100" />
              <span className="relative z-10">Déconnexion</span>
            </button>
          </div>
        </aside>

        <main
          className={`flex-1 px-6 transition-all duration-300 ${
            sidebarOpen ? "md:pl-72" : "md:pl-12"
          }`}
        >
          {activeSection === "dashboard" ? (
            <div className="space-y-8 pt-16 md:pt-20">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold text-white">Vue d'ensemble</h1>
                <p className="text-sm text-blue-100/70">
                  Suivi instantané des comptes Cactus et de leur activité récente.
                </p>
              </div>

              {statsError && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
                  {statsError}
                </div>
              )}

              <div className="grid gap-6 sm:grid-cols-2">
                <StatCard
                  icon={Users}
                  title="Utilisateurs enregistrés"
                  value={formatStatValue(userStats.totalUsers, statsLoading)}
                  helperText={statsLoading ? "Chargement en cours..." : "Total des comptes créés sur Cactus."}
                />

                <StatCard
                  icon={UserCheck2}
                  title="Utilisateurs actifs"
                  value={formatStatValue(userStats.activeUsers, statsLoading)}
                  helperText={
                    statsLoading ? "Détection de l'activité..." : "Utilisateurs considérés actifs sur les 30 derniers jours."
                  }
                />
              </div>
            </div>
          ) : (
            <div className="pt-16">Section: {activeSection}</div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
