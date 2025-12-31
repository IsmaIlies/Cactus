import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { fetchUserSpaces, getSpacesFromRole, spaceToRoute, AppSpace } from "../services/userSpaces";

// Redirection automatique basée sur le rôle
// Choisit l'espace et la route par défaut sans passer par des boutons
const RoleRedirect: React.FC = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return <div>Chargement...</div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  const role = (user.role || "").trim().toUpperCase();
  const isSupervisor = role.includes("SUPERVISEUR");

  // 1) Espaces selon rôle
  let spaces: AppSpace[] = getSpacesFromRole(role);
  let defaultSpace: AppSpace | undefined;

  const email = (user.email || "").toLowerCase();

  const [target, setTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const decide = async () => {
      try {
        // 2) Compléter via Firestore si nécessaire
        if (!spaces.length) {
          const fs = await fetchUserSpaces(email);
          spaces = fs.spaces;
          defaultSpace = fs.defaultSpace;
        }
        // 3) Choisir préférence: lastSpace -> defaultSpace -> premier
        const last = (() => {
          const v = localStorage.getItem("lastSpace");
          return v === "CANAL_FR" || v === "CANAL_CIV" || v === "LEADS" ? (v as AppSpace) : null;
        })();
        let chosen: AppSpace | null = null;
        if (last && spaces.includes(last)) chosen = last;
        else if (defaultSpace && spaces.includes(defaultSpace)) chosen = defaultSpace;
        else if (spaces.length) chosen = spaces[0];

        // 4) Fallback mission/région si aucun espace déterminé
        if (!chosen) {
          const mission = localStorage.getItem("activeMission") === "ORANGE_LEADS" ? "ORANGE_LEADS" : "CANAL_PLUS";
          const region = (localStorage.getItem("activeRegion") || "FR").toUpperCase();
          if (mission === "ORANGE_LEADS") {
            setTarget("/leads/dashboard");
          } else {
            setTarget(region === "CIV" ? "/dashboard/civ" : "/dashboard/fr");
          }
          return;
        }

        try { localStorage.setItem("lastSpace", chosen); } catch {}
        if (chosen === "LEADS") {
          try { localStorage.setItem("activeMission", "ORANGE_LEADS"); } catch {}
        } else {
          try { localStorage.setItem("activeMission", "CANAL_PLUS"); } catch {}
        }

        const path = spaceToRoute(chosen, isSupervisor);
        if (!cancelled) setTarget(path);
      } catch {
        // En cas d'erreur, aller sur FR par défaut
        if (!cancelled) setTarget("/dashboard/fr");
      }
    };
    decide();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, role, isSupervisor]);

  if (!target) return <div>Chargement...</div>;
  return <Navigate to={target} replace />;
};

export default RoleRedirect;
