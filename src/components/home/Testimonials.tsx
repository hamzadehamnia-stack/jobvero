'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';
import { Star, Quote } from 'lucide-react';

const TESTIMONIALS = [
  {
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    name: 'Marie Dupont',
    role: 'Infirmière',
    city: 'Paris',
    quote:
      "Jobvero m'a aidée à trouver un poste en moins de 2 semaines. L'IA a parfaitement ciblé les offres correspondant à mon profil.",
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

function TestimonialCard({ t }: { t: (typeof TESTIMONIALS)[number] }) {
  return (
    <div className="flex-shrink-0 w-[300px] sm:w-[340px] flex flex-col gap-5 p-6 rounded-2xl border border-subtle bg-surface hover:bg-elevated hover:border-strong transition-colors">
      <div className="flex items-center justify-between">
        <Quote size={18} className="text-fg-subtle" strokeWidth={1.5} />
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
          ))}
        </div>
      </div>

      <p className="text-fg text-[14px] leading-relaxed">
        &ldquo;{t.quote}&rdquo;
      </p>

      <div className="flex items-center gap-3 mt-auto pt-4 border-t border-subtle">
        <div className="relative w-10 h-10 flex-shrink-0">
          <Image
            src={t.photo}
            alt={t.name}
            fill
            className="rounded-full object-cover"
            sizes="40px"
          />
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-fg leading-tight truncate">
            {t.name}
          </p>
          <p className="text-[11.5px] text-fg-subtle mt-0.5 truncate">
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
    <section className="relative py-24 sm:py-32 scroll-mt-16 overflow-hidden">
      <div className="px-4 sm:px-6 max-w-3xl mx-auto text-center reveal-on-scroll">
        <Badge variant="default" className="mb-5">
          {t('sectionBadge')}
        </Badge>
        <h2 className="font-display text-fg text-3xl sm:text-5xl tracking-tighter leading-[1.1]">
          {t('headline')}
        </h2>
        <p className="mt-5 text-fg-muted text-base sm:text-lg leading-relaxed">
          {t('subheadline')}
        </p>
      </div>

      {/* Desktop: 4-column grid */}
      <div className="hidden lg:grid lg:grid-cols-4 gap-4 max-w-7xl mx-auto px-4 sm:px-6 mt-16">
        {TESTIMONIALS.map((item, i) => (
          <TestimonialCard key={i} t={item} />
        ))}
      </div>

      {/* Mobile: marquee */}
      <div className="lg:hidden relative mt-14">
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-r from-canvas to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-l from-canvas to-transparent" />
        <div className="flex animate-marquee gap-4 w-max px-4">
          {[...TESTIMONIALS, ...TESTIMONIALS].map((item, i) => (
            <TestimonialCard key={i} t={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
