import { useState, useEffect, useCallback } from 'react';
import { Shell } from './components/layout/Shell';
import { ToastContainer } from './components/ui/Toast';
import { Dashboard } from './pages/Dashboard';
import { Tenants } from './pages/Tenants';
import { Jobs } from './pages/Jobs';
import { Comprobantes } from './pages/Comprobantes';
import { useToast } from './hooks/useToast';
import { api, MOCK_MODE } from './lib/api';
import type { Page } from './components/layout/Sidebar';

interface NavParams {
  tenant_id?: string;
  action?: string;
}

export default function App() {
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
    setPage(p);
    setNavParams(params || {});
  }, []);

  return (
    <>
      {MOCK_MODE && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-xs font-semibold text-center py-1 tracking-wide">
          MODO DEMO — datos de ejemplo en memoria, no conectado al backend
        </div>
      )}
      <Shell current={page} onNavigate={navigate} apiStatus={apiStatus} mockMode={MOCK_MODE}>
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
          <Jobs toastError={error} />
        )}
        {page === 'comprobantes' && (
          <Comprobantes toastError={error} />
        )}
      </Shell>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </>
  );
}
