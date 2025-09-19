// == Rate Limiting == //
const requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 10;

function checkRateLimit(): boolean {
  const now = Date.now();
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > 60000) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  requestTimestamps.push(now);
  return true;
}

// À appeler au début de chaque fonction Gemini
function assertRateLimit() {
  if (!checkRateLimit()) {
    throw new Error(
      "🚫 Trop de requêtes Gemini : limite de 10 par minute atteinte."
    );
  }
}

// services/geminiService.ts

import { GoogleGenAI, Type } from "@google/genai";
import { CallData } from "../pages/CallScriptPage";
import { ProgramCard } from "../pages/AiAssistantPage";

const genAI = new GoogleGenAI({
  apiKey: "AIzaSyDqpjxQoiubpPOE2tIxztb0SB61QX01Zas", // ⚠️ Ne jamais exposer en prod (à déplacer dans une variable d'environnement)
});

// Instruction système globale pour forcer les réponses en français
const FRENCH_SYSTEM_INSTRUCTION = `Tu réponds toujours strictement en FRANÇAIS.
Contraintes :
- Si l'utilisateur parle dans une autre langue, tu réponds en français.
- Tu ne traduis PAS le code ou les identifiants techniques.
- Style : clair, professionnel, concis.
Si une réponse est demandée dans une autre langue, reformule en français.`;

