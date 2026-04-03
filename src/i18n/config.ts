import { routing } from './routing';

export const locales = routing.locales;
export type Locale = (typeof routing.locales)[number];
export const defaultLocale = routing.defaultLocale;
