import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LayoutDashboard, Users, UserCheck2 } from "lucide-react";
import { collection, onSnapshot, QuerySnapshot, DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { subscribeEntriesByPeriod, type HoursEntryDoc } from "../services/hoursService";
import { computeWorkedMinutes } from "../modules/checklist/lib/time";
import { formatDayLabel, formatHours } from "../modules/checklist/lib/time";

type NavItem = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
};

type NewUserForm = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type CreateUserFeedback = {
  type: "success" | "error";
  message: string;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Utilisateurs" },
  { id: "reports", label: "Rapports" },
  { id: "heures", label: "Heures" },
  { id: "operations", label: "Opérations" },
  { id: "settings", label: "Paramètres" },
];

const createEmptyNewUserForm = (): NewUserForm => ({
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
});

const ACTIVITY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours pour considérer un utilisateur actif

const StatCard: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  value: React.ReactNode;
  helperText?: string | React.ReactNode;
}> = ({ icon: Icon, title, value, helperText }) => (
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

const formatStatValue = (value: number, loading: boolean) => (loading ? "--" : value.toLocaleString("fr-FR"));

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [activeSection, setActiveSection] = React.useState<string>("dashboard");
  const [sidebarOpen, setSidebarOpen] = React.useState<boolean>(true);
  const [userStats, setUserStats] = React.useState({ totalUsers: 0, activeUsers: 0 });
  const [statsLoading, setStatsLoading] = React.useState<boolean>(true);
  const [statsError, setStatsError] = React.useState<string | null>(null);
  // Admin Heures state
  const [hoursPeriod, setHoursPeriod] = React.useState<string>(() => new Date().toISOString().slice(0,7));
  const [hoursEntries, setHoursEntries] = React.useState<HoursEntryDoc[]>([]);
  const [hoursLoading, setHoursLoading] = React.useState<boolean>(false);
  const [hoursError, setHoursError] = React.useState<string | null>(null);

  const [showCreateUserModal, setShowCreateUserModal] = React.useState<boolean>(false);
  const [newUserForm, setNewUserForm] = React.useState<NewUserForm>(() => createEmptyNewUserForm());
  const [createUserLoading, setCreateUserLoading] = React.useState<boolean>(false);
  const [createUserFeedback, setCreateUserFeedback] = React.useState<CreateUserFeedback | null>(null);

  React.useEffect(() => {
    if (!isAuthenticated && localStorage.getItem("adminAuth") !== "1") {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate, isAuthenticated]);

  const registerUserEndpoint = React.useMemo(() => {
    if (typeof window === "undefined") {
      return "https://europe-west9-cactus-mm.cloudfunctions.net/registerUser";
    }
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    return isLocal
      ? "http://127.0.0.1:5001/cactus-mm/europe-west9/registerUser"
      : "https://europe-west9-cactus-mm.cloudfunctions.net/registerUser";
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    setStatsLoading(true);
    setStatsError(null);

    if (!isAuthenticated) {
      if (localStorage.getItem("adminAuth") === "1") {
        setStatsError(
          "Mode admin local activé — mais les abonnements Firestore exigent une authentification. Connectez-vous pour afficher ces statistiques."
        );
      } else {
        setStatsError("Accès refusé : authentification requise pour afficher ces statistiques.");
      }
      setStatsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot: QuerySnapshot<DocumentData>) => {
        if (!isMounted) return;
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
        if (!isMounted) return;
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

  // Subscribe to hoursEntries for selected period (Admin view)
  React.useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    setHoursError(null);
    setHoursLoading(true);

    if (!isAuthenticated) {
      setHoursLoading(false);
      setHoursError("Authentification requise pour afficher les heures.");
      return;
    }

    try {
      unsubscribe = subscribeEntriesByPeriod(hoursPeriod, (list) => {
        setHoursEntries(list);
        setHoursLoading(false);
      });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to subscribe to hours entries", e);
      setHoursError("Impossible de récupérer les checklists d'heures pour la période sélectionnée.");
      setHoursLoading(false);
    }

    return () => { try { unsubscribe && unsubscribe(); } catch { /* noop */ } };
  }, [hoursPeriod, isAuthenticated]);

  const handleLogout = () => {
    localStorage.removeItem("adminAuth");
    navigate("/admin/login", { replace: true });
  };

  // Handlers for CreateUser modal
  const openCreateUserModal = React.useCallback(() => {
    setCreateUserFeedback(null);
    setShowCreateUserModal(true);
  }, []);

  const closeCreateUserModal = React.useCallback(() => {
    setShowCreateUserModal(false);
  }, []);

  const updateNewUserForm = React.useCallback(
    (field: keyof NewUserForm, value: string) => {
      setNewUserForm((prev) => ({ ...prev, [field]: value }));
      // Clear previous feedback when editing fields
      setCreateUserFeedback(null);
    },
    []
  );

  const handleCreateUserSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isAuthenticated) {
        setCreateUserFeedback({ type: "error", message: "Authentification admin requise." });
        return;
      }

      const { firstName, lastName, email, password, confirmPassword } = newUserForm;
      if (!firstName || !lastName || !email || !password) {
        setCreateUserFeedback({ type: "error", message: "Tous les champs sont obligatoires." });
        return;
      }
      if (password !== confirmPassword) {
        setCreateUserFeedback({ type: "error", message: "Les mots de passe ne correspondent pas." });
        return;
      }

      try {
        setCreateUserLoading(true);
        setCreateUserFeedback(null);

        const res = await fetch(registerUserEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName, email, password }),
          credentials: "include",
        });

        const contentType = res.headers.get("content-type") || "";
        const isJson = contentType.includes("application/json");
        const payload: any = isJson ? await res.json().catch(() => ({})) : {};

        if (!res.ok) {
          const code: string | undefined = payload?.error?.code || payload?.code;
          const message: string | undefined = payload?.error?.message || payload?.message;
          setCreateUserFeedback({
            type: "error",
            message: mapRegisterUserError(code, message, res.status),
          });
          return;
        }

        // Success
        setCreateUserFeedback({ type: "success", message: "Compte créé avec succès." });
        // Reset form after success
        setNewUserForm(createEmptyNewUserForm());
      } catch (err: any) {
        // Network or unexpected error
        setCreateUserFeedback({ type: "error", message: mapRegisterUserError(undefined, err?.message) });
      } finally {
        setCreateUserLoading(false);
      }
    },
    [isAuthenticated, newUserForm, registerUserEndpoint]
  );

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
          ) : activeSection === "heures" ? (
            <div className="space-y-6 pt-16 md:pt-20">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-white">Heures soumises</h1>
                  <p className="text-sm text-blue-100/70">Vue admin des checklists par période.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="hours-period" className="text-xs text-blue-100/70">Période</label>
                  <input id="hours-period" className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm" type="month" value={hoursPeriod} onChange={(e) => setHoursPeriod(e.target.value)} />
                </div>
              </div>

              {hoursError && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">{hoursError}</div>
              )}

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-white/5 text-blue-100/80">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Jour</th>
                        <th className="px-4 py-3 text-left font-semibold">Agent</th>
                        <th className="px-4 py-3 text-left font-semibold">Email</th>
                        <th className="px-4 py-3 text-left font-semibold">Projet</th>
                        <th className="px-4 py-3 text-left font-semibold">Superviseur</th>
                        <th className="px-4 py-3 text-right font-semibold">Total</th>
                        <th className="px-4 py-3 text-left font-semibold">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {hoursLoading ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-blue-100/60">Chargement…</td>
                        </tr>
                      ) : hoursEntries.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-blue-100/60">Aucune checklist trouvée pour {hoursPeriod}.</td>
                        </tr>
                      ) : (
                        hoursEntries.map((e) => {
                          const total = computeWorkedMinutes(e as any);
                          return (
                            <tr key={e._docId} className="hover:bg-white/5">
                              <td className="px-4 py-3 whitespace-nowrap">{formatDayLabel(e.day)}</td>
                              <td className="px-4 py-3 whitespace-nowrap">{(e as any).userDisplayName || '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap">{(e as any).userEmail || '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap">{e.project}</td>
                              <td className="px-4 py-3 whitespace-nowrap">{(e as any).supervisor || '—'}</td>
                              <td className="px-4 py-3 text-right font-semibold">{formatHours(total)}</td>
                              <td className="px-4 py-3 whitespace-nowrap capitalize">{(''+(e as any).reviewStatus).toLowerCase()}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeSection === "users" ? (
            <UsersSection onCreateUserClick={openCreateUserModal} disabled={!isAuthenticated} />
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

      <CreateUserModal
        open={showCreateUserModal}
        onClose={closeCreateUserModal}
        form={newUserForm}
        onFieldChange={updateNewUserForm}
        onSubmit={handleCreateUserSubmit}
        loading={createUserLoading}
        feedback={createUserFeedback}
        disabled={!isAuthenticated}
      />
    </div>
  );
};

type UsersSectionProps = {
  onCreateUserClick: () => void;
  disabled: boolean;
};

const UsersSection: React.FC<UsersSectionProps> = ({ onCreateUserClick, disabled }) => (
  <div className="space-y-8 pt-16 md:pt-20">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Utilisateurs</h1>
        <p className="text-sm text-blue-100/70">
          Gère les accès Cactus et provisionne les nouveaux collaborateurs.
        </p>
      </div>
      <button
        onClick={onCreateUserClick}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-transparent px-5 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-white transition hover:border-cyan-300/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-blue-100/40"
      >
        <span className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-cyan-400/20" />
          <span className="relative text-lg leading-none text-cyan-200">+</span>
        </span>
        Nouveau compte
      </button>
    </div>

    <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-sm text-blue-100/70 backdrop-blur-xl">
      <p className="text-lg font-semibold text-white">Gestion des utilisateurs</p>
      <p className="mt-2">
        Le tableau de bord de gestion détaillé arrive bientôt. En attendant, tu peux déjà créer de nouveaux comptes collaborateurs depuis le bouton ci-dessus.
      </p>
      {disabled ? (
        <p className="mt-4 rounded-xl border border-yellow-400/40 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-200">
          Connecte-toi avec un compte admin pour provisioning des utilisateurs.
        </p>
      ) : null}
    </div>
  </div>
);

type CreateUserModalProps = {
  open: boolean;
  onClose: () => void;
  form: NewUserForm;
  onFieldChange: (field: keyof NewUserForm, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  feedback: CreateUserFeedback | null;
  disabled: boolean;
};

const CreateUserModal: React.FC<CreateUserModalProps> = ({
  open,
  onClose,
  form,
  onFieldChange,
  onSubmit,
  loading,
  feedback,
  disabled,
}) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-[#071120] via-[#050b17] to-[#02050b] p-6 shadow-[0_35px_80px_-45px_rgba(6,182,212,0.7)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 text-sm text-blue-100/60 transition hover:text-white"
        >
          Fermer
        </button>
        <div className="space-y-2 pr-12">
          <p className="text-xs uppercase tracking-[0.35em] text-blue-200/60">Nouvel utilisateur</p>
          <h2 className="text-2xl font-semibold text-white">Créer un compte collaborateur</h2>
          <p className="text-sm text-blue-100/70">
            Renseigne l'identité de l'utilisateur et choisis un mot de passe provisoire. Le collaborateur pourra le modifier après connexion.
          </p>
        </div>

        {disabled ? (
          <div className="mt-4 rounded-2xl border border-yellow-400/40 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-200">
            Impossible de créer un compte sans authentification admin.
          </div>
        ) : null}

        <form className="mt-6 space-y-5" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.3em] text-blue-100/60" htmlFor="admin-new-firstName">
                Prénom
              </label>
              <input
                id="admin-new-firstName"
                type="text"
                value={form.firstName}
                onChange={(event) => onFieldChange("firstName", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/30 transition focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                placeholder="Camille"
                autoComplete="off"
                disabled={disabled || loading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.3em] text-blue-100/60" htmlFor="admin-new-lastName">
                Nom
              </label>
              <input
                id="admin-new-lastName"
                type="text"
                value={form.lastName}
                onChange={(event) => onFieldChange("lastName", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/30 transition focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                placeholder="Martin"
                autoComplete="off"
                disabled={disabled || loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-blue-100/60" htmlFor="admin-new-email">
              Email professionnel
            </label>
            <input
              id="admin-new-email"
              type="email"
              value={form.email}
              onChange={(event) => onFieldChange("email", event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/30 transition focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              placeholder="prenom.nom@cactus-tech.fr"
              autoComplete="off"
              disabled={disabled || loading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.3em] text-blue-100/60" htmlFor="admin-new-password">
                Mot de passe
              </label>
              <input
                id="admin-new-password"
                type="password"
                value={form.password}
                onChange={(event) => onFieldChange("password", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/30 transition focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                placeholder="Au moins 6 caractères"
                autoComplete="new-password"
                disabled={disabled || loading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.3em] text-blue-100/60" htmlFor="admin-new-passwordConfirm">
                Confirmer le mot de passe
              </label>
              <input
                id="admin-new-passwordConfirm"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => onFieldChange("confirmPassword", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/30 transition focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                placeholder="Retape le mot de passe"
                autoComplete="new-password"
                disabled={disabled || loading}
              />
            </div>
          </div>

          {feedback && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                feedback.type === "success"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-red-400/40 bg-red-500/10 text-red-200"
              }`}
            >
              {feedback.message}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-blue-100/80 transition hover:border-white/30 hover:text-white"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={disabled || loading}
              className="inline-flex items-center justify-center rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-transparent px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:border-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Création..." : "Créer le compte"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const mapRegisterUserError = (code?: string, fallback?: string, statusCode?: number) => {
  if (code) {
    switch (code) {
      case "auth/email-already-exists":
        return "Un compte existe déjà avec cette adresse email.";
      case "auth/invalid-password":
        return "Le mot de passe est jugé trop faible par Firebase (6 caractères minimum).";
      case "auth/invalid-email":
        return "L'adresse email semble invalide.";
      case "auth/operation-not-allowed":
        return "La création de comptes est désactivée sur le projet Firebase.";
      default:
        break;
    }
  }

  if (fallback) {
    return fallback;
  }

  if (statusCode && statusCode >= 500) {
    return "Le service d'inscription ne répond pas pour le moment. Réessaie plus tard.";
  }

  return "Création du compte impossible. Réessaie dans un instant.";
};

const isUserConsideredActive = (data: Record<string, any> | undefined | null) => {
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
    const parsed = toMillis(data[key]);
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
