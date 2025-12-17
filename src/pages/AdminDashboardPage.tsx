import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LayoutDashboard, Users, UserCheck2, BarChart3, Tv, LineChart, Crown, X, Trophy, ArrowUpDown, ChevronUp, ChevronDown, Award, Search, Check } from "lucide-react";
import { collection, getDocs, onSnapshot, QuerySnapshot, DocumentData, query, where, doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { db, auth as firebaseAuth } from "../firebase";
import { getIdToken } from "firebase/auth";
// AdminPresenceDebugBadge retiré définitivement
import { subscribeEntriesByPeriod, type HoursEntryDoc } from "../services/hoursService";
import { computeWorkedMinutes } from "../modules/checklist/lib/time";
import { formatDayLabel, formatHours } from "../modules/checklist/lib/time";

type NavItem = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
};

type CanalMonthlySale = {
  id?: string;
  dateMs: number;
  region: "FR" | "CIV" | "OTHER";
  seller: string;
  sellerId?: string | null;
  campaign?: string | null;
};

type NewUserForm = {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type CreateUserFeedback = {
  type: "success" | "error";
  message: string;
};

type AdminUserRow = {
  id: string;
  displayName: string;
  email: string;
  companyName?: string;
  role?: string;
  status: "active" | "inactive" | "disabled";
  lastActiveMs?: number;
  createdAtMs?: number;
  disabled?: boolean;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Utilisateurs", icon: Users },
  {
    id: "reports",
    label: "Rapports",
    icon: BarChart3,
    children: [
      { id: "reports-canal", label: "CANAL+", icon: Tv },
      { id: "reports-leads", label: "Leads", icon: LineChart },
    ],
  },
  { id: "heures", label: "Heures" },
  { id: "operations", label: "Opérations" },
  { id: "settings", label: "Paramètres" },
];

const createEmptyNewUserForm = (): NewUserForm => ({
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  password: "",
  confirmPassword: "",
});

// Fenêtre d'activité étendue à 2 heures pour refléter la présence réelle
const ACTIVITY_WINDOW_MS = 1000 * 60 * 60 * 2; // 2 heures pour considérer un utilisateur actif

const normalizeCampaignCode = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const clean = value.trim().toUpperCase();
    const match = clean.match(/(210|211|214|216)/);
    if (match) {
      return match[1];
    }
    if (/^\d+$/.test(clean)) {
      return clean;
    }
  }
  return null;
};

const parseMonthInput = (value: string) => {
  const [yearStr, monthStr] = value.split("-");
  const parsedYear = Number(yearStr);
  const parsedMonth = Number(monthStr);
  if (!parsedYear || parsedMonth < 1 || parsedMonth > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: parsedYear, month: parsedMonth };
};

const getMonthBounds = (value: string) => {
  const { year, month } = parseMonthInput(value);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { year, month, start, end };
};

const countBusinessDays = (start: Date, end: Date) => {
  const cursor = new Date(start);
  let count = 0;
  while (cursor < end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

const buildMonthOptions = (monthsBack = 6) => {
  const list: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i += 1) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
    const label = ref.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    list.push({ value, label });
  }
  return list;
};

const StatCard: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  value: React.ReactNode;
  helperText?: string | React.ReactNode;
}> = ({ icon: Icon, title, value, helperText }) => (
  <div className="group relative overflow-hidden rounded-2xl border border-sky-500/15 bg-gradient-to-br from-[#0a1535] via-[#070f26] to-[#040817] p-4 sm:p-5 transition-all duration-300 hover:border-sky-300/40 hover:shadow-[0_20px_45px_rgba(8,53,138,0.45)]">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(14,165,233,0.18),transparent_55%),radial-gradient(circle_at_80%_90%,rgba(59,130,246,0.12),transparent_60%)] opacity-80" />
    <div className="relative flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[0.65rem] uppercase tracking-[0.45em] text-sky-200/80">{title}</span>
          <span className="text-[11px] font-medium text-sky-200/60">Tableau de bord</span>
        </div>
        {Icon ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-200 shadow-[0_10px_25px_rgba(34,197,235,0.25)]">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-semibold tracking-tight text-sky-100 sm:text-[1.75rem]">{value}</p>
        <span className="text-[10px] uppercase tracking-[0.4em] text-[#6bffb6]">Live</span>
      </div>
      {helperText ? (
        <p className="text-xs leading-relaxed text-sky-200/70">
          {helperText}
        </p>
      ) : null}
    </div>
  </div>
);

const formatStatValue = (value: number, loading: boolean) => (loading ? "--" : value.toLocaleString("fr-FR"));

