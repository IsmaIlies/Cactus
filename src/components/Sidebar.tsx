import { NavLink, Link, useLocation, useParams } from "react-router-dom";
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
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import React from "react";

// reserved for future supervisor-specific entries if needed

interface SidebarProps {
  onCloseMobile?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
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

  type NavItem = {
    key: string;
    label: string;
    to: string;
    exact?: boolean;
    kind?: 'default' | 'nouveautes';
    icon?: React.ReactNode;
  };

  type NavSection = {
    id: 'activite' | 'outils' | 'ressources';
    label: string;
    items: NavItem[];
  };

  const navLinkClass = (isActive: boolean) =>
    `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
      isActive ? "bg-cactus-700 text-white" : "text-cactus-100 hover:bg-cactus-700 hover:text-white"
    }`;

  const isPathActive = React.useCallback(
    (item: NavItem) => {
      const p = location.pathname;
      if (item.exact) return p === item.to;
      return p === item.to || p.startsWith(`${item.to}/`);
    },
    [location.pathname]
  );

  const sections: NavSection[] = React.useMemo(
    () => [
      {
        id: 'activite',
        label: 'Activité',
        items: [
          {
            key: 'dashboard',
            label: 'Dashboard',
            to: base,
            exact: true,
            icon: <LayoutDashboard className="w-5 h-5 mr-3" />,
          },
          {
            key: 'sales',
            label: 'Ventes',
            to: `${base}/sales`,
            icon: <DollarSign className="w-5 h-5 mr-3" />,
          },
          {
            key: 'offers',
            label: 'Offres Canal+',
            to: `${base}/offers`,
            icon: <Gift className="w-5 h-5 mr-3" />,
          },
        ],
      },
      {
        id: 'outils',
        label: 'Outils',
        items: [
          {
            key: 'script',
            label: "Script d'appel",
            to: `${base}/script`,
            icon: <FileText className="w-5 h-5 mr-3" />,
          },
          {
            key: 'catalog',
            label: 'Catalogue',
            to: `${base}/catalog`,
            icon: <Search className="w-5 h-5 mr-3" />,
          },
          {
            key: 'ai',
            label: 'Assistant IA',
            to: `${base}/ai`,
            icon: <Bot className="w-5 h-5 mr-3" />,
          },
        ],
      },
      {
        id: 'ressources',
        label: 'Ressources',
        items: [
          {
            key: 'nouveautes',
            label: 'Nouveautés',
            to: `${base}/nouveautes`,
            kind: 'nouveautes',
          },
          {
            key: 'elearning',
            label: 'E-learning',
            to: '/elearning',
            icon: (
              <span className="inline-block w-5 h-5 mr-3 bg-cactus-600 rounded-full flex items-center justify-center text-white font-bold">
                📚
              </span>
            ),
          },
          {
            key: 'faq',
            label: 'FAQ & Suggestions',
            to: `${base}/faq`,
            icon: <HelpCircle className="w-5 h-5 mr-3" />,
          },
        ],
      },
    ],
    [base]
  );

  const detectActiveSection = React.useCallback((): NavSection['id'] => {
    for (const s of sections) {
      if (s.items.some(isPathActive)) return s.id;
    }
    return 'activite';
  }, [sections, isPathActive]);

  const [openSections, setOpenSections] = React.useState<Record<NavSection['id'], boolean>>(() => ({
    activite: true,
    outils: false,
    ressources: false,
  }));

  // Auto-open the section containing the active route.
  React.useEffect(() => {
    const active = detectActiveSection();
    setOpenSections((prev) => ({
      activite: prev.activite,
      outils: prev.outils,
      ressources: prev.ressources,
      [active]: true,
    }));
  }, [detectActiveSection]);

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
  <div className="bg-cactus-800 text-white h-screen md:h-full flex flex-col w-64 shrink-0 overflow-y-auto overscroll-contain pb-24">
        <div className="p-6 border-b border-cactus-700 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Cactus</h1>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              aria-label="Fermer le menu"
              className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-cactus-400"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          )}
        </div>

  <nav className="flex-1 overflow-y-auto py-6 space-y-3">
        {sections.map((section) => {
          const isOpen = !!openSections[section.id];
          const activeInside = section.items.some(isPathActive);
          return (
            <div key={section.id} className="px-3">
              <button
                type="button"
                onClick={() => setOpenSections((prev) => ({ ...prev, [section.id]: !prev[section.id] }))}
                aria-expanded={isOpen}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left transition-colors ${
                  activeInside ? 'bg-cactus-700/60 text-white' : 'text-cactus-100 hover:bg-cactus-700/40 hover:text-white'
                }`}
              >
                <span className="text-xs font-semibold tracking-wide uppercase">{section.label}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
              </button>

              {isOpen && (
                <div className="mt-1 space-y-1">
                  {section.items.map((item) => {
                    if (item.kind === 'nouveautes') {
                      return (
                        <NavLink
                          key={item.key}
                          to={item.to}
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
                            <span>{item.label}</span>
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
                      );
                    }

                    return (
                      <NavLink
                        key={item.key}
                        to={item.to}
                        end={!!item.exact}
                        className={({ isActive }) => navLinkClass(isActive)}
                      >
                        {item.icon}
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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
      </nav>

      {/* CTA pinned near the bottom */}
      <div className="px-3 pb-3">
        <NavLink
          to="/checklist"
          onClick={onCloseMobile}
          className={() =>
            "flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
          }
        >
          <span className="w-4 h-4 flex items-center justify-center">✅</span>
          <span>Faire ma checklist</span>
        </NavLink>
      </div>

  <div className="p-4 border-t border-cactus-700 space-y-4 mt-auto md:sticky md:bottom-0 bg-cactus-800/95 backdrop-blur supports-[backdrop-filter]:bg-cactus-800/80">
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