export async function* streamOfferScript(
  callData: CallData
): AsyncGenerator<string> {
  assertRateLimit();

  const prompt = buildPrompt(callData);
  const model = "gemini-2.0-flash";

  const stream = await genAI.models.generateContentStream({
    model,
    contents: prompt,
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nTu es un conseiller Orange et un vendeur remarquable qui vend des offres Canal sans que cela paraisse insistant. Ton ton est dynamique, fluide, naturel, orienté bénéfices client. Réponds uniquement en français.`,
      temperature: 0.7,
      maxOutputTokens: 512,
    },
  });

  for await (const chunk of stream) {
    yield chunk.text || "";
  }
}

function buildPrompt(callData: CallData): string {
  const { preferences, clientInfo, notes } = callData;

  const genres = preferences.genres.join(", ") || "non spécifié";
  const sports = preferences.sports.join(", ") || "aucun";
  const film = preferences.favoriteFilm || "non précisé";
  const acteur = preferences.favoriteActor || "non précisé";
  const serie = preferences.favoriteSeries || "non précisé";
  const filmGenres =
    (preferences.favoriteFilmGenres || []).join(", ") || "non précisé";
  const serieGenres =
    (preferences.favoriteSeriesGenres || []).join(", ") || "non précisé";
  const device = preferences.deviceUsage || "non précisé";
  const watching = preferences.watchingFrequency || "non précisé";
  const enfants = clientInfo.hasChildren ? "Oui" : "Non";
  const ados = clientInfo.hasTeens ? "Oui" : "Non";
  const noteText = notes || "Aucune remarque complémentaire";

  return `
  Tu es conseiller Orange. Tu parles à un client avec les préférences suivantes :
    Contenus aimés : ${genres}
    Genres de films : ${filmGenres}
    Film préféré : ${film}
    Acteur préféré : ${acteur}
    Genres de séries : ${serieGenres}
    Série préférée : ${serie}
    Sports suivis : ${sports}
    Fréquence de visionnage : ${watching}
    Appareil utilisé : ${device}
    Enfants : ${enfants}, Adolescents : ${ados}
    Notes : ${noteText}

Génère uniquement la partie centrale du discours de vente de manière subtile, en mettant l’accent sur l’offre Canal sans trop insister. L’objectif est de suggérer cette offre comme une option idéale en fonction des préférences du client. Sois fluide, naturel, et centré sur l'expérience du client. Voici le cadre à suivre :
    📌 Fais une proposition sur mesure en fonction des goûts du client, en mettant en avant des contenus de qualité en lien avec ses préférences (films, séries, sports, etc.).
    ✅ Détaille les avantages de l'offre Canal de manière douce (Apple TV+, Canal+ à la demande, accès à des contenus exclusifs, etc.), en la présentant comme une option qui s'intègre bien dans son univers de loisirs.
    💶 Présente les prix et options en insistant sur la valeur de l’offre, tout en la présentant comme une solution sans engagement contraignant et accessible en termes de tarifs.

Note : Essaie de suggérer cette offre en la reliant subtilement à ses goûts et en la présentant comme une manière simple d’accéder à tout ce qu'il aime (films récents, séries exclusives, sports en direct, etc.). Utilise une approche fluide et naturelle sans trop pousser.
  
  Voici les offres spéciales disponibles que tu peux utiliser dans ton argumentaire :
  
  OFFRE CANAL+ (19,99€/mois) : Apple TV+, CANAL+ A LA DEMANDE, 2 écrans, engagement 24 mois.
  OFFRE CINE SERIES (29,99€/mois) : Netflix Standard avec Pub, Paramount+, Max, Apple TV+, OCS, engagement 24 mois.
  OFFRE SPORT (34,99€/mois) : Champions League, F1, Top 14, MotoGP, beIN, F1 TV PRO, engagement 24 mois.
  OFFRE 100% CANAL+ (19,99€/mois) : Ciné, sport, docs, jeunesse, PASS COUPES D’EUROPE inclus 24 mois, engagement 24 mois.
  
  **Détails des offres** :
  - **Canal+** : Accédez à tous les contenus exclusifs CANAL+ (films, séries, sport). Le meilleur de la TV en live et replay.
  - **Cine Séries** : Cinéma ultra-récent et séries exclusives avec Netflix, Paramount+, Max, et bien plus. Idéal pour les amateurs de films et séries.
  - **Sport** : 100% de la Ligue des champions UEFA, des matchs de la Premier League, de la F1, du MotoGP, et bien plus encore pour les fans de sport.
  - **100% Canal+** : Offre tout-en-un avec un accès complet au sport, au cinéma, et aux séries en direct et en replay, avec des promotions exclusives comme le PASS COUPES D’EUROPE pendant 24 mois.

  Ton ton doit être dynamique, fluide et humain, comme dans un vrai appel commercial. Il faut vouvoyer le client et utiliser un langage simple et accessible.
  Ne commence pas par dire bonjour et ne conclus pas. Concentre-toi uniquement sur la partie centrale persuasive. Fais ça en 3 à 5 phrases maximum.
  `;
}

export async function respondToObjection(
  history: { from: "IA" | "Client"; text: string }[],
  objection: string
): Promise<{ response: string; followUpObjections: string[] }> {
  assertRateLimit();

  const context = history
    .map((m) => `${m.from === "IA" ? "TA" : "Client"}: ${m.text}`)
    .join("\\n");

  const stream = await genAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `
Voici l'historique de la conversation de vente :
${context}

Le client vient de formuler cette objection : "${objection}"

Réponds à cette objection uniquement avec un argument rassurant en une phrases simple, et propose une nouvelle liste d’objections possibles à la suite de cette réponse.

Retourne uniquement un JSON strictement conforme à ce schéma :
{
  "response": string,
  "followUpObjections": string[]
}
    `,
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nTu es un conseiller Orange qui répond aux objections de façon rassurante, claire, concise pour maximiser la conversion. Le champ 'response' doit être en français.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          response: { type: Type.STRING },
          followUpObjections: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["response", "followUpObjections"],
      },
      temperature: 0.5,
    },
  });

  if (!stream.text) {
    throw new Error("La réponse du modèle est vide ou indéfinie.");
  }
  return JSON.parse(stream.text);
}

export async function getObjectionsFromScript(
  script: string
): Promise<string[]> {
  assertRateLimit();

  const genAI = new GoogleGenAI({
    apiKey: "AIzaSyDqpjxQoiubpPOE2tIxztb0SB61QX01Zas", // ⚠️ Ne jamais exposer en prod
  });

  const response = await genAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `
  Voici un script de proposition commerciale à un client :
  ${script}
  
  Génère une liste d'objections possibles du client à ce discours.
  Retourne UNIQUEMENT un JSON de la forme :
  {
    "objections": [string, string, ...]
  }
  `,
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nTu génères des objections POTENTIELLES (en français) d'un client à partir du script commercial.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          objections: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["objections"],
      },
      temperature: 0.7,
    },
  });

  if (!response.text) {
    throw new Error("La réponse du modèle est vide ou indéfinie.");
  }
  const json = JSON.parse(response.text);
  return json.objections || [];
}

export async function streamGeminiResponse(
  inputMessage: string,
  callback: (chunk: string) => void,
  chatHistory: { role: string; content: string }[],
  options?: { signal?: AbortSignal }
): Promise<void> {
  assertRateLimit();

  const model = "models/gemini-2.0-flash"; // ou "models/gemini-1.5-pro" si souhaité

  // Reformatage de l'historique en "contents" compatible avec le SDK
  const contents = chatHistory.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content }],
  }));

  // Ajout du dernier message utilisateur (au cas où non encore dans l'historique)
  if (
    chatHistory.length === 0 ||
    chatHistory[chatHistory.length - 1].role !== "user"
  ) {
    contents.push({ role: "user", parts: [{ text: inputMessage }] });
  }

  // Ajout du support d'annulation via AbortSignal
  const stream = await genAI.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nAssistant conversationnel multithématique. Utilise un ton naturel et utile.`,
      tools: [{ googleSearch: {} }],
      temperature: 0.7,
      maxOutputTokens: 1024,
      ...(options?.signal ? { signal: options.signal } : {}),
    },
  });

  try {
    for await (const chunk of stream) {
      if (chunk.text) {
        callback(chunk.text);
      }
      if (options?.signal?.aborted) {
        break;
      }
    }
  } catch (err) {
    if (options?.signal?.aborted) {
      // Annulation silencieuse
      return;
    }
    throw err;
  }
}
/*
export async function streamPlatformHighlights(
  query: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  assertRateLimit();

  const prompt = `Donne-moi les dernières nouveautés ou programmes intéressants concernant : "${query}", en juin 2025. Sois concis, liste ou puces, sans intro ni conclusion.`;

  const stream = await genAI.models.generateContentStream({
    model: "models/gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.7,
      maxOutputTokens: 512,
    },
  });

  for await (const chunk of stream) {
    if (chunk.text) onChunk(chunk.text);
  }
}
*/
export async function getRawInfoFromSearch(query: string): Promise<string> {
  assertRateLimit();

  const prompt = `
Donne-moi une liste concise de contenus (films, séries, programme sport) récents ou populaires, exclusivement sur : "${query}" en juin 2025. En France et en français.

Structure la réponse uniquement sous forme de JSON, selon ce schéma :

[
  {
    "title": "string",
    "type": "film" | "serie" | "sport" | "documentaire" | "autre",
    "platform": "string",
    "genre": "string",
    "year": "string", // Année de sortie au format ISO (YYYY)
    "rating": "string", // Note sur 5 (ex: "4.5/5")
    "description": "string",
    "duration": "string",
    "releaseDate": "string" // Date de sortie au format ISO (DD-MM-YYYY)
  },
]

Répond seulement avec ce JSON. Sois bref, va droit au but. 3 éléments.
Pas d’introduction, pas de conclusion, juste les données.
`;

  const result = await genAI.models.generateContent({
    model: "models/gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nTu extrais des contenus récents et formates uniquement en JSON conforme demandé.`,
      tools: [{ googleSearch: {} }],
    },
  });

  if (!result.text) throw new Error("Réponse vide de la recherche web");
  return result.text;
}

