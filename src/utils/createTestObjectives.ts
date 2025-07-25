// Script pour créer des objectifs de test
// À exécuter dans la console du navigateur sur la page dashboard

import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

export async function createTestObjectives() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  try {
    // Objectif équipe mensuel
    const teamObjective = {
      type: "sales",
      label: "Ventes équipe",
      target: 160,
      period: "month",
      year: currentYear,
      month: currentMonth,
      scope: "team",
      isActive: true,
      createdBy: "test-script",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Objectif personnel mensuel (vous devrez remplacer 'YOUR_USER_ID' par un vrai ID utilisateur)
    const personalObjective = {
      type: "sales",
      label: "Mes ventes",
      target: 25,
      period: "month",
      year: currentYear,
      month: currentMonth,
      scope: "personal",
      userId: "YOUR_USER_ID", // Remplacer par un vrai ID utilisateur
      isActive: true,
      createdBy: "test-script",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Créer les objectifs
    const objectivesCollection = collection(db, "objectives");
    
    await addDoc(objectivesCollection, teamObjective);
    console.log("✅ Objectif équipe créé");
    
    await addDoc(objectivesCollection, personalObjective);
    console.log("✅ Objectif personnel créé");
    
    console.log("🎯 Objectifs de test créés avec succès !");
    
  } catch (error) {
    console.error("❌ Erreur lors de la création des objectifs:", error);
  }
}

// Instructions d'utilisation :
// 1. Ouvrir la console sur la page dashboard
// 2. Importer ce script
// 3. Modifier 'YOUR_USER_ID' avec un vrai ID utilisateur
// 4. Exécuter createTestObjectives()
