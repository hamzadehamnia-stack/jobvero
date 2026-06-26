import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'accent-soft';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  href?: string;
}

const base =
  'group relative inline-flex items-center justify-center gap-2 font-medium rounded-lg ' +
  'transition-[background,border-color,color,box-shadow,transform] duration-200 ease-out-expo ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none ' +
  'active:scale-[0.98] select-none whitespace-nowrap';

const variants: Record<Variant, string> = {
  primary:
    'bg-fg text-canvas hover:bg-fg/90 shadow-soft',
  secondary:
    'bg-surface text-fg border border-subtle hover:border-strong hover:bg-elevated',
  ghost:
    'text-fg-muted hover:text-fg hover:bg-surface',
  outline:
    'bg-transparent text-fg border border-strong hover:bg-surface',
  'accent-soft':
    'bg-accent-soft text-accent hover:bg-accent/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

const getClasses = (variant: Variant, size: Size, className?: string) =>
  cn(base, variants[variant], sizes[size], className);

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  href,
  ...props
}: ButtonProps) {
  if (href) {
    return (
      <Link href={href} className={getClasses(variant, size, className)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={getClasses(variant, size, className)} {...props}>
      {children}
    </button>
  );
}
