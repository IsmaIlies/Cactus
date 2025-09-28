import { NavLink } from "react-router-dom";
import { LayoutGrid, FileSignature, CheckSquare, LogOut, BarChart3 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import React from "react";

const linkBaseClasses =
  "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors";

const LeadsSidebar = () => {
  const { user, logout } = useAuth();
  const firstName = React.useMemo(() => {
    if (!user?.displayName) return "Agent";
    const [name] = user.displayName.split(" ");
    return name || "Agent";
  }, [user?.displayName]);

  return (
    <aside className="w-64 shrink-0 bg-[#021b5a] text-white border-r border-white/10 shadow-2xl shadow-black/30">
      <div className="px-6 py-8 border-b border-white/10">
        <div className="text-xs uppercase tracking-[0.3em] text-orange-400/90">Orange Leads</div>
        <h1 className="text-2xl font-semibold mt-3 flex items-center gap-2">
          <span role="img" aria-label="orange">🍊</span>
          <span>Hello {firstName}</span>
        </h1>
      </div>
      <nav className="py-6 space-y-2">
        <NavLink
          to="/leads/dashboard"
          className={({ isActive }) =>
            `${linkBaseClasses} ${
              isActive
                ? "bg-white/10 text-white"
                : "text-blue-100 hover:bg-white/10 hover:text-white"
            }`
          }
        >
          <LayoutGrid className="w-5 h-5" />
          Dashboard
        </NavLink>
        <NavLink
          to="/leads/sales"
          className={({ isActive }) =>
            `${linkBaseClasses} ${
              isActive
                ? "bg-white/10 text-white"
                : "text-blue-100 hover:bg-white/10 hover:text-white"
            }`
          }
        >
          <FileSignature className="w-5 h-5" />
          Enregistrement des ventes
        </NavLink>
        <NavLink
          to="/leads/my-sales"
          className={({ isActive }) =>
            `${linkBaseClasses} ${
              isActive
                ? "bg-white/10 text-white"
                : "text-blue-100 hover:bg-white/10 hover:text-white"
            }`
          }
        >
          <BarChart3 className="w-5 h-5" />
          Mes ventes
        </NavLink>
        <NavLink
          to="/leads/checklist"
          className={({ isActive }) =>
            `${linkBaseClasses} ${
              isActive
                ? "bg-white/10 text-white"
                : "text-blue-100 hover:bg-white/10 hover:text-white"
            }`
          }
        >
          <CheckSquare className="w-5 h-5" />
          Checklist
        </NavLink>
      </nav>
      <div className="mt-auto px-6 py-6 border-t border-white/10">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium py-3 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#021b5a] focus:ring-white/50"
        >
          <LogOut className="w-5 h-5" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
};

export default LeadsSidebar;
