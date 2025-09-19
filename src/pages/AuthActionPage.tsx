import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  applyActionCode,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { Eye, EyeOff } from "lucide-react";

const AuthActionPage = () => {
  console.log("🚀 AuthActionPage lancée");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, user, reloadUser } = useAuth();
  console.log("📊 État initial:", {
    isAuthenticated,
    emailVerified: user?.emailVerified,
  });

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("");
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [actionProcessed, setActionProcessed] = useState(false);
  const [actionStarted, setActionStarted] = useState(false);
  const actionInProgress = useRef(false);

  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");
  console.log("🔗 Paramètres URL:", { mode, oobCode });

  // Redirection basée sur l'état d'authentification une fois l'action traitée
  useEffect(() => {
    console.log("🔄 Check redirection:", {
      actionProcessed,
      mode,
      isAuthenticated,
      emailVerified: user?.emailVerified,
    });

    if (
      actionProcessed &&
      (mode === "verifyEmail" || mode === "verifyAndChangeEmail")
    ) {
      if (isAuthenticated && user?.emailVerified) {
        console.log("✅ Redirection vers dashboard");
        navigate("/dashboard", { replace: true });
      } else if (isAuthenticated && user?.emailVerified === false) {
        // Attendre et vérifier plusieurs fois pour la synchronisation du contexte
        console.log(
          "⚠️ Email pas encore vérifié dans le contexte, attente synchronisation..."
        );

        let attempts = 0;
        const maxAttempts = 5;
        const checkInterval = 500; // 500ms entre chaque vérification

        const checkSyncInterval = setInterval(async () => {
          attempts++;
          console.log(
            `🔍 Tentative ${attempts}/${maxAttempts} de vérification du contexte`
          );

          // Forcer le rechargement du contexte
          await reloadUser();

          // Vérifier directement l'état Firebase
          if (auth.currentUser) {
            await auth.currentUser.reload();
            console.log(
              `Firebase emailVerified: ${auth.currentUser.emailVerified}`
            );

            if (
              auth.currentUser.emailVerified ||
              mode === "verifyAndChangeEmail"
            ) {
              console.log(
                "✅ Email vérifié dans Firebase, redirection vers dashboard"
              );
              clearInterval(checkSyncInterval);
              navigate("/dashboard", { replace: true });
              return;
            }
          }

          if (attempts >= maxAttempts) {
            console.log("⚠️ Délai dépassé, redirection vers dashboard");
            clearInterval(checkSyncInterval);
            navigate("/dashboard", { replace: true });
          }
        }, checkInterval);

        // Nettoyage si le composant est démonté
        return () => clearInterval(checkSyncInterval);
      } else {
        console.log("❌ Pas connecté, redirection vers login");
        navigate("/login", { replace: true });
      }
    }
  }, [
    actionProcessed,
    mode,
    isAuthenticated,
    user?.emailVerified,
    navigate,
    reloadUser,
  ]);

  const getErrorMessage = (error: any) => {
    switch (error.code) {
      case "auth/expired-action-code":
        return "Ce lien a expiré. Veuillez demander un nouveau lien.";
      case "auth/invalid-action-code":
        return "Ce lien est invalide. Veuillez vérifier l'URL.";
      case "auth/user-disabled":
        return "Ce compte a été désactivé.";
      case "auth/user-not-found":
        return "Aucun compte associé à cette adresse email.";
      case "auth/weak-password":
        return "Le mot de passe est trop faible.";
      default:
        return `Une erreur est survenue: ${
          error.message || error.code || "Erreur inconnue"
        }`;
    }
  };

  useEffect(() => {
    const handleAuthAction = async () => {
      // Empêcher la double exécution avec une vérification plus stricte
      if (actionStarted || actionProcessed || actionInProgress.current) {
        console.log("⚠️ Action déjà en cours ou terminée, skip", {
          actionStarted,
          actionProcessed,
          actionInProgress: actionInProgress.current,
        });
        return;
      }

      if (!mode || !oobCode) {
        console.log("❌ Paramètres manquants");
        setStatus("error");
        setMessage("Lien invalide ou expiré.");
        setActionProcessed(true);
        actionInProgress.current = false;
        return;
      }

      // Marquer immédiatement comme démarré pour éviter la double exécution
      setActionStarted(true);
      actionInProgress.current = true;
      console.log("🎯 Action démarrée pour de bon");

      try {
        switch (mode) {
          case "verifyEmail":
            console.log("Début de la vérification d'email");

            // Vérifier d'abord si l'email n'est pas déjà vérifié
            if (auth.currentUser) {
              await auth.currentUser.reload();
              console.log(
                "État actuel avant vérification, emailVerified:",
                auth.currentUser.emailVerified
              );

              if (auth.currentUser.emailVerified) {
                console.log(
                  "✅ Email déjà vérifié ! Pas besoin d'appliquer le code."
                );
                setStatus("success");
                setMessage("Votre email a été vérifié avec succès !");
                setActionProcessed(true);
                actionInProgress.current = false;
                return; // Sortir complètement de la fonction
              }
            }

            // Appliquer le code seulement si l'email n'est pas déjà vérifié
            try {
              console.log("🔧 Application du code de vérification...");
              await applyActionCode(auth, oobCode);
              console.log("✅ Email vérifié avec succès!");

              // Marquer immédiatement comme traité
              setActionProcessed(true);
              actionInProgress.current = false;

              // Forcer le rechargement pour synchroniser l'état
              if (auth.currentUser) {
                await auth.currentUser.reload();
                console.log(
                  "🔄 Utilisateur rechargé, emailVerified:",
                  auth.currentUser.emailVerified
                );
              }

              // Forcer aussi la mise à jour du contexte
              await reloadUser();

              setStatus("success");
              setMessage("Votre email a été vérifié avec succès !");

              // Attendre un peu pour s'assurer que le contexte est synchronisé
              setTimeout(async () => {
                // Forcer encore une fois le reload pour être sûr
                await reloadUser();
                console.log("🔄 Contexte rechargé après délai");
              }, 500);
            } catch (codeError: any) {
              console.log(
                "❌ Erreur lors de l'application du code:",
                codeError.code
              );

              // Si le code est invalide, vérifier si l'email n'est pas déjà vérifié
              if (codeError.code === "auth/invalid-action-code") {
                console.log(
                  "🔍 Code invalide, vérification de l'état de l'email..."
                );
                if (auth.currentUser) {
                  await auth.currentUser.reload();
                  console.log(
                    "État après erreur, emailVerified:",
                    auth.currentUser.emailVerified
                  );

                  if (auth.currentUser.emailVerified) {
                    console.log(
                      "✅ Email était déjà vérifié, traitement comme succès !"
                    );
                    setStatus("success");
                    setMessage("Votre email a été vérifié avec succès !");
                    setActionProcessed(true);
                    actionInProgress.current = false;
                    await reloadUser();
                    return;
                  }
                }
              }

              // Si ce n'est pas le cas d'un email déjà vérifié, relancer l'erreur
              throw codeError;
            }
            break;

          case "verifyAndChangeEmail":
            console.log("Début du changement d'email avec vérification");

            try {
              console.log("🔧 Application du code de changement d'email...");
              await applyActionCode(auth, oobCode);
              console.log("✅ Email changé avec succès!");

              // Marquer immédiatement comme traité
              setActionProcessed(true);
              actionInProgress.current = false;

              // Forcer le rechargement pour synchroniser l'état
              if (auth.currentUser) {
                await auth.currentUser.reload();
                console.log(
                  "🔄 Utilisateur rechargé, nouvel email:",
                  auth.currentUser.email
                );
              }

              // Forcer aussi la mise à jour du contexte
              await reloadUser();

              setStatus("success");
              setMessage("Votre adresse email a été changée avec succès !");

              // Attendre un peu pour s'assurer que le contexte est synchronisé
              setTimeout(async () => {
                await reloadUser();
                console.log("🔄 Contexte rechargé après changement d'email");
              }, 500);
            } catch (codeError: any) {
              console.log(
                "❌ Erreur lors du changement d'email:",
                codeError.code
              );
              throw codeError;
            }
            break;

          case "resetPassword":
            // Vérifier que le code est valide
            await verifyPasswordResetCode(auth, oobCode);
            setIsPasswordReset(true);
            setStatus("success");
            setMessage("Entrez votre nouveau mot de passe.");
            setActionProcessed(true);
            actionInProgress.current = false;
            break;

          case "recoverEmail":
            await applyActionCode(auth, oobCode);
            setStatus("success");
            setMessage("Votre adresse email a été restaurée.");
            setActionProcessed(true);
            actionInProgress.current = false;
            break;

          default:
            setStatus("error");
            setMessage("Action non reconnue.");
            setActionProcessed(true);
            actionInProgress.current = false;
        }
      } catch (error: any) {
        console.error("Erreur dans handleAuthAction:", error);
        console.error("Mode:", mode);
        console.error("OobCode:", oobCode);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        setStatus("error");
        setMessage(getErrorMessage(error));
        setActionProcessed(true);
        actionInProgress.current = false;
      }
    };

    if (!actionProcessed && !actionStarted) {
      console.log("🚀 Démarrage de handleAuthAction");
      handleAuthAction();
    } else {
      console.log(
        "⏸️ handleAuthAction ignoré - actionStarted:",
        actionStarted,
        "actionProcessed:",
        actionProcessed
      );
    }
  }, [mode, oobCode, actionProcessed, actionStarted, reloadUser]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage("Les mots de passe ne correspondent pas.");
      return;
    }

    if (newPassword.length < 6) {
      setMessage("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    try {
      await confirmPasswordReset(auth, oobCode!, newPassword);
      setMessage("Votre mot de passe a été réinitialisé avec succès !");
      setTimeout(() => navigate("/login"), 3000);
    } catch (error: any) {
      setMessage(getErrorMessage(error));
    }
  };

  const renderLayout = (title: string, children: React.ReactNode) => (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-cactus-600 to-cactus-800">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-white mb-2">Cactus</h1>
          <p className="text-cactus-100">{title}</p>
        </div>
        {children}
      </div>
    </div>
  );

  const renderStatusIcon = () => (
    <div
      className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
        status === "success" ? "bg-green-100" : "bg-red-100"
      }`}
    >
      <svg
        className={`w-8 h-8 ${
          status === "success" ? "text-green-600" : "text-red-600"
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={status === "success" ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"}
        />
      </svg>
    </div>
  );

  if (
    status === "loading" ||
    (actionProcessed &&
      (mode === "verifyEmail" || mode === "verifyAndChangeEmail") &&
      status === "success")
  ) {
    return renderLayout(
      (mode === "verifyEmail" || mode === "verifyAndChangeEmail") &&
        actionProcessed
        ? "Redirection..."
        : "Traitement en cours...",
      <div className="bg-white rounded-lg shadow-lg p-6 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-cactus-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {(mode === "verifyEmail" || mode === "verifyAndChangeEmail") &&
          actionProcessed
            ? "Redirection en cours..."
            : "Traitement en cours..."}
        </h1>
        <p className="text-gray-600">
          {(mode === "verifyEmail" || mode === "verifyAndChangeEmail") &&
          actionProcessed
            ? mode === "verifyAndChangeEmail"
              ? "Votre email a été changé, redirection vers le dashboard..."
              : "Votre email a été vérifié, redirection vers le dashboard..."
            : "Veuillez patienter pendant que nous traitons votre demande."}
        </p>
      </div>
    );
  }

  if (isPasswordReset && status === "success") {
    return renderLayout(
      "Nouveau mot de passe",
      <div className="bg-white rounded-lg shadow-lg p-6 w-full">
        <form onSubmit={handlePasswordReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field pr-10"
                placeholder="Votre nouveau mot de passe"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showNewPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field pr-10"
                placeholder="Confirmez votre mot de passe"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {message && (
            <div
              className={`p-3 rounded ${
                message.includes("succès")
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {message}
            </div>
          )}

          <button type="submit" className="w-full btn-primary py-3">
            Réinitialiser le mot de passe
          </button>
        </form>
      </div>
    );
  }

  return renderLayout(
    "Authentification",
    <div className="bg-white rounded-lg shadow-lg p-6 w-full text-center">
      {renderStatusIcon()}

      <h1
        className={`text-xl font-bold mb-2 ${
          status === "success" ? "text-green-800" : "text-red-800"
        }`}
      >
        {status === "success" ? "Succès !" : "Erreur"}
      </h1>

      <p className="text-gray-600 mb-6">{message}</p>

      <div className="space-y-3">
        {status === "success" &&
          (mode === "verifyEmail" || mode === "verifyAndChangeEmail") && (
            <button
              onClick={() => navigate("/dashboard")}
              className="block w-full btn-primary py-3"
            >
              Accéder au Dashboard
            </button>
          )}

        <button
          onClick={() => navigate("/login")}
          className="block w-full btn-secondary py-3"
        >
          Retour à la connexion
        </button>
      </div>
    </div>
  );
};

export default AuthActionPage;
