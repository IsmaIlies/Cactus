import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Eye, EyeOff } from "lucide-react";

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    confirmEmail: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const { register } = useAuth();
  const navigate = useNavigate();
  // Simple online status (connectivity test button removed per request)
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = "Le prénom est requis";
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "Le nom est requis";
    }

    if (!formData.email.trim()) {
      newErrors.email = "L'email est requis";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email invalide";
    }

    if (formData.email !== formData.confirmEmail) {
      newErrors.confirmEmail = "Les emails ne correspondent pas";
    }

    if (!formData.password) {
      newErrors.password = "Le mot de passe est requis";
    } else if (formData.password.length < 6) {
      newErrors.password =
        "Le mot de passe doit contenir au moins 6 caractères";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Les mots de passe ne correspondent pas";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrors({}); // reset

    try {
      const result = await register(formData);
      console.log('register result', result);
        if (result.success) {
    console.log('Inscription réussie, redirection vers dashboard');
    setToast({ type: 'success', message: "Compte créé." });
    navigate("/dashboard");
          return;
      }
      // map server code/message to form errors
      const newErrors: { [key: string]: string } = {};
      const code = result.code;
      const message = result.message;

      if (code === "auth/email-already-exists" || /already-exists/.test(String(code || message || ''))) {
        newErrors.email = "L'email est déjà utilisé.";
      } else if (code === "auth/invalid-email" || /invalid-email/.test(String(code || message || ''))) {
        newErrors.email = "L'email est invalide.";
      } else if (code === "auth/weak-password" || /weak-password/.test(String(code || message || ''))) {
        newErrors.password = "Le mot de passe est trop faible.";
      } else {
        newErrors.form = message || "Une erreur est survenue. Veuillez réessayer.";
      }

      setErrors(newErrors);
      // show toast for the error
      setToast({ type: 'error', message: newErrors.form || Object.values(newErrors)[0] || 'Erreur inscription' });
    } finally {
      setLoading(false);
    }
  };

  // auto-hide toast after 3s
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-cactus-600 to-cactus-800">
      <div className="w-full max-w-md">
        {toast && (
          <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded shadow-lg ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
            {toast.message}
          </div>
        )}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-white mb-2">Cactus</h1>
          <p className="text-cactus-100">Créer votre compte Cactus</p>
        </div>

            <div className="bg-white rounded-lg shadow-lg w-full max-h-[80vh] flex flex-col">
              {/* Conteneur scroll interne (identique login) */}
              <div className="p-6 scroll-beauty scroll-fade flex-1">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span className={isOnline ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                Statut : {isOnline ? 'En ligne' : 'Hors ligne'}
              </span>
            </div>
            {errors.form && (
              <div
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative\"
                role="alert"
              >
                <span className="block sm:inline">{errors.form}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Prénom
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleChange}
                  className={`input-field ${
                    errors.firstName ? "border-red-500" : ""
                  }`}
                  placeholder="Prénom"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.firstName}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Nom
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleChange}
                  className={`input-field ${
                    errors.lastName ? "border-red-500" : ""
                  }`}
                  placeholder="Nom"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className={`input-field ${
                  errors.email ? "border-red-500" : ""
                }`}
                placeholder="votreemail@exemple.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmEmail"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirmer l'email
              </label>
              <input
                id="confirmEmail"
                name="confirmEmail"
                type="email"
                value={formData.confirmEmail}
                onChange={handleChange}
                className={`input-field ${
                  errors.confirmEmail ? "border-red-500" : ""
                }`}
                placeholder="votreemail@exemple.com"
              />
              {errors.confirmEmail && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.confirmEmail}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  className={`input-field pr-10 ${
                    errors.password ? "border-red-500" : ""
                  }`}
                  placeholder="••••••••"
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
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`input-field pr-10 ${
                    errors.confirmPassword ? "border-red-500" : ""
                  }`}
                  placeholder="••••••••"
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
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 flex items-center justify-center"
            >
              {loading ? "Inscription en cours..." : "S'inscrire"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Vous avez déjà un compte ?{" "}
              <Link
                to="/login"
                className="font-medium text-cactus-600 hover:text-cactus-500"
              >
                Se connecter
              </Link>
            </p>
          </div>
              </div>{/* fin scroll */}
            </div>
      </div>
    </div>
  );
};

export default RegisterPage;
