import React from "react";

interface Sale {
  id: string;
  name: string;
  date: any;
  offer: string;
  userId: string;
  status?: string;
}

interface SmartTodoProps {
  sales: Sale[];
  user: any;
}

// Génère des tâches à partir des ventes récentes
const generateTodos = (sales: Sale[], user: any) => {
  // Filtrer les ventes du user et les ventes récentes (ex: 3 derniers jours)
  const now = new Date();
  const recentSales = sales.filter(s => {
    const d = s.date?.toDate ? s.date.toDate() : new Date(s.date);
    return d && (now.getTime() - d.getTime()) < 3 * 24 * 3600 * 1000;
  });

  // Exemples d'actions à générer
  return recentSales.map(sale => {
    let action = "";
    if (sale.status === "relance") {
      action = `Rappeler ${sale.name} – relance 9h`;
    } else if (sale.offer === "canal") {
      action = `Vérifier dossier C+ pour ${sale.name}`;
    } else {
      action = `Suivre ${sale.name}`;
    }
    return {
      id: sale.id,
      label: action,
    };
  });
};

const SmartTodo: React.FC<SmartTodoProps> = ({ sales, user }) => {
  const todos = generateTodos(sales, user);
  if (todos.length === 0) return null;
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100 mb-4">
      <h2 className="text-lg font-bold text-cactus-700 mb-2">À faire (automatique)</h2>
      <ul className="space-y-2">
        {todos.map(todo => (
          <li key={todo.id} className="flex items-center justify-between">
            <span>{todo.label}</span>
            <button className="px-2 py-1 text-xs bg-cactus-600 text-white rounded hover:bg-cactus-700 transition">Actionner</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SmartTodo;
