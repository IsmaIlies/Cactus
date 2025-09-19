import React, { useEffect, useState } from 'react';
import { listenUserRecalls, markRecallStatus, postponeRecall, Recall } from '../services/recallService';
import { useAuth } from '../contexts/AuthContext';

interface RecallQueueProps { limit?: number; }

const formatTime = (ts: any) => { try { if (ts?.toDate) return ts.toDate().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); } catch {}; return ''; };
const timeDiffMinutes = (ts: any) => { try { const target = ts?.toDate ? ts.toDate() : new Date(ts); const diffMs = target.getTime() - Date.now(); return Math.round(diffMs / 60000); } catch { return 0; } };
const badgeColor = (reason: string) => { switch(reason){ case 'no-answer': return 'bg-yellow-100 text-yellow-700 border-yellow-300'; case 'partial': return 'bg-orange-100 text-orange-700 border-orange-300'; case 'follow-up': return 'bg-blue-100 text-blue-700 border-blue-300'; default: return 'bg-gray-100 text-gray-600 border-gray-300'; } };

const RecallQueue: React.FC<RecallQueueProps> = ({ limit = 8 }) => {
  const { user } = useAuth();
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if(!user?.id) return; const unsub = listenUserRecalls(user.id, list => { setRecalls(list); setLoading(false); }); return () => unsub(); }, [user?.id]);
  const visible = recalls.slice(0, limit);
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">À rappeler</h3>
        {loading && <span className="text-[10px] text-gray-400">Chargement…</span>}
      </div>
      {visible.length === 0 && !loading && (<div className="text-xs text-gray-400 py-4 text-center">Aucun rappel planifié</div>)}
      <ul className="space-y-2 overflow-y-auto pr-1 flex-1">
        {visible.map(r => { const mDiff = timeDiffMinutes(r.scheduledFor); const late = mDiff < 0; return (
          <li key={r.id} className={`border rounded-md px-3 py-2 text-xs flex flex-col gap-1 relative ${late ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}> 
            <div className="flex justify-between items-start gap-2">
              <div className="font-medium text-gray-800 truncate">{r.clientFirstName} {r.clientLastName}</div>
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0 ${badgeColor(r.reason)}`}>{r.reason}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-mono text-gray-600">{r.phone}</span>
              <span className={`text-[10px] font-semibold ${late ? 'text-red-600' : 'text-gray-500'}`}>{late ? `${Math.abs(mDiff)}m retard` : `dans ${mDiff}m`}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <span>prévu {formatTime(r.scheduledFor)}</span>
              {r.saleId && <span className="px-1 bg-gray-200 rounded">vente</span>}
            </div>
            <div className="flex gap-1 mt-1">
              <button onClick={() => markRecallStatus(r.id,'done')} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded text-[10px] py-1">OK</button>
              <button onClick={() => postponeRecall(r.id,10)} className="px-2 bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-100 text-[10px]">+10m</button>
              <button onClick={() => markRecallStatus(r.id,'skipped')} className="px-2 bg-white border border-gray-300 rounded text-gray-600 hover:bg-gray-100 text-[10px]">Skip</button>
            </div>
          </li> ); })}
      </ul>
      {recalls.length > limit && (<div className="text-[10px] text-gray-400 mt-2 text-right">+ {recalls.length - limit} autres…</div>)}
    </div>
  );
};

export default RecallQueue;
