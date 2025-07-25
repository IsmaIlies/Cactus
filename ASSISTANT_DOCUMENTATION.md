# Assistant Vocal Intelligent Canal+ avec Gemini Live

## 🎯 Vue d'ensemble

L'Assistant Vocal Canal+ est une solution innovante qui utilise l'IA Google Gemini Live pour aider les téléconseillers en temps réel pendant leurs appels commerciaux. L'assistant écoute les conversations, analyse le respect du script de vente et propose des suggestions contextuelles intelligentes.

## ✨ Fonctionnalités principales

### 🎤 Écoute en temps réel
- **Streaming audio direct** vers Gemini Live (PCM 16kHz)
- **Transcription automatique** de la parole du conseiller
- **Fallback** sur Web Speech API du navigateur
- **Détection d'activité vocale** automatique

### 🧠 Analyse intelligente
- **Script Canal+ prédéfini** avec 6 étapes obligatoires
- **Détection sémantique** des étapes completées
- **Alertes en temps réel** pour étapes manquées ou mal ordonnées
- **Suggestions contextuelles** basées sur les objections clients

### 🎨 Interface immersive
- **Sphère 3D interactive** avec Three.js
- **Bulles de suggestions** positionnées intelligemment
- **Interface minimisable** et non-intrusive
- **Feedback visuel** en temps réel

### 🔗 Intégration Gemini Live
- **Connexion WebSocket** sécurisée
- **Prompts optimisés** pour l'analyse de vente
- **Streaming bidirectionnel** texte/audio
- **Gestion de session** avancée

## 🛠 Architecture technique

### Frontend (React + TypeScript)
```
src/
├── components/
│   ├── TeleSalesAssistant.tsx      # Composant principal
│   ├── IntelligentSphere.tsx       # Sphère 3D interactive
│   └── ...
├── services/
│   ├── geminiLiveAssistant.ts      # Service Gemini Live
│   └── geminiService.ts            # Service Gemini standard
├── pages/
│   ├── AssistantTestPage.tsx       # Page de test
│   └── ...
└── types/
    └── types.ts                    # Types TypeScript
```

### Backend (Gemini Live API)
- **Modèle** : `gemini-live-2.5-flash-preview`
- **Modalités** : Texte et Audio
- **Streaming** : Temps réel bidirectionnel
- **Transcription** : Automatique avec l'API

## 🚀 Guide d'utilisation

### 1. Configuration

1. **Clé API Gemini**
   ```bash
   # Créer un fichier .env
   VITE_GEMINI_API_KEY=votre_cle_api_gemini
   ```

2. **Installation des dépendances**
   ```bash
   npm install @google/genai
   npm install @react-three/fiber @react-three/drei three
   ```

### 2. Lancement de l'application

```bash
npm run dev
```

Accédez à : `http://localhost:5173/assistant-live`

### 3. Utilisation en centre d'appel

1. **Démarrage** : Cliquer sur le bouton microphone
2. **Écoute** : L'assistant transcrit automatiquement
3. **Suivi** : Observer la progression du script (6 étapes)
4. **Alertes** : Réagir aux alertes en temps réel
5. **Suggestions** : Utiliser les suggestions contextuelles

## 📋 Script Canal+ prédéfini

### Étapes obligatoires
1. **Salutation & Présentation**
   - Mots-clés : "bonjour", "orange", "conseiller", "canal"
   - Exemple : "Bonjour, je suis Sarah, conseiller Orange pour Canal+"

2. **Mentions Légales**
   - Mots-clés : "enregistré", "qualité", "service", "bloctel"
   - Exemple : "Cet appel est enregistré pour améliorer la qualité de service"

3. **Vérification des Données**
   - Mots-clés : "titulaire", "adresse", "confirmez"
   - Exemple : "Vous êtes bien Mr Martin, titulaire de la ligne ?"

4. **Découverte des Besoins**
   - Mots-clés : "regardez", "préférez", "habitudes", "séries"
   - Exemple : "Qu'est-ce que vous regardez habituellement ?"

5. **Présentation de l'Offre**
   - Mots-clés : "canal+", "offre", "netflix", "prix", "euros"
   - Exemple : "J'ai une offre Canal+ à 19.99€/mois"

6. **Conclusion & Validation**
   - Mots-clés : "accord", "commande", "activation"
   - Exemple : "On peut finaliser ensemble ?"

## 🔧 Configuration avancée

### Prompts Gemini optimisés

```typescript
const SYSTEM_PROMPT = `Tu es un assistant IA expert pour les téléconseillers Canal+ d'Orange.

MISSION PRINCIPALE :
- Analyser en temps réel les conversations téléphoniques
- Vérifier le respect du script de vente Canal+
- Générer des suggestions contextuelles intelligentes
- Détecter les objections et proposer des réponses adaptées

