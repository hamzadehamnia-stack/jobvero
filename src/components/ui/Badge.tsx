import { cn } from '@/lib/utils';

export default function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
        'bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-800',
        className
      )}
    >
      {children}
    </span>
  );
}
