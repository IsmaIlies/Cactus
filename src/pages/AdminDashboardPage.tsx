import React from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, UserCheck2 } from "lucide-react";
import { collection, onSnapshot, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db } from "../firebase";

type NavItem = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Utilisateurs" },
  { id: "reports", label: "Rapports" },
  { id: "operations", label: "Opérations" },
  { id: "settings", label: "Paramètres" },
];

const ACTIVITY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours pour considérer un utilisateur actif

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = React.useState<string>("dashboard");
  const [sidebarOpen, setSidebarOpen] = React.useState<boolean>(true);
  const [userStats, setUserStats] = React.useState({ totalUsers: 0, activeUsers: 0 });
  const [statsLoading, setStatsLoading] = React.useState<boolean>(true);
  const [statsError, setStatsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (localStorage.getItem("adminAuth") !== "1") {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate]);

  React.useEffect(() => {
    let isMounted = true;
    setStatsLoading(true);
    setStatsError(null);

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot: QuerySnapshot<DocumentData>) => {
        if (!isMounted) {
          return;
        }

        let active = 0;
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (isUserConsideredActive(data)) {
            active += 1;
          }
        });

        setUserStats({ totalUsers: snapshot.size, activeUsers: active });
        setStatsLoading(false);
      },
      (error) => {
        if (!isMounted) {
          return;
        }
        console.error("Failed to subscribe to admin user stats", error);
        setStatsError("Impossible de récupérer les statistiques utilisateurs.");
        setStatsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

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
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.2),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
                    statsLoading
                      ? "Détection de l'activité..."
                      : "Utilisateurs considérés actifs sur les 30 derniers jours."
                  }
                />
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-sm text-blue-100/70 backdrop-blur-xl">
              <p className="text-lg font-semibold text-white">Section en préparation</p>
              <p className="mt-2">
                Les modules "{activeSection}" sont en cours de construction. Contacte l'équipe admin pour connaître la feuille de route.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

type StatCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  helperText: string;
};

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, title, value, helperText }) => (
  <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-black via-[#050d1a] to-black p-6 shadow-[0_25px_60px_-45px_rgba(6,182,212,0.6)]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(6,182,212,0.35),transparent_55%),radial-gradient(circle_at_85%_80%,rgba(59,130,246,0.25),transparent_60%)]" />
    <div className="relative flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-cyan-400/40 bg-cyan-400/10 p-3">
          <Icon className="h-5 w-5 text-cyan-300" aria-hidden="true" />
        </div>
        <p className="text-xs uppercase tracking-[0.35em] text-blue-100/70">{title}</p>
      </div>
      <p className="text-4xl font-semibold text-white">{value}</p>
      <p className="text-xs text-blue-100/60">{helperText}</p>
    </div>
  </div>
);

const formatStatValue = (value: number, loading: boolean) => {
  if (loading) {
    return "--";
  }
  return value.toLocaleString("fr-FR");
};

const isUserConsideredActive = (data: Record<string, any>) => {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (dataHasTruthyBoolean(data, ["isActive", "active", "isOnline", "enabled"])) {
    return true;
  }

  const status = readStringField(data, ["status", "state", "activity", "activityStatus"]);
  if (status) {
    const normalized = status.toLowerCase();
    if (["active", "actif", "online", "en ligne"].includes(normalized)) {
      return true;
    }
  }

  const lastActivityMs = readTimestampMs(data, ["lastActive", "lastActivity", "lastLogin", "lastSeenAt", "updatedAt"]);
  if (typeof lastActivityMs === "number") {
    return Date.now() - lastActivityMs <= ACTIVITY_WINDOW_MS;
  }

  return false;
};

const dataHasTruthyBoolean = (data: Record<string, any>, keys: string[]) =>
  keys.some((key) => data[key] === true);

const readStringField = (data: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
};

const readTimestampMs = (data: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const rawValue = data[key];
    const parsed = toMillis(rawValue);
    if (typeof parsed === "number") {
      return parsed;
    }
  }
  return undefined;
};

const toMillis = (input: unknown): number | undefined => {
  if (!input) {
    return undefined;
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  if (input instanceof Date) {
    return input.getTime();
  }
  if (typeof input === "object") {
    const maybeTimestamp = input as { toDate?: () => Date; seconds?: number; milliseconds?: number };
    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().getTime();
    }
    if (typeof maybeTimestamp.milliseconds === "number") {
      return maybeTimestamp.milliseconds;
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000;
    }
  }
  return undefined;
};

export default AdminDashboardPage;
