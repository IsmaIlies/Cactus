import React from 'react';
import { useParams } from 'react-router-dom';
import NouveautesPdfTopBar from '../components/NouveautesPdfTopBar';
import NouveautesPdfBanner from '../components/NouveautesPdfBanner';

const SupervisorNouveautesPdf: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const a = String(area).toLowerCase();
  const isFr = a === 'fr';

  return (
    <div className="space-y-4">
      {isFr && (
        <div className="bg-white/10 rounded-lg border border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Gestion des Nouveautés (PDF & Vidéos)</h2>
              <p className="text-blue-200 text-sm">Uploader, activer et gérer l’historique des PDF et des vidéos visibles par les agents FR.</p>
            </div>
          </div>
          <div className="mt-4">
            <NouveautesPdfTopBar />
          </div>
        </div>
      )}
      <div className="bg-white/10 rounded-lg border border-white/10 p-4">
        <NouveautesPdfBanner />
      </div>
    </div>
  );
};

export default SupervisorNouveautesPdf;
