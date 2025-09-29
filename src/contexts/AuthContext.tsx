import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
} from "react";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  verifyBeforeUpdateEmail,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, getFirestore } from "firebase/firestore";

import { getIdTokenResult } from "firebase/auth";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

interface User {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  role?: string; // Ajout du rôle
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean; // <-- ajoute cette ligne
  login: (email: string, password: string) => Promise<{ success: boolean; code?: string; message?: string }>;
  loginWithMicrosoft: () => Promise<boolean>;
  register: (userData: RegisterData) => Promise<{ success: boolean; code?: string; message?: string }>;
  logout: (reason?: string) => void;
  updateUserEmail: (
    newEmail: string,
    currentPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  updateUserDisplayName: (displayName: string) => Promise<boolean>;
  updateUserProfile: (firstName: string, lastName: string) => Promise<boolean>;
  updateUserPassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  sendVerificationEmail: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  reloadUser: () => Promise<void>;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  confirmEmail: string;
  password: string;
  confirmPassword: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(true);
  const inactivityTimeoutRef = React.useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const tokenResult = await getIdTokenResult(firebaseUser, true);
          const role = typeof tokenResult.claims.role === 'string' ? tokenResult.claims.role : undefined;
          // Récupère photoURL depuis Firestore (compatible v9)
          try {
          } catch {}
          setUser({
            id: firebaseUser.uid,
            displayName: firebaseUser.displayName || "",
            email: firebaseUser.email || "",
            emailVerified: firebaseUser.emailVerified,
            role,
          });
        } catch (e) {
          // Récupère photoURL depuis Firestore (compatible v9)
          try {
          } catch {}
          setUser({
            id: firebaseUser.uid,
            displayName: firebaseUser.displayName || "",
            email: firebaseUser.email || "",
            emailVerified: firebaseUser.emailVerified,
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; code?: string; message?: string }> => {
    const rawInput = email;
  const trimmed = rawInput.trim();
  // Utiliser exactement ce que l'utilisateur saisit (plus d'ajout automatique de domaine)
  const normalizedEmail = trimmed; // Laisser Firebase lever 'auth/invalid-email' si format incorrect
    try {
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const u = userCredential.user;
      setUser({
        id: u.uid,
        displayName: u.displayName || "",
        email: u.email || normalizedEmail,
        emailVerified: u.emailVerified,
      });
      return { success: true };
    } catch (err: any) {
      const code: string = err?.code || 'auth/unknown';
      // Auto retry simple pour les erreurs réseau transitoires
      if (code === 'auth/network-request-failed') {
        if (!navigator.onLine) {
          return { success: false, code, message: 'Aucune connexion internet détectée. Vérifiez votre réseau.' };
        }
        // Petit délai puis nouvelle tentative unique
        try {
          await new Promise(r => setTimeout(r, 600));
          const retryCred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
          const ru = retryCred.user;
          setUser({
            id: ru.uid,
            displayName: ru.displayName || '',
            email: ru.email || normalizedEmail,
            emailVerified: ru.emailVerified,
          });
          return { success: true };
        } catch (retryErr: any) {
          const retryCode: string = retryErr?.code || code;
          if (localStorage.getItem('authDebug') === '1') {
            console.warn('[authDebug] retry login failed', retryCode, retryErr);
          }
        }
      }
      let message = 'Erreur de connexion';
      switch (code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
          message = 'Mot de passe incorrect ou identifiants invalides';
          break;
        case 'auth/user-not-found':
          message = 'Utilisateur introuvable';
          break;
        case 'auth/too-many-requests':
          message = 'Trop de tentatives. Réessayez plus tard ou réinitialisez le mot de passe.';
          break;
        case 'auth/user-disabled':
          message = 'Compte désactivé. Contactez l’administrateur.';
          break;
        case 'auth/invalid-email':
          message = 'Adresse email invalide';
          break;
        case 'auth/network-request-failed':
          message = navigator.onLine
            ? 'Problème réseau ou blocage (pare-feu / proxy / adblock). Réessayez ou changez de connexion.'
            : 'Vous êtes hors ligne. Reconnectez-vous puis réessayez.';
          break;
        default:
          message = message + ` (${code})`;
      }
      if (localStorage.getItem('authDebug') === '1') {
        console.warn('[authDebug] login failed', { code, err });
      }
      return { success: false, code, message };
    }
  };

  const loginWithMicrosoft = async (): Promise<boolean> => {
    return false;
  };

  const register = async (userData: RegisterData): Promise<{ success: boolean; code?: string; message?: string }> => {
    const attempt = async () => {
      const userCredential = await createUserWithEmailAndPassword(auth, userData.email, userData.password);
      return userCredential.user;
    };
    try {
      let created;
      try {
        created = await attempt();
      } catch (err: any) {
        if (err?.code === 'auth/network-request-failed') {
          // Si offline clair -> message direct
          if (!navigator.onLine) {
            return { success: false, code: err.code, message: 'Pas de connexion internet détectée. Vérifie ton réseau.' };
          }
          // court retry après 600ms (similaire login)
          try {
            await new Promise(r => setTimeout(r, 600));
            created = await attempt();
          } catch (retryErr: any) {
            const retryCode = retryErr?.code || err.code;
            if (localStorage.getItem('authDebug') === '1') console.warn('[authDebug] register retry failed', retryCode, retryErr);
            return { success: false, code: retryCode, message: navigator.onLine ? 'Appel Firebase Auth bloqué (pare-feu / proxy / adblock ?) ou latence réseau. Essaye autre connexion ou désactive filtrages.' : 'Vous êtes hors ligne.' };
          }
        } else {
          throw err;
        }
      }

      // Set displayName
      const displayName = `${userData.firstName} ${userData.lastName}`.trim();
      try {
        await updateProfile(created, { displayName });
      } catch (e) {
        // non-blocking
        console.warn('updateProfile failed', e);
      }

      // Create Firestore user doc
      try {
        const db = getFirestore();
        const userDocRef = doc(db, 'users', created.uid);
        await setDoc(userDocRef, {
          firstName: userData.firstName,
          lastName: userData.lastName,
          displayName,
          email: userData.email,
          createdAt: Date.now(),
        }, { merge: true });
      } catch (e) {
        console.warn('setDoc user failed', e);
      }

      // Send verification email (best effort)
      try {
        await sendEmailVerification(created);
      } catch (e) {
        console.warn('sendEmailVerification failed', e);
      }

      return { success: true };
    } catch (error: any) {
      console.error('register error (client create):', error);
      const code: string | undefined = error?.code || undefined;
      let message: string = error?.message || 'Erreur inscription';
      if (code === 'auth/network-request-failed') {
        message = navigator.onLine
          ? 'Connexion au service Auth impossible (blocage réseau ?). Réessaye, change de réseau ou désactive un éventuel proxy/adblock.'
          : 'Vous semblez hors ligne. Reconnectez-vous et réessayez.';
      }
      return { success: false, code, message };
    }
  };

  const logout = React.useCallback((reason?: string) => {
    if (typeof window !== 'undefined') {
      if (reason) {
        localStorage.setItem('logoutReason', reason);
      } else {
        localStorage.removeItem('logoutReason');
      }
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
    }
    signOut(auth).catch((error) => {
      console.error("Erreur logout", error);
    });
    setUser(null);
  }, [setUser]);

  const updateUserEmail = async (
    newEmail: string,
    currentPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!auth.currentUser)
      return { success: false, error: "Aucun utilisateur connecté" };

    try {
      // Ré-authentifier l'utilisateur
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email!,
        currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Utiliser verifyBeforeUpdateEmail au lieu de updateEmail directement
      // Cette méthode envoie un email de vérification à la nouvelle adresse
      // et ne change l'email qu'après vérification
      await verifyBeforeUpdateEmail(auth.currentUser, newEmail);

      return { success: true };
    } catch (error: any) {
      console.error("Erreur mise à jour email:", error);

      let errorMessage = "Erreur lors de la mise à jour de l'email";
      switch (error.code) {
        case "auth/operation-not-allowed":
          errorMessage =
            "Cette opération n'est pas autorisée. Veuillez contacter le support.";
          break;
        case "auth/wrong-password":
          errorMessage = "Mot de passe incorrect";
          break;
        case "auth/email-already-in-use":
          errorMessage = "Cette adresse email est déjà utilisée";
          break;
        case "auth/invalid-email":
          errorMessage = "Adresse email invalide";
          break;
        case "auth/too-many-requests":
          errorMessage = "Trop de tentatives. Veuillez réessayer plus tard";
          break;
        case "auth/requires-recent-login":
          errorMessage =
            "Veuillez vous reconnecter pour effectuer cette action";
          break;
      }

      return { success: false, error: errorMessage };
    }
  };

  const updateUserDisplayName = async (
    displayName: string
  ): Promise<boolean> => {
    if (!auth.currentUser) return false;

    try {
      // Mettre à jour dans Firebase Auth
      await updateProfile(auth.currentUser, { displayName });

      // Mettre à jour dans Firestore (créer le document s'il n'existe pas)
      const db = getFirestore();
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userDocRef, { displayName }, { merge: true });

      // Mettre à jour l'état local
      setUser((prev) => (prev ? { ...prev, displayName } : null));

      return true;
    } catch (error) {
      console.error("Erreur mise à jour displayName:", error);
      return false;
    }
  };

