import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();

  return (
    <footer className="border-t border-gray-800 bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {/* Brand */}
        <div>
          <span className="text-xl font-bold gradient-text">Jobvero</span>
          <p className="mt-3 text-sm text-gray-500 max-w-xs">{t('tagline')}</p>
        </div>

        {/* Product */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            {t('product')}
          </h4>
          <ul className="space-y-2">
            <li>
              <Link
                href={`/${locale}/pricing`}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {t('links.pricing')}
              </Link>
            </li>
            <li>
              <Link
                href={`/${locale}`}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {t('links.features')}
              </Link>
            </li>
          </ul>
        </div>

        {/* Company */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            {t('company')}
          </h4>
          <ul className="space-y-2">
            <li>
              <span className="text-sm text-gray-600">{t('links.about')}</span>
            </li>
            <li>
              <span className="text-sm text-gray-600">{t('links.blog')}</span>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            {t('legal')}
          </h4>
          <ul className="space-y-2">
            <li>
              <Link
                href={`/${locale}/legal`}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {t('links.legalMentions')}
              </Link>
            </li>
            <li>
              <span className="text-sm text-gray-600">{t('links.privacy')}</span>
            </li>
            <li>
              <span className="text-sm text-gray-600">{t('links.terms')}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-gray-800 px-4 sm:px-6 py-5 max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
        <p className="text-xs text-gray-600">{t('copyright')}</p>
        <p className="text-xs text-gray-700">getjobvero.com</p>
      </div>
    </footer>
  );
}
