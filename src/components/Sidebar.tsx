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
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import React from "react";

// reserved for future supervisor-specific entries if needed

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

    // remove unused state openChecklist
    // const [openChecklist, setOpenChecklist] = React.useState(false);

  // Debug: log suspicious user shape that could trigger runtime errors elsewhere
  React.useEffect(() => {
    try {
      if (user && (user as any).assigned) {
        // eslint-disable-next-line no-console
        console.debug('[Sidebar] user.assigned shape', (user as any).assigned);
      }
    } catch (e) {
      // ignore
    }
  }, [user]);

  try {
    return (
  <div className="bg-cactus-800 text-white h-screen flex flex-col w-64 shrink-0 overflow-hidden">
        <div className="p-6 border-b border-cactus-700">
          <h1 className="text-3xl font-bold">Cactus</h1>
        </div>

  <nav className="flex-1 overflow-y-auto py-6 space-y-1">
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
  <div className="p-4 border-t border-cactus-700 space-y-4 mt-auto sticky bottom-0 bg-cactus-800/95 backdrop-blur supports-[backdrop-filter]:bg-cactus-800/80">
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
          onClick={() => logout()}
          className="flex items-center w-full px-4 py-2 text-sm font-medium text-cactus-100 rounded-md hover:bg-cactus-700 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Déconnexion
        </button>
      </div>
    </div>
    );
  } catch (err) {
    // Defensive fallback to avoid unmounting the whole app on Sidebar render error
    // Log the original error for debugging in the browser console
    // eslint-disable-next-line no-console
    console.error('[Sidebar] render error', err);
    return (
      <div className="bg-cactus-800 text-white h-screen flex flex-col w-64 shrink-0 overflow-y-auto p-4">
        <div className="p-4 border-b border-cactus-700">
          <h1 className="text-2xl font-bold">Cactus</h1>
        </div>
        <nav className="flex-1 py-4">
          <ul className="space-y-2">
            <li><a href="/dashboard/fr" className="text-cactus-100">Dashboard</a></li>
            <li><a href="/checklist" className="text-cactus-100">Faire ma checklist</a></li>
            <li><a href="/checklist-archive" className="text-cactus-100">Archives</a></li>
          </ul>
        </nav>
      </div>
    );
  }
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
