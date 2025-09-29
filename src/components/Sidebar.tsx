import { NavLink, Link, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  LogOut,
  DollarSign,
  Settings,
  User,
  Bot,
  Search,
  FileText,
  Gift,
  HelpCircle,
  CalendarRange,
  BarChart3,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import React from "react";

const Sidebar = () => {
  const { user, logout } = useAuth();
  const [showNewNouveautes, setShowNewNouveautes] = React.useState<boolean>(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("nouveautes_seen_v1");
      if (!stored) {
        setShowNewNouveautes(true);
      }
    } catch (_) {
      setShowNewNouveautes(true);
    }
  }, []);

  const acknowledgeNouveautes = () => {
    if (showNewNouveautes) {
      try { localStorage.setItem("nouveautes_seen_v1", "1"); } catch(_) {}
      setShowNewNouveautes(false);
    }
  };

  const params = useParams();
  const region = (params.region as 'fr' | 'civ') || (localStorage.getItem('activeRegion')?.toLowerCase() as 'fr' | 'civ') || 'fr';
  const base = `/dashboard/${region}`;

    const [openChecklist, setOpenChecklist] = React.useState(false);

  return (
  <div className="bg-cactus-800 text-white h-screen flex flex-col w-64 shrink-0 overflow-y-auto">
      <div className="p-6 border-b border-cactus-700">
        <h1 className="text-3xl font-bold">Cactus</h1>
      </div>

      <nav className="flex-1 py-6 space-y-1">
        <NavLink
          to={base}
          end
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <LayoutDashboard className="w-5 h-5 mr-3" />
          Dashboard
        </NavLink>

    <NavLink
      to={`${base}/nouveautes`}
              onClick={acknowledgeNouveautes}
              className={({ isActive }) =>
                `relative flex items-center px-6 py-3 text-sm font-medium transition-colors group ${
                  isActive
                    ? "bg-cactus-700 text-white"
                    : "text-cactus-100 hover:bg-cactus-700/80 hover:text-white"
                }`
              }
            >
              <span className="w-5 h-5 mr-3 flex items-center justify-center text-cactus-100 relative">
                <CalendarRange className="w-5 h-5" />
                {showNewNouveautes && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow ring-2 ring-cactus-800 animate-ping" />
                )}
              </span>
              <span className="flex items-center gap-2">
                <span>Nouveautés</span>
                {showNewNouveautes && (
                  <span className="text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-500/40 to-cactus-500/40 text-emerald-50 border border-emerald-400/40 shadow-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Nouveau
                  </span>
                )}
              </span>
              {showNewNouveautes && (
                <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-emerald-400/30 group-hover:ring-emerald-300/50 transition" />
              )}
            </NavLink>

        <NavLink
          to="/elearning"
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <span className="inline-block w-5 h-5 mr-3 bg-cactus-600 rounded-full flex items-center justify-center text-white font-bold">📚</span>
          <span>E-learning</span>
        </NavLink>

        <NavLink
          to={`${base}/script`}
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <FileText className="w-5 h-5 mr-3" />
          Script d'appel
        </NavLink>

        <NavLink
          to={`${base}/catalog`}
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <Search className="w-5 h-5 mr-3" />
          Catalogue
        </NavLink>

        <NavLink
          to={`${base}/sales`}
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <DollarSign className="w-5 h-5 mr-3" />
          Ventes
        </NavLink>

        <NavLink
              to="/checklist"
              className={({ isActive }) =>
                `flex items-center px-6 py-3 text-sm font-medium rounded-md transition-colors ${
                  isActive ? "bg-cactus-700 text-white" : "text-cactus-100 hover:bg-cactus-700/80 hover:text-white"
                }`
              }
            >
              <span className="w-4 h-4 mr-3 flex items-center justify-center">✅</span>
              <span>Faire ma checklist</span>
            </NavLink>

          <NavLink
              to="/checklist-archive"
              className={({ isActive }) =>
                `flex items-center px-6 py-3 text-sm font-medium rounded-md transition-colors ${
                  isActive ? "bg-cactus-700 text-white" : "text-cactus-100 hover:bg-cactus-700/80 hover:text-white"
                }`
              }
            >
              <span className="w-4 h-4 mr-3 flex items-center justify-center">🗂️</span>
              <span>Archives</span>
            </NavLink>

        <NavLink
          to={`${base}/my-sales`}
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <BarChart3 className="w-5 h-5 mr-3" />
          Mes ventes
        </NavLink>

        <NavLink
          to={`${base}/ai`}
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <Bot className="w-5 h-5 mr-3" />
          Assistant IA
        </NavLink>
        <NavLink
          to={`${base}/offers`}
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <Gift className="w-5 h-5 mr-3" />
          Offres Canal+
        </NavLink>
        {/*
        <NavLink
          to="/dashboard/modetv"
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <span className="w-5 h-5 mr-3 flex items-center justify-center">�</span>
          Mode TV Poker
        </NavLink>
        */}

  <NavLink
  to={`${base}/faq`}
        className={({ isActive }) =>
          `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
            isActive
              ? "bg-cactus-700 text-white"
              : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
          }`
        }
      >
        <HelpCircle className="w-5 h-5 mr-3" />
        FAQ & Suggestions
      </NavLink>
      </nav>
      <div className="p-4 border-t border-cactus-700 space-y-4">
        <Link
          to={`${base}/settings`}
          className="flex items-center p-3 rounded-lg bg-cactus-700 hover:bg-cactus-600 transition-colors"
        >
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-cactus-600 flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.displayName}
            </p>
            <p className="text-xs text-cactus-200 truncate">{user?.email}</p>
          </div>
          <Settings className="w-5 h-5 text-cactus-200" />
        </Link>

        <button
          onClick={logout}
          className="flex items-center w-full px-4 py-2 text-sm font-medium text-cactus-100 rounded-md hover:bg-cactus-700 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Déconnexion
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

/*
        <NavLink
          to="/dashboard/mycover"
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <Target className="w-5 h-5 mr-3" />
          MYcover
        </NavLink>

        <NavLink
          to="/dashboard/mrwhite"
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "bg-cactus-700 text-white"
                : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
            }`
          }
        >
          <Users className="w-5 h-5 mr-3" />
          Mr. White
        </NavLink>
        */
