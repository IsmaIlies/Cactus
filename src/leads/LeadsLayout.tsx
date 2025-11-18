import LeadsSidebar from "./components/LeadsSidebar";
import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import LeadsDashboardPage from "./pages/LeadsDashboardPage";
import SalesEntry from "./pages/SalesEntry";
import MyLeadSalesPage from "./pages/MyLeadSalesPage";
import { useRegion } from "../contexts/RegionContext";
import { Menu, X } from "lucide-react";

const LeadsLayout = () => {
  const location = useLocation();
  const { region } = useRegion();
  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");

    const previous = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootOverflow: root?.style.overflow,
      rootHeight: root?.style.height,
    };

    html.style.overflow = "auto";
    html.style.height = "auto";
    body.style.overflow = "auto";
    body.style.height = "auto";
    if (root) {
      root.style.overflow = "auto";
      root.style.height = "auto";
    }

    return () => {
      html.style.overflow = previous.htmlOverflow;
      html.style.height = previous.htmlHeight;
      body.style.overflow = previous.bodyOverflow;
      body.style.height = previous.bodyHeight;
      if (root) {
        root.style.overflow = previous.rootOverflow ?? "";
        root.style.height = previous.rootHeight ?? "";
      }
    };
  }, []);

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  React.useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gradient-to-br from-[#001A6E] via-[#002FA7] to-[#00113C] text-white">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#001A6E]/80 backdrop-blur z-30">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-controls="leads-sidebar"
          aria-expanded={sidebarOpen}
          className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="text-sm font-semibold tracking-wide">Leads</span>
        <span className="w-10" />
      </div>
      <aside
        id="leads-sidebar"
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 will-change-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        role="navigation"
        aria-label="Menu Leads"
      >
        <LeadsSidebar />
      </aside>
      {sidebarOpen && (
        <button onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu" className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-30" />
      )}
      <main className="flex-1 overflow-auto">
        {/* Region indicator badge (FR/CIV) */}
        <div className="sticky top-0 z-30 flex justify-end px-4 pt-4">
          <span
            title={region ? `Région active : ${region}` : 'Région active : FR'}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wider shadow-sm ${
              (region || 'FR') === 'CIV'
                ? 'border-amber-300/60 bg-amber-500/15 text-amber-100'
                : 'border-emerald-300/60 bg-emerald-500/15 text-emerald-100'
            }`}
          >
            <span className="opacity-80">Région</span>
            <span className="text-[11px] uppercase">{(region || 'FR')}</span>
          </span>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl shadow-2xl shadow-black/20 p-8 min-h-[60vh]">
            <Routes>
              <Route path="dashboard" element={<LeadsDashboardPage />} />
              <Route path="sales" element={<SalesEntry />} />
              <Route path="my-sales" element={<MyLeadSalesPage />} />
              <Route path="*" element={<LeadsDashboardPage />} />
            </Routes>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LeadsLayout;
