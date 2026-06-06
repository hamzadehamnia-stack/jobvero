import { tryN0 } from './levels/n0-api-parser';
import { tryN1 } from './levels/n1-scrape-llm';
import { tryN2 } from './levels/n2-patterns';
import { tryN3 } from './levels/n3-sonar';
import { getCached, setCached } from './cache';
import { logLookup } from './logger';
import { JobContext, RecruiterEmailResult, Confidence, LookupSource } from './types';

const COST_ESTIMATES: Record<Exclude<LookupSource, 'cache'>, number> = {
  api_n0: 0,
  scrape_n1: 0.0015,
  pattern_n2: 0,
  sonar_n3: 0.002,
};

export async function findRecruiterEmail(
  ctx: JobContext,
  userId: string
): Promise<RecruiterEmailResult | null> {
  const start = Date.now();

  const cached = await getCached(ctx.companyDomain);
  if (cached) {
    const latency = Date.now() - start;
    await logLookup({
      userId,
      jobId: ctx.jobId,
      companyDomain: ctx.companyDomain,
      levelSucceeded: -1,
      emailFound: cached.email,
      cacheHit: true,
      latencyMs: latency,
      costEstimateUsd: 0,
    });
    return {
      email: cached.email,
      source: 'cache',
      confidence: cached.confidence,
      evidenceUrl: cached.evidence_url ?? undefined,
      fromCache: true,
      costEstimateUsd: 0,
      latencyMs: latency,
    };
  }

  const n0 = await tryN0(ctx);
  if (n0) {
    await setCached(ctx, n0, 'api_n0', 'high');
    return await finalize(n0, 'api_n0', 'high', null, userId, ctx, 0, start);
  }

  const n1 = await tryN1(ctx);
  if (n1) {
    await setCached(ctx, n1.email, 'scrape_n1', 'high', n1.evidenceUrl);
    return await finalize(n1.email, 'scrape_n1', 'high', n1.evidenceUrl, userId, ctx, 1, start);
  }

  const n2 = await tryN2(ctx);
  if (n2) {
    await setCached(ctx, n2, 'pattern_n2', 'medium');
    return await finalize(n2, 'pattern_n2', 'medium', null, userId, ctx, 2, start);
  }

  const n3 = await tryN3(ctx);
  if (n3) {
    await setCached(ctx, n3.email, 'sonar_n3', 'medium', n3.evidenceUrl);
    return await finalize(n3.email, 'sonar_n3', 'medium', n3.evidenceUrl, userId, ctx, 3, start);
  }

  await logLookup({
    userId,
    jobId: ctx.jobId,
    companyDomain: ctx.companyDomain,
    levelSucceeded: null,
    emailFound: null,
    cacheHit: false,
    latencyMs: Date.now() - start,
    costEstimateUsd: COST_ESTIMATES.scrape_n1 + COST_ESTIMATES.sonar_n3,
  });
  return null;
}

async function finalize(
  email: string,
  source: Exclude<LookupSource, 'cache'>,
  confidence: Confidence,
  evidenceUrl: string | null,
  userId: string,
  ctx: JobContext,
  level: number,
  start: number
): Promise<RecruiterEmailResult> {
  const cost = COST_ESTIMATES[source];
  const latencyMs = Date.now() - start;
  await logLookup({
    userId,
    jobId: ctx.jobId,
    companyDomain: ctx.companyDomain,
    levelSucceeded: level,
    emailFound: email,
    cacheHit: false,
    latencyMs,
    costEstimateUsd: cost,
  });
  return {
    email,
    source,
    confidence,
    evidenceUrl: evidenceUrl ?? undefined,
    fromCache: false,
    costEstimateUsd: cost,
    latencyMs,
  };
}
