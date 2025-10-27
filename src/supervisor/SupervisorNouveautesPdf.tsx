import React from 'react';
import { useParams } from 'react-router-dom';
import NouveautesPdfTopBar from '../components/NouveautesPdfTopBar';
import NouveautesPdfBanner from '../components/NouveautesPdfBanner';

const SupervisorNouveautesPdf: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const isCiv = String(area).toLowerCase() === 'civ';

  return (
    <div className="space-y-4">
      <div className="bg-white/10 rounded-lg border border-white/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Nouveautés • PDF</h2>
            <p className="text-blue-200 text-sm">Publier, activer et prévisualiser le PDF des nouveautés pour les agents {isCiv ? 'CIV' : (area || '').toUpperCase()}.</p>
          </div>
          {!isCiv && (
            <span className="text-[11px] text-amber-300">Conseillé pour l’espace CIV</span>
          )}
        </div>
        <div className="mt-4">
          <NouveautesPdfTopBar />
        </div>
      </div>
      <div className="bg-white/10 rounded-lg border border-white/10 p-4">
        <NouveautesPdfBanner />
      </div>
    </div>
  );
};

export default SupervisorNouveautesPdf;
