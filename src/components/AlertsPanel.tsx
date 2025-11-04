import React from 'react';

export type SmartAlert = {
  id: string;
  type: 'spike' | 'pending' | 'iban' | 'record';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
};

const colorBySeverity: Record<SmartAlert['severity'], string> = {
  info: 'from-sky-500/20 to-blue-500/10 border-blue-400/30',
  warning: 'from-amber-500/20 to-yellow-500/10 border-amber-400/30',
  danger: 'from-rose-500/20 to-red-500/10 border-rose-400/30',
  success: 'from-emerald-500/20 to-green-500/10 border-emerald-400/30',
};

export default function AlertsPanel({ alerts }: { alerts: SmartAlert[] }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="space-y-3">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`rounded-xl border bg-gradient-to-br p-3 sm:p-4 text-sm text-white shadow-lg transition-[transform,opacity] duration-300 hover:scale-[1.01] ${colorBySeverity[a.severity]}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {a.type === 'spike' && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-400/30">📈</span>}
              {a.type === 'pending' && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/30">⏳</span>}
              {a.type === 'iban' && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-400/30">💳</span>}
              {a.type === 'record' && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/30">🏆</span>}
            </div>
            <div>
              <p className="font-semibold leading-5">{a.title}</p>
              <p className="text-blue-100/90 leading-5">{a.message}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
