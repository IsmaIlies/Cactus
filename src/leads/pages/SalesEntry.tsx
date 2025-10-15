import React from "react";
import Stepper from "../components/sales/Stepper";
import StepA from "../components/sales/StepA";
import StepB from "../components/sales/StepB";
import StepC from "../components/sales/StepC";
import SuccessModal from "../components/sales/SuccessModal";
import { OFFER_OPTIONS, FormState, Errors, defaultState, TouchedState, AdditionalOffer } from "../types/sales";
import { calcProgress, ratioToColor, isStepValid, getStepFields, stepOrder } from "../utils/progress";
import { saveLeadSale } from "../services/leadsSalesService";
import { useAuth } from "../../contexts/AuthContext";
import { auth } from "../../firebase";

const steps = [
  {
    title: "Informations de base",
    description: "Identifiant du dossier et logistique technicien",
  },
  {
    title: "Détails de l’offre",
    description: "Contenu de l’offre et référence panier",
  },
  {
    title: "Contexte & contact",
    description: "Statut fiche, origine et contact téléphonique",
  },
];

const emptyTouched: TouchedState = {
  numeroId: false,
  typeOffre: false,
  dateTechnicien: false,
  intituleOffre: false,
  referencePanier: false,
  ficheDuJour: false,
  origineLead: false,
  telephone: false,
};

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `offer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const SalesEntry: React.FC = () => {
  const { user } = useAuth();
  const [form, setForm] = React.useState<FormState>({ ...defaultState });
  const [errors, setErrors] = React.useState<Errors>({});
  const [touched, setTouched] = React.useState<TouchedState>({ ...emptyTouched });
  const [currentStep, setCurrentStep] = React.useState(0);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [additionalOffers, setAdditionalOffers] = React.useState<AdditionalOffer[]>([]);
  const [additionalErrors, setAdditionalErrors] = React.useState<
    Record<string, { intituleOffre?: string; referencePanier?: string }>
  >({});
  const [submitting, setSubmitting] = React.useState(false);
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);

  const fieldRefs = React.useRef<Record<keyof FormState, HTMLElement | null>>({
    numeroId: null,
    typeOffre: null,
    dateTechnicien: null,
    intituleOffre: null,
    referencePanier: null,
    ficheDuJour: null,
    origineLead: null,
    telephone: null,
  });

  const validateField = React.useCallback(
    (field: keyof FormState, value: string, context?: { typeOffre?: string }): string => {
    const trimmed = value.trim();
    const typeContext = context?.typeOffre ?? form.typeOffre;
    switch (field) {
      case "numeroId":
        if (!trimmed) return "Numéro DID requis";
        if (trimmed.length < 3) return "3 caractères minimum";
        return "";
      case "typeOffre":
        if (!trimmed) return "Sélectionner un type d'offre";
        return "";
      case "dateTechnicien": {
        const requiresDate = /internet/i.test(typeContext);
        if (!requiresDate) return "";
        if (!trimmed) return "Date requise";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "Format invalide";
        return "";
      }
      case "intituleOffre":
        if (!trimmed) return "Intitulé requis";
        if (trimmed.length < 2) return "2 caractères minimum";
        return "";
      case "referencePanier":
        if (!trimmed) return "Référence requise";
        return "";
      case "ficheDuJour":
        if (!trimmed) return "Choisir une option";
        return "";
      case "origineLead":
        if (!trimmed) return "Sélectionner l'origine";
        return "";
      case "telephone": {
        if (!trimmed) return "Téléphone requis";
        const phoneRegex = /^[+\d\s().-]{8,}$/;
        if (!phoneRegex.test(trimmed)) return "Format de téléphone invalide";
        return "";
      }
      default:
        return "";
    }
  }, [form.typeOffre]);

  const updateField = (field: keyof FormState, value: string) => {
    const requiresDateAfterUpdate =
      field === "typeOffre" ? /internet/i.test(value) : /internet/i.test(form.typeOffre);

    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "typeOffre" && !requiresDateAfterUpdate) {
        next.dateTechnicien = "";
      }
      return next;
    });

    if (touched[field]) {
      setErrors((prev) => {
        const error = validateField(field, value, field === "typeOffre" ? { typeOffre: value } : undefined);
        if (error) {
          return { ...prev, [field]: error };
        }
        const { [field]: _, ...rest } = prev;
        return rest;
      });
    }

    if (field === "typeOffre" && touched.dateTechnicien) {
      const nextDateValue = requiresDateAfterUpdate ? form.dateTechnicien : "";
      setErrors((prev) => {
        if (!requiresDateAfterUpdate) {
          const { dateTechnicien: _, ...rest } = prev;
          return rest;
        }
        const error = validateField("dateTechnicien", nextDateValue, { typeOffre: value });
        if (error) {
          return { ...prev, dateTechnicien: error };
        }
        const { dateTechnicien: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const addAdditionalOffer = () => {
    const intituleError = validateField("intituleOffre", form.intituleOffre);
    const referenceError = validateField("referencePanier", form.referencePanier);

    if (intituleError || referenceError) {
      setErrors((prev) => ({
        ...prev,
        ...(intituleError ? { intituleOffre: intituleError } : {}),
        ...(referenceError ? { referencePanier: referenceError } : {}),
      }));
      setTouched((prev) => ({
        ...prev,
        intituleOffre: true,
        referencePanier: true,
      }));
      const focusField = intituleError ? "intituleOffre" : "referencePanier";
      fieldRefs.current[focusField]?.focus();
      return;
    }

    setAdditionalOffers((prev) => [
      ...prev,
      {
        id: generateId(),
        intituleOffre: form.intituleOffre.trim(),
        referencePanier: form.referencePanier.trim(),
      },
    ]);

    setForm((prev) => ({
      ...prev,
      intituleOffre: "",
      referencePanier: "",
    }));

    setTouched((prev) => ({
      ...prev,
      intituleOffre: false,
      referencePanier: false,
    }));

    setErrors((prev) => {
      const { intituleOffre, referencePanier, ...rest } = prev;
      return rest;
    });
  };

  const updateAdditionalOffer = (
    id: string,
    field: keyof Pick<AdditionalOffer, "intituleOffre" | "referencePanier">,
    value: string
  ) => {
    setAdditionalOffers((prev) =>
      prev.map((offer) => (offer.id === id ? { ...offer, [field]: value } : offer))
    );
    setAdditionalErrors((prev) => {
      if (!prev[id]) return prev;
      const nextErrors = { ...prev };
      const trimmed = value.trim();
      const errorMessage = field === "intituleOffre" ? "Intitulé requis" : "Référence requise";
      if (!trimmed) {
        nextErrors[id] = { ...nextErrors[id], [field]: errorMessage };
      } else {
        const { [field]: _, ...rest } = nextErrors[id];
        if (Object.keys(rest).length === 0) {
          const { [id]: __, ...remaining } = nextErrors;
          return remaining;
        }
        nextErrors[id] = rest;
      }
      return nextErrors;
    });
  };

  const removeAdditionalOffer = (id: string) => {
    setAdditionalOffers((prev) => prev.filter((offer) => offer.id !== id));
    setAdditionalErrors((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const clearAdditional = () => {
    setAdditionalOffers([]);
    setAdditionalErrors({});
  };

  const validateAdditionalOffers = React.useCallback(
    (shouldSetErrors: boolean) => {
      if (additionalOffers.length === 0) {
        if (shouldSetErrors) setAdditionalErrors({});
        return { valid: true };
      }

      let valid = true;
      let firstInvalid:
        | { id: string; field: keyof Pick<AdditionalOffer, "intituleOffre" | "referencePanier"> }
        | undefined;
      const nextErrors: Record<string, { intituleOffre?: string; referencePanier?: string }> = {};

      additionalOffers.forEach((offer) => {
        const offerErrors: { intituleOffre?: string; referencePanier?: string } = {};
        if (!offer.intituleOffre.trim()) {
          offerErrors.intituleOffre = "Intitulé requis";
          valid = false;
          if (!firstInvalid) {
            firstInvalid = { id: offer.id, field: "intituleOffre" };
          }
        }
        if (!offer.referencePanier.trim()) {
          offerErrors.referencePanier = "Référence requise";
          valid = false;
          if (!firstInvalid) {
            firstInvalid = { id: offer.id, field: "referencePanier" };
          }
        }
        if (Object.keys(offerErrors).length > 0) {
          nextErrors[offer.id] = offerErrors;
        }
      });

      if (shouldSetErrors) {
        setAdditionalErrors(nextErrors);
      }

      return { valid, firstInvalid };
    },
    [additionalOffers]
  );

  const markTouched = (field: keyof FormState) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => {
      const value = form[field];
      const error = validateField(field, value);
      if (error) {
        return { ...prev, [field]: error };
      }
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  };

  const setStepTouched = (stepIndex: number) => {
    const fields = getStepFields(stepIndex);
    setTouched((prev) => {
      const next = { ...prev };
      fields.forEach((field) => {
        next[field] = true;
      });
      return next;
    });
    setErrors((prev) => {
      let updated = { ...prev };
      fields.forEach((field) => {
        const error = validateField(field, form[field]);
        if (error) {
          updated = { ...updated, [field]: error };
        } else {
          const { [field]: _, ...rest } = updated;
          updated = rest;
        }
      });
      return updated;
    });
  };

  const resetForm = (overrides?: Partial<FormState>) => {
    setForm({ ...defaultState, ...(overrides || {}) });
    setErrors({});
    setTouched({ ...emptyTouched });
    setCurrentStep(0);
    clearAdditional();
    setSubmissionError(null);
    setSubmitting(false);
  };

  const handleReset = () => {
    resetForm();
  };

  const handleNext = () => {
    setStepTouched(currentStep);
    const { valid: additionalOk, firstInvalid } =
      currentStep === 1 ? validateAdditionalOffers(true) : { valid: true };
    if (isStepValid(currentStep, form, validateField) && additionalOk) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
      return;
    }
    const fields = getStepFields(currentStep);
    const targetField = fields.find((field) => validateField(field, form[field]));
    if (targetField) {
      fieldRefs.current[targetField]?.focus();
    } else if (currentStep === 1 && firstInvalid) {
      const el = document.getElementById(`additional-${firstInvalid.field}-${firstInvalid.id}`);
      if (el) {
        (el as HTMLInputElement).focus();
      }
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const focusFirstError = (errs: Errors) => {
    const firstField = stepOrder.find((field) => !!errs[field]);
    if (firstField) {
      fieldRefs.current[firstField]?.focus();
    }
  };

  const getPayload = React.useCallback(() => {
    const sanitizedAdditional = additionalOffers.map((offer) => ({
      intituleOffre: offer.intituleOffre.trim(),
      referencePanier: offer.referencePanier.trim(),
    }));

    return {
      numeroId: form.numeroId.trim(),
      typeOffre: form.typeOffre,
      dateTechnicien: form.dateTechnicien.trim() ? form.dateTechnicien : null,
      intituleOffre: form.intituleOffre.trim(),
      referencePanier: form.referencePanier.trim(),
      additionalOffers: sanitizedAdditional,
      ficheDuJour: form.ficheDuJour,
      origineLead: form.origineLead,
      telephone: form.telephone.replace(/\s+/g, "").trim(),
    };
  }, [form, additionalOffers]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const stepErrors: Errors = {};
    stepOrder.forEach((field) => {
      const error = validateField(field, form[field]);
      if (error) {
        stepErrors[field] = error;
      }
    });

    const { valid: extrasValid, firstInvalid } = validateAdditionalOffers(true);

    if (Object.keys(stepErrors).length > 0 || !extrasValid) {
      setErrors(stepErrors);
      setTouched({
        numeroId: true,
        typeOffre: true,
        dateTechnicien: true,
        intituleOffre: true,
        referencePanier: true,
        ficheDuJour: true,
        origineLead: true,
        telephone: true,
      });
      if (!extrasValid) {
        setCurrentStep(1);
        if (firstInvalid) {
          requestAnimationFrame(() => {
            const el = document.getElementById(
              `additional-${firstInvalid.field}-${firstInvalid.id}`
            );
            el?.focus();
          });
        }
      }
      focusFirstError(stepErrors);
      return;
    }

    const payload = getPayload();
    try {
      setSubmitting(true);
      setSubmissionError(null);
      if (!user) {
        setSubmissionError("Authentification requise pour enregistrer une vente.");
        return;
      }
      // Vérifier contraintes des règles Firestore avant write
      if (!payload.origineLead || !["hipto", "dolead", "mm"].includes(payload.origineLead)) {
        setSubmissionError("Origine du lead invalide. Choisis hipto, dolead ou mm.");
        return;
      }
      if (!payload.numeroId || !payload.typeOffre || !payload.telephone) {
        setSubmissionError("Champs requis manquants (numeroId, typeOffre, téléphone).");
        return;
      }
      // Refresh auth token to avoid stale credential issues
      try { await auth.currentUser?.getIdToken(true); } catch { /* noop */ }
      const docToSave = {
        ...payload,
        origineLead: payload.origineLead as "hipto" | "dolead" | "mm",
        createdBy: {
          userId: user.id,
          displayName: user.displayName,
          email: user.email,
        },
      };
      // Debug léger pour vérifier conformité aux règles
      // eslint-disable-next-line no-console
      console.debug("[leads] save", {
        numeroId: docToSave.numeroId,
        typeOffre: docToSave.typeOffre,
        origineLead: docToSave.origineLead,
        telephone: docToSave.telephone,
        mobileCountPreview: docToSave.typeOffre,
      });
      await saveLeadSale(docToSave);
      console.log("payload", payload);
      setShowSuccess(true);
    } catch (error: any) {
      console.error("saveLeadSale failed", error);
      const code = error?.code || error?.details?.rawCode || 'unknown';
      const message = error?.message || '';
      if (code === "permission-denied") {
        setSubmissionError(
          "Accès refusé par les règles Firestore. Vérifie que tu es bien connecté et que l'origine du lead est hipto/dolead/mm."
        );
      } else if (code === 'unauthenticated') {
        setSubmissionError("Session expirée. Merci de vous reconnecter et de réessayer.");
      } else if (code === 'invalid-argument') {
        setSubmissionError("Champs invalides ou manquants. Merci de vérifier le formulaire.");
      } else {
        setSubmissionError(
          `Impossible d'enregistrer la vente (${code}). Réessaie. ${message ? '\\n' + message : ''}`
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleModalClose = () => {
    setShowSuccess(false);
    resetForm();
  };

  const handleNewSale = () => {
    const lastNumeroId = form.numeroId; // preserve current DID
    resetForm({ numeroId: lastNumeroId });
    setShowSuccess(false);
  };

  const registerRef = (field: keyof FormState) =>
    (element: HTMLInputElement | HTMLSelectElement | null) => {
      fieldRefs.current[field] = element;
    };

  const copyNumeroId = async () => {
    try {
      if (!form.numeroId.trim()) return;
      await navigator.clipboard.writeText(form.numeroId.trim());
    } catch (err) {
      console.error("copy failed", err);
    }
  };

  const progress = calcProgress(form, validateField);
  const extraValidCount = additionalOffers.reduce((count, offer) => {
    let current = count;
    if (offer.intituleOffre.trim()) current += 1;
    if (offer.referencePanier.trim()) current += 1;
    return current;
  }, 0);
  const extraTotal = additionalOffers.length * 2;
  const totalValid = progress.validCount + extraValidCount;
  const totalFields = progress.total + extraTotal;
  const ratio = totalFields === 0 ? 0 : totalValid / totalFields;
  const progressColor = ratioToColor(ratio);
  const completedSteps = steps
    .map((_, index) => {
      const baseValid = isStepValid(index, form, validateField);
      if (index === 1) {
        const { valid } = validateAdditionalOffers(false);
        return baseValid && valid ? index : -1;
      }
      return baseValid ? index : -1;
    })
    .filter((index) => index >= 0);

  const isLastStep = currentStep === steps.length - 1;
  const canProceed =
    isStepValid(currentStep, form, validateField) &&
    (currentStep !== 1 || validateAdditionalOffers(false).valid);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-6">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${ratio * 100}%`, background: progressColor }}
        />
      </div>

      <form onSubmit={handleSubmit} onReset={handleReset} className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4">
          <Stepper steps={steps} currentStep={currentStep} completed={completedSteps} />
          <div className="mt-6 hidden text-sm text-white/80 lg:block">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p>
                {totalValid} champ(s) validé(s) sur {totalFields}. Continue ainsi !
              </p>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            {submissionError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submissionError}
              </div>
            )}
            {currentStep === 0 && (
              <StepA
                form={form}
                errors={errors}
                touched={touched}
                onChange={updateField}
                onBlur={markTouched}
                registerRef={registerRef}
                copyNumeroId={copyNumeroId}
                offers={OFFER_OPTIONS}
              />
            )}
            {currentStep === 1 && (
              <StepB
                form={form}
                errors={errors}
                touched={touched}
                onChange={updateField}
                onBlur={markTouched}
                registerRef={registerRef}
                onAddAdditional={addAdditionalOffer}
                additionalOffers={additionalOffers}
                additionalErrors={additionalErrors}
                onUpdateAdditional={updateAdditionalOffer}
                onRemoveAdditional={removeAdditionalOffer}
                disabled={submitting}
              />
            )}
            {currentStep === 2 && (
              <StepC
                form={form}
                errors={errors}
                touched={touched}
                onChange={updateField}
                onBlur={markTouched}
                registerRef={registerRef}
              />
            )}

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <div className="flex gap-3">
                <button
                  type="reset"
                  disabled={submitting}
                  className="bg-gray-100 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-200 transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Réinitialiser
                </button>
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={currentStep === 0 || submitting}
                  className="bg-white px-4 py-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Précédent
                </button>
              </div>
              {!isLastStep ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceed || submitting}
                  className="bg-[#002FA7] text-white px-4 py-2 rounded-md disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[#00208f] transition"
                >
                  Suivant
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={ratio < 1 || submitting}
                  className="bg-[#002FA7] text-white px-4 py-2 rounded-md disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[#00208f] transition"
                >
                  Soumettre
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      <SuccessModal open={showSuccess} onClose={handleModalClose} onNewSale={handleNewSale} />
    </div>
  );
};

export default SalesEntry;
