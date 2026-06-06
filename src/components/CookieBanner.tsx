'use client';

import { useEffect } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';
import { useLocale, useTranslations } from 'next-intl';

export default function CookieBanner() {
  const locale = useLocale();
  const t = useTranslations('cookies');

  useEffect(() => {
    CookieConsent.run({
      categories: {
        necessary: {
          enabled: true,
          readOnly: true,
        },
        functional: {
          enabled: false,
          readOnly: false,
        },
        analytics: {
          enabled: false,
          readOnly: false,
        },
        marketing: {
          enabled: false,
          readOnly: false,
        },
      },

      guiOptions: {
        consentModal: {
          layout: 'bar inline',
          position: 'bottom',
          equalWeightButtons: false,
          flipButtons: false,
        },
        preferencesModal: {
          layout: 'box',
          position: 'right',
          equalWeightButtons: true,
          flipButtons: false,
        },
      },

      language: {
        default: locale,
        autoDetect: 'browser',
        translations: {
          [locale]: {
            consentModal: {
              title: t('banner.title'),
              description: t('banner.description'),
              acceptAllBtn: t('banner.acceptAll'),
              acceptNecessaryBtn: t('banner.rejectAll'),
              showPreferencesBtn: t('banner.customize'),
            },
            preferencesModal: {
              title: t('preferences.title'),
              acceptAllBtn: t('preferences.acceptAll'),
              acceptNecessaryBtn: t('preferences.rejectAll'),
              savePreferencesBtn: t('preferences.savePreferences'),
              closeIconLabel: t('preferences.close'),
              sections: [
                {
                  title: t('categories.necessary.title'),
                  description: t('categories.necessary.description'),
                  linkedCategory: 'necessary',
                },
                {
                  title: t('categories.functional.title'),
                  description: t('categories.functional.description'),
                  linkedCategory: 'functional',
                },
                {
                  title: t('categories.analytics.title'),
                  description: t('categories.analytics.description'),
                  linkedCategory: 'analytics',
                },
                {
                  title: t('categories.marketing.title'),
                  description: t('categories.marketing.description'),
                  linkedCategory: 'marketing',
                },
              ],
            },
          },
        },
      },
    });
  }, [locale, t]);

  return null;
}