  const updateUserProfile = async (
    firstName: string,
    lastName: string
  ): Promise<boolean> => {
    if (!auth.currentUser) return false;

    try {
      // Mettre à jour dans Firestore
      const db = getFirestore();
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userDocRef, { firstName, lastName }, { merge: true });

      return true;
    } catch (error) {
      console.error("Erreur mise à jour profil:", error);
      return false;
    }
  };

  const sendVerificationEmail = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;

    try {
      await sendEmailVerification(auth.currentUser);
      return true;
    } catch (error) {
      console.error("Erreur envoi email de vérification:", error);
      return false;
    }
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    try {
      // Ne plus ajouter automatiquement de domaine : utiliser exactement la saisie
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (error) {
      console.error("Erreur envoi email de réinitialisation:", error);
      return false;
    }
  };

  const reloadUser = async (): Promise<void> => {
    if (!auth.currentUser) return;

    try {
      await auth.currentUser.reload();
      console.log(
        "Utilisateur rechargé manuellement, emailVerified:",
        auth.currentUser.emailVerified
      );

      // Forcer la mise à jour du contexte
      setUser({
        id: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || "",
        email: auth.currentUser.email || "",
        emailVerified: auth.currentUser.emailVerified,
      });
    } catch (error) {
      console.error("Erreur lors du rechargement de l'utilisateur:", error);
    }
  };

  const updateUserPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!auth.currentUser)
      return { success: false, error: "Aucun utilisateur connecté" };

    try {
      // Ré-authentifier l'utilisateur
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email!,
        currentPassword
      );
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Mettre à jour le mot de passe
      await updatePassword(auth.currentUser, newPassword);

      return { success: true };
    } catch (error: any) {
      console.error("Erreur mise à jour mot de passe:", error);

      let errorMessage = "Erreur lors de la mise à jour du mot de passe";
      switch (error.code) {
        case "auth/wrong-password":
          errorMessage = "Mot de passe actuel incorrect";
          break;
        case "auth/weak-password":
          errorMessage = "Le nouveau mot de passe est trop faible";
          break;
        case "auth/too-many-requests":
          errorMessage = "Trop de tentatives. Veuillez réessayer plus tard";
          break;
        case "auth/requires-recent-login":
          errorMessage =
            "Veuillez vous reconnecter pour effectuer cette action";
          break;
      }

      return { success: false, error: errorMessage };
    }
  };

  const resetInactivityTimer = React.useCallback(() => {
    if (!user || typeof window === 'undefined') return;
    if (inactivityTimeoutRef.current) {
      window.clearTimeout(inactivityTimeoutRef.current);
    }
    inactivityTimeoutRef.current = window.setTimeout(() => {
      logout('inactivity');
    }, INACTIVITY_TIMEOUT_MS);
  }, [user, logout]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!user) {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      return;
    }

    const handleActivity = () => resetInactivityTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity));
    window.addEventListener('focus', handleActivity);
    const visibilityHandler = () => {
      if (!document.hidden) {
        resetInactivityTimer();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    resetInactivityTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      window.removeEventListener('focus', handleActivity);
      document.removeEventListener('visibilitychange', visibilityHandler);
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
    };
  }, [user, resetInactivityTimer]);


  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    loginWithMicrosoft,
    register,
    logout,
    updateUserEmail,
    updateUserDisplayName,
    updateUserProfile,
    updateUserPassword,
    sendVerificationEmail,
    resetPassword,
    reloadUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
