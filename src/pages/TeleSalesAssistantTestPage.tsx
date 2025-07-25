import TeleSalesAssistant from '../components/TeleSalesAssistant';

export default function TeleSalesAssistantTestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* En-tête */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            🎯 Assistant Vocal Canal+ avec IA
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Assistant intelligent en temps réel pour téléconseillers avec analyse Gemini Live, 
            transcription audio, suivi du script métier et suggestions contextuelles.
          </p>
        </div>

        {/* Zone de démonstration */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Instructions */}
          <div className="bg-white rounded-xl p-6 shadow-lg">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              🚀 Comment utiliser l'assistant
            </h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  1
                </div>
                <div>
                  <h3 className="font-medium text-gray-800">Connexion automatique</h3>
                  <p className="text-gray-600 text-sm">L'assistant se connecte automatiquement à Gemini Live au chargement.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  2
                </div>
                <div>
                  <h3 className="font-medium text-gray-800">Démarrer l'écoute</h3>
                  <p className="text-gray-600 text-sm">Cliquez sur le microphone pour commencer l'analyse en temps réel.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  3
                </div>
                <div>
                  <h3 className="font-medium text-gray-800">Parlez naturellement</h3>
                  <p className="text-gray-600 text-sm">Suivez le script Canal+ normal, l'IA vous guide automatiquement.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  4
                </div>
                <div>
                  <h3 className="font-medium text-gray-800">Suivez les suggestions</h3>
                  <p className="text-gray-600 text-sm">Les bulles de suggestions et alertes apparaissent en temps réel.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Script Canal+ */}
          <div className="bg-white rounded-xl p-6 shadow-lg">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              📋 Script métier Canal+
            </h2>
            <div className="space-y-3">
              <div className="border-l-4 border-blue-500 pl-3">
                <h3 className="font-medium text-gray-800">1. Salutation & Présentation</h3>
                <p className="text-sm text-gray-600">
                  "Bonjour, [Nom], je suis [Prénom] conseiller Orange pour Canal+"
                </p>
              </div>
              
              <div className="border-l-4 border-yellow-500 pl-3">
                <h3 className="font-medium text-gray-800">2. Mentions Légales *</h3>
                <p className="text-sm text-gray-600">
                  "Cet appel est enregistré pour la qualité de service. Vous êtes inscrit sur Bloctel?"
                </p>
              </div>
              
              <div className="border-l-4 border-green-500 pl-3">
                <h3 className="font-medium text-gray-800">3. Vérification des Données</h3>
                <p className="text-sm text-gray-600">
                  "Confirmez-vous que vous êtes bien le titulaire de la ligne à [adresse]?"
                </p>
              </div>
              
              <div className="border-l-4 border-purple-500 pl-3">
                <h3 className="font-medium text-gray-800">4. Découverte des Besoins</h3>
                <p className="text-sm text-gray-600">
                  "Qu'aimez-vous regarder? Séries, films, sport?"
                </p>
              </div>
              
              <div className="border-l-4 border-indigo-500 pl-3">
                <h3 className="font-medium text-gray-800">5. Présentation de l'Offre</h3>
                <p className="text-sm text-gray-600">
                  "J'ai l'offre Canal+ Ciné-Séries avec Netflix inclus à 24,99€/mois"
                </p>
              </div>
              
              <div className="border-l-4 border-pink-500 pl-3">
                <h3 className="font-medium text-gray-800">6. Conclusion</h3>
                <p className="text-sm text-gray-600">
                  "Parfait! Activation sous 48h, vous recevrez un email de confirmation"
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              * Étapes obligatoires marquées par un astérisque
            </p>
          </div>
        </div>

        {/* Exemples de phrases pour tester */}
        <div className="bg-white rounded-xl p-6 shadow-lg mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            🗣️ Phrases de test pour l'assistant
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-gray-700 mb-2">✅ Phrases qui respectent le script :</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
                <li>"Bonjour madame Durand, je suis Pierre conseiller Orange pour Canal+"</li>
                <li>"Cet appel est enregistré pour la qualité de service"</li>
                <li>"Confirmez-vous que vous êtes bien titulaire de la ligne?"</li>
                <li>"Qu'aimez-vous regarder comme séries ou films?"</li>
                <li>"J'ai une offre Canal+ avec Netflix inclus"</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-medium text-gray-700 mb-2">⚠️ Phrases qui déclenchent des alertes :</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
                <li>"Bonjour, puis-je vous proposer Canal+?" (pas de mentions légales)</li>
                <li>"C'est cher 30 euros par mois" (objection prix détectée)</li>
                <li>"J'ai déjà Netflix" (concurrent mentionné)</li>
                <li>"Je ne suis pas intéressé" (résistance client)</li>
                <li>Sauter directement à l'offre sans découverte</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Fonctionnalités */}
        <div className="bg-white rounded-xl p-6 shadow-lg">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            ✨ Fonctionnalités de l'assistant
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                🎤
              </div>
              <h3 className="font-medium text-gray-800 mb-2">Streaming Audio</h3>
              <p className="text-sm text-gray-600">
                Transcription en temps réel avec Gemini Live ou reconnaissance vocale navigateur
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                🧠
              </div>
              <h3 className="font-medium text-gray-800 mb-2">Analyse IA</h3>
              <p className="text-sm text-gray-600">
                Gemini analyse chaque phrase et compare au script métier Canal+
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                💡
              </div>
              <h3 className="font-medium text-gray-800 mb-2">Suggestions Live</h3>
              <p className="text-sm text-gray-600">
                Réponses aux objections, upsells et rappels d'étapes en temps réel
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Assistant fixé en bas à droite */}
      <TeleSalesAssistant />
    </div>
  );
}
