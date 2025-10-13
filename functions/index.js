const {
  onCall,
  HttpsError,
  onRequest,
} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const axios = require("axios");
const { onSchedule } = require("firebase-functions/v2/scheduler");

admin.initializeApp();

const cors = require('cors')({ origin: true });

// =============================================================
// Purge automatique des matchs passés
// - Supprime les documents de la collection 'matches' dont startTime < (now - 48h)
// - Exécuté chaque nuit à 03:10 heure de Paris
// =============================================================
exports.purgeOldMatches = onSchedule({
  schedule: '10 3 * * *', // 03:10 tous les jours
  timeZone: 'Europe/Paris',
  region: 'europe-west1'
}, async () => {
  const db = admin.firestore();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h avant maintenant
  console.log('[purgeOldMatches] Lancement purge, cutoff =', cutoff.toISOString());
  try {
    const snap = await db.collection('matches')
      .where('startTime', '<', cutoff)
      .limit(500) // sécurité batch
      .get();
    if (snap.empty) {
      console.log('[purgeOldMatches] Aucun match à supprimer.');
      return null;
    }
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[purgeOldMatches] ${snap.size} match(s) supprimé(s).`);
  } catch (e) {
    console.error('[purgeOldMatches] Erreur purge', e);
  }
  return null;
});

// =============================================================
// Endpoint: top14Schedule (stub) - renvoie JSON des prochains matchs Rugby
// À terme on peut remplacer par scraping / API officielle.
// =============================================================
exports.top14Schedule = onRequest({ region: 'europe-west9', timeoutSeconds: 15 }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).send('');
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  try {
    // Jeu de données exemple (à substituer dynamiquement)
    const now = new Date();
    const baseDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 35, 0, 0);
    const addDays = (n) => new Date(baseDay.getTime() + n * 86400000);
    const matches = [
      { id: 'm1', sport: 'rugby', competition: 'TOP14', round: 'J4', startTime: addDays(2).toISOString(), homeTeam: 'Stade Toulousain', awayTeam: 'RC Toulon', channel: 'CANAL+ SPORT', status: 'scheduled' },
      { id: 'm2', sport: 'rugby', competition: 'TOP14', round: 'J4', startTime: addDays(3).toISOString(), homeTeam: 'Racing 92', awayTeam: 'Stade Français', channel: 'CANAL+ FOOT', status: 'scheduled' },
      { id: 'm3', sport: 'rugby', competition: 'TOP14', round: 'J4', startTime: addDays(7).toISOString(), homeTeam: 'ASM Clermont', awayTeam: 'Union Bordeaux-Bègles', channel: 'CANAL+ SPORT 360', status: 'scheduled' },
    ];
    return res.json({ updatedAt: new Date().toISOString(), matches });
  } catch (e) {
    console.error('[top14Schedule] error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// =============================================================
// JustWatch Proxy (répare CORS côté backend au lieu du Worker CF)
// Endpoint: /api/justwatch (voir firebase.json rewrite)
// =============================================================
exports.justwatchProxy = onRequest({ region: 'europe-west9', timeoutSeconds: 15, memory: '256MiB' }, async (req, res) => {
  const allowedOrigins = [
    'https://cactus-tech.fr',
    'https://www.cactus-tech.fr',
    'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Dev fallback port sometimes used if 5173 busy
  'http://localhost:5174',
  'http://127.0.0.1:5174'
  ];
  const origin = req.headers.origin;
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  // Preflight
  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    res.set('Access-Control-Allow-Origin', allowOrigin);
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    let bodyText = req.rawBody ? req.rawBody.toString('utf8') : '';
    if (!bodyText) bodyText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    console.log('[justwatchProxy] Body reçu:', bodyText.slice(0, 500));
    if (bodyText.length > 200_000) {
      console.error('[justwatchProxy] Payload trop volumineux:', bodyText.length);
      throw new Error('Payload trop volumineux');
    }
    let parsed;
    if (contentType.includes('application/json') || contentType.includes('text/plain')) {
      try { parsed = JSON.parse(bodyText); } catch { /* si déjà objet */ }
      if (!parsed && typeof req.body === 'object') parsed = req.body;
    }
    if (!parsed || !parsed.query) {
      console.error('[justwatchProxy] Champ query manquant dans le body:', parsed);
      return res.status(400).set('Access-Control-Allow-Origin', allowOrigin).json({ error: 'Requête GraphQL invalide (champ query manquant)' });
    }

    const upstreamResp = await fetch('https://apis.justwatch.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; CactusJustWatchProxy/1.0)'
      },
      body: JSON.stringify(parsed)
    });

    const text = await upstreamResp.text();
    console.log('[justwatchProxy] Status JustWatch:', upstreamResp.status, 'Réponse:', text.slice(0, 500));
    res.set({
      'Access-Control-Allow-Origin': allowOrigin,
      'Content-Type': upstreamResp.headers.get('content-type') || 'application/json',
      'Vary': 'Origin'
    });
    return res.status(upstreamResp.status).send(text);
  } catch (e) {
    console.error('[justwatchProxy] Error', e && e.stack ? e.stack : e);
    res.set('Access-Control-Allow-Origin', origin || '*');
    return res.status(500).json({ error: 'Proxy failure', details: e && e.message ? e.message : String(e), stack: e && e.stack ? e.stack : undefined });
  }
});

exports.registerUser = onRequest({ region: "europe-west9" }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Méthode non autorisée" });
    }
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }

    try {
      const userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: `${firstName} ${lastName}`,
      });

      await admin.firestore().collection("users").doc(userRecord.uid).set({
        firstName: firstName,
        lastName: lastName,
        email: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await admin
        .firestore()
        .collection("gameCredits")
        .doc(userRecord.uid)
        .set({
          userId: userRecord.uid,
          credits: 100,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

      return res.status(200).json({ uid: userRecord.uid, success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message, rawCode: error.code });
    }
  });
});

// Callable équivalent pour correspondre au client (httpsCallable)
exports.registerUserCallable = onCall({ region: "europe-west9" }, async (req) => {
  const { email, password, firstName, lastName } = req.data || {};

  if (!email || !password || !firstName || !lastName) {
    throw new HttpsError("invalid-argument", "Tous les champs sont requis");
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    await admin.firestore().collection("users").doc(userRecord.uid).set({
      firstName,
      lastName,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await admin
      .firestore()
      .collection("gameCredits")
      .doc(userRecord.uid)
      .set(
        {
          userId: userRecord.uid,
          credits: 100,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return { uid: userRecord.uid, success: true };
  } catch (error) {
    const code = error.code || "internal";
    const message = error.message || "Erreur interne";
    throw new HttpsError("internal", message, { rawCode: code });
  }
});

exports.sendSaleNotification = onCall(
  { region: "europe-west9" },
  async (req) => {
    const { sale, isConsentUpdate } = req.data;
    const subject = "📝 Nouvelle vente enregistrée";
    const html = buildHtml(sale, "Nouvelle vente enregistrée.");

    if (sale.consent === "yes" && isConsentUpdate) {
      await Promise.allSettled([
        sendEmail({
          to: "m.demauret@mars-marketing.fr",
          subject: "✅ Une vente a été consentie",
          html: buildHtml(sale, "La vente a été confirmée par le client."),
        }),
        sendEmail({
          to: "i.boultame@mars-marketing.fr",
          subject: "🔄 Confirmation d'une vente",
          html: buildHtml(sale, "La vente est maintenant consentie."),
        }),
      ]);
      return { success: true };
    }

    if (sale.consent === "yes") {
      await Promise.allSettled([
        sendEmail({ to: "m.demauret@mars-marketing.fr", subject, html }),
        sendEmail({ to: "i.boultame@mars-marketing.fr", subject, html }),
      ]);
    } else if (sale.consent === "pending") {
      await sendEmail({ to: "i.boultame@mars-marketing.fr", subject, html });
    }

    return { success: true };
  }
);

exports.sendProgramme = onCall({ region: "europe-west9" }, async () => {
  const programmes = await fetchProgrammes();
  if (!programmes.length) {
    console.log("Aucun programme à envoyer.");
    return { success: false };
  }

  const html = buildProgrammeEmailHTML(programmes);

  const recipients = [
    "a.rouhier@mars-marketing.fr",
    "e.brunet@mars-marketing.fr",
    "e.guengant@mars-marketing.fr",
    "e.soba@mars-marketing.fr",
    "f.diagne@mars-marketing.fr",
    "i.brai@mars-marketing.frc",
    "j.chuttoo@mars-marketing.fr",
    "j.mbassidje@mars-marketing.fr",
    "m.yikik@mars-marketing.fr",
    "r.sellal@mars-marketing.fr",
    "s.dekhil@mars-marketing.fr",
    "v.bacouillard@mars-marketing.fr",
    "w.nechmi@mars-marketing.fr",
    "i.boultame@mars-marketing.fr",
    "m.maimoun@mars-marketing.fr",
  ];

  await Promise.allSettled(
    recipients.map((email) =>
      sendEmail({
        to: email,
        subject: `🎬 Programme du ${new Date().toLocaleDateString("fr-FR")}`,
        html,
      })
    )
  );

  console.log(`✅ Programme envoyé à : ${recipients.join(", ")}`);

  return { success: true, recipients };
});

exports.sendProgrammeScheduled = onSchedule(
  {
    schedule: "30 09 * * 1-5", // Du lundi au vendredi à 09:30 (heure de Paris)
    timeZone: "Europe/Paris",
    region: "europe-west1",
  },
  async () => {
    const programmes = await fetchProgrammes();
    if (!programmes.length) {
      console.log("Aucun programme à envoyer.");
      return;
    }

    const html = buildProgrammeEmailHTML(programmes);

    const recipients = [
      "a.rouhier@mars-marketing.fr",
      "e.brunet@mars-marketing.fr",
      "e.guengant@mars-marketing.fr",
      "e.soba@mars-marketing.fr",
      "f.diagne@mars-marketing.fr",
      "i.brai@mars-marketing.frc",
      "j.chuttoo@mars-marketing.fr",
      "j.mbassidje@mars-marketing.fr",
      "m.yikik@mars-marketing.fr",
      "r.sellal@mars-marketing.fr",
      "s.dekhil@mars-marketing.fr",
      "v.bacouillard@mars-marketing.fr",
      "w.nechmi@mars-marketing.fr",
      "i.boultame@mars-marketing.fr",
      "m.maimoun@mars-marketing.fr",
    ];

    await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `🎬 Programme du ${new Date().toLocaleDateString("fr-FR")}`,
          html,
        })
      )
    );

    console.log(`✅ Programme envoyé à : ${recipients.join(", ")}`);
  }
);

const offerLabels = {
  canal: "CANAL+",
  "canal-cine-series": "CANAL+ Ciné Séries",
  "canal-sport": "CANAL+ Sport",
  "canal-100": "CANAL+ 100%",
};

function buildHtml(sale, message) {
  const offer = offerLabels[sale.offer] || sale.offer;
  const consent = sale.consent === "yes" ? "✅ Oui" : "⏳ En attente";

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Notification de vente</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" style="background-color:#ffffff; border-radius:8px; box-shadow:0 0 10px rgba(0,0,0,0.05); overflow:hidden;">
          <tr>
            <td style="background-color:#007b5f; padding:20px; text-align:center; color:#ffffff;">
              <h1 style="margin:0; font-size:22px;">${message}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px; font-size:16px; color:#333;">
              <p style="margin-top:0;">Bonjour,</p>
              <p>Voici les détails de la vente enregistrée :</p>
              <table width="100%" style="border-collapse: collapse;">
                <tr>
                  <td style="padding:8px; font-weight:bold;">Nom :</td>
                  <td style="padding:8px;">${sale.name}</td>
                </tr>
                <tr style="background-color:#f9f9f9;">
                  <td style="padding:8px; font-weight:bold;">Commande :</td>
                  <td style="padding:8px;">${sale.orderNumber}</td>
                </tr>
                <tr>
                  <td style="padding:8px; font-weight:bold;">Offre :</td>
                  <td style="padding:8px;">${offer}</td>
                </tr>
                <tr style="background-color:#f9f9f9;">
                  <td style="padding:8px; font-weight:bold;">Consentement :</td>
                  <td style="padding:8px;">${consent}</td>
                </tr>
              </table>
              <div style="text-align:center; margin:30px 0;">
                <a href="https://cactus-tech.fr" target="_blank" style="background-color:#00c08b; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:5px; font-size:16px;">Accéder à Cactus-Tech</a>
              </div>
              <p style="font-size:14px; color:#999;">L’équipe Cactus-Tech 🌵</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#e0e0e0; padding:15px; text-align:center; font-size:12px; color:#666;">
              Cet email est une notification automatique suite à l'enregistrement d'une vente.
              <br>
              <a href="mailto:support@cactus-tech.fr" style="color:#007b5f; text-decoration:underline;">Contact support</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail({ to, subject, html }) {
  // Récupération clé Sweego depuis config Firebase Functions ou variable d'env fallback
  const functions = require('firebase-functions');
  const apiKey = (functions.config().sweego && functions.config().sweego.apikey) || process.env.SWEEGO_API_KEY;
  if (!apiKey) {
    console.error('[sendEmail] Clé API Sweego manquante (config sweego.apikey ou env SWEEGO_API_KEY). Email NON envoyé:', { to, subject });
    return; // On n'essaie pas l'appel sans clé
  }

  const data = {
    channel: "email",
    provider: "sweego",
    recipients: [{ email: to }],
    from: {
      email: "no-reply@cactus-tech.fr",
      name: "Cactus-Tech",
    },
    subject,
    "message-html": html,
  };

  try {
    const response = await axios.post("https://api.sweego.io/send", data, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Api-Key": apiKey,
      },
      timeout: 10000,
      validateStatus: (s) => s < 500 // laisser passer 4xx pour logging
    });
    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ [Sweego] Email envoyé à ${to}:`, response.data);
    } else {
      console.error(`⚠️ [Sweego] Statut inattendu ${response.status} pour ${to}:`, response.data);
    }
  } catch (err) {
    console.error(`❌ [Sweego] Échec envoi email à ${to}:`, err.response?.data || err.message);
  }
}

