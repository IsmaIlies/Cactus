import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  AdditionalOffer,
  Errors,
  FormState,
  TouchedState,
} from "../../types/sales";
import { OFFER_LABELS, OFFER_OPTIONS } from "../../types/sales";
import Autocomplete from "../common/Autocomplete";

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
  additionalErrors: Record<string, { typeOffre?: string; intituleOffre?: string; referencePanier?: string }>;
  onUpdateAdditional: (
    id: string,
    field: keyof Pick<AdditionalOffer, "typeOffre" | "intituleOffre" | "referencePanier">,
    value: string
  ) => void;
  onRemoveAdditional: (id: string) => void;
  disabled?: boolean;
  suggestions?: string[];
  groups?: { name: string; items: string[] }[];
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
  suggestions = [],
  groups,
}) => {
  const finalSuggestions: string[] = React.useMemo(
    () => (suggestions.length > 0 ? suggestions.slice() : [...OFFER_LABELS]),
    [suggestions]
  );
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#002FA7]">Détails de l’offre</h2>
        <p className="text-sm text-gray-500">Organisé par sections: Informations, Produits, Options. Les suggestions sont regroupées par Type de produit (prioritaire), ou par Famille si le type n’est pas présent.</p>
      </div>

      {/* Informations */}
      <section className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
        <h3 className="text-sm font-semibold text-gray-800">Informations</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-gray-500">Type d'offre</p>
            <p className="mt-1 text-sm text-gray-900">
              {form.typeOffre || '—'}
            </p>
          </div>
          {/internet/i.test(form.typeOffre) && (
            <div>
              <p className="text-xs text-gray-500">Date du technicien</p>
              <p className="mt-1 text-sm text-gray-900">{form.dateTechnicien || '—'}</p>
            </div>
          )}
        </div>
      </section>

      {/* Produits */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-gray-800">Produits</h3>
          <p className="text-xs text-gray-500">Sélectionne l’intitulé (Libellé ALF) et sa référence panier.</p>
        </div>

        <div className="grid gap-6">
          <div>
            <label htmlFor="intituleOffre" className="text-sm font-medium text-gray-700">
              Intitulé de l'offre (Libellé ALF)
            </label>
            <Autocomplete
              id="intituleOffre"
              inputRef={registerRef("intituleOffre")}
              value={form.intituleOffre}
              onChange={(v) => onChange("intituleOffre", v)}
              suggestions={finalSuggestions}
              groups={groups}
              placeholder="Saisir ou choisir une suggestion"
              className="mt-1"
            />
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
      </section>

      {/* Options */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Options</h3>
            <p className="text-xs text-gray-500">Ajoute des offres complémentaires si nécessaire.</p>
          </div>
          <button
            type="button"
            onClick={onAddAdditional}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-md border border-[#002FA7]/30 bg-[#002FA7]/10 px-3 py-2 text-sm font-medium text-[#002FA7] shadow-sm transition hover:bg-[#002FA7]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Ajouter une offre
          </button>
        </div>

        {additionalOffers.length > 0 && (
          <div className="space-y-4">
            {additionalOffers.map((offer, index) => (
              <div
                key={offer.id}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#002FA7]">
                    Offre supplémentaire #{index + 1}
                  </h4>
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
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Type d'offre</label>
                    <select
                      id={`additional-typeOffre-${offer.id}`}
                      value={offer.typeOffre || ''}
                      onChange={(e) => onUpdateAdditional(offer.id, 'typeOffre', e.target.value)}
                      className={`${inputClass} mt-1`}
                    >
                      <option value="">Sélectionner un type</option>
                      {OFFER_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {additionalErrors[offer.id]?.typeOffre && (
                      <p className="mt-1 text-sm text-red-600">{additionalErrors[offer.id]?.typeOffre}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Intitulé de l'offre (Libellé ALF)
                    </label>
                    <Autocomplete
                      id={`additional-intituleOffre-${offer.id}`}
                      value={offer.intituleOffre}
                      onChange={(v) => onUpdateAdditional(offer.id, "intituleOffre", v)}
                      suggestions={finalSuggestions}
                      groups={groups}
                      placeholder="Ex : Fibre 2G, Forfait 150 Go…"
                      className="mt-1"
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
      </section>
    </div>
  );
};

export default StepB;
