import React, { useState } from 'react';
import { migrateLegacySalesRegionFR, MigrationResult } from '../services/legacyMigrationService';
import { useAuth } from '../contexts/AuthContext';

const ADMIN_EMAILS = [
  'i.brai@mars-marketing.fr'
];

const AdminLegacySalesMigration: React.FC = () => {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [maxBatches, setMaxBatches] = useState(20);

  const isAllowed = user && ADMIN_EMAILS.includes(user.email || '');

  const appendLog = (line: string) => setLog(prev => [...prev, line]);

  const handleRun = async () => {
    if (!isAllowed || running) return;
    setRunning(true);
    setResult(null);
    setLog([]);
    appendLog('Démarrage migration...');
    try {
      const res = await migrateLegacySalesRegionFR(400, maxBatches, (progress) => {
        appendLog(`Progress: scanned=${progress.scanned} updated=${progress.updated} batches=${progress.batches}`);
      });
      setResult(res);
      appendLog('Terminé.');
    } catch (e: any) {
      appendLog('Erreur: ' + (e?.message || String(e)));
    } finally {
      setRunning(false);
    }
  };

  if (!isAllowed) {
    return <div className="p-6 text-red-500">Accès refusé</div>;
  }

  return (
    <div className="p-6 space-y-4 text-sm text-white">
      <h1 className="text-xl font-semibold">Migration Legacy Ventes (Ajouter region: 'FR')</h1>
      <p>Ce module met à jour les documents de la collection <code>sales</code> qui n'ont pas encore de champ <code>region</code>.</p>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">Max Batches
          <input
            type="number"
            min={1}
            max={200}
            value={maxBatches}
            onChange={e => setMaxBatches(Number(e.target.value))}
            className="bg-cactus-700 border border-cactus-600 rounded px-2 py-1 w-24"
          />
        </label>
        <button
          onClick={handleRun}
          disabled={running}
          className={`px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium`}
        >
          {running ? 'Migration en cours...' : 'Lancer la migration'}
        </button>
      </div>
      {result && (
        <div className="mt-4 space-y-1">
          <div>Scannés: {result.scanned}</div>
          <div>Mises à jour: {result.updated}</div>
          <div>Batches: {result.batches}</div>
          <div>Terminé: {result.done ? 'Oui' : 'Non'}</div>
        </div>
      )}
      <div className="mt-4">
        <h2 className="font-medium mb-2">Journal</h2>
        <div className="bg-cactus-800 border border-cactus-600 rounded p-3 h-64 overflow-auto text-xs font-mono whitespace-pre-wrap">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
      <p className="text-yellow-400 text-xs">Après succès, vous pouvez supprimer ce fichier et retirer la route.</p>
    </div>
  );
};

export default AdminLegacySalesMigration;
