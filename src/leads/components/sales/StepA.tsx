import React from "react";
import type { Errors, FormState, TouchedState } from "../../types/sales";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#002FA7] transition";

type StepAProps = {
  form: FormState;
  errors: Errors;
  touched: TouchedState;
  onChange: (field: keyof FormState, value: string) => void;
  onBlur: (field: keyof FormState) => void;
  registerRef: (
    field: keyof FormState
  ) => (element: HTMLInputElement | HTMLSelectElement | null) => void;
  copyNumeroId: () => Promise<void> | void;
  offers: readonly string[];
};

const StepA: React.FC<StepAProps> = ({
  form,
  errors,
  touched,
  onChange,
  onBlur,
  registerRef,
  copyNumeroId,
  offers,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#002FA7]">Informations de base</h2>
          <p className="text-sm text-gray-500">
            Renseigne l’identifiant, le type d’offre et la date d’intervention.
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        <div>
          <label htmlFor="numeroId" className="text-sm font-medium text-gray-700">
            Numéro d'ID
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="numeroId"
              ref={registerRef("numeroId")}
              type="text"
              value={form.numeroId}
              onChange={(e) => onChange("numeroId", e.target.value)}
              onBlur={() => onBlur("numeroId")}
              placeholder="Saisir le numéro d’ID"
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={copyNumeroId}
              className="px-3 py-2 text-sm font-medium text-gray-700 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 transition"
            >
              Copier
            </button>
          </div>
          {touched.numeroId && errors.numeroId && (
            <p className="mt-1 text-sm text-red-600">{errors.numeroId}</p>
          )}
        </div>

        <div>
          <label htmlFor="typeOffre" className="text-sm font-medium text-gray-700">
            Type d'offre
          </label>
          <select
            id="typeOffre"
            ref={registerRef("typeOffre")}
            value={form.typeOffre}
            onChange={(e) => onChange("typeOffre", e.target.value)}
            onBlur={() => onBlur("typeOffre")}
            className={`${inputClass} mt-1`}
          >
            <option value="">Sélectionner une offre</option>
            {offers.map((offer) => (
              <option key={offer} value={offer}>
                {offer}
              </option>
            ))}
          </select>
          {touched.typeOffre && errors.typeOffre && (
            <p className="mt-1 text-sm text-red-600">{errors.typeOffre}</p>
          )}
        </div>

        {/internet/i.test(form.typeOffre) && (
          <div>
            <label htmlFor="dateTechnicien" className="text-sm font-medium text-gray-700">
              Date du technicien
            </label>
            <input
              id="dateTechnicien"
              ref={registerRef("dateTechnicien")}
              type="date"
              value={form.dateTechnicien}
              onChange={(e) => onChange("dateTechnicien", e.target.value)}
              onBlur={() => onBlur("dateTechnicien")}
              placeholder="Sélectionner la date d’intervention"
              className={`${inputClass} mt-1`}
            />
            {touched.dateTechnicien && errors.dateTechnicien && (
              <p className="mt-1 text-sm text-red-600">{errors.dateTechnicien}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StepA;
