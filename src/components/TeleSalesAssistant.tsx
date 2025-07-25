import { useState, useEffect, useRef, useCallback } from "react";


import { Mic, MicOff, Minimize2, Activity } from "lucide-react";
import IntelligentSphere from "./IntelligentSphere";
import GeminiLiveAssistant, {
  SmartSuggestion,
} from "../services/geminiLiveAssistant";

// Types pour la reconnaissance vocale
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface TeleSalesAssistantProps {
  className?: string;
}

export default function TeleSalesAssistant({
  className = "",
}: TeleSalesAssistantProps) {
  // Contrôle du démarrage de session
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  // ...existing code...
  // Indicateur de son détecté
  const [isSoundDetected, setIsSoundDetected] = useState(false);
  // États principaux
  const [isListening, setIsListening] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false); // Ajouté

  // Suggestions IA uniquement (bulles)
  const [iaBubbles, setIaBubbles] = useState<SmartSuggestion[]>([]);
  const [suggestionLevel, setSuggestionLevel] = useState(0);

  // Références
  const recognition = useRef<any>(null);
  const geminiAssistant = useRef<GeminiLiveAssistant | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const isWebSpeechSupported =
    "webkitSpeechRecognition" in window || "SpeechRecognition" in window;

  // Initialisation de Gemini Live (uniquement quand la session démarre)
  // Initialisation Gemini Live (uniquement quand la session démarre)
  const initializeGemini = useCallback(async () => {
    try {
      geminiAssistant.current = new GeminiLiveAssistant();
      await geminiAssistant.current.connect({
        onSuggestionUpdate: (newSuggestions: SmartSuggestion[]) => {
          console.log('[Gemini] Suggestions reçues:', newSuggestions);
          setIaBubbles((prev) => {
            const existingIds = new Set(prev.map((s) => s.id + s.text));
            const toAdd = newSuggestions.filter(s => {
              const txt = (s.text || "") + " " + (s.context || "");
              if (!s.text || s.text.length < 4) {
                console.log('[Gemini][Filtre] Suggestion ignorée (trop courte/absente):', s);
                return false;
              }
              if (/exemple|example/i.test(txt)) {
                console.log('[Gemini][Filtre] Suggestion ignorée (exemple):', s);
                return false;
              }
              if (existingIds.has(s.id + s.text)) {
                console.log('[Gemini][Filtre] Suggestion ignorée (déjà vue):', s);
                return false;
              }
              console.log('[Gemini][Filtre] Suggestion ajoutée:', s);
              return true;
            });
            const all = [...prev, ...toAdd];
            console.log('[Gemini][UI] Bulles IA affichées:', all);
            return all;
          });
          setSuggestionLevel(Math.min(newSuggestions.length, 5));
        },
        onClose: () => {
          setIsGeminiConnected(false);
          setIsSessionStarted(false);
          setSessionClosed(true);
          setIsListening(false);
          setIsSoundDetected(false);
          if (audioStream.current) {
            audioStream.current.getTracks().forEach((track) => track.stop());
            audioStream.current = null;
          }
        },
      });
      setIsGeminiConnected(true);
      setSessionClosed(false);
      console.log("✅ Assistant Gemini Live connecté");
    } catch (error) {
      setIsGeminiConnected(false);
      setSessionClosed(true);
      setIsSessionStarted(false);
      console.error("❌ Erreur connexion Gemini:", error);
    }
  }, []);

  // Démarrer la session Gemini Live + micro
  const handleStartSession = async () => {
    setIsSessionStarted(true);
    await initializeGemini();
    await startAudioStreaming();
  };

  // Nettoyage à l'unmount
  useEffect(() => {
    return () => {
      if (geminiAssistant.current) {
        geminiAssistant.current.disconnect();
      }
      if (audioStream.current) {
        audioStream.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Initialisation de la reconnaissance vocale de fallback (uniquement si session démarrée)
  useEffect(() => {
    if (!isSessionStarted) return;
    if (isWebSpeechSupported) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = true;
      recognition.current.interimResults = true;
      recognition.current.lang = "fr-FR";

      recognition.current.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript + " ";
          }
        }

        // Filtrage : n'envoyer que si la phrase est longue et pertinente (au moins 5 caractères, contient une voyelle)
        const cleaned = finalTranscript.trim();
        if (
          cleaned &&
          cleaned.length > 5 &&
          /[aeiouyàâéèêëîïôùûüÿœ]/i.test(cleaned) &&
          geminiAssistant.current
        ) {
          console.log('[Reco] Transcript envoyé à Gemini:', cleaned);
          geminiAssistant.current.sendText(cleaned);
          setIsAnalyzing(true);
          setTimeout(() => setIsAnalyzing(false), 1000);
        } else {
          if (cleaned) {
            console.log('[Reco][Filtre] Transcript ignoré (trop court ou bruit):', cleaned);
          }
        }
      };

      recognition.current.onerror = (event: any) => {
        console.error("Erreur reconnaissance vocale:", event.error);
        setIsListening(false);
      };

      recognition.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognition.current) {
        recognition.current.stop();
      }
    };
  }, [isSessionStarted]);

  // Gestion du streaming audio vers Gemini Live
  const startAudioStreaming = async () => {
    try {
      if (!geminiAssistant.current) return;

      // Demander l'accès au microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      audioStream.current = stream;
      setIsListening(true);
      console.log("🎤 Streaming audio vers Gemini Live démarré");

      // Créer un AudioContext sans forcer le sampleRate (évite DOMException)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Détection de son (simple RMS)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setIsSoundDetected(rms > 0.01); // seuil à ajuster si besoin

        // Convertir en PCM 16-bit
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }

        // Log audio buffer info pour debug
        console.log('[DEBUG] Audio PCM buffer size:', pcmData.length, 'bytes:', pcmData.byteLength);

        // Envoyer les données audio à Gemini Live
        if (geminiAssistant.current && isListening) {
          console.log('[DEBUG] Appel sendAudio vers Gemini');
          geminiAssistant.current.sendAudio(pcmData.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (error) {
      console.error("❌ Erreur streaming audio:", error);
      // Fallback sur reconnaissance vocale navigateur
      if (recognition.current) {
        recognition.current.start();
        setIsListening(true);
      }
    }
  };

  const stopAudioStreaming = () => {
    if (audioStream.current) {
      audioStream.current.getTracks().forEach((track) => track.stop());
      audioStream.current = null;
    }

    if (recognition.current) {
      recognition.current.stop();
    }

    setIsListening(false);
    setIsSoundDetected(false);
    console.log("🛑 Streaming audio arrêté");
  };

  const toggleListening = () => {
    if (isListening) {
      stopAudioStreaming();
    } else {
      startAudioStreaming();
    }
  };

  // Nouveau appel - reset de la session
  const startNewCall = async () => {
    if (geminiAssistant.current) {
      await geminiAssistant.current.startNewCall();
      setIaBubbles([]);
      setSuggestionLevel(0);
    }
  };

  // Plus de progression script : IA only
  const completedCount = 0;
  const completionRate = 0;

  // Interface minimisée (petit indicateur discret)
  if (isMinimized) {
    return (
      <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
        <div
          className="bg-white rounded-full p-3 shadow-lg border border-gray-200 cursor-pointer hover:shadow-xl transition-all duration-300"
          onClick={() => setIsMinimized(false)}
        >
          <div className="flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isListening
                  ? isSoundDetected
                    ? "bg-green-500 animate-pulse"
                    : "bg-yellow-400 animate-pulse"
                  : isGeminiConnected
                  ? "bg-cactus-500"
                  : "bg-gray-400"
              }`}
            />
            <span className="text-xs font-medium text-gray-700">
              {completedCount}/6
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Affichage du bouton de démarrage si la session n'est pas lancée
  if (!isSessionStarted) {
    return (
      <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[400px] h-[200px] flex flex-col items-center justify-center">
          <h3 className="text-lg font-semibold text-cactus-600 mb-4">Assistant Canal+ IA</h3>
          {sessionClosed ? (
            <div className="mb-2 text-red-500 text-sm">Session terminée ou déconnectée.</div>
          ) : null}
          <button
            className="bg-cactus-500 hover:bg-cactus-600 text-white font-bold py-2 px-6 rounded-full shadow-lg transition-all text-lg"
            onClick={handleStartSession}
          >
            🚀 Démarrer l'appel
          </button>
          <div className="text-xs text-gray-500 mt-3">La session Gemini Live et le micro seront activés</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[450px] h-[650px] flex flex-col overflow-hidden">
        {/* Header compact */}
        <div className="bg-cactus-600 p-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isListening
                  ? isSoundDetected
                    ? "bg-green-500 animate-pulse"
                    : "bg-yellow-400 animate-pulse"
                  : isGeminiConnected
                  ? "bg-green-400"
                  : "bg-red-400"
              }`}
            />
            <h3 className="font-medium text-sm">Assistant Canal+</h3>
          </div>
          <div className="flex space-x-1">
            <button
              onClick={startNewCall}
              className="p-1 hover:bg-cactus-700 rounded transition-colors"
              title="Nouvel appel"
            >
              <Activity className="w-3 h-3" />
            </button>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 hover:bg-cactus-700 rounded transition-colors"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Zone principale - Sphère prend toute la place */}
        <div className="flex-1 relative bg-gray-900">
          <IntelligentSphere
            isListening={isListening}
            isAnalyzing={isAnalyzing}
            suggestions={iaBubbles.map((s) => ({
              id: s.id,
              type:
                s.type === "script_reminder"
                  ? "script"
                  : s.type === "objection_response"
                  ? "relance"
                  : "offre",
              text: s.text,
              context: s.context,
              priority: s.priority,
            }))}
            scriptAlerts={[]}
            completedSteps={[]}
            suggestionLevel={suggestionLevel}
          />
        </div>

        {/* Footer compact avec contrôles */}
        <div className="bg-white p-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={toggleListening}
              disabled={!isGeminiConnected}
              className={`p-2 rounded-full transition-all duration-300 ${
                isListening
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-md"
                  : isGeminiConnected
                  ? "bg-cactus-500 hover:bg-cactus-600 text-white shadow-sm"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {isListening ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            {/* Statut */}
            <div className="text-center">
              <div className="text-xs text-gray-600">
                {isListening
                  ? "🔴 Écoute"
                  : isAnalyzing
                  ? "🧠 Analyse"
                  : "✅ Prêt"}
              </div>
              <div className="text-xs text-gray-500">
                {isGeminiConnected ? "Gemini Live" : "Connexion..."}
              </div>
            </div>

            {/* Progression du script (désactivé) */}
            <div className="text-right">
              <div className="text-xs font-medium text-gray-700">
                {completionRate}%
              </div>
              <div className="text-xs text-gray-500">{completedCount}/6</div>
            </div>
          </div>

          {/* Barre de progression du script (désactivée) */}
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-cactus-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${completionRate}%` }}
            />
          </div>

          {/* Indicateurs des étapes (désactivés) */}
          <div className="flex justify-between mt-1">{/* Rien */}</div>
        </div>
      </div>
    </div>
  );
}
