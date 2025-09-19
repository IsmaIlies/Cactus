# Bannière PDF partagée & Calendrier Rugby Auto

## 1. Bannière PDF (ProgrammePdfBanner)
Affiche un bloc en haut de la page `NouveautesPage` permettant :
- Lecture / ouverture du dernier PDF partagé (tous les utilisateurs authentifiés)
- Upload / remplacement uniquement par les administrateurs (role=admin dans custom claims)

### Stockage
- Fichier: Firebase Storage chemin `shared/programme.pdf`
- Métadonnées Firestore: document `shared/programmePdf` avec champs:
  - url (string)
  - name (string)
  - size (number, octets)
  - updatedAt (timestamp serveur)
  - updatedBy (uid)

### Règles Firestore
Ajout dans `firestore.rules` :
```
match /shared/{docId} {
  allow read: if request.auth != null;
  allow create, update, delete: if hasAdminRole();
}
```

Pour restreindre aussi l'upload Storage côté règles, créer une règle Storage similaire (non inclus ici).

### Ajout d'un rôle admin
Définir le claim dans une Cloud Function d'admin (exemple) :
```js
await admin.auth().setCustomUserClaims(uid, { role: 'admin' })
```
L'utilisateur doit se reconnecter pour rafraîchir ses claims.

## 2. Calendrier Rugby Automatique
Le composant `RugbyUpcomingMatches` ne lit plus Firestore. Il appelle l'endpoint Cloud Function :
```
GET https://europe-west9-cactus-mm.cloudfunctions.net/top14Schedule
```
(En local: `http://localhost:5001/cactus-mm/europe-west9/top14Schedule`)

### Structure JSON retournée
```json
{
  "updatedAt": "2025-09-15T12:00:00.000Z",
  "matches": [
    {
      "id": "m1",
      "sport": "rugby",
      "competition": "TOP14",
      "round": "J4",
      "startTime": "2025-09-18T14:35:00.000Z",
      "homeTeam": "Stade Toulousain",
      "awayTeam": "RC Toulon",
      "channel": "CANAL+ SPORT",
      "status": "scheduled"
    }
  ]
}
```

### Filtrage
Le composant filtre sur la fenêtre `daysWindow` (par défaut 21 jours) et regroupe par semaine ISO (utilitaire existant `groupMatchesByISOWeek`).

### Étapes futures possibles
- Remplacer le stub par une récupération de data officielle (API publique, scraping, fichier ICS). 
- Mettre un cache (Firestore ou Storage) pour éviter surcharge.
- Ajouter badge LIVE si status = live.

## 3. Déploiement
1. Déployer les fonctions : `firebase deploy --only functions:top14Schedule,functions:purgeOldMatches`
2. Déployer hosting si la page a changé : `firebase deploy --only hosting`

## 4. Sécurité & Améliorations
- Ajouter règles Storage: limiter écriture `shared/programme.pdf` aux admins.
- Ajouter versioning du PDF (`programme-<timestamp>.pdf`) et historique (nouvelle collection `shared/programmePdfHistory`).
- Ajouter bouton suppression (admin) si besoin.

---
Mainteneur: cactus-tech
