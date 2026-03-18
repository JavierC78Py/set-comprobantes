import { Sidebar, type Page } from './Sidebar';
import type { AuthUser } from '../../types';

interface ShellProps {
  current: Page;
  onNavigate: (page: Page) => void;
  apiStatus: 'ok' | 'error' | 'checking';
  mockMode?: boolean;
  user?: AuthUser | null;
  onLogout?: () => void;
  children: React.ReactNode;
}

export function Shell({ current, onNavigate, apiStatus, mockMode, user, onLogout, children }: ShellProps) {
  return (
    <div className={`flex min-h-screen bg-zinc-50 ${mockMode ? 'pt-6' : ''}`}>
      <Sidebar
        current={current}
        onNavigate={onNavigate}
        apiStatus={apiStatus}
        mockMode={mockMode}
        user={user}
        onLogout={onLogout}
      />
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-7xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
