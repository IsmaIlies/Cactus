import { AppSpace } from '../services/userSpaces';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  email?: string | null;
  spaces: AppSpace[];
  onSelect: (space: AppSpace) => void;
  onClose: () => void;
}

const LABELS: Record<AppSpace, string> = {
  CANAL_FR: 'CANAL+ France',
  CANAL_CIV: 'CANAL+ Côte d’Ivoire',
  LEADS: 'LEADS',
};

export default function SpacePickerModal({ open, email, spaces, onSelect, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-2 text-slate-300 hover:bg-white/10 hover:text-white"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Sélection d’espace</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Choisissez votre espace</h3>
          {email && (
            <p className="mt-1 text-sm text-slate-300">Compte: <span className="text-white font-medium">{email}</span></p>
          )}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {spaces.map((s) => (
              <button
                key={s}
                onClick={() => onSelect(s)}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:scale-[1.01] hover:border-cyan-400/30 hover:bg-cyan-400/10"
              >
                <div className="text-sm font-semibold text-white">{LABELS[s]}</div>
                <div className="mt-1 text-xs text-slate-300">Accéder à l’espace {LABELS[s]}</div>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              </button>
            ))}
          </div>
          <p className="mt-5 text-[12px] text-slate-400">Astuce: votre choix sera mémorisé pour la prochaine connexion.</p>
        </div>
      </div>
    </div>
  );
}
