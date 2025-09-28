import React from "react";

const MySalesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Mes ventes</h1>
        <p className="text-sm text-gray-500">
          Retrouvez ici vos performances personnelles et vos ventes enregistrées.
        </p>
      </header>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-gray-600 text-sm">
          Cette section est en cours de construction. Vous pourrez bientôt y consulter vos statistiques
          détaillées.
        </p>
      </div>
    </div>
  );
};

export default MySalesPage;
