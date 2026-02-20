import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
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
import OrchestrationPage from './pages/OrchestrationPage';
import ExportCenterPage from './pages/ExportCenterPage';

export default function App() {
  const auth = useAuthProvider();

  return (
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
            <Route path="/orchestration" element={<OrchestrationPage />} />
            <Route path="/export" element={<RequireAdmin><ExportCenterPage /></RequireAdmin>} />
            <Route path="/tenants" element={<RequireSuperadmin><TenantsPage /></RequireSuperadmin>} />
            <Route path="/users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
