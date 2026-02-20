import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { I18nContext, useI18nProvider } from './i18n';
import ProtectedRoute, { RequireSuperadmin, RequireAdmin } from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ConnectionsPage from './pages/ConnectionsPage';
import TokensPage from './pages/TokensPage';
import LogsPage from './pages/LogsPage';
import ExplorerPage from './pages/ExplorerPage';
import TenantsPage from './pages/TenantsPage';
import UsersPage from './pages/UsersPage';
import RegistryPage from './pages/RegistryPage';
import RegistryDetailPage from './pages/RegistryDetailPage';
import ExportCenterPage from './pages/ExportCenterPage';
import AgentEmulatorPage from './pages/AgentEmulatorPage';

export default function App() {
  const auth = useAuthProvider();
  const i18n = useI18nProvider();

  return (
    <I18nContext.Provider value={i18n}>
    <AuthContext.Provider value={auth}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={auth.user ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/connections" element={<ConnectionsPage />} />
            <Route path="/tokens" element={<TokensPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="/registry" element={<RegistryPage />} />
            <Route path="/registry/:id" element={<RegistryDetailPage />} />
            <Route path="/emulator" element={<AgentEmulatorPage />} />
            <Route path="/export" element={<RequireAdmin><ExportCenterPage /></RequireAdmin>} />
            <Route path="/tenants" element={<RequireSuperadmin><TenantsPage /></RequireSuperadmin>} />
            <Route path="/users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
    </I18nContext.Provider>
  );
}
