import { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Check,
  AlertCircle,
  Users,
  Phone,
  MessageSquare,
  Target,
} from "lucide-react";
import CallScriptStep5 from "../components/CallScriptStep5";
import OfferSuggestionStep from "../components/OfferSuggestionStep";
import CanalPitchStep from "../components/CanalPitchStep";
import TeleSalesAssistant from "../components/TeleSalesAssistant";
import CallDecisionFlow, { FlowNode } from "../components/CallDecisionFlow";

export interface CallData {
  clientInfo: {
    hasChildren: boolean;
    hasTeens: boolean;
  };
  preferences: {
    genres: string[];
    sports: string[];
    watchingFrequency: string;
    favoriteFilm?: string;
    favoriteActor?: string;
    favoriteSeries?: string;
    favoriteFilmGenres?: string[];
    favoriteSeriesGenres?: string[];
    deviceUsage?: string;
  };
  notes?: string;
  offerScript?: string;
  messages?: {
    from: "IA" | "Client";
    text: string;
  }[];
  objections?: string[];
}

const CallScriptPage = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [callData, setCallData] = useState<CallData>({
    clientInfo: { hasChildren: false, hasTeens: false },
    preferences: { genres: [], sports: [], watchingFrequency: "" },
    notes: "",
  });
  const [isCallActive, setIsCallActive] = useState(false);
  const [, setCallDuration] = useState(0);
  const [mode, setMode] = useState<'wizard' | 'flow'>('flow');
  const [navDir, setNavDir] = useState<'left' | 'right'>('right');


  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCallActive) {
      interval = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isCallActive]);

  const resetScript = () => {
    setCurrentStep(0);
    setCallData({
      clientInfo: { hasChildren: false, hasTeens: false },
      preferences: { genres: [], sports: [], watchingFrequency: "" },
      notes: "",
    });
    setCallDuration(0);
    setIsCallActive(false);
  };

  const steps = [
    {
      title: "Ouverture & Accroche",
      icon: <Phone className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">
              🎯 Objectif : Capter l'attention rapidement
            </h3>

            {/* Infos client en lecture seule */}

            <div className="bg-white rounded p-3 border border-blue-100">
              <p className="text-black mb-3">
                "Bonjour{" "}
                <span className="bg-yellow-200 px-1 rounded font-medium">
                  M./Mme ...
                </span>
                , je me présente{" "}
                <span className="bg-yellow-200 px-1 rounded font-medium">
                  [Votre prénom]
                </span>{" "}
                , conseiller Orange.
              </p>
              <p className="text-black">
                Je vous appelle très rapidement 
                sur votre usage et divertissement audiovisuel."
              </p>
            </div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="font-semibold text-orange-900 mb-3">
              Si le client dit : "Je n'ai pas le temps"
            </h3>

            <div className="space-y-3">
              <button type="button" className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-orange-100 p-2 rounded-full">
                    <MessageSquare className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="font-medium text-orange-800 mb-1">
                      Réponse principale
                    </div>
                    <p className="text-black">
                      "Oh je vous prends juste 2 petites minutes, c'est promis !
                      C'est important, vous êtes un abonné fidèle et on veut
                      continuer à vous proposer du contenu pertinent."
                    </p>
                  </div>
                </div>
              </button>

              <button type="button" className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-orange-100 p-2 rounded-full">
                    <MessageSquare className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="font-medium text-orange-800 mb-1">
                      Alternative
                    </div>
                    <p className="text-black">
                      "Je comprends parfaitement, c'est justement pour ça que je
                      vais être très bref. Juste 2 minutes pour faire le point."
                    </p>
                  </div>
                </div>
  {/* ...existing code... */}
              </button>

              <button type="button" className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-orange-100 p-2 rounded-full">
                    <Phone className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="font-medium text-orange-800 mb-1">
                      Proposition de rappel
                    </div>
                    <p className="text-black">
                      "Aucun souci, à quelle heure puis-je vous rappeler
                      aujourd'hui ?"
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      ),
    } /*
    {
      title: 'Gestion objection : "J\'ai pas le temps"',
      icon: <AlertCircle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="font-semibold text-orange-900 mb-3">
              💡 Si le client dit : "Je n'ai pas le temps"
            </h3>

            <div className="space-y-3">
              <button className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-orange-100 p-2 rounded-full">
                    <MessageSquare className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="font-medium text-orange-800 mb-1">
                      Réponse principale
                    </div>
                    <p className="text-black">
                      "Oh je vous prends juste 2 petites minutes, c'est promis !
                      C'est important, vous êtes un abonné fidèle et on veut
                      vous informer sur les services exclusifs auxquels vous
                      avez droit."
                    </p>
                  </div>
                </div>
              </button>

              <button className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-orange-100 p-2 rounded-full">
                    <MessageSquare className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="font-medium text-orange-800 mb-1">
                      Alternative 1
                    </div>
                    <p className="text-black">
                      "Je comprends parfaitement, c'est justement pour ça que je
                      vais être très bref. Juste 2 minutes pour vous faire
                      économiser sur vos services TV."
                    </p>
                  </div>
                </div>
              </button>

              <button className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-orange-100 p-2 rounded-full">
                    <Phone className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="font-medium text-orange-800 mb-1">
                      Proposition de rappel
                    </div>
                    <p className="text-black">
                      "Aucun souci, à quelle heure puis-je vous rappeler
                      aujourd'hui ? C'est vraiment important pour vos
                      économies."
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      ),
    },*/,
    {
      title: "Mentions légales",
      icon: <MessageSquare className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold text-red-900 mb-3">
              ⚠️ Obligatoires à dire
            </h3>

            <div className="space-y-3">
              <button type="button" className="w-full text-left p-4 bg-white rounded border border-red-200 hover:bg-red-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-red-100 p-2 rounded-full">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <div className="font-medium text-red-800 mb-1">
                      Appel enregistré
                    </div>
                    <p className="text-black">
                      "Juste pour vous prévenir, cet appel est enregistré dans
                      un but d'amélioration de notre qualité de service."
                    </p>
                  </div>
                </div>
              </button>

              <button type="button" className="w-full text-left p-4 bg-white rounded border border-red-200 hover:bg-red-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-red-100 p-2 rounded-full">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <div className="font-medium text-red-800 mb-1">Bloctel</div>
                    <p className="text-black">
                      "Et je vous invite à vous inscrire sur Bloctel si vous ne
                      souhaitez plus recevoir d'appels d'entreprise dont vous
                      n'êtes pas client."
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Confirmation des infos client",
      icon: <Users className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="space-y-3">
              <button type="button" className="w-full text-left p-4 bg-white rounded border border-green-200 hover:bg-green-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-green-800 mb-1">
                      Confirmation du titulaire
                    </div>
                    <p className="text-black">
                      "Vous êtes bien le titulaire de la ligne ?"
                    </p>
                  </div>
                  <div className="flex gap-2"></div>
                </div>
              </button>

              <button type="button" className="w-full text-left p-4 bg-white rounded border border-green-200 hover:bg-green-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-green-800 mb-1">
                      Confirmation de l'adresse
                    </div>
                    <p className="text-black">
                      "Vous habitez toujours au{" "}
                      <span className="bg-yellow-200 px-1 rounded">...</span> ?"
                    </p>
                  </div>
                  <div className="flex gap-2"></div>
                </div>
              </button>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Découverte",
      icon: <Target className="w-5 h-5" />,
      content: (
        <CallScriptStep5 callData={callData} setCallData={setCallData} />
      ),
    },
    {
      title: "Proposition de l'offre",
      icon: <Target className="w-5 h-5" />,
      content: (
        <OfferSuggestionStep callData={callData} setCallData={setCallData} />
      ),
    } /*
    {
      title: "Gestion des objections",
      icon: <AlertCircle className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="font-semibold text-orange-900 mb-3">
              💬 Objections fréquentes - Cliquez pour répondre
            </h3>

            <div className="space-y-3">
              <button className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-red-100 p-2 rounded-full">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-orange-800 mb-1">
                      ❌ "C'est trop cher"
                    </div>
                    <p className="text-black">
                      "Je comprends ! Mais justement en ce moment, l'offre est à
                      un tarif bloqué pendant 24 mois."
                    </p>
                  </div>
                </div>
              </button>

              <button className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-100 p-2 rounded-full">
                    <AlertCircle className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-orange-800 mb-1">
                      ❌ "J'ai déjà Netflix"
                    </div>
                    <p className="text-black">
                      "Justement, l'offre inclut Netflix, et Apple TV+ dans le
                      même pack."
                    </p>
                  </div>
                </div>
              </button>

              <button className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-yellow-100 p-2 rounded-full">
                    <Phone className="w-4 h-4 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-orange-800 mb-1">
                      ❌ "Je dois réfléchir"
                    </div>
                    <p className="text-black">
                      "Aucun souci, je peux vous envoyer un mail avec toutes les
                      infos, et je vous rappelle demain à la même heure ?"
                    </p>
                  </div>
                </div>
              </button>

              <button className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-gray-100 p-2 rounded-full">
                    <AlertCircle className="w-4 h-4 text-black" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-orange-800 mb-1">
                      ❌ "Je ne regarde pas la télé"
                    </div>
                    <p className="text-black">
                      "Je comprends, simplement je suppose que quand il y a un
                      bon film ou un événement sportif, il vous arrive de le
                      regarder ?"
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      ),
    },*/,
    {
      title: "Cloture de l'appel",
      icon: <Check className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <button className="w-full text-left p-4 bg-white rounded border border-green-200 hover:bg-green-50 transition-colors mb-4">
              <div className="flex items-start gap-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <MessageSquare className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-green-800 mb-1">
                    Script de conclusion
                  </div>
                  <div className="text-black space-y-3">
                    <h4 className="text-center font-semibold uppercase">MENTIONS LEGALES</h4>
                    <p>Très bien Mr/Mme</p>
                    <p>
                      Je prends note de votre accord pour votre abonnement CANAL PLUS avec l’offre...à....Euros/mois
                    </p>
                    <p>
                      Comme vu ensemble citer les éventuelles suppressions de bouquet  / pub sur netflix …
                    </p>
                    <p className="font-semibold">Process création Compte Canal+</p>
                    <p>
                      Je vous informe que votre nouvelle offre Canal + souscrit auprès du Groupe Canal+ se mettra en place sous 24h00 après validation de votre accord
                    </p>
                    <p>Vous recevrez plusieurs informations de Canal plus par Mail et SMS.</p>
                    <p>Vous recevrez notamment un sms pour signer votre contrat Canal plus</p>
                    <p>
                      Dans le 1er mail que vous allez recevoir de Canal+, vous aurez un lien vous permettant de créer votre Espace Client. Il ne vous restera plus qu’à créer votre mot de passe et profiter du service
                    </p>
                    <p className="font-semibold">Message CC : Si vente Canal+ Ciné Séries et client équipé Netflix</p>
                    <p>
                      Depuis le mail d’activation de votre compte Canal+ vous pourrez activer Netflix, vous gardez les mêmes identifiants et vous n’avez aucune autre démarche à effectuer.
                    </p>
                    <p>Et je vous rappelle que vous aurez 2 écrans Netflix</p>
                    <p className="font-semibold">Vous me confirmez être actuellement en prélèvement automatique ?</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="border border-gray-300 rounded-md p-3">
                        <div className="font-semibold uppercase text-sm mb-2">SI OUI</div>
                        <p>
                          Pour simplifier vos démarches et dans le cadre de l’exécution de ce nouveau contrat d’abonnement Canal+, Orange communiquera au Groupe Canal + vos coordonnées personnelles, ainsi que vos coordonnées bancaires et vous serez prélevé le 4 de chaque mois. Sur la première facture vous verrez apparaître le prorata du mois en cours et le mois suivant.
                        </p>
                      </div>
                      <div className="border border-gray-300 rounded-md p-3">
                        <div className="font-semibold uppercase text-sm mb-2">SI NON</div>
                        <p>
                          Pour simplifier vos démarches, un collaborateur vous recontactera pour récupérer votre IBAN. Vous pouvez toutefois contacter notre service au 0800 005 768 en leur indiquant votre référence commande : ------------
                        </p>
                        <p>
                          Il vous faudra pour cela vous équiper de votre IBAN. Ainsi vous serez prélevé le 4 de chaque mois, sur la 1ère facture vous verrez apparaitre le prorata du mois en cours et le mois suivant
                        </p>
                        <p>
                          Pour ce qui est du prélèvement, je vous informe que dans certains cas un de mes collègues peut être amené à vous recontacter pour confirmer votre IBAN.
                        </p>
                      </div>
                    </div>
                    <p>
                      Je vous précise que les dispositions du code de la consommation vous permettent d’exercer votre droit de rétractation de 14 jours à compter de la date de votre commande.
                    </p>
                    <p>
                      Afin de finaliser la commande pouvez-vous me confirmer votre adresse EMAIL……………… et je vous précise que celle-ci sera l'adresse de référence de votre contrat Canal Plus.
                    </p>
                    <p>Je vous envoie l'offre, et je vous rappelle dans les  48  heures</p>
                    <p>Une fois accepté, j'active l'offre sur votre box. 😊</p>
                    <p>
                      Dernier point, afin de pouvoir assurer le suivi de la validation de votre commande et d'être en conformité avec le décret me permettez-vous de vous contacter au-delà de 4 tentatives d'appels ?  VOUS POUVEZ ME RECONTACTER AU <span className="font-semibold">01 62 22 00 31</span> pour toutes questions
                    </p>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      ),
    },
  ];

  // Decision-tree content based on the provided diagrams
  const flowNodes: Record<string, FlowNode> = {
    root: {
      id: 'root',
      title: 'Actuellement, vous regardez la TV…?',
      text: 'Par le Décodeur Orange, via Smart TV (applications de streaming) ou la TNT ?\n(REPÉRER SMART TV)',
      options: [
        { label: 'Smart TV (TV connectée)', nextId: 'smartTVCheck' },
        { label: 'Décodeur/Box TV Orange', nextId: 'boxBranchee' },
        { label: 'TNT uniquement / Rien', nextId: 'noBoxStop' },
      ],
    },
    smartTVCheck: {
      id: 'smartTVCheck',
      title: 'Smart TV détectée',
      text: 'Vérifier qu’il y a également la box TV Orange de branchée.\nSi pas de box TV ➜ Canal+ impossible.',
      options: [
        { label: 'Box Orange branchée ✔', nextId: 'smartTVInfoYes' },
        { label: 'Pas de box Orange ✘', nextId: 'noBoxStop' },
      ],
    },
    noBoxStop: {
      id: 'noBoxStop',
      title: 'Pas de box Orange',
      text: 'Si pas de box TV ➜ Canal+ impossible.\n\nL’inviter à le faire et présenter les avantages\nMettre en avant les 200 chaînes et 190 en options\n\nReplay / Guide des programme / Contrôle du direct / Mosaïque\nApplications dans un seul univers: YouTube / Deezer / Netflix…',
      options: [],
    },
    smartTVInfoYes: {
      id: 'smartTVInfoYes',
      title: 'Box Orange branchée — informations utiles',
      text: 'OUI\n\nVous arrivez à utiliser les replays ? (Depuis le menu principal, sélectionnez la rubrique “Replay” pour revoir des programmes déjà diffusés)\n\nVous utilisez le guide des programmes ? (Accès : Appuyez sur la touche menu, rendez-vous dans la rubrique “Programme TV” et validez avec OK. Vous pouvez consulter les programmes en cours, à venir, et accéder à des informations détaillées sur chaque émission.)\n\nET la mosaïque ➜ chaîne 0\n\nConcernant le contrôle du direct, cela fonctionne bien ?\nFonctionnalité : Mettez en pause et reprenez la lecture des programmes en direct grâce à la fonction de contrôle du direct',
      options: [
        { label: 'Continuer ➜ Vérifier ensemble', nextId: 'boxFeatures' },
      ],
    },
    boxBranchee: {
      id: 'boxBranchee',
      title: 'Profitez-vous des chaînes Orange ?',
      text: '(BOX BRANCHÉE)\nQuestions de vérification des usages actuels.',
      options: [
        { label: 'Oui', nextId: 'smartTVInfoYes' },
        { label: 'Non', nextId: 'advantages' },
      ],
    },
    boxFeatures: {
      id: 'boxFeatures',
      title: 'Fonctions TV — vérifications rapides',
      text: 'Du coup, vous utilisez des plateformes de streaming de type Netflix, Amazon Prime, CANAL .... ? (REPÉRER CANAL)',
      kind: undefined,
      checklistItems: undefined,
      options: [
        { label: 'Oui, Canal+ (STOP APPEL)', nextId: 'stopCall' },
        { label: 'Non, aucune plateforme', nextId: 'neverSubscribedOpen' },
        { label: 'Oui, autres plateformes', nextId: 'rateScale' },
      ],
    },
    neverSubscribedOpen: {
      id: 'neverSubscribedOpen',
      title: 'Jamais pensé à une plateforme ?',
      text: 'Et vous avez jamais pensé à vous abonner à ce genre de plateforme ?',
      options: [
        { label: 'Continuer', nextId: 'neverSubscribed' },
      ],
    },
    advantages: {
      id: 'advantages',
      title: 'Présenter les avantages Orange TV',
      text: 'Mettre en avant les 200 chaînes et 190 options.\nReplay / Guide des programmes / Contrôle du direct / Mosaïque.\nApplications dans un seul univers: YouTube / Deezer / Netflix…',
      options: [
        { label: "Fin d'appel — box non branchée", nextId: 'noBoxStop' },
      ],
    },
    streamingPlatforms: {
      id: 'streamingPlatforms',
      title: 'Plateformes de streaming',
      text: 'Du coup, vous utilisez des plateformes de streaming de type Netflix, Amazon Prime, CANAL … ?\n( REPÉRER CANAL )',
      options: [
        { label: "J'utilise des plateformes (Netflix/Prime/…)", nextId: 'rateScale' },
        { label: 'Si Canal+ ➜ STOP APPEL', nextId: 'stopCall' },
        { label: 'Si rien', nextId: 'nothing' },
      ],
    },
    nothing: {
      id: 'nothing',
      title: 'Si rien',
      text: "Et vous avez jamais pensé à vous abonner à ce genre de plateforme ?",
      options: [
        { label: 'Continuer', nextId: 'neverSubscribed' },
      ],
    },
    rateScale: {
      id: 'rateScale',
      title: 'Super, tout fonctionne bien ?',
      text: 'Sur une échelle de 1 à 10 vous donnez combien à XXX… ?',
      options: [
        { label: 'Continuer', nextId: 'rateScaleRemark' },
      ],
    },
    rateScaleRemark: {
      id: 'rateScaleRemark',
      title: '',
      text: "C’est marrant ce que vous me dites car la plupart des clients me donnent la même note\nEt du coup il manquerait quoi pour augmenter la note, des séries de qualité, des films plus récents, du Sport ...?",
      options: [
        { label: 'Continuer', nextId: 'explorePreferences' },
      ],
    },
    explorePreferences: {
      id: 'explorePreferences',
      title: 'Explorer les goûts',
      text: '',
      options: [
        { label: 'Explorer les goûts ➜ Séries', nextId: 'seriesBranch' },
        { label: 'Explorer les goûts ➜ Films', nextId: 'filmsBranch' },
        { label: 'Explorer les goûts ➜ Sport', nextId: 'sportBranch' },
        { label: 'Je ne regarde pas la TV', nextId: 'neverWatchTV' },
      ],
    },
    neverSubscribed: {
      id: 'neverSubscribed',
      title: 'Jamais abonné à une plateforme ?',
      text: 'Et généralement vous regardez quoi à la TV ? Des séries, des films, du sport ?',
      options: [
        { label: 'Plutôt séries', nextId: 'seriesBranch' },
        { label: 'Plutôt films', nextId: 'filmsBranch' },
        { label: 'Plutôt sport', nextId: 'sportBranch' },
        { label: 'Je ne regarde pas la TV', nextId: 'neverWatchTV' },
      ],
    },
    neverWatchTV: {
      id: 'neverWatchTV',
      title: 'Je ne regarde pas la TV',
      text: 'Je ne regarde pas la TV. Je veux pas plus de TV.\n\nJe comprends, simplement je suppose que quand il y a des grands films à la TV ou une belle série, il vous arrive de les regarder comme tout le monde ?',
      options: [
        { label: 'Oui', nextId: 'neverWatchTVYes' },
        { label: 'Continuer', nextId: 'neverWatchTVFrequency' },
      ],
    },
    neverWatchTVYes: {
      id: 'neverWatchTVYes',
      title: 'Type de contenus aimés',
      text: 'Alors par exemple, c’est quoi le type de BOOOOON films ou séries que vous aimez regarder 😊\n\nRéponse',
      options: [
        { label: 'Continuer', nextId: 'neverWatchTVFrequency' },
      ],
    },
    neverWatchTVFrequency: {
      id: 'neverWatchTVFrequency',
      title: 'Fréquence idéale',
      text: "Et vous dans l’idéal, ce type de bons films ou séries vous aimeriez en voir combien de fois ? Une fois par semaine, deux fois par semaine, plus …",
      options: [
        { label: 'Séries', nextId: 'seriesBranch' },
        { label: 'Films', nextId: 'filmsBranch' },
        { label: 'Sport', nextId: 'sportBranch' },
      ],
    },
    seriesBranch: {
      id: 'seriesBranch',
      title: 'Si SÉRIE',
      text: 'Quel type (Aventure, Policier, Fantastique…) ?\nVous en regardez souvent ?\nEt, vous vous et votre famille vous regardes cela ensemble ? chacun chez soi ? un peu des deux ?',
      options: [
        { label: 'Continuer', nextId: 'seriesGroupDiscussion' },
      ],
    },
    seriesGroupDiscussion: {
      id: 'seriesGroupDiscussion',
      title: 'Si plusieurs',
      text: 'Et tout le monde regarde la même chose ou chacun a des goûts différents ?\nUn peu comme tout le monde 😉',
      options: [
        { label: 'Continuer ➜ Questions Cinéma', nextId: 'seriesCinemaStart' },
      ],
    },
    seriesCinemaStart: {
      id: 'seriesCinemaStart',
      title: 'Cinéma — Fréquence',
      text: 'Et cela vous arrive d’aller au Cinéma ?\nune fois par mois ; 2-3 fois dans l’année ... ?',
      options: [
        { label: 'Si oui, fréquemment', nextId: 'seriesCinemaYes' },
        { label: 'Si rarement', nextId: 'seriesCinemaRare' },
      ],
    },
    seriesCinemaYes: {
      id: 'seriesCinemaYes',
      title: 'Si oui, fréquemment',
      text: 'Super, vous êtes un vrai fan de cinéma …\n\nEt c’est quoi le dernier film que vous avez aimé ?\n\nEt à la TV, vous êtes content de ce qui est programmé comme films ?',
      options: [
        { label: 'Continuer', nextId: 'closingIntro' },
      ],
    },
    seriesCinemaRare: {
      id: 'seriesCinemaRare',
      title: 'Si rarement',
      text: 'C’est parce que c’est loin de chez vous, c’est la programmation, le prix actuel des places ?',
      options: [
        { label: 'Si prix', nextId: 'seriesCinemaRarePrice' },
        { label: 'Autre raison', nextId: 'seriesCinemaRareOther' },
      ],
    },
    seriesCinemaRarePrice: {
      id: 'seriesCinemaRarePrice',
      title: 'Si prix',
      text: 'Oui c’est vrai, j’ai pas mal de clients qui me disent qu’une sortie à deux on en a presque pour 30 à 35 euros maintenant.\n\nEt à la TV, vous êtes content de ce qui est programmé comme films ?',
      options: [
        { label: 'Continuer', nextId: 'closingIntro' },
      ],
    },
    seriesCinemaRareOther: {
      id: 'seriesCinemaRareOther',
      title: 'Remarques',
      text: 'Et à la TV, vous êtes content de ce qui est programmé comme films ?',
      options: [
        { label: 'Continuer', nextId: 'closingIntro' },
      ],
    },
    filmsBranch: {
      id: 'filmsBranch',
      title: 'Si FILM',
      text: 'Quel type (Aventure, Policier, Fantastique…) ?\nSouhaiteriez-vous voir plus souvent des films de qualité ?\nEt, vous vous et votre famille vous regardes cela ensemble ? chacun chez soi ? un peu des deux ?',
      options: [
        { label: 'Continuer ➜ Questions Cinéma', nextId: 'seriesCinemaStart' },
      ],
    },
    sportBranch: {
      id: 'sportBranch',
      title: 'Si SPORT',
      text: 'Vous regardez un sport en particulier ?\nSupportez-vous une équipe ?\nComment voyez-vous les matchs aujourd’hui ?\nEt, vous vous et votre famille vous regardes cela ensemble ? chacun chez soi ? un peu des deux ?',
      options: [
        { label: 'Continuer', nextId: 'sportGroupDiscussion' },
      ],
    },
    sportGroupDiscussion: {
      id: 'sportGroupDiscussion',
      title: 'Si plusieurs',
      text: 'Et tout le monde regarde la même chose ou chacun a des goûts différents ?\nUn peu comme tout le monde 😉',
      options: [
        { label: 'Continuer ➜ Questions Cinéma', nextId: 'sportCinemaStart' },
      ],
    },
    sportCinemaStart: {
      id: 'sportCinemaStart',
      title: 'Cinéma — Fréquence',
      text: 'Et cela vous arrive d’aller au Cinéma ?\nune fois par mois ; 2-3 fois dans l’année ... ?',
      options: [
        { label: 'Si oui, fréquemment', nextId: 'sportCinemaYes' },
        { label: 'Si rarement', nextId: 'sportCinemaRare' },
      ],
    },
    sportCinemaYes: {
      id: 'sportCinemaYes',
      title: 'Si oui, fréquemment',
      text: 'Super, vous êtes un vrai fan de cinéma …\n\nEt c’est quoi le dernier film que vous avez aimé ?\n\nEt à la TV, vous êtes content de ce qui est programmé comme films ?',
      options: [
        { label: 'Continuer', nextId: 'closingIntroSport' },
      ],
    },
    sportCinemaRare: {
      id: 'sportCinemaRare',
      title: 'Si rarement',
      text: 'C’est parce que c’est loin de chez vous, c’est la programmation, le prix actuel des places ?',
      options: [
        { label: 'Si prix', nextId: 'sportCinemaRarePrice' },
        { label: 'Autre raison', nextId: 'sportCinemaRareOther' },
      ],
    },
    sportCinemaRarePrice: {
      id: 'sportCinemaRarePrice',
      title: 'Si prix',
      text: 'Oui c’est vrai, j’ai pas mal de clients qui me disent qu’une sortie à deux on en a presque pour 30 à 35 euros maintenant.\n\nEt à la TV, vous êtes content de ce qui est programmé comme films ?',
      options: [
        { label: 'Continuer', nextId: 'closingIntroSport' },
      ],
    },
    sportCinemaRareOther: {
      id: 'sportCinemaRareOther',
      title: 'Remarques',
      text: 'Et à la TV, vous êtes content de ce qui est programmé comme films ?',
      options: [
        { label: 'Continuer', nextId: 'closingIntroSport' },
      ],
    },
    closingIntroSport: {
      id: 'closingIntroSport',
      title: 'Transition vers proposition — Sport',
      text: 'Synthèse des goûts et introduction de l’offre adaptée (Sport).\n\nFin de découverte ➜ proposer le choix parmi les 4 offres.',
      imageSrc: '/offre-100-canal-plus.webp',
      imageAlt: 'Offre CANAL+ 100% (Sport)',
      options: [
        { label: 'Choisir une offre', nextId: 'closingIntro' },
        { label: 'Aller à la clôture', nextId: 'endSport' },
      ],
    },
    sportCanalPitch: {
      id: 'sportCanalPitch',
      title: 'Canal+ 100% — Mise en perspective',
      text: 'Par rapport à ce que vous venez de me dire,\nEst-ce que vous avez déjà pensé à Canal+ pour le sport ?\nBeaucoup de clients pensent que Canal+ c’est systématiquement 40€ par mois. On a des formules plus accessibles selon vos matchs/compétitions préférés.',
      imageSrc: '/offre-100-canal-plus.webp',
      imageAlt: 'Offre CANAL+ 100%',
      options: [
        { label: 'Continuer ➜ Dé-escalade (Sport)', nextId: 'sportDescalade' },
        { label: 'Aller à la clôture', nextId: 'endSport' },
      ],
    },
    sportDescalade: {
      id: 'sportDescalade',
      title: 'Dé-escalade — Sport',
      text: 'On peut démarrer sur une formule sport adaptée pour suivre vos compétitions clés (championnats, coupes, etc.), à un tarif plus accessible.\nOn valide cette formule personnalisée et je vous accompagne pour la mise en place ?',
      imageSrc: '/offre-100-canal-plus.webp',
      imageAlt: 'CANAL+ Sport — offre adaptée',
      options: [
        { label: 'Valider et passer à la clôture', nextId: 'endSport' },
      ],
    },
    closingIntro: {
      id: 'closingIntro',
      title: 'Choix de l’offre — fin de découverte',
      text: 'À la fin de la découverte, sélectionnez l’offre la plus pertinente pour le client.\n\nChoix disponibles : CANAL+ Socle, CANAL+ Ciné Séries, CANAL+ Sport, CANAL+ 100%.',
      options: [
        { label: 'CANAL+ Socle', nextId: 'pathSocleResume' },
        { label: 'CANAL+ Ciné Séries', nextId: 'pathCineResume' },
        { label: 'CANAL+ Sport', nextId: 'pathSportResume' },
        { label: 'CANAL+ 100%', nextId: 'path100Resume' },
      ],
    },
    // --- Parcours CANAL+ Socle ---
    pathSocleResume: {
      id: 'pathSocleResume',
      title: 'Résumé des besoins',
      text: '« Très bien, par rapport à ce que vous venez de me dire… »\n\nRésumé des besoins du client (éléments recueillis lors de la découverte).',
      options: [ { label: 'OK', nextId: 'pathSocleIntro' } ],
    },
    pathSocleIntro: {
      id: 'pathSocleIntro',
      title: 'Introduction CANAL+',
      text: '« En ce moment nous avons un partenariat avec CANAL+, et ce qui est intéressant pour vous, c’est que par rapport à ce que vous aimez… »',
      options: [ { label: 'OK', nextId: 'focusSocle' } ],
    },
    focusSocle: {
      id: 'focusSocle',
      title: 'Focus offre — CANAL+',
      text: 'CANAL+ :\n• 300 films ~6 mois après la sortie cinéma\n• Les meilleures affiches du sport\n• Inclus : Apple TV\n\nTarifs visibles :\n• Prix public (hors engagement) : 24€99/mois\n• Prix pendant engagement : 19€99/mois',
      options: [ { label: 'OK', nextId: 'descaladeSocle' } ],
    },
    descaladeSocle: {
      id: 'descaladeSocle',
      title: 'Désescalade — CANAL+',
      text: '« Selon vous, CANAL+ peut coûter combien ? Parce que les clients généralement me disent entre 40€ et 60€. »\n\nLe prix public est de : 24€99/mois\nEt pour vous, vu que vous êtes client fidèle Orange : 19€99/mois\n\n« Il faut savoir que ce prix est stable pendant 24 mois et ça vous évite de subir des variations tarifaires. »\n« Moi ce que je vous propose, c’est d’en profiter dès aujourd’hui, comme ça vous en profitez dès ce soir. »',
      options: [ { label: 'OK ➜ Clôture', nextId: 'endSocle' } ],
    },
    // --- Parcours CANAL+ Ciné Séries ---
    pathCineResume: {
      id: 'pathCineResume',
      title: 'Résumé des besoins',
      text: '« Très bien, par rapport à ce que vous venez de me dire… »\n\nRésumé des besoins du client (éléments recueillis lors de la découverte).',
      options: [ { label: 'OK', nextId: 'pathCineIntro' } ],
    },
    pathCineIntro: {
      id: 'pathCineIntro',
      title: 'Introduction CANAL+',
      text: '« En ce moment nous avons un partenariat avec CANAL+, et ce qui est intéressant pour vous, c’est que par rapport à ce que vous aimez… »',
      options: [ { label: 'OK', nextId: 'focusCineSeries' } ],
    },
    focusCineSeries: {
      id: 'focusCineSeries',
      title: 'Focus offre — CANAL+ Ciné Séries',
      text: 'Toutes les plateformes de streaming dans le pack (valeur ~80€) :\n• Netflix — AVEC PUBLICITÉS\n• HBO Max\n• Paramount+\n• Ciné OCS\n• Insomnia\n\nTarifs visibles :\n• Prix public (hors engagement) : 34€99/mois\n• Prix pendant engagement (24 mois) : 29€99/mois',
      options: [ { label: 'OK', nextId: 'descaladeCine' } ],
    },
    descaladeCine: {
      id: 'descaladeCine',
      title: 'Désescalade — CANAL+ Ciné Séries',
      text: '« Selon vous, CANAL+ peut coûter combien ? Parce que les clients généralement me disent entre 40€ et 60€. »\n\nLe prix public est de : 34€99/mois\nEt pour vous, vu que vous êtes client fidèle Orange : 29€99/mois\n\n« Il faut savoir que ce prix est stable pendant 24 mois et ça vous évite de subir des variations tarifaires. »\n« Moi ce que je vous propose, c’est d’en profiter dès aujourd’hui, comme ça vous en profitez dès ce soir. »',
      options: [ { label: 'OK ➜ Clôture', nextId: 'endCine' } ],
    },
    // --- Parcours CANAL+ Sport ---
    pathSportResume: {
      id: 'pathSportResume',
      title: 'Résumé des besoins',
      text: '« Très bien, par rapport à ce que vous venez de me dire… »\n\nRésumé des besoins du client (éléments recueillis lors de la découverte).',
      options: [ { label: 'OK', nextId: 'pathSportIntro' } ],
    },
    pathSportIntro: {
      id: 'pathSportIntro',
      title: 'Introduction CANAL+',
      text: '« En ce moment nous avons un partenariat avec CANAL+, et ce qui est intéressant pour vous, c’est que par rapport à ce que vous aimez… »',
      options: [ { label: 'OK', nextId: 'focusSport' } ],
    },
    focusSport: {
      id: 'focusSport',
      title: 'Focus offre — CANAL+ Sport',
      text: '• beIN SPORTS et Eurosport\n• 100% des coupes européennes\n• 100% de la Liga, Premier League, Bundesliga, Liga Portugal Bwin, un match de Ligue 1\n• 100% du Top 14 et Pro D2\n• 100% des sports mécaniques\n• Sports américains : NBA, NFL, NHL, MLB\n• Inclus : Apple TV\n\nTarifs visibles :\n• Prix public (hors engagement) : 45€99/mois\n• Prix pendant engagement : 34€99/mois',
      options: [ { label: 'OK', nextId: 'descaladeSport' } ],
    },
    descaladeSport: {
      id: 'descaladeSport',
      title: 'Désescalade — CANAL+ Sport',
      text: '« Selon vous, CANAL+ peut coûter combien ? Parce que les clients généralement me disent entre 40€ et 60€. »\n\nLe prix public est de : 45€99/mois\nEt pour vous, vu que vous êtes client fidèle Orange : 34€99/mois\n\n« Il faut savoir que ce prix est stable pendant 24 mois et ça vous évite de subir des variations tarifaires. »\n« Moi ce que je vous propose, c’est d’en profiter dès aujourd’hui, comme ça vous en profitez dès ce soir. »',
      options: [ { label: 'OK ➜ Clôture', nextId: 'endSport' } ],
    },
    // --- Parcours CANAL+ 100% ---
    path100Resume: {
      id: 'path100Resume',
      title: 'Résumé des besoins',
      text: '« Très bien, par rapport à ce que vous venez de me dire… »\n\nRésumé des besoins du client (éléments recueillis lors de la découverte).',
      options: [ { label: 'OK', nextId: 'path100Intro' } ],
    },
    path100Intro: {
      id: 'path100Intro',
      title: 'Introduction CANAL+',
      text: '« En ce moment nous avons un partenariat avec CANAL+, et ce qui est intéressant pour vous, c’est que par rapport à ce que vous aimez… »',
      options: [ { label: 'OK', nextId: 'focus100' } ],
    },
    focus100: {
      id: 'focus100',
      title: 'Focus offre — CANAL+ 100%',
      text: '• 100% des coupes européennes\n• 100% du rugby\n• 10 chaînes CANAL+\n• Sans Apple TV\n\nTarifs visibles :\n• Prix public (hors engagement) : 32€99/mois\n• Prix pendant engagement : 19€99/mois',
      options: [ { label: 'OK', nextId: 'descalade100' } ],
    },
    descalade100: {
      id: 'descalade100',
      title: 'Désescalade — CANAL+ 100%',
      text: '« Selon vous, CANAL+ peut coûter combien ? Parce que les clients généralement me disent entre 40€ et 60€. »\n\nLe prix public est de : 32€99/mois\nEt pour vous, vu que vous êtes client fidèle Orange : 19€99/mois\n\n« Il faut savoir que ce prix est stable pendant 24 mois et ça vous évite de subir des variations tarifaires. »\n« Moi ce que je vous propose, c’est d’en profiter dès aujourd’hui, comme ça vous en profitez dès ce soir. »',
      options: [ { label: 'OK ➜ Clôture', nextId: 'end100' } ],
    },
    seriesCanalPitch: {
      id: 'seriesCanalPitch',
      title: 'Canal+ — Mise en perspective',
      text: 'Par rapport à ce que vous venez de me dire,\nEst-ce que vous avez déjà pensé à Canal+ ?\nJe vous en parle car beaucoup de clients pensent que Canal+ c’est 40€ par mois. Je vous rassure, ce n’est plus tout à fait le cas.',
      imageSrc: '/offre-canal-plus-cine-series.webp',
      imageAlt: 'Offre CANAL+ Ciné Séries',
      options: [
        { label: 'Continuer ➜ Dé-escalade (Ciné Séries)', nextId: 'seriesDescalade' },
        { label: 'Aller à la clôture', nextId: 'endCine' },
      ],
    },
    seriesDescalade: {
      id: 'seriesDescalade',
      title: 'Dé-escalade — Ciné Séries',
      text: 'Pour être transparent, Canal+ est aujourd’hui proposé à un tarif bien plus accessible.\nEt comme je veux vraiment vous faire plaisir, je peux vous positionner sur un tarif préférentiel pendant 24 mois pour profiter de l’intégralité du cinéma et des séries à la maison.\n\nOn valide cette formule adaptée à vos usages, puis je vous accompagne pour la suite ?',
      imageSrc: '/offre-canal-plus-cine-series.webp',
      imageAlt: 'CANAL+ Ciné Séries — offre adaptée',
      options: [
        { label: 'Valider et passer à la clôture', nextId: 'endCine' },
      ],
    },
    stopCall: {
      id: 'stopCall',
      title: 'Client déjà Canal+',
      text: 'Si Canal ➜ STOP APPEL (selon consignes).',
      options: [],
    },
    endSocle: {
      id: 'endSocle',
      title: 'Fin du parcours',
      text: 'Passez à la proposition détaillée et clôture.',
      images: [
        { src: '/offre-canal-plus.webp', alt: 'Offre CANAL+' },
      ],
      options: [],
    },
    endCine: {
      id: 'endCine',
      title: 'Fin du parcours',
      text: 'Passez à la proposition détaillée et clôture.',
      images: [
        { src: '/offre-canal-plus-cine-series.webp', alt: 'Offre CANAL+ Ciné Séries' },
      ],
      options: [],
    },
    endSport: {
      id: 'endSport',
      title: 'Fin du parcours',
      text: 'Passez à la proposition détaillée et clôture.',
      images: [
        { src: '/offre-canal-plus-sport.webp', alt: 'Offre CANAL+ Sport' },
      ],
      options: [],
    },
    end100: {
      id: 'end100',
      title: 'Fin du parcours',
      text: 'Passez à la proposition détaillée et clôture.',
      images: [
        { src: '/offre-100-canal-plus.webp', alt: 'Offre CANAL+ 100%' },
      ],
      options: [],
    },
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setNavDir('right');
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setNavDir('left');
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4 bg-gradient-to-r from-cactus-50 to-white border border-cactus-100 rounded-lg px-4 py-3">
          <h1 className="text-2xl font-bold text-gray-900">Script d'appel</h1>
          <button
            type="button"
            onClick={resetScript}
            className="flex items-center gap-2 px-4 py-2 text-black hover:text-black border border-gray-300 rounded-lg hover:bg-gray-50 bg-white/80 backdrop-blur"
          >
            <RotateCcw className="w-4 h-4" /> Nouveau script
          </button>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2 shadow-inner">
          <div
            className="h-2 rounded-full transition-all duration-300 bg-gradient-to-r from-cactus-600 to-cactus-500"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-sm text-black mt-2">
          <span>Étape {currentStep + 1} sur {steps.length}</span>
          <span>{Math.round(((currentStep + 1) / steps.length) * 100)}% complété</span>
        </div>

        {/* Stepper animé - visible uniquement en mode wizard */}
        {mode === 'wizard' && (
          <div className="mt-4 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max anim-soft-in">
              {steps.map((s, i) => {
                const completed = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(i)}
                      aria-current={active ? 'step' : undefined}
                      className={
                        "relative group flex items-center gap-2 px-3 py-2 rounded-full border transition-all duration-200 " +
                        (completed
                          ? 'bg-cactus-600 border-cactus-600 text-white shadow-sm hover:bg-cactus-700'
                          : active
                          ? 'border-cactus-400 text-cactus-800 bg-cactus-50'
                          : 'border-gray-200 text-black hover:bg-gray-50')
                      }
                    >
                      <span
                        className={
                          "h-6 w-6 text-xs flex items-center justify-center rounded-full font-semibold " +
                          (completed
                            ? 'bg-white/20 text-white'
                            : active
                            ? 'bg-cactus-200 text-cactus-900'
                            : 'bg-gray-100 text-black')
                        }
                      >
                        {completed ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="text-xs font-medium truncate max-w-[160px]">{s.title}</span>

                      {active && (
                        <span className="absolute inset-0 rounded-full ring-2 ring-cactus-300/70 pointer-events-none animate-pulse" />
                      )}
                    </button>
                    {i < steps.length - 1 && (
                      <div className={`h-0.5 w-6 rounded ${i < currentStep ? 'bg-cactus-500' : 'bg-gray-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Steps navigation - only in wizard mode */}
        {mode === 'wizard' && (
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100 sticky top-6">
              <h2 className="font-semibold text-black mb-4">Étapes du script</h2>
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => setCurrentStep(index)}
                    className={"w-full text-left p-3 rounded-lg transition-colors " + (
                      currentStep === index
                        ? "bg-cactus-100 text-cactus-800 border border-cactus-300"
                        : "text-black hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {step.icon}
                      <span className="text-sm font-medium">{step.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className={mode === 'wizard' ? "lg:col-span-3" : "lg:col-span-4"}>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-semibold text-black">{mode === 'flow' ? 'Script en arborescence' : steps[currentStep].title}</h2>
              <div className="ml-auto inline-flex rounded-lg border border-gray-200">
                <button
                  type="button"
                  className={`px-3 py-1.5 text-sm rounded-l-lg ${mode==='flow' ? 'bg-cactus-100 text-cactus-800' : 'text-black hover:bg-gray-50'}`}
                  onClick={()=> setMode('flow')}
                >Arborescence</button>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-sm rounded-r-lg ${mode==='wizard' ? 'bg-cactus-100 text-cactus-800' : 'text-black hover:bg-gray-50'}`}
                  onClick={()=> setMode('wizard')}
                >Étapes</button>
              </div>
            </div>

            <div className={`${navDir === 'right' ? 'anim-in-right' : 'anim-in-left'}`} key={`${mode}-${currentStep}`}>
              {mode === 'flow' ? (
                <CallDecisionFlow nodes={flowNodes} rootId="root" />
              ) : (
                <>
                  {steps[currentStep].icon}
                  {steps[currentStep].content}
                </>
              )}
            </div>

            {/* Navigation buttons */}
            {mode === 'wizard' && (
              <div className="flex justify-between mt-8">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={currentStep === 0}
                  className="flex items-center gap-2 px-4 py-2 text-black hover:text-black disabled:opacity-50 disabled:cursor-not-allowed hover-lift transition-transform"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Précédent
                </button>

                <button
                  type="button"
                  onClick={nextStep}
                  disabled={currentStep === steps.length - 1}
                  className="flex items-center gap-2 px-4 py-2 bg-cactus-600 text-white rounded-lg hover:bg-cactus-700 disabled:opacity-50 disabled:cursor-not-allowed hover-lift transition-transform"
                >
                  Suivant
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assistant IA Télévente */}
      <TeleSalesAssistant />
    </div>
  );
};

export default CallScriptPage;
