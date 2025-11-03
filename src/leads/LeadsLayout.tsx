import LeadsSidebar from "./components/LeadsSidebar";
import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import LeadsDashboardPage from "./pages/LeadsDashboardPage";
import SalesEntry from "./pages/SalesEntry";
import LeadsChecklistPage from "./pages/LeadsChecklistPage";
import MyLeadSalesPage from "./pages/MyLeadSalesPage";
import { useRegion } from "../contexts/RegionContext";

const LeadsLayout = () => {
  const location = useLocation();
  const { region } = useRegion();
  const isChecklistRoute = /\/leads\/(checklist)(\/)?$|\/leads\/checklist$|\/leads\/checklist\?/.test(location.pathname);
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

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#001A6E] via-[#002FA7] to-[#00113C] text-white">
      {!isChecklistRoute && <LeadsSidebar />}
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
        {isChecklistRoute ? (
          // Full-bleed rendering for the checklist module (no inner card/container)
          <Routes>
            <Route path="dashboard" element={<LeadsDashboardPage />} />
            <Route path="sales" element={<SalesEntry />} />
            <Route path="my-sales" element={<MyLeadSalesPage />} />
            <Route path="checklist" element={<LeadsChecklistPage />} />
            <Route path="*" element={<LeadsDashboardPage />} />
          </Routes>
        ) : (
          <div className="max-w-5xl mx-auto px-8 py-10">
            <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl shadow-2xl shadow-black/20 p-8 min-h-[60vh]">
              <Routes>
                <Route path="dashboard" element={<LeadsDashboardPage />} />
                <Route path="sales" element={<SalesEntry />} />
                <Route path="my-sales" element={<MyLeadSalesPage />} />
                <Route path="checklist" element={<LeadsChecklistPage />} />
                <Route path="*" element={<LeadsDashboardPage />} />
              </Routes>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default LeadsLayout;