function normalize(str) {
  return str
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function extractChaineFromAltText(altText) {
  const match = altText?.match(/Sur ([^,{]+)/i);
  return match ? match[1].trim().toUpperCase() : null;
}

async function fetchProgrammes() {
  const baseUrl =
    "https://hodor.canalplus.pro/api/v2/mycanal/strateContent/a666110cb2368353fd52f10778be9395/pfs/spyro/contents/avoircesoir-home:0.json";

  const params = new URLSearchParams({
    displayNBOLogo: "false",
    discoverMode: "true",
    dsp: "detailPage",
    sdm: "show",
    displayLogo: "true",
    imageRatio: "169",
    imageSize: "normal",
    distmodes: "catchup,live,svod",
    titleDisplayMode: "all",
    context_type: "edito",
    context_list_category: "contentGrid (no title)",
    context_page_title: "Guide - Grille TV HAPI - J - Ce soir",
    context_list_title: "contentGrid (no title)",
    context_list_id: "avoircesoir-home:0",
    context_list_type: "contentGrid",
    context_list_position: "1",
    context_layout_title: "[Web] Programme TV ce soir prospect",
    maxContentNumber: "73",
    provideBroadcastInformation: "true",
    selectedBroadcast: "next",
    maxContentRemaining: "59",
    get: "50",
  });

  const res = await fetch(`${baseUrl}?${params.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const data = await res.json();
  const allItems = data.contents || [];

  const ALLOWED_CHAINES = [
    "CANAL+",
    "CANAL+ BOX OFFICE",
    "CANAL+ GRAND ECRAN",
    "CANAL+ SPORT 360",
    "CANAL+ SERIES",
    "CANAL+ DOCS",
    "CANAL+ SPORT",
    "CANAL+ FOOT",
    "CANAL+ CINEMA(S)",
    "CANAL+ A LA DEMANDE",
    "APPLE TV+",
    "MAX",
    "NETFLIX AVEC PUB",
    "PARAMOUNT+",
    "CINE+ OCS",
    "INSOMNIA",
    "BEIN SPORTS",
    "EUROSPORT",
    "PASS COUPES D'EUROPE",
    "INFOSPORT+",
  ].map(normalize);

  const seen = new Set();

  return allItems.filter((item) => {
    const id = item.contentID || item.epgID;
    if (!id || seen.has(id)) return false;
    seen.add(id);

    const altText = item.altText || "";
    const match = altText.match(/Sur ([^,{]+)/i);
    const rawChaine = match ? match[1] : item.altLogoChannel;
    const clean = normalize(rawChaine);

    if (ALLOWED_CHAINES.includes(clean)) {
      item._cleanChaine = rawChaine;
      return true;
    }
    return false;
  });
}

function buildProgrammeEmailHTML(items) {
  const formatHour = (ms) =>
    new Date(ms).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const cards = items
    .map((item) => {
      const heure = formatHour(item.startTime);
      const imgJaquette = item.URLImage.replace(
        "{resolutionXY}",
        "600x338"
      ).replace("{imageQualityPercentage}", "95");

      const imgLogo = item.URLLogoChannel
        ? item.URLLogoChannel.replace("{resolutionXY}", "96x72").replace(
            "{imageQualityPercentage}",
            "95"
          )
        : null;

      const isEurosport = item._cleanChaine
        ?.toUpperCase()
        .includes("EUROSPORT");

      return `
        <table width="300" cellpadding="0" cellspacing="0" style="margin:10px; font-family:sans-serif; border-collapse:collapse;">
          <tr>
            <td style="padding:0;">
              <div style="position:relative;">
                <img src="${imgJaquette}" width="300" style="display:block; border-radius:8px;" />
                ${
                  imgLogo
                    ? `<div style="position:relative; top:-40px; left:10px;">
                        <img src="${imgLogo}" alt="${
                        item._cleanChaine
                      }" height="32"
                          style="background:${
                            isEurosport ? "#000" : "#fff"
                          }; border-radius:4px; padding:2px; ${
                        isEurosport ? "border: 1px solid white;" : ""
                      }" />
                      </div>`
                    : ""
                }
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-top:4px;">
              <strong style="font-size:15px;">${heure} - ${
        item.title
      }</strong><br/>
              <span style="font-size:13px;">${item._cleanChaine}</span>
            </td>
          </tr>
        </table>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="fr">
      <head><meta charset="UTF-8" /></head>
      <body style="margin:0; padding:30px; font-family:sans-serif;">
        <h2>Programme TV du ${new Date().toLocaleDateString("fr-FR")}</h2>
        <center>
          <table cellpadding="0" cellspacing="0" style="width:100%; max-width:700px;">
            <tr>
              <td align="center" style="display:flex; flex-wrap:wrap; justify-content:center;">
                ${cards}
              </td>
            </tr>
          </table>
        </center>
      </body>
    </html>
  `;
}

// Assure que "registerUser" reste un callable (évite l'erreur de changement de type)
exports.registerUser = onCall({ region: "europe-west9" }, async (req) => {
  const { email, password, firstName, lastName } = req.data || {};

  if (!email || !password || !firstName || !lastName) {
    throw new HttpsError("invalid-argument", "Tous les champs sont requis");
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    await admin.firestore().collection("users").doc(userRecord.uid).set({
      firstName,
      lastName,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await admin
      .firestore()
      .collection("gameCredits")
      .doc(userRecord.uid)
      .set(
        {
          userId: userRecord.uid,
          credits: 100,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return { uid: userRecord.uid, success: true };
  } catch (error) {
    const code = error.code || "internal";
    const message = error.message || "Erreur interne";
    throw new HttpsError("internal", message, { rawCode: code });
  }
});
