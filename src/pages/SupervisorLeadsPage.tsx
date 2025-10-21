import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import SupervisorLeadOffersImport from '../leads/components/SupervisorLeadOffersImport';

const SupervisorLeadsPage: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const a = String(area || '').toLowerCase();
  // Guard: this page must only be visible under the 'leads' supervisor space
  if (a !== 'leads') {
    return <Navigate to="/dashboard/superviseur/leads/leads-supervision" replace />;
  }
  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header style aligné avec CIV: grand titre + sous-titre bleu */}
        <div className="rounded-2xl overflow-hidden">
          <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/20 to-slate-900/0 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="uppercase tracking-widest text-[11px] text-blue-300/80">Supervisor Hub</p>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white">Supervision LEADS</h1>
                <p className="mt-2 text-blue-200 max-w-3xl">
                  Gérez le catalogue d'offres mis à disposition des agents. Importez un fichier .xlsx (recommandé) ou .csv
                  pour mettre à jour instantanément les intitulés « Libellé ALF » visibles dans les écrans de vente.
                </p>
              </div>
              <div className="shrink-0">
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 inline-flex items-center gap-3 text-blue-100">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-500 grid place-content-center">
                    <span className="text-white text-lg leading-none">⚡</span>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-blue-200/80">Temps réel</p>
                    <p className="text-sm">Les agents voient les nouvelles offres dès la fin de l'import.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contenu d'import (conserve les cartes claires du module) */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <SupervisorLeadOffersImport />
        </div>
      </div>
    </div>
  );
};

export default SupervisorLeadsPage;
