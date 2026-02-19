import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireSuperadmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isSuperadmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, activeTenantRole } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isSuperadmin && activeTenantRole !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
