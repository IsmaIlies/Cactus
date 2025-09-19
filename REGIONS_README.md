# Cloisonnement Régional (Option B)

Cette application implémente le cloisonnement des données (FR / CIV) via un champ `region` dans les documents plutôt que des collections séparées. Les routes régionales pointent maintenant vers un **même composant Dashboard unifié** ; seul le contexte détermine les données chargées.

## Résumé Architecture
- Sélection manuelle de la région (FR / CIV) sur la page de login (stockée dans localStorage `activeRegion`).
- Contexte `RegionContext` lit d'abord localStorage; si absent, tente Firestore `users/{uid}.region`.
- Redirection post-login vers `/dashboard/fr` ou `/dashboard/civ` selon le choix utilisateur.
- Anciennes pages dédiées : `DashboardFrPage.tsx` et `DashboardCivPage.tsx` (conservées seulement comme vestiges historiques, non utilisées dans le routing actuel).
- KPI dynamiques via `DASHBOARD_KPI_CONFIG` (fichier `src/config/dashboardKpiConfig.ts`).
- Agrégation attendue dans la collection `metricsDaily` avec un champ `region`.

## Collections Clés (exemples)
- `metricsDaily`: { region: 'FR' | 'CIV', dateKey: 'YYYY-MM-DD', ...kpi }
- `sales`: { region, createdAt, amount, ... }
- `agentsActivity`: { region, agentId, dateKey, callsHandled, ... }

### Détails sur `sales`
Segmentation désormais STRICTE :
- Toutes les lectures passent par `where('region','==', activeRegion)`.
- Les documents legacy SANS champ `region` ne sont plus visibles (ni FR ni CIV) tant que la migration n'est pas appliquée.
- Création de nouvelles ventes : champ `region` toujours injecté côté client dans `SalesPage`.

Migration nécessaire (si anciens documents) : exécuter le script `scripts/migrateSalesRegionFR.ts` (voir fichier `scripts/migrateSalesRegionFR.md`).

Après migration : toutes les anciennes ventes FR réapparaissent automatiquement côté FR.

Pourquoi stricte ?
- Garantit aucune fuite inter-régions.
- Simplifie les requêtes (plus de post-filtrage en mémoire).
- Réduction des coûts lectures inutiles.

## Avantages Option B
- Code factorisé : mêmes composants, simple switch sur `region`.
- Requêtes Firestore avec `where('region','==','FR')` => faciles à indexer.
- Évolution multi-régions future (ajouter d'autres codes) sans refacto structurelle.

## Sécurité (extrait conceptuel)
Ajouter dans les règles Firestore des validations sur `region` ou filtrer côté client. Pour un durcissement :
```
match /metricsDaily/{id} {
  allow read: if request.auth != null; // ou restreindre plus finement
  allow write: if false; // Ecrit par Cloud Function uniquement
}
```

## Prochaines Étapes Possibles
- Exécuter la migration si pas encore fait (puis supprimer le script).
- Ajout d'un rôle multi-site permettant de basculer entre régions sans relogin (sélecteur persistent dans l'UI admin).
- Charts réels (calls over time, product mix) + agrégation Cloud Functions (programmée via scheduler ou déclenchée sur écriture `sales`).
- Mise en cache locale ou SWR / react-query pour limiter le nombre de lectures répétées.
- Ajout de tests (ex: Jest + mock Firestore) pour valider la logique de segmentation stricte.

## Fallback / Défaut
Si `users/{uid}.region` absent ou invalide -> fallback `FR` (voir `RegionContext`).

---
Dernière mise à jour : segmentation stricte + script migration.
