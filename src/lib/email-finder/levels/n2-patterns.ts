import { JobContext, CountryCode } from '../types';
import { hasMXRecord } from '../utils/mx-check';

const PATTERNS_BY_COUNTRY: Record<CountryCode, string[]> = {
  us: ['careers', 'jobs', 'recruiting', 'hr', 'talent'],
  uk: ['careers', 'jobs', 'recruitment', 'hr', 'talent'],
  ie: ['careers', 'jobs', 'recruitment', 'hr', 'talent'],
  ca: ['careers', 'jobs', 'recruiting', 'hr', 'talent'],
  au: ['careers', 'jobs', 'recruitment', 'hr', 'talent'],
  nz: ['careers', 'jobs', 'recruitment', 'hr', 'talent'],
  fr: ['recrutement', 'rh', 'emploi', 'carrieres', 'jobs'],
  be: ['recrutement', 'rh', 'jobs', 'careers', 'emploi'],
  ch: ['recrutement', 'rh', 'jobs', 'careers', 'hr'],
  es: ['rrhh', 'empleo', 'reclutamiento', 'carreras', 'jobs'],
  mx: ['rrhh', 'empleo', 'reclutamiento', 'carreras', 'jobs'],
  pe: ['rrhh', 'empleo', 'reclutamiento', 'carreras', 'jobs'],
  pt: ['rh', 'recrutamento', 'emprego', 'carreiras', 'jobs'],
  br: ['rh', 'recrutamento', 'emprego', 'carreiras', 'jobs'],
  de: ['karriere', 'bewerbung', 'jobs', 'personal', 'hr'],
  nl: ['carriere', 'banen', 'jobs', 'hr', 'careers'],
};

export async function tryN2(ctx: JobContext): Promise<string | null> {
  const hasMx = await hasMXRecord(ctx.companyDomain);
  if (!hasMx) return null;

  const patterns = PATTERNS_BY_COUNTRY[ctx.country] ?? PATTERNS_BY_COUNTRY.us;
  return `${patterns[0]}@${ctx.companyDomain.toLowerCase()}`;
}
