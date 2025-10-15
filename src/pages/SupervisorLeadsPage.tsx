import React from 'react';
import SupervisorLeadOffersImport from '../leads/components/SupervisorLeadOffersImport';

const SupervisorLeadsPage: React.FC = () => {
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Supervision LEADS</h1>
          <p className="text-sm text-gray-600">Importer un fichier CSV pour mettre à jour le catalogue d'intitulés d'offre utilisé côté agents.</p>
        </div>
        <SupervisorLeadOffersImport />
      </div>
    </div>
  );
};

export default SupervisorLeadsPage;
