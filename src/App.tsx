import { useState, useEffect, useCallback } from 'react';
import { Shell } from './components/layout/Shell';
import { ToastContainer } from './components/ui/Toast';
import { Dashboard } from './pages/Dashboard';
import { Tenants } from './pages/Tenants';
import { Jobs } from './pages/Jobs';
import { Comprobantes } from './pages/Comprobantes';
import { Users } from './pages/Users';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useToast } from './hooks/useToast';
import { api, MOCK_MODE } from './lib/api';
import { PageLoader } from './components/ui/Spinner';
import type { Page } from './components/layout/Sidebar';

interface NavParams {
  tenant_id?: string;
  action?: string;
}

function AuthenticatedApp() {
  const { user, isAdmin, logout } = useAuth();
  const [page, setPage] = useState<Page>('dashboard');
  const [navParams, setNavParams] = useState<NavParams>({});
  const [apiStatus, setApiStatus] = useState<'ok' | 'error' | 'checking'>('checking');
  const { toasts, remove, success, error } = useToast();

  const checkApi = useCallback(async () => {
    if (MOCK_MODE) {
      setApiStatus('ok');
      return;
    }
    try {
      await api.health();
      setApiStatus('ok');
    } catch {
      setApiStatus('error');
    }
  }, []);

  useEffect(() => {
    checkApi();
    const interval = setInterval(checkApi, 60000);
    return () => clearInterval(interval);
  }, [checkApi]);

  const navigate = useCallback((p: Page, params?: Record<string, string>) => {
    // Prevent non-admin from accessing admin pages
    if (!isAdmin && p === 'users') {
      p = 'dashboard';
    }
    setPage(p);
    setNavParams(params || {});
  }, [isAdmin]);

  return (
    <>
      {MOCK_MODE && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-xs font-semibold text-center py-1 tracking-wide">
          MODO DEMO — datos de ejemplo en memoria, no conectado al backend
        </div>
      )}
      <Shell
        current={page}
        onNavigate={navigate}
        apiStatus={apiStatus}
        mockMode={MOCK_MODE}
        user={user}
        onLogout={logout}
      >
        {page === 'dashboard' && (
          <Dashboard onNavigate={navigate} />
        )}
        {page === 'tenants' && (
          <Tenants
            onNavigate={navigate}
            toastSuccess={success}
            toastError={error}
            initialTenantId={navParams.tenant_id}
            initialAction={navParams.action}
          />
        )}
        {page === 'jobs' && (
          <Jobs toastError={error} toastSuccess={success} />
        )}
        {page === 'comprobantes' && (
          <Comprobantes toastError={error} />
        )}
        {page === 'users' && isAdmin && (
          <Users toastSuccess={success} toastError={error} />
        )}
      </Shell>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

function AppRouter() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <PageLoader />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <AuthenticatedApp />;
}
