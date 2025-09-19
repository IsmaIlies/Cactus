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
import TeleSalesAssistant from "../components/TeleSalesAssistant";

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
  const [showInfoPopup, setShowInfoPopup] = useState(true);

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
              <p className="text-gray-800 mb-3">
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
              <p className="text-gray-800">
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
              <button className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-orange-100 p-2 rounded-full">
                    <MessageSquare className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <div className="font-medium text-orange-800 mb-1">
                      Réponse principale
                    </div>
                    <p className="text-gray-700">
                      "Oh je vous prends juste 2 petites minutes, c'est promis !
                      C'est important, vous êtes un abonné fidèle et on veut
                      continuer à vous proposer du contenu pertinent."
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
                      Alternative
                    </div>
                    <p className="text-gray-700">
                      "Je comprends parfaitement, c'est justement pour ça que je
                      vais être très bref. Juste 2 minutes pour faire le point."
                    </p>
                  </div>
                </div>
  {/* ...existing code... */}
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
                    <p className="text-gray-700">
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
                    <p className="text-gray-700">
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
                    <p className="text-gray-700">
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
                    <p className="text-gray-700">
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
              <button className="w-full text-left p-4 bg-white rounded border border-red-200 hover:bg-red-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-red-100 p-2 rounded-full">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <div className="font-medium text-red-800 mb-1">
                      Appel enregistré
                    </div>
                    <p className="text-gray-700">
                      "Juste pour vous prévenir, cet appel est enregistré dans
                      un but d'amélioration de notre qualité de service."
                    </p>
                  </div>
                </div>
              </button>

              <button className="w-full text-left p-4 bg-white rounded border border-red-200 hover:bg-red-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-red-100 p-2 rounded-full">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <div className="font-medium text-red-800 mb-1">Bloctel</div>
                    <p className="text-gray-700">
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
              <button className="w-full text-left p-4 bg-white rounded border border-green-200 hover:bg-green-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-green-800 mb-1">
                      Confirmation du titulaire
                    </div>
                    <p className="text-gray-700">
                      "Vous êtes bien le titulaire de la ligne ?"
                    </p>
                  </div>
                  <div className="flex gap-2"></div>
                </div>
              </button>

              <button className="w-full text-left p-4 bg-white rounded border border-green-200 hover:bg-green-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-green-800 mb-1">
                      Confirmation de l'adresse
                    </div>
                    <p className="text-gray-700">
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
                    <p className="text-gray-700">
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
                    <p className="text-gray-700">
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
                    <p className="text-gray-700">
                      "Aucun souci, je peux vous envoyer un mail avec toutes les
                      infos, et je vous rappelle demain à la même heure ?"
                    </p>
                  </div>
                </div>
              </button>

              <button className="w-full text-left p-4 bg-white rounded border border-orange-200 hover:bg-orange-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="bg-gray-100 p-2 rounded-full">
                    <AlertCircle className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-orange-800 mb-1">
                      ❌ "Je ne regarde pas la télé"
                    </div>
                    <p className="text-gray-700">
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
                  <p className="text-gray-700">
                    Très bien M./Mme{" "}
                    <span className="bg-yellow-200 px-1 rounded">[Nom]</span>,
                    je prends note de votre accord pour votre abonnement CANAL
                    PLUS avec l’offre{" "}
                    <span className="bg-yellow-200 px-1 rounded">
                      [Nom de l’offre]
                    </span>{" "}
                    à{" "}
                    <span className="bg-yellow-200 px-1 rounded">
                      [Montant]
                    </span>{" "}
                    Euros/mois.
                    <br />
                    Je vous précise que les dispositions du code de la
                    consommation vous permettent d’exercer votre droit de
                    rétractation de 14 jours à compter de la date de votre
                    commande.
                    <br />
                    Afin de finaliser la commande, pouvez-vous me confirmer
                    votre adresse EMAIL{" "}
                    <span className="bg-yellow-200 px-1 rounded">
                      [Adresse email]
                    </span>{" "}
                    ?<br />
                    Celle-ci sera l’adresse de référence de votre contrat Canal
                    Plus.
                    <br />
                    Vous recevrez plusieurs informations de Canal Plus par mail
                    et SMS, notamment un SMS pour signer votre contrat.
                    <br />
                    Vous me confirmez bien être en prélèvement automatique
                    actuellement ?<br />
                    Si oui, pour simplifier vos démarches, Orange communiquera
                    au Groupe Canal Plus vos coordonnées personnelles et
                    bancaires et le prélèvement interviendra le 4 de chaque
                    mois.
                    <br />
                    Je vous envoie l'offre, et je vous rappelle dans les 48
                    heures. Une fois accepté, j'active l'offre sur votre box.
                    <br />
                    Dernier point, afin de pouvoir assurer le suivi de la
                    validation de votre commande et d'être en conformité avec le
                    décret, me permettez-vous de vous contacter au-delà de 4
                    tentatives d'appels ?<br />
                    VOUS POUVEZ ME RECONTACTER AU{" "}
                    <span className="bg-yellow-200 px-1 rounded">
                      04 65 33 08 05
                    </span>{" "}
                    pour toutes questions.
                    <br />
                    Si non, un collaborateur vous recontactera pour récupérer
                    votre IBAN.
                    <br />
                    Vous pouvez toutefois contacter notre service au{" "}
                    <span className="bg-yellow-200 px-1 rounded">
                      0800 005 768
                    </span>{" "}
                    en leur indiquant votre référence commande :{" "}
                    <span className="bg-yellow-200 px-1 rounded">
                      [Référence]
                    </span>
                    .<br />
                    Votre offre se mettra en place sous 24 heures après
                    validation de votre accord.
                    <br />
                    Est-ce que tout est clair pour vous ?<br />
                    Profitez bien de votre offre, Orange vous remercie pour
                    votre accueil et je vous souhaite une excellente journée.
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      ),
    },
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {showInfoPopup && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-xl px-6">
          <div className="bg-white border border-cactus-300 shadow-lg rounded-xl p-5 flex flex-col gap-3 relative animate-fade-in">
            <button
              className="absolute top-2 right-2 text-cactus-500 hover:text-cactus-700 text-lg font-bold"
              onClick={() => setShowInfoPopup(false)}
              title="Fermer"
            >
              ×
            </button>
            <h2 className="text-lg font-semibold text-cactus-700 mb-1">Mail d'accompagnement</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              <span className="font-semibold text-cactus-700">Ce texte est à utiliser comme mail d'accompagnement après votre appel.</span><br /><br />
              Comme convenu, je vous transmets par ce mail le récapitulatif de l’offre présentée lors de notre échange.<br />
              Je vous invite à en prendre connaissance et reste à votre disposition pour toute précision complémentaire.<br />
              Vous pouvez me joindre directement au&nbsp;
              <span className="font-bold text-cactus-800 bg-cactus-100 px-2 py-1 rounded">01 62 22 00 31</span>
            </p>
          </div>
        </div>
      )}
      {!showInfoPopup && (
        <button
          className="fixed top-6 right-8 z-50 bg-cactus-600 hover:bg-cactus-700 text-white rounded-full shadow-lg p-3 flex items-center justify-center transition-colors"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
          onClick={() => setShowInfoPopup(true)}
          title="Afficher l'information"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="#fff"/><text x="12" y="16" textAnchor="middle" fontSize="12" fill="#2d7a46">i</text></svg>
        </button>
      )}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Script d'appel</h1>
          <button
            onClick={resetScript}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RotateCcw className="w-4 h-4" /> Nouveau script
          </button>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-cactus-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / 6) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-sm text-gray-600 mt-2">
          <span>Étape {currentStep + 1} sur 6</span>
          <span>{Math.round(((currentStep + 1) / 6) * 100)}% complété</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Steps navigation */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100 sticky top-6">
            <h2 className="font-semibold text-gray-900 mb-4">
              Étapes du script
            </h2>
            <div className="space-y-2">
              {steps.map((step, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentStep(index)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    currentStep === index
                      ? "bg-cactus-100 text-cactus-800 border border-cactus-300"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
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

        {/* Main content */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              {steps[currentStep].icon}
              <h2 className="text-xl font-semibold text-gray-900">
                {steps[currentStep].title}
              </h2>
            </div>

            {steps[currentStep].content}

            {/* Navigation buttons */}
            <div className="flex justify-between mt-8">
              <button
                onClick={prevStep}
                disabled={currentStep === 0}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </button>

              <button
                onClick={nextStep}
                disabled={currentStep === steps.length - 1}
                className="flex items-center gap-2 px-4 py-2 bg-cactus-600 text-white rounded-lg hover:bg-cactus-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Assistant IA Télévente */}
      <TeleSalesAssistant />
    </div>
  );
};

export default CallScriptPage;
