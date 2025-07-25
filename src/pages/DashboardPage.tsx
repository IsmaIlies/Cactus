import React from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import DashboardHome from "./DashboardHome";
import SalesPage from "./SalesPage";
import SettingsPage from "./SettingsPage";
import AiAssistantPage from "./AiAssistantPage";
import CatalogPage from "./CatalogPage";
import CallScriptPage from "./CallScriptPage";
import MrWhitePage from "./MrWhitePage";
import RightSidebar from "../components/RightSidebar";
import MyCoverPage from "./MyCoverPage";
import OffersPage from "./OffersPage";
import FaqPage from "./FaqPage";

const DashboardPage = () => {
  const location = useLocation();
  const [isRightSidebarOpen, setIsRightSidebarOpen] = React.useState(true);

  // Détermine la page active à partir de l'URL
  let activePage = "home";
  if (location.pathname === "/dashboard") activePage = "home";
  else if (location.pathname.startsWith("/dashboard/script"))
    activePage = "script";
  else if (location.pathname.startsWith("/dashboard/catalog"))
    activePage = "catalog";
  else if (location.pathname.startsWith("/dashboard/sales"))
    activePage = "sales";
  else if (location.pathname.startsWith("/dashboard/ai")) activePage = "ai";
  else if (location.pathname.startsWith("/dashboard/mrwhite")) activePage = "mrwhite";
  else if (location.pathname.startsWith("/dashboard/mycover")) activePage = "mycover";
  else if (location.pathname.startsWith("/dashboard/offers")) activePage = "offers";
  else if (location.pathname.startsWith("/dashboard/faq")) activePage = "faq";
  else if (location.pathname.startsWith("/dashboard/settings"))
    activePage = "settings";

  return (
    <div className="flex h-screen bg-sand-50 overflow-hidden">
      <Sidebar />
      <div
        className={`flex-1 overflow-hidden transition-all duration-300 ${
          isRightSidebarOpen ? "mr-64" : "mr-4"
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
        </div>
      </div>
      <RightSidebar
        isOpen={isRightSidebarOpen}
        onToggle={setIsRightSidebarOpen}
      />
    </div>
  );
};

export default DashboardPage;