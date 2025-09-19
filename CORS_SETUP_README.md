# Configuration CORS & Règles Storage pour programme.pdf

## 1. Fichier CORS
Créé: `functions/cors.json`

Contenu:
```json
[
  {
    "origin": [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://cactus-mm.web.app",
      "https://cactus-mm.firebaseapp.com",
      "https://cactus-tech.fr",
      "https://www.cactus-tech.fr"
    ],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
    "responseHeader": [
      "Content-Type",
      "Authorization",
      "x-goog-meta-*",
      "x-goog-resumable"
    ],
    "maxAgeSeconds": 3600
  }
]
```

## 2. Appliquer la configuration CORS
Assure-toi d'être authentifié (`gcloud auth login`) et d'avoir sélectionné le projet:
```powershell
gcloud config set project cactus-mm
# Appliquer
gsutil cors set .\functions\cors.json gs://cactus-mm.appspot.com
# Vérifier
gsutil cors get gs://cactus-mm.appspot.com
```

## 3. Règles Storage
Fichier: `storage.rules` (référencé dans `firebase.json`).
Déployer:
```powershell
firebase deploy --only storage
```
Contenu résumé:
```
match /shared/programme.pdf {
  allow read: if request.auth != null; // ou 'allow read;' si public
  allow write: if admin strict
}
```

## 4. Test rapide
1. Hard refresh navigateur (Ctrl+Shift+R).
2. Ouvrir DevTools → Network.
3. Upload un PDF.
4. Vérifier requête OPTIONS (status 200/204 + Access-Control-Allow-Origin).
5. Requête POST/PUT retourne JSON metadata.

## 5. Astuces
- Pour rendre le PDF accessible même déconnecté: changer `allow read: if request.auth != null;` en `allow read;`.
- Ajouter un domaine: modifier `functions/cors.json`, re-faire `gsutil cors set ...`.
- Erreur persistante CORS: vider cache (nouvelle fenêtre privée), vérifier `cors get`.

## 6. Sécurité
- Écriture restreinte aux administrateurs -> nécessite que le token Firebase contienne `admin` ou `role == 'admin'`.
- Pour auditer: activer Cloud Logging sur Storage (optionnel).

## 7. Limites / Améliorations possibles
- Historiser les versions: utiliser un nom horodaté et stocker la dernière dans Firestore.
- Ajouter un viewer inline: `<iframe src={downloadURL} />`.
- Ajouter une taille max: vérifier `file.size` côté frontend avant upload.

---
Fin.
