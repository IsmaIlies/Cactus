import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import AuthActionPage from "./pages/AuthActionPage";
import TeleSalesAssistantTestPage from "./pages/TeleSalesAssistantTestPage";
import TeleSalesAssistant from "./components/TeleSalesAssistant";
import AssistantTestPage from "./pages/AssistantTestPage";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import DiagnosticPage from "./pages/DiagnosticPage";
import ChecklistReminderPopup from "./components/ChecklistReminderPopup";
import GameNotification from "./components/GameNotification";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPasswordPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/diagnostic" element={<DiagnosticPage />} />
        <Route path="/assistant-test" element={<TeleSalesAssistantTestPage />} />
        <Route path="/assistant-demo" element={
          <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900">
            <TeleSalesAssistant />
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center text-white max-w-lg">
                <h1 className="text-3xl font-bold mb-4">🎯 Assistant Canal+ Live</h1>
                <p className="text-lg mb-6">Mode démonstration immersif</p>
                <p className="text-sm opacity-80">Cliquez sur l'assistant en bas à droite</p>
              </div>
            </div>
          </div>
        } />
        <Route path="/assistant-live" element={<AssistantTestPage />} />
        <Route path="/auth/action" element={<AuthActionPage />} />
        <Route
          path="/dashboard/*"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
      {/* Popup global de rappel checklist */}
      <ChecklistReminderPopup />
      {/* Notifications globales pour Mr. White */}
      <GameNotification />
    </AuthProvider>
  );
}

export default App;
