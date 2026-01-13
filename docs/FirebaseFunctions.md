# Firebase Functions — Documentation complète (Gen2)

Dernière mise à jour: 2026-01-06

Ce document décrit précisément les Cloud Functions déployées pour Cactus, leurs rôles, endpoints, sécurité, variables d’environnement/secrets, et indique celles qui ne sont plus utilisées par le frontend actuel.

## Vue d’ensemble

- Plateforme: Firebase Functions Gen2 + Identity Platform (blocking functions)
- Régions principales: `europe-west9` (HTTP/callables), `europe-west1` (leads stats + tâches planifiées), `us-central1` (blocking auth dans l’émulateur par défaut)
- Sécurité:
  - IP allowlist côté Auth (blocking) via `AUTH_IP_ENFORCE` + `AUTH_IP_ALLOWLIST`
  - Endpoints HTTP avec CORS restrictif (origins autorisés)
  - Callables protégées via `req.auth` et contrôle d’autorisation (admin/superviseur)
- Secrets: gérés via Secret Manager (Gen2)
  - `LEADS_API_TOKEN` (stats Emitel)
  - `SWEEGO_API_KEY` (envoi d’emails)

## Variables d’environnement

- `AUTH_IP_ENFORCE` (`true|false`) — active le blocage IP au login/création
- `AUTH_IP_ALLOWLIST` — CSV/CIDR (ex: `77.72.95.93/32,95.143.79.26/32,...`)
- `LEADS_STATS_URL` — URL amont pour stats leads (par défaut Emitel)
- `LEADS_API_TOKEN` — via secret: `LEADS_API_TOKEN`
- `SWEEGO_API_KEY` — via secret: `SWEEGO_API_KEY`

## Fonctions par catégorie

### 1) Auth blocking (Identity Platform)

- `authBeforeUserSignedIn` (before sign-in) — bloque les connexions si IP non autorisée
- `authBeforeUserCreated` (before user created) — bloque la création si IP non autorisée
- Utilise: `AUTH_IP_ENFORCE`, `AUTH_IP_ALLOWLIST`, `AUTH_IP_BYPASS_EMAILS`
- Fichier: functions/index.js

Diagnostic local: `authIpCheck` (HTTP) — renvoie l’IP vue et le statut d’autorisation (utile en émulation)

### 2) Leads (statistiques + proxy)

- `leadsStats` (HTTP, `europe-west1`) — GET JSON simplifié (dolead, hipto)
  - Secrets: `LEADS_API_TOKEN`
  - CORS: permissif (Origin renvoyé)
  - Utilisé par: [src/components/LeadInflowConversionPanel.tsx](../src/components/LeadInflowConversionPanel.tsx), [src/pages/SupervisorLeadsPlusPage.tsx](../src/pages/SupervisorLeadsPlusPage.tsx)
- `leadsStatsForward` (HTTP, `europe-west1`) — proxy sécurisé vers l’API upstream (propage IP)
  - Secrets: `LEADS_API_TOKEN`
  - Utilisé par: [src/components/LeadInflowConversionPanel.tsx](../src/components/LeadInflowConversionPanel.tsx)

- `submitLeadSale` (callable, `europe-west9`) — enregistre une vente Leads (validation stricte)
  - Utilisé par: [src/leads/services/leadsSalesService.ts](../src/leads/services/leadsSalesService.ts)
- `sendSaleNotification` (callable, `europe-west9`) — email récap vente (Sweego)
  - Utilisé par: [src/pages/SalesPage.tsx](../src/pages/SalesPage.tsx)

### 3) Administration (utilisateurs/roles/stats)

- `setUserRole` (callable, `europe-west9`) — assigne un rôle et claims associés
  - Utilisé par: [src/pages/AdminDashboardPage.tsx](../src/pages/AdminDashboardPage.tsx)
- `setUserRoleHttp` (HTTP, `europe-west9`) — fallback HTTP (Bearer idToken)
  - Utilisé par: [src/pages/AdminDashboardPage.tsx](../src/pages/AdminDashboardPage.tsx)

- `getAdminUserStats` (callable, `europe-west9`) — compte actifs/total/désactivés sur 1h
  - Utilisé par: [src/components/AdminPresenceDebugBadge.tsx](../src/components/AdminPresenceDebugBadge.tsx), [src/pages/AdminDashboardPage.tsx](../src/pages/AdminDashboardPage.tsx)
- `getAdminUserStatsHttp` (HTTP, `europe-west9`) — fallback HTTP (Bearer idToken)
  - Utilisation: optionnelle (fallback dans AdminDashboard)

- `disableUsersCallable` (callable, `europe-west9`) — désactive une liste d’utilisateurs
  - Utilisé par: [src/pages/AdminDashboardPage.tsx](../src/pages/AdminDashboardPage.tsx)
