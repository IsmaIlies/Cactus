# 🎯 Assistant Vocal Intelligent Canal+ avec Gemini Live

## 📋 Vue d'ensemble

L'assistant vocal Canal+ est une solution d'IA en temps réel conçue pour assister les téléconseillers dans leurs appels de vente. Il utilise l'API Gemini Live de Google pour analyser les conversations, vérifier le respect du script métier, et proposer des suggestions contextuelles intelligentes.

## 🚀 Fonctionnalités principales

### 🎤 Capture audio en temps réel
- **Streaming audio direct** vers Gemini Live (PCM 16-bit, 16kHz)
- **Fallback reconnaissance vocale** avec Web Speech API du navigateur
- **Détection automatique d'activité vocale** (VAD)
- **Transcription en temps réel** français optimisée

### 🧠 Analyse intelligente
- **Analyse sémantique** de chaque phrase du téléconseiller
- **Comparaison au script métier** Canal+ prédéfini
- **Détection des étapes manquées** ou dans le mauvais ordre
- **Identification des objections client** et réponses suggérées
- **Analyse du sentiment** et engagement client

### 💡 Suggestions contextuelles
- **Rappels d'étapes obligatoires** (mentions légales, etc.)
- **Réponses aux objections** types (prix, concurrence, etc.)
- **Opportunités d'upsell** basées sur les préférences client
- **Techniques de closing** adaptées au contexte

### 🎨 Interface immersive
- **Sphère 3D interactive** avec bulles de suggestions
- **Checklist dynamique** du script Canal+
- **Alertes visuelles** en temps réel
- **Interface minimisable** pour ne pas gêner l'appel

## 📋 Script métier Canal+ supporté

```
1. 🤝 Salutation & Présentation (OBLIGATOIRE)
   "Bonjour [Nom], je suis [Prénom] conseiller Orange pour Canal+"

2. ⚖️ Mentions Légales (OBLIGATOIRE)
   "Cet appel est enregistré pour la qualité de service. Vous êtes inscrit sur Bloctel?"

3. ✅ Vérification des Données (OBLIGATOIRE)
   "Confirmez-vous que vous êtes bien le titulaire de la ligne à [adresse]?"

4. 🔍 Découverte des Besoins (OBLIGATOIRE)
   "Qu'aimez-vous regarder? Séries, films, sport?"

5. 📺 Présentation de l'Offre (OBLIGATOIRE)
   "J'ai l'offre Canal+ Ciné-Séries avec Netflix inclus à 24,99€/mois"

6. 🛡️ Gestion des Objections (OPTIONNEL)
   Réponses aux objections prix, concurrence, etc.

7. 🎯 Conclusion & Validation (OBLIGATOIRE)
   "Parfait! Activation sous 48h, vous recevrez un email de confirmation"
```

## 🛠️ Installation et configuration

### 1. Dépendances
```bash
npm install @google/genai
```

### 2. Configuration API Gemini
Créer un fichier `.env.local` :
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

**Obtenir une clé API** : https://aistudio.google.com/app/apikey

### 3. Utilisation dans l'application
```tsx
import TeleSalesAssistant from './components/TeleSalesAssistant';

// Ajouter le composant n'importe où
<TeleSalesAssistant />
```

## 🔧 Architecture technique

### Composants principaux
```
src/
├── components/
│   ├── TeleSalesAssistant.tsx      # Interface principale
│   └── IntelligentSphere.tsx       # Sphère 3D avec bulles
├── services/
│   └── geminiLiveAssistant.ts      # Service Gemini Live
└── pages/
    └── TeleSalesAssistantTestPage.tsx # Page de démonstration
```

### Flux de données
```
[Microphone] → [Streaming Audio] → [Gemini Live] → [Analyse IA] → [Suggestions/Alertes] → [Interface 3D]
```

### Service GeminiLiveAssistant
```typescript
// Connexion et configuration
const assistant = new GeminiLiveAssistant();
await assistant.connect({
  onTranscriptUpdate: (text, speaker) => { /* ... */ },
  onSuggestionUpdate: (suggestions) => { /* ... */ },
  onAlertUpdate: (alerts) => { /* ... */ },
  onScriptUpdate: (steps) => { /* ... */ }
});

// Envoi d'audio ou de texte
assistant.sendAudio(audioBuffer);
assistant.sendText("Bonjour client");

// Nouveau appel
assistant.startNewCall();
```

## 📱 Utilisation en temps réel

### Démarrage
1. **Ouvrir la page de test** : `/assistant-test`
2. **Attendre la connexion** Gemini Live (voyant vert)
3. **Autoriser le microphone** quand demandé
4. **Cliquer sur le bouton micro** pour démarrer l'écoute

### Pendant l'appel
- **Parlez naturellement** en suivant le script Canal+
- **Observez les suggestions** dans les bulles 3D
- **Suivez les alertes** si vous oubliez une étape
- **Consultez la checklist** en bas de l'assistant

### Fin d'appel
- **Cliquer "Nouvel appel"** pour reset le contexte
- **Ou fermer l'assistant** (bouton minimiser)

## 🔍 Exemples d'analyse

