import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity } from '@google/genai';

// Types spécifiques pour l'assistant téléconseiller
export interface ScriptStep {
  id: string;
  name: string;
  required: boolean;
  keywords: string[];
  description: string;
  completed: boolean;
  timestamp?: number;
}

export interface SalesAlert {
  id: string;
  type: 'missing_step' | 'wrong_order' | 'legal_required' | 'objection_detected';
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: number;
  suggestedAction?: string;
}

export interface SmartSuggestion {
  id: string;
  type: 'script_reminder' | 'objection_response' | 'upsell' | 'closing_technique' | 'offer_transition';
  text: string;
  context: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
  clickable: boolean;
}

export interface ConversationContext {
  clientProfile: {
    interests: string[];
    objections: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
    engagementLevel: number; // 0-100
  };
  scriptProgress: {
    currentStep: string;
    completedSteps: string[];
    missedSteps: string[];
    timeline: Array<{ step: string; timestamp: number }>;
  };
  suggestions: SmartSuggestion[];
  alerts: SalesAlert[];
}

// Script métier Canal+ prédéfini
export const CANAL_PLUS_SCRIPT: ScriptStep[] = [
  {
    id: 'greeting',
    name: 'Salutation & Présentation',
    required: true,
    keywords: ['bonjour', 'bonsoir', 'orange', 'conseiller', 'canal'],
    description: 'Se présenter comme conseiller Orange pour Canal+',
    completed: false
  },
  {
    id: 'legal_mentions',
    name: 'Mentions Légales',
    required: true,
    keywords: ['enregistré', 'qualité', 'service', 'bloctel'],
    description: 'Informer que l\'appel est enregistré et mentionner Bloctel',
    completed: false
  },
  {
    id: 'data_verification',
    name: 'Vérification des Données',
    required: true,
    keywords: ['titulaire', 'adresse', 'confirmez', 'vérifier'],
    description: 'Confirmer identité et adresse du client',
    completed: false
  },
  {
    id: 'needs_discovery',
    name: 'Découverte des Besoins',
    required: true,
    keywords: ['regardez', 'préférez', 'habitudes', 'télévision', 'séries', 'sport'],
    description: 'Questionner sur les habitudes TV et préférences',
    completed: false
  },
  {
    id: 'offer_presentation',
    name: 'Présentation de l\'Offre',
    required: true,
    keywords: ['canal+', 'offre', 'netflix', 'prix', 'euros', 'mois'],
    description: 'Présenter l\'offre Canal+ adaptée',
    completed: false
  },
  {
    id: 'objection_handling',
    name: 'Gestion des Objections',
    required: false,
    keywords: ['cher', 'réfléchir', 'pas intéressé', 'déjà', 'concurrent'],
    description: 'Répondre aux objections du client',
    completed: false
  },
  {
    id: 'closing',
    name: 'Conclusion & Validation',
    required: true,
    keywords: ['accord', 'commande', 'email', 'prélèvement', 'activation'],
    description: 'Conclure la vente et organiser l\'activation',
    completed: false
  }
];

class GeminiLiveAssistant {
  private ai: GoogleGenAI;
  private session: any = null;
  private responseQueue: any[] = [];
  private isConnected: boolean = false;
  private context: ConversationContext;
  // Anti-spam pour les transitions automatiques
  private lastOfferTransitionAt: number = 0;
  
  // Callbacks pour l'interface utilisateur
  private onTranscriptUpdate?: (text: string, speaker: 'agent' | 'client') => void;
  private onSuggestionUpdate?: (suggestions: SmartSuggestion[]) => void;
  private onAlertUpdate?: (alerts: SalesAlert[]) => void;
  private onScriptUpdate?: (steps: ScriptStep[]) => void;

