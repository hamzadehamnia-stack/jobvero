// Regression test for src/lib/ai/rules.ts, the decisions withAiAction takes.
//
// Run it:  node security-tests/aiActionRules.test.mjs
//
// Imports the real module: it has type imports only, which Node 24 erases.
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

import { isDeepStrictEqual } from 'node:util';
import {
  countInputChars,
  mayCallModel,
  readFailureInjection,
  readIdempotencyKey,
  refusalForFeature,
  refusalForReserveError,
  reservationOutcome,
} from '../src/lib/ai/rules.ts';

const EXPECTED_CHECKS = 29;

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
check('development honours the two known failures',
  [readFailureInjection('handler-throws', 'development'), readFailureInjection('error-response', 'test')],
  ['handler-throws', 'error-response']);
check('an unknown value or no header injects nothing, even in development',
  [readFailureInjection('drop-table', 'development'), readFailureInjection(null, 'development')], [null, null]);


// ─── Report ───────────────────────────────────────────────────────────────────

const ran = passed + failed;
if (ran !== EXPECTED_CHECKS) {
  failed++;
  console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
}

console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
process.exit(failed ? 1 : 0);
