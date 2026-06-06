export type Engine = 'france-travail' | 'reed' | 'adzuna' | 'jsearch';

export interface EngineConfig {
  primary:  Engine;
  fallback: Engine;
}

export const ENGINE_LABELS: Record<Engine, string> = {
  'france-travail': 'France Travail',
  'reed':           'Reed',
  'adzuna':         'Adzuna',
  'jsearch':        'JSearch',
};

/**
 * Returns the primary and fallback search engine for a given ISO country code.
 * - fr           → France Travail  (fallback: Adzuna)
 * - us           → JSearch         (fallback: Adzuna)
 * - gb / ie      → Adzuna          (fallback: JSearch)  — Reed suspended
 * - everything else → Adzuna       (fallback: JSearch)
 */
export function getSearchEngine(countryCode: string): EngineConfig {
  switch (countryCode) {
    case 'fr':
      return { primary: 'france-travail', fallback: 'adzuna' };
    case 'us':
      return { primary: 'jsearch', fallback: 'adzuna' };
    case 'gb':
    case 'ie':
      return { primary: 'adzuna', fallback: 'jsearch' };
    default:
      return { primary: 'adzuna', fallback: 'jsearch' };
  }
}
