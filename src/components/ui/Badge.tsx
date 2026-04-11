import { cn } from '../../lib/utils';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'orange';

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  danger: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  neutral: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400',
  orange: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const dotClasses: Record<Variant, string> = {
  default: 'bg-zinc-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  neutral: 'bg-zinc-400',
  orange: 'bg-orange-500',
};

export function Badge({ variant = 'default', children, dot, className }: BadgeProps) {
  return (
    <span className={cn('badge', variantClasses[variant], className)}>
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClasses[variant])} />
      )}
      {children}
    </span>
  );
}
