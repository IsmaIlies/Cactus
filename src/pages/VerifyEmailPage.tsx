import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../firebase";

const VerifyEmailPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [cooldownTime, setCooldownTime] = useState(0);
  const emailSentRef = useRef(false);
  const lastEmailSentRef = useRef<number>(0);
  const { user, logout, sendVerificationEmail, isAuthenticated, reloadUser } =
    useAuth();
  const navigate = useNavigate();

  // Redirection automatique
  useEffect(() => {
    if (!isAuthenticated) {
      // Si pas connecté, rediriger vers login
      navigate("/login", { replace: true });
    } else if (user?.emailVerified) {
      // Si email déjà vérifié, rediriger vers dashboard
      navigate("/dashboard", { replace: true });
    }
  }, [user, isAuthenticated, navigate]);

  // Envoyer automatiquement un email de vérification au chargement de la page
  useEffect(() => {
    const sendInitialVerificationEmail = async () => {
      if (
        isAuthenticated &&
        user &&
        !user.emailVerified &&
        !emailSentRef.current
      ) {
        console.log("📧 Envoi automatique de l'email de vérification...");
        emailSentRef.current = true; // Marquer immédiatement pour éviter les doublons

        try {
          await sendVerificationEmail();
          console.log("✅ Email de vérification envoyé automatiquement");
          setSuccessMessage("Email de vérification envoyé automatiquement !");
        } catch (error: any) {
          console.error("❌ Erreur lors de l'envoi automatique:", error);
          // Réinitialiser le flag en cas d'erreur pour permettre un nouvel essai
          emailSentRef.current = false;

          // Gestion spécifique des erreurs
          if (error.code === "auth/too-many-requests") {
            setError(
              "Trop de tentatives d'envoi. Veuillez attendre quelques minutes avant de réessayer."
            );
          } else if (error.code === "auth/invalid-email") {
            setError("Adresse email invalide.");
          } else {
            setError(
              "Impossible d'envoyer l'email de vérification. Vérifiez votre connexion."
            );
          }
        }
      }
    };

    sendInitialVerificationEmail();
  }, [isAuthenticated, user?.emailVerified]); // Simplifier les dépendances

  // Vérification périodique du statut de vérification d'email
  useEffect(() => {
    if (!isAuthenticated || user?.emailVerified) return;

    const checkEmailVerification = async () => {
      if (auth.currentUser) {
        try {
          await auth.currentUser.reload();
          if (auth.currentUser?.emailVerified) {
            // Forcer aussi la mise à jour du contexte
            await reloadUser();
            // L'email a été vérifié, la redirection se fera via l'autre useEffect
          }
        } catch (error) {
          console.error("Erreur lors de la vérification:", error);
        }
      }
    };

    // Vérifier toutes les 3 secondes
    const interval = setInterval(checkEmailVerification, 3000);

    return () => clearInterval(interval);
  }, [isAuthenticated, user?.emailVerified]);

  // Ne pas rendre la page si l'utilisateur ne devrait pas être ici
  if (!isAuthenticated || user?.emailVerified) {
    return null;
  }

  const handleResendEmail = async () => {
    // Vérifier le cooldown (60 secondes entre les envois)
    const now = Date.now();
    const timeSinceLastEmail = now - lastEmailSentRef.current;
    const cooldownDuration = 60000; // 60 secondes

    if (timeSinceLastEmail < cooldownDuration) {
      const remainingTime = Math.ceil(
        (cooldownDuration - timeSinceLastEmail) / 1000
      );
      setError(
        `Veuillez attendre ${remainingTime} secondes avant de renvoyer un email.`
      );
      return;
    }

    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      await sendVerificationEmail();
      lastEmailSentRef.current = now;
      setSuccessMessage("L'email a été renvoyé !");
      // Masquer le message après 5 secondes
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: any) {
      console.error("Erreur envoi email de vérification:", err);

      // Gestion spécifique des erreurs
      if (err.code === "auth/too-many-requests") {
        setError(
          "Trop de tentatives d'envoi. Veuillez attendre quelques minutes avant de réessayer."
        );
      } else if (err.code === "auth/invalid-email") {
        setError("Adresse email invalide.");
      } else if (err.code === "auth/user-not-found") {
        setError("Utilisateur non trouvé. Veuillez vous reconnecter.");
      } else {
        setError(
          "Une erreur est survenue lors de l'envoi. Veuillez réessayer plus tard."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-cactus-600 to-cactus-800">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-white mb-2">Cactus</h1>
          <p className="text-cactus-100">Vérification de votre email</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 w-full">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Vérifiez votre adresse email
            </h2>
            <p className="text-gray-600 mb-4">
              Pour accéder à votre dashboard, vous devez d'abord vérifier votre
              adresse email.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Un email de vérification a été envoyé à :<br />
              <strong className="text-gray-700">{user?.email}</strong>
            </p>
            <p className="text-xs text-gray-400 mb-6">
              Cliquez sur le lien dans l'email pour vérifier votre compte. Vous
              serez ensuite automatiquement redirigé.
            </p>

            {/* Informations de débogage en développement */}
            {process.env.NODE_ENV === "development" && (
              <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded mb-4">
                <strong>Debug:</strong> Email vérifié:{" "}
                {user?.emailVerified ? "Oui" : "Non"} | ID:{" "}
                {user?.id?.substring(0, 8)}...
              </div>
            )}
          </div>

          {error && (
            <div
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative mb-4"
              role="alert"
            >
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {successMessage && (
            <div
              className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded relative mb-4"
              role="alert"
            >
              <span className="block sm:inline">{successMessage}</span>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleResendEmail}
              disabled={loading}
              className="w-full btn-primary py-3 flex items-center justify-center"
            >
              {loading
                ? "Envoi en cours..."
                : "Renvoyer l'email de vérification"}
            </button>
          </div>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-gray-500">
              Vous n'avez pas reçu l'email ? Vérifiez vos spams.
            </p>
            <button
              onClick={handleLogout}
              className="text-sm text-cactus-600 hover:text-cactus-500"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
