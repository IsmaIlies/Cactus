import React from "react";
import RightSidebar from "../components/RightSidebar";
import { useLocation, useParams, Navigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import NewMessageNotifier from "../components/NewMessageNotifier";
import DashboardHome from "./DashboardHome";
import SalesPage from "./SalesPage";
import SettingsPage from "./SettingsPage";
import AiAssistantPage from "./AiAssistantPage";
import CatalogPage from "./CatalogPage";
import CallScriptPage from "./CallScriptPage";
import MrWhitePage from "./MrWhitePage";
import PokerDuelPage from "./PokerDuelPage";
import MyCoverPage from "./MyCoverPage";
import OffersPage from "./OffersPage";
import FaqPage from "./FaqPage";
import NouveautesPage from "./NouveautesPage";
import MySalesPage from "./MySalesPage";
import { useRegion } from '../contexts/RegionContext';
import { Menu, X } from "lucide-react";

const DashboardPage: React.FC = () => {
  const location = useLocation();
  // Right sidebar enabled except on ModeTVCasino page
  const [isRightSidebarOpen, setIsRightSidebarOpen] = React.useState(true);

  // Ferme automatiquement la sidebar droite sur la page Nouveautés (plein focus contenu)
  React.useEffect(() => {
    if (location.pathname.startsWith('/dashboard/nouveautes')) {
      setIsRightSidebarOpen(false);
    }
  }, [location.pathname]);

  const { region } = useParams();
  const regionLower = (region || '').toLowerCase();
  if (region && regionLower !== 'fr' && regionLower !== 'civ') {
    return <Navigate to="/dashboard/fr" replace />;
  }
  // Sync URL param with region context (FR/CIV)
  const { region: ctxRegion, setRegion } = useRegion();
  React.useEffect(() => {
    const code = regionLower === 'civ' ? 'CIV' : 'FR';
    if (ctxRegion !== code) {
      try { setRegion(code as any); } catch {}
    }
  }, [regionLower, ctxRegion, setRegion]);
  const base = `/dashboard/${regionLower}`;

  // DÃ©termine la page active Ã  partir de l'URL
  const p = location.pathname;
  let activePage = "home";
  if (p === base) activePage = "home";
  else if (p.startsWith(`${base}/script`)) activePage = "script";
  else if (p.startsWith(`${base}/catalog`)) activePage = "catalog";
  else if (p.startsWith(`${base}/sales`)) activePage = "sales";
  else if (p.startsWith(`${base}/my-sales`)) activePage = "my-sales";
  else if (p.startsWith(`${base}/ai`)) activePage = "ai";
  else if (p.startsWith(`${base}/mrwhite`)) activePage = "mrwhite";
  else if (p.startsWith(`/modetv-disabled`)) activePage = "modetv"; // legacy path kept
  else if (p.startsWith(`${base}/mycover`)) activePage = "mycover";
  else if (p.startsWith(`${base}/offers`)) activePage = "offers";
  else if (p.startsWith(`${base}/faq`)) activePage = "faq";
  else if (p.startsWith(`${base}/nouveautes`)) activePage = "nouveautes";
  else if (p.startsWith(`${base}/settings`)) activePage = "settings";

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  React.useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const pageTitleMap: Record<string,string> = {
    home:'Dashboard', script:'Script', catalog:'Catalogue', sales:'Ventes', 'my-sales':'Mes ventes', ai:'Assistant IA', mrwhite:'Mr White', modetv:'Mode TV', mycover:'MyCover', offers:'Offres', faq:'FAQ & Suggestions', settings:'Paramètres', nouveautes:'Nouveautés'
  };
  const mobileTitle = pageTitleMap[activePage] || 'Dashboard';

  return (
    <div className="h-screen bg-sand-50 overflow-hidden flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-black/10 bg-gradient-to-r from-[#0b1f3f] to-[#0c2752] text-white backdrop-blur z-30">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-controls="app-sidebar"
          aria-expanded={sidebarOpen}
          className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-black/5 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-cactus-500"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="text-sm font-semibold tracking-wide">{mobileTitle}</span>
        <span className="w-10" />
      </div>
      {/* Sidebar */}
      <aside
        id="app-sidebar"
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 will-change-transform bg-cactus-800 shadow-xl md:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        role="navigation"
        aria-label="Menu principal"
      >
        <Sidebar onCloseMobile={() => setSidebarOpen(false)} />
      </aside>
      {/* Overlay */}
      {sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(false)}
          aria-label="Fermer le menu"
          className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-30"
        />
      )}
      <div
        className={`flex-1 overflow-hidden transition-all duration-300 ${
          activePage !== 'modetv'
            ? (isRightSidebarOpen ? 'md:mr-64' : 'md:mr-6')
            : ''
        }`}
      >
        <div className="h-full overflow-hidden space-y-6 md:space-y-8">
          <div 
            style={{ display: activePage === "home" ? "block" : "none" }}
            className="h-full overflow-auto p-4 sm:p-6 lg:p-8"
          >
            <DashboardHome />
          </div>
          <div 
            style={{ display: activePage === "script" ? "block" : "none" }}
            className="h-full overflow-auto p-4 sm:p-6 lg:p-8"
          >
            <CallScriptPage />
          </div>
          <div 
            style={{ display: activePage === "catalog" ? "block" : "none" }}
            className="h-full overflow-auto p-4 sm:p-6 lg:p-8"
          >
            <CatalogPage />
          </div>
          <div 
            style={{ display: activePage === "sales" ? "block" : "none" }}
            className="h-full overflow-auto p-4 sm:p-6 lg:p-8"
          >
            <SalesPage />
          </div>
          <div 
            style={{ display: activePage === "my-sales" ? "block" : "none" }}
            className="h-full overflow-auto p-4 sm:p-6 lg:p-8"
          >
            <MySalesPage />
          </div>
          <div 
            style={{ display: activePage === "ai" ? "block" : "none" }}
            className="h-full overflow-hidden"
          >
            <AiAssistantPage />
          </div>
          <div 
            style={{ display: activePage === "mrwhite" ? "block" : "none" }}
            className="h-full overflow-auto p-4 sm:p-6 lg:p-8"
          >
            <MrWhitePage />
          </div>
          <div 
            style={{ display: activePage === "modetv" ? "block" : "none" }}
            className="h-full overflow-auto p-0"
          > {activePage === 'modetv' ? <PokerDuelPage /> : null}
          </div>
          <div 
            style={{ display: activePage === "mycover" ? "block" : "none" }}
            className="h-full overflow-auto p-4 sm:p-6 lg:p-8"
          >
            <MyCoverPage />
          </div>
          <div
            style={{ display: activePage === "offers" ? "block" : "none" }}
            className="h-full overflow-auto p-4 sm:p-6"
          >
            <OffersPage />
          </div>
        <div
          style={{ display: activePage === "faq" ? "block" : "none" }}
          className="h-full overflow-auto p-4 sm:p-6"
        >
          <FaqPage />
        </div>
          <div
            style={{ display: activePage === "settings" ? "block" : "none" }}
            className="h-full overflow-auto p-4 sm:p-6"
          >
            <SettingsPage />
          </div>
          <div
            style={{ display: activePage === "nouveautes" ? "block" : "none" }}
            className="h-full overflow-auto p-0"
          >
            <NouveautesPage />
          </div>
        </div>
      </div>
      {activePage !== 'modetv' && (
        <RightSidebar
          isOpen={isRightSidebarOpen}
          onToggle={setIsRightSidebarOpen}
        />
      )}
    {/* Notifications nouveaux messages (global) */}
    <NewMessageNotifier />
    </div>
  );
};

export default DashboardPage;
