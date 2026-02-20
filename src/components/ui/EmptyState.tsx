import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('empty-state', className)}>
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4 text-zinc-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-zinc-700">{title}</p>
      {description && <p className="text-sm text-zinc-400 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
