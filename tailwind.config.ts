import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas:   'hsl(var(--canvas) / <alpha-value>)',
        surface:  'hsl(var(--surface) / <alpha-value>)',
        elevated: 'hsl(var(--elevated) / <alpha-value>)',

        fg: {
          DEFAULT: 'hsl(var(--fg) / <alpha-value>)',
          muted:   'hsl(var(--fg-muted) / <alpha-value>)',
          subtle:  'hsl(var(--fg-subtle) / <alpha-value>)',
        },

        subtle: 'hsl(var(--border-subtle) / <alpha-value>)',
        strong: 'hsl(var(--border-strong) / <alpha-value>)',

        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          hover:   'hsl(var(--accent-hover) / <alpha-value>)',
          fg:      'hsl(var(--accent-fg) / <alpha-value>)',
          soft:    'hsl(var(--accent) / 0.12)',
        },

        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        danger:  'hsl(var(--danger) / <alpha-value>)',

        brand: {
          violet: '#7c3aed',
          cyan:   '#06b6d4',
          dark:   '#0a0a0f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter:  '-0.025em',
      },
      borderRadius: {
        sm:    '6px',
        md:    '8px',
        lg:    '10px',
        xl:    '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        subtle:      '0 1px 2px 0 hsl(0 0% 0% / 0.04)',
        soft:        '0 4px 16px -4px hsl(0 0% 0% / 0.06)',
        elevated:    '0 12px 40px -8px hsl(0 0% 0% / 0.12)',
        'glow-accent':
          '0 0 0 1px hsl(var(--accent) / 0.25), 0 12px 40px -8px hsl(var(--accent) / 0.45)',
      },
      backgroundImage: {
        'hero-glow':
          'radial-gradient(ellipse 80% 60% at 50% -10%, hsl(var(--accent) / 0.22) 0%, transparent 70%)',
        'card-gradient':
          'linear-gradient(135deg, hsl(var(--accent) / 0.10) 0%, transparent 60%)',
        'grid-pattern':
          'linear-gradient(hsl(var(--fg) / 0.05) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--fg) / 0.05) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '40px 40px',
      },
      animation: {
        'fade-up':    'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'marquee':    'marquee 32s linear infinite',
        'reveal':     'reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'shimmer':    'shimmer 2.5s linear infinite',
        'float':      'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%':      { opacity: '0.7' },
        },
        marquee: {
          '0%':   { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        reveal: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
