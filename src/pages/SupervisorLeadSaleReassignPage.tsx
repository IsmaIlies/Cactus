import React from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { reassignLeadSale } from '../leads/services/leadsSalesService';
import { useAuth } from '../contexts/AuthContext';

// Petite interface de réattribution d'une vente Leads.
// Usage prévu : superviseur/admin. On saisit l'ID Firestore du document
// et on fournit les infos agent cible (userId, displayName, email).
// Améliorable ensuite : liste auto des agents / recherche / suggestions.

const SupervisorLeadSaleReassignPage: React.FC = () => {
  const { user } = useAuth();
  const [saleId, setSaleId] = React.useState('');
  const [targetUserId, setTargetUserId] = React.useState('');
  const [targetDisplayName, setTargetDisplayName] = React.useState('');
  const [targetEmail, setTargetEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [currentCreatedBy, setCurrentCreatedBy] = React.useState<any>(null);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  const canUse = !!user; // On pourrait ajouter un check role === 'supervisor'

  const fetchSale = async () => {
    setFetchError(null); setCurrentCreatedBy(null); setResult(null);
    if (!saleId.trim()) { setFetchError('ID requis'); return; }
    try {
      const ref = doc(db, 'leads_sales', saleId.trim());
      const snap = await getDoc(ref);
      if (!snap.exists()) { setFetchError('Document introuvable'); return; }
      const data = snap.data();
      setCurrentCreatedBy({
        userId: data?.createdBy?.userId || '(aucun)',
        displayName: data?.createdBy?.displayName || '(vide)',
        email: data?.createdBy?.email || '(vide)',
      });
    } catch (e:any) {
      setFetchError(e?.message || 'Erreur lecture');
    }
  };

  const performReassign = async () => {
    setResult(null);
    if (!saleId.trim() || !targetUserId.trim()) {
      setResult('ID vente et userId cible requis');
      return;
    }
    setLoading(true);
    try {
      await reassignLeadSale(saleId.trim(), {
        userId: targetUserId.trim(),
        displayName: targetDisplayName.trim() || targetEmail.trim() || 'Agent',
        email: targetEmail.trim(),
      });
      setResult('Réassignation effectuée ✔');
      await fetchSale(); // refresh
    } catch (e:any) {
      setResult(e?.message || 'Échec réassignation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto text-white">
      <h1 className="text-2xl font-semibold">Réassignation d'une vente Leads+</h1>
      <p className="text-sm text-blue-200/80">Permet de modifier l'agent auquel la vente est attribuée (mise à jour des champs <code>createdBy.*</code>). Après action, les agrégations basées sur <code>createdBy.userId</code> compteront la vente pour le nouvel agent.</p>

      {!canUse && (
        <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">Accès restreint. Connectez-vous.</div>
      )}

      {canUse && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>ID du document (Firestore)</span>
              <input
                type="text"
                value={saleId}
                onChange={(e)=>setSaleId(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0a152a] px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                placeholder="Ex: abc123..."
              />
            </label>
            <div className="flex items-end gap-3">
              <button
                onClick={fetchSale}
                disabled={!saleId.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold bg-gradient-to-r from-cyan-500/70 to-blue-500/70 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 border border-white/10 shadow-[0_8px_24px_rgba(56,189,248,0.35)]"
              >Charger</button>
            </div>
          </div>

          {fetchError && <div className="text-sm text-rose-300">{fetchError}</div>}

          {currentCreatedBy && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              <p className="font-medium mb-2">Attribution actuelle</p>
              <ul className="space-y-1 text-blue-100/80">
                <li><span className="text-blue-200/70">userId:</span> {currentCreatedBy.userId}</li>
                <li><span className="text-blue-200/70">displayName:</span> {currentCreatedBy.displayName}</li>
                <li><span className="text-blue-200/70">email:</span> {currentCreatedBy.email}</li>
              </ul>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>Nouvel userId</span>
              <input
                type="text"
                value={targetUserId}
                onChange={(e)=>setTargetUserId(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0a152a] px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                placeholder="UID Firebase"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Nouveau displayName (optionnel)</span>
              <input
                type="text"
                value={targetDisplayName}
                onChange={(e)=>setTargetDisplayName(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0a152a] px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                placeholder="TOM HALADJIAN MARIOTTI"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Nouveau email (optionnel)</span>
              <input
                type="email"
                value={targetEmail}
                onChange={(e)=>setTargetEmail(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0a152a] px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
                placeholder="tom@exemple.fr"
              />
            </label>
          </div>

          <div>
            <button
              onClick={performReassign}
              disabled={loading || !saleId.trim() || !targetUserId.trim()}
              className="rounded-lg px-5 py-2 text-sm font-semibold bg-gradient-to-r from-purple-500/70 to-indigo-500/70 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 border border-white/10 shadow-[0_8px_24px_rgba(99,102,241,0.35)]"
            >{loading ? 'Réassignation…' : 'Réassigner la vente'}</button>
          </div>

          {result && <div className="text-sm mt-2 {result.includes('✔') ? 'text-emerald-300' : 'text-rose-300'}">{result}</div>}

          <div className="mt-6 text-xs text-blue-200/60 leading-relaxed">
            <p className="font-medium text-blue-100/80 mb-1">Conseils :</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Le <code>userId</code> est essentiel pour que les agrégations (stats par agent) se mettent à jour.</li>
              <li>Tu peux retrouver l'UID de TOM en ouvrant une vente qu'il a réellement saisie et en copiant <code>createdBy.userId</code>.</li>
              <li>Pour un flux plus fluide, envisager d'ajouter un champ dédié (ex: <code>ownerUserId</code>) lors de la création et permettre la sélection directe dans le formulaire.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupervisorLeadSaleReassignPage;
