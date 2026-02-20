import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Toast, ToastType } from '../../hooks/useToast';

const config: Record<ToastType, { icon: React.ReactNode; className: string }> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />,
    className: 'bg-white border-zinc-200 text-zinc-900',
  },
  error: {
    icon: <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />,
    className: 'bg-white border-zinc-200 text-zinc-900',
  },
  info: {
    icon: <Info className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" />,
    className: 'bg-white border-zinc-200 text-zinc-900',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />,
    className: 'bg-white border-zinc-200 text-zinc-900',
  },
};

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const { icon, className } = config[toast.type];
  return (
    <div className={cn('toast-base', className)}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-zinc-500 mt-0.5">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-zinc-400 hover:text-zinc-600 transition-colors flex-shrink-0 mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}
