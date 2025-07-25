import { useState } from 'react';
import TeleSalesAssistant from '../components/TeleSalesAssistant';

export default function AssistantTestPage() {
  const [showAssistant, setShowAssistant] = useState(true);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <h1 className="text-4xl font-bold text-white mb-4">
          Test Assistant Vocal Canal+ IA
        </h1>
        <p className="text-gray-300 text-lg">
          Interface de test pour l'assistant vocal intelligent avec Gemini Live
        </p>
      </div>

      {/* Zone de simulation d'appel */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Panneau de simulation client */}
        <div className="bg-white rounded-xl shadow-xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            🎭 Simulation Client
          </h2>
          
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-700 mb-2">Script d'appel simulé :</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p><strong>1. Accroche :</strong> "Bonjour, je suis Sarah, conseiller Orange pour Canal+"</p>
                <p><strong>2. Légal :</strong> "Cet appel est enregistré pour améliorer la qualité de service"</p>
                <p><strong>3. Confirmation :</strong> "Vous êtes bien Mr Martin, titulaire de la ligne ?"</p>
                <p><strong>4. Découverte :</strong> "Qu'est-ce que vous regardez habituellement ?"</p>
                <p><strong>5. Proposition :</strong> "J'ai une offre Canal+ à 19.99€/mois"</p>
                <p><strong>6. Clôture :</strong> "On peut finaliser ensemble ?"</p>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-medium text-blue-700 mb-2">Exemples de phrases à tester :</h3>
              <div className="space-y-1 text-sm text-blue-600">
                <p>• "Bonjour, je suis conseiller Orange pour Canal+"</p>
                <p>• "Cet appel est enregistré pour la qualité"</p>
                <p>• "Vous regardez quoi comme séries ?"</p>
                <p>• "J'ai une offre à 19 euros par mois"</p>
                <p>• "C'est trop cher pour moi"</p>
                <p>• "Je réfléchis et je vous rappelle"</p>
              </div>
            </div>
          </div>
        </div>

        {/* Panneau de contrôle */}
        <div className="bg-white rounded-xl shadow-xl p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            ⚙️ Contrôles de Test
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Afficher l'assistant :</span>
              <button
                onClick={() => setShowAssistant(!showAssistant)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  showAssistant 
                    ? 'bg-green-500 text-white' 
                    : 'bg-gray-300 text-gray-700'
                }`}
              >
                {showAssistant ? 'Masquer' : 'Afficher'}
              </button>
            </div>

            <div className="bg-yellow-50 rounded-lg p-4">
              <h3 className="font-medium text-yellow-700 mb-2">🧪 Instructions de test :</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-yellow-600">
                <li>Activez le microphone dans l'assistant</li>
                <li>Prononcez les phrases d'exemple</li>
                <li>Observez les alertes et suggestions</li>
                <li>Vérifiez la progression du script</li>
                <li>Testez les objections client</li>
              </ol>
            </div>

            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="font-medium text-green-700 mb-2">✅ Fonctionnalités à vérifier :</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-green-600">
                <li>Connexion Gemini Live</li>
                <li>Transcription temps réel</li>
                <li>Détection des étapes du script</li>
                <li>Alertes d'étapes manquées</li>
                <li>Suggestions contextuelles</li>
                <li>Sphère 3D interactive</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Informations techniques */}
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-gray-800 rounded-xl p-6 text-white">
          <h2 className="text-xl font-bold mb-4">📊 Informations Techniques</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <h3 className="font-medium text-blue-400 mb-2">Backend :</h3>
              <p>• Gemini Live API</p>
              <p>• Streaming audio PCM 16kHz</p>
              <p>• WebRTC pour micro</p>
            </div>
            <div>
              <h3 className="font-medium text-green-400 mb-2">Frontend :</h3>
              <p>• React + TypeScript</p>
              <p>• Three.js pour 3D</p>
              <p>• Tailwind CSS</p>
            </div>
            <div>
              <h3 className="font-medium text-purple-400 mb-2">IA :</h3>
              <p>• Analyse sémantique temps réel</p>
              <p>• Détection script Canal+</p>
              <p>• Suggestions contextuelles</p>
            </div>
          </div>
        </div>
      </div>

      {/* Assistant vocal */}
      {showAssistant && <TeleSalesAssistant />}
    </div>
  );
}
