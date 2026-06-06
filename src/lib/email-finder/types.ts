export type LookupSource = 'cache' | 'api_n0' | 'scrape_n1' | 'pattern_n2' | 'sonar_n3';
export type Confidence = 'high' | 'medium' | 'low';

export type CountryCode =
  | 'us' | 'uk' | 'fr' | 'es' | 'pt' | 'de'
  | 'br' | 'mx' | 'pe' | 'ie' | 'au' | 'nz'
  | 'ca' | 'be' | 'ch' | 'nl';

export type ApiSource = 'adzuna' | 'jsearch' | 'reed' | 'france_travail';

export interface JobContext {
  jobId: string;
  jobTitle: string;
  jobDescriptionHtml?: string;
  jobUrl?: string;
  companyName: string;
  companyDomain: string;
  companyCareersUrl?: string;
  country: CountryCode;
  rawApiPayload?: unknown;
  apiSource?: ApiSource;
}

export interface RecruiterEmailResult {
  email: string;
  source: LookupSource;
  confidence: Confidence;
  evidenceUrl?: string;
  fromCache: boolean;
  costEstimateUsd: number;
  latencyMs: number;
}

export interface CachedRecruiter {
  id: string;
  company_domain: string;
  company_name: string | null;
  email: string;
  source: Exclude<LookupSource, 'cache'>;
  confidence: Confidence;
  evidence_url: string | null;
  hit_count: number;
  expires_at: string;
}

export interface LookupLogEntry {
  userId: string;
  jobId: string;
  companyDomain: string;
  levelSucceeded: number | null;
  emailFound: string | null;
  cacheHit: boolean;
  latencyMs: number;
  costEstimateUsd: number;
}
