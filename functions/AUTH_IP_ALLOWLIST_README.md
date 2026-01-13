# Liste blanche d'IP pour l'authentification (Blocking Functions)

Ce projet permet de bloquer la **connexion** et la **création de compte** Firebase Auth en fonction de l’adresse IP du client grâce aux **Blocking Functions d’Identity Platform**.

## Prérequis

- Votre projet Firebase doit être migré vers **Firebase Authentication avec Identity Platform**.
- Les Blocking Functions doivent être activées dans la console Firebase (Authentication → Blocking functions) puis déployées.

### Si le déploiement échoue avec OPERATION_NOT_ALLOWED

Si vous voyez :

`OPERATION_NOT_ALLOWED : Blocking Functions may only be configured for GCIP projects.`

cela signifie que le projet n’est **pas encore** un projet Identity Platform (GCIP).

Correctifs :

1. Google Cloud Console → **Identity Platform** → Activer pour le projet.
2. Firebase Console → Authentication → vérifier qu’Identity Platform est actif.
3. Relancer : `firebase deploy --only functions`

Tant que ce n’est pas activé, l’application de la liste blanche IP via `beforeUserSignedIn` / `beforeUserCreated` ne fonctionnera pas.

## Ce qui est implémenté

- `authBeforeUserSignedIn` : s’exécute à chaque connexion, bloque si l’IP n’est pas autorisée.
- `authBeforeUserCreated` : s’exécute à chaque création de compte, bloque si l’IP n’est pas autorisée.

Ces fonctions lisent `event.ipAddress` (fourni par Identity Platform).

## Configuration

Définissez des variables d’environnement pour Cloud Functions :

- `AUTH_IP_ENFORCE` :
  - `true` → **applique** la liste blanche (bloque si non autorisé)
  - `false`/non défini → mode log uniquement (ne bloque pas)

- `AUTH_IP_ALLOWLIST` : liste d’IP et de CIDR séparés par virgule ou espace.
  - Exemple : `203.0.113.4, 198.51.100.0/24, 2001:db8::/32`

### Via .env (local/dev)

Vous pouvez gérer ces réglages via un fichier `.env` dans `functions/` (chargé automatiquement) :

```
# functions/.env
AUTH_IP_ENFORCE=false
AUTH_IP_ALLOWLIST="77.72.95.93/32,77.72.95.94/32,95.143.79.26/32,185.17.240.132/32"
AUTH_IP_BYPASS_EMAILS="admin@mars-marketing.fr admin@orange.mars-marketing.fr"
```

Copiez `functions/.env.example` vers `functions/.env` puis adaptez. En production, privilégiez les variables d’environnement/Secret Manager.

### Pas de liste blanche en dur

Par sécurité, aucune IP n’est codée en dur. Vous devez fournir `AUTH_IP_ALLOWLIST` via l’environnement (fichier `.env` local ou variables Firebase/Secret Manager). Les fonctions lisent `process.env.*`.

- `AUTH_IP_BYPASS_EMAILS` (optionnel) : emails toujours autorisés, séparés par virgule ou espace.
  - Exemple : `admin@yourcompany.com, owner@yourcompany.com`

### Comportement de sécurité

- Si `AUTH_IP_ENFORCE` est **true**, la liste blanche est appliquée.
- Si `AUTH_IP_ALLOWLIST` est vide/non défini, elle est considérée vide ; la connexion/création sera bloquée (comportement sûr par défaut).
- Si `AUTH_IP_ENFORCE` est **false**/non défini, rien n’est bloqué ; les IP non autorisées sont seulement journalisées.

## Déploiement

Depuis la racine du dépôt :

```powershell
Set-Location "C:\Users\ilies\OneDrive\Documents\MarsMarketing\CactusAgent\functions"
npm install
Set-Location "C:\Users\ilies\OneDrive\Documents\MarsMarketing\CactusAgent"
firebase deploy --only functions
```

## Où définir la liste blanche (production)

Les variables d’environnement des Cloud Functions (Gen2) sont configurées **par fonction**.

Définissez les mêmes variables sur :

- `authBeforeUserSignedIn`
- `authBeforeUserCreated`

Chemin recommandé :

1. Google Cloud Console → Cloud Functions
2. Ouvrir la fonction → **Edit**
3. Runtime settings → **Runtime environment variables**
4. Ajouter/mettre à jour :
  - `AUTH_IP_ENFORCE`
  - `AUTH_IP_ALLOWLIST`
  - `AUTH_IP_BYPASS_EMAILS` (optionnel)
5. Déployer

## Vérification rapide (endpoint de test)

Un endpoint HTTP de diagnostic renvoie l’IP vue et l’état de la politique : `authIpCheck`.

- Local (émulateur Functions) : `http://127.0.0.1:5001/<projet>/us-central1/authIpCheck`
- Production : `https://us-central1-<projet>.cloudfunctions.net/authIpCheck`

> Remarque : l’émulateur Firebase Auth ne déclenche pas les Blocking Functions. Utilisez cet endpoint pour visualiser la config, mais testez le blocage réel sur l’environnement déployé.

## Tests locaux (Windows PowerShell)

Définir des variables d’environnement dans la session avant de lancer l’émulateur :

```powershell
$env:AUTH_IP_ENFORCE = "false"
$env:AUTH_IP_ALLOWLIST = "203.0.113.4/32,198.51.100.0/24"
$env:AUTH_IP_BYPASS_EMAILS = "admin@yourcompany.com"

Set-Location "C:\Users\ilies\OneDrive\Documents\MarsMarketing\CactusAgent"
firebase emulators:start --only functions
```

## Notes / limites

- Les réseaux mobiles/CGNAT peuvent changer d’IP publique fréquemment.
- Pour un accès strict d’entreprise, privilégiez un VPN/proxy à IP de sortie fixe.
- Les Blocking Functions expirent autour de 7s ; gardez la logique minimale (cette implémentation est en mémoire).