export async function transformTextToStructuredJSON(
  rawText: string
): Promise<ProgramCard[]> {
  assertRateLimit();

  const result = await genAI.models.generateContent({
    model: "models/gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `
Voici un texte brut contenant des programmes récents :

${rawText}

Structure la réponse sous forme de tableau JSON respectant ce schéma :

[
  {
    "title": "string",
    "type": "film" | "serie" | "sport" | "documentaire" | "autre",
    "platform": "string",
    "genre": "string",
    "year": "string",
    "rating": "string",
    "description": "string",
    "duration": "string",
    "releaseDate": "string"
  }
]

Ne retourne QUE le JSON strictement conforme à ce schéma.
          `,
          },
        ],
      },
    ],
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nNe retourne que le JSON demandé, sans texte additionnel.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            type: {
              type: "string",
              enum: ["film", "serie", "sport", "documentaire", "autre"],
            },
            platform: { type: "string" },
            genre: { type: "string" },
            year: { type: "string" },
            rating: { type: "string" },
            description: { type: "string" },
            duration: { type: "string" },
            releaseDate: { type: "string" },
          },
          required: [
            "title",
            "type",
            "platform",
            "genre",
            "year",
            "rating",
            "description",
            "duration",
            "releaseDate",
          ],
        },
      },
    },
  });

  if (!result.text) throw new Error("Erreur de conversion en JSON");
  return JSON.parse(result.text);
}

export async function getHighlightsStructuredWithSearch(
  query: string
): Promise<ProgramCard[]> {
  const raw = await getRawInfoFromSearch(query);
  const structured = await transformTextToStructuredJSON(raw);

  // Ici, on ne filtre plus rien : on renvoie l’objet tel quel
  return structured.map((item) => ({
    ...item, // garde toutes les clés
    // sécurise la valeur de type au passage
    type: (["film", "serie", "sport", "documentaire", "autre"].includes(
      item.type
    )
      ? item.type
      : "autre") as ProgramCard["type"],
  }));
}
export async function getRawDetailedInfoFromSearch(
  query: string
): Promise<string> {
  assertRateLimit();

  const prompt = `
Récupère des informations détaillées sur le programme suivant : "${query}" en juin 2025.

Sois concis, mais donne des informations pertinentes comme :
- Le résumé du programme
- L'heure de diffusion si c'est un programme sportif
- Les acteurs si c'est un film ou une série
- La plateforme de diffusion
- La note si disponible

Retourne les informations sous forme de texte brut, sans structuration JSON.

Ne réponds qu'avec les informations demandées, sans introduction ni conclusion.
`;

  const result = await genAI.models.generateContent({
    model: "models/gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nTu fournis un texte descriptif concis en français.`,
      tools: [{ googleSearch: {} }],
    },
  });

  // Vérification de la validité de la réponse
  if (!result.text) throw new Error("Réponse vide de la recherche web");

  return result.text;
}

