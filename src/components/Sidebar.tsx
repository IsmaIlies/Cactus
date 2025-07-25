import { NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard,
  LogOut,
  DollarSign,
  Settings,
  User,
  Bot,
  Search,
  FileText,
  Users,
  Gift,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Target } from "lucide-react";

const Sidebar = () => {
  const { user, logout } = useAuth();

  return (
    <div className="bg-cactus-800 text-white h-screen flex flex-col w-64 shrink-0">
      <div className="p-6 border-b border-cactus-700">
        <h1 className="text-3xl font-bold">Cactus</h1>
      </div>

      <nav className="flex-1 py-6 space-y-1">
        <NavLink
          to="/dashboard"
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
          to="/dashboard/script"
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
          to="/dashboard/catalog"
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
          to="/dashboard/sales"
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
          to="/dashboard/ai"
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
          to="/dashboard/offers"
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
      <NavLink
        to="/dashboard/faq"
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
          to="/dashboard/settings"
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