# Firebase Cloud Functions – CactusAgent

Ce document explique précisément le fonctionnement des Functions utilisées dans ce projet, la configuration attendue, comment tester en local avec les émulateurs, et comment déployer en production.

## Aperçu
- Plateforme: Firebase Cloud Functions (Gen2 v2).
- Services utilisés: HTTPS (onRequest), Identity Blocking Functions (beforeUserSignedIn/beforeUserCreated), Scheduler (onSchedule).
- Sécurité: IP allowlist sur les phases d’authentification, Secrets via Firebase Secret Manager.

## Structure du dossier
- [functions/index.js](index.js): fonctions principales (auth/IP, endpoints Leads, proxy, utilitaires).
- [functions/deleteAllMessages.js](deleteAllMessages.js): script d’admin pour supprimer tous les documents de `messages` (batch Firestore).
- [functions/AUTH_IP_ALLOWLIST_README.md](AUTH_IP_ALLOWLIST_README.md): documentation complémentaire IP allowlist.
- [functions/cors.json](cors.json): exemple de configuration CORS (référentiel).
- [functions/package.json](package.json): dépendances Functions.

## Fonctions Identity (blocage par IP)
Deux fonctions Gen2 bloquent l’authentification si l’IP n’appartient pas à une liste autorisée:
- `authBeforeUserSignedIn`: `beforeUserSignedIn` — bloque les connexions provenant d’IP non autorisées.
- `authBeforeUserCreated`: `beforeUserCreated` — bloque la création de comptes depuis des IP non autorisées.

Paramètres (via environnements/Secrets):
- `AUTH_IP_ENFORCE`: `true|false` — active le blocage. Si absent ou `false`, le système est en mode « log-only » (ne bloque pas, journalise).
- `AUTH_IP_ALLOWLIST`: liste CSV (IPs ou CIDRs), ex: `203.0.113.4,198.51.100.0/24,2001:db8::/32`.
- `AUTH_IP_BYPASS_EMAILS`: liste d’emails autorisés à contourner l’allowlist.

Comportement:
- Si `AUTH_IP_ENFORCE=true` et `AUTH_IP_ALLOWLIST` vide: l’accès est bloqué par sécurité.
- IP IPv4 et IPv6 supportées; gestion des formats IPv6-mappés (`::ffff:x.x.x.x`).

## Endpoints HTTPS (onRequest)
Tous les endpoints gèrent OPTIONS (préflight CORS), autorisent GET, et renvoient des réponses « safe » (zéros) en cas d’erreur pour ne pas casser l’UI.

1) `authIpCheck`
- Usage: diagnostic de politique IP; renvoie la lecture de l’allowlist et l’état `enforce`.
- Local (émulateur): `http://127.0.0.1:5001/<project>/us-central1/authIpCheck`.
- Réponse: `{ ok, enforce, ip, allowed, allowlistCount, allowlistRaw }` avec `200` si autorisé ou non-enforcé; `403` si enforcé et refusé.

2) `leadsStats`
- Rôle: collecte et expose des KPIs Leads (Dolead/Hipto/MM) avec cache mémoire (30s).
- Région: `europe-west1`, Timeout: 30s, Mémoire: 256MiB.
- Secrets: `LEADS_API_TOKEN`.
- Query params: `date_start=YYYY-MM-DD`, `date_end=YYYY-MM-DD`.
- Mode diagnostic (facultatif): `?diagnostic=1` renvoie l’IP d’egress (`egressIp`) pour whitelist upstream.
- Réponse: `{ ok, dolead, hipto, mm }`.

3) `leadsStatsForward`
- Rôle: proxy sécurisé vers l’API fournisseur pour récupérer les stats, en propageant l’IP client via `X-Forwarded-For` et `X-Real-IP`.
- Région/Timeout/Mémoire: idem `leadsStats`.
- Secrets: `LEADS_API_TOKEN`.
- Base URL configurable: `LEADS_STATS_URL` (fallback: `https://orange-leads.mm.emitel.io/stats-lead.php`).
- Query params: identiques (`date_start`, `date_end`).
- Mode diagnostic: `?diagnostic=1` → `egressIp`.
- Réponse: contenu upstream (JSON/texte) ou fallback `{ ok:false, dolead:0, hipto:0, mm:0 }` en cas d’erreur.