FORMAT DE RÉPONSE JSON :
{
  "current_step": "id_etape",
  "completed_steps": ["etape1", "etape2"],
  "missing_steps": ["etape_manquee"],
  "client_sentiment": "positive|neutral|negative",
  "engagement_level": 0-100,
  "suggestions": [...],
  "alerts": [...]
}`;
```

### Paramètres audio optimaux

```typescript
const AUDIO_CONFIG = {
  sampleRate: 16000,      // 16kHz requis par Gemini
  channelCount: 1,        // Mono
  echoCancellation: true, // Annulation d'écho
  noiseSuppression: true  // Suppression de bruit
};
```

## 📊 Types de suggestions

### 1. Rappels de script
- **Type** : `script_reminder`
- **Usage** : Étapes manquées ou oubliées
- **Exemple** : "N'oubliez pas les mentions légales obligatoires"

### 2. Réponses aux objections
- **Type** : `objection_response`
- **Usage** : Objections client détectées
- **Exemple** : "Réponse objection prix : 'Tarif bloqué 24 mois'"

### 3. Techniques d'upsell
- **Type** : `upsell`
- **Usage** : Opportunités commerciales
- **Exemple** : "Offre Sport : Champions League, F1, Top 14"

### 4. Techniques de closing
- **Type** : `closing_technique`
- **Usage** : Finalisation de vente
- **Exemple** : "Technique de closing alternatif"

## 🚨 Types d'alertes

### 1. Étapes manquées
- **Type** : `missing_step`
- **Sévérité** : `warning`
- **Action** : Rappel de l'étape à faire

### 2. Ordre incorrect
- **Type** : `wrong_order`
- **Sévérité** : `warning`
- **Action** : Correction de l'ordre

### 3. Mentions légales requises
- **Type** : `legal_required`
- **Sévérité** : `error`
- **Action** : Correction immédiate obligatoire

### 4. Objections détectées
- **Type** : `objection_detected`
- **Sévérité** : `info`
- **Action** : Proposition de réponse

## 🔍 Monitoring et analytics

### Métriques suivies
- **Taux de completion du script** (%)
- **Temps par étape** (secondes)
- **Nombre d'objections** par appel
- **Taux de suggestions utilisées** (%)
- **Sentiment client** (positif/neutre/négatif)

### Logs structurés
```typescript
interface CallLog {
  sessionId: string;
  startTime: Date;
  endTime: Date;
  scriptCompletion: number;
  stepsCompleted: string[];
  objectionsHandled: number;
  suggestionsUsed: number;
  finalOutcome: 'sale' | 'callback' | 'refused';
}
```

## 🔐 Sécurité et confidentialité

### Protection des données
- **Clé API** stockée en variable d'environnement
- **Audio streaming** chiffré via HTTPS/WSS
- **Transcriptions** non stockées localement
- **Sessions** temporaires uniquement

### Conformité RGPD
- **Consentement** explicite requis
- **Données** anonymisées en production
- **Retention** limitée aux besoins métier
- **Droit à l'oubli** respecté

## 🧪 Tests et débogage

### Page de test dédiée
- **URL** : `/assistant-live`
- **Simulation** de phrases types
- **Monitoring** en temps réel
- **Debug** des connexions

### Phrases de test recommandées
```
✅ "Bonjour, je suis conseiller Orange pour Canal+"
✅ "Cet appel est enregistré pour la qualité"
✅ "Vous regardez quoi comme séries ?"
✅ "J'ai une offre à 19 euros par mois"
❌ "C'est trop cher pour moi"
❌ "Je réfléchis et je vous rappelle"
```

## 🚀 Déploiement en production

### Variables d'environnement
```bash
VITE_GEMINI_API_KEY=prod_key_here
VITE_GEMINI_MODEL=gemini-live-2.5-flash-preview
VITE_LOG_LEVEL=error
VITE_ANALYTICS_ENABLED=true
```

### Optimisations production
- **Minification** des assets
- **CDN** pour les ressources statiques
- **Rate limiting** sur l'API Gemini
- **Monitoring** avec alertes

## 📞 Support et maintenance

### Contact technique
- **Email** : support-technique@canal-assistant.com
- **Slack** : #canal-assistant-support
- **Documentation** : [Wiki interne]

### Roadmap
- [ ] Intégration avec CRM
- [ ] Analytics avancées
- [ ] Support multi-langues
- [ ] API REST pour intégrations
- [ ] Dashboard admin

---

**Version** : 1.0.0  
**Dernière mise à jour** : Juillet 2025  
**Auteur** : Équipe Innovation Canal+
