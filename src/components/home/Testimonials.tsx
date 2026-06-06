'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';
import { Star } from 'lucide-react';

const TESTIMONIALS = [
  {
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    name: 'Marie Dupont',
    role: 'Infirmière',
    city: 'Paris',
    quote:
      "Jobvero m'a aidée à trouver un poste en moins de 2 semaines. L'IA a parfaitement ciblé les offres correspondant à mon profil. Je recommande à tous les professionnels de santé !",
  },
  {
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    name: 'Carlos Rodriguez',
    role: 'Ingénieur Logiciel',
    city: 'Madrid',
    quote:
      'Increíble herramienta. En una semana tenía tres entrevistas programadas. La IA de Jobvero entendió perfectamente lo que buscaba.',
  },
  {
    photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=100',
    name: 'Ana Silva',
    role: 'Comptable',
    city: 'Lisbonne',
    quote:
      'O Jobvero transformou a minha busca de emprego. Encontrei o emprego dos sonhos em menos de um mês. Fantástico!',
  },
  {
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
    name: 'James Martin',
    role: 'Commercial',
    city: 'Londres',
    quote:
      "Simply the best job search tool I've used. The AI matching is incredibly accurate and the cover letter generator saved me hours.",
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5 mb-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
      ))}
    </div>
  );
}

function TestimonialCard({ t }: { t: (typeof TESTIMONIALS)[number] }) {
  return (
    <div
      className="flex-shrink-0 w-72 sm:w-80 bg-white dark:bg-gray-900
        border border-gray-200 dark:border-gray-800
        rounded-2xl p-6 shadow-sm dark:shadow-none
        hover:border-violet-300 dark:hover:border-violet-800/50
        hover:shadow-md transition-all duration-300"
    >
      <Stars />

      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-5">
        &ldquo;{t.quote}&rdquo;
      </p>

      <div className="flex items-center gap-3">
        <div className="relative w-[52px] h-[52px] flex-shrink-0">
          <Image
            src={t.photo}
            alt={t.name}
            fill
            className="rounded-full object-cover"
            sizes="52px"
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
            {t.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {t.role} · {t.city}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Testimonials() {
  const t = useTranslations('testimonials');

  return (
    <section className="py-24 scroll-mt-16 overflow-hidden">
      {/* Header */}
      <div className="px-4 text-center mb-14 reveal-on-scroll">
        <Badge className="mb-4">{t('sectionBadge')}</Badge>
        <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-4">
          {t('headline')}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto">
          {t('subheadline')}
        </p>
      </div>

      {/* ── Desktop: 4-column grid ── */}
      <div className="hidden lg:grid lg:grid-cols-4 gap-6 max-w-7xl mx-auto px-4">
        {TESTIMONIALS.map((item, i) => (
          <TestimonialCard key={i} t={item} />
        ))}
      </div>

      {/* ── Mobile / tablet: infinite marquee ── */}
      <div className="lg:hidden relative">
        {/* Fade edges */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 z-10
          bg-gradient-to-r from-white dark:from-gray-950 to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10
          bg-gradient-to-l from-white dark:from-gray-950 to-transparent" />

        {/* Track — doubled for seamless loop */}
        <div className="flex animate-marquee gap-5 w-max px-4">
          {[...TESTIMONIALS, ...TESTIMONIALS].map((item, i) => (
            <TestimonialCard key={i} t={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
