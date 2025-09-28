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

const DashboardPage: React.FC = () => {
  const location = useLocation();
  // Right sidebar enabled except on ModeTVCasino page
  const [isRightSidebarOpen, setIsRightSidebarOpen] = React.useState(true);

  // Ferme automatiquement la sidebar droite sur la page NouveautÃ©s (plein focus contenu)
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

  return (
    <div className="flex h-screen bg-sand-50 overflow-hidden">
      <Sidebar />
      <div
        className={`flex-1 overflow-hidden transition-all duration-300 ${
          activePage !== 'modetv'
            ? (isRightSidebarOpen ? 'mr-64' : 'mr-4')
            : ''
        }`}
      >
        <div className="h-full overflow-hidden">
          <div 
            style={{ display: activePage === "home" ? "block" : "none" }}
            className="h-full overflow-auto p-6"
          >
            <DashboardHome />
          </div>
          <div 
            style={{ display: activePage === "script" ? "block" : "none" }}
            className="h-full overflow-auto p-6"
          >
            <CallScriptPage />
          </div>
          <div 
            style={{ display: activePage === "catalog" ? "block" : "none" }}
            className="h-full overflow-auto p-6"
          >
            <CatalogPage />
          </div>
          <div 
            style={{ display: activePage === "sales" ? "block" : "none" }}
            className="h-full overflow-auto p-6"
          >
            <SalesPage />
          </div>
          <div 
            style={{ display: activePage === "my-sales" ? "block" : "none" }}
            className="h-full overflow-auto p-6"
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
            className="h-full overflow-auto p-6"
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
            className="h-full overflow-auto p-6"
          >
            <MyCoverPage />
          </div>
          <div
            style={{ display: activePage === "offers" ? "block" : "none" }}
            className="h-full overflow-auto p-6"
          >
            <OffersPage />
          </div>
        <div
          style={{ display: activePage === "faq" ? "block" : "none" }}
          className="h-full overflow-auto p-6"
        >
          <FaqPage />
        </div>
          <div
            style={{ display: activePage === "settings" ? "block" : "none" }}
            className="h-full overflow-auto p-6"
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
