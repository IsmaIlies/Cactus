// pages/DashboardHome.tsx
import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart2, TrendingUp, ListChecks } from "lucide-react";
import StatCard from "../components/StatCard";
import TodoInput from "../components/TodoInput";
import ChartComponent from "../components/ChartComponent";
import TeamSales from "../components/TeamSales";
import RecentSales from "../components/RecentSales";
import PerformanceTable from "../components/PerformanceTable";
import ObjectiveService, { Objective } from "../services/objectiveService";
import { useAuth } from "../contexts/AuthContext";
import NotificationSystem from "../components/NotificationSystem";
import CallClosuresPanel from "../components/CallClosuresPanel";
import callClosures from "../data/callClosures";
import { getUserCredits, ensureUserCredits } from "../services/gameService";
import { listenToRealTimeEvents } from "../services/realTimeService";

// ⚠️ On importe maintenant la fonction qui ramène **toutes** les ventes du mois
import { Sale } from "../services/salesService";
import useMonthlySales from "../hooks/useMonthlySales";
import { useRegion } from "../contexts/RegionContext";

const offers = [
  { id: "canal", name: "CANAL+" },
  { id: "canal-cine-series", name: "CANAL+ Ciné Séries" },
  { id: "canal-sport", name: "CANAL+ Sport" },
  { id: "canal-100", name: "CANAL+ 100%" },
];

// Petit composant pour isoler l’horloge (évite les re-render massifs)
function ClockAndBreaks({
  firstName,
  userUID,
}: {
  firstName: string;
  userUID?: string | null;
}) {
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const formattedTime = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(currentTime);
  const formattedDate = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(currentTime);

  return (
    <div className="flex justify-between items-start mb-2 relative gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour {firstName}, prêt pour votre journée ?
        </h1>
        <div className="text-sm text-gray-600 mb-2">
          🕒 {formattedTime} — {formattedDate}
        </div>
        <div className="bg-gradient-to-br from-cactus-50 via-white to-cactus-100 rounded-lg shadow p-3 border border-cactus-200 max-w-md">
          <h2 className="text-base font-bold text-cactus-700 mb-1 flex items-center gap-2">
            <span>📝</span> Ma to-do
          </h2>
          {userUID && <TodoInput userUID={String(userUID)} />}
        </div>
      </div>
  {/* Pause timers supprimés */}
    </div>
  );
}