  constructor(apiKey?: string) {
    const key = apiKey || import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyDqpjxQoiubpPOE2tIxztb0SB61QX01Zas';
    if (!key) {
      throw new Error('Clé API Gemini manquante. Veuillez configurer VITE_GEMINI_API_KEY dans .env');
    }
    this.ai = new GoogleGenAI({
      apiKey: key
    });
    
    this.context = {
      clientProfile: {
        interests: [],
        objections: [],
        sentiment: 'neutral',
        engagementLevel: 50
      },
      scriptProgress: {
        currentStep: 'greeting',
        completedSteps: [],
        missedSteps: [],
        timeline: []
      },
      suggestions: [],
      alerts: []
    };
  }

  // Connexion à Gemini Live avec configuration optimisée pour téléconseiller
  async connect(callbacks: {
    onTranscriptUpdate?: (text: string, speaker: 'agent' | 'client') => void;
    onSuggestionUpdate?: (suggestions: SmartSuggestion[]) => void;
    onAlertUpdate?: (alerts: SalesAlert[]) => void;
    onScriptUpdate?: (steps: ScriptStep[]) => void;
    onClose?: () => void;
  }) {
    try {
      this.onTranscriptUpdate = callbacks.onTranscriptUpdate;
      this.onSuggestionUpdate = callbacks.onSuggestionUpdate;
      this.onAlertUpdate = callbacks.onAlertUpdate;
      this.onScriptUpdate = callbacks.onScriptUpdate;
      const onCloseCb = callbacks.onClose;

      const config = {
        responseModalities: [Modality.TEXT],
        // Activer la transcription audio en entrée
        inputAudioTranscription: {},
        // Configuration optimisée pour la détection vocale
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
            prefixPaddingMs: 100,
            silenceDurationMs: 1000
          }
        }
      };

