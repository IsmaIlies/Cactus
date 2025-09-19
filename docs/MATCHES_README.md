# Gestion des matchs (Rugby TOP14)

## Objectif
Afficher automatiquement les prochains matchs de rugby (TOP14) et retirer ceux passés. Les matchs sont chargés depuis Firestore (`matches`) et groupés par semaine ISO.

## Collection Firestore: `matches`
Chaque document représente un match.

### Champs recommandés
| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| sport | string | Oui | `rugby`, `football`, etc. |
| competition | string | Optionnel | Ex: `TOP14` |
| round | string | Optionnel | Journée / Tour: ex `J3` |
| startTime | Timestamp | Oui | Date/heure de début (UTC ou locale). |
| homeTeam | string | Oui | Équipe à domicile |
| awayTeam | string | Oui | Équipe visiteuse |
| channel | string | Optionnel | Chaîne(s) de diffusion |
| status | string | Optionnel | `scheduled` / `live` / `finished` / `canceled` |
| createdAt | Timestamp | Auto | Ajout serveur |
| updatedAt | Timestamp | Auto | Mise à jour serveur |

## Exemple d'ajout (Console Firestore)
```
collection: matches
{
  sport: 'rugby',
  competition: 'TOP14',
  round: 'J4',
  startTime: 2025-09-20T14:35:00.000Z, // (équivalent 16h35 heure Paris si été)
  homeTeam: 'Castres Olympique',
  awayTeam: 'Aviron Bayonnais',
  channel: 'CANAL+ SPORT',
  status: 'scheduled',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

## Composant utilisé
`RugbyUpcomingMatches` (fichier: `src/components/RugbyUpcomingMatches.tsx`)
- Fenêtre de recherche: 28 jours (prop `daysWindow` sur la page Nouveautés)
- Groupement par semaine: clé `YYYY-W##`
- Affichage date (jour abrégé) + heure + équipes + compétition + chaîne

## Suppression automatique
Cloud Function: `purgeOldMatches` (planifiée 03:10 Europe/Paris)
- Supprime les matchs dont `startTime < now - 48h`
- Limite 500 documents / exécution (adapter si volume > 500)

## Indices / Index Firestore
Pour les requêtes combinées `(sport == rugby) AND startTime range + orderBy(startTime)` il faudra créer un index composite si Firestore l'indique.

Champ simple recommandé: index sur `startTime`.

## Mise à jour d'un match (exemple script Admin)
Si besoin d'un script ponctuel:
```js
await db.collection('matches').doc(id).update({ status: 'finished', updatedAt: serverTimestamp() });
```

## Extension future
- Ajouter `venue` (stade)
- Ajouter `broadcastCountry`
- Ajouter score temps réel (intégration API tierce) -> champ `liveData`.

## Tests manuels
1. Ajouter 2 matchs dont un dans le passé (< maintenant - 48h) et un futur.
2. Déployer la fonction ou lancer en local, vérifier que seul le futur s'affiche.
3. Avancer manuellement la date (ou modifier startTime) et relancer purge pour valider suppression.

---
Mainteneur: @cactus-tech
