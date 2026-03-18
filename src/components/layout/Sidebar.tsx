import {
  LayoutDashboard,
  Building2,
  Briefcase,
  FileText,
  ExternalLink,
  ChevronRight,
  FlaskConical,
  Users,
  LogOut,
  Shield,
  User,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AuthUser } from '../../types';

export type Page = 'dashboard' | 'tenants' | 'jobs' | 'comprobantes' | 'users';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'tenants', label: 'Empresas', icon: <Building2 className="w-4 h-4" />, adminOnly: true },
  { id: 'jobs', label: 'Jobs', icon: <Briefcase className="w-4 h-4" /> },
  { id: 'comprobantes', label: 'Comprobantes', icon: <FileText className="w-4 h-4" /> },
  { id: 'users', label: 'Usuarios', icon: <Users className="w-4 h-4" />, adminOnly: true },
];

interface SidebarProps {
  current: Page;
  onNavigate: (page: Page) => void;
  apiStatus: 'ok' | 'error' | 'checking';
  mockMode?: boolean;
  user?: AuthUser | null;
  onLogout?: () => void;
}

export function Sidebar({ current, onNavigate, apiStatus, mockMode, user, onLogout }: SidebarProps) {
  const isAdmin = user?.rol === 'ADMIN';
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className="w-60 flex-shrink-0 h-screen sticky top-0 flex flex-col bg-white border-r border-zinc-200">
      <div className="px-5 pt-6 pb-4 border-b border-zinc-100">
        <div>
          <p className="text-sm font-semibold text-zinc-900 leading-none">Kmelot</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">DNIT Comprobantes</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'w-full text-left',
                current === item.id ? 'sidebar-item-active' : 'sidebar-item-inactive'
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {current === item.id && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-zinc-100">
          <p className="px-3 mb-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
            Recursos
          </p>
          <a
            href={`${(import.meta.env.VITE_API_URL as string) || 'http://localhost:4000'}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-item-inactive w-full text-left flex"
          >
            <ExternalLink className="w-4 h-4" />
            <span>API Docs</span>
          </a>
        </div>
      </nav>

      <div className="px-4 py-4 border-t border-zinc-100 space-y-3">
        {user && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
              {isAdmin ? (
                <Shield className="w-3.5 h-3.5 text-zinc-600" />
              ) : (
                <User className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-700 truncate">{user.nombre}</p>
              <p className="text-[10px] text-zinc-400">{isAdmin ? 'Administrador' : 'Usuario'}</p>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {mockMode ? (
          <div className="flex items-center gap-2">
            <FlaskConical className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-xs text-amber-600 font-medium">Modo Demo</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                apiStatus === 'ok'
                  ? 'bg-emerald-500'
                  : apiStatus === 'error'
                  ? 'bg-rose-500'
                  : 'bg-amber-400 animate-pulse'
              )}
            />
            <span className="text-xs text-zinc-500">
              {apiStatus === 'ok'
                ? 'API conectada'
                : apiStatus === 'error'
                ? 'API desconectada'
                : 'Verificando...'}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
