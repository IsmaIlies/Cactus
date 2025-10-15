import React from 'react';
import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
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
  const base = `/dashboard/superviseur/${area || ''}`.replace(/\/$/, '');
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 text-white">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-white/10 bg-white/5 backdrop-blur-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h1 className="text-lg font-bold">Superviseur</h1>
          <p className="text-blue-200 text-sm">{titleFor(area)}</p>
        </div>
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          <NavLink
            to={base}
            end
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-semibold ${
                isActive ? 'bg-blue-600 text-white' : 'text-blue-100 hover:bg-white/10'
              }`
            }
          >
            Dashboard
          </NavLink>
          {String(area).toLowerCase() === 'civ' && (
            <NavLink
              to={`${base}/presence`}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-semibold ${
                  isActive ? 'bg-blue-600 text-white' : 'text-blue-100 hover:bg-white/10'
                }`
              }
            >
              Présence TA
            </NavLink>
          )}
          <NavLink
            to={`${base}/ventes`}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-semibold ${
                isActive ? 'bg-blue-600 text-white' : 'text-blue-100 hover:bg-white/10'
              }`
            }
          >
            Ventes
          </NavLink>
          <NavLink
            to={`${base}/leads-supervision`}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-semibold ${
                isActive ? 'bg-blue-600 text-white' : 'text-blue-100 hover:bg-white/10'
              }`
            }
          >
            LEADS
          </NavLink>
          <NavLink
            to={`${base}/checklist`}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-semibold ${
                isActive ? 'bg-blue-600 text-white' : 'text-blue-100 hover:bg-white/10'
              }`
            }
          >
            Checklist
          </NavLink>
        </nav>
        <div className="p-3 border-t border-white/10 mt-auto sticky bottom-0 bg-blue-900/60 backdrop-blur supports-[backdrop-filter]:bg-blue-900/40">
          <button
            onClick={() => logout()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/10 text-blue-100 hover:text-white transition"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">{titleFor(area)}</h2>
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
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default SupervisorLayout;
