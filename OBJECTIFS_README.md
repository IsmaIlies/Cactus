# 📊 Fonctionnalités Objectifs - Dashboard Canal+

## 🎯 Vue d'ensemble

Le dashboard a été enrichi avec un système complet de gestion d'objectifs personnels et d'équipe. Les objectifs sont affichés sous forme de cartes avec des barres de progression et intégrés dans les graphiques existants.

## 🔧 Nouvelles fonctionnalités ajoutées

### 📈 Cartes d'objectifs
- **Objectif Équipe** : Affiche l'objectif mensuel de l'équipe avec progression
- **Mon Objectif** : Affiche l'objectif personnel mensuel avec progression
- **Barres de progression** : Visualisation du pourcentage d'avancement
- **Couleurs distinctives** : Bleu pour l'équipe, vert cactus pour le personnel

### 📊 Graphique d'objectif dynamique
- **Objectif adaptatif** : Le graphique utilise maintenant l'objectif équipe défini
- **Label dynamique** : Affiche la valeur réelle de l'objectif (au lieu de 160 fixe)
- **Calcul intelligent** : Répartition linéaire sur les jours ouvrés du mois

## 🏗️ Architecture technique

### Service ObjectiveService
```typescript
// Récupérer les objectifs du mois en cours
const objectives = await ObjectiveService.getCurrentMonthObjectives(userId);

// Calculer le pourcentage de progression
const progress = ObjectiveService.calculateProgressPercentage(objective, currentCount);
```

### Structure des données
```typescript
interface Objective {
  id?: string;
  type: "sales" | "contactsArgues" | "other";
  label: string;
  target: number;
  period: "month" | "week" | "day";
  year?: number;
  month?: number;
  scope: "team" | "personal";
  userId?: string; // Pour les objectifs personnels
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
```

### Intégration dans DashboardHome
```typescript
// État des objectifs
const [objectives, setObjectives] = useState<{
  team: Objective | null;
  personal: Objective | null;
}>({ team: null, personal: null });

// Chargement des données
useEffect(() => {
  const fetchData = async () => {
    const [salesData, objectivesData] = await Promise.all([
      getValidatedSalesThisMonth(),
      ObjectiveService.getCurrentMonthObjectives(user?.id),
    ]);
    setSales(salesData);
    setObjectives(objectivesData);
  };
  fetchData();
}, [user?.id]);
```

## 🎨 Interface utilisateur

### Layout des cartes
```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard - Juillet 2025                 │
├─────────────────────────┬───────────────────────────────────┤
│  Mes ventes du jour     │  Objectif Équipe    │ Mon Objectif │
│  Mes ventes semaine     │                     │              │
│  Mes ventes du mois     │  120/160  (75%)     │  18/25 (72%) │
└─────────────────────────┴───────────────────────────────────┘
```

### Cartes d'objectifs
- **En-tête** : Titre + icône TrendingUp
- **Valeur principale** : `{actuel}/{objectif}`
- **Barre de progression** : Largeur proportionnelle au pourcentage
- **Pourcentage** : Affiché à côté de la barre
- **Sous-titre** : Description de l'objectif

