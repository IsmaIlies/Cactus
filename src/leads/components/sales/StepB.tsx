import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  AdditionalOffer,
  Errors,
  FormState,
  TouchedState,
} from "../../types/sales";
import { OFFER_LABELS } from "../../types/sales";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#002FA7] transition";

type StepBProps = {
  form: FormState;
  errors: Errors;
  touched: TouchedState;
  onChange: (field: keyof FormState, value: string) => void;
  onBlur: (field: keyof FormState) => void;
  registerRef: (
    field: keyof FormState
  ) => (element: HTMLInputElement | HTMLSelectElement | null) => void;
  onAddAdditional: () => void;
  additionalOffers: AdditionalOffer[];
  additionalErrors: Record<string, { intituleOffre?: string; referencePanier?: string }>;
  onUpdateAdditional: (
    id: string,
    field: keyof Pick<AdditionalOffer, "intituleOffre" | "referencePanier">,
    value: string
  ) => void;
  onRemoveAdditional: (id: string) => void;
  disabled?: boolean;
};

const StepB: React.FC<StepBProps> = ({
  form,
  errors,
  touched,
  onChange,
  onBlur,
  registerRef,
  onAddAdditional,
  additionalOffers,
  additionalErrors,
  onUpdateAdditional,
  onRemoveAdditional,
  disabled = false,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#002FA7]">Détails de l’offre</h2>
          <p className="text-sm text-gray-500">
            Décris précisément l’offre vendue et sa référence panier.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddAdditional}
          disabled={disabled}
          className="inline-flex items-center gap-2 self-start rounded-md border border-[#002FA7]/30 bg-[#002FA7]/10 px-3 py-2 text-sm font-medium text-[#002FA7] shadow-sm transition hover:bg-[#002FA7]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Ajouter une offre
        </button>
      </div>

      <div className="grid gap-6">
        <div>
          <label htmlFor="intituleOffre" className="text-sm font-medium text-gray-700">
            Intitulé de l'offre
          </label>
          <select
            id="intituleOffre"
            ref={registerRef("intituleOffre")}
            value={form.intituleOffre}
            onChange={(e) => onChange("intituleOffre", e.target.value)}
            onBlur={() => onBlur("intituleOffre")}
            className={`${inputClass} mt-1`}
          >
            <option value="">Sélectionner une offre</option>
            {OFFER_LABELS.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
          {touched.intituleOffre && errors.intituleOffre && (
            <p className="mt-1 text-sm text-red-600">{errors.intituleOffre}</p>
          )}
        </div>

        <div>
          <label htmlFor="referencePanier" className="text-sm font-medium text-gray-700">
            Référence du panier
          </label>
          <input
            id="referencePanier"
            ref={registerRef("referencePanier")}
            type="text"
            value={form.referencePanier}
            onChange={(e) => onChange("referencePanier", e.target.value)}
            onBlur={() => onBlur("referencePanier")}
            placeholder="Saisir la référence du panier"
            className={`${inputClass} mt-1`}
          />
          {touched.referencePanier && errors.referencePanier && (
            <p className="mt-1 text-sm text-red-600">{errors.referencePanier}</p>
          )}
        </div>
      </div>

      {additionalOffers.length > 0 && (
        <div className="space-y-4">
          {additionalOffers.map((offer, index) => (
            <div
              key={offer.id}
              className="rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#002FA7]">
                  Offre supplémentaire #{index + 1}
                </h3>
                <button
                  type="button"
                  onClick={() => onRemoveAdditional(offer.id)}
                  disabled={disabled}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Intitulé de l'offre
                  </label>
                  <input
                    id={`additional-intituleOffre-${offer.id}`}
                    type="text"
                    value={offer.intituleOffre}
                    onChange={(e) => onUpdateAdditional(offer.id, "intituleOffre", e.target.value)}
                    placeholder="Ex : Fibre 2G, Forfait 150 Go…"
                    className={`${inputClass} mt-1`}
                  />
                  {additionalErrors[offer.id]?.intituleOffre && (
                    <p className="mt-1 text-sm text-red-600">
                      {additionalErrors[offer.id]?.intituleOffre}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Référence du panier
                  </label>
                  <input
                    id={`additional-referencePanier-${offer.id}`}
                    type="text"
                    value={offer.referencePanier}
                    onChange={(e) => onUpdateAdditional(offer.id, "referencePanier", e.target.value)}
                    placeholder="Saisir la référence du panier"
                    className={`${inputClass} mt-1`}
                  />
                  {additionalErrors[offer.id]?.referencePanier && (
                    <p className="mt-1 text-sm text-red-600">
                      {additionalErrors[offer.id]?.referencePanier}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StepB;