const formatRelativeTimeLabel = (ms?: number) => {
  if (typeof ms !== "number" || Number.isNaN(ms)) {
    return "--";
  }
  const diff = Date.now() - ms;
  if (diff < 0) return "dans le futur";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "à l'instant";
  if (diff < hour) {
    const mins = Math.round(diff / minute);
    return `il y a ${mins} min`;
  }
  if (diff < day) {
    const hours = Math.round(diff / hour);
    return `il y a ${hours} h`;
  }
  const days = Math.round(diff / day);
  if (days < 30) {
    return `il y a ${days} j`;
  }
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDateLabel = (ms?: number) => {
  if (typeof ms !== "number" || Number.isNaN(ms)) {
    return "--";
  }
  return new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user: authUser } = useAuth();

  const functions = React.useMemo(() => {
    const instance = getFunctions(undefined, "europe-west9");
    if (typeof window !== "undefined") {
      try {
        if (localStorage.getItem("functions:mode") === "local") {
          connectFunctionsEmulator(instance, "127.0.0.1", 5001);
        }
      } catch (error) {
        // ignore and keep remote configuration
      }
    }
    return instance;
  }, []);

  const [activeSection, setActiveSection] = React.useState<string>("dashboard");
  const [sidebarOpen, setSidebarOpen] = React.useState<boolean>(true);
  type StatsSnapshot = {
    totalUsers: number;
    activeUsers: number;
    disabledUsers?: number;
    updatedAt?: string;
    windowHours?: number;
  };

  const [firestoreStats, setFirestoreStats] = React.useState<StatsSnapshot>({
    totalUsers: 0,
    activeUsers: 0,
    disabledUsers: 0,
  });
  const [authStats, setAuthStats] = React.useState<StatsSnapshot | null>(null);
  const [authStatsLoading, setAuthStatsLoading] = React.useState<boolean>(false);
  const [authStatsError, setAuthStatsError] = React.useState<string | null>(null);
  const [authStatsNonce, setAuthStatsNonce] = React.useState<number>(0);
  const [statsLoading, setStatsLoading] = React.useState<boolean>(true);
  const [statsError, setStatsError] = React.useState<string | null>(null);
  const [userRows, setUserRows] = React.useState<AdminUserRow[]>([]);
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
  const [disableLoading, setDisableLoading] = React.useState<boolean>(false);
  const [disableFeedback, setDisableFeedback] = React.useState<CreateUserFeedback | null>(null);
  // Role assignment state
  const [showAssignRoleModal, setShowAssignRoleModal] = React.useState<boolean>(false);
  const [assignRoleLoading, setAssignRoleLoading] = React.useState<boolean>(false);
  const [assignRoleFeedback, setAssignRoleFeedback] = React.useState<CreateUserFeedback | null>(null);
  const allowedRoles = React.useMemo(() => ([
    "TA C+ FR",
    "TA C+ CIV",
    "TA LEADS FR",
    "TA LEADS CIV",
    "SUPERVISEUR C+ FR",
    "SUPERVISEUR C+ CIV",
    "SUPERVISEUR LEADS FR",
    "SUPERVISEUR LEADS CIV",
    "DIRECTION",
    "ADMINISTRATEUR",
  ]), []);
  // Only specific admins can assign roles (frontend guard)
  const roleAdmins = React.useMemo(() => ([
    "i.brai@mars-marketing.fr",
    "i.boultame@mars-marketing.fr",
  ]), []);
  const canAssignRoles = React.useMemo(() => {
    const email = authUser?.email?.toLowerCase() || "";
    return roleAdmins.includes(email);
  }, [authUser?.email, roleAdmins]);
  // Admin Heures state
  const [hoursPeriod, setHoursPeriod] = React.useState<string>(() => new Date().toISOString().slice(0,7));
  const [hoursEntries, setHoursEntries] = React.useState<HoursEntryDoc[]>([]);
  const [hoursLoading, setHoursLoading] = React.useState<boolean>(false);
  const [hoursError, setHoursError] = React.useState<string | null>(null);

  const [showCreateUserModal, setShowCreateUserModal] = React.useState<boolean>(false);
  const [newUserForm, setNewUserForm] = React.useState<NewUserForm>(() => createEmptyNewUserForm());
  const [createUserLoading, setCreateUserLoading] = React.useState<boolean>(false);
  const [createUserFeedback, setCreateUserFeedback] = React.useState<CreateUserFeedback | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = React.useState<boolean>(false);

  const requestAuthStatsRefresh = React.useCallback(() => {
    setAuthStatsNonce((prev) => prev + 1);
  }, []);
  const [expandedNav, setExpandedNav] = React.useState<Record<string, boolean>>({});
  const [canalStats, setCanalStats] = React.useState({ fr: 0, civ: 0, total: 0, loading: true });
  const [canalError, setCanalError] = React.useState<string | null>(null);
  // Monthly view selectors and derived data
  const [canalMonth, setCanalMonth] = React.useState<string>(() => new Date().toISOString().slice(0,7));
  const [canalRegionView, setCanalRegionView] = React.useState<'FR' | 'CIV'>(() => {
    try { return localStorage.getItem('admin:canalRegion') === 'CIV' ? 'CIV' : 'FR'; } catch { return 'FR'; }
  });
  const [canalMonthlySales, setCanalMonthlySales] = React.useState<CanalMonthlySale[]>([]);
  const [canalCampaignTotals, setCanalCampaignTotals] = React.useState<{ [k: string]: number }>({ '210': 0, '211': 0, '216': 0, '214': 0 });
  const [canalObjectiveRows, setCanalObjectiveRows] = React.useState<Array<{ agent: string; ventes: number; objectif: number; pct: number }>>([]);
  const [productionDaysInfo, setProductionDaysInfo] = React.useState<{ elapsed: number; total: number }>({ elapsed: 0, total: 0 });
  // Tri du tableau Objectifs
  type SortKey = 'agent' | 'ventes' | 'objectif' | 'pct';
  const [sortKey, setSortKey] = React.useState<SortKey>('ventes');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        // alterne asc/desc si même colonne
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      // nouvelle colonne -> défaut desc (sauf agent -> asc)
      setSortDir(key === 'agent' ? 'asc' : 'desc');
      return key;
    });
  };
  const objectiveDisplayRows = React.useMemo(() => {
    const rows = [...canalObjectiveRows];
    rows.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'agent') return dir * a.agent.localeCompare(b.agent, 'fr', { sensitivity: 'base' });
      if (sortKey === 'ventes') return dir * (a.ventes - b.ventes);
      if (sortKey === 'objectif') return dir * (a.objectif - b.objectif);
      return dir * (a.pct - b.pct);
    });
    return rows;
  }, [canalObjectiveRows, sortKey, sortDir]);
  const topObjectiveCount = React.useMemo(() => {
    return canalObjectiveRows.reduce((m, r) => (r.ventes > m ? r.ventes : m), 0);
  }, [canalObjectiveRows]);
  const [selectedAgent, setSelectedAgent] = React.useState<string | null>(null);
  const selectedAgentDetails = React.useMemo(() => {
    if (!selectedAgent) return null;
    const filtered = canalMonthlySales.filter(
      (s) => s.region === canalRegionView && s.seller === selectedAgent
    );
    const counts: { [k: string]: number } = { '210': 0, '211': 0, '216': 0, '214': 0 };
    filtered.forEach((s) => {
      const c = normalizeCampaignCode(s.campaign);
      if (c && counts[c] !== undefined) counts[c] += 1;
    });
    const total = filtered.length;
    const recent = filtered.slice().sort((a, b) => b.dateMs - a.dateMs).slice(0, 10);
    return { counts, total, recent };
  }, [selectedAgent, canalMonthlySales, canalRegionView]);
  const [canalTodaySales, setCanalTodaySales] = React.useState<Array<{
    id?: string;
    dateMs: number;
    seller: string;
    region: 'FR' | 'CIV' | 'OTHER';
    offer?: string;
    status: string;
    orderNumber?: string;
  }>>([]);
  const [canalKpis, setCanalKpis] = React.useState({
    total: 0,
    validated: 0,
    conversion: 0,
    pending: 0,
    pending2h: 0,
    iban: 0,
    roac: 0,
    topSellerName: '—' as string,
    topSellerCount: 0,
  });
  // LEADS reports state
  const [leadsStats, setLeadsStats] = React.useState({ fr: 0, civ: 0, total: 0, loading: true });
  const [leadsError, setLeadsError] = React.useState<string | null>(null);
  
  // Persist region choice
  React.useEffect(() => {
    try { localStorage.setItem('admin:canalRegion', canalRegionView); } catch {}
  }, [canalRegionView]);

  // Monthly CANAL+ fetcher (fills canalMonthlySales and monthly FR/CIV/Total)
  React.useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    if (!isAuthenticated) {
      setCanalMonthlySales([]);
      setCanalStats({ fr: 0, civ: 0, total: 0, loading: false });
      return () => {};
    }
    setCanalStats((p)=>({ ...p, loading: true }));

    const { start, end } = getMonthBounds(canalMonth);
    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);

    const sanitize = (value: string) =>
      value.trim().toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
    const normalizeLower = (value: unknown) =>
      String(value || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim();
    const isValidated = (raw: any): boolean => {
      const s = normalizeLower(
        raw?.basketStatus ?? raw?.basketStatut ?? raw?.status ?? raw?.statut ?? raw?.orderStatus ?? raw?.commandeStatus ?? raw?.etat
      );
      if (!s) return false;
      if (/\bok\b/.test(s)) return true;
      if (/\bvalid\s*soft\b/.test(s)) return true;
      if (/\bvalid(e|ee)?\s*finale?\b/.test(s)) return true;
      if (/\bvalid(e|ee)?\b/.test(s)) return true;
      return false;
    };
    const normalizeRegion = (input: unknown): 'FR'|'CIV'|'OTHER' => {
      if (typeof input !== 'string') return 'OTHER';
      const v = sanitize(input);
      if (!v) return 'OTHER';
      if (v === 'CIV' || v === 'CI' || v.includes('ABIDJAN') || v.includes('COTEDIVOIRE')) return 'CIV';
      if (v === 'FR' || v === 'FRANCE' || v.includes('MARSEILLE')) return 'FR';
      return 'OTHER';
    };

    const compute = (docs: Array<{ id?: string; data: ()=>any }>) => {
      let fr = 0, civ = 0; const rows: CanalMonthlySale[] = [];
      docs.forEach(d => {
        const data = d.data();
        const ms = readTimestampMs(data, ['date','createdAt','created_at','timestamp','time','validatedAt']);
        if (typeof ms !== 'number' || ms < start.getTime() || ms >= end.getTime()) return;
        if (!isValidated(data)) return;
        const region = [data?.region, data?.site, data?.site?.region, data?.zone, data?.location]
          .map(normalizeRegion).find(r => r !== 'OTHER') || 'OTHER';
        if (region === 'FR') fr++; else if (region === 'CIV') civ++;
        const sellerId = typeof data?.userId === 'string'
          ? data.userId : (typeof data?.createdBy?.userId === 'string' ? data.createdBy.userId : null);
        const seller = String(
          data?.name || data?.userName || data?.agent || data?.createdBy?.displayName || data?.createdBy?.email || '—'
        );
        rows.push({ id: (d as any).id, dateMs: ms, region, seller, sellerId, campaign: data?.campaign ?? data?.project ?? null });
      });
      setCanalStats({ fr, civ, total: rows.length, loading: false });
      setCanalMonthlySales(rows);
    };

    const salesColl = collection(db, 'sales');
    (async () => {
      try {
        try {
          const qMonth = query(salesColl, where('date','>=',startTs), where('date','<', endTs));
          const snap = await getDocs(qMonth);
          compute(snap.docs as any);
        } catch {
          try {
            const qLower = query(salesColl, where('date','>=', startTs));
            const snap = await getDocs(qLower);
            compute(snap.docs as any);
          } catch {
            const snap = await getDocs(salesColl);
            compute(snap.docs as any);
          }
        }
        try {
          const qLive = query(salesColl, where('date','>=', startTs));
          unsubscribe = onSnapshot(qLive, (snap) => compute(snap.docs as any));
        } catch {}
      } catch {
        setCanalStats((p)=>({ ...p, loading: false }));
      }
    })();
    return () => { try { unsubscribe && unsubscribe(); } catch {} };
  }, [isAuthenticated, canalMonth]);
    // Derive campaign totals and objectives from monthly sales
    React.useEffect(() => {
      const { start, end } = getMonthBounds(canalMonth);
      const totalDays = countBusinessDays(start, end);
      const today = new Date(); today.setHours(0,0,0,0);
      const elapsedDays = countBusinessDays(start, today < end ? today : end);
      setProductionDaysInfo({ elapsed: elapsedDays, total: totalDays });
      // campaign totals for selected region
      const filtered = canalMonthlySales.filter(s => s.region === canalRegionView);
      const totals: { [k: string]: number } = { '210': 0, '211': 0, '216': 0, '214': 0 };
      filtered.forEach(s => {
        const code = normalizeCampaignCode(s.campaign);
        if (code && totals[code] !== undefined) totals[code] += 1;
      });
      setCanalCampaignTotals(totals);
      // per-agent rows
      const perAgent = new Map<string, number>();
      filtered.forEach(s => {
        perAgent.set(s.seller, (perAgent.get(s.seller) || 0) + 1);
      });
      const dailyTarget = 1; // default target per business day
      const rows: Array<{ agent: string; ventes: number; objectif: number; pct: number }> = [];
      perAgent.forEach((ventes, agent) => {
        const objectif = dailyTarget * totalDays;
        const pct = objectif > 0 ? Math.round((ventes / objectif) * 100) : 0;
        rows.push({ agent, ventes, objectif, pct });
      });
      rows.sort((a,b)=> b.ventes - a.ventes);
      setCanalObjectiveRows(rows);
    }, [canalMonthlySales, canalMonth, canalRegionView]);
  const [leadsTodayRows, setLeadsTodayRows] = React.useState<Array<{
    id?: string;
    dateMs: number;
    seller: string;
    region: 'FR'|'CIV'|'OTHER';
    typeOffre?: string | null;
    intituleOffre?: string | null;
    numeroId?: string | null;
    referencePanier?: string | null;
  }>>([]);

  React.useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      if (!isAuthenticated) {
        setAuthStats(null);
        setAuthStatsError("Authentification requise pour récupérer les statistiques globales.");
        setAuthStatsLoading(false);
        return;
      }

      setAuthStatsLoading(true);
      setAuthStatsError(null);

      try {
        const callable = httpsCallable(functions, "getAdminUserStats");
        const response = await callable({});
        const payload: any = response?.data || {};

        if (cancelled) {
          return;
        }

        if (payload?.success) {
          setAuthStats({
            totalUsers: typeof payload.totalUsers === "number" ? payload.totalUsers : 0,
            activeUsers: typeof payload.activeUsers === "number" ? payload.activeUsers : 0,
            disabledUsers: typeof payload.disabledUsers === "number" ? payload.disabledUsers : undefined,
            updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : undefined,
            windowHours: typeof payload.windowHours === "number" ? payload.windowHours : undefined,
          });
        } else {
          setAuthStatsError(
            typeof payload?.message === "string"
              ? payload.message
              : "Impossible de récupérer les statistiques globales."
          );
        }
      } catch (err: any) {
        if (cancelled) {
          return;
        }
        const code = err?.code || err?.details?.rawCode;
        const defaultMessage = "Impossible de récupérer les statistiques globales.";
        if (code === "unauthenticated") {
          setAuthStatsError("Authentifie-toi à Firebase pour consulter ces chiffres.");
        } else if (code === "permission-denied") {
          setAuthStatsError("Ton compte ne dispose pas des autorisations admin pour voir ces chiffres.");
        } else {
          setAuthStatsError(typeof err?.message === "string" ? err.message : defaultMessage);
        }
      } finally {
        if (!cancelled) {
          setAuthStatsLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, [functions, isAuthenticated, authStatsNonce]);

  React.useEffect(() => {
    const parentWithChild = navItems.find((item) => item.children?.some((child) => child.id === activeSection));
    if (parentWithChild && !expandedNav[parentWithChild.id]) {
      setExpandedNav((prev) => ({ ...prev, [parentWithChild.id]: true }));
    }
  }, [activeSection, expandedNav]);

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
    let unsubscribe: (() => void) | null = null;

    const usersRef = collection(db, "users");

    const processSnapshot = (snapshot: QuerySnapshot<DocumentData>) => {
      if (!isMounted) return;

      let active = 0;
      let disabledCount = 0;
      const rows: AdminUserRow[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const email = typeof data.email === "string" ? data.email : "";
        const companyName = typeof data.companyName === "string" ? data.companyName.trim() : undefined;
        const disabledFlag = data?.disabled === true;
        if (disabledFlag) {
          disabledCount += 1;
        }
        const displayName = (() => {
          if (typeof data.displayName === "string" && data.displayName.trim().length > 0) {
            return data.displayName.trim();
          }
          const first = typeof data.firstName === "string" ? data.firstName.trim() : "";
          const last = typeof data.lastName === "string" ? data.lastName.trim() : "";
          const full = [first, last].filter(Boolean).join(" ");
          if (full) return full;
          return email || docSnap.id;
        })();

        const lastActiveMs = readTimestampMs(data, [
          "lastActive",
          "lastActivity",
          "lastLogin",
          "lastSeenAt",
          "updatedAt",
        ]);
        const createdAtMs = readTimestampMs(data, [
          "createdAt",
          "created_at",
          "created",
          "createdMs",
        ]);

        const isActive = !disabledFlag && isUserConsideredActive(data);
        if (isActive) {
          active += 1;
        }

        let role: string | undefined;
        if (typeof data.role === "string") {
          role = data.role;
        } else if (Array.isArray(data.roles)) {
          role = data.roles.join(", ");
        }

        return {
          id: docSnap.id,
          displayName,
          email,
          companyName,
          role,
          status: disabledFlag ? "disabled" : isActive ? "active" : "inactive",
          lastActiveMs,
          createdAtMs,
          disabled: disabledFlag,
        };
      });

      const sortedRows = rows.sort((a, b) => {
        if (a.status !== b.status) {
          if (a.status === "disabled") return 1;
          if (b.status === "disabled") return -1;
          return a.status === "active" ? -1 : 1;
        }
        return a.displayName.localeCompare(b.displayName, "fr", { sensitivity: "base" });
      });

      const total = sortedRows.length;
      setFirestoreStats({ totalUsers: total, activeUsers: active, disabledUsers: disabledCount });
      setUserRows(sortedRows);
      setSelectedUserIds((prev) =>
        prev.filter((id) => sortedRows.some((row) => row.id === id && row.status !== "disabled"))
      );
      setStatsError(null);
      setStatsLoading(false);
    };

    const handleError = (err: any) => {
      if (!isMounted) return;
      console.error("Failed to subscribe to admin user stats", err);
      if (err && (err.code === "permission-denied" || err.code === "unauthenticated")) {
        setStatsError(
          "Accès refusé par les règles Firestore (permission-denied). Vérifiez vos rôles/claims ou connectez-vous avec un compte admin."
        );
      } else {
        setStatsError("Impossible de récupérer les statistiques utilisateurs.");
      }
      setStatsLoading(false);
      setUserRows([]);
    };

    const attachListeners = async () => {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const initialSnapshot = await getDocs(usersRef);
        if (!isMounted) {
          return;
        }
        processSnapshot(initialSnapshot);
        unsubscribe = onSnapshot(usersRef, processSnapshot, handleError);
      } catch (err) {
        handleError(err);
      } finally {
        if (isMounted) {
          setStatsLoading(false);
        }
      }
    };

    if (!isAuthenticated) {
      const localAdmin = localStorage.getItem("adminAuth") === "1";
      if (localAdmin) {
        setStatsError(
          "Mode admin local activé — connexion Firebase requise pour récupérer les statistiques en direct."
        );
      } else {
        setStatsError("Accès refusé : authentification requise pour afficher ces statistiques.");
      }
      setStatsLoading(false);
      setUserRows([]);
      return () => {
        isMounted = false;
      };
    }

    attachListeners();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
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

  // Fallback: si l'admin est connecté via Firebase, pinger sa présence depuis le dashboard
  React.useEffect(() => {
    if (!isAuthenticated || !authUser) return;
    const ref = doc(db, 'users', authUser.id);
    const send = async () => {
      try {
        await setDoc(ref, {
          lastActive: serverTimestamp(),
          lastPing: Date.now(),
          isOnline: true,
          email: authUser.email || undefined,
          displayName: authUser.displayName || undefined,
        }, { merge: true });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[admin-presence] write failed', e);
      }
    };
    send();
    const id = setInterval(send, 2 * 60 * 1000);
    return () => { try { clearInterval(id); } catch {} };
  }, [isAuthenticated, authUser]);

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

      const { firstName, lastName, companyName, email, password, confirmPassword } = newUserForm;
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
          body: JSON.stringify({ firstName, lastName, companyName: companyName || undefined, email, password }),
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
        requestAuthStatsRefresh();
      } catch (err: any) {
        // Network or unexpected error
        setCreateUserFeedback({ type: "error", message: mapRegisterUserError(undefined, err?.message) });
      } finally {
        setCreateUserLoading(false);
      }
    },
    [isAuthenticated, newUserForm, registerUserEndpoint, requestAuthStatsRefresh]
  );

  const handleToggleUserSelection = React.useCallback(
    (userId: string) => {
      setSelectedUserIds((prev) => {
        const target = userRows.find((row) => row.id === userId && row.status !== "disabled");
        if (!target) {
          return prev.filter((id) => id !== userId);
        }
        if (prev.includes(userId)) {
          return prev.filter((id) => id !== userId);
        }
        return [...prev, userId];
      });
    },
    [userRows]
  );

  const handleToggleAllUsers = React.useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedUserIds([]);
        return;
      }
      const selectable = userRows.filter((row) => row.status !== "disabled").map((row) => row.id);
      setSelectedUserIds(selectable);
    },
    [userRows]
  );

  const confirmDisableUsers = React.useCallback(async () => {
    if (!isAuthenticated || selectedUserIds.length === 0) {
      setDisableFeedback({ type: "error", message: "Sélectionne au moins un utilisateur." });
      return;
    }

    setDisableLoading(true);
    setDisableFeedback(null);
    setShowRevokeConfirm(false);

    try {
      const callable = httpsCallable(functions, "disableUsersCallable");
      const response = await callable({ userIds: selectedUserIds });
      const payload: any = response?.data || {};

      if (!payload?.success) {
        const message =
          typeof payload?.message === "string"
            ? payload.message
            : typeof payload?.error === "string"
            ? payload.error
            : "Impossible de révoquer l'accès pour les utilisateurs sélectionnés.";
        setDisableFeedback({ type: "error", message });
        return;
      }

      const disabledCount = payload?.disabled ?? selectedUserIds.length;
      const notFoundCount = Array.isArray(payload?.notFound) ? payload.notFound.length : 0;
      const failedCount = Array.isArray(payload?.failed) ? payload.failed.length : 0;

      const extraMessages: string[] = [];
      if (notFoundCount > 0) {
        extraMessages.push(`${notFoundCount} utilisateur(s) introuvable(s) dans Auth.`);
      }
      if (failedCount > 0) {
        extraMessages.push(`${failedCount} échec(s) supplémentaire(s).`);
      }

      setDisableFeedback({
        type: "success",
        message: [`Accès révoqué pour ${disabledCount} utilisateur(s).`, ...extraMessages].join(" "),
      });
      setSelectedUserIds([]);
      requestAuthStatsRefresh();
    } catch (err: any) {
      const message =
        typeof err?.message === "string"
          ? err.message
          : "Erreur réseau lors de la tentative de révocation des accès.";
      setDisableFeedback({
        type: "error",
        message,
      });
    } finally {
      setDisableLoading(false);
    }
  }, [functions, isAuthenticated, selectedUserIds, requestAuthStatsRefresh]);

  const handleDisableClick = React.useCallback(() => {
    if (selectedUserIds.length === 0) {
      setDisableFeedback({ type: "error", message: "Sélectionne au moins un utilisateur." });
      return;
    }
    setShowRevokeConfirm(true);
  }, [selectedUserIds]);

  React.useEffect(() => {
    let unsubscribeFallbackAll: (() => void) | null = null;

    if (!isAuthenticated) {
      setCanalStats({ fr: 0, civ: 0, total: 0, loading: false });
      setCanalError("Authentification requise pour consulter les rapports CANAL+.");
      return () => {};
    }

    setCanalStats((prev) => ({ ...prev, loading: true }));
    setCanalError(null);

    const sanitize = (value: string) =>
      value
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^A-Z0-9]/g, "");

    const normalizeLower = (value: unknown) =>
      String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim();

    const isValidated = (raw: any): boolean => {
      const s = normalizeLower(
        raw?.basketStatus ?? raw?.basketStatut ?? raw?.status ?? raw?.statut ?? raw?.orderStatus ?? raw?.commandeStatus ?? raw?.etat
      );
      if (!s) return false;
      // OK (strict word), Valid Soft, Valid Finale, Validé/Valid (avoid matching 'invalid')
      if (/\bok\b/.test(s)) return true;
      if (/\bvalid\s*soft\b/.test(s)) return true;
      if (/\bvalid(e|ee)?\s*finale?\b/.test(s)) return true;
      if (/\bvalid(e|ee)?\b/.test(s)) return true;
      return false;
    };

    const classifyStatus = (raw: any): 'Validé' | 'En attente' | 'ROAC' | 'IBAN' | 'Autre' => {
      const s = normalizeLower(
        raw?.basketStatus ?? raw?.basketStatut ?? raw?.status ?? raw?.statut ?? raw?.orderStatus ?? raw?.commandeStatus ?? raw?.etat
      );
      if (!s) return 'Autre';
      if (/iban|rib/.test(s)) return 'IBAN';
      if (/roac/.test(s)) return 'ROAC';
      if (isValidated(raw)) return 'Validé';
      if (/attente|pending|awaiting|on\s*hold|hold|pause|paused|en\s*pause|en\s*att|en\s*cours|saisie|traitement|traite|wait|draft|validation|valider|a\s*valider|verif|verifier|v[ée]rification|controle|control|a\s*traiter|à\s*traiter|a\s*verifier|à\s*verifier|incomplet|incomplete|missing|process|processing/.test(s)) return 'En attente';
      return 'Autre';
    };

    const normalizeRegion = (input: unknown): "FR" | "CIV" | "OTHER" => {
      if (typeof input !== "string") return "OTHER";
      const normalized = sanitize(input);
      if (!normalized) return "OTHER";

      const isFr = (val: string) =>
        val === "FR" ||
        val === "FRANCE" ||
        val === "MARSEILLE" ||
        val.includes("MARSEILLE") ||
        val.startsWith("FR");

      const isCiv = (val: string) =>
        val === "CIV" ||
        val === "CI" ||
        val === "COTEDIVOIRE" ||
        val === "ABIDJAN" ||
        val.includes("ABIDJAN") ||
        val.includes("COTEDIVOIRE") ||
        val.startsWith("CIV") ||
        val.startsWith("CI");

      if (isFr(normalized)) return "FR";
      if (isCiv(normalized)) return "CIV";
      return "OTHER";
    };

    // Today bounds (local time)
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate()+1);
    const startMs = todayStart.getTime();
    const endMs = tomorrowStart.getTime();

    const computeStats = (docs: Array<{ id?: string; data: () => any }>) => {
      let fr = 0;
      let civ = 0;
      const rows: Array<{ id?: string; dateMs: number; seller: string; region: 'FR'|'CIV'|'OTHER'; offer?: string; status: string; orderNumber?: string; }> = [];
      let totalDocs = 0;
      let validatedCount = 0;
      let pendingCount = 0;
      let pending2h = 0;
      let ibanCount = 0;
      let roacCount = 0;
      const sellerMap = new Map<string, number>();
      const now = Date.now();

      const statusCategory = (raw: any): string => {
        const s = normalizeLower(
          raw?.basketStatus ?? raw?.basketStatut ?? raw?.status ?? raw?.statut ?? raw?.orderStatus ?? raw?.commandeStatus ?? raw?.etat
        );
        if (!s) return '';
        if (/\bvalid\s*soft\b/.test(s)) return 'Valid Soft';
        if (/\bvalid(e|ee)?\s*finale?\b/.test(s)) return 'Valid Finale';
        if (/\bok\b/.test(s) || /\bvalid(e|ee)?\b/.test(s)) return 'Validé';
        return s;
      };

      docs.forEach((doc) => {
        const data = doc.data() as any;
        // Keep only today's sales based on several possible date fields
        const dms = readTimestampMs(data, [
          'date','createdAt','created_at','timestamp','time','created','submittedAt','validatedAt'
        ]);
        if (typeof dms !== 'number' || !(dms >= startMs && dms < endMs)) return;
        totalDocs += 1;
        const candidates: Array<unknown> = [
          data?.region,
          data?.region?.name,
          data?.region?.code,
          data?.site,
          data?.site?.name,
          data?.site?.region,
          data?.zone,
          data?.zone?.name,
          data?.location,
        ];
        const region = candidates
          .map((value) => normalizeRegion(value))
          .find((value) => value !== "OTHER") ?? "OTHER";
        const cat = classifyStatus(data);
        if (cat === 'IBAN') ibanCount += 1;
        if (cat === 'ROAC') roacCount += 1;
        if (cat === 'En attente') {
          pendingCount += 1;
          if (now - dms > 2 * 60 * 60 * 1000) pending2h += 1;
        }
        if (isValidated(data)) {
          validatedCount += 1;
          if (region === "FR") fr += 1;
          else if (region === "CIV") civ += 1;
          // Build a lightweight row for live table (validated only)
          const seller = String(
            data?.name || data?.userName || data?.agent || data?.createdBy?.displayName || data?.createdBy?.email || '—'
          );
          sellerMap.set(seller, (sellerMap.get(seller) || 0) + 1);
          rows.push({
            id: (doc as any).id,
            dateMs: dms,
            seller,
            region,
            offer: data?.offer || data?.offre,
            orderNumber: data?.orderNumber,
            status: statusCategory(data),
          });
        }
      });
      setCanalStats({ fr, civ, total: rows.length, loading: false });
      const top = Array.from(sellerMap.entries()).sort((a,b)=> b[1]-a[1])[0];
      const conversion = totalDocs > 0 ? (validatedCount / totalDocs) * 100 : 0;
      setCanalKpis({
        total: totalDocs,
        validated: validatedCount,
        conversion,
        pending: pendingCount,
        pending2h,
        iban: ibanCount,
        roac: roacCount,
        topSellerName: top ? top[0] : '—',
        topSellerCount: top ? top[1] : 0,
      });
      // Keep latest 30 by time desc
      rows.sort((a,b) => b.dateMs - a.dateMs);
      setCanalTodaySales(rows.slice(0, 30));
    };

    const fallbackFetch = async () => {
      try {
        const salesColl = collection(db, "sales");
        let backupSnap;
        try {
          const qDay = query(
            salesColl,
            where('date', '>=', Timestamp.fromDate(todayStart)),
            where('date', '<', Timestamp.fromDate(tomorrowStart))
          );
          backupSnap = await getDocs(qDay);
        } catch (e) {
          // If index missing, fallback to single bound or full collection
          try {
            const qLower = query(salesColl, where('date', '>=', Timestamp.fromDate(todayStart)));
            backupSnap = await getDocs(qLower);
          } catch {
            backupSnap = await getDocs(salesColl);
          }
        }
        // Pass all docs and compute day filters + segmentation client-side
        computeStats(backupSnap.docs as any);
        // Attach a live listener on all sales, and filter client-side by CANAL mission
        try {
          const qLive = query(salesColl, where('date', '>=', Timestamp.fromDate(todayStart)));
          unsubscribeFallbackAll = onSnapshot(
            qLive,
            (snap) => {
              // Pass all docs; computeStats will apply validated+date+region filters
              const debug = (() => { try { return localStorage.getItem('DEBUG_CANAL') === '1'; } catch { return false; } })();
              if (debug) {
                // eslint-disable-next-line no-console
                console.info('[canal-stats] live snapshot', { size: snap.size });
                const first = snap.docs[0]?.data?.();
                if (first) {
                  // eslint-disable-next-line no-console
                  console.info('[canal-stats] sample doc keys', Object.keys(first));
                }
              }
              computeStats(snap.docs as unknown as Array<{ data: () => any }>);
            },
            (err) => {
              // eslint-disable-next-line no-console
              console.warn("[canal-stats] fallback live listener error", err);
            }
          );
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[canal-stats] unable to attach fallback live listener", e);
        }
      } catch (err: any) {
        setCanalStats((prev) => ({ ...prev, loading: false }));
        setCanalError(err?.message || "Impossible de charger les ventes CANAL+.");
      }
    };

    // Always use the robust daily listener and filter by mission containing CANAL
    fallbackFetch();

    return () => {
      try { if (typeof unsubscribeFallbackAll === 'function') { unsubscribeFallbackAll(); } } catch (e) { /* noop */ }
    };
  }, [isAuthenticated]);

  // Reports: LEADS (today, mission ORANGE_LEADS)
  React.useEffect(() => {
    let unsubscribeAll: (() => void) | null = null;
    if (!isAuthenticated) {
      setLeadsStats({ fr: 0, civ: 0, total: 0, loading: false });
      setLeadsError('Authentification requise pour consulter les rapports LEADS.');
      return () => {};
    }

    setLeadsStats((p)=>({ ...p, loading: true }));
    setLeadsError(null);

    const sanitize = (value: string) =>
      value.trim().toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^A-Z0-9]/g,'');
    const normalizeRegion = (input: unknown): 'FR'|'CIV'|'OTHER' => {
      if (typeof input !== 'string') return 'OTHER';
      const v = sanitize(input);
      if (v === 'CIV' || v === 'CI' || v.includes('ABIDJAN') || v.includes('COTEDIVOIRE')) return 'CIV';
      if (v === 'FR' || v === 'FRANCE' || v.includes('MARSEILLE')) return 'FR';
      return 'OTHER';
    };

    // Normalise le type d'offre LEADS
    const canonicalLeadType = (raw: string | null | undefined): string => {
      const s = String(raw || '').trim().toLowerCase().replace(/\s+/g,'');
      if (s === 'internet') return 'Internet';
      if (s === 'internetsosh') return 'Internet Sosh';
      if (s === 'mobile') return 'Mobile';
      if (s === 'mobilesosh') return 'Mobile Sosh';
      if (s.includes('internetsosh') && s.includes('mobilesosh')) return 'Internet Sosh';
      if (s.includes('internet') && s.includes('mobile')) return 'Internet';
      if (/internetsosh/.test(s)) return 'Internet Sosh';
      if (/mobilesosh/.test(s)) return 'Mobile Sosh';
      if (/internet/.test(s)) return 'Internet';
      if (/mobile/.test(s)) return 'Mobile';
      return String(raw || '');
    };

    // Today window
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(start.getDate()+1);
    const startMs = start.getTime(); const endMs = end.getTime();

    const compute = (docs: Array<{ id?: string; data: ()=>any }>) => {
      let fr = 0, civ = 0; const rows: Array<any> = [];
      docs.forEach(d => {
        const data = d.data();
        const dms = readTimestampMs(data, ['createdAt','created_at','date','timestamp']);
        if (typeof dms !== 'number' || dms < startMs || dms >= endMs) return;
        // Filtrer uniquement les Internet (exclure Mobile / Sosh)
        const typeCanon = canonicalLeadType(data?.typeOffre ?? data?.intituleOffre);
        if (typeCanon !== 'Internet') return;
        const candidates = [data?.region, data?.site, data?.site?.region, data?.zone, data?.location];
        const region = candidates.map(normalizeRegion).find(r => r !== 'OTHER') || 'OTHER';
        if (region === 'CIV') civ++; else fr++; // par défaut, compter OTHER côté FR (Marseille)
        const seller = String(
          data?.createdBy?.displayName || data?.createdBy?.email || data?.name || '—'
        );
        rows.push({
          id: (d as any).id,
          dateMs: dms,
          seller,
          region,
          typeOffre: typeCanon,
          intituleOffre: data?.intituleOffre ?? null,
          numeroId: data?.numeroId ?? null,
          referencePanier: data?.referencePanier ?? null,
        });
      });
      setLeadsStats({ fr, civ, total: rows.length, loading: false });
      rows.sort((a,b)=> b.dateMs - a.dateMs);
      setLeadsTodayRows(rows.slice(0,30));
    };

    const doFetch = async () => {
      try {
        const leadsColl = collection(db, 'leads_sales');
        // Prefer mission + date range; fallback to mission-only
        let snap;
        try {
          const q1 = query(
            leadsColl,
            where('mission','==','ORANGE_LEADS'),
            where('createdAt','>=', Timestamp.fromDate(start)),
            where('createdAt','<', Timestamp.fromDate(end))
          );
          snap = await getDocs(q1);
        } catch (e) {
          try {
            const q2 = query(leadsColl, where('mission','==','ORANGE_LEADS'));
            snap = await getDocs(q2);
          } catch {
            snap = await getDocs(leadsColl);
          }
        }
        compute(snap.docs as any);
        // Live listener on createdAt >= today (mission filtered if possible)
        try {
          const qLive = query(
            leadsColl,
            where('createdAt','>=', Timestamp.fromDate(start))
          );
          unsubscribeAll = onSnapshot(qLive, (s) => {
            const debug = (()=>{ try { return localStorage.getItem('DEBUG_LEADS')==='1'; } catch { return false; } })();
            if (debug) {
              // eslint-disable-next-line no-console
              console.info('[leads-stats] live snapshot', { size: s.size });
            }
            compute(s.docs as any);
          }, (err)=>{
            // eslint-disable-next-line no-console
            console.warn('[leads-stats] live error', err);
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[leads-stats] cannot attach live listener', e);
        }
      } catch (err: any) {
        setLeadsStats((p)=>({ ...p, loading:false }));
        setLeadsError(err?.message || 'Impossible de charger les ventes LEADS.');
      }
    };

    doFetch();
    return () => { try { unsubscribeAll && unsubscribeAll(); } catch { /* noop */ } };
  }, [isAuthenticated]);

  const displayStats = firestoreStats;
  const cardsLoading = statsLoading;
  const authTotals = authStats?.totalUsers;
  const authActiveUsers = authStats?.activeUsers;
  const statsUpdatedLabel = authStats?.updatedAt
    ? new Date(authStats.updatedAt).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const activityWindowHours = authStats?.windowHours ?? Math.round(ACTIVITY_WINDOW_MS / (1000 * 60 * 60));
  const totalFirestoreLabel = displayStats.totalUsers.toLocaleString("fr-FR");
  const disabledSuffix = displayStats.disabledUsers
    ? ` (dont ${displayStats.disabledUsers.toLocaleString("fr-FR")} désactivé${displayStats.disabledUsers > 1 ? 's' : ''})`
    : "";
  const authTotalsLabel = typeof authTotals === "number" ? authTotals.toLocaleString("fr-FR") : null;
  const totalHelperText = cardsLoading
    ? "Chargement en cours..."
    : authTotalsLabel
    ? statsUpdatedLabel
      ? `Firestore : ${totalFirestoreLabel}${disabledSuffix}. Auth mis à jour ${statsUpdatedLabel} (${authTotalsLabel}).`
      : `Firestore : ${totalFirestoreLabel}${disabledSuffix}. Auth : ${authTotalsLabel}.`
    : `Total Firestore : ${totalFirestoreLabel}${disabledSuffix}.`;
  // Préférer la mesure Auth pour refléter les connexions réelles (fallback Firestore)
  const activeValue = typeof authActiveUsers === 'number' ? authActiveUsers : displayStats.activeUsers;
  const activeHelperText = cardsLoading
    ? "Détection de l'activité..."
    : typeof authActiveUsers === 'number'
      ? (activityWindowHours <= 1
          ? `Actifs sur la dernière heure (Auth). Firestore estimé : ${displayStats.activeUsers.toLocaleString("fr-FR")}.`
          : `Actifs sur ${activityWindowHours}h (Auth). Firestore estimé : ${displayStats.activeUsers.toLocaleString("fr-FR")}.`)
      : "Utilisateurs actifs sur la dernière heure (Firestore).";

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#030b1d] via-[#02132b] to-[#010511] text-white">
      <button
        onClick={() => setSidebarOpen((prev) => !prev)}
        style={{ left: sidebarOpen ? (window.innerWidth >= 768 ? "17.5rem" : "16rem") : "1rem" }}
        className="fixed top-5 z-50 inline-flex items-center gap-2 rounded-xl border border-sky-500/30 bg-gradient-to-r from-[#0c1f3b] via-[#0a1830] to-[#051022] px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-[0_16px_38px_-22px_rgba(37,99,235,0.55)] transition hover:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
      >
        <span className="relative flex h-4 w-5 flex-col justify-between">
          <span className="h-[2px] w-full bg-sky-200"></span>
          <span className="h-[2px] w-full bg-sky-200"></span>
          <span className="h-[2px] w-full bg-sky-200"></span>
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
          className={`fixed inset-y-0 left-0 z-40 h-full w-64 transform border border-sky-500/15 bg-gradient-to-b from-[#06132a] via-[#051024] to-[#020817] backdrop-blur-xl shadow-[0_32px_70px_-45px_rgba(37,99,235,0.55)] transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="border-b border-white/10 px-6 py-8">
            <h2 className="text-xl font-semibold text-white">Cactus Console</h2>
          </div>
          <nav className="space-y-2 px-2 py-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const hasChildren = Array.isArray(item.children) && item.children.length > 0;
              const isActiveParent =
                activeSection === item.id || (hasChildren && item.children!.some((child) => child.id === activeSection));
              const isExpanded = !!expandedNav[item.id];

              return (
                <div key={item.id} className="space-y-1">
                  <button
                    onClick={() => {
                      if (hasChildren) {
                        setExpandedNav((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                        setActiveSection(item.id);
                      } else {
                        setActiveSection(item.id);
                      }
                    }}
                    className={`group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                      isActiveParent || isExpanded
                        ? "bg-gradient-to-r from-sky-500/25 via-blue-600/15 to-transparent text-white border border-sky-400/40"
                        : "text-sky-100/70 hover:bg-white/5"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {Icon && <Icon className="h-4 w-4 text-sky-300" aria-hidden="true" />}
                      <span>{item.label}</span>
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full transition ${
                        isActiveParent || isExpanded ? "bg-sky-400" : "bg-white/20"
                      }`}
                    />
                  </button>

                  {hasChildren && isExpanded ? (
                    <div className="space-y-1 pl-6">
                      {item.children!.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = activeSection === child.id;
                        return (
                          <button
                            key={child.id}
                            onClick={() => setActiveSection(child.id)}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition-all ${
                              childActive
                                ? "bg-sky-500/20 text-white border border-sky-400/40"
                                : "text-sky-100/60 hover:bg-white/5"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {ChildIcon && <ChildIcon className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />}
                              <span>{child.label}</span>
                            </span>
                            <span
                              className={`h-1.5 w-1.5 rounded-full transition ${
                                childActive ? "bg-sky-300" : "bg-white/15"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
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
              {authStatsError && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
                  {authStatsError}
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={Users}
                  title="Utilisateurs enregistrés"
                  value={formatStatValue(displayStats.totalUsers, cardsLoading)}
                  helperText={totalHelperText}
                />

                <StatCard
                  icon={UserCheck2}
                  title="Utilisateurs actifs"
                  value={formatStatValue(activeValue, cardsLoading)}
                  helperText={activeHelperText}
                />
              </div>
            </div>
          ) : activeSection === "reports-canal" ? (
            <div className="space-y-8 pt-16 md:pt-20">
              <div className="flex flex-col gap-2">
                <div className="flex items-end justify-between flex-wrap gap-3">
                  <div>
                    <h1 className="text-2xl font-semibold text-white">Rapports CANAL+</h1>
                    <p className="text-sm text-blue-100/70">Vue mensuelle (sélectionne le mois et le hub).</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
                      <button
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${canalRegionView==='FR' ? 'bg-sky-500/20 text-sky-100 border border-sky-500/40' : 'text-blue-100/70'}`}
                        onClick={() => setCanalRegionView('FR')}
                      >C+ FR</button>
                      <button
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${canalRegionView==='CIV' ? 'bg-sky-500/20 text-sky-100 border border-sky-500/40' : 'text-blue-100/70'}`}
                        onClick={() => setCanalRegionView('CIV')}
                      >C+ ABJ</button>
                    </div>
                    <input
                      type="month"
                      value={canalMonth}
                      onChange={(e)=> setCanalMonth(e.target.value)}
                      className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
              </div>

              {canalError && (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
                  {canalError}
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  icon={Tv}
                  title="Ventes CANAL+ Marseille"
                  value={formatStatValue(canalStats.fr, canalStats.loading)}
                  helperText={
                    canalStats.loading
                      ? "Chargement en cours..."
                      : " Mois — Marseille."}
                />
                <StatCard
                  icon={Tv}
                  title="Ventes CANAL+ Abidjan"
                  value={formatStatValue(canalStats.civ, canalStats.loading)}
                  helperText={
                    canalStats.loading
                      ? "Chargement en cours..."
                      : " Mois — Abidjan."}
                />
                <StatCard
                  icon={BarChart3}
                  title="Total CANAL+"
                  value={formatStatValue(canalStats.total, canalStats.loading)}
                  helperText={
                    canalStats.loading
                      ? "Chargement en cours..."
                      : " Mois — Marseille + Abidjan."}
                />
              </div>

              {/* Campagnes du mois */}
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={BarChart3} title="Campagne 210" value={canalCampaignTotals['210'].toLocaleString('fr-FR')} helperText={`Ventes validées — ${canalRegionView}`} />
                <StatCard icon={BarChart3} title="Campagne 211" value={canalCampaignTotals['211'].toLocaleString('fr-FR')} helperText={`Ventes validées — ${canalRegionView}`} />
                <StatCard icon={BarChart3} title="Campagne 216" value={canalCampaignTotals['216'].toLocaleString('fr-FR')} helperText={`Ventes validées — ${canalRegionView}`} />
                <StatCard icon={BarChart3} title="Campagne 214" value={canalCampaignTotals['214'].toLocaleString('fr-FR')} helperText={`Ventes validées — ${canalRegionView}`} />
              </div>

              {/* Tableau Objectifs mensuels */}
              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4">
                  <h3 className="text-sm font-semibold text-white">Ventes à l'objectif — {canalRegionView} — {new Date(canalMonth+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</h3>
                  <div className="flex items-center gap-2 text-xs text-blue-200/80">
                    <span className="hidden sm:inline">Jours prod</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-100">
                      {productionDaysInfo?.total ?? '-'}
                    </span>
                    <span className="text-blue-200/50">(écoulés&nbsp;: {productionDaysInfo?.elapsed ?? '-'})</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="max-h-[60vh] overflow-y-auto scroll-beauty">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-[#0b1632]/70 backdrop-blur-sm text-blue-100/80">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">
                            <button className="inline-flex items-center gap-1 hover:text-white/95" onClick={() => toggleSort('agent')}>
                              Agent
                              {sortKey !== 'agent' ? (
                                <ArrowUpDown className="h-3.5 w-3.5" />
                              ) : sortDir === 'asc' ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            <button className="inline-flex items-center gap-1 hover:text-white/95" onClick={() => toggleSort('ventes')}>
                              Ventes (mois)
                              {sortKey !== 'ventes' ? (
                                <ArrowUpDown className="h-3.5 w-3.5" />
                              ) : sortDir === 'asc' ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            <button className="inline-flex items-center gap-1 hover:text-white/95" onClick={() => toggleSort('objectif')}>
                              Objectif
                              {sortKey !== 'objectif' ? (
                                <ArrowUpDown className="h-3.5 w-3.5" />
                              ) : sortDir === 'asc' ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            <button className="inline-flex items-center gap-1 hover:text-white/95" onClick={() => toggleSort('pct')}>
                              % progression
                              {sortKey !== 'pct' ? (
                                <ArrowUpDown className="h-3.5 w-3.5" />
                              ) : sortDir === 'asc' ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {canalObjectiveRows.length === 0 ? (
                          <tr>
                            <td className="px-4 py-6 text-center text-blue-100/60" colSpan={4}>Aucune vente ce mois pour ce hub.</td>
                          </tr>
                        ) : (
                          objectiveDisplayRows.map((r, idx) => {
                            const initials = r.agent
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((p) => p.charAt(0).toUpperCase())
                              .join("") || "?";
                            const widthPct = Math.min(Math.max(r.pct, 0), 150); // clamp 0–150%
                            const barColor = r.pct >= 100
                              ? "from-fuchsia-500/70 to-violet-400/70"
                              : r.pct >= 50
                              ? "from-emerald-400/70 to-teal-400/70"
                              : "from-sky-400/70 to-blue-400/70";
                            const isTop = topObjectiveCount > 0 && r.ventes === topObjectiveCount;
                            return (
                              <tr
                                key={idx}
                                className="hover:bg-white/5 transition-colors animate-fade-in cursor-pointer focus:outline-none focus:bg-white/10"
                                style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}
                                onClick={() => setSelectedAgent(r.agent)}
                                onKeyDown={(e) => { if (e.key === 'Enter') setSelectedAgent(r.agent); }}
                                tabIndex={0}
                              >
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <div className="relative h-8 w-8 shrink-0 rounded-full border border-white/20 bg-gradient-to-br from-sky-500/30 to-blue-500/20 text-white/90 flex items-center justify-center text-[11px] font-semibold">
                                      {initials}
                                      <span className="absolute inset-0 rounded-full bg-white/5" />
                                    </div>
                                    <span className="font-medium text-white flex items-center gap-2">
                                      {r.agent}
                                      {isTop && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
                                          <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                                          Top
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-blue-100/90">{r.ventes.toLocaleString('fr-FR')}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-blue-100/80">{r.objectif.toLocaleString('fr-FR')}</td>
                                <td className="px-4 py-3">
                                  <div className="w-44 sm:w-56">
                                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                                      <div
                                        className={`relative h-full rounded-full bg-gradient-to-r ${barColor} shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_6px_14px_-6px_rgba(37,99,235,0.5)] transition-[width] duration-700 ease-out`}
                                        style={{ width: `${widthPct}%` }}
                                      >
                                        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
                                          <span className="absolute left-0 top-0 h-full w-1/3 -skew-x-12 bg-white/20 animate-shimmer-move" />
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-[11px] leading-none text-blue-200/80">
                                      <span>{r.pct}%</span>
                                      {(() => {
                                        if (r.pct >= 125) {
                                          return (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                                              <Trophy className="h-3 w-3" aria-hidden="true" />
                                              125%+
                                            </span>
                                          );
                                        }
                                        if (r.pct >= 100) {
                                          return (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/40 bg-fuchsia-400/10 px-1.5 py-0.5 text-[10px] text-fuchsia-200">
                                              <Award className="h-3 w-3" aria-hidden="true" />
                                              100%+
                                            </span>
                                          );
                                        }
                                        if (r.pct >= 90) {
                                          return (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
                                              90%+
                                            </span>
                                          );
                                        }
                                        if (r.pct >= 75) {
                                          return (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-teal-400/40 bg-teal-400/10 px-1.5 py-0.5 text-[10px] text-teal-200">
                                              75%+
                                            </span>
                                          );
                                        }
                                        if (r.pct >= 50) {
                                          return (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 text-[10px] text-sky-200">
                                              50%+
                                            </span>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              {selectedAgent && selectedAgentDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6" onClick={() => setSelectedAgent(null)}>
                  <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-[#071120] via-[#050b17] to-[#02050b] p-6 shadow-[0_35px_80px_-45px_rgba(37,99,235,0.6)]" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-lg font-semibold text-white">{selectedAgent}</h4>
                        <p className="text-xs text-blue-100/70">{canalRegionView} · {new Date(canalMonth+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</p>
                      </div>
                      <button aria-label="Fermer" className="rounded-lg border border-white/10 p-1.5 text-white/70 hover:bg-white/5" onClick={() => setSelectedAgent(null)}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(['210','211','216','214'] as const).map((c) => (
                        <div key={c} className="rounded-2xl border border-sky-500/15 bg-white/5 px-3 py-2 text-center">
                          <div className="text-[10px] uppercase tracking-[0.25em] text-blue-200/70">Campagne {c}</div>
                          <div className="mt-1 text-lg font-semibold text-white">{selectedAgentDetails.counts[c].toLocaleString('fr-FR')}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5">
                      <div className="flex items-center justify-between px-4 py-2">
                        <div className="text-sm font-medium text-white">Dernières ventes</div>
                        <div className="text-xs text-blue-200/80">Total mois: {selectedAgentDetails.total.toLocaleString('fr-FR')}</div>
                      </div>
                      <div className="max-h-60 overflow-y-auto scroll-beauty">
                        <table className="min-w-full text-sm">
                          <thead className="bg-white/5 text-blue-100/80">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold">Date</th>
                              <th className="px-4 py-2 text-left font-semibold">Région</th>
                              <th className="px-4 py-2 text-left font-semibold">Campagne</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10">
                            {selectedAgentDetails.recent.map((s, i) => (
                              <tr key={s.id || i} className="hover:bg-white/5">
                                <td className="px-4 py-2 whitespace-nowrap">{new Date(s.dateMs).toLocaleDateString('fr-FR',{ day:'2-digit', month:'short'})}</td>
                                <td className="px-4 py-2 whitespace-nowrap">{s.region}</td>
                                <td className="px-4 py-2 whitespace-nowrap">{normalizeCampaignCode(s.campaign) || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeSection === "reports-leads" ? (
            <div className="space-y-8 pt-16 md:pt-20">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold text-white">Rapports LEADS</h1>
                <p className="text-sm text-blue-100/70">Ventes LEADS (mission ORANGE_LEADS), cumulées en temps réel pour aujourd'hui.</p>
              </div>

              {leadsError && (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">{leadsError}</div>
              )}

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  icon={Tv}
                  title="Ventes LEADS Marseille"
                  value={formatStatValue(leadsStats.fr, leadsStats.loading)}
                  helperText={leadsStats.loading ? 'Chargement en cours...' : 'Internet uniquement — créés aujourd\'hui — Marseille (FR).'}
                />
                <StatCard
                  icon={Tv}
                  title="Ventes LEADS Abidjan"
                  value={formatStatValue(leadsStats.civ, leadsStats.loading)}
                  helperText={leadsStats.loading ? 'Chargement en cours...' : 'Internet uniquement — créés aujourd\'hui — Abidjan (CIV).'}
                />
                <StatCard
                  icon={BarChart3}
                  title="Total LEADS"
                  value={formatStatValue(leadsStats.total, leadsStats.loading)}
                  helperText={leadsStats.loading ? 'Chargement en cours...' : 'Internet uniquement — créés aujourd\'hui — Marseille + Abidjan.'}
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4">
                  <h3 className="text-sm font-semibold text-white">Leads créés aujourd'hui</h3>
                  <div className="text-xs text-blue-200/80">{leadsTodayRows.length} affiché(s)</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-white/5 text-blue-100/80">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Heure</th>
                        <th className="px-4 py-3 text-left font-semibold">Agent</th>
                        <th className="px-4 py-3 text-left font-semibold">Région</th>
                        <th className="px-4 py-3 text-left font-semibold">Type</th>
                        <th className="px-4 py-3 text-left font-semibold">Intitulé</th>
                        <th className="px-4 py-3 text-left font-semibold">N°</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {leadsTodayRows.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-center text-blue-100/60" colSpan={6}>Aucun lead créé aujourd'hui.</td>
                        </tr>
                      ) : (
                        leadsTodayRows.map((r, idx) => (
                          <tr key={r.id || idx} className="hover:bg-white/5">
                            <td className="px-4 py-3 whitespace-nowrap">{new Date(r.dateMs).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.seller}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.region}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.typeOffre || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.intituleOffre || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.numeroId || r.referencePanier || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
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
            <UsersSection
              onCreateUserClick={openCreateUserModal}
              onAssignRoleClick={() => {
                if (!canAssignRoles) {
                  setAssignRoleFeedback({ type: "error", message: "Seuls les administrateurs autorisés peuvent modifier les rôles." });
                  setShowAssignRoleModal(true); // still open to show feedback
                  return;
                }
                setAssignRoleFeedback(null);
                setShowAssignRoleModal(true);
              }}
              disabled={!isAuthenticated}
              users={userRows}
              loading={statsLoading}
              error={statsError}
              selectedIds={selectedUserIds}
              onToggleUser={handleToggleUserSelection}
              onToggleAll={handleToggleAllUsers}
              onDisableSelected={handleDisableClick}
              disableLoading={disableLoading}
              disableFeedback={disableFeedback}
              canAssignRoles={canAssignRoles}
            />
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

      {showAssignRoleModal && (
        <AssignRoleModal
          open={showAssignRoleModal}
          onClose={() => setShowAssignRoleModal(false)}
          selectedIds={selectedUserIds}
          allowedRoles={allowedRoles}
          onAssign={async (role) => {
            if (!isAuthenticated) {
              setAssignRoleFeedback({ type: "error", message: "Authentification admin requise." });
              return;
            }
            if (!role) {
              setAssignRoleFeedback({ type: "error", message: "Choisis un rôle." });
              return;
            }
            if (selectedUserIds.length === 0) {
              setAssignRoleFeedback({ type: "error", message: "Sélectionne au moins un utilisateur." });
              return;
            }
            setAssignRoleLoading(true);
            setAssignRoleFeedback(null);
            try {
              const callable = httpsCallable(functions, "setUserRole");
              const res = await callable({ userIds: selectedUserIds, role });
              const payload: any = res?.data || {};
              if (!payload?.success) {
                const msg = typeof payload?.message === 'string' ? payload.message : 'Impossible d\'assigner le rôle.';
                setAssignRoleFeedback({ type: "error", message: msg });
                return;
              }
              const okCount = Array.isArray(payload?.updated) ? payload.updated.length : selectedUserIds.length;
              setAssignRoleFeedback({ type: "success", message: `Rôle \"${role}\" assigné à ${okCount} utilisateur(s).` });
              requestAuthStatsRefresh();
              setSelectedUserIds([]);
            } catch (e: any) {
              // Fallback HTTP endpoint with ID token when callable denies (403 / permission issues)
              try {
                const cu = firebaseAuth.currentUser;
                const idToken = cu ? await getIdToken(cu, true) : null;
                if (!idToken) throw e;
                const endpoint = 'https://europe-west9-cactus-mm.cloudfunctions.net/setUserRoleHttp';
                const resp = await fetch(endpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                  },
                  body: JSON.stringify({ userIds: selectedUserIds, role }),
                  credentials: 'include',
                });
                const json = await resp.json().catch(() => ({}));
                if (!resp.ok || !json?.ok) {
                  throw new Error(json?.error || e?.message || 'Assignation refusée');
                }
                const okCount = Array.isArray(json?.updated) ? json.updated.length : selectedUserIds.length;
                setAssignRoleFeedback({ type: 'success', message: `Rôle \"${role}\" assigné à ${okCount} utilisateur(s).` });
                requestAuthStatsRefresh();
                setSelectedUserIds([]);
              } catch (e2: any) {
              setAssignRoleFeedback({ type: "error", message: e?.message || "Erreur réseau lors de l'assignation du rôle." });
              }
            } finally {
              setAssignRoleLoading(false);
            }
          }}
          loading={assignRoleLoading}
          feedback={assignRoleFeedback}
        />
      )}

      {showRevokeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-[#071120] via-[#050b17] to-[#02050b] p-6 shadow-[0_35px_80px_-45px_rgba(244,63,94,0.7)]">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-white">Confirmation requise</h3>
              <p className="text-sm text-blue-100/70">
                Etes vous sur de vouloir revoquer l'accés du compte {selectedUserIds.length > 1 ? `de ces ${selectedUserIds.length} utilisateurs` : "sélectionné"} ?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowRevokeConfirm(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDisableUsers}
                  className="rounded-xl bg-rose-500/20 border border-rose-500/50 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/30 hover:text-white"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Badge de debug présence (admins ou presenceDebug=1) */}
      {/* Debug présence retiré */}
    </div>
  );
};

type UsersSectionProps = {
  onCreateUserClick: () => void;
  onAssignRoleClick: () => void;
  canAssignRoles: boolean;
  disabled: boolean;
  users: AdminUserRow[];
  loading: boolean;
  error: string | null;
  selectedIds: string[];
  onToggleUser: (userId: string) => void;
  onToggleAll: (checked: boolean) => void;
  onDisableSelected: () => void;
  disableLoading: boolean;
  disableFeedback: CreateUserFeedback | null;
};

const UsersSection: React.FC<UsersSectionProps> = ({
  onCreateUserClick,
  onAssignRoleClick,
  canAssignRoles,
  disabled,
  users,
  loading,
  error,
  selectedIds,
  onToggleUser,
  onToggleAll,
  onDisableSelected,
  disableLoading,
  disableFeedback,
}) => {
  const showEmptyState = !loading && users.length === 0 && !error;
  const skeleton = Array.from({ length: 5 });
  const selectableUsers = React.useMemo(() => users.filter((user) => user.status !== "disabled"), [users]);
  const allSelectableSelected = selectableUsers.length > 0 && selectedIds.length === selectableUsers.length;
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.length > 0 && selectedIds.length < selectableUsers.length;
    }
  }, [selectedIds.length, selectableUsers.length]);

  return (
    <div className="space-y-8 pt-16 md:pt-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-white">Utilisateurs</h1>
          <p className="text-sm text-blue-100/70">
            Vue consolidée des comptes Cactus et de leur statut d'activité.
          </p>
          {selectedIds.length > 0 && (
            <p className="text-xs text-sky-200/70">{selectedIds.length} utilisateur(s) sélectionné(s)</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onCreateUserClick}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-full border border-sky-500/45 bg-sky-500/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.3em] text-sky-200 shadow-[0_12px_30px_rgba(59,130,246,0.35)] transition-all duration-300 hover:scale-105 hover:border-sky-300/70 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
          >
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-sky-500/25" />
              <span className="relative text-lg leading-none text-sky-200">+</span>
            </span>
            Nouveau compte
          </button>
          <button
            type="button"
            onClick={onAssignRoleClick}
            disabled={disabled || selectedIds.length === 0 || !canAssignRoles}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-gradient-to-r from-[#1b3a2f] via-[#112821] to-[#0a1b14] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200 shadow-[0_14px_34px_rgba(16,185,129,0.3)] transition-all duration-300 hover:scale-105 hover:border-emerald-300/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
          >
            Assigner un rôle
          </button>
          {!canAssignRoles && (
            <span className="text-[10px] text-blue-200/60">Seuls les administrateurs peuvent modifier les rôles</span>
          )}
          <button
            type="button"
            onClick={onDisableSelected}
            disabled={disableLoading || selectedIds.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-gradient-to-r from-[#1f2d4e] via-[#17233b] to-[#101829] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.3em] text-rose-200 shadow-[0_14px_34px_rgba(244,63,94,0.3)] transition-all duration-300 hover:scale-105 hover:border-rose-300/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
          >
            {disableLoading ? "Révocation..." : "Révoquer l'accès"}
          </button>
        </div>
      </div>

      {disableFeedback && (
        <div
          className={`rounded-2xl border px-5 py-4 text-xs ${
            disableFeedback.type === "success"
              ? "border-sky-500/45 bg-sky-500/10 text-sky-100"
              : "border-rose-500/45 bg-rose-500/10 text-rose-100"
          }`}
        >
          {disableFeedback.message}
        </div>
      )}

      {disabled && !loading && (
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-500/10 px-5 py-4 text-xs text-yellow-100">
          Connecte-toi avec un compte admin Firebase pour accéder aux informations utilisateurs.
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-white/10 bg-[#07152d] p-4 shadow-[0_22px_55px_rgba(8,20,40,0.6)]">
        <div className="overflow-x-auto">
          <div className="max-h-[55vh] overflow-y-auto pr-2">
            <table className="min-w-full divide-y divide-white/10 text-sm text-white">
              <thead>
                <tr className="text-xs uppercase tracking-[0.35em] text-white/50">
                  <th scope="col" className="px-4 py-3 text-left">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/30 bg-transparent text-sky-400 focus:ring-sky-400"
                      checked={allSelectableSelected}
                      onChange={(event) => onToggleAll(event.target.checked)}
                      disabled={disableLoading || selectableUsers.length === 0}
                      aria-label="Sélectionner tous les utilisateurs"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">Utilisateur</th>
                  <th scope="col" className="px-4 py-3 text-left">Entreprise</th>
                  <th scope="col" className="px-4 py-3 text-left">Rôle</th>
                  <th scope="col" className="px-4 py-3 text-left">Statut</th>
                  <th scope="col" className="px-4 py-3 text-left">Dernière activité</th>
                  <th scope="col" className="px-4 py-3 text-left">Créé le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading
                  ? skeleton.map((_, index) => (
                      <tr key={`skeleton-${index}`} className="animate-pulse">
                        <td className="px-4 py-3">
                          <div className="h-4 w-4 rounded bg-white/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-3 w-40 rounded bg-white/10" />
                          <div className="mt-2 h-2 w-28 rounded bg-white/5" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-2 w-16 rounded bg-white/5" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-6 w-20 rounded-full bg-white/5" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-2 w-24 rounded bg-white/5" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-2 w-24 rounded bg-white/5" />
                        </td>
                      </tr>
                    ))
                  : users.map((user) => {
                      const isDisabled = user.status === "disabled";
                      const badgeClass =
                        user.status === "active"
                          ? "border border-sky-400/45 bg-sky-500/10 text-sky-200"
                          : isDisabled
                          ? "border border-rose-500/45 bg-rose-500/10 text-rose-200"
                          : "border border-white/15 bg-white/5 text-white/50";
                      const badgeLabel =
                        user.status === "active"
                          ? "Actif"
                          : isDisabled
                          ? "Désactivé"
                          : "Inactif";
                      const lastActivityLabel =
                        isDisabled ? "Compte désactivé" : formatRelativeTimeLabel(user.lastActiveMs);
                      return (
                        <tr key={user.id} className="transition hover:bg-white/5">
                          <td className="px-4 py-3 align-top">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-white/30 bg-transparent text-sky-400 focus:ring-sky-400"
                              checked={selectedIds.includes(user.id)}
                              onChange={() => onToggleUser(user.id)}
                              disabled={disableLoading || isDisabled}
                              aria-label={`Sélectionner ${user.displayName}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-white">{user.displayName}</span>
                              <span className="text-xs text-white/50">{user.email || "—"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-white/70">{user.companyName || "—"}</td>
                          <td className="px-4 py-3 text-white/70">
                            {user.role ? user.role : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${badgeClass}`}>
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  user.status === "active"
                                    ? "bg-sky-300"
                                    : isDisabled
                                    ? "bg-rose-300"
                                    : "bg-white/40"
                                }`}
                              />
                              {badgeLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/70">{lastActivityLabel}</td>
                          <td className="px-4 py-3 text-white/50">{formatDateLabel(user.createdAtMs)}</td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>

        {showEmptyState && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/60">
            Aucun utilisateur n'est enregistré pour le moment.
          </div>
        )}
      </div>
    </div>
  );
};

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
            <label className="text-xs uppercase tracking-[0.3em] text-blue-100/60" htmlFor="admin-new-companyName">
              Nom de l'entreprise
            </label>
            <input
              id="admin-new-companyName"
              type="text"
              value={form.companyName}
              onChange={(event) => onFieldChange("companyName", event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-white/30 transition focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              placeholder="Cactus Tech"
              autoComplete="organization"
              disabled={disabled || loading}
            />
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

  if (data.disabled === true || data.status === "disabled") {
    return false;
  }

  // 1. Priorité au timestamp s'il existe
  const lastActivityMs = readTimestampMs(data, [
    "lastActive",
    "lastPing", // Backup client-side timestamp
    "lastHeartbeat",
    "lastActivity",
    "lastLogin",
    "lastSeenAt",
    "updatedAt",
  ]);

  if (typeof lastActivityMs === "number") {
    const now = Date.now();
    const diff = now - lastActivityMs;

    // Si la date est dans le futur (plus de 60 min), c'est une erreur -> inactif
    // (Tolérance augmentée pour éviter les problèmes de fuseau horaire/horloge client)
    if (diff < -60 * 60 * 1000) {
      return false;
    }

    // Si la date est valide, on vérifie la fenêtre d'activité
    return diff <= ACTIVITY_WINDOW_MS;
  }

  // 2. Fallback : si pas de timestamp, on regarde les indicateurs booléens (legacy)
  if (dataHasTruthyBoolean(data, ["isActive", "active", "isOnline", "enabled"])) {
    return true;
  }

  // 3. Fallback : statut textuel
  const status = readStringField(data, ["status", "state", "activity", "activityStatus"]);
  if (status) {
    const normalized = status.toLowerCase();
    if (["active", "actif", "online", "en ligne"].includes(normalized)) {
      return true;
    }
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
  if (typeof input === "string") {
    const d = new Date(input);
    if (!isNaN(d.getTime())) {
      return d.getTime();
    }
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

type AssignRoleModalProps = {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  allowedRoles: string[];
  onAssign: (role: string) => void | Promise<void>;
  loading: boolean;
  feedback: CreateUserFeedback | null;
};

const AssignRoleModal: React.FC<AssignRoleModalProps> = ({
  open,
  onClose,
  selectedIds,
  allowedRoles,
  onAssign,
  loading,
  feedback,
}) => {
  const [role, setRole] = React.useState<string>("");
  const [query, setQuery] = React.useState<string>("");
  React.useEffect(() => { setRole(allowedRoles[0] || ""); }, [allowedRoles]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allowedRoles;
    return allowedRoles.filter(r => r.toLowerCase().includes(q));
  }, [allowedRoles, query]);
  const groupOf = (r: string): string => {
    const up = r.toUpperCase();
    if (up.startsWith("TA C+")) return "TA C+";
    if (up.startsWith("TA LEADS")) return "TA LEADS";
    if (up.startsWith("SUPERVISEUR C+")) return "SUPERVISEUR C+";
    if (up.startsWith("SUPERVISEUR LEADS")) return "SUPERVISEUR LEADS";
    if (up === "DIRECTION") return "DIRECTION";
    if (up === "ADMINISTRATEUR") return "ADMINISTRATION";
    return "AUTRES";
  };
  const order = ["TA C+", "TA LEADS", "SUPERVISEUR C+", "SUPERVISEUR LEADS", "DIRECTION", "ADMINISTRATION", "AUTRES"];
  const grouped = React.useMemo(() => {
    const m = new Map<string, string[]>();
    filtered.forEach(r => {
      const g = groupOf(r);
      const arr = m.get(g) || [];
      arr.push(r);
      m.set(g, arr);
    });
    return order.filter(k => m.has(k)).map(k => ({ key: k, items: (m.get(k) || []).sort() }));
  }, [filtered]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-[#071120] via-[#050b17] to-[#02050b] p-6 shadow-[0_35px_80px_-45px_rgba(16,185,129,0.7)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-blue-200/60">Rôles</p>
            <h3 className="text-xl font-semibold text-white">Assigner un rôle</h3>
            <p className="text-xs text-blue-100/70 mt-1">{selectedIds.length} utilisateur(s) sélectionné(s)</p>
          </div>
          <button className="rounded-lg border border-white/10 p-1.5 text-white/70 hover:bg-white/5" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="text-xs uppercase tracking-[0.3em] text-blue-100/60" htmlFor="assign-role-input">Rôle</label>
          {/* Searchable role picker */}
          <div className="relative">
            <input
              id="assign-role-input"
              placeholder="Rechercher un rôle…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/60 pl-10 pr-3 py-3 text-sm text-white placeholder:text-blue-200/40 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-200/60" />
          </div>
          <div className="max-h-64 overflow-auto rounded-2xl border border-white/10 bg-white/5">
            {grouped.length === 0 ? (
              <div className="px-4 py-6 text-sm text-blue-200/70">Aucun rôle ne correspond.</div>
            ) : (
              grouped.map(group => (
                <div key={group.key} className="">
                  <div className="sticky top-0 z-10 bg-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-blue-200/70 border-b border-white/10">{group.key}</div>
                  <ul className="divide-y divide-white/10">
                    {group.items.map((r) => {
                      const isActive = r === role;
                      const suffix = r.endsWith(" FR") ? "FR" : r.endsWith(" CIV") ? "CIV" : null;
                      const baseLabel = suffix ? r.replace(/\s+(FR|CIV)$/i, "") : r;
                      return (
                        <li key={r}>
                          <button
                            type="button"
                            onClick={() => setRole(r)}
                            className={`w-full flex items-center justify-between px-4 py-2 text-left text-sm transition ${isActive ? 'bg-emerald-500/15 text-white' : 'text-blue-100/90 hover:bg-white/10'}`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="font-medium">{baseLabel}</span>
                              {suffix && (
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] tracking-wide ${suffix==='FR' ? 'border-emerald-300/50 text-emerald-100' : 'border-amber-300/50 text-amber-100'}`}>{suffix}</span>
                              )}
                            </span>
                            {isActive && <Check className="h-4 w-4 text-emerald-300" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>

          {feedback && (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-red-400/40 bg-red-500/10 text-red-200'}`}>{feedback.message}</div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-blue-100/80 transition hover:border-white/30 hover:text-white"
          >
            Fermer
          </button>
          <button
            type="button"
            onClick={() => onAssign(role)}
            disabled={loading || !role}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/20 via-blue-500/10 to-transparent px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:border-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Assignation...' : 'Assigner'}
          </button>
        </div>
      </div>
    </div>
  );
};
