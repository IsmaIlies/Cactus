# Migration SSO Microsoft (FR)

Objectif: basculer les comptes Email/Mot de passe vers Microsoft (SSO) en liant le provider `microsoft.com` au même UID pour conserver toutes les données.

## 1) Pré‑requis de configuration

- Firebase Console → Authentication → Sign-in method → Microsoft
  - Tenant: `120a0b01-6d2a-4b3c-90c9-09366b19f4f7` (ou domaine du tenant)
  - Client ID / Client Secret: ceux de l’app Azure "[MM] Cactus"
  - Authorized domains: `<project>.web.app`, `<project>.firebaseapp.com`, domaine custom (ex: `cactus.labs.fr`)
- Azure AD → App registrations → [MM] Cactus → Authentication
  - Supported account types: Single tenant (ou multi-tenant si désiré)
  - Redirect URIs:
    - `https://<project-id>.firebaseapp.com/__/auth/handler`
    - `https://<project-id>.web.app/__/auth/handler`
    - `https://cactus.labs.fr/__/auth/handler` (si l'app est servie sur ce domaine)
  - Secret client actif (utilisé côté Firebase)

> Réseau/proxy: si vous observez un `403` sur une URL `https://<project>.firebaseapp.com/...` pendant la popup Microsoft,
> basculez l'app pour utiliser `authDomain=<project>.web.app`.
>
> Si l'app tourne sur `cactus.labs.fr`, vous pouvez aussi utiliser `authDomain=cactus.labs.fr` (souvent mieux accepté par les proxys),
> à condition que `cactus.labs.fr` soit bien dans "Authorized domains" côté Firebase Auth et dans les Redirect URIs Azure.

> Si non conforme, vous verrez l’erreur AADSTS50194 ("/common" non autorisé).

## 2) Paramètres applicatifs

- Fichier `.env.local` (copier depuis `.env.local.example`):
```
VITE_MICROSOFT_TENANT_ID=120a0b01-6d2a-4b3c-90c9-09366b19f4f7
VITE_AUTH_SSO_METHOD=popup
```
- Rebuild: `npm run build`

## 3) Stratégie de migration (zéro duplication)

- Principe: Lier le provider Microsoft au compte existant (email/password) pour garder le même UID.
- Cas de figure: Email change de `@mars-marketing.fr` → `@orange.mars-marketing.fr` (même "local part").
- Flux utilisateur (déjà implémenté):
  1. L’utilisateur se connecte comme d’habitude (email/mot de passe).
  2. Aller dans Paramètres → "Synchroniser mon compte Microsoft".
  3. Saisir son email `@orange.mars-marketing.fr` et cliquer Synchroniser.
  4. Une popup Microsoft s’ouvre: après validation, le provider `microsoft.com` est lié à l’UID existant.
  5. (Optionnel) Ensuite, on peut mettre à jour l’email primaire du compte vers `@orange` côté Auth.

- Flux login direct avec `@orange` (pré‑liaison):
  - Si l’utilisateur passe par le bouton Microsoft avec `emailHint=@orange`, l’app tente d’abord d’authentifier l’UID legacy via un custom token, puis lie Microsoft (évite de créer un nouvel utilisateur).

## 4) Vérifications

- Firebase Console → Authentication → Users: vérifier que `microsoft.com` apparaît dans "Linked providers" pour les UID existants.
- Aucun nouvel utilisateur ne doit être créé pour la même personne.
- La redirection Microsoft doit cibler `/120a0b01-.../` (pas `/common`).

## 5) (Optionnel) Mise à jour d’email Auth vers @orange

- Après lien Microsoft réussi, on peut aligner l’email primaire du compte Auth sur `@orange` via une fonction Admin sécurisée.
- Conditions recommandées avant update:
  - Le provider `microsoft.com` est bien lié au compte.
  - Le nouvel email `@orange` n’est pas déjà utilisé par un autre UID.

## 6) Dépannage rapide

- AADSTS50194: Configurez le "Tenant" dans Firebase (provider Microsoft) et les Redirect URIs dans Azure; évitez `/common` en single‑tenant.
- 400 `signInWithIdp`: consultez le corps de réponse (onglet Réseau) pour l’erreur exacte (secret invalide, URI manquante, domaine non autorisé).
- Popup bloquée: le flux passe en `redirect` automatiquement si nécessaire.

