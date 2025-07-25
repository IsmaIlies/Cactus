import { useState, useEffect, useRef } from "react";
import { BarChart2, TrendingUp } from "lucide-react";
import StatCard from "../components/StatCard";
import TodoInput from "../components/TodoInput";
import ChartComponent from "../components/ChartComponent";
import TeamSales from "../components/TeamSales";
import RecentSales from "../components/RecentSales";
import PerformanceTable from "../components/PerformanceTable";
import { getValidatedSalesThisMonth, Sale } from "../services/salesService";
import ObjectiveService, { Objective } from "../services/objectiveService";
import { useAuth } from "../contexts/AuthContext";

const offers = [
  { id: "canal", name: "CANAL+" },
  { id: "canal-cine-series", name: "CANAL+ Ciné Séries" },
  { id: "canal-sport", name: "CANAL+ Sport" },
  { id: "canal-100", name: "CANAL+ 100%" },
];

const DashboardHome = () => {
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [offerDistributionView, setOfferDistributionView] = useState<
    "personal" | "team"
  >("team");
  const [chartView, setChartView] = useState<"evolution" | "objective">(
    "evolution"
  );

  // Heure et date actuelles
  const [currentTime, setCurrentTime] = useState(new Date());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [salesData, objectivesData] = await Promise.all([
          getValidatedSalesThisMonth(),
          ObjectiveService.getObjectives(),
        ]);
        setSales(salesData);
        
        // Filtrer les objectifs du mois en cours
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentMonthObjectives = objectivesData.filter(obj => 
          obj.period === 'month' && 
          obj.year === currentYear && 
          obj.month === currentMonth &&
          obj.isActive
        );
        
        setObjectives(currentMonthObjectives);
      } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
        setSales([]);
        setObjectives([]);
      }
    };
    fetchData();
  }, [user?.id]);

  // Affichage du mois en cours (ex: "Juillet 2025")
  const now = new Date();
  const currentMonthLabel = now.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const parseDate = (date: any) => {
    if (!date) return null;
    if (date.toDate) return date.toDate(); // Firestore Timestamp
    if (typeof date === "string") return new Date(date);
    return null;
  };

  const isToday = (date: any) => {
    const d = parseDate(date);
    if (!d) return false;
    const now = new Date();
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  };

  const isThisMonth = (date: any) => {
    const d = parseDate(date);
    if (!d) return false;
    const now = new Date();
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  };

  // Construire une map userId => userName (nom de la vente la plus récente)
  const userNames: Record<string, string> = {};

  // Trier les ventes par date décroissante pour avoir les plus récentes en premier
  const sortedSales = [...sales].sort((a, b) => {
    const dateA = parseDate(a.date);
    const dateB = parseDate(b.date);
    if (!dateA || !dateB) return 0;
    return dateB.getTime() - dateA.getTime();
  });

  // Récupérer le nom le plus récent pour chaque userId
  sortedSales.forEach((s) => {
    if (s.userId && s.name && !userNames[s.userId]) {
      userNames[s.userId] = s.name;
    }
  });

  // Les ventes sont déjà filtrées par mois et validées dans le service
  const personalSales = sales.filter((s) => s.userId === user?.id);
  const personalSalesToday = personalSales.filter((s) => isToday(s.date));
  const personalSalesMonth = personalSales; // toutes les ventes du mois en cours
  const teamSalesToday = sales.filter((s) => isToday(s.date));

  // Ventes de la semaine (lundi à aujourd'hui inclus)
  const getStartOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lundi de cette semaine
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0); // Début de journée lundi
    return monday;
  };
  
  const startOfWeek = getStartOfWeek(now);
  const endOfWeek = new Date(now);
  endOfWeek.setHours(23, 59, 59, 999); // Fin de journée aujourd'hui
  
  const isThisWeek = (date: any) => {
    const d = parseDate(date);
    if (!d) return false;
    return d >= startOfWeek && d <= endOfWeek;
  };
  const personalSalesWeek = personalSales.filter((s: Sale) =>
    isThisWeek(s.date)
  );
  const teamSalesWeek = sales.filter((s: Sale) => isThisWeek(s.date));

  const salesByUser: Record<string, { daily: number; monthly: number }> = {};
  sales.forEach((s) => {
    const uid = s.userId;
    if (!salesByUser[uid]) salesByUser[uid] = { daily: 0, monthly: 0 };
    // Comptage journalier : uniquement ventes validées
    if (isToday(s.date) && s.consent === "yes") salesByUser[uid].daily++;
    // Comptage mensuel : uniquement ventes validées
    if (isThisMonth(s.date) && s.consent === "yes") salesByUser[uid].monthly++;
  });

  const getLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const labels: string[] = [];
  const personalCountByDay: number[] = [];
  const teamCountByDay: number[] = [];

  // Données pour le graphique d'objectif (cumul)
  const cumulativeTeamSales: number[] = [];
  const objectiveTarget: number[] = [];
  
  // Trouver l'objectif de ventes du mois en cours
  const salesObjective = objectives.find(obj => obj.type === 'sales' && obj.scope === 'team');
  const personalObjective = objectives.find(obj => obj.type === 'sales' && obj.scope === 'personal' && obj.userId === user?.id);
  const MONTHLY_OBJECTIVE = salesObjective?.target || 160; // Utiliser l'objectif équipe ou 160 par défaut

  // Générer tous les jours du mois en cours (uniquement les jours de semaine)
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  // Calculer le nombre de jours ouvrés dans le mois
  let workingDaysInMonth = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDay = new Date(year, month, day);
    const dayOfWeek = currentDay.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDaysInMonth++;
    }
  }

  let cumulativeSales = 0;
  let workingDayIndex = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDay = new Date(year, month, day);
    const dayOfWeek = currentDay.getDay(); // 0 = dimanche, 6 = samedi

    // Ignorer les weekends (samedi = 6, dimanche = 0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    workingDayIndex++;
    const dayStr = getLocalDateString(currentDay);

    // Afficher le numéro du jour
    labels.push(day.toString());

    // Si le jour est dans le futur, on met null pour ne pas tracer la courbe
    if (day <= today) {
      const personalSalesForDay = Math.round(
        sales.filter((s) => {
          if (s.userId !== user?.id) return false;
          const d = parseDate(s.date);
          if (!d) return false;
          return getLocalDateString(d) === dayStr;
        }).length
      );

      const teamSalesForDay = Math.round(
        sales.filter((s) => {
          const d = parseDate(s.date);
          if (!d) return false;
          return getLocalDateString(d) === dayStr;
        }).length
      );

      personalCountByDay.push(personalSalesForDay);
      teamCountByDay.push(teamSalesForDay);

      // Cumul pour le graphique d'objectif
      cumulativeSales += teamSalesForDay;
      cumulativeTeamSales.push(cumulativeSales);
    } else {
      // Jour futur : null pour ne pas tracer la courbe
      personalCountByDay.push(null as any);
      teamCountByDay.push(null as any);
      cumulativeTeamSales.push(null as any);
    }

    // Objectif linéaire basé sur les jours ouvrés
    const expectedSalesForDay = Math.round(
      (MONTHLY_OBJECTIVE / workingDaysInMonth) * workingDayIndex
    );
    objectiveTarget.push(expectedSalesForDay);
  }

  const computeOfferDistribution = (source: any[]) => {
    const counts = offers.map(
      (o) => source.filter((s) => s.offer === o.id).length
    );
    return {
      labels: offers.map((o) => o.name),
      datasets: [
        {
          data: counts,
          backgroundColor: ["#3c964c", "#e5d8c3", "#90d0d8", "#f5a76c"],
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

  // Calculer le maximum dynamique pour l'axe Y
  const maxPersonal = Math.max(...personalCountByDay.filter((v) => v !== null));
  const maxTeam = Math.max(...teamCountByDay.filter((v) => v !== null));
  const dynamicMaxY = Math.max(maxPersonal, maxTeam, 1) + 2; // +2 pour l'espace visuel

  // Calculer le maximum pour le graphique d'objectif
  const maxCumulative = Math.max(
    ...cumulativeTeamSales.filter((v) => v !== null)
  );
  const maxObjective = Math.max(...objectiveTarget);
  const objectiveMaxY =
    Math.max(maxCumulative, maxObjective, MONTHLY_OBJECTIVE) + 10;

  // Options pour forcer l'axe Y à afficher uniquement des entiers sur le line chart
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
          callback: function (value: number) {
            if (Number.isInteger(value)) return value;
            return "";
          },
        },
      },
    },
  };

  // Options pour le graphique d'objectif
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
          callback: function (value: number) {
            if (Number.isInteger(value)) return value;
            return "";
          },
        },
      },
    },
  };

  // 3 dernières ventes personnelles avec nom
  const recentSalesData = [...sales]
    .filter((s) => s.userId === user?.id)
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 3)
    .map(({ id, date, offer, name }) => {
      const parsedDate = parseDate(date);
      return {
        date: parsedDate
          ? `${parsedDate.toLocaleDateString()} ${parsedDate.toLocaleTimeString(
              [],
              { hour: "2-digit", minute: "2-digit" }
            )}`
          : "",
        type: offers.find((o) => o.id === offer)?.name || offer,
        id,
        name,
      };
    });

  const performanceData = Object.entries(salesByUser).map(
    ([uid, { daily, monthly }]) => ({
      name: uid === user?.id ? "Moi" : userNames[uid] || uid,
      dailySales: daily,
      monthlySales: monthly,
    })
  );

  // teamSalesData n'est plus utilisé, on peut le supprimer

  const teamSalesTodayData = Object.entries(salesByUser).map(([uid, data]) => ({
    name: uid === user?.id ? "Moi" : userNames[uid] || uid,
    sales: data.daily, // ici ventes du jour
  }));

  // Calculs pour les objectifs
  const teamSalesCount = sales.length;

  const teamObjectiveProgress = salesObjective
    ? ObjectiveService.calculateProgressPercentage(salesObjective, teamSalesCount)
    : 0;

  // Formatage heure et date
  const formattedTime = currentTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const formattedDate = currentTime.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Prénom
  const firstName = user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "Utilisateur";

  // Pauses (11h30 et 17h)
  const getPauseTimer = (targetHour: number, targetMinute: number) => {
    const now = currentTime;
    const pause = new Date(now);
    pause.setHours(targetHour, targetMinute, 0, 0);
    let diff = (pause.getTime() - now.getTime()) / 1000; // secondes
    if (diff < 0) diff += 24 * 3600; // prochaine pause si déjà passée
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = Math.floor(diff % 60);
    return `${h > 0 ? h + "h " : ""}${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* Accueil personnalisé */}
      <div className="flex justify-between items-center mb-2 relative">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bonjour {firstName}, prêt pour votre journée ?
          </h1>
          <div className="text-sm text-gray-600 mb-2">
            🕒 {formattedTime} — {formattedDate}
          </div>
          {/* Espace to-do manuel pour le TA, taille normale */}
          <div className="bg-gradient-to-br from-cactus-50 via-white to-cactus-100 rounded-lg shadow p-3 border border-cactus-200 max-w-md">
            <h2 className="text-base font-bold text-cactus-700 mb-1 flex items-center gap-2">
              <span>📝</span> Ma to-do
            </h2>
            <TodoInput userUID={user!.id} />
          </div>
        </div>
        {/* Mini-pauses en haut à droite */}
        <div className="absolute right-0 top-0 flex flex-col items-end text-[11px] text-gray-500 gap-1 pr-2 pt-1">
          <div>
            Pause 11h30&nbsp;
            <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-[9px]">
              {getPauseTimer(11, 30)}
            </span>
          </div>
          <div>
            Pause 17h&nbsp;
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[9px]">
              {getPauseTimer(17, 0)}
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="col-span-3 grid grid-cols-3 gap-4">
          <StatCard
            title="Mes ventes du jour"
            value={personalSalesToday.length.toString()}
            subtitle={`sur ${teamSalesToday.length} ventes équipe`}
            icon={<BarChart2 className="w-5 h-5 text-cactus-600" />}
          />
          <StatCard
            title="Mes ventes de la semaine"
            value={personalSalesWeek.length.toString()}
            subtitle={`sur ${teamSalesWeek.length} ventes équipe`}
            icon={<BarChart2 className="w-5 h-5 text-cactus-600" />}
          />
          <StatCard
            title="Mes ventes du mois"
            value={personalSalesMonth.length.toString()}
            subtitle={`sur ${sales.length} ventes équipe`}
            icon={<TrendingUp className="w-5 h-5 text-cactus-600" />}
          />
        </div>
        {/* Carte d'objectif équipe et perso */}
        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Objectif Équipe</h3>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            {salesObjective ? (
              <>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {teamSalesCount}/{salesObjective.target}
                </div>
                <div className="flex items-center space-x-2 mb-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(teamObjectiveProgress, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    {teamObjectiveProgress}%
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {salesObjective.label}
                </p>
              </>
            ) : (
              <div className="text-sm text-gray-500">
                Aucun objectif défini
              </div>
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
                      style={{ width: `${Math.min(ObjectiveService.calculateProgressPercentage(personalObjective, personalSalesMonth.length), 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    {ObjectiveService.calculateProgressPercentage(personalObjective, personalSalesMonth.length)}%
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {personalObjective.label}
                </p>
              </>
            ) : (
              <div className="text-sm text-gray-500">
                Aucun objectif personnel défini
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium text-gray-900">
              {chartView === "evolution"
                ? "Évolution des ventes"
                : "Évolution de l'objectif"}
            </h2>
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
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
                options={lineChartOptions}
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
                options={objectiveChartOptions}
              />
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium text-gray-900">
              Répartition des offres
            </h2>
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
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
              options={pieChartOptions}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TeamSales members={teamSalesTodayData} />
        <RecentSales sales={recentSalesData} />
      </div>

      <PerformanceTable salespeople={performanceData} />
    </div>
  );
};

export default DashboardHome;