export async function transformDetailedTextToStructuredJSON(
  rawText: string
): Promise<any> {
  assertRateLimit();

  const prompt = `
Voici un texte brut contenant des informations détaillées sur un programme :

${rawText}

À partir de ce contenu, génère un tableau JSON conforme au schéma suivant :

[
  {
    "title": "string",   // Titre du contenu
    "type": "film" | "serie" | "sport" | "documentaire" | "autre", // Type du contenu
    "platform": "string", // Plateforme de diffusion
    "rating": "string",   // Note (si disponible)
    "description": "string", // Résumé
    "actors": ["actor1", "actor2"], // Liste d'acteurs
    "matchTime": "string"  // Heure de diffusion si programme sportif
  }
]

Retourne uniquement un JSON strictement conforme, sans texte supplémentaire.
`;

  const result = await genAI.models.generateContent({
    model: "models/gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nStructure uniquement selon le schéma JSON fourni.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            type: {
              type: "string",
              enum: ["film", "serie", "sport", "documentaire", "autre"],
            },
            platform: { type: "string" },
            rating: { type: "string" },
            description: { type: "string" },
            actors: {
              type: "array",
              items: { type: "string" },
            },
            matchTime: { type: "string" },
          },
          required: ["title", "type"],
        },
      },
    },
  });

  // Vérification de la validité de la réponse
  if (!result.text) throw new Error("Erreur de conversion en JSON");
  return JSON.parse(result.text);
}

