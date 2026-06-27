import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import LoginPage from '../pages/LoginPage';
import SignupPage from '../pages/SignupPage';
import OverviewPage from '../pages/OverviewPage';
import DunningPage from '../pages/DunningPage';
import WebhooksPage from '../pages/WebhooksPage';
import InvoicesPage from '../pages/InvoicesPage';
import SaveFlowPage from '../pages/SaveFlowPage';
import AccountingPage from '../pages/AccountingPage';
import DisputesPage from '../pages/DisputesPage';
import SettingsPage from '../pages/SettingsPage';
import ReportingPage from '../pages/ReportingPage';
import DemoPage from '../pages/DemoPage';
import LoadingSpinner from '../components/ui/LoadingSpinner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <SignupPage />
          </PublicRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="dunning" element={<DunningPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="save-flow" element={<SaveFlowPage />} />
        <Route path="accounting" element={<AccountingPage />} />
        <Route path="disputes" element={<DisputesPage />} />
        <Route path="reporting" element={<ReportingPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/demo" element={<DemoPage />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
