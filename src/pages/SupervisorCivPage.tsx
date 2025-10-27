import React from 'react';
import PresenceTAStandalone from '../supervisor/PresenceTAStandalone';
import NouveautesPdfTopBar from '../components/NouveautesPdfTopBar';
import NouveautesPdfBanner from '../components/NouveautesPdfBanner';

const SupervisorCivPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Tableau Superviseur — CANAL+ CIV</h1>
        <p className="text-blue-200 mb-6">Espace temporaire. KPIs à brancher sur collection "sales" (région CIV).</p>
        {/* Presence TA (superviseur CIV uniquement) */}
        <div className="mb-6">
          <PresenceTAStandalone
            title="🗓️ Présence TA — ORANGE CANAL+"
            persistKey="presence_ta_civ_supervisor"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/10 rounded-lg p-4 border border-white/10">
            <p className="text-blue-200 text-sm">Ventes jour</p>
            <p className="text-3xl font-extrabold">—</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4 border border-white/10">
            <p className="text-blue-200 text-sm">Ventes 7j</p>
            <p className="text-3xl font-extrabold">—</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4 border border-white/10">
            <p className="text-blue-200 text-sm">Taux conv.</p>
            <p className="text-3xl font-extrabold">—</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4 border border-white/10">
            <p className="text-blue-200 text-sm">Top vendeur</p>
            <p className="text-3xl font-extrabold">—</p>
          </div>
        </div>
        {/* Nouveautés PDF (upload + activation + aperçu) */}
        <div className="mt-6 bg-white/10 rounded-lg border border-white/10 p-4">
          <h2 className="text-lg font-semibold mb-2">Nouveautés • PDF</h2>
          <p className="text-blue-200 text-sm mb-3">Publie le PDF des nouveautés pour les agents CIV et active/désactive sa visibilité.</p>
          <div className="mb-4">
            <NouveautesPdfTopBar />
          </div>
          <NouveautesPdfBanner />
        </div>
        <div className="mt-6 bg-white/10 rounded-lg border border-white/10 p-4">
          <p className="text-blue-200 text-sm mb-2">Chronologie dernières 24h</p>
          <div className="h-48 flex items-center justify-center text-blue-300">Graphique prochainement…</div>
        </div>
      </div>
    </div>
  );
};

export default SupervisorCivPage;