## Secrets & variables d’environnement
- Secrets (recommandé): `LEADS_API_TOKEN`, `SWEEGO_API_KEY` (si utilisé). Déclares-les dans Firebase avec le Secret Manager.
- Variables env classiques (optionnel pour dev local): `AUTH_IP_*`, `LEADS_STATS_URL`.
- Chargement `.env` local: le code tente `functions/.env.local`, `functions/.env`, puis à la racine (`../.env*`).

## Emulation locale
Prérequis: Node 18+, Firebase CLI installé, projet initialisé.

- Installer deps côté functions:
```bash
cd functions
npm install
cd ..
```
- Lancer les émulateurs ciblés:
```bash
firebase emulators:start --only functions,firestore,auth
```
- Appeler un endpoint local (exemples):
```bash
# authIpCheck
curl -i "http://127.0.0.1:5001/<project-id>/us-central1/authIpCheck"

# leadsStats (dates facultatives)
curl -i "http://127.0.0.1:5001/<project-id>/europe-west1/leadsStats?date_start=2026-01-01&date_end=2026-01-05"

# leadsStatsForward
curl -i "http://127.0.0.1:5001/<project-id>/europe-west1/leadsStatsForward?date_start=2026-01-01&date_end=2026-01-05"
```

## Déploiement
- Déployer uniquement les Functions:
```bash
firebase deploy --only functions
```
- Déployer Hosting (après build Vite):
```bash
npm run build
firebase deploy --only hosting
```
- Déploiement ciblé d’une fonction:
```bash
firebase deploy --only functions:leadsStats
```

## Sécurité & CORS
- Tous les endpoints HTTPS gèrent le prévol CORS avec `OPTIONS` et renvoient les entêtes adéquats (`Access-Control-Allow-*`).
- Pour consommation depuis le front, veille à configurer les domaines autorisés côté Firebase Auth/Hosting.
- Les endpoints proxy relaient l’IP client pour permettre l’allowlisting (chez le fournisseur amont).

## Performance
- Cache mémoire 30s sur `leadsStats` pour éviter de surcharger l’amont.
- Timeouts et mémoire ajustés; en cas de forte charge, adapter `maxInstances`/`concurrency` (Gen2).

## Observabilité
- Logs: visibles dans Firebase Console (Functions → Logs).
- Les erreurs de proxy renvoient des payloads « safe » à 200 pour conserver l’UI fonctionnelle.

## Script d’admin
- [functions/deleteAllMessages.js](deleteAllMessages.js):
  - Supprime tous les documents de la collection `messages` en batch.
  - Usage (local/admin): `node functions/deleteAllMessages.js` avec des identifiants admin (attention aux environnements).

## Bonnes pratiques
- Valider les `query params` (formats dates `YYYY-MM-DD`).
- Ne jamais commiter des secrets dans le repo; utiliser Secret Manager.
- Éviter les boucles infinies dans les triggers; rendre les opérations idempotentes.
- Journaliser les erreurs, mais retourner des réponses tolérantes pour garder l’UI opérationnelle.

## FAQ
- "Pourquoi mon login est bloqué?": vérifie `AUTH_IP_ENFORCE` et `AUTH_IP_ALLOWLIST`, et l’IP publique de ton réseau. Utilise `authIpCheck` en local pour diagnostiquer.
- "Comment autoriser un email à bypass l’allowlist?": ajoute l’email dans `AUTH_IP_BYPASS_EMAILS`.
- "Comment whitelister l’IP d’egress Google Cloud?": appelle `leadsStats?diagnostic=1` ou `leadsStatsForward?diagnostic=1` et configure l’IP retournée chez le fournisseur.