- `disableUsers` (HTTP, `europe-west9`) — équivalent HTTP
  - Utilisation: non détectée dans le frontend actuel

- `registerUser` — attention: le dépôt contient un export HTTP puis un export callable plus bas
  - Front actuel utilise l’HTTP: [src/pages/AdminDashboardPage.tsx](../src/pages/AdminDashboardPage.tsx)
  - À harmoniser: garder une seule variante (callable recommandé) ou ajuster le front
- `registerUserCallable` (callable, `europe-west9`)
  - Utilisation: non détectée dans le frontend actuel

### 4) Migration/SSO et Email primaire

- `mintCustomTokenByEmail` (callable, `europe-west9`) — génère un custom token pour liaison SSO
  - Utilisé par: [src/contexts/AuthContext.tsx](../src/contexts/AuthContext.tsx)
- `mintCustomTokenByEmailHttp` (HTTP, `europe-west9`) — variante HTTP
  - Utilisation: non détectée (fallback possible hors callable)

- `updatePrimaryEmailIfMicrosoftLinked` (callable, `europe-west9`) — migre l’email primaire → `@orange.mars-marketing.fr`
  - Utilisation: non détectée directement (frontend passe par HTTP)
- `updatePrimaryEmailIfMicrosoftLinkedHttp` (HTTP, `europe-west9`) — wrapper HTTP (CORS + Bearer)
  - Utilisé par: [src/pages/SettingsPage.tsx](../src/pages/SettingsPage.tsx), [src/pages/DashboardHome.tsx](../src/pages/DashboardHome.tsx), [src/leads/pages/LeadsDashboardPage.tsx](../src/leads/pages/LeadsDashboardPage.tsx)

- `requestPasswordReset` (HTTP, `europe-west9`) — génère lien reset + email Sweego, anti‑enumération
  - Utilisé par: [src/contexts/AuthContext.tsx](../src/contexts/AuthContext.tsx)

### 5) Proxies et contenus

- `justwatchProxy` (HTTP, `europe-west9`) — relay GraphQL JustWatch (corrige CORS)
  - Utilisé par: [src/services/justwatchService.ts](../src/services/justwatchService.ts)
- `top14Schedule` (HTTP, `europe-west9`) — stub calendrier TOP14 (démo)
  - Utilisation: non détectée dans le frontend actuel

### 6) Tâches planifiées

- `purgeOldMatches` (schedule, `europe-west1`) — nettoie `matches` plus vieux que 48h
- `sendProgrammeScheduled` (schedule, `europe-west1`) — envoie le programme TV chaque jour ouvré
- `sendProgramme` (callable) — envoi manuel du programme TV
  - Utilisation front: non détectée (opérationnel manuel)

## Fonctions non utilisées par le frontend (au 2026-01-06)

- `top14Schedule` (HTTP)
- `disableUsers` (HTTP) — le front utilise `disableUsersCallable`
- `registerUserCallable` (callable) — le front cible l’HTTP `registerUser`
- `mintCustomTokenByEmailHttp` (HTTP) — fallback non référencé
- `updatePrimaryEmailIfMicrosoftLinked` (callable) — le front utilise la variante HTTP
- `sendProgramme` (callable) — usage manuel uniquement

Remarque: quelques fonctions HTTP « fallback » existent en doublon des callables pour contourner les environnements où `httpsCallable` est bloqué. Conservez une seule variante par usage dans le futur pour réduire la surface.

## Sécurité & CORS

- La plupart des endpoints HTTP valident l’origine et renvoient des en‑têtes CORS restrictifs (liste blanche d’origines locales + prod).
- Les variantes HTTP admin exigent un `Authorization: Bearer <idToken Firebase>` puis vérifient les droits via Firestore/claims.
- Les callables exigent `req.auth` et un contrôle d’admin via `isAdminAllowed()`.

## Emulation & Déploiement

- Emulateurs
  - Lancer: `firebase emulators:start --only functions`
  - Tester l’IP allowlist localement: `http://127.0.0.1:5001/<project>/us-central1/authIpCheck`
- Déploiement partiel
  - `firebase deploy --only functions:leadsStats,functions:leadsStatsForward`
- Secrets (exemples)
  - `firebase functions:secrets:set LEADS_API_TOKEN`
  - `firebase functions:secrets:set SWEEGO_API_KEY`

## Points d’attention / TODO

- Harmoniser `registerUser`: choisir callable ou HTTP et aligner le frontend.
- Valider les origines CORS autorisées (localhost, 127.0.0.1, domaines prod).
- Conserver une seule variante (callable ou HTTP) par fonctionnalité pour simplifier la maintenance.

---

Génération PDF: voir script `npm run docs:functions-pdf` (cf. package.json). Le PDF sera produit dans `docs/FirebaseFunctions.pdf`.
