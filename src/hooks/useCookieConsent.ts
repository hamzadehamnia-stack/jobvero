'use client';

import { useEffect, useState } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';

type Category = 'necessary' | 'functional' | 'analytics' | 'marketing';

export function useCookieConsent(category: Category) {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const checkAccepted = () => {
      try {
        setAccepted(CookieConsent.acceptedCategory(category));
      } catch {
        setAccepted(false);
      }
    };

    checkAccepted();

    const handleChange = () => checkAccepted();
    window.addEventListener('cc:onChange', handleChange);
    return () => window.removeEventListener('cc:onChange', handleChange);
  }, [category]);

  return accepted;
}
