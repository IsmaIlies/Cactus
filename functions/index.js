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

exports.registerUser = onCall({ region: "europe-west9" }, async (request) => {
  const { email, password, firstName, lastName } = request.data;

  if (!email || !password || !firstName || !lastName) {
    throw new HttpsError("invalid-argument", "Tous les champs sont requis");
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

    return { uid: userRecord.uid, success: true };
  } catch (error) {
    throw new HttpsError("internal", error.message, { rawCode: error.code });
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
  const apiKey = "11c02e9e-61de-4037-99ad-0e313adb3a37";

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
    });
    console.log(`✅ Email envoyé à ${to}:`, response.data);
  } catch (err) {
    console.error(
      `❌ Échec envoi email à ${to}:`,
      err.response?.data || err.message
    );
    // Ne throw pas ici pour ne pas bloquer les autres mails
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
