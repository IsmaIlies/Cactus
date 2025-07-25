import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export interface Objective {
  id?: string;
  missionId?: string | null; // Peut être null pour les objectifs globaux
  type: "sales" | "contactsArgues" | "other";
  label: string;
  target: number; // L'objectif (remplace monthlyTarget et weeklyTarget)
  period: "month" | "week" | "day"; // Soit mois, soit semaine, soit jour

  // Pour les objectifs mensuels
  year?: number; // 2025
  month?: number; // 1-12 pour janvier-décembre

  // Pour les objectifs hebdomadaires (simplifié)
  weekYear?: number; // Année de la semaine
  weekNumber?: number; // Numéro de semaine dans l'année (1-53)

  // Pour les objectifs journaliers (nouveau)
  dayYear?: number; // Année du jour
  dayMonth?: number; // Mois du jour (1-12)
  dayDate?: number; // Jour du mois (1-31)

  // Nouveaux champs pour les objectifs personnels
  scope: "team" | "personal"; // Objectif d'équipe ou personnel
  userId?: string; // ID de l'utilisateur pour les objectifs personnels
  assignedTo?: string; // ID de l'utilisateur assigné (pour les objectifs personnels)
  assignedToName?: string; // Nom de l'utilisateur assigné (pour l'affichage)

  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

class ObjectiveService {
  private objectivesCollection = collection(db, "objectives");

  async getObjectives(): Promise<Objective[]> {
    try {
      const q = query(this.objectivesCollection, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Objective[];
    } catch (error) {
      console.error("Erreur lors de la récupération des objectifs:", error);
      throw error;
    }
  }

  async getTeamObjectives(): Promise<Objective[]> {
    try {
      const q = query(
        this.objectivesCollection,
        where("scope", "==", "team"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Objective[];
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des objectifs d'équipe:",
        error
      );
      throw error;
    }
  }

  async getPersonalObjectives(userId: string): Promise<Objective[]> {
    try {
      const q = query(
        this.objectivesCollection,
        where("scope", "==", "personal"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Objective[];
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des objectifs personnels:",
        error
      );
      throw error;
    }
  }

  async getAllObjectivesForUser(
    userId: string
  ): Promise<{ team: Objective[]; personal: Objective[] }> {
    try {
      const [teamObjectives, personalObjectives] = await Promise.all([
        this.getTeamObjectives(),
        this.getPersonalObjectives(userId),
      ]);

      return {
        team: teamObjectives,
        personal: personalObjectives,
      };
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des objectifs pour l'utilisateur:",
        error
      );
      throw error;
    }
  }

  // Calcul du pourcentage de progression
  calculateProgressPercentage(
    objective: Objective,
    currentCount: number
  ): number {
    if (!objective.target || objective.target <= 0) return 0;
    const percentage = (currentCount / objective.target) * 100;
    return Math.min(Math.round(percentage * 10) / 10, 100); // Arrondi à un décimal, max 100%
  }

  // Obtenir les objectifs mensuels actifs pour le mois en cours
  async getCurrentMonthObjectives(userId?: string): Promise<{
    team: Objective | null;
    personal: Objective | null;
  }> {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // Recherche objectif équipe mensuel
      const teamQuery = query(
        this.objectivesCollection,
        where("scope", "==", "team"),
        where("period", "==", "month"),
        where("year", "==", currentYear),
        where("month", "==", currentMonth),
        where("type", "==", "sales"),
        where("isActive", "==", true)
      );

      const teamSnapshot = await getDocs(teamQuery);
      const teamObjective = teamSnapshot.empty ? null : {
        id: teamSnapshot.docs[0].id,
        ...teamSnapshot.docs[0].data(),
      } as Objective;

      let personalObjective: Objective | null = null;

      // Si un userId est fourni, rechercher l'objectif personnel
      if (userId) {
        const personalQuery = query(
          this.objectivesCollection,
          where("scope", "==", "personal"),
          where("period", "==", "month"),
          where("year", "==", currentYear),
          where("month", "==", currentMonth),
          where("userId", "==", userId),
          where("type", "==", "sales"),
          where("isActive", "==", true)
        );

        const personalSnapshot = await getDocs(personalQuery);
        personalObjective = personalSnapshot.empty ? null : {
          id: personalSnapshot.docs[0].id,
          ...personalSnapshot.docs[0].data(),
        } as Objective;
      }

      return {
        team: teamObjective,
        personal: personalObjective,
      };
    } catch (error) {
      console.error("Erreur lors de la récupération des objectifs du mois:", error);
      return { team: null, personal: null };
    }
  }
}

export default new ObjectiveService();
