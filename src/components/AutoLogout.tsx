import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";

// Durée d'inactivité avant déconnexion (25 minutes)
const INACTIVITY_LIMIT_MS = 25 * 60 * 1000;
const WARNING_BEFORE_LOGOUT_MS = 5 * 60 * 1000; // 5 minutes avant déconnexion

/**
 * Composant qui déconnecte automatiquement l'utilisateur après 25 minutes d'inactivité.
 * Place-le dans App.tsx ou dans le layout principal, juste après AuthProvider.
 */
export default function AutoLogout() {
  const { isAuthenticated, logout } = useAuth();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;


    const resetTimer = () => {
      // Nettoie les timers précédents
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);

      // Planifie l'alerte 5 min avant la déconnexion
      warningRef.current = setTimeout(() => {
        // Affiche une alerte simple (remplace par une popup custom si besoin)
        window.alert("Vous allez être déconnecté dans 5 minutes pour cause d'inactivité.");
      }, INACTIVITY_LIMIT_MS - WARNING_BEFORE_LOGOUT_MS);

      // Planifie la déconnexion
      timerRef.current = setTimeout(() => {
        logout();
        // Optionnel: notifier l'utilisateur
        // alert("Déconnexion automatique pour cause d'inactivité.");
      }, INACTIVITY_LIMIT_MS);
    };

    // Liste des événements d'activité à écouter
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer(); // Démarre le timer au montage

    return () => {
  if (timerRef.current) clearTimeout(timerRef.current);
  if (warningRef.current) clearTimeout(warningRef.current);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isAuthenticated, logout]);

  return null;
}