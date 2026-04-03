import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';
import { Star } from 'lucide-react';

type TestimonialItem = {
  quote: string;
  name: string;
  role: string;
  tag: string;
};

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const colors = [
    'from-violet-600 to-purple-700',
    'from-cyan-600 to-teal-700',
    'from-pink-600 to-rose-700',
    'from-amber-500 to-orange-600',
    'from-emerald-500 to-green-700',
    'from-blue-600 to-indigo-700',
  ];

  const colorIndex = name.charCodeAt(0) % colors.length;

  return (
    <div
      className={`w-10 h-10 rounded-full bg-gradient-to-br ${colors[colorIndex]} flex items-center justify-center text-sm font-bold text-white flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

export default function Testimonials() {
  const t = useTranslations('testimonials');
  const items = t.raw('items') as TestimonialItem[];

  return (
    <section className="py-24 px-4 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 reveal-on-scroll">
          <Badge className="mb-4">{t('sectionBadge')}</Badge>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">{t('headline')}</h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">{t('subheadline')}</p>
        </div>

        {/* Masonry-style grid */}
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
          {items.map((item, i) => (
            <div
              key={i}
              className="reveal-on-scroll break-inside-avoid bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-violet-800/50 transition-all duration-300"
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} size={14} className="text-amber-400 fill-amber-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-gray-300 text-sm leading-relaxed mb-5">&ldquo;{item.quote}&rdquo;</p>

              {/* Author row */}
              <div className="flex items-center gap-3">
                <Avatar name={item.name} />
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold leading-none">{item.name}</p>
                  <p className="text-gray-500 text-xs mt-1">{item.role}</p>
                </div>
                <span className="ml-auto text-xs font-medium text-violet-400 bg-violet-950 border border-violet-800/60 px-2 py-1 rounded-full whitespace-nowrap">
                  {item.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
