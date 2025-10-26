import React from "react";

const MyLeadEcoutesPage: React.FC = () => {
  return (
    <div className="space-y-6 text-white">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold">N° Écoutes</h1>
          <p className="text-sm text-blue-100/80">
            Visualise ici les numéros suivis pour tes ventes. Cette section sera prochainement enrichie.
          </p>
        </div>
      </header>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-xl">
        <p className="text-sm text-blue-100/80">
          Nous travaillons encore sur cet espace. Tu pourras bientôt y retrouver les numéros d’écoutes associés
          à tes ventes et les statuts correspondants.
        </p>
      </div>
    </div>
  );
};

export default MyLeadEcoutesPage;
