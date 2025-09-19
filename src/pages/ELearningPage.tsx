import React, { useEffect, useMemo, useState, ReactNode, useRef } from "react";
import { FiSmile, FiBarChart2, FiSettings, FiCheckCircle, FiTrash2, FiAlertTriangle, FiLayers, FiFilm, FiPlayCircle } from "react-icons/fi";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { addDoc, collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";

/* -------------------------------------------------------------------------- */
/*                           Modules & banques de quiz                        */
/* -------------------------------------------------------------------------- */

type ModuleDef = { title: string; description: string; icon: ReactNode; progress: number; action: string };

// Nouveaux modules orientés univers audiovisuels + offres Canal+
const initialModules: ModuleDef[] = [
  // (Entrée Canal+ (Univers) retirée)
  { title: "Netflix (Univers)", description: "Catalogue, stratégie, productions originales, algorithmes.", icon: <FiPlayCircle size={30} className="text-cactus-600" />, progress: 0, action: "Commencer" },
  { title: "Max & Paramount+", description: "Fusion des catalogues, licences, franchises clés.", icon: <FiFilm size={30} className="text-cactus-600" />, progress: 0, action: "Commencer" },
  { title: "OCS (Cinéma)", description: "Ciné OCS, accords HBO historiques, positionnement ciné.", icon: <span className="text-2xl">🎬</span>, progress: 0, action: "Commencer" },
  { title: "Culture Audiovisuelle", description: "Panorama global chaînes / plateformes / évolution marché.", icon: <span className="text-2xl">🌍</span>, progress: 0, action: "Commencer" },
  { title: "Méthode LISKA", description: "Structuration d'appel: Lien, Investigation, Solution, Killer objections, Acte.", icon: <span className="text-2xl">📞</span>, progress: 0, action: "Commencer" },
];

type Q = { question: string; options: string[]; correct: number };

// Banques de 10 questions SIMPLIFIÉES (niveau plus accessible)
const canalQuestions: Q[] = [
  { question: "Canal+ est surtout connue comme…", options: ["Une chaîne payante", "Une radio locale", "Un réseau social", "Un magasin"], correct: 0 },
  { question: "Application pour regarder Canal+ sur mobile ?", options: ["myCANAL", "CanalPrint", "CanalRadio", "CanalDrive"], correct: 0 },
  { question: "Émission satirique célèbre avec des marionnettes ?", options: ["Les Guignols", "Le Journal du Hard", "Questions pour un Champion", "Top Chef"], correct: 0 },
  { question: "Sport très important pour Canal+ ?", options: ["Football", "Pétanque", "Ski nautique", "Escrime"], correct: 0 },
  { question: "Série policière emblématique Canal+ ?", options: ["Engrenages", "Friends", "Narcos", "Columbo"], correct: 0 },
  { question: "Le modèle économique principal de Canal+ ?", options: ["Abonnement", "Uniquement pub", "Vente à l'unité", "Donations"], correct: 0 },
  { question: "Plateforme intégrée dans certaines offres Canal+ ?", options: ["Netflix", "Snapchat", "Telegram", "MSN"], correct: 0 },
  { question: "Label centré sur les séries ?", options: ["Canal+ Séries", "Canal+ Kids", "Canal+ Foot", "Canal+ Docs"], correct: 0 },
  { question: "But de myCANAL ?", options: ["Regarder les contenus partout", "Imprimer des affiches", "Jouer à la console", "Coder un site"], correct: 0 },
  { question: "Canal+ se distingue surtout par…", options: ["Contenus premium payants", "Des recettes de cuisine", "Du shopping live", "Des jeux concours seulement"], correct: 0 },
];

const netflixQuestions: Q[] = [
  { question: "Netflix est…", options: ["Une plateforme de streaming", "Une banque", "Une messagerie", "Un magasin de jouets"], correct: 0 },
  { question: "Diffusion classique d'une saison Netflix ?", options: ["Tous les épisodes d'un coup", "1 épisode par an", "Uniquement le final", "Jamais deux à la suite"], correct: 0 },
  { question: "Objectif des recommandations Netflix ?", options: ["Proposer des contenus adaptés", "Vendre des vêtements", "Faire du courrier", "Changer la langue"], correct: 0 },
  { question: "Exemple de série qui a lancé Netflix en original ?", options: ["House of Cards", "Plus Belle la Vie", "Friends", "Kaamelott"], correct: 0 },
  { question: "Nouvelle formule plus abordable ?", options: ["Avec publicité", "Sans image", "Uniquement audio", "Sans catalogue"], correct: 0 },
  { question: "Type principal de contenus ?", options: ["Films & séries", "Recettes papier", "Voitures neuves", "Billets d'avion"], correct: 0 },
  { question: "Netflix investit dans…", options: ["Des séries originales", "Des cabines téléphoniques", "Des fax", "Des magazines papier"], correct: 0 },
  { question: "Usage du profil utilisateur ?", options: ["Personnaliser les choix", "Bloquer la lecture", "Effacer internet", "Donner une adresse"], correct: 0 },
  { question: "Avantage du streaming par rapport au DVD ?", options: ["Lecture immédiate", "Faut graver un disque", "Obligé de poster", "Attendre un mois"], correct: 0 },
  { question: "Pourquoi Netflix produit ses propres séries ?", options: ["Avoir des contenus à elle", "Fermer le service", "Vendre des journaux", "Supprimer les sous-titres"], correct: 0 },
];

const maxParamountQuestions: Q[] = [
  { question: "Max (ex HBO Max) est surtout reconnue pour…", options: ["Ses séries HBO et Warner", "Des recettes de cuisine", "La météo agricole", "Des fax"], correct: 0 },
  { question: "Paramount+ apporte notamment…", options: ["Les franchises Star Trek & Mission: Impossible", "Uniquement du jardinage", "Uniquement météo", "Que des jeux télé"], correct: 0 },
  { question: "Atout majeur de la fusion Max + Paramount+ côté cinéma :", options: ["Blockbusters + catalogues historiques", "Moins de films", "Zéro nouveautés", "Uniquement bandes annonces"], correct: 0 },
  { question: "Univers jeunesse fort grâce à…", options: ["Nickelodeon & animation", "Fax éducatifs", "Chansons météo", "Catalogues vides"], correct: 0 },
  { question: "Pourquoi garder une série ?", options: ["Audience + marque + coût OK", "Titre très long seulement", "Logo bleu", "Aucun spectateur"], correct: 0 },
  { question: "Une franchise vivante se développe via…", options: ["Spin-offs & produits dérivés", "Suppression totale", "Fax de nuit", "Silence marketing"], correct: 0 },
  { question: "Max propose aussi des contenus DC (Batman, etc.) car…", options: ["Même groupe Warner", "Accord avec Netflix", "Licence publique libre", "Copie illégale"], correct: 0 },
  { question: "Paramount+ est forte sur l'animation car…", options: ["Nickelodeon (SpongeBob, etc.)", "Partenariat boulangerie", "Achat de stations météo", "Licence fax mondiale"], correct: 0 },
  { question: "Rôle des data internes ?", options: ["Orienter renouvellement & production", "Supprimer tout au hasard", "Remplacer les réalisateurs", "Imprimer des DVD"], correct: 0 },
  { question: "Limite anti-spoil ou sorties attendues =", options: ["Épisodes parfois hebdo", "Tout en 1 an", "Jamais de calendrier", "Lecture inversée"], correct: 0 },
  { question: "Bonne expérience 4K nécessite…", options: ["Débit suffisant + encodage + écran compatible", "Un fax rapide", "Une disquette neuve", "Aucune bande passante"], correct: 0 },
  { question: "Téléchargement hors ligne utile pour…", options: ["Regarder sans connexion", "Augmenter facture data", "Bloquer la lecture", "Supprimer le catalogue"], correct: 0 },
  { question: "Parental control (contrôle parental) sert à…", options: ["Filtrer contenus selon profil", "Augmenter le volume", "Traduire tout", "Créer des bugs"], correct: 0 },
  { question: "Licence mondiale =", options: ["Exploitée sur plusieurs territoires", "Jamais exportée", "Zéro doublage possible", "Uniquement locale"], correct: 0 },
  { question: "Max valorise ses originals (ex: The Last of Us) car…", options: ["Différenciation et fidélisation", "Ça réduit l'intérêt", "Ça supprime la marque", "Ça bloque la VOD"], correct: 0 },
  { question: "Synergie Max + Paramount+ =", options: ["Plus de genres (séries prestige + franchises + famille)", "Moins de diversité", "Suppression VO", "Fin des nouveautés"], correct: 0 },
  { question: "Facteur clé rétention plateforme premium ?", options: ["Flux régulier de nouveautés", "Aucune nouveauté", "Catalogues figés", "Menus cachés"], correct: 0 },
  { question: "Pourquoi proposer un résumé valeur client ?", options: ["Clarifier bénéfices concrets", "Allonger inutilement", "Créer confusion", "Éviter décision"], correct: 0 },
];

const ocsQuestions: Q[] = [
  { question: "OCS c'est surtout…", options: ["Films récents + séries", "Jeux vidéo live", "Radio FM locale", "Prévisions météo"], correct: 0 },
  { question: "Séries très associées à OCS ?", options: ["Séries HBO", "Télé-réalité locale", "Cours de maths", "Recettes papier"], correct: 0 },
  { question: "Le label cinéma chez OCS ?", options: ["Ciné OCS", "OCS Sport", "OCS Jardin", "OCS Météo"], correct: 0 },
  { question: "Objectif principal d'OCS ?", options: ["Proposer du cinéma récent", "Vendre des vêtements", "Remplacer les consoles", "Donner la météo"], correct: 0 },
  { question: "Concurrent type d'OCS ?", options: ["Grandes plateformes streaming", "Boulangeries", "Stations-service", "Papeteries"], correct: 0 },
  { question: "Après la fin HBO il fallait…", options: ["Se différencier autrement", "Tout arrêter", "Passer en audio seulement", "Supprimer l'appli"], correct: 0 },
  { question: "Pour garder de la valeur OCS ajoute…", options: ["Films + production locale", "Moins de contenus", "Zéro VOST", "Tout retirer"], correct: 0 },
  { question: "Tendance actuelle du cinéma ?", options: ["Arrive plus vite en streaming", "Retour total VHS", "Fin des plateformes", "Plus aucun film"], correct: 0 },
  { question: "Améliore l'expérience ?", options: ["Sélections éditoriales", "Suppression recherche", "Lecture forcée", "Menus cachés"], correct: 0 },
  { question: "Si OCS ne s'adapte pas…", options: ["Perte d'abonnés", "Plus d'abonnés directs", "Gain automatique", "Rien ne change"], correct: 0 },
];

const cultureAvQuestions: Q[] = [
  { question: "Pourquoi l'attention est fragmentée ?", options: ["Beaucoup de plateformes", "1 seule chaîne existe", "Pas d'internet", "Plus de smartphones"], correct: 0 },
  { question: "Entreprise qui produit ET diffuse =", options: ["Intégration verticale", "Télétexte", "Fax marketing", "Collage papier"], correct: 0 },
  { question: "Mesurer fidélité =", options: ["Taux de rétention", "Nombre de pubs vues", "Taille TV", "Jour de pluie"], correct: 0 },
  { question: "Formule avec pubs =", options: ["AVOD / hybride", "Zéro contenu", "Téléphone", "Impression papier"], correct: 0 },
  { question: "Règle européenne =", options: ["Quota œuvres locales", "Interdiction VO", "Fin des séries", "Suppression droits"], correct: 0 },
  { question: "Bonne qualité perçue aidée par…", options: ["Démarrage rapide", "Couleur télécommande", "Forme antenne", "Taille carton"], correct: 0 },
  { question: "Fenêtre cinéma plus courte =", options: ["Arrivée plus vite en streaming", "Plus jamais en streaming", "Retour VHS", "Sortie 3D obligatoire"], correct: 0 },
  { question: "Données servent à…", options: ["Choisir & personnaliser", "Supprimer les films", "Bloquer l'appli", "Tout rendre aléatoire"], correct: 0 },
  { question: "Agrégation d'offres causée par…", options: ["Trop d'abonnements", "Plus d'écrans", "Plus de fibre", "Pas de contenus"], correct: 0 },
  { question: "Valeur d'une licence forte ?", options: ["Exister sur plusieurs formats", "Rester cachée", "Ne jamais évoluer", "Être supprimée"], correct: 0 },
];

// Banque LISKA simplifiée (phases méthode de vente)
const liskaQuestions: Q[] = [
  { question: "Phase 'Lien' sert à…", options: ["Créer confiance", "Dire le prix direct", "Couper la parole", "Rester silencieux"], correct: 0 },
  { question: "Avant de proposer une solution il faut…", options: ["Comprendre le besoin", "Donner une remise", "Clore l'appel", "Changer de sujet"], correct: 0 },
  { question: "Nombre de questions utiles (env.) ?", options: ["4 à 6", "0", "15", "1 seule toujours"], correct: 0 },
  { question: "Bonne transition Investigation → Solution ?", options: ["Résumer ce qu'il a dit", "Ignorer et continuer", "Parler prix", "Dire au revoir"], correct: 0 },
  { question: "Répondre à une objection =", options: ["Écouter + répondre + vérifier", "Parler plus fort", "Changer de sujet", "Raccrocher"], correct: 0 },
  { question: "Structure simple de proposition ?", options: ["Vous avez dit X → donc Y", "Dire tout le catalogue", "Lire un script robot", "Poser aucune question"], correct: 0 },
  { question: "Soft close =", options: ["Avancer vers accord", "Exiger paiement immédiat", "Menacer d'arrêter", "Éviter la conclusion"], correct: 0 },
  { question: "Mauvaise pratique objection ?", options: ["Répondre par 3 sujets sans lien", "Clarifier le point", "Reformuler", "Vérifier compréhension"], correct: 0 },
  { question: "Signe investigation trop courte ?", options: ["Proposition générique", "Client raconte son besoin", "Notes détaillées", "Solutions ciblées"], correct: 0 },
  { question: "Objectif global méthode ?", options: ["Adapter l'offre", "Parler le plus vite", "Ignorer objections", "Vendre sans écouter"], correct: 0 },
];

// Pour compatibilité ancienne logique
const streamingQuizQuestions: Q[] = canalQuestions;

// Banques spécifiques OFFRES Canal+ (uniquement disponibles dans l'onglet Quiz, pas dans la progression modules)
const canalBaseOfferQuestions: Q[] = [
  { question: "Canal+ (base) inclut surtout…", options: ["Créations Canal+ & films", "Uniquement dessin animé", "Uniquement météo", "Aucun film"], correct: 0 },
  { question: "myCANAL permet de…", options: ["Regarder sur mobile", "Faire des achats voiture", "Envoyer des fax", "Réparer une TV"], correct: 0 },
  { question: "Dans l'offre de base on trouve…", options: ["Des séries originales", "Uniquement radio", "Que du sport mineur", "Rien en replay"], correct: 0 },
  { question: "Formule de base = accès à…", options: ["Cinéma + séries essentielles", "Toutes les compétitions sport", "0 contenu live", "Uniquement magazines papier"], correct: 0 },
  { question: "Le renouvellement des films est…", options: ["Régulier", "Jamais", "Une fois tous les 10 ans", "Bloqué"], correct: 0 },
  { question: "Fonction clé plateforme", options: ["Replay + multi-écran", "Impression CD", "Scanner QR code obligatoire", "Stockage fichiers perso"], correct: 0 },
  { question: "Canal+ propose aussi…", options: ["Du live", "Des plats cuisinés", "Des jeux physiques", "Des logiciels bureautiques"], correct: 0 },
  { question: "Accès hors domicile ?", options: ["Oui via app", "Non jamais", "Seulement en magasin", "Uniquement sur fax"], correct: 0 },
  { question: "Langues disponibles", options: ["VF et VO", "Uniquement latin", "Aucune piste audio", "Morse uniquement"], correct: 0 },
  { question: "Public cible", options: ["Grand public premium", "Uniquement enfants", "Uniquement gamers", "Professionnels BTP"], correct: 0 },
];

const canalCineSeriesQuestions: Q[] = [
  { question: "Ciné Séries ajoute…", options: ["Plus de films & séries", "Plus de matchs locaux", "0 contenu film", "Uniquement talk-shows"], correct: 0 },
  { question: "Objectif principal", options: ["Renforcer catalogue fiction", "Remplacer tout sport", "Supprimer cinéma", "Basculer audio seul"], correct: 0 },
  { question: "Inclut souvent des partenaires…", options: ["(ex: Netflix suivant pack)", "Boulangeries locales", "Stations essence", "Services postaux"], correct: 0 },
  { question: "Positionnement", options: ["Cinéma récent + séries exclusives", "Uniquement JT", "Seulement archives muettes", "Radio musicale"], correct: 0 },
  { question: "Avantage pour un amateur de séries", options: ["Accès créations + exclus", "Moins de séries", "Aucune VO", "Pas de nouveautés"], correct: 0 },
  { question: "Peut inclure agrégation…", options: ["Plateformes tierces", "Chaînes météo locales", "Applications cuisine", "Jeux physiques"], correct: 0 },
  { question: "Le sport dans Ciné Séries est…", options: ["Moins central", "Total", "Absent de base et interdit", "Unique contenu"], correct: 0 },
  { question: "Type d'utilisateur ciblé", options: ["Cinéma / série addict", "Collectionneur timbres", "Coach sportif pro", "Mécanicien"], correct: 0 },
  { question: "Fonction VO / sous-titres", options: ["Oui disponible", "Non jamais", "Payant séparé", "Réservé week-end"], correct: 0 },
  { question: "Renouvellement catalogue", options: ["Fréquent", "Quasi nul", "Décennal", "Inconnu"], correct: 0 },
];

const canalSportQuestions: Q[] = [
  { question: "Canal+ Sport couvre…", options: ["Compétitions majeures", "Uniquement e-sport retro", "Zéro direct", "Seulement podcasts"], correct: 0 },
  { question: "Exemple contenu", options: ["Football / rugby", "Cuisine froide", "Opéra uniquement", "Bricolage"], correct: 0 },
  { question: "Intérêt principal", options: ["Matches en direct", "Révisions scolaires", "Jeux jouets physiques", "Lecture romans"], correct: 0 },
  { question: "Public visé", options: ["Fans multi-sports", "Chorale uniquement", "Éleveurs bovins", "Astronomes"], correct: 0 },
  { question: "Fonction multi-cam possible", options: ["Oui parfois", "Jamais", "Uniquement radio", "Obligatoire fax"], correct: 0 },
  { question: "Analyse & magazines", options: ["Complètent le live", "Remplacent tout", "Interdits", "Suppriment les ralentis"], correct: 0 },
  { question: "Replay sport", options: ["Disponible", "Jamais", "Payant hors offre", "Illégal"], correct: 0 },
  { question: "Abonné typique", options: ["Suit plusieurs championnats", "Ne regarde rien", "Cherche romans", "Prépare examens"], correct: 0 },
  { question: "Qualité vidéo visée", options: ["HD / parfois 4K", "Uniquement 144p", "Texte brut", "Diaporama fax"], correct: 0 },
  { question: "Notifications live", options: ["Alertes scores", "Recettes cuisine", "Météo marine", "Cours math"], correct: 0 },
];

const canal100Questions: Q[] = [
  { question: "100% regroupe…", options: ["Cinéma + séries + sport", "Uniquement sport", "Uniquement radio", "Que des journaux"], correct: 0 },
  { question: "Avantage clé", options: ["Tout en un", "Moins de contenus", "Suppression replay", "Aucun live"], correct: 0 },
  { question: "Idéal pour…", options: ["Famille aux goûts variés", "Personne sans écran", "Amateur d'un seul film", "Usage fax"], correct: 0 },
  { question: "Agrégation plateformes", options: ["Oui selon pack", "Impossible légalement", "Interdit techniquement", "Jamais proposé"], correct: 0 },
  { question: "Gestion profils", options: ["Plusieurs utilisateurs", "1 seul obligatoire", "Aucun profil", "Profil fax"], correct: 0 },
  { question: "Le sport dans 100%", options: ["Inclus", "Retiré", "Interdit", "En option payée par minute"], correct: 0 },
  { question: "Cinéma dans 100%", options: ["Large sélection", "Aucun film", "1 film/an", "Que bandes annonces"], correct: 0 },
  { question: "Séries originales", options: ["Accessibles", "Bloquées", "Retirées", "Audio seul"], correct: 0 },
  { question: "Public cible", options: ["Usage intensif global", "Uniquement seniors hors ligne", "Profession BTP spécialisé", "Aucun abonné"], correct: 0 },
  { question: "Souplesse contenus", options: ["Large variété", "Mono-thème", "Uniquement talk", "Uniquement météo"], correct: 0 },
];

/* -------------------------------------------------------------------------- */
/*                          Quiz Canal+ / Streaming (UI)                      */
/* -------------------------------------------------------------------------- */

function StreamingQuiz({ open, onClose, onFinished }: { open: boolean; onClose: () => void; onFinished?: () => void }) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [timer, setTimer] = useState(25);

  useEffect(() => {
    if (!open) return;
    setCurrent(0); setSelected(null); setScore(0); setFinished(false); setAnswers([]); setTimer(25);
  }, [open]);

  useEffect(() => {
    if (!open || finished || selected !== null) return;
    const id = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          setAnswers(a => [...a, -1]);
          clearInterval(id);
          if (current < streamingQuizQuestions.length - 1) setCurrent(c => c + 1); else setFinished(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [open, finished, selected, current]);

  useEffect(() => { if (finished && onFinished) onFinished(); }, [finished, onFinished]);

  const handleAnswer = (idx: number) => {
    if (selected !== null || finished) return;
    setSelected(idx);
    setAnswers(a => [...a, idx]);
    if (idx === streamingQuizQuestions[current].correct) setScore(s => s + 1);
    setTimeout(() => {
      setSelected(null);
      if (current < streamingQuizQuestions.length - 1) setCurrent(c => c + 1); else setFinished(true);
    }, 800);
  };

  if (!open) return null;

  if (finished) {
    const success = score >= Math.ceil(streamingQuizQuestions.length * 0.6);
    const handleReplay = () => {
      setCurrent(0); setSelected(null); setScore(0); setFinished(false); setAnswers([]); setTimer(25);
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/60 animate-fadeIn">
        <div className="relative w-full max-w-3xl mx-auto bg-white rounded-3xl shadow-2xl border border-gray-200 p-8 flex flex-col text-center">
          <div className="mb-4">
            {success ? <span className="text-green-500 text-5xl mb-2 inline-block">✔️</span> : <span className="text-red-500 text-5xl mb-2 inline-block">❌</span>}
            <h3 className="text-2xl font-extrabold mb-1">Quiz Canal+ / Streaming terminé</h3>
            <p className={`text-xl font-bold mb-4 ${success ? 'text-green-600' : 'text-red-600'}`}>Score : {score} / {streamingQuizQuestions.length}</p>
            <p className="text-gray-600 mb-4 text-sm">{success ? 'Bravo, très bon résultat !' : 'Rejoue pour améliorer ton score.'}</p>
          </div>
          <div className="overflow-y-auto pr-2 mb-6" style={{ maxHeight: '45vh' }}>
            <div className="grid gap-3 text-left sm:grid-cols-2">
              {streamingQuizQuestions.map((q, i) => (
                <div key={i} className="p-3 rounded-xl border bg-gray-50 flex flex-col gap-1 text-xs">
                  <div className="font-semibold">{i + 1}. {q.question}</div>
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded bg-green-100 text-green-700 mr-2 text-[10px]">Bonne : {q.options[q.correct]}</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${answers[i] === q.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>Ta réponse : {answers[i] >= 0 ? q.options[answers[i]] : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center gap-4 flex-wrap">
            <button onClick={handleReplay} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow hover:bg-indigo-700 transition" autoFocus>Rejouer</button>
            <button onClick={onClose} className="px-6 py-2.5 bg-cactus-600 text-white rounded-xl text-sm font-bold shadow hover:bg-cactus-700 transition">Fermer</button>
          </div>
        </div>
      </div>
    );
  }

  const q = streamingQuizQuestions[current];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/60 animate-fadeIn">
      <div className="relative w-full max-w-xl mx-auto bg-white rounded-2xl p-6 shadow-2xl border border-gray-200">
        <button className="absolute top-4 right-4 text-gray-500 hover:text-cactus-600 transition text-xl font-bold" aria-label="Fermer" onClick={onClose}>×</button>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold">Canal+ / Streaming — Question {current + 1} / {streamingQuizQuestions.length}</h3>
          <div className={`px-3 py-1 rounded text-xs font-semibold ${timer <= 5 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{timer}s</div>
        </div>
        <p className="mb-4 font-semibold text-sm">{q.question}</p>
        <div className="flex flex-col gap-2">
          {q.options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswer(idx)}
              disabled={selected !== null}
              className={`p-3 border rounded text-left text-sm transition-all duration-300
                ${selected === idx ? 'bg-gray-100 border-gray-400' : 'bg-white border-gray-200'}
                ${selected !== null && idx === q.correct ? 'border-green-500' : ''}
                ${selected !== null && selected === idx && selected !== q.correct ? 'border-red-500' : ''}`}
            >
              <span className="inline-block w-6 mr-3 font-bold">{String.fromCharCode(65 + idx)}</span>
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// (Ancienne version du composant StreamingQuiz supprimée ci-dessus)

// --- Fin réelle composant StreamingQuiz ---

const QuizQCM = ({ moduleName, questions, onFinish, onClose }: { moduleName: string; questions: Q[]; onFinish: (score: number) => void; onClose: () => void }) => {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [timer, setTimer] = useState(25);
  const [feedback, setFeedback] = useState<null | "good" | "bad">(null);
  const savedRef = useRef(false);

  useEffect(() => {
    if (finished) return;
    setTimer(25);
    const id = setInterval(() => {
      setTimer((t) => {
        if (selected !== null) return t;
        if (t <= 1) {
          setAnswers((a) => [...a, -1]);
          clearInterval(id);
          if (current < questions.length - 1) setCurrent((c) => c + 1);
          else setFinished(true);
        }
        return t > 1 ? t - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [current, finished, selected, questions.length]);

  const handleAnswer = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    setAnswers((a) => [...a, idx]);
    if (idx === questions[current].correct) {
      setScore((s) => s + 1);
      setFeedback("good");
    } else {
      setFeedback("bad");
    }
    setTimeout(() => {
      setFeedback(null);
      if (current < questions.length - 1) {
        setCurrent((c) => c + 1);
        setSelected(null);
        setTimer(25);
      } else {
        setFinished(true);
      }
    }, 1200);
  };

  // Sauvegarde automatique dès que le quiz est terminé (une seule fois)
  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true;
      try { onFinish(score); } catch {}
    }
  }, [finished, score, onFinish]);

  if (finished) {
    const success = score >= Math.ceil(questions.length * 0.6);
    const handleReplay = () => {
      setCurrent(0); setSelected(null); setScore(0); setFinished(false); setAnswers([]); setTimer(25); savedRef.current = false;
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/60 animate-fadeIn">
        <div className="relative w-full max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl border border-gray-200 animate-zoomBounce text-center flex flex-col" style={{ maxHeight: '94vh' }}>
          <div className="mb-6 flex flex-col items-center justify-center pt-10">
            {success ? <span className="text-green-500 text-6xl mb-4">✔️</span> : <span className="text-red-500 text-6xl mb-4">❌</span>}
            <h3 className="text-3xl font-extrabold mb-2">Quiz {moduleName} terminé</h3>
            <p className={`text-2xl font-bold mb-4 ${success ? 'text-green-600' : 'text-red-600'}`}>Score : {score} / {questions.length}</p>
            <p className="text-gray-600 mb-4 text-base">{success ? 'Bravo, excellent !' : 'Rejoue pour progresser immédiatement.'}</p>
          </div>
          <div className="overflow-y-auto px-4" style={{ maxHeight: '55vh' }}>
            <div className="grid gap-4 text-left mt-2 md:grid-cols-2">
              {questions.map((q, i) => (
                <div key={i} className="p-4 rounded-2xl border bg-gray-50 flex flex-col gap-2 text-sm">
                  <div className="font-semibold flex-1">{i + 1}. {q.question}</div>
                  <div>
                    <span className="inline-block px-2 py-1 rounded bg-green-100 text-green-700 mr-2 text-[11px]">Bonne : {q.options[q.correct]}</span>
                    <span className={`inline-block px-2 py-1 rounded text-[11px] ${answers[i] === q.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>Ta réponse : {answers[i] >= 0 ? q.options[answers[i]] : 'Non répondu'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center flex-wrap gap-4 mt-10 pb-12">
            <button onClick={handleReplay} className="px-8 py-3 bg-indigo-600 text-white rounded-xl text-lg font-bold shadow hover:bg-indigo-700 transition" autoFocus>Rejouer</button>
            <button onClick={onClose} className="px-8 py-3 bg-cactus-600 text-white rounded-xl text-lg font-bold shadow hover:bg-cactus-700 transition">Fermer</button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[current];
  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl shadow p-6 relative">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold">
          {moduleName} — Question {current + 1} / {questions.length}
        </h3>
        <div className={`px-3 py-1 rounded ${timer <= 5 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>{timer}s</div>
      </div>
      <p className="mb-4 font-semibold">{q.question}</p>
      <div className="flex flex-col gap-2">
        {q.options.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => handleAnswer(idx)}
            disabled={selected !== null}
            className={`p-3 border rounded text-left transition-all duration-300
              ${selected === idx ? "bg-gray-100 border-gray-400" : "bg-white border-gray-200"}
              ${selected !== null && idx === q.correct ? "border-green-500" : ""}
              ${selected !== null && selected === idx && selected !== q.correct ? "border-red-500" : ""}`}
          >
            <span className="inline-block w-6 mr-3 font-bold">{String.fromCharCode(65 + idx)}</span>
            {opt}
          </button>
        ))}
      </div>
      {feedback && (
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-6 px-6 py-3 rounded-xl font-bold text-lg shadow-lg animate-fadeIn ${feedback === "good" ? "bg-green-100 text-green-700 border border-green-400" : "bg-red-100 text-red-700 border border-red-400"}`}>
          {feedback === "good" ? "Bonne réponse !" : "Mauvaise réponse"}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                  Page main                                  */
/* -------------------------------------------------------------------------- */

const ELearningPage: React.FC = () => {
  const { user } = useAuth();
  // AuthContext expose user.id = firebaseUser.uid
  const currentUserId = useMemo(() => (user ? (user as any).id : null), [user]);

  type TabKey = "overview" | "modules" | "quiz" | "progress" | "settings";
  const [selectedTab, setSelectedTab] = useState<TabKey>("overview");
  const [modules] = useState(initialModules);
  const [showQuiz, setShowQuiz] = useState<false | string>(false);
  const [quizQuestionsForModule, setQuizQuestionsForModule] = useState<Q[] | null>(null);

  const [moduleStats, setModuleStats] = useState<Record<string, { timeSpent: number; score: number; total: number; progress: number }>>({});
  const [progression, setProgression] = useState(0);
  const [scoreHistory, setScoreHistory] = useState<Record<string, { score: number; date: number }[]>>({});
  const [lastError, setLastError] = useState<string | null>(null);
  // Etats UI onglet Modules
  // (Ancien état modules retiré)
  // Etats UI onglet Vue d'ensemble
  const [overviewSort, setOverviewSort] = useState<'recent'|'score'|'name'>('recent');
  const [overviewShowAllModules, setOverviewShowAllModules] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [confirmingLocalReset, setConfirmingLocalReset] = useState(false);
  const [localResetDone, setLocalResetDone] = useState(false);
  // Onglet Quiz simplifié (plus de modules ici)
  // leaderboard supprimé (simplification demandée)

  // Un module est considéré terminé dès qu'un quiz a été effectué (total > 0)
  const modulesDone = Object.values(moduleStats).filter((m) => (m.total || 0) > 0).length; // Conservé pour stats globales
  const totalModules = initialModules.length;

  // Listeners
  useEffect(() => {
    if (!currentUserId) return;

    // progression doc
    const unsubProg = onSnapshot(
      doc(db, "progression", currentUserId),
      (snap) => {
        if (snap.exists()) setProgression(Number(snap.data().global) || 0);
        else {
          // Créer doc si absent (évite permission-denied ultérieurs sur write)
          setDoc(doc(db, "progression", currentUserId), { global: 0 }, { merge: true }).catch(e => console.warn('[E-LEARN] auto-create progression doc failed', e));
        }
      },
      (err) => {
        console.error('[E-LEARN] progression listener error', err, { uid: currentUserId });
        if (err?.code === 'permission-denied') setLastError("Accès progression refusé (rules). Réessaie dans 2s...");
      }
    );

  // (listener classement retiré)

    // scores utilisateur -> stats + progression
  const unsubUser = onSnapshot(query(collection(db, "quizScores"), where("userId", "==", currentUserId)), (snap) => {
      const stats: Record<string, { timeSpent: number; score: number; total: number; progress: number }> = {};
      const history: Record<string, { score: number; date: number }[]> = {};
      for (const mod of initialModules) {
        stats[mod.title] = { timeSpent: 0, score: 0, total: 0, progress: 0 };
        history[mod.title] = [];
      }
      const done = new Set<string>();
      snap.forEach((d) => {
        const data: any = d.data();
        const m = data.module;
        // Ignorer les offres hors progression (elles ne sont pas dans initialModules)
        if (!m || !stats[m]) return;
        const qLen = Array.isArray(data.questions) ? data.questions.length : 0;
        if (qLen > 0 && qLen >= stats[m].total) stats[m].total = qLen; // favorise le plus grand (dernière tentative la plus complète)
        if (typeof data.score === 'number') stats[m].score = data.score; // dernier score enregistré
        if (stats[m].total > 0) stats[m].progress = stats[m].score / stats[m].total;
        if (typeof data.score === 'number' && data.createdAt) history[m].push({ score: data.score, date: data.createdAt });
        if (stats[m].total > 0) done.add(m);
      });
      setModuleStats(stats);
      setScoreHistory(history);
      const global = Math.min(1, done.size / initialModules.length);
      setProgression(global);
      setDoc(doc(db, "progression", currentUserId), { global }, { merge: true }).catch(() => {});
    }, (err) => {
      console.error('[E-LEARN] quizScores listener error', err, { uid: currentUserId });
      if (err?.code === 'permission-denied') setLastError("Accès quizScores refusé (rules)");
    });

    return () => {
      try { unsubProg(); } catch {}
      try { unsubUser(); } catch {}
    };
  }, [currentUserId]);

  // Enregistrement d'un score (utilisé par QuizQCM et par Streaming via window)
  const saveQuizResult = async (moduleName: string, score: number, questions: Q[]) => {
    if (!currentUserId) {
      setLastError("Utilisateur non authentifié – impossible d'enregistrer le quiz.");
      console.warn('[E-LEARN] saveQuizResult: no currentUserId');
      return;
    }

    console.log('[E-LEARN] saveQuizResult called', { moduleName, score, qLen: questions.length, uid: currentUserId });

    // Mise à jour optimiste AVANT écriture Firestore
    let newGlobal = 0;
    const isOfferOnly = ['Canal+','Canal+ Ciné Séries','Canal+ Sport','Canal+ 100%'].includes(moduleName);
    if (!isOfferOnly) {
      setModuleStats((prev) => {
        const clone = { ...prev } as any;
        const prevEntry = clone[moduleName] || { timeSpent: 0, score: 0, total: 0, progress: 0 };
        const total = questions.length || prevEntry.total;
        clone[moduleName] = {
          timeSpent: prevEntry.timeSpent,
          score,
          total,
          progress: total > 0 ? score / total : 0,
        };
        const doneCount = Object.values(clone).filter((m: any) => (m.total || 0) > 0).length;
        newGlobal = Math.min(1, doneCount / initialModules.length);
        return clone;
      });
      setProgression(newGlobal);
      setDoc(doc(db, "progression", currentUserId), { global: newGlobal }, { merge: true }).catch((e) => console.warn('[E-LEARN] progression write error', e));
    }

    try {
      await addDoc(collection(db, "quizScores"), {
        userId: currentUserId, // DOIT correspondre à request.auth.uid
        name: user?.displayName || user?.email || "Anonyme",
        module: moduleName,
        score,
        questions,
        createdAt: Date.now(),
      });
      console.log('[E-LEARN] Firestore quizScores addDoc success');
    } catch (e: any) {
      console.error('[E-LEARN] Firestore addDoc FAILED', e);
      setLastError("Enregistrement Firestore échoué : " + (e?.message || 'erreur inconnue'));
    }
  };

  // Expose pour StreamingQuiz
  useEffect(() => {
    (window as any).saveQuizResult = saveQuizResult;
    return () => {
      try { delete (window as any).saveQuizResult; } catch {}
    };
  }, [saveQuizResult]);

  const getModuleQuestions = (moduleName: string): Q[] => {
    const map: Record<string, Q[]> = {
  'Canal+': canalBaseOfferQuestions,
  'Canal+ Ciné Séries': canalCineSeriesQuestions,
  'Canal+ Sport': canalSportQuestions,
  'Canal+ 100%': canal100Questions,
      "Netflix (Univers)": netflixQuestions,
      "Max & Paramount+": maxParamountQuestions,
      "OCS (Cinéma)": ocsQuestions,
      "Culture Audiovisuelle": cultureAvQuestions,
      "Méthode LISKA": liskaQuestions,
      base: canalQuestions,
      streaming: canalQuestions,
    };
    const bank = map[moduleName] || cultureAvQuestions;
    // Clone profond (options déjà arrays simples)
    let copy = bank.map(q => ({ ...q, options: [...q.options] }));
    // Shuffle 3 passes pour accentuer l'aléatoire
    for (let pass = 0; pass < 3; pass++) {
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.random() * (i + 1) | 0;
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
    }
    // Shuffle interne des options pour éviter mémorisation (en conservant index correct)
    copy = copy.map(q => {
      const pairs = q.options.map((opt, idx) => ({ opt, idx }));
      for (let i = pairs.length - 1; i > 0; i--) {
        const j = Math.random() * (i + 1) | 0;
        [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
      }
      const newOptions = pairs.map(p => p.opt);
      const newCorrect = pairs.findIndex(p => p.idx === q.correct);
      return { ...q, options: newOptions, correct: newCorrect };
    });
    return copy.slice(0, 10); // chaque banque a 10 questions
  };

  const openModuleQuiz = (moduleName: string) => {
    setQuizQuestionsForModule(getModuleQuestions(moduleName));
    setShowQuiz(moduleName);
  };

  const tabs: { id: TabKey; label: string; icon: React.ReactNode; badge?: string; desc: string }[] = [
    { id: "overview", label: "Vue d'ensemble", icon: <FiCheckCircle size={16} />, badge: progression? `${Math.round(progression*100)}%` : undefined, desc: "Résumé global de ta progression et derniers quiz." },
    { id: "modules", label: "Modules", icon: <FiLayers size={16} />, badge: modulesDone? `${modulesDone}/${totalModules}`: undefined, desc: "Liste des unités de formation disponibles." },
  { id: "quiz", label: "Quiz", icon: <FiSmile size={16} />, desc: "Accès direct au quiz spécial Canal+ / Streaming." },
    { id: "progress", label: "Statistiques", icon: <FiBarChart2 size={16} />, desc: "Analyse détaillée des performances par module." },
    { id: "settings", label: "Paramètres", icon: <FiSettings size={16} />, desc: "Personnalisation locale et réinitialisation des données." },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="flex items-center justify-between px-6 md:px-10 py-4 md:py-6 bg-white border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Modules de Formation</h1>
          <div className="flex items-center gap-4" />
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 md:py-8 max-w-7xl mx-auto w-full">
          <div className="mb-8">
            <div className="relative rounded-2xl bg-white/70 backdrop-blur border border-gray-200 p-3 shadow-sm">
              <nav className="flex flex-wrap gap-2 md:gap-3">
                {tabs.map((t,i)=> {
                  const active = t.id === selectedTab;
                  return (
                    <button
                      key={t.id}
                      onClick={()=> setSelectedTab(t.id)}
                      aria-current={active? 'page': undefined}
                      className={`group relative overflow-hidden px-4 md:px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold flex items-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-cactus-500
                        ${active ? 'bg-gradient-to-r from-cactus-600 to-emerald-600 text-white shadow-md' : 'bg-white text-cactus-700 border border-gray-200 hover:border-cactus-300 hover:shadow'}
                      `}
                      style={{ animation: `fadeInUp 0.4s ease ${i*40}ms both` }}
                    >
                      <span className={`transition-transform ${active? 'scale-110':''}`}>{t.icon}</span>
                      <span>{t.label}</span>
                      {t.badge && (
                        <span className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${active? 'bg-white/25 text-white' : 'bg-cactus-50 text-cactus-600 border border-cactus-100'}`}>{t.badge}</span>
                      )}
                      {active && <span className="absolute inset-0 ring-1 ring-white/40 rounded-xl pointer-events-none" />}
                    </button>
                  );
                })}
              </nav>
              <div className="mt-3 ml-1 text-[11px] text-gray-500 min-h-[18px]">{tabs.find(t=> t.id===selectedTab)?.desc}</div>
              <style>{`@keyframes fadeInUp{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:translateY(0)}}`}</style>
            </div>
          </div>

          {selectedTab === "overview" && (() => {
            const completed = modules.filter(m => (moduleStats[m.title]?.total || 0) > 0);
            // Statistiques agrégées
            const avgSuccess = completed.length ? Math.round(
              completed.reduce((acc, m) => {
                const st = moduleStats[m.title];
                return acc + (st.total ? (st.score / st.total) : 0);
              }, 0) / completed.length * 100
            ) : 0;
            const best = completed
              .map(m => ({ title: m.title, ratio: (() => { const st = moduleStats[m.title]; return st.total? st.score / st.total : 0; })() }))
              .sort((a,b)=> b.ratio - a.ratio)[0];
            // Historique (5 dernières tentatives tout module)
            const allHistory: { module:string; score:number; date:number; total:number }[] = [];
            Object.entries(scoreHistory).forEach(([mod, arr]) => {
              const total = moduleStats[mod]?.total || 0;
              arr.forEach(h => allHistory.push({ module: mod, score: h.score, date: h.date, total }));
            });
            const recent = allHistory.sort((a,b)=> b.date - a.date).slice(0,5);
            // Tri modules complétés (récent / score / nom)
            const sortedCompleted = [...completed].sort((a,b)=> {
              if (overviewSort==='name') return a.title.localeCompare(b.title,'fr');
              if (overviewSort==='score') {
                const ra = (() => { const st = moduleStats[a.title]; return st.total? st.score/st.total:0; })();
                const rb = (() => { const st = moduleStats[b.title]; return st.total? st.score/st.total:0; })();
                return rb-ra;
              }
              // recent: last history entry date
              const la = (scoreHistory[a.title]||[]).sort((x,y)=> y.date - x.date)[0]?.date || 0;
              const lb = (scoreHistory[b.title]||[]).sort((x,y)=> y.date - x.date)[0]?.date || 0;
              return lb - la;
            });
            const limited = overviewShowAllModules ? sortedCompleted : sortedCompleted.slice(0,8);
            return (
              <div className="space-y-12">
                {/* Bloc progression + stats */}
                <section className="grid gap-6 xl:grid-cols-3 items-start">
                  <div className="relative bg-white rounded-2xl border border-gray-100 shadow p-6 flex flex-col items-center justify-center xl:col-span-1">
                    <h2 className="text-sm font-semibold text-gray-500 mb-3">Progression Globale</h2>
                    <div className="relative w-40 h-40 mb-4">
                      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(#199473 ${Math.round(progression*100)}%, #eef2f3 ${Math.round(progression*100)}%)` }} />
                      <div className="absolute inset-5 bg-white rounded-full flex flex-col items-center justify-center">
                        <span className="text-3xl font-extrabold text-cactus-700">{Math.round(progression*100)}%</span>
                        <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Complété</span>
                      </div>
                    </div>
                    <div className="w-full">
                      <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-3">
                        <div className="h-3 bg-gradient-to-r from-cactus-500 to-cactus-600 rounded-full transition-all" style={{ width: `${progression*100}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 text-center">{modulesDone} / {totalModules} unités de formation validées.</p>
                    </div>
                    <div className="mt-4 text-[10px] text-gray-400 font-medium">(Vue modules détaillée retirée)</div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3 xl:col-span-2">
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow flex flex-col">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Succès Moyen</span>
                      <span className="text-3xl font-extrabold text-cactus-700">{avgSuccess}%</span>
                      <span className="text-xs text-gray-500 mt-auto">Sur les modules complétés</span>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow flex flex-col">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Meilleur Module</span>
                      {best ? (
                        <>
                          <span className="text-sm font-bold text-gray-900 line-clamp-2">{best.title}</span>
                          <span className="text-2xl font-extrabold text-green-600">{Math.round(best.ratio*100)}%</span>
                        </>
                      ) : <span className="text-xs text-gray-400">Aucun encore</span>}
                      <span className="text-xs text-gray-500 mt-auto">Basé sur dernier score</span>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow flex flex-col">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Tentatives</span>
                      <span className="text-3xl font-extrabold text-cactus-700">{Object.values(scoreHistory).reduce((a,arr)=> a+arr.length,0)}</span>
                      <span className="text-xs text-gray-500 mt-auto">Total de quiz effectués</span>
                    </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow flex flex-col sm:col-span-3">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-gray-700">Historique récent</span>
            <button onClick={()=> setShowHistoryModal(true)} className="text-[11px] font-semibold text-cactus-600 hover:underline">Voir tout</button>
                      </div>
                      {recent.length ? (
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {recent.map((r,i)=> {
                            const ratio = r.total? Math.round(r.score / r.total * 100) : 0;
                            return (
                              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl border bg-gray-50">
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-semibold text-gray-500">{r.module}</span>
                                  <span className="text-xs text-gray-400">{new Date(r.date).toLocaleString()}</span>
                                </div>
                                <span className={`text-xs font-bold px-2 py-1 rounded ${ratio>=60?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>{r.score}{r.total?`/${r.total}`:''}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : <div className="text-xs text-gray-400">Aucun quiz effectué pour l'instant.</div>}
                    </div>
                  </div>
                </section>
                {/* Modules terminés list */}
                <section>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">Modules Terminés {completed.length>0 && <span className="text-xs font-semibold text-cactus-600 px-2 py-1 bg-cactus-50 rounded-full">{completed.length}</span>}</h2>
                    {completed.length>8 && <div className="flex items-center gap-2 text-xs text-gray-500"><span>Affichés: {overviewShowAllModules? completed.length : Math.min(8,completed.length)} / {completed.length}</span>{!overviewShowAllModules && <button onClick={()=> setOverviewShowAllModules(true)} className="text-cactus-600 hover:underline font-semibold">Tout afficher</button>}{overviewShowAllModules && <button onClick={()=> setOverviewShowAllModules(false)} className="text-cactus-600 hover:underline font-semibold">Réduire</button>}</div>}
                  </div>
                  {!completed.length && (
                    <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center max-w-xl">
                      <div className="text-4xl mb-3">📘</div>
                      <p className="font-semibold text-gray-800 mb-1">Aucun module terminé pour l'instant</p>
                      <p className="text-sm text-gray-500 mb-4">Quand vous validerez un quiz, il apparaîtra ici automatiquement.</p>
                      <button onClick={() => setSelectedTab('progress')} className="px-4 py-2 rounded-lg bg-cactus-600 text-white text-sm font-semibold hover:bg-cactus-700 shadow">Voir les statistiques</button>
                    </div>
                  )}
          {!!completed.length && (
                    <div className="flex items-center gap-3 mb-4">
                      <label className="text-xs font-semibold text-gray-500">Tri</label>
            <select value={overviewSort} onChange={e=> (setOverviewSort(e.target.value as any))} className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-cactus-500">
                        <option value="recent">Récent</option>
                        <option value="score">Score</option>
                        <option value="name">Nom</option>
                      </select>
                    </div>
                  )}
                  {!!completed.length && (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {limited.map(mod => {
                        const st = moduleStats[mod.title];
                        const pct = st?.total ? Math.round(st.score / st.total * 100) : 100;
                        return (
                          <div key={mod.title} className="relative group bg-white rounded-2xl border border-gray-100 shadow hover:shadow-lg transition p-5 flex flex-col">
                            <div className="absolute top-2 right-2 text-green-600 text-lg" aria-label="Terminé">✔️</div>
                            <div className="flex items-center gap-3 mb-3">
                              <div className="text-cactus-600">{mod.icon}</div>
                              <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">{mod.title}</h3>
                            </div>
                            <p className="text-xs text-gray-500 mb-3 line-clamp-3 min-h-[36px]">{mod.description}</p>
                            <div className="mb-4">
                              <div className="flex justify-between text-[11px] font-medium text-gray-500 mb-1"><span>{pct}%</span><span>{st?.score || 0}{st?.total ? ` / ${st.total}` : ''}</span></div>
                              <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden"><div className="h-2 bg-green-500 rounded-full transition-all" style={{ width: pct+'%' }} /></div>
                            </div>
                            <div className="mt-auto flex items-center justify-between text-[11px] text-gray-400"><span>Terminé</span><button onClick={()=> openModuleQuiz(mod.title)} className="text-cactus-600 hover:text-cactus-700 font-semibold">Refaire</button></div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            );
          })()}
          {selectedTab === "modules" && (
            <section className="space-y-8">
              <header className="space-y-2">
                <h2 className="text-xl font-bold">Modules</h2>
                <p className="text-sm text-gray-500 max-w-xl">Choisis un module pour lancer ou refaire son quiz associé.</p>
              </header>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {modules.map(mod => {
                  const st = moduleStats[mod.title];
                  const attempted = !!st?.total;
                  const pct = attempted && st?.total ? Math.round(st.score / st.total * 100) : 0;
                  return (
                    <div key={mod.title} className="relative bg-white rounded-2xl border border-gray-100 p-5 flex flex-col shadow-sm hover:shadow-md transition group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-cactus-50 flex items-center justify-center text-cactus-600">
                          {mod.icon}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{mod.title}</h3>
                          <p className="text-[11px] text-gray-500 line-clamp-2">{mod.description}</p>
                        </div>
                      </div>
                      <div className="mb-3">
                        <div className="flex justify-between text-[11px] font-medium text-gray-500 mb-1"><span>{pct}%</span><span>{st?.total || 0} q.</span></div>
                        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div className={`h-2 rounded-full ${pct>=60? 'bg-cactus-600':'bg-cactus-400'} transition-all`} style={{ width: (attempted? pct:0)+'%' }} />
                        </div>
                      </div>
                      <button onClick={()=> openModuleQuiz(mod.title)} className="mt-auto w-full px-4 py-2 rounded-lg bg-cactus-600 text-white text-xs font-semibold hover:bg-cactus-700 shadow">
                        {attempted? 'Refaire le quiz':'Commencer'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {selectedTab === "progress" && (() => {
            // Vue statistiques consolidée
            const attempts = Object.values(scoreHistory).reduce((a,arr)=> a+arr.length,0);
            const completed = Object.values(moduleStats).filter(m=> (m.total||0)>0).length;
            const best = Object.entries(moduleStats)
              .filter(([,s])=> (s.total||0)>0)
              .map(([k,s])=> ({ module:k, ratio: s.total? s.score/s.total:0 }))
              .sort((a,b)=> b.ratio - a.ratio)[0];
            const worst = Object.entries(moduleStats)
              .filter(([,s])=> (s.total||0)>0)
              .map(([k,s])=> ({ module:k, ratio: s.total? s.score/s.total:0 }))
              .sort((a,b)=> a.ratio - b.ratio)[0];
            const distribution = Object.entries(moduleStats).map(([k,s])=> ({
              module:k,
              pct: s.total? Math.round(s.score / s.total *100):0
            })).filter(d=> d.pct>0).sort((a,b)=> b.pct - a.pct).slice(0,8);
            return (
              <section className="space-y-10">
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="bg-white rounded-2xl p-5 border shadow flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Progression</span>
                    <span className="text-3xl font-extrabold text-cactus-700">{Math.round(progression*100)}%</span>
                    <span className="mt-auto text-xs text-gray-500">Global complété</span>
                  </div>
                  <div className="bg-white rounded-2xl p-5 border shadow flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Modules terminés</span>
                    <span className="text-3xl font-extrabold text-cactus-700">{completed}</span>
                    <span className="mt-auto text-xs text-gray-500">Sur {initialModules.length}</span>
                  </div>
                  <div className="bg-white rounded-2xl p-5 border shadow flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Tentatives</span>
                    <span className="text-3xl font-extrabold text-cactus-700">{attempts}</span>
                    <span className="mt-auto text-xs text-gray-500">Total quiz effectués</span>
                  </div>
                  <div className="bg-white rounded-2xl p-5 border shadow flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Meilleur score</span>
                    {best ? <><span className="text-xl font-bold text-green-600">{best.module}</span><span className="text-2xl font-extrabold text-green-600">{Math.round(best.ratio*100)}%</span></> : <span className="text-sm text-gray-400">—</span>}
                  </div>
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="bg-white rounded-2xl p-6 border shadow flex flex-col lg:col-span-2">
                    <h3 className="font-semibold text-gray-800 mb-4">Répartition des scores (Top 8)</h3>
                    {distribution.length ? (
                      <div className="space-y-3">
                        {distribution.map(d => (
                          <div key={d.module} className="flex items-center gap-3">
                            <span className="w-40 text-xs font-medium text-gray-600 truncate">{d.module}</span>
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-3 ${d.pct>=60?'bg-cactus-600':'bg-cactus-400'} rounded-full`} style={{width: d.pct+'%'}} />
                            </div>
                            <span className="w-12 text-right text-xs font-semibold text-gray-700">{d.pct}%</span>
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-xs text-gray-400">Aucune donnée encore.</div>}
                  </div>
                  <div className="bg-white rounded-2xl p-6 border shadow flex flex-col gap-6">
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-2">Points forts</h3>
                      {best ? <div className="text-sm text-green-700 font-medium">{best.module} ({Math.round(best.ratio*100)}%)</div> : <div className="text-xs text-gray-400">—</div>}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-2">À améliorer</h3>
                      {worst ? <div className="text-sm text-yellow-700 font-medium">{worst.module} ({Math.round(worst.ratio*100)}%)</div> : <div className="text-xs text-gray-400">—</div>}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-2">Conseil</h3>
                      <p className="text-xs text-gray-500 leading-snug">Refais les modules en dessous de 60% pour consolider tes connaissances et faire monter la progression globale.</p>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {selectedTab === "quiz" && (
            <section className="space-y-8">
              <header className="space-y-2">
                <h2 className="text-xl font-bold">Quiz Offres & Univers</h2>
                <p className="text-sm text-gray-500 max-w-xl">Choisis une offre Canal+ ou un univers pour lancer un quiz rapide (10 questions simples).</p>
              </header>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Carte spéciale Streaming / Univers historique */}
                <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-6 flex flex-col shadow">
                  <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage:'radial-gradient(circle at 30% 30%, #fff 0, transparent 60%)' }} />
                  <h3 className="text-lg font-extrabold flex items-center gap-2 relative z-10">📺 Canal+ / Streaming</h3>
                  <p className="text-xs text-blue-100 mt-1 relative z-10">Culture marque, programmes emblématiques, histoire.</p>
                  <div className="mt-auto flex justify-between items-end relative z-10">
                    <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">Chronométré</span>
                    <button onClick={()=> setShowQuiz('streaming')} className="px-4 py-2 rounded-lg bg-white text-blue-700 font-bold shadow text-xs hover:shadow-lg">Lancer</button>
                  </div>
                </div>
                {/* Offres Canal+ (uniquement ici, pas dans l'onglet Modules) */}
                {[
                  { key: 'Canal+', desc: 'Offre de base: créations originales, films, essentiels.' , emoji:'📦', color:'from-cactus-600 to-emerald-600'},
                  { key: 'Canal+ Ciné Séries', desc: 'Cinéma récent + séries exclusives + agrégations.', emoji:'🎬', color:'from-pink-600 to-rose-500'},
                  { key: 'Canal+ Sport', desc: 'Multi-compétitions majeures en direct.', emoji:'🏆', color:'from-amber-600 to-orange-500'},
                  { key: 'Canal+ 100%', desc: 'Formule complète: sport + ciné + séries.', emoji:'🔥', color:'from-purple-600 to-fuchsia-500'},
                ].map(o => (
                  <div key={o.key} className={`relative overflow-hidden rounded-2xl p-6 flex flex-col shadow bg-gradient-to-r ${o.color} text-white`}>
                    <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage:'radial-gradient(circle at 25% 25%, #fff 0, transparent 55%)' }} />
                    <h3 className="text-lg font-extrabold flex items-center gap-2 relative z-10">{o.emoji} {o.key}</h3>
                    <p className="text-xs text-white/80 mt-1 relative z-10">{o.desc}</p>
                    <div className="mt-auto flex justify-end relative z-10">
                      <button onClick={()=> { setShowQuiz(o.key); setQuizQuestionsForModule(getModuleQuestions(o.key)); }} className="px-4 py-2 rounded-lg bg-white/90 text-gray-800 font-bold shadow text-xs hover:bg-white">Quiz</button>
                    </div>
                    <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/25">Hors progression</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {selectedTab === "settings" && (
            <section className="space-y-8 max-w-3xl">
              <h2 className="text-xl font-bold mb-2">Paramètres</h2>
              <div className="grid gap-6">
                <div className="bg-white rounded-2xl p-6 border shadow">
                  <h3 className="font-semibold text-gray-800 mb-3">Affichage</h3>
                  <div className="flex items-center justify-between py-2 border-b last:border-b-0">
                    <span className="text-sm text-gray-600">Animations</span>
                    <button className="px-3 py-1.5 text-xs rounded-lg bg-cactus-600 text-white font-semibold shadow">Actif</button>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b last:border-b-0">
                    <span className="text-sm text-gray-600">Mode clair / sombre</span>
                    <button className="px-3 py-1.5 text-xs rounded-lg bg-gray-200 text-gray-700 font-semibold">Bientôt</button>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 border shadow">
                  <h3 className="font-semibold text-gray-800 mb-3">Progression</h3>
                  <p className="text-xs text-gray-500 leading-snug mb-4">Tu peux effacer uniquement tes données locales (scores, historique, stats). Les enregistrements déjà présents dans Firestore ne seront pas supprimés.</p>
                  {!confirmingLocalReset && (
                    <div className="space-y-3">
                      <button
                        onClick={()=>{ setConfirmingLocalReset(true); setLocalResetDone(false); }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 shadow group"
                      >
                        <FiTrash2 size={16} className="group-hover:scale-110 transition" />
                        Réinitialiser ma progression locale
                      </button>
                      {localResetDone && (
                        <div className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> Progression locale réinitialisée.
                        </div>
                      )}
                      <p className="text-[11px] text-gray-400">Action irréversible sur l'appareil. Refais des quiz pour regénérer des données.</p>
                    </div>
                  )}
                  {confirmingLocalReset && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50">
                        <FiAlertTriangle className="text-red-600 mt-0.5" size={18} />
                        <div className="text-[11px] leading-snug text-red-700 font-medium">Confirme si tu veux effacer tes scores et l'historique locaux. Firestore n'est pas touché.</div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={()=>{ setModuleStats({}); setScoreHistory({}); setProgression(0); setConfirmingLocalReset(false); setLocalResetDone(true); }}
                          className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 shadow"
                        >
                          Oui, effacer maintenant
                        </button>
                        <button
                          onClick={()=> setConfirmingLocalReset(false)}
                          className="flex-1 px-4 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 border"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-2xl p-6 border shadow">
                  <h3 className="font-semibold text-gray-800 mb-3">À propos</h3>
                  <p className="text-xs text-gray-500 leading-snug">Cette interface de formation évolutive utilise Firestore pour suivre les quiz et la progression globale. Les améliorations futures incluront un mode sombre, des notifications ciblées et des quiz adaptatifs.</p>
                </div>
              </div>
            </section>
          )}

          {showQuiz === "streaming" && <StreamingQuiz open={showQuiz === "streaming"} onClose={() => setShowQuiz(false)} onFinished={() => setSelectedTab("overview")} />}

          {/* Overlay QuizQCM */}
          {showQuiz && showQuiz !== "streaming" && quizQuestionsForModule && (
            <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/60 animate-fadeIn">
              <div className="relative w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl p-8 border border-gray-200">
                <button className="absolute top-4 right-4 text-gray-500 hover:text-cactus-600 transition text-2xl font-bold" aria-label="Fermer le quiz" onClick={() => { setShowQuiz(false); setQuizQuestionsForModule(null); }}>×</button>
                <div className="mb-6 text-center">
                  <h2 className="text-3xl font-extrabold text-cactus-700 mb-2 drop-shadow">Quiz {showQuiz}</h2>
                  <p className="text-lg text-gray-500">Répondez aux questions pour progresser dans le module</p>
                </div>
                <QuizQCM
                  moduleName={String(showQuiz)}
                  questions={quizQuestionsForModule}
                  onFinish={async (score) => {
                    // Si quiz d'offre hors progression, on enregistre avec son nom mais n'affecte pas progression modules
                    const mod = modules.find((m) => m.title === showQuiz) || modules.find((m) => m.title.toLowerCase().includes(String(showQuiz).toLowerCase()));
                    const moduleTitle = mod ? mod.title : String(showQuiz);
                    await saveQuizResult(moduleTitle, score, quizQuestionsForModule);
                    // Ne pas fermer automatiquement: laisser l'utilisateur lire la correction.
                  }}
                  onClose={() => { setShowQuiz(false); setQuizQuestionsForModule(null); setSelectedTab("overview"); }}
                />
              </div>
            </div>
          )}
          {showQuiz && showQuiz !== "streaming" && !quizQuestionsForModule && (
            <div className="mt-6 max-w-3xl mx-auto text-center py-8">Préparation du quiz...</div>
          )}
        </main>
        {showHistoryModal && (() => {
          // Construire l'historique complet
          const full: { module:string; score:number; date:number; total:number }[] = [];
          Object.entries(scoreHistory).forEach(([mod, arr]) => {
            const total = moduleStats[mod]?.total || 0;
            arr.forEach(h => full.push({ module: mod, score: h.score, date: h.date, total }));
          });
          const ordered = full.sort((a,b)=> b.date - a.date);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/60 animate-fadeIn">
              <div className="relative w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 flex flex-col max-h-[90vh]">
                <button className="absolute top-4 right-4 text-gray-500 hover:text-cactus-600 transition text-2xl font-bold" aria-label="Fermer" onClick={()=> setShowHistoryModal(false)}>×</button>
                <h3 className="text-xl font-extrabold mb-1 text-cactus-700">Historique complet des tentatives</h3>
                <p className="text-sm text-gray-500 mb-4">Liste de toutes les tentatives de quiz classées par date décroissante.</p>
                <div className="flex-1 overflow-y-auto pr-2">
                  {ordered.length ? (
                    <table className="w-full text-xs border divide-y">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                          <th className="p-2">Module</th>
                          <th className="p-2">Score</th>
                          <th className="p-2">Réussite %</th>
                          <th className="p-2">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {ordered.map((r,i)=> {
                          const ratio = r.total? Math.round(r.score / r.total * 100):0;
                          return (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="p-2 font-medium text-gray-800">{r.module}</td>
                              <td className="p-2">{r.score}{r.total?`/${r.total}`:''}</td>
                              <td className="p-2"><span className={`px-2 py-0.5 rounded font-semibold ${ratio>=60?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>{ratio}%</span></td>
                              <td className="p-2 text-gray-500 whitespace-nowrap">{new Date(r.date).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : <div className="text-center text-gray-400 py-12 text-sm">Aucune tentative encore.</div>}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={()=> setShowHistoryModal(false)} className="px-4 py-2 rounded-lg bg-cactus-600 text-white text-sm font-semibold hover:bg-cactus-700 shadow">Fermer</button>
                </div>
              </div>
            </div>
          );
        })()}
        {lastError && (
          <div className="fixed bottom-4 right-4 max-w-sm bg-red-600 text-white text-sm px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 z-50">
            <span className="font-bold">Erreur:</span>
            <span className="flex-1">{lastError}</span>
            <button onClick={() => setLastError(null)} className="ml-2 text-white/80 hover:text-white font-bold">×</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ELearningPage;