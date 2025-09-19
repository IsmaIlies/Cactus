import { CallClosure } from "../components/CallClosuresPanel";

// Référentiel des statuts d'appel
// Types actifs: CA+ (positif/issus de refus explicités), CNA (refus/objection/contact non abouti), AUTRE (rappels, suivi)

export const callClosures: CallClosure[] = [
  { code: "CAPLUS", description: "CAPLUS", type: "CA+" },
  { code: "CAPLUSATT", description: "CAPLUSATT", type: "CA+" },
  // CA+ (refus/objection)
  { code: "ROAC", description: "REFUS AVANT CONSENTEMENT (Suite à l’envoi d’un panier, malgré plusieurs relances le client ne répond pas ou indique ne plus vouloir souscrire)", type: "CA+" },
  { code: "ROVB", description: "REFUS VEUT ALLER BOUTIQUE", type: "CA+" },
  { code: "RPI", description: "REFUS PAS INTERESSE / NE VEUT PAS CHANGER", type: "CA+" },
  { code: "ROIPC", description: "REFUS OFFRE INSATISFAIT DES PROGRAMMES CANAL", type: "CA+" },
  { code: "ROT", description: "REFUS CANAL POUR CAUSE TARIFAIRE", type: "CA+" },
  { code: "RATC", description: "REFUS CAR ABONNEMENT TROP CHER", type: "CA+" },
  { code: "MO", description: "MECONTENT ORANGE", type: "CA+" },
  // CNA (Contact non abouti/objection générique)
  { code: "ADCO", description: "A DÉJÀ CANAL (Le client possède déjà une offre CANAL+ ou CANAL+ SAT)", type: "CNA" },
  { code: "BAR", description: "BARRAGE (Malgré 3 tentatives, le client ne souhaite toujours pas échanger avec ORANGE)", type: "CNA" },
  { code: "DI", description: "DIALOGUE IMPOSSIBLE (Impossible de communiquer avec le client de façon claire et explicite)", type: "CNA" },
  { code: "FAU", description: "FAUX NUMÉRO (Numéro incorrect ou invalide)", type: "CNA" },
  { code: "HC", description: "AUTRES CAS HORS CIBLE (Client pro, mauvaise identité, client ayant résilié, etc)", type: "CNA" },
  { code: "NR", description: "NE PLUS CONTACTER PACITEL (Le client s’oppose catégoriquement à l’appel et à tout futur échange)", type: "CNA" },
  { code: "CPAP", description: "CONTACTÉ PAR UN AUTRE PRESTATAIRE (Le client a déjà été contacté par les services ORANGE pour l’offre CANAL+)", type: "CNA" },
  { code: "REP", description: "RÉPONDEUR (À utiliser lorsqu’une fiche remonte avec un répondeur au lieu d’un client en ligne)", type: "CNA" },
  { code: "SR", description: "SOUHAITE RESILIER", type: "CNA" },

  // AUTRE (rappels/suivi)
  { code: "RAP", description: "RAPPEL PERSO (Le client n’est pas disponible immédiatement et demande un rappel)", type: "AUTRE" },
  { code: "RPCE", description: "RAPPEL PERSO CANAL ÉVOQUÉ (L’offre a été présentée, mais le client souhaite réfléchir. Pas d’envoi de mail de commande, mais un mail d’info en guise de support)", type: "AUTRE" },
  { code: "REL", description: "RELANCE (Possibilité de repousser la fiche client à J+1 / J+2)", type: "AUTRE" },
  { code: "NPI", description: "PAS EQUIPE PC", type: "AUTRE" },
];

export default callClosures;