      this.session = await this.ai.live.connect({
        model: 'gemini-live-2.5-flash-preview',
        config,
        callbacks: {
          onopen: () => {
            console.log('✅ Assistant téléconseiller connecté');
            this.isConnected = true;
            // Délai pour s'assurer que this.session est bien assignée
            setTimeout(() => this.initializeSession(), 100);
          },
          onmessage: (message) => {
            this.responseQueue.push(message);
            this.processMessage(message);
          },
          onerror: (error) => {
            console.error('❌ Erreur Gemini Live:', error);
            this.isConnected = false;
          },
          onclose: (reason) => {
            console.log('🔒 Session fermée:', reason);
            this.isConnected = false;
            if (onCloseCb) onCloseCb();
          }
        }
      });

    } catch (error) {
      console.error('Erreur de connexion:', error);
      throw error;
    }
  }

  // Initialisation avec le contexte du script Canal+
  private async initializeSession() {
    const systemPrompt = `Tu es un assistant IA expert pour les téléconseillers Canal+ d'Orange.

MISSION PRINCIPALE :
- Analyser en temps réel les conversations téléphoniques
- Vérifier le respect du script de vente Canal+
- Générer des suggestions contextuelles intelligentes
- Détecter les objections et proposer des réponses adaptées

SCRIPT CANAL+ À RESPECTER :
${CANAL_PLUS_SCRIPT.map(step => `${step.id}: ${step.description} (Mots-clés: ${step.keywords.join(', ')})`).join('\n')}

ANALYSE ATTENDUE :
Pour chaque intervention du téléconseiller, analyse :
1. Quelle étape du script est en cours
2. Si des étapes sont manquées ou dans le mauvais ordre
3. Le sentiment et l'engagement du client (si mentionné)
4. Les objections potentielles à anticiper
5. Les opportunités d'upsell

FORMAT DE RÉPONSE JSON :
{
  "current_step": "id_etape",
  "completed_steps": ["etape1", "etape2"],
  "missing_steps": ["etape_manquee"],
  "client_sentiment": "positive|neutral|negative",
  "engagement_level": 0-100,
  "suggestions": [
    {
      "type": "script_reminder|objection_response|upsell|closing_technique",
      "text": "Suggestion précise",
      "priority": "high|medium|low",
      "context": "Pourquoi cette suggestion"
    }
  ],
  "alerts": [
    {
      "type": "missing_step|wrong_order|legal_required|objection_detected",
      "message": "Message d'alerte",
      "severity": "error|warning|info",
      "suggested_action": "Action recommandée"
    }
  ]
}

Réponds UNIQUEMENT en JSON valide. Sois précis et actionnable.`;

    if (!this.session) {
      console.error('❌ Session non initialisée dans initializeSession');
      return;
    }

    this.session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }]
        }
      ],
      turnComplete: true
    });
  }

  // Traitement des messages en temps réel
  private async processMessage(message: any) {
    try {
      // Transcription audio en entrée (parole du téléconseiller)
      if (message.serverContent?.inputTranscription) {
        const transcription = message.serverContent.inputTranscription.text;
        console.log('🎤 Transcription agent:', transcription);
        
        this.onTranscriptUpdate?.(transcription, 'agent');
        
        // Analyser la transcription par rapport au script
        await this.analyzeAgentSpeech(transcription);
      }

      // Réponse de l'IA (analyse et suggestions)
      if (message.text) {
        try {
          // Nettoyer le texte pour ne garder que le JSON
          let jsonText = message.text.trim();
          if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json/, '').replace(/```$/, '').trim();
          } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```/, '').replace(/```$/, '').trim();
          }
          const analysis = JSON.parse(jsonText);
          this.updateContext(analysis);
        } catch (e) {
          console.log('📝 Réponse texte:', message.text);
        }
      }

      // Fin de tour de conversation
      if (message.serverContent?.turnComplete) {
        console.log('✅ Tour de conversation terminé');
      }

    } catch (error) {
      console.error('Erreur traitement message:', error);
    }
  }

  // Analyse de la parole du téléconseiller
  private async analyzeAgentSpeech(transcription: string) {
    const analysisPrompt = `NOUVELLE INTERVENTION TÉLÉCONSEILLER:
"${transcription}"

CONTEXTE ACTUEL:
- Étape courante: ${this.context.scriptProgress.currentStep}
- Étapes complétées: ${this.context.scriptProgress.completedSteps.join(', ')}
- Sentiment client: ${this.context.clientProfile.sentiment}
- Niveau d'engagement: ${this.context.clientProfile.engagementLevel}%

Analyse cette intervention et réponds en JSON selon le format défini.`;

    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: analysisPrompt }] }],
      turnComplete: true
    });
  }

  // Mise à jour du contexte avec l'analyse IA
  private updateContext(analysis: any) {
    try {
      // Mettre à jour le progrès du script
      if (analysis.current_step) {
        this.context.scriptProgress.currentStep = analysis.current_step;
      }

      if (analysis.completed_steps) {
        const newCompletedSteps = analysis.completed_steps.filter(
          (step: string) => !this.context.scriptProgress.completedSteps.includes(step)
        );
        
        newCompletedSteps.forEach((step: string) => {
          this.context.scriptProgress.completedSteps.push(step);
          this.context.scriptProgress.timeline.push({
            step,
            timestamp: Date.now()
          });
          
          // Marquer l'étape comme complétée dans le script
          const scriptStep = CANAL_PLUS_SCRIPT.find(s => s.id === step);
          if (scriptStep) {
            scriptStep.completed = true;
            scriptStep.timestamp = Date.now();
          }
        });
      }

      // Mettre à jour le profil client
      if (analysis.client_sentiment) {
        this.context.clientProfile.sentiment = analysis.client_sentiment;
      }
      
      if (analysis.engagement_level) {
        this.context.clientProfile.engagementLevel = analysis.engagement_level;
      }

      // Générer nouvelles suggestions reçues de l'IA
      if (analysis.suggestions) {
        const baseSuggestions: SmartSuggestion[] = analysis.suggestions.map((suggestion: any) => ({
          id: `suggestion_${Date.now()}_${Math.random()}`,
          type: suggestion.type,
          text: suggestion.text,
          context: suggestion.context,
          priority: suggestion.priority,
          timestamp: Date.now(),
          clickable: true
        }));

        // Détection d'objection pendant la présentation d'offre -> générer transition automatique
        const now = Date.now();
        const objectionSuggestion = baseSuggestions.find(s => s.type === 'objection_response');
        const isDuringOfferPhase = ['offer_presentation', 'objection_handling'].includes(this.context.scriptProgress.currentStep);
        const cooldownPassed = now - this.lastOfferTransitionAt > 8000; // 8s anti-spam

        if (objectionSuggestion && isDuringOfferPhase && cooldownPassed) {
          const textLower = (objectionSuggestion.text + ' ' + objectionSuggestion.context).toLowerCase();

            // Heuristiques simples pour personnaliser la transition
          let transitionCore = '';
          if (textLower.includes('sport')) {
            transitionCore = "Même si le sport n'est pas votre priorité, l'offre inclut aussi cinéma, séries et documentaires premium qui vont vraiment enrichir vos soirées.";
          } else if (textLower.includes('cher') || textLower.includes('prix')) {
            transitionCore = "L'intérêt c'est surtout le rapport qualité/prix : avec tous les contenus inclus, l'abonnement revient bien moins cher que si vous preniez chaque service séparément.";
          } else if (textLower.includes('réfléchir')) {
            transitionCore = "Justement, pour vous aider à décider sereinement, vous profitez de la période initiale avec accès complet aux contenus majeurs.";
          } else if (textLower.includes('déjà') || textLower.includes('amazon') || textLower.includes('netflix')) {
            transitionCore = "Cette offre vient compléter parfaitement ce que vous avez déjà, sans duplication inutile et avec des exclus Canal+.";
          } else {
            transitionCore = "L'idée est de vous proposer la version la plus équilibrée : cinéma récent, séries originales Canal+, documentaires et éventuellement le sport si un jour l'envie revient.";
          }

          const transitionSuggestion: SmartSuggestion = {
            id: `transition_${now}_${Math.random()}`,
            type: 'offer_transition',
            text: transitionCore + " Souhaitez-vous que je vous récapitule en 20 secondes ce que vous gagnez concrètement ?",
            context: "Transition automatique après objection pour ramener naturellement vers la valeur de l'offre",
            priority: 'medium',
            timestamp: now,
            clickable: true
          };
          baseSuggestions.push(transitionSuggestion);
          this.lastOfferTransitionAt = now;
        }

        this.context.suggestions = baseSuggestions;
      }

      // Générer nouvelles alertes
      if (analysis.alerts) {
        const newAlerts = analysis.alerts.map((alert: any) => ({
          id: `alert_${Date.now()}_${Math.random()}`,
          type: alert.type,
          message: alert.message,
          severity: alert.severity,
          timestamp: Date.now(),
          suggestedAction: alert.suggested_action
        }));
        
        this.context.alerts = [...this.context.alerts, ...newAlerts];
      }

      // Notifier l'interface
      this.onSuggestionUpdate?.(this.context.suggestions);
      this.onAlertUpdate?.(this.context.alerts);
      this.onScriptUpdate?.(CANAL_PLUS_SCRIPT);

    } catch (error) {
      console.error('Erreur mise à jour contexte:', error);
    }
  }

  // Envoyer audio du microphone
  async sendAudioChunk(audioData: ArrayBuffer) {
    if (!this.isConnected || !this.session) {
      console.warn('Session non connectée');
      return;
    }

    try {
      // Convertir en base64 pour l'API
      const base64Audio = btoa(
        String.fromCharCode(...new Uint8Array(audioData))
      );

      this.session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000'
        }
      });

    } catch (error) {
      console.error('Erreur envoi audio:', error);
    }
  }

  // Signaler la fin d'un flux audio
  async endAudioStream() {
    if (this.session) {
      this.session.sendRealtimeInput({ audioStreamEnd: true });
    }
  }

  // Demander une suggestion spécifique
  async requestSuggestion(context: string) {
    const prompt = `DEMANDE DE SUGGESTION SPÉCIFIQUE:
Contexte: "${context}"

État actuel du script: ${this.context.scriptProgress.currentStep}
Sentiment client: ${this.context.clientProfile.sentiment}

Génère 3 suggestions spécifiques pour cette situation en JSON.`;

    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: prompt }] }],
      turnComplete: true
    });
  }

  // Simuler une objection client (pour test)
  async simulateClientObjection(objection: string) {
    const prompt = `CLIENT VIENT DE DIRE:
"${objection}"

Analyse cette objection et propose des réponses adaptées en JSON.`;

    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: prompt }] }],
      turnComplete: true
    });
  }

  // Envoyer du texte pour analyse (fallback reconnaissance vocale)
  async sendText(text: string, speaker: 'agent' | 'client' = 'agent') {
    if (!this.session || !this.isConnected) {
      console.warn('Session Gemini non connectée');
      return;
    }

    try {
      const analysisPrompt = `NOUVELLE INTERVENTION ${speaker.toUpperCase()}:
"${text}"

Analyse cette intervention par rapport au script Canal+ et retourne ton analyse en JSON.`;

      await this.session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: analysisPrompt }]
          }
        ],
        turnComplete: true
      });

      // Mettre à jour le transcript
      this.onTranscriptUpdate?.(text, speaker);
    } catch (error) {
      console.error('Erreur envoi texte:', error);
    }
  }

  // Envoyer de l'audio PCM pour transcription et analyse
  async sendAudio(audioBuffer: ArrayBuffer) {
    if (!this.session || !this.isConnected) {
      console.warn('Session Gemini non connectée');
      return;
    }

    try {
      // Convertir en base64 pour l'envoi
      const audioBytes = new Uint8Array(audioBuffer);
      const audioData = btoa(String.fromCharCode(...audioBytes));

      await this.session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/pcm',
                  data: audioData
                }
              }
            ]
          }
        ],
        turnComplete: false // Streaming audio
      });
    } catch (error) {
      console.error('Erreur envoi audio:', error);
    }
  }

  // Démarrer un nouvel appel
  async startNewCall() {
    // Réinitialiser le contexte local
    this.resetForNewCall();

    // Informer Gemini du nouveau contexte
    if (this.session && this.isConnected) {
      const newCallPrompt = `🔄 NOUVEAU APPEL - CONTEXTE RÉINITIALISÉ

Le téléconseiller commence un nouvel appel client. Remets à zéro l'analyse du script et prépare-toi à suivre une nouvelle conversation Canal+.

Script à respecter:
${CANAL_PLUS_SCRIPT.map(step => `- ${step.name}: ${step.description}`).join('\n')}

Attente de la première intervention...`;

      await this.session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: newCallPrompt }]
          }
        ],
        turnComplete: true
      });
    }

    // Notifier les callbacks
    this.onScriptUpdate?.(CANAL_PLUS_SCRIPT);
    this.onSuggestionUpdate?.([]);
    this.onAlertUpdate?.([]);
  }

  // Obtenir le statut actuel
  getStatus() {
    return {
      isConnected: this.isConnected,
      context: this.context,
      scriptProgress: CANAL_PLUS_SCRIPT.map(step => ({
        ...step,
        completed: this.context.scriptProgress.completedSteps.includes(step.id)
      }))
    };
  }

  // Fermer la session
  async disconnect() {
    if (this.session) {
      this.session.close();
      this.isConnected = false;
      console.log('🔒 Assistant téléconseiller déconnecté');
    }
  }

  // Réinitialiser le contexte pour un nouvel appel
  resetForNewCall() {
    this.context = {
      clientProfile: {
        interests: [],
        objections: [],
        sentiment: 'neutral',
        engagementLevel: 50
      },
      scriptProgress: {
        currentStep: 'greeting',
        completedSteps: [],
        missedSteps: [],
        timeline: []
      },
      suggestions: [],
      alerts: []
    };

    // Réinitialiser le script
    CANAL_PLUS_SCRIPT.forEach(step => {
      step.completed = false;
      step.timestamp = undefined;
    });

    console.log('🔄 Nouveau appel - Contexte réinitialisé');
  }
}

export default GeminiLiveAssistant;