export async function getStructuredDetails(query: string): Promise<any> {
  const rawText = await getRawDetailedInfoFromSearch(query); // Récupérer les infos via Google Search
  return await transformDetailedTextToStructuredJSON(rawText); // Structurer les infos en JSON
}

export async function streamGeminiDetails(
  title: string,
  callback: (chunk: string) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  assertRateLimit();

  const prompt = `Donne-moi plus d'informations sur "${title}" (résumé, plateforme, acteurs, note, durée, etc). Sois concis, va à l'essentiel, en français, sans introduction ni conclusion.`;

  const stream = await genAI.models.generateContentStream({
    model: "models/gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nFournis des informations concises et utiles en français.`,
      tools: [{ googleSearch: {} }],
      temperature: 0.7,
      maxOutputTokens: 512,
      ...(options?.signal ? { signal: options.signal } : {}),
    },
  });

  try {
    for await (const chunk of stream) {
      if (chunk.text) callback(chunk.text);
      if (options?.signal?.aborted) break;
    }
  } catch (err) {
    if (options?.signal?.aborted) return;
    throw err;
  }
}

// Generate a conversation title based on the first user message
export async function generateConversationTitle(
  firstMessage: string
): Promise<string> {
  assertRateLimit();

  const prompt = `
À partir de ce premier message d'un utilisateur dans une conversation avec un assistant IA :

"${firstMessage}"

Génère un titre court et descriptif pour cette conversation (maximum 5 mots, en français).
Le titre doit résumer le sujet principal de la demande.

Exemples :
- "Nouveautés Netflix juin 2025"
- "Films d'action récents"
- "Séries Canal+ recommandées"
- "Match PSG ce soir"

Réponds uniquement avec le titre, sans guillemets ni explication.
`;

  const result = await genAI.models.generateContent({
    model: "models/gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nTu génères des titres de conversation courts (<=5 mots).`,
      temperature: 0.5,
      maxOutputTokens: 50,
    },
  });

  if (!result.text) {
    // Fallback title si l'IA ne répond pas
    return "Nouvelle conversation";
  }

  // Nettoyer le titre (enlever guillemets, points, etc.)
  return result.text
    .trim()
    .replace(/["""'.]/g, "")
    .substring(0, 50);
}

// Generate a conversation title based on the user message and AI response
export async function generateConversationTitleFromConversation(
  userMessage: string,
  aiResponse: string
): Promise<string> {
  assertRateLimit();

  const prompt = `
À partir de cette conversation entre un utilisateur et un assistant IA :

Utilisateur: "${userMessage}"
Assistant: "${aiResponse}"

Génère un titre court et descriptif pour cette conversation (maximum 5 mots, en français).
Le titre doit résumer le sujet principal de la demande et de la réponse.

Exemples :
- "Nouveautés Netflix juin 2025"
- "Films d'action recommandés"
- "Séries Canal+ populaires"
- "Match PSG informations"
- "Programmes sport ce soir"

Réponds uniquement avec le titre, sans guillemets ni explication.
`;

  const result = await genAI.models.generateContent({
    model: "models/gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `${FRENCH_SYSTEM_INSTRUCTION}\nTu génères des titres de conversation courts (<=5 mots).`,
      temperature: 0.5,
      maxOutputTokens: 50,
    },
  });

  if (!result.text) {
    // Fallback title si l'IA ne répond pas
    return "Nouvelle conversation";
  }

  // Nettoyer le titre (enlever guillemets, points, etc.)
  return result.text
    .trim()
    .replace(/["""'.]/g, "")
    .substring(0, 50);
}
