import { cn } from '@/lib/utils';

type Variant = 'default' | 'accent' | 'success' | 'warning' | 'danger';

const variants: Record<Variant, string> = {
  default: 'bg-surface text-fg-muted border-subtle',
  accent:  'bg-accent-soft text-accent border-accent/20',
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  danger:  'bg-danger/10 text-danger border-danger/20',
};

export default function Badge({
  children,
  className,
  variant = 'accent',
}: {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium border',
        'tracking-tight',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
