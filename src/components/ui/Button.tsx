import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
}

const getClasses = (
  variant: ButtonProps['variant'] = 'primary',
  size: ButtonProps['size'] = 'md',
  className?: string
) =>
  cn(
    'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-gray-950',
    {
      'bg-gradient-to-r from-violet-600 to-violet-500 text-white hover:from-violet-500 hover:to-violet-400 shadow-lg shadow-violet-900/30':
        variant === 'primary',
      'bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 hover:border-gray-600':
        variant === 'secondary',
      'text-gray-400 hover:text-white': variant === 'ghost',
    },
    {
      'px-3 py-1.5 text-sm': size === 'sm',
      'px-5 py-2.5 text-sm': size === 'md',
      'px-7 py-3.5 text-base': size === 'lg',
    },
    className
  );

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
