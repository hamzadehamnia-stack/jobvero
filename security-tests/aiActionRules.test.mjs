// Regression test for src/lib/ai/rules.ts, the decisions withAiAction takes.
//
// Run it:  node security-tests/aiActionRules.test.mjs
//
// Imports the real module: it has type imports only, which Node 24 erases.
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

import { isDeepStrictEqual } from 'node:util';
import { FEATURES } from '../src/lib/entitlements.ts';
import {
  FEATURE_SWITCH,
  countInputChars,
  mayCallModel,
  readFailureInjection,
  readIdempotencyKey,
  readSwitchOverride,
  refusalForFeature,
  refusalForReserveError,
  reservationOutcome,
  switchRefusal,
  toggleOff,
  withSwitchesOff,
} from '../src/lib/ai/rules.ts';

const EXPECTED_CHECKS = 38;

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (isDeepStrictEqual(actual, expected)) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`);
  }
}


// ─── 1. Reservation outcomes ──────────────────────────────────────────────────

console.log('\n1. Reservation outcomes');

check('charged: reserved, and charged by this call',
  reservationOutcome({ usage_status: 'reserved', charged_now: true }), 'charged');
check('in progress: reserved, but not charged by this call',
  reservationOutcome({ usage_status: 'reserved', charged_now: false }), 'in_progress');
check('already processed: settled, not charged',
  reservationOutcome({ usage_status: 'settled', charged_now: false }), 'already_processed');

let threw = false;
try {
  reservationOutcome({ usage_status: 'refunded', charged_now: false });
} catch {
  threw = true;
}
check('an unexpected row throws instead of letting the model run', threw, true);


// ─── 2. Feature refusals ──────────────────────────────────────────────────────

console.log('\n2. Feature refusals');

check('allowed → no refusal', refusalForFeature({ allowed: true, tier: 'pro' }), null);
check('blocked → 403 blocked, no upgrade path',
  refusalForFeature({ allowed: false, reason: 'blocked' }),
  { status: 403, body: { error: 'Account blocked', reason: 'blocked' } });
check('free → 403 trial_expired, never no_credits',
  refusalForFeature({ allowed: false, reason: 'feature_locked', tier: 'free', upgradeTo: 'starter' }),
  { status: 403, body: { error: 'Feature locked', reason: 'trial_expired', upgradeTo: 'starter' } });
check('starter on a Pro feature → 403 tier_locked, upgrade to pro',
  refusalForFeature({ allowed: false, reason: 'feature_locked', tier: 'starter', upgradeTo: 'pro' }),
  { status: 403, body: { error: 'Feature locked', reason: 'tier_locked', upgradeTo: 'pro' } });


// ─── 3. Reservation refusals ──────────────────────────────────────────────────

console.log('\n3. Reservation refusals');

const context = (tier, cheapestTierForFeature = 'starter') => ({ tier, cheapestTierForFeature });

check('JV004 on starter → 402 no_credits, upgrade to pro',
  refusalForReserveError('JV004', context('starter')),
  { status: 402, body: { error: 'Insufficient credits', reason: 'no_credits', upgradeTo: 'pro' } });
check('JV004 on premium → 402, nowhere to upgrade',
  refusalForReserveError('JV004', context('premium')),
  { status: 402, body: { error: 'Insufficient credits', reason: 'no_credits', upgradeTo: null } });
check('JV004 on a trial → the cheapest plan that has the feature',
  refusalForReserveError('JV004', context('trial', 'pro')),
  { status: 402, body: { error: 'Insufficient credits', reason: 'no_credits', upgradeTo: 'pro' } });
check('JV005 → 403 blocked',
  refusalForReserveError('JV005', context('pro')),
  { status: 403, body: { error: 'Account blocked', reason: 'blocked' } });
check('JV002 and JV003 → 503 action_unavailable',
  [refusalForReserveError('JV002', context('pro')), refusalForReserveError('JV003', context('pro'))].map((r) => [r.status, r.body.reason]),
  [[503, 'action_unavailable'], [503, 'action_unavailable']]);
check('JV010 → 400 invalid_request',
  refusalForReserveError('JV010', context('pro')),
  { status: 400, body: { error: 'Invalid request', reason: 'invalid_request' } });
check('JV001 → 401', refusalForReserveError('JV001', context('pro')).status, 401);
check('an unknown code → 500, never a success',
  refusalForReserveError('P0001', context('pro')).status, 500);


// ─── 4. Input size and idempotency ────────────────────────────────────────────

console.log('\n4. Input size and idempotency');

check('text content is counted',
  countInputChars([{ content: 'abc' }, { content: 'de' }]), 5);
check('document parts are not counted, text parts are',
  countInputChars([{ content: [{ type: 'document', source: { data: 'x'.repeat(100000) } }, { type: 'text', text: 'abcd' }] }]), 4);
check('no header → a generated key',
  readIdempotencyKey(null, () => 'generated-key'), 'generated-key');
check('a valid header is kept',
  readIdempotencyKey('client-key-123', () => 'unused'), 'client-key-123');
check('a malformed header is refused: spaces, or over 200 characters',
  [readIdempotencyKey('has space', () => 'x'), readIdempotencyKey('k'.repeat(201), () => 'x')], [null, null]);


// ─── 5. One upstream call per request unless declared ────────────────────────

console.log('\n5. Upstream calls per request');

check('the first call is allowed by default', mayCallModel(0, 1), true);
check('a second call is refused by default', mayCallModel(1, 1), false);
check('a route that declares two calls may make a second, not a third',
  [mayCallModel(1, 2), mayCallModel(2, 2)], [true, false]);
check('an invalid maxCalls allows nothing',
  [mayCallModel(0, 0), mayCallModel(0, 1.5), mayCallModel(0, Number.NaN)], [false, false, false]);


// ─── 6. Test failure injection, never in production ───────────────────────────

console.log('\n6. Test failure injection');

check('production honours no injection, whatever the header',
  [readFailureInjection('handler-throws', 'production'), readFailureInjection('error-response', 'production')], [null, null]);
check('an unset NODE_ENV honours nothing either',
  [readFailureInjection('handler-throws', undefined), readFailureInjection('error-response', '')], [null, null]);
check('development honours the three known failures',
  [readFailureInjection('handler-throws', 'development'), readFailureInjection('error-response', 'test'), readFailureInjection('report-unreadable', 'development')],
  ['handler-throws', 'error-response', 'report-unreadable']);
check('the interview report failure is no more honoured in production than the others',
  [readFailureInjection('report-unreadable', 'production'), readFailureInjection('report-unreadable', undefined)], [null, null]);
check('an unknown value or no header injects nothing, even in development',
  [readFailureInjection('drop-table', 'development'), readFailureInjection(null, 'development')], [null, null]);


// ─── 7. Admin switches (brief §10.14 test 19) ─────────────────────────────────

console.log('\n7. Admin switches');

const featureKeys = Object.keys(FEATURES);
const AI_DISABLED = { status: 503, body: { error: 'AI features are temporarily disabled', reason: 'ai_disabled' } };

check('every feature has its own admin toggle, and no two features share one',
  [Object.keys(FEATURE_SWITCH).sort(), new Set(Object.values(FEATURE_SWITCH)).size],
  [[...featureKeys].sort(), featureKeys.length]);
check('no settings row: every feature is on',
  featureKeys.map((feature) => switchRefusal(null, feature)), featureKeys.map(() => null));
check('ai_enabled false turns every feature off with a clear 503',
  featureKeys.map((feature) => switchRefusal({ ai_enabled: false }, feature)), featureKeys.map(() => AI_DISABLED));
check('a feature toggle turns off that feature and no other',
  featureKeys.map((feature) => switchRefusal({ features: { ats_score: false } }, feature)?.body.reason ?? null),
  featureKeys.map((feature) => (feature === 'ATS_SCORE' ? 'feature_disabled' : null)));
check('only an explicit false turns a switch off',
  [switchRefusal({ ai_enabled: 'false' }, 'ATS_SCORE'), switchRefusal({ ai_enabled: 0 }, 'ATS_SCORE'),
   switchRefusal({ ai_enabled: null, features: { ats_score: null } }, 'ATS_SCORE'), toggleOff({ features: { ai_matches: 'off' } }, 'ai_matches')],
  [null, null, null, false]);
check('the test override is ignored in production and without NODE_ENV',
  [readSwitchOverride('ai_enabled', 'production'), readSwitchOverride('ai_enabled', undefined)], [[], []]);
check('in development the override lists switch keys and drops malformed ones',
  readSwitchOverride(' ai_enabled , ats_score,DROP TABLE,', 'development'), ['ai_enabled', 'ats_score']);
check('switches forced off answer as stored ones would',
  [switchRefusal(withSwitchesOff(null, ['ai_enabled']), 'CV_BUILDER_AI')?.body.reason,
   switchRefusal(withSwitchesOff({ features: { ats_score: true } }, ['ats_score']), 'ATS_SCORE')?.body.reason,
   switchRefusal(withSwitchesOff({ ai_enabled: true }, []), 'ATS_SCORE')],
  ['ai_disabled', 'feature_disabled', null]);


// ─── Report ───────────────────────────────────────────────────────────────────

const ran = passed + failed;
if (ran !== EXPECTED_CHECKS) {
  failed++;
  console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
}

console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
process.exit(failed ? 1 : 0);
