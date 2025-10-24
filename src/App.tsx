import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage"; // unified dashboard component
// Regional dashboard pages unified into single DashboardPage with region scoping.
import TeamChatPage from './pages/TeamChatPage';
import AuthActionPage from "./pages/AuthActionPage";
import TeleSalesAssistantTestPage from "./pages/TeleSalesAssistantTestPage";
import TeleSalesAssistant from "./components/TeleSalesAssistant";
import AssistantTestPage from "./pages/AssistantTestPage";
import { AuthProvider } from "./contexts/AuthContext";
import { RegionProvider } from './contexts/RegionContext';
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import DiagnosticPage from "./pages/DiagnosticPage";
import ChecklistReminderPopup from "./components/ChecklistReminderPopup";
import GameNotification from "./components/GameNotification";
import ELearningPage from "./pages/ELearningPage";
import AdminProgrammePdfUploader from "./components/AdminProgrammePdfUploader";
import AdminLoginPage from "./pages/AdminLoginPage";
import LeadsLayout from "./leads/LeadsLayout";
import LeadsDashboardPage from "./leads/pages/LeadsDashboardPage";
import SalesEntry from "./leads/pages/SalesEntry";
import Checklist from "./pages/ChecklistPage";
import LeadsChecklistPage from "./leads/pages/LeadsChecklistPage";
import ChecklistArchivePage from "./pages/ChecklistArchivePage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import SupervisorLayout from "./supervisor/SupervisorLayout";
import SupervisorDashboard from "./supervisor/SupervisorDashboard";
import SupervisorSales from "./supervisor/SupervisorSales";
import SupervisorChecklist from "./supervisor/SupervisorChecklist";
import SupervisorPresencePage from "./supervisor/SupervisorPresencePage";
import SupervisorArchives from "./supervisor/SupervisorArchives";
import SupervisorImport from "./supervisor/SupervisorImport";
import SupervisorLeadsPage from "./pages/SupervisorLeadsPage";
import SupervisorLeadsDashboard2 from "./pages/SupervisorLeadsDashboard2";
import SupervisorLeadsAnalysePage from "./pages/SupervisorLeadsAnalysePage";
import SupervisorLeadsPlusPage from "./pages/SupervisorLeadsPlusPage";
import SupervisorLeadsExportPage from "./pages/SupervisorLeadsExportPage";
import SupervisorLeadsEcoutesPage from "./pages/SupervisorLeadsEcoutesPage";

function App() {
  return (
    <AuthProvider>
      <RegionProvider>
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
        <Route path="/diagnostic" element={<DiagnosticPage />} />
        <Route path="/checklist" element={<Checklist />} />
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
  <Route path="/checklist-archive" element={<ChecklistArchivePage />} />
        <Route path="/auth/action" element={<AuthActionPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        {/* Supervisor dashboards (temporary access via login whitelist) */}
        <Route path="/dashboard/superviseur/:area/*" element={<ProtectedRoute><SupervisorLayout /></ProtectedRoute>}>
          <Route index element={<SupervisorDashboard />} />
          <Route path="presence" element={<SupervisorPresencePage />} />
          <Route path="ventes" element={<SupervisorSales />} />
          <Route path="import" element={<SupervisorImport />} />
          <Route path="dashboard2" element={<SupervisorLeadsDashboard2 />} />
          <Route path="leads-plus" element={<SupervisorLeadsPlusPage />} />
          <Route path="analyse" element={<SupervisorLeadsAnalysePage />} />
          <Route path="ecoutes" element={<SupervisorLeadsEcoutesPage />} />
          <Route path="export" element={<SupervisorLeadsExportPage />} />
          <Route path="checklist" element={<SupervisorChecklist />} />
          <Route path="archives" element={<SupervisorArchives />} />
          {/* New nested page: Supervisor LEADS page (dashboard + CSV import) */}
          <Route path="leads-supervision" element={<SupervisorLeadsPage />} />
        </Route>
        <Route
          path="/leads/*"
          element={
            <ProtectedRoute>
              <LeadsLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<LeadsDashboardPage />} />
          <Route path="sales" element={<SalesEntry />} />
          <Route path="checklist" element={<LeadsChecklistPage />} />
        </Route>
        {/* Supervisor LEADS page is available inside the supervisor layout (nested route) */}
        <Route
          path="/admin/programme"
          element={
            <ProtectedRoute>
              <AdminProgrammePdfUploader />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/teamchat"
          element={
            <ProtectedRoute>
              <TeamChatPage />
            </ProtectedRoute>
          }
        />
  {/* Route paramétrée régionale et fallback */}
        <Route
          path="/dashboard/:region/teamchat"
          element={
            <ProtectedRoute>
              <TeamChatPage />
            </ProtectedRoute>
          }
        />  <Route path="/dashboard/:region/*" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
  <Route path="/dashboard" element={<Navigate to="/dashboard/fr" replace />} />
        <Route
          path="/elearning"
          element={<ELearningPage />}
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
      {/* Popup global de rappel checklist */}
      <ChecklistReminderPopup />
      {/* Notifications globales pour Mr. White */}
      <GameNotification />
      </RegionProvider>
    </AuthProvider>
  );
}

export default App;