### Styles et couleurs
- **Fond** : Blanc avec bordure grise claire
- **Équipe** : Couleur bleue (#1e40af)
- **Personnel** : Couleur cactus (#3c964c)
- **Barres vides** : Gris clair (#e5e7eb)

## 🔢 Calculs et logique

### Récupération des objectifs
```typescript
// Recherche objectif équipe mensuel actuel
const teamQuery = query(
  objectivesCollection,
  where("scope", "==", "team"),
  where("period", "==", "month"),
  where("year", "==", currentYear),
  where("month", "==", currentMonth),
  where("type", "==", "sales"),
  where("isActive", "==", true)
);

// Recherche objectif personnel mensuel actuel
const personalQuery = query(
  objectivesCollection,
  where("scope", "==", "personal"),
  where("userId", "==", userId),
  // ... autres conditions
);
```

### Calcul des progressions
```typescript
// Compter les ventes
const teamSalesCount = sales.length; // Toutes les ventes équipe
const personalSalesCount = personalSalesMonth.length; // Ventes personnelles

// Calculer les pourcentages
const teamProgress = ObjectiveService.calculateProgressPercentage(
  objectives.team, 
  teamSalesCount
);
const personalProgress = ObjectiveService.calculateProgressPercentage(
  objectives.personal, 
  personalSalesCount
);
```

### Graphique d'objectif adaptatif
```typescript
// Utilisation de l'objectif équipe dans le graphique
const MONTHLY_OBJECTIVE = objectives.team?.target || 160;

// Répartition linéaire sur les jours ouvrés
const expectedSalesForDay = Math.round(
  (MONTHLY_OBJECTIVE / workingDaysInMonth) * workingDayIndex
);
objectiveTarget.push(expectedSalesForDay);
```

## 📊 Gestion des données

### États d'affichage
1. **Objectif existant** : Affichage normal avec progression
2. **Aucun objectif** : Message "Aucun objectif défini/personnel"
3. **Objectif atteint** : Barre à 100% (même si dépassé)
4. **Chargement** : États intermédiaires gérés

### Fallbacks et sécurité
- **Objectif par défaut** : 160 ventes si aucun objectif équipe
- **Vérification null** : Gestion des cas où les objectifs n'existent pas
- **Calculs sécurisés** : Division par zéro évitée dans les pourcentages

## 🚀 Utilisation

### Pour voir les objectifs
1. **Aller sur le dashboard** : `/dashboard`
2. **Créer des objectifs** : Utiliser le script de test ou l'interface admin
3. **Voir la progression** : Les cartes se mettent à jour automatiquement

### Création d'objectifs de test
```typescript
// Utiliser le script fourni
import { createTestObjectives } from '../utils/createTestObjectives';

// Modifier l'ID utilisateur dans le script
// Exécuter dans la console du navigateur
await createTestObjectives();
```

### Types d'objectifs supportés
- **Équipe** : Un seul objectif équipe par mois
- **Personnel** : Un objectif par utilisateur par mois
- **Périodes** : Mensuel (principalement), hebdomadaire, quotidien
- **Types** : Ventes, contacts argumentés, autres

## 🔄 Mises à jour futures

### Fonctionnalités prévues
- [ ] **Interface de création** : Formulaire pour créer/éditer les objectifs
- [ ] **Historique** : Voir les objectifs des mois précédents
- [ ] **Notifications** : Alertes quand l'objectif est atteint/en retard
- [ ] **Objectifs hebdomadaires** : Affichage dans une vue semaine
- [ ] **Comparaisons** : Objectifs vs. réalisé sur plusieurs mois

### Améliorations possibles
- **Objectifs par type d'offre** : Canal+, Sport, etc.
- **Objectifs adaptatifs** : Qui s'ajustent selon les performances
- **Gamification** : Badges, points, classements
- **Prédictions** : IA pour estimer si l'objectif sera atteint

---

## 🛠️ Guide développeur

### Ajouter un nouveau type d'objectif
1. **Modifier l'interface** : Ajouter le type dans `Objective.type`
2. **Mettre à jour le service** : Gérer le nouveau type dans les requêtes
3. **Adapter l'UI** : Nouvelle couleur/icône pour le type
4. **Tester** : Créer des objectifs de test du nouveau type

### Modifier les calculs de progression
- **Service** : `ObjectiveService.calculateProgressPercentage()`
- **Logique** : Peut être adaptée selon le type d'objectif
- **Affichage** : Adapter les cartes si nécessaire

### Personnaliser l'affichage
- **Couleurs** : Modifier dans les classes Tailwind des cartes
- **Disposition** : Ajuster la grille `grid-cols-*`
- **Contenu** : Adapter les textes et icônes

---

*Dashboard Canal+ - Objectifs et progression en temps réel* 📊
