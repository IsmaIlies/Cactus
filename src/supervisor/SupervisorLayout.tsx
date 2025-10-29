import React from 'react';
import { NavLink, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, LayoutDashboard, Clock3, FileDown, ClipboardList, ListChecks, Gauge, FlaskConical, PlusCircle, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const titleFor = (area?: string) => {
  switch ((area || '').toLowerCase()) {
    case 'fr': return 'CANAL+ FR';
    case 'civ': return 'CANAL+ CIV';
    case 'leads': return 'LEADS';
    default: return 'Superviseur';
  }
};

const SupervisorLayout: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/dashboard/superviseur/${area || ''}`.replace(/\/$/, '');
  const { logout } = useAuth();
  const hideSpaceSwitch =
    String(area).toLowerCase() === 'leads' && (location.pathname.includes('/export') || location.pathname.includes('/ecoutes'));

  React.useEffect(() => {
    const normalizedArea = String(area || '').toLowerCase();
    if (normalizedArea !== 'leads') return;
    const currentPath = location.pathname.replace(/\/$/, '');
    if (currentPath === base) {
      navigate(`${base}/dashboard2`, { replace: true });
    }
  }, [area, base, location.pathname, navigate]);

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 text-white">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-white/10 bg-gradient-to-b from-[#0b1f3f] via-[#0c2752] to-[#0a2752] backdrop-blur-xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10">
              <span className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500/40 to-blue-500/40 blur-lg opacity-80" />
              <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-[0_10px_30px_rgba(234,179,8,0.45)]">
                🍊
              </span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Superviseur</h1>
              <p className="text-blue-200/80 text-sm uppercase tracking-[0.3em]">{titleFor(area)}</p>
            </div>
          </div>
        </div>
        <div className="p-3 space-y-2 flex-1 overflow-y-auto">
          {String(area).toLowerCase() === 'leads' && (
            <div>
              <NavLink to={`${base}/dashboard2`} className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${isActive ? 'bg-gradient-to-r from-cyan-500/40 via-blue-600/30 to-transparent text-white border border-cyan-300/40 shadow-[0_12px_32px_rgba(56,189,248,0.45)]' : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(14,165,233,0.25)]'}`
              }>
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-cyan-300 transition group-hover:bg-white/10 group-hover:text-white">
                  <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
                  <Gauge className="relative h-4 w-4" aria-hidden="true" />
                </span>
                Dashboard
              </NavLink>
              <NavLink to={`${base}/leads-plus`} className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${isActive ? 'bg-gradient-to-r from-cyan-500/40 via-blue-600/30 to-transparent text-white border border-cyan-300/40 shadow-[0_12px_32px_rgba(56,189,248,0.45)]' : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(14,165,233,0.25)]'}`
              }>
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-cyan-300 transition group-hover:bg-white/10 group-hover:text-white">
                  <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
                  <PlusCircle className="relative h-4 w-4" aria-hidden="true" />
                </span>
                Leads+
              </NavLink>
              <NavLink to={`${base}/export`} className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${isActive ? 'bg-gradient-to-r from-cyan-500/40 via-blue-600/30 to-transparent text-white border border-cyan-300/40 shadow-[0_12px_32px_rgba(56,189,248,0.45)]' : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(14,165,233,0.25)]'}`
              }>
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-cyan-300 transition group-hover:bg-white/10 group-hover:text-white">
                  <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
                  <FileDown className="relative h-4 w-4" aria-hidden="true" />
                </span>
                Export
              </NavLink>
              <NavLink to={`${base}/analyse`} className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${isActive ? 'bg-gradient-to-r from-cyan-500/40 via-blue-600/30 to-transparent text-white border border-cyan-300/40 shadow-[0_12px_32px_rgba(56,189,248,0.45)]' : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(14,165,233,0.25)]'}`
              }>
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-cyan-300 transition group-hover:bg-white/10 group-hover:text-white">
                  <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
                  <FlaskConical className="relative h-4 w-4" aria-hidden="true" />
                </span>
                Analyse
              </NavLink>
              <NavLink to={`${base}/ecoutes`} className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${isActive ? 'bg-gradient-to-r from-cyan-500/40 via-blue-600/30 to-transparent text-white border border-cyan-300/40 shadow-[0_12px_32px_rgba(56,189,248,0.45)]' : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(14,165,233,0.25)]'}`
              }>
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-cyan-300 transition group-hover:bg-white/10 group-hover:text-white">
                  <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
                  <Phone className="relative h-4 w-4" aria-hidden="true" />
                </span>
                N° Écoutes
              </NavLink>
              <NavLink to={`${base}/leads-supervision`} className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${isActive ? 'bg-gradient-to-r from-cyan-500/40 via-blue-600/30 to-transparent text-white border border-cyan-300/40 shadow-[0_12px_32px_rgba(56,189,248,0.45)]' : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(14,165,233,0.25)]'}`
              }>
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-cyan-300 transition group-hover:bg-white/10 group-hover:text-white">
                  <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
                  <ListChecks className="relative h-4 w-4" aria-hidden="true" />
                </span>
                Import
              </NavLink>
            </div>
          )}
          {(String(area).toLowerCase() === 'fr' || String(area).toLowerCase() === 'civ') && (
            <div>
              <NavLink to={`${base}`} end className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${isActive ? 'bg-gradient-to-r from-orange-400/40 via-red-500/30 to-transparent text-white border border-orange-300/40 shadow-[0_12px_32px_rgba(251,191,36,0.35)]' : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(251,191,36,0.15)]'}`
              }>
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-orange-300 transition group-hover:bg-white/10 group-hover:text-white">
                  <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
                  <LayoutDashboard className="relative h-4 w-4" aria-hidden="true" />
                </span>
                Dashboard
              </NavLink>
              <NavLink to={`${base}/export`} className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${isActive ? 'bg-gradient-to-r from-cyan-500/40 via-blue-600/30 to-transparent text-white border border-cyan-300/40 shadow-[0_12px_32px_rgba(56,189,248,0.45)]' : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(14,165,233,0.25)]'}`
              }>
                <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-cyan-300 transition group-hover:bg-white/10 group-hover:text-white">
                  <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
                  <FileDown className="relative h-4 w-4" aria-hidden="true" />
                </span>
                Export
              </NavLink>
            </div>
          )}
          {String(area).toLowerCase() === 'civ' && (
            <NavLink
              to={`${base}/presence`}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/40 via-blue-600/30 to-transparent text-white border border-cyan-300/40 shadow-[0_12px_32px_rgba(56,189,248,0.45)]'
                    : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(14,165,233,0.25)]'
                }`
              }
            >
              <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-cyan-300 transition group-hover:bg-white/10 group-hover:text-white">
                <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
                <Clock3 className="relative h-4 w-4" aria-hidden="true" />
              </span>
              Présence TA
            </NavLink>
          )}
          <NavLink
            to={`${base}/checklist`}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/40 via-blue-600/30 to-transparent text-white border border-cyan-300/40 shadow-[0_12px_32px_rgba(56,189,248,0.45)]'
                  : 'text-blue-100/80 hover:bg-white/10 hover:shadow-[0_10px_28px_rgba(14,165,233,0.25)]'
              }`
            }
          >
            <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-cyan-300 transition group-hover:bg-white/10 group-hover:text-white">
              <span className="absolute inset-0 rounded-lg border border-white/10 opacity-0 transition group-hover:opacity-100" />
              <ClipboardList className="relative h-4 w-4" aria-hidden="true" />
            </span>
            Checklist
          </NavLink>
          <button
            onClick={logout}
            className="group relative mt-2 inline-flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-orange-400/40 bg-gradient-to-r from-orange-500/20 via-red-500/15 to-transparent px-4 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-orange-200 shadow-[0_16px_38px_rgba(234,179,8,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-300/60 hover:text-white"
          >
            <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_20%_20%,rgba(248,191,132,0.35),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(248,113,113,0.25),transparent_60%)]" />
            <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-orange-200 transition group-hover:bg-white/10 group-hover:text-white">
              <span className="absolute inset-0 rounded-lg border border-white/15 opacity-0 transition group-hover:opacity-100" />
              <LogOut className="relative h-4 w-4" aria-hidden="true" />
            </span>
            <span className="relative">Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">{titleFor(area)}</h2>
            {!hideSpaceSwitch && (
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white/10 border border-white/10 hover:bg-white/15"
                  onClick={() => {
                    const a = String(area || '').toLowerCase();
                    const targetRegion = a === 'civ' ? 'civ' : a === 'fr' ? 'fr' : 'fr';
                    navigate(`/dashboard/${targetRegion}`);
                  }}
                >
                  Changer d’espace
                </button>
              </div>
            )}
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default SupervisorLayout;