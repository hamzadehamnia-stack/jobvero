// A subscription's period and its cancellation are read in ONE place.
//
// Run it:  node security-tests/stripeFields.test.js
//
// On 2026-09-22 a real customer cancelled in the Stripe portal. Stripe recorded
// it. Jobvero did not: the webhook tested `subscription.cancel_at_period_end`,
// and in API version 2026-04-22.dahlia a portal cancellation sets `cancel_at`
// instead and leaves that flag false. The same version moved the billing period
// onto the subscription ITEM, so the handler's `subscription.current_period_end`
// had quietly become undefined as well.
//
// Two fields moved; two behaviours broke; nothing failed loudly. The defect was
// not that the fields changed — Stripe says so in its changelog — it is that
// four reads were scattered across a switch statement, so nothing could be
// checked in one place.
//
// THE RULE, not a list of files: these fields belong to
// src/lib/stripe/subscriptionState.ts and to nothing else under src/.
//
// Two checks:
//
//   1. No file that speaks to the Stripe SDK reads them directly.
//      Structural: "speaks to the SDK" means it imports 'stripe'.
//   2. No file anywhere under src/ reads them off a subscription-shaped
//      variable, even without importing the SDK — an `any` or a fetch response
//      would slip past rule 1 otherwise.
//
// What this rule must NOT flag: profiles.current_period_start and friends are
// DATABASE COLUMNS of the same name. They are Jobvero's own record of the term
// and are read wherever they are needed. Rule 1 ignores them because those
// files do not import Stripe; rule 2 ignores them because the receiver is a
// profile, not a subscription.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const SRC             = path.join(ROOT, 'src');
const EXPECTED_CHECKS = 2;

// The one reader.
const SOURCE = 'src/lib/stripe/subscriptionState.ts';

// The fields that moved, and the ones that describe a cancellation.
const FIELDS = [
  'current_period_start',
  'current_period_end',
  'cancel_at_period_end',
  'cancel_at',
];

// A read of one of those fields: `.cancel_at`, `?.cancel_at`, `['cancel_at']`.
// `cancel_at` is listed last and matched with a boundary so it does not also
// match `cancel_at_period_end`.
const FIELD_READ = new RegExp(
  `(?:\\.|\\?\\.|\\[\\s*['"])(?:${FIELDS.join('|')})(?![a-z_])`,
);

// Rule 2's receiver: a variable whose name says "this is a Stripe
// subscription". A profile row never matches.
const SUBSCRIPTION_RECEIVER = new RegExp(
  `\\b(?:subscription|subscriptions|sub|stripeSub|stripeSubscription)\\s*(?:\\?)?\\.(?:${FIELDS.join('|')})(?![a-z_])`,
  'i',
);

// Importing the Stripe SDK — type-only imports included: a file that names
// Stripe.Subscription is handling one.
const IMPORTS_STRIPE_SDK = /from\s+['"]stripe['"]/;

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Comments are prose: a rule about code must not fire on the line explaining
// the rule. `(?<!:)` keeps https:// out of it.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(?<!:)\/\/.*$/, ''))
    .join('\n');
}

let passed = 0;
let failed = 0;
function check(name, violations) {
  if (violations.length === 0) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    for (const v of violations) console.log(`          ${v}`);
  }
}

function main() {
  const files = sourceFiles(SRC);
  console.log(`\nStripe subscription fields — ${files.length} source files under src/`);
  console.log(`One reader: ${SOURCE}`);
  console.log(`Fields: ${FIELDS.join(', ')}\n`);

  const sdkViolations      = [];
  const receiverViolations = [];

  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    if (relative === SOURCE) continue;

    const rawSource = fs.readFileSync(file, 'utf8');
    const code      = stripComments(rawSource);
    const speaksSdk = IMPORTS_STRIPE_SDK.test(code);

    code.split('\n').forEach((line, n) => {
      if (speaksSdk && FIELD_READ.test(line)) {
        sdkViolations.push(`${relative}:${n + 1}  ${line.trim().slice(0, 100)}`);
      }
      if (SUBSCRIPTION_RECEIVER.test(line)) {
        receiverViolations.push(`${relative}:${n + 1}  ${line.trim().slice(0, 100)}`);
      }
    });
  }

  check('no file that imports the Stripe SDK reads these fields directly', sdkViolations);
  check('no file reads these fields off a subscription-shaped value', receiverViolations);

  const ran = passed + failed;
  if (ran !== EXPECTED_CHECKS) {
    failed++;
    console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
  }

  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main();
