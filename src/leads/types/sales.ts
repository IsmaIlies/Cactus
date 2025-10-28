export const OFFER_OPTIONS = [
  "Internet",
  "Internet Sosh",
  "Mobile",
  "Mobile Sosh",
  "Autres",
] as const;

export const OFFER_LABELS = [
  "FMR Série Spéciale 20 Go SIM (acq)",
  "FM Série Spéciale 20 Go SIM (acq)",
  "Offre Série Spéciale Livebox Lite Fibre (mig)",
  "Offre Série Spéciale Livebox Lite Fibre (acq)",
  "Série Spéciale La Boîte Sosh Fibre (acq)",
  "FMR Série 120 Go 5G SIM (acq)",
  "Offre Livebox Max Fibre (acq)",
  "FM Sosh 10 Go (10 Go RLH) 6,99 eur (acq)",
  "FM Sosh 30 Go (15 Go RLH) 8,99 eur (acq)",
  "FM Sosh 20 Go Extra 5G 9,99 eur (acq)",
  "FM Sosh 30 Go (15 Go RLH) 8,99 eur (acq)",
  "Remise frais de Mise en Service 39 eur sur SS Sosh Fibre 24,99 eur (acq) (MD)",
  "Remise frais de Mise en Service 49 eur sur offres LB Fibre (acq) (MD)",
  "Offre Livebox Fibre (acq)",
  "FM Sosh 200 Go 5G (30 Go RLH) 14,99 eur (acq)",
  "FM Sosh 300 Go 5G (50 Go RLH) 20,99 eur (acq)",
  "FM Spécial Sosh 100 Go (20 Go RLH) 9,99 eur (acq) (MD)",
  "FM Sosh 5 Go (5 Go RLH) 6,99 eur (acq)",
  "FM Sosh 80 Go (20 Go RLH) 9,99 eur (acq)",
  "FMR 2h 100 Mo bloqué SIM (acq)",
  "FM Spécial Sosh 100 Go (20 Go RLH) 9,99 eur (acq) (MD)",
] as const;

export type OfferType = (typeof OFFER_OPTIONS)[number] | "";
export type FicheValue = "oui" | "non" | "campagne tiède" | "";
export type OrigineLead = "opportunity" | "dolead" | "mm" | "";

export type AdditionalOffer = {
  id: string;
  typeOffre: OfferType | "";
  intituleOffre: string;
  referencePanier: string;
};

export type FormState = {
  numeroId: string;
  typeOffre: OfferType;
  dateTechnicien: string;
  intituleOffre: string;
  referencePanier: string;
  ficheDuJour: FicheValue;
  origineLead: OrigineLead;
  telephone: string;
};

export type Errors = Partial<Record<keyof FormState, string>>;

export const defaultState: FormState = {
  numeroId: "",
  typeOffre: "",
  dateTechnicien: "",
  intituleOffre: "",
  referencePanier: "",
  ficheDuJour: "",
  origineLead: "",
  telephone: "",
};

export type TouchedState = Record<keyof FormState, boolean>;
