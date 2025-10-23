import React from "react";
import type { Errors, FormState, TouchedState } from "../../types/sales";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#002FA7] transition";

type StepCProps = {
  form: FormState;
  errors: Errors;
  touched: TouchedState;
  onChange: (field: keyof FormState, value: string) => void;
  onBlur: (field: keyof FormState) => void;
  registerRef: (
    field: keyof FormState
  ) => (element: HTMLInputElement | HTMLSelectElement | null) => void;
};

const radioOptions: Array<{ value: FormState["ficheDuJour"]; label: string }> = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
  { value: "campagne tiède", label: "Campagne tiède" },
];

const StepC: React.FC<StepCProps> = ({ form, errors, touched, onChange, onBlur, registerRef }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#002FA7]">Contexte & contact</h2>
        <p className="text-sm text-gray-500">
          Finalise la fiche : statut du jour, origine et téléphone du lead.
        </p>
      </div>

      <fieldset className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
        <legend className="text-sm font-medium text-gray-700 px-1">Fiche du jour</legend>
        <div className="mt-3 flex flex-wrap gap-4">
          {radioOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="ficheDuJour"
                value={option.value}
                checked={form.ficheDuJour === option.value}
                onChange={(e) => onChange("ficheDuJour", e.target.value)}
                onBlur={() => onBlur("ficheDuJour")}
                className="accent-[#002FA7]"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {touched.ficheDuJour && errors.ficheDuJour && (
          <p className="mt-1 text-sm text-red-600">{errors.ficheDuJour}</p>
        )}
      </fieldset>

      <div className="grid gap-6">
        <div>
          <label htmlFor="origineLead" className="text-sm font-medium text-gray-700">
            Origine du lead
          </label>
          <select
            id="origineLead"
            ref={registerRef("origineLead")}
            value={form.origineLead}
            onChange={(e) => onChange("origineLead", e.target.value)}
            onBlur={() => onBlur("origineLead")}
            className={`${inputClass} mt-1`}
          >
            <option value="">Sélectionner l'origine</option>
            <option value="HIPTO">HIPTO</option>
            <option value="DOLEAD">DOLEAD</option>
            <option value="MM">MM</option>
          </select>
          {touched.origineLead && errors.origineLead && (
            <p className="mt-1 text-sm text-red-600">{errors.origineLead}</p>
          )}
        </div>

        <div>
          <label htmlFor="telephone" className="text-sm font-medium text-gray-700">
            Numéro de téléphone de la fiche
          </label>
          <input
            id="telephone"
            ref={registerRef("telephone")}
            type="tel"
            value={form.telephone}
            onChange={(e) => onChange("telephone", e.target.value)}
            onBlur={() => onBlur("telephone")}
            placeholder="Ex : +33621345678"
            className={`${inputClass} mt-1`}
          />
          {touched.telephone && errors.telephone && (
            <p className="mt-1 text-sm text-red-600">{errors.telephone}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StepC;