### ✅ Phrase correcte
```
Entrée : "Bonjour madame Durand, je suis Pierre conseiller Orange pour Canal+"
→ Analyse : Étape "Salutation" validée ✅
→ Suggestion : "N'oubliez pas les mentions légales obligatoires"
```

### ⚠️ Étape manquée
```
Entrée : "Je peux vous proposer Canal+ à 24,99€"
→ Analyse : Étape "Découverte" sautée ⚠️
→ Alerte : "Vous avez sauté la découverte des besoins client"
→ Suggestion : "Demandez d'abord : Qu'aimez-vous regarder?"
```

### 🛡️ Objection détectée
```
Entrée Client : "C'est cher 25 euros par mois"
→ Analyse : Objection prix détectée 🛡️
→ Suggestion : "Répondez : Le tarif est bloqué 24 mois et inclut Netflix"
```

## 🎨 Interface utilisateur

### Modes d'affichage
- **Mode complet** : Assistant pleine taille avec sphère 3D
- **Mode minimisé** : Petit indicateur en bas à droite
- **États visuels** : Connecté (vert), Écoute (rouge), Analyse (bleu)

### Sphère intelligente
- **Bulles de suggestions** : Positionnement anti-collision
- **Couleurs par priorité** : Rouge (urgent), Orange (important), Bleu (info)
- **Animation** : Pulsation selon l'activité IA
- **Responsive** : S'adapte à la taille de la fenêtre

### Checklist du script
- **Progression visuelle** : 6 étapes avec indicateurs colorés
- **Pourcentage de completion** : Affiché en temps réel
- **Étapes obligatoires** : Marquées par un astérisque

## 🔧 Configuration avancée

### Paramétrage audio
```typescript
const config = {
  responseModalities: [Modality.TEXT],
  inputAudioTranscription: {},
  realtimeInputConfig: {
    automaticActivityDetection: {
      startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
      endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
      prefixPaddingMs: 100,
      silenceDurationMs: 1000
    }
  }
};
```

### Personnalisation du prompt
Le système utilise un prompt détaillé pour analyser les conversations :
- **Instructions de rôle** : Assistant expert téléconseiller
- **Script de référence** : Étapes et mots-clés Canal+
- **Format de réponse** : JSON structuré pour parsing
- **Contexte métier** : Spécificités télévente Canal+

## 🚀 Intégration en production

### Architecture recommandée
```
[Frontend Browser] ←→ [Backend Node.js] ←→ [Gemini Live API]
                                ↓
                        [Database Session]
                        [Analytics/Logs]
```

### Sécurité
- **Clés API backend** : Ne jamais exposer les clés côté client
- **Jetons éphémères** : Utiliser des tokens temporaires
- **Chiffrement** : HTTPS obligatoire pour l'audio
- **RGPD compliance** : Gestion des données personnelles

### Monitoring
- **Logs d'appels** : Transcriptions et analyses
- **Métriques de performance** : Temps de réponse IA
- **Taux de conversion** : Impact sur les ventes
- **Feedback utilisateur** : Qualité des suggestions

## 🧪 Tests et développement

### Page de test
- **URL** : `/assistant-test`
- **Phrases d'exemple** : Fournies pour tester l'IA
- **Feedback visuel** : Immediate pour développement
- **Mode debug** : Logs détaillés dans console

### Tests recommandés
1. **Test de connexion** : Vérifier l'API Gemini
2. **Test audio** : Microphone et streaming
3. **Test script** : Toutes les étapes Canal+
4. **Test objections** : Réponses automatiques
5. **Test performance** : Latence et stabilité

## 🆘 Dépannage

### Problèmes courants
- **Pas de connexion Gemini** : Vérifier la clé API
- **Microphone non détecté** : Autoriser dans le navigateur
- **Pas de transcription** : Vérifier la langue (fr-FR)
- **Suggestions incohérentes** : Relancer la session

### Debug
```javascript
// Activer les logs détaillés
localStorage.setItem('debug', 'true');

// Vérifier la connexion
console.log(assistant.getStatus());
```

## 🔗 Ressources

### Documentation API
- [Gemini Live API](https://ai.google.dev/docs/live_api)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [Three.js](https://threejs.org/docs/) (pour la sphère 3D)

### Support et communauté
- **Issues GitHub** : Rapporter des bugs
- **Documentation** : Ce fichier README
- **Exemples** : Dossier `/examples` (à créer)

---

## 🎯 Vision et roadmap

### Prochaines fonctionnalités
- [ ] **Mode audio-to-audio** : Réponses vocales de l'IA
- [ ] **Personnalisation par conseiller** : Adaptation du style
- [ ] **Intégration CRM** : Sync avec bases clients
- [ ] **Analytics avancés** : Tableaux de bord performance
- [ ] **Formation adaptive** : L'IA s'améliore avec l'usage

### Cas d'usage étendus
- **Autres opérateurs** : SFR, Bouygues, Free
- **Autres produits** : Assurance, banque, etc.
- **Formation** : Simulation d'appels avec IA
- **Qualité** : Écoute automatique et scoring
- **Coaching** : Amélioration continue des conseillers

---

*Assistant vocal Canal+ - Développé avec ❤️ et l'IA Gemini Live*
