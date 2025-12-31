import React from "react";
import { Check, Sparkles, Tv, Film, Trophy } from "lucide-react";
import { CallData } from "../pages/CallScriptPage";

interface CanalPitchStepProps {
  callData: CallData;
  setCallData: (updater: (prev: CallData) => CallData) => void;
}

const canalOffers = [
  { id: "canal", name: "CANAL+", highlights: ["Chaîne premium", "Cinéma et séries Canal", "Docs & divertissement"] },
  { id: "canal-cine-series", name: "CANAL+ Ciné Séries", highlights: ["Netflix", "Paramount+", "Apple TV+", "HBO", "OCS", "Chaînes Ciné Canal"] },
  { id: "canal-sport", name: "CANAL+ Sport", highlights: ["UEFA (selon droits)", "Top 14", "Pro D2", "Sports majeurs"] },
  { id: "canal-100", name: "Option 100% CANAL", highlights: ["Max de contenus Canal+", "Sport + Ciné/Séries", "Éligible packs complets"] },
];

const needOptions = [
  { key: "cinema", label: "Cinéma" },
  { key: "europe", label: "Coupe d’Europe" },
  { key: "rugby", label: "Top 14 / Pro D2" },
  { key: "series", label: "Ciné Séries (plateformes)" },
] as const;

const CanalPitchStep: React.FC<CanalPitchStepProps> = ({ callData, setCallData }) => {
  const [needs, setNeeds] = React.useState<Record<string, boolean>>({});
  const freq = (callData?.preferences?.watchingFrequency || "").toLowerCase();
  const isFrequent = /souvent|fr[eé]quent/i.test(freq) || freq === "frequent";

  const toggleNeed = (k: string) => setNeeds((p) => ({ ...p, [k]: !p[k] }));

  const addToScript = (text: string) => {
    setCallData((prev) => ({ ...prev, offerScript: [prev.offerScript || "", text].filter(Boolean).join("\n") }));
  };

  return (
    <div className="space-y-4">
      {!isFrequent && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-yellow-900">
          Visible après un usage fréquent. Vous pouvez tout de même proposer Canal+ si pertinent.
        </div>
      )}

      <div className="rounded-xl border border-cyan-300/40 bg-cyan-50 p-4">
        <h3 className="font-semibold text-cyan-900 mb-2">Accroche Canal+</h3>
        <p className="text-black">
          Par rapport à ce que vous venez de me dire, est‑ce que vous avez déjà pensé à Canal+ ?
          Je vous en parle car beaucoup de clients pensent que Canal+ c’est 40€ par mois. Je vous rassure, ce n’est plus tout à fait le cas.
        </p>
        <button type="button" onClick={() => addToScript("Accroche Canal+ posée et objection prix rassurée.")}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 text-sm">
          <Sparkles className="w-4 h-4" /> Ajouter au script
        </button>
      </div>

      <div className="rounded-xl border border-emerald-300/40 bg-emerald-50 p-4">
        <h3 className="font-semibold text-emerald-900 mb-2">Mettre en avant l’offre selon les besoins</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {needOptions.map((n) => (
            <label key={n.key} className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm border ${needs[n.key] ? "border-emerald-600 bg-white" : "border-emerald-300 bg-white"}`}>
              <input type="checkbox" checked={!!needs[n.key]} onChange={() => toggleNeed(n.key)} /> {n.label}
            </label>
          ))}
        </div>

        <div className="space-y-2 text-black">
          {needs.cinema && (
            <p className="inline-flex items-center gap-2"><Film className="w-4 h-4 text-emerald-700" /> Vous le savez, Canal+ c’est la chaîne du Cinéma.</p>
          )}
          {needs.europe && (
            <p className="inline-flex items-center gap-2"><Tv className="w-4 h-4 text-emerald-700" /> Avec l’option 100% Canal dont je vous parle, vous avez l’ensemble des matchs de coupe d’Europe.</p>
          )}
          {needs.rugby && (
            <p className="inline-flex items-center gap-2"><Trophy className="w-4 h-4 text-emerald-700" /> Avec l’option 100% Canal, vous avez l’ensemble des matchs du Top 14 et de la Pro D2.</p>
          )}
          {needs.series && (
            <p className="inline-flex items-center gap-2"><Tv className="w-4 h-4 text-emerald-700" />
              Canal+ Ciné Séries c’est plusieurs plateformes de séries (Netflix, Paramount+, Apple TV+, HBO…) + les chaînes Ciné Canal et OCS. (≈70€ de plateformes séries cumulées)
            </p>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
          <p className="text-black">
            Alors comme je vous ai dit, le prix public n’est pas de 40€ mais de …
            Mais comme vous êtes client Orange, pour vous, en ce moment nous avons négocié un tarif préférentiel de <span className="font-semibold">XX€</span>,
            et nous avons demandé de le stabiliser et le maintenir pendant <span className="font-semibold">24 mois</span> !
          </p>
        </div>

        <button type="button" onClick={() => addToScript("Besoins cochés et avantages Canal+ présentés.")}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm">
          <Check className="w-4 h-4" /> Ajouter au script
        </button>
      </div>

      <div className="rounded-xl border border-indigo-300/40 bg-indigo-50 p-4">
        <h3 className="font-semibold text-indigo-900 mb-2">Toutes les offres CANAL+ (vue TA)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {canalOffers.map((o) => (
            <div key={o.id} className="rounded-lg border border-indigo-200 bg-white p-3">
              <div className="font-semibold text-indigo-900 mb-2">{o.name}</div>
              <ul className="space-y-1 text-sm text-black">
                {o.highlights.map((h, i) => (
                  <li key={i} className="inline-flex items-center gap-2"><Check className="w-4 h-4 text-indigo-600" /> {h}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CanalPitchStep;
