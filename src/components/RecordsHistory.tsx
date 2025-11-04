import React from 'react';

type DayRecord = { date: string; total: number; topAgent?: string; };

type AgentRecord = { name: string; total: number };

type MonthRecord = { month: string; total: number };

export default function RecordsHistory({ days, agents, months }: { days: DayRecord[]; agents: AgentRecord[]; months: MonthRecord[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-white text-lg font-semibold mb-2">Historique des records</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-blue-200 text-sm mb-2">Meilleures journées</p>
          <ul className="space-y-1">
            {days.slice(0, 5).map((d) => (
              <li key={d.date} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 border border-white/10">
                <span className="text-sm">{new Date(d.date).toLocaleDateString('fr-FR')}</span>
                <span className="font-semibold">{d.total}</span>
              </li>
            ))}
            {days.length === 0 && <li className="text-blue-300 text-sm">—</li>}
          </ul>
        </div>
        <div>
          <p className="text-blue-200 text-sm mb-2">Top agents</p>
          <ul className="space-y-1">
            {agents.slice(0, 5).map((a) => (
              <li key={a.name} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 border border-white/10">
                <span className="text-sm">{a.name}</span>
                <span className="font-semibold">{a.total}</span>
              </li>
            ))}
            {agents.length === 0 && <li className="text-blue-300 text-sm">—</li>}
          </ul>
        </div>
        <div>
          <p className="text-blue-200 text-sm mb-2">Meilleurs mois</p>
          <ul className="space-y-1">
            {months.slice(0, 5).map((m) => (
              <li key={m.month} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 border border-white/10">
                <span className="text-sm">{m.month}</span>
                <span className="font-semibold">{m.total}</span>
              </li>
            ))}
            {months.length === 0 && <li className="text-blue-300 text-sm">—</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
