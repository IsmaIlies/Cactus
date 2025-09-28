import type { FormState } from "../types/sales";

const fieldsInStep: Record<number, Array<keyof FormState>> = {
  0: ["numeroId", "typeOffre", "dateTechnicien"],
  1: ["intituleOffre", "referencePanier"],
  2: ["ficheDuJour", "origineLead", "telephone"],
};

export const stepOrder: Array<keyof FormState> = [
  "numeroId",
  "typeOffre",
  "dateTechnicien",
  "intituleOffre",
  "referencePanier",
  "ficheDuJour",
  "origineLead",
  "telephone",
];

export const ratioToColor = (ratio: number) => {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const hue = 120 * clamped;
  return `hsl(${hue}, 80%, 45%)`;
};

export const calcProgress = (
  form: FormState,
  validateField: (field: keyof FormState, value: string) => string
) => {
  let validCount = 0;
  stepOrder.forEach((field) => {
    if (!validateField(field, form[field])) validCount += 1;
  });
  return {
    ratio: validCount / stepOrder.length,
    validCount,
    total: stepOrder.length,
  };
};

export const isStepValid = (
  stepIndex: number,
  form: FormState,
  validateField: (field: keyof FormState, value: string) => string
) => {
  const fields = fieldsInStep[stepIndex] || [];
  return fields.every((field) => !validateField(field, form[field]));
};

export const getStepFields = (stepIndex: number) => fieldsInStep[stepIndex] || [];
