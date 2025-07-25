import React from 'react';

interface SalespersonPerformance {
  name: string;
  dailySales: number;
  monthlySales: number;
}

interface PerformanceTableProps {
  salespeople: SalespersonPerformance[];
}

const PerformanceTable: React.FC<PerformanceTableProps> = ({ salespeople }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Performances individuelles</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ventes du jour</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ventes du mois</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {salespeople.map((person, index) => (
              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{person.name}</td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{person.dailySales}</td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{person.monthlySales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PerformanceTable;