import React from "react";

interface TeamMember {
  name: string;
  sales: number;
}

interface TeamSalesProps {
  members: TeamMember[];
}

const TeamSales: React.FC<TeamSalesProps> = ({ members }) => {
  // Filtrer uniquement les membres qui ont des ventes
  const activeSellers = members.filter((member) => member.sales > 0);

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
      <h2 className="text-lg font-medium text-gray-900 mb-4">
        Ventes de l'équipe aujourd'hui
      </h2>
      {activeSellers.length > 0 ? (
        <div className="space-y-3">
          {activeSellers.map((member, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="text-sm font-medium">{member.name}</span>
              <span className="text-sm font-medium text-cactus-600">
                {member.sales} vente{member.sales > 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-4">
          Aucune vente aujourd'hui
        </p>
      )}
    </div>
  );
};

export default TeamSales;
