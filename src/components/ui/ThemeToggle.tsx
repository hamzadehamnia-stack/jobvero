'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export default function ThemeToggle() {
  const { theme, mounted, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label={mounted && theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-lg text-gray-500 dark:text-gray-400
        hover:text-gray-900 dark:hover:text-white
        hover:bg-gray-100 dark:hover:bg-gray-800
        transition-colors duration-200"
    >
      {/* Render placeholder until mounted to prevent hydration mismatch.
          The placeholder matches Moon's dimensions so layout doesn't shift. */}
      {!mounted ? (
        <span className="block w-4 h-4" aria-hidden="true" />
      ) : theme === 'dark' ? (
        <Sun size={16} className="text-amber-400" />
      ) : (
        <Moon size={16} />
      )}
    </button>
  );
}
