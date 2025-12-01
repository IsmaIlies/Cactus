import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { Eye, EyeOff, Save, X } from "lucide-react";
import { auth } from "../firebase";

const SettingsPage = () => {
  // Accessibilité : états pour le dark mode, taille de police et contraste

  // Appliquer les styles d'accessibilité au body
  const {
    user,
    updateUserEmail,
    updateUserDisplayName,
    updateUserProfile,
    updateUserPassword,
    linkMicrosoft,
  } = useAuth();

  // États pour les formulaires
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // États pour les sections éditables
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);

  // États pour le chargement et les messages
  const [loading, setLoading] = useState(false);
  const [emailPending, setEmailPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [msEmailHint, setMsEmailHint] = useState("");
  const [linking, setLinking] = useState(false);
  const [migrating, setMigrating] = useState(false);
  // Bouton toujours visible: on déduira juste s'il est déjà migré

  // Ajout : état pour la photo de profil

  // Charger les données du profil depuis Firestore
  useEffect(() => {
    const loadUserProfile = async () => {
      if (user) {
        try {
          const db = getFirestore();
          const userDoc = await getDoc(doc(db, "users", user.id));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setFirstName(userData.firstName || "");
            setLastName(userData.lastName || "");
          }
        } catch (error) {
          console.error("Erreur lors du chargement du profil:", error);
        }
      }
    };
    loadUserProfile();
  }, [user]);

  const alreadyMigrated = (user?.email || '').toLowerCase().endsWith('@orange.mars-marketing.fr');

  // Réinitialiser les valeurs quand l'utilisateur change
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setEmail(user.email || "");
    }
  }, [user]);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleLinkMicrosoft = async () => {
    setLinking(true);
    try {
      const hint = msEmailHint.trim() || user?.email || "";
      const ok = await linkMicrosoft(hint);
      if (ok) {
        showMessage("success", "Compte Microsoft synchronisé avec succès.");
      } else {
        showMessage("error", "Échec de la synchronisation Microsoft.");
      }
    } catch (e:any) {
      showMessage("error", e?.message || "Échec de la synchronisation.");
    } finally {
      setLinking(false);
    }
  };

  const handleMigrateEmail = async () => {
    if (!user?.email) return;
    const localPart = user.email.split('@')[0];
    setMigrating(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Utilisateur non authentifié');
      const resp = await fetch('/api/update-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ localPart })
      });
      const data = await resp.json();
      if (resp.ok && data?.ok) {
        const newEmail = data.newEmail || `${localPart}@orange.mars-marketing.fr`;
        setEmail(newEmail);
        showMessage('success', `Email migré vers ${newEmail}`);
      } else if (resp.ok && data?.skipped) {
        showMessage('success', `Déjà migré: ${data.email}`);
      } else if (resp.status === 412) {
        showMessage('error', 'Provider Microsoft non lié.');
      } else if (resp.status === 409) {
        showMessage('error', 'Nouvel email déjà utilisé.');
      } else if (resp.status === 404) {
        showMessage('error', 'Utilisateur introuvable.');
      } else {
        showMessage('error', data?.error || 'Migration impossible (erreur inconnue).');
      }
    } catch (e:any) {
      const msg = e?.message || 'Erreur migration email';
      showMessage('error', msg);
    } finally {
      setMigrating(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      showMessage("error", "Le prénom et le nom sont requis");
      return;
    }

    setLoading(true);
    try {
      const success = await updateUserProfile(
        firstName.trim(),
        lastName.trim()
      );
      if (success) {
        showMessage("success", "Profil mis à jour avec succès");
        setIsEditingProfile(false);
      } else {
        showMessage("error", "Erreur lors de la mise à jour du profil");
      }
    } catch (error) {
      showMessage("error", "Erreur lors de la mise à jour du profil");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) {
      showMessage("error", "Le nom d'affichage est requis");
      return;
    }

    setLoading(true);
    try {
      const success = await updateUserDisplayName(displayName.trim());
      if (success) {
        showMessage("success", "Nom d'affichage mis à jour avec succès");
        setIsEditingDisplayName(false);
      } else {
        showMessage(
          "error",
          "Erreur lors de la mise à jour du nom d'affichage"
        );
      }
    } catch (error) {
      showMessage("error", "Erreur lors de la mise à jour du nom d'affichage");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!email.trim()) {
      showMessage("error", "L'email est requis");
      return;
    }
    if (email.trim() === user?.email) {
      showMessage(
        "error",
        "La nouvelle adresse email doit être différente de l'actuelle"
      );
      return;
    }
    if (!currentPassword) {
      showMessage(
        "error",
        "Le mot de passe actuel est requis pour changer l'email"
      );
      return;
    }

    setLoading(true);
    try {
      setEmailPending(email.trim()); // Marquer l'email comme en attente de vérification
      const result = await updateUserEmail(email.trim(), currentPassword);
      if (result.success) {
        showMessage(
          "success",
          `Un email de vérification a été envoyé à ${email.trim()}. Veuillez vérifier votre boîte mail et cliquer sur le lien pour confirmer le changement.`
        );
        setIsEditingEmail(false);
        setCurrentPassword("");
        // Garder l'indicateur d'email en attente pendant quelques secondes
        setTimeout(() => setEmailPending(null), 10000); // 10 secondes
      } else {
        setEmailPending(null);
        showMessage(
          "error",
          result.error || "Erreur lors de la mise à jour de l'email"
        );
      }
    } catch (error) {
      setEmailPending(null);
      showMessage("error", "Erreur lors de la mise à jour de l'email");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword) {
      showMessage("error", "Le mot de passe actuel est requis");
      return;
    }
    if (!newPassword) {
      showMessage("error", "Le nouveau mot de passe est requis");
      return;
    }
    if (newPassword.length < 6) {
      showMessage(
        "error",
        "Le nouveau mot de passe doit contenir au moins 6 caractères"
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showMessage("error", "Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    try {
      const result = await updateUserPassword(currentPassword, newPassword);
      if (result.success) {
        showMessage("success", "Mot de passe mis à jour avec succès !");
        setIsEditingPassword(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        showMessage(
          "error",
          result.error || "Erreur lors de la mise à jour du mot de passe"
        );
      }
    } catch (error) {
      showMessage("error", "Erreur lors de la mise à jour du mot de passe");
    } finally {
      setLoading(false);
    }
  };


  const cancelEdit = (
    section: "profile" | "displayName" | "email" | "password"
  ) => {
    switch (section) {
      case "profile":
        setIsEditingProfile(false);
        // Recharger les données originales
        break;
      case "displayName":
        setIsEditingDisplayName(false);
        setDisplayName(user?.displayName || "");
        break;
      case "email":
        setIsEditingEmail(false);
        setEmail(user?.email || "");
        setCurrentPassword("");
        setEmailPending(null);
        break;
      case "password":
        setIsEditingPassword(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        break;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>

      {/* Messages de feedback */}
      {message && (
        <div
          className={`p-4 rounded-md ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Section Profil Personnel */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prénom
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input-field"
                disabled={!isEditingProfile}
                placeholder="Votre prénom"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input-field"
                disabled={!isEditingProfile}
                placeholder="Votre nom"
              />
            </div>
          </div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900"></h2>
            {!isEditingProfile && (
              <button
                onClick={() => setIsEditingProfile(true)}
                className="text-sm text-cactus-600 hover:text-cactus-700 font-medium"
              >
                Modifier
              </button>
            )}
          </div>

          {isEditingProfile && (
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-cactus-600 text-white rounded-md hover:bg-cactus-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              <button
                onClick={() => cancelEdit("profile")}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section Nom d'affichage */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom d'affichage
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-field"
              disabled={!isEditingDisplayName}
              placeholder="Comment vous souhaitez apparaître"
            />
            <p className="text-sm text-gray-500 mt-1">
              Ce nom sera affiché dans l'application et visible par les autres
              utilisateurs.
            </p>
          </div>

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900"></h2>
            {!isEditingDisplayName && (
              <button
                onClick={() => setIsEditingDisplayName(true)}
                className="text-sm text-cactus-600 hover:text-cactus-700 font-medium"
              >
                Modifier
              </button>
            )}
          </div>

          {isEditingDisplayName && (
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSaveDisplayName}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-cactus-600 text-white rounded-md hover:bg-cactus-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              <button
                onClick={() => cancelEdit("displayName")}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section Email */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              disabled={!isEditingEmail}
              placeholder="votre@email.com"
            />
            <div className="flex items-center gap-2 mt-1">
              <div
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                  user?.emailVerified && !emailPending
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {user?.emailVerified && !emailPending ? (
                  <>
                    <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                    Vérifié
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-yellow-600 rounded-full"></div>
                    Non vérifié
                  </>
                )}
              </div>
              {emailPending && (
                <div className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                  Email de vérification envoyé à {emailPending}
                </div>
              )}
              {!user?.emailVerified && !emailPending && (
                <span className="text-xs text-gray-500">
                  Vérifiez votre boîte email pour confirmer votre adresse.
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900"></h2>
            {!isEditingEmail && (
              <button
                onClick={() => setIsEditingEmail(true)}
                className="text-sm text-cactus-600 hover:text-cactus-700 font-medium"
              >
                Modifier
              </button>
            )}
          </div>

          {isEditingEmail && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe actuel
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Votre mot de passe actuel"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Requis pour confirmer le changement d'email pour des raisons de
                sécurité.
              </p>
            </div>
          )}

          {isEditingEmail && (
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSaveEmail}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-cactus-600 text-white rounded-md hover:bg-cactus-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              <button
                onClick={() => cancelEdit("email")}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section Mot de passe */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
        <div className="space-y-4">
          {!isEditingPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                value="••••••••••••"
                className="input-field"
                disabled
                readOnly
              />
              <p className="text-sm text-gray-500 mt-1">
                Cliquez sur "Modifier" pour changer votre mot de passe.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900"></h2>
            {!isEditingPassword && (
              <button
                onClick={() => setIsEditingPassword(true)}
                className="text-sm text-cactus-600 hover:text-cactus-700 font-medium"
              >
                Modifier
              </button>
            )}
          </div>

          {isEditingPassword && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mot de passe actuel
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="Votre mot de passe actuel"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

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
                <p className="text-sm text-gray-500 mt-1">
                  Au moins 6 caractères.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmer le nouveau mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="Confirmez votre nouveau mot de passe"
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
            </>
          )}

          {isEditingPassword && (
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSavePassword}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-cactus-600 text-white rounded-md hover:bg-cactus-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              <button
                onClick={() => cancelEdit("password")}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section Synchronisation Microsoft */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Synchroniser avec Microsoft (@orange)</h2>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Liez votre compte Microsoft d’entreprise pour vous connecter en un clic. Cette opération lie Microsoft à votre compte actuel (même UID), sans créer de doublon.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
          <input
            type="email"
            value={msEmailHint}
            onChange={(e)=> setMsEmailHint(e.target.value)}
            placeholder="prenom.nom@orange.mars-marketing.fr"
            className="input-field"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLinkMicrosoft}
              disabled={linking}
              className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {linking? 'Synchronisation…' : 'Synchroniser mon compte Microsoft'}
            </button>
            <button
              type="button"
              onClick={handleMigrateEmail}
              disabled={migrating || alreadyMigrated}
              className="px-4 py-2 rounded-md bg-cactus-600 text-white hover:bg-cactus-700 disabled:opacity-50"
            >
              {alreadyMigrated ? 'Email déjà migré' : (migrating ? 'Migration…' : 'Migrer email vers @orange')}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          1) Synchronisez Microsoft avec votre email @orange. 2) Cliquez sur "Migrer email" pour remplacer l'adresse @mars par @orange (UID conservé). {alreadyMigrated && '✔ Migration effectuée.'}
        </p>
      </div>

    </div>
  );
};

export default SettingsPage;
