import React from "react";

interface TeamMember {
  name: string;
  sales: number;
}

interface TeamSalesProps {
  members: TeamMember[];
}

const TeamSales: React.FC<TeamSalesProps> = ({ members }) => {
  // Garde seulement les vendeurs actifs (>=1 vente)
  const activeSellers = members.filter((m) => m.sales > 0);
  const totalSales = activeSellers.reduce((sum, m) => sum + m.sales, 0);
  const topSales = activeSellers.reduce((max, m) => (m.sales > max ? m.sales : max), 0);
  const topCount = activeSellers.filter(m => m.sales === topSales).length;

  return (
    <div
      className="rounded-xl overflow-hidden border border-cactus-200 bg-gradient-to-br from-cactus-50 via-white to-cactus-100 shadow-none md:shadow-sm p-4 md:p-5"
      aria-label="Ventes de l'équipe aujourd'hui"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cactus-600 text-white text-sm font-semibold shadow-sm md:shadow md:border md:border-white/20">{totalSales}</span>
          <div>
            <h2 className="text-base md:text-lg font-semibold text-gray-900 leading-tight">
              Ventes de l'équipe aujourd'hui
            </h2>
            <p className="text-[11px] md:text-xs text-gray-500">
              {activeSellers.length > 0
                ? `${activeSellers.length} vendeur${activeSellers.length > 1 ? 's' : ''} actif${activeSellers.length > 1 ? 's' : ''}`
                : 'Aucun vendeur actif'}
            </p>
          </div>
        </div>
        {topSales > 0 && (
          <div className="text-[11px] md:text-xs px-2 py-1 rounded-full bg-cactus-100 text-cactus-700 font-medium inline-flex items-center gap-1 self-start sm:self-auto">
            <span className="text-cactus-600">★</span>
            Top {topSales} vente{topSales > 1 ? 's' : ''}{topCount > 1 ? ` (${topCount} ex æquo)` : ''}
          </div>
        )}
      </div>

      {activeSellers.length > 0 ? (
        <ul className="divide-y divide-cactus-100">
          {activeSellers.map((member, idx) => {
            const intensity = member.sales / (topSales || 1); // 0-1
            return (
              <li
                key={idx}
                className="py-3 flex items-center justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {member.name}
                  </p>
                  <div className="mt-1 h-2 w-full rounded-full bg-cactus-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cactus-500/80 group-hover:bg-cactus-600 transition-all"
                      style={{ width: `${Math.max(8, intensity * 100)}%` }}
                      aria-label={`Progression relative: ${Math.round(intensity * 100)}% du top`}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-semibold text-cactus-700">
                    {member.sales}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">
                    vente{member.sales > 1 ? 's' : ''}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-500">Aucune vente aujourd'hui</p>
        </div>
      )}
    </div>
  );
};

export default TeamSales;