const DashboardHome = () => {
  const { user } = useAuth();
  const { sales } = useMonthlySales();
  const { region } = useRegion();
  const [casinoCredits, setCasinoCredits] = useState<number | null>(null);
  // ventes mensuelles fournies par hook
  const [objectives, setObjectives] = useState<Objective[]>([]);
  // Bouton Clôtures d'appel (affichage à venir)
  const [showClosures, setShowClosures] = useState(false);
  const [offerDistributionView, setOfferDistributionView] =
    useState<"personal" | "team">("team");
  const [chartView, setChartView] =
    useState<"evolution" | "objective">("evolution");

  // Une seule source de vérité pour "now"
  const now = useMemo(() => new Date(), []);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ID utilisateur (Firebase renvoie uid)
  const currentUserId =
    (user as any)?.uid ?? (user as any)?.id ?? null;

  // Tick léger (optionnel, si tu veux des calculs temps-réel ailleurs)
  useEffect(() => {
    timerRef.current = setInterval(() => {
      // rien à faire ici si tous les calculs sont mémoïsé par sales/objectives
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Load / ensure casino credits une fois user chargé
  useEffect(() => {
    let mounted = true;
    if (!currentUserId) return;
    (async () => {
      try {
        await ensureUserCredits(currentUserId);
        const c = await getUserCredits(currentUserId);
        if (mounted) setCasinoCredits(c);
      } catch {
        if (mounted) setCasinoCredits(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentUserId]);

  // Rafraîchir ventes/objectifs quand on change de mois
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  useEffect(() => {
    const loadObjectives = async () => {
      try {
        const objectivesData = await ObjectiveService.getObjectives();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentMonthObjectives = objectivesData.filter(
          (obj) =>
            obj.period === "month" &&
            obj.year === currentYear &&
            obj.month === currentMonth &&
            obj.isActive
        );
        setObjectives(currentMonthObjectives);
      } catch (e) {
        console.error('Erreur objectifs', e);
        setObjectives([]);
      }
    };
    loadObjectives();
  }, [currentUserId, monthKey, now]);

  const parseDate = (date: any) => {
    if (!date) return null;
    if (date.toDate) return date.toDate(); // Firestore Timestamp
    if (typeof date === "string") return new Date(date);
    if (date instanceof Date) return date;
    return null;
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  const isToday = (dateLike: any) => {
    const d = parseDate(dateLike);
    if (!d) return false;
    return isSameDay(d, new Date());
  };

  const isThisMonth = (dateLike: any) => {
    const d = parseDate(dateLike);
    if (!d) return false;
    const t = new Date();
    return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
  };

  // Vente validée = basketStatus OK/VALID FINALE (fallback legacy : consent === "yes")
  const isValidated = (s: Sale) => {
    const bs = (s as any).basketStatus as string | undefined;
    if (bs && ["OK", "Valid SOFT", "VALID FINALE"].includes(bs)) return true;
    if ((s as any).consent === "yes") return true;
    return false;
  };

  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lundi
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };
  const startOfWeek = useMemo(() => getStartOfWeek(now), [now]);
  const endOfWeek = useMemo(() => {
    const e = new Date(now);
    e.setHours(23, 59, 59, 999);
    return e;
  }, [now]);

  const isThisWeek = (dateLike: any) => {
    const d = parseDate(dateLike);
    if (!d) return false;
    return d >= startOfWeek && d <= endOfWeek;
  };

  const safeMax = (arr: (number | null)[], fallback = 1) => {
    const nums = arr.filter((v): v is number => typeof v === "number");
    return nums.length ? Math.max(...nums) : fallback;
  };

  const getLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // Toutes les grosses agrégations sont mémoïsées sur [sales, currentUserId, now]
  const memo = useMemo(() => {
    // Map userId => nom le plus récent
    const userNames: Record<string, string> = {};
    const sortedSales = [...sales].sort((a, b) => {
      const dateA = parseDate(a.date)?.getTime() ?? 0;
      const dateB = parseDate(b.date)?.getTime() ?? 0;
      return dateB - dateA;
    });
    sortedSales.forEach((s) => {
      const uid = (s as any).userId;
      const nm = (s as any).name;
      if (uid && nm && String(nm).trim() && !userNames[uid]) {
        userNames[uid] = String(nm).trim();
      }
    });

  const personalSales = sales.filter((s) => (s as any).userId === currentUserId);
  // Validées uniquement
  // Validées journalières / hebdo (utilisées côté FR uniquement pour affichage)
  const personalSalesValidatedToday = personalSales.filter((s) => isToday((s as any).date) && isValidated(s));
  const personalSalesValidatedWeek = personalSales.filter((s) => isThisWeek((s as any).date) && isValidated(s));
  const personalSalesMonth = personalSales.filter((s) => isValidated(s));
  const teamSalesToday = sales.filter((s) => isToday((s as any).date) && isValidated(s));
  const teamSalesWeek = sales.filter((s) => isThisWeek((s as any).date) && isValidated(s));
  const teamSalesMonth = sales.filter((s) => isValidated(s));
  // Totaux toutes ventes (incluant non validées) — pour affichage indicateurs bruts
  const personalSalesTodayTotal = personalSales.filter((s) => isToday((s as any).date));
  const personalSalesWeekTotal = personalSales.filter((s) => isThisWeek((s as any).date));
  const personalSalesMonthTotal = personalSales; // déjà sur le mois

    // Agrégations par user (journalier / mensuel) en ne comptant que les validées
    const salesByUser: Record<string, { daily: number; monthly: number }> = {};
  sales.forEach((s) => {
      const uid = (s as any).userId;
      if (!uid) return; // ignore les ventes sans userId
      if (!salesByUser[uid]) salesByUser[uid] = { daily: 0, monthly: 0 };
      if (isToday((s as any).date) && isValidated(s)) salesByUser[uid].daily++;
      if (isThisMonth((s as any).date) && isValidated(s)) salesByUser[uid].monthly++;
    });

    // Objectifs
    const salesObjective = objectives.find(
      (obj) => obj.type === "sales" && obj.scope === "team"
    );
    const personalObjective = objectives.find(
      (obj) =>
        obj.type === "sales" &&
        obj.scope === "personal" &&
        obj.userId === currentUserId
    );
    const MONTHLY_OBJECTIVE = salesObjective?.target || 160;

    // Générer jours ouvrés du mois
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayNum = new Date().getDate();

    let workingDaysInMonth = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDay = new Date(year, month, day);
      const dayOfWeek = currentDay.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysInMonth++;
      }
    }

    const labels: string[] = [];
    const personalCountByDay: number[] = [];
    const teamCountByDay: number[] = [];
    const cumulativeTeamSales: (number | null)[] = [];
    const objectiveTarget: number[] = [];

    let cumulativeSales = 0;
    let workingDayIndex = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDay = new Date(year, month, day);
      const dayOfWeek = currentDay.getDay(); // 0 = dimanche, 6 = samedi
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      workingDayIndex++;
      const dayStr = getLocalDateString(currentDay);
      labels.push(day.toString());

      if (day <= todayNum) {
        const personalSalesForDay = sales.filter((s) => {
          if ((s as any).userId !== currentUserId) return false;
          const d = parseDate((s as any).date);
          if (!d) return false;
          return getLocalDateString(d) === dayStr;
        }).length;

        const teamSalesForDay = sales.filter((s) => {
          const d = parseDate((s as any).date);
          if (!d) return false;
          return getLocalDateString(d) === dayStr;
        }).length;

        personalCountByDay.push(personalSalesForDay);
        teamCountByDay.push(teamSalesForDay);

        cumulativeSales += teamSalesForDay;
        cumulativeTeamSales.push(cumulativeSales);
      } else {
        personalCountByDay.push(null as any);
        teamCountByDay.push(null as any);
        cumulativeTeamSales.push(null);
      }

      const expectedSalesForDay = Math.round(
        (MONTHLY_OBJECTIVE / workingDaysInMonth) * workingDayIndex
      );
      objectiveTarget.push(expectedSalesForDay);
    }

    const maxPersonal = safeMax(personalCountByDay, 0);
    const maxTeam = safeMax(teamCountByDay, 0);
    const dynamicMaxY = Math.max(maxPersonal, maxTeam, 1) + 2;

    const maxCumulative = safeMax(cumulativeTeamSales, 0);
    const maxObjective = safeMax(objectiveTarget, 0);
    const objectiveMaxY = Math.max(maxCumulative, maxObjective, MONTHLY_OBJECTIVE) + 10;

    // 3 dernières ventes perso
    const recentSalesData = [...sales]
      .filter((s) => (s as any).userId === currentUserId)
      .sort((a, b) => {
        const da = parseDate((a as any).date)?.getTime() ?? 0;
        const db = parseDate((b as any).date)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 3)
      .map(({ id, date, offer, name }) => {
        const parsedDate = parseDate(date);
        return {
          date: parsedDate
            ? `${parsedDate.toLocaleDateString()} ${parsedDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "",
          type: offers.find((o) => o.id === (offer as any))?.name || (offer as any),
          id,
          name,
        };
      });

    const performanceData = Object.entries(salesByUser)
      .filter(([uid]) => !!uid)
      .map(([uid, { daily, monthly }]) => ({
        name: uid === String(currentUserId) ? "Moi" : userNames[uid] || uid,
        dailySales: daily,
        monthlySales: monthly,
      }));

    const teamSalesTodayData = Object.entries(salesByUser)
      .filter(([uid]) => !!uid)
      .map(([uid, data]) => ({
        name: uid === String(currentUserId) ? "Moi" : userNames[uid] || uid,
        sales: data.daily,
      }));

    return {
      userNames,
  personalSales,
  personalSalesMonth,
  teamSalesToday,
  teamSalesWeek,
  teamSalesMonth,
  personalSalesTodayTotal,
  personalSalesWeekTotal,
  personalSalesMonthTotal,
  personalSalesValidatedToday,
  personalSalesValidatedWeek,
      labels,
      personalCountByDay,
      teamCountByDay,
      cumulativeTeamSales,
      objectiveTarget,
      dynamicMaxY,
      objectiveMaxY,
      recentSalesData,
      performanceData,
      teamSalesTodayData,
      salesObjective,
      personalObjective,
      MONTHLY_OBJECTIVE,
    };
  }, [sales, currentUserId, now, objectives]);

  const {
  personalSales,
  personalSalesMonth,
  teamSalesToday,
  teamSalesWeek,
  teamSalesMonth,
  personalSalesTodayTotal,
  personalSalesWeekTotal,
  personalSalesMonthTotal,
  personalSalesValidatedToday,
  personalSalesValidatedWeek,
    labels,
    personalCountByDay,
    teamCountByDay,
    cumulativeTeamSales,
    objectiveTarget,
    dynamicMaxY,
    objectiveMaxY,
    recentSalesData,
    performanceData,
    teamSalesTodayData,
    salesObjective,
    personalObjective,
    MONTHLY_OBJECTIVE,
  } = memo;

  type Notification = {
    message: string;
    type: "sale" | "message" | "objective";
  };

  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const unsubscribe = listenToRealTimeEvents((newNotification) => {
      setNotifications((prev) => {
        const isDuplicate = prev.some(
          (notification) => notification.message === newNotification.message
        );
        if (!isDuplicate) {
          return [...prev, newNotification];
        }
        return prev;
      });
    });

    return () => unsubscribe();
  }, []);

  const computeOfferDistribution = (source: any[]) => {
    const knownIds = new Set(offers.map((o) => o.id));
    const counts = offers.map(
      (o) => source.filter((s) => (s as any).offer === o.id).length
    );
    const others = source.filter((s) => !knownIds.has((s as any).offer)).length;
    return {
      labels: [...offers.map((o) => o.name), "Autres"],
      datasets: [
        {
          data: [...counts, others],
          backgroundColor: ["#3c964c", "#e5d8c3", "#90d0d8", "#f5a76c", "#d1d5db"],
          borderWidth: 0,
        },
      ],
    };
  };

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            family: "'Inter', sans-serif",
          },
        },
      },
    },
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            family: "'Inter', sans-serif",
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        min: 0,
        max: dynamicMaxY,
        ticks: {
          stepSize: 1,
          callback: (value: unknown) =>
            Number.isInteger(Number(value)) ? String(value) : "",
        },
      },
    },
  };

  const objectiveChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            family: "'Inter', sans-serif",
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        min: 0,
        max: objectiveMaxY,
        ticks: {
          stepSize: Math.ceil(objectiveMaxY / 10),
          callback: (value: unknown) =>
            Number.isInteger(Number(value)) ? String(value) : "",
        },
      },
    },
  };

  // Prénom utilisateur
  const firstName =
    user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "Utilisateur";

  return (
    <div className="space-y-6">
      {/* En-tête : horloge + todo */}
      <ClockAndBreaks firstName={firstName} userUID={currentUserId ? String(currentUserId) : null} />

      {/* Stats + objectifs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="col-span-3 grid grid-cols-3 gap-4">
          <StatCard
            title="Mes ventes du jour"
            value={(region === 'FR' ? personalSalesValidatedToday.length : personalSalesTodayTotal.length).toString()}
            subtitle={`sur ${teamSalesToday.length} validées équipe`}
            icon={<BarChart2 className="w-5 h-5 text-cactus-600" />}
          />
          <StatCard
            title="Mes ventes de la semaine"
            value={(region === 'FR' ? personalSalesValidatedWeek.length : personalSalesWeekTotal.length).toString()}
            subtitle={`sur ${teamSalesWeek.length} validées équipe`}
            icon={<BarChart2 className="w-5 h-5 text-cactus-600" />}
          />
          <StatCard
            title="Mes ventes du mois"
            value={(region === 'FR' ? personalSalesMonth.length : personalSalesMonthTotal.length).toString()}
            subtitle={`sur ${teamSalesMonth.length} validées équipe`}
            icon={<TrendingUp className="w-5 h-5 text-cactus-600" />}
          />
        </div>

        {/* Objectifs */}
        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Objectif Équipe</h3>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            {salesObjective ? (
              <>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {sales.length}/{salesObjective.target}
                </div>
                <div className="flex items-center space-x-2 mb-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          ObjectiveService.calculateProgressPercentage(
                            salesObjective,
                            sales.length
                          ),
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    {ObjectiveService.calculateProgressPercentage(
                      salesObjective,
                      sales.length
                    )}
                    %
                  </span>
                </div>
                <p className="text-xs text-gray-500">{salesObjective.label}</p>
              </>
            ) : (
              <div className="text-sm text-gray-500">Aucun objectif défini</div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Objectif Perso</h3>
              <TrendingUp className="w-4 h-4 text-cactus-600" />
            </div>
            {personalObjective ? (
              <>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {personalSalesMonth.length}/{personalObjective.target}
                </div>
                <div className="flex items-center space-x-2 mb-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-cactus-600 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          ObjectiveService.calculateProgressPercentage(
                            personalObjective,
                            personalSalesMonth.length
                          ),
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    {ObjectiveService.calculateProgressPercentage(
                      personalObjective,
                      personalSalesMonth.length
                    )}
                    %
                  </span>
                </div>
                <p className="text-xs text-gray-500">{personalObjective.label}</p>
              </>
            ) : (
              <div className="text-sm text-gray-500">Aucun objectif personnel défini</div>
            )}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium text-gray-900">
              {chartView === "evolution" ? "Évolution des ventes" : "Évolution de l'objectif"}
            </h2>
            <div className="flex rounded-lg border border-gray-200 p-1" role="tablist" aria-label="Vue des graphiques">
              <button
                aria-label="Afficher l'évolution des ventes"
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  chartView === "evolution"
                    ? "bg-cactus-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                onClick={() => setChartView("evolution")}
              >
                Évolution
              </button>
              <button
                aria-label="Afficher l'évolution de l'objectif"
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  chartView === "objective"
                    ? "bg-cactus-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                onClick={() => setChartView("objective")}
              >
                Objectif
              </button>
            </div>
          </div>
          <div className="h-[300px]">
            {chartView === "evolution" ? (
              <ChartComponent
                type="line"
                data={{
                  labels,
                  datasets: [
                    {
                      label: "Mes ventes",
                      data: personalCountByDay,
                      borderColor: "#3c964c",
                      backgroundColor: "rgba(60, 150, 76, 0.1)",
                      tension: 0,
                      fill: true,
                      borderWidth: 2,
                    },
                    {
                      label: "Total équipe",
                      data: teamCountByDay,
                      borderColor: "#90d0d8",
                      backgroundColor: "rgba(144, 208, 216, 0.1)",
                      tension: 0,
                      fill: true,
                      borderWidth: 2,
                      borderDash: [5, 5],
                    },
                  ],
                }}
                options={lineChartOptions as any}
              />
            ) : (
              <ChartComponent
                type="line"
                data={{
                  labels,
                  datasets: [
                    {
                      label: "Ventes cumulées",
                      data: cumulativeTeamSales,
                      borderColor: "#3c964c",
                      backgroundColor: "rgba(60, 150, 76, 0.3)",
                      tension: 0,
                      fill: true,
                      borderWidth: 2,
                    },
                    {
                      label: `Objectif (${MONTHLY_OBJECTIVE})`,
                      data: objectiveTarget,
                      borderColor: "#f59e0b",
                      backgroundColor: "rgba(245, 158, 11, 0.1)",
                      tension: 0,
                      fill: false,
                      borderWidth: 2,
                      borderDash: [5, 5],
                    },
                  ],
                }}
                options={objectiveChartOptions as any}
              />
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium text-gray-900">Répartition des offres</h2>
            <div className="flex rounded-lg border border-gray-200 p-1" role="tablist" aria-label="Répartition des offres">
              <button
                aria-label="Répartition personnelle"
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  offerDistributionView === "personal"
                    ? "bg-cactus-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                onClick={() => setOfferDistributionView("personal")}
              >
                Moi
              </button>
              <button
                aria-label="Répartition équipe"
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  offerDistributionView === "team"
                    ? "bg-cactus-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                onClick={() => setOfferDistributionView("team")}
              >
                Équipe
              </button>
            </div>
          </div>
          <div className="h-[300px]">
            <ChartComponent
              type="pie"
              data={
                offerDistributionView === "personal"
                  ? computeOfferDistribution(personalSales)
                  : computeOfferDistribution(sales)
              }
              options={pieChartOptions as any}
            />
          </div>
        </div>
      </div>

      {/* Ventes du jour + tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Total ventes équipe du jour */}
        <div className="col-span-2 mb-2">
          <div className="bg-cactus-100 border border-cactus-200 rounded-lg px-4 py-2 text-cactus-700 font-semibold text-lg flex items-center gap-2 shadow-sm w-fit">
            <span>Ventes de l'équipe aujourd'hui :</span>
            <span className="text-cactus-900 text-2xl font-bold">
              {teamSalesToday.length}
            </span>
          </div>
        </div>
        <TeamSales members={teamSalesTodayData} />
        <RecentSales sales={recentSalesData} />
      </div>

      <PerformanceTable salespeople={performanceData} />

      {/* Notifications + widget live */}
      <NotificationSystem
        notifications={notifications}
        setNotifications={setNotifications}
      />

  {/* LiveStatsWidget temporairement désactivé */}

      {/* Bonus : petits crédits si tu veux les afficher */}
      {casinoCredits != null && (
        <div className="text-xs text-gray-600">
          🎰 Crédits casino : <span className="font-semibold">{casinoCredits}</span>
        </div>
      )}

      {/* Bouton flottant: Clôtures d'appel (UI uniquement, contenu à venir) */}
      <div className="fixed bottom-24 right-6 z-40 select-none">
        <button
          type="button"
          title="Clôtures d'appel"
          aria-label="Ouvrir les clôtures d'appel"
          aria-expanded={showClosures}
          onClick={() => setShowClosures(true)}
          className="relative group focus:outline-none"
        >
          {/* halo animé */}
          <div className="absolute inset-0 rounded-full bg-cactus-500/30 blur-xl group-hover:bg-cactus-500/40 transition-colors duration-300 animate-pulse" />
          {/* bouton principal */}
          <div className="relative flex items-center gap-2 px-5 py-3 rounded-full text-white shadow-xl ring-2 ring-white/20 bg-gradient-to-r from-cactus-700 via-cactus-600 to-green-600 hover:to-cactus-500 hover:scale-105 active:scale-95 transition-all duration-300">
            <ListChecks className="w-5 h-5" />
            <span className="font-semibold">Clôtures d’appel</span>
            <span className="ml-1 text-[10px] uppercase tracking-wide bg-white/15 px-2 py-0.5 rounded-full animate-pulse">
              New
            </span>
          </div>
        </button>
      </div>

  {/* Panel de clôtures d'appel */}
  <CallClosuresPanel open={showClosures} onClose={() => setShowClosures(false)} closures={callClosures} />
    </div>
  );
};

export default DashboardHome;
