// One till. A credit leaves a balance in one way, or the books are wrong.
//
// Run it:  node security-tests/creditGateway.test.js
//
// There used to be two ways to charge a user. The old one —
// withFeatureCheck → consumeFeature → decrement_ai_credits — subtracted from
// profiles.ai_credits_remaining and wrote a row in feature_usage, and nothing
// else. Nothing in ai_usage, so nothing in ai_margin_weekly: those credits left
// the customer's balance and never appeared in the cost report. A ledger with
// two doors, one of which records nothing, is not a ledger.
//
// This reads every source file and enforces four rules:
//
//   1. decrement_ai_credits — the old till — is called nowhere.
//   2. withFeatureCheck, canUseFeature and consumeFeature are imported nowhere.
//   3. ai_credits_remaining is assigned nowhere but the admin adjustment route,
//      where a human deliberately sets someone's balance.
//   4. The reservation calls (reserve_ai_credits, reserve_ai_credits_for,
//      start_ai_session) appear only inside the billing layer.
//
// The billing layer is the only list this test holds, and it is the thing
// itself: the wrapper that charges one request, the one that charges a
// streamed session, the one that opens a session, the system-call helper, the
// cost ledger, and the auto-apply engine that charges per application sent.
// Adding a file to it is a deliberate act.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const SRC             = path.join(ROOT, 'src');
const EXPECTED_CHECKS = 4;

// Allowed to move credits, and why.
const BILLING = new Set([
  'src/lib/ai/withAiAction.ts',                    // one request, one charge: reserve, settle, refund
  'src/lib/ai/sessionStream.ts',                   // a streamed session: settle on first content, refund otherwise
  'src/lib/ai/systemCall.ts',                      // calls the house pays for: zero-credit rows
  'src/lib/ai/ledger.ts',                          // what each upstream call cost
  'src/lib/auto-apply/runForUser.ts',              // one credit per application actually sent
  'src/app/api/chat/route.ts',                     // opens a chat session (start_ai_session)
  'src/app/api/interview-coach/start/route.ts',    // opens an interview session (start_ai_session)
]);

// The one place a balance is set by hand, by an administrator.
const CREDIT_ADJUSTMENT = 'src/app/api/admin/users/[id]/route.ts';

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

const RULES = [
  {
    name:    'the old till (decrement_ai_credits) is called nowhere',
    pattern: /decrement_ai_credits/,
    allowed: () => false,
  },
  {
    name:    'withFeatureCheck, canUseFeature and consumeFeature are imported nowhere',
    pattern: /^\s*import\s[^;]*\b(withFeatureCheck|canUseFeature|consumeFeature)\b/,
    allowed: () => false,
  },
  {
    // A type annotation declares nothing and writes nothing: `ai_credits_remaining:
    // number | null` in an interface is a shape, not a balance being set. The rule
    // is about a value being assigned.
    name:    'a balance is assigned only where an administrator sets it',
    // The lookahead swallows the whitespace itself: written as `\s*(?!number)`,
    // the engine backtracks `\s*` to zero characters, compares "number" against
    // a leading space, and the exclusion never fires.
    pattern: /ai_credits_remaining\s*[:=](?!\s*(?:number|string|boolean|unknown|any|null)\b)\s*\S/,
    allowed: (relative) => relative === CREDIT_ADJUSTMENT,
  },
  {
    name:    'credits are reserved only inside the billing layer',
    pattern: /\b(reserve_ai_credits|reserve_ai_credits_for|start_ai_session)\b/,
    allowed: (relative) => BILLING.has(relative),
  },
];

function main() {
  const files = sourceFiles(SRC);
  console.log(`\nCredit gateway — ${files.length} source files under src/`);
  console.log(`Billing layer: ${[...BILLING].join(', ')}`);
  console.log(`Balance adjustment: ${CREDIT_ADJUSTMENT}\n`);

  const found = RULES.map(() => []);

  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');

    RULES.forEach((rule, i) => {
      if (rule.allowed(relative)) return;
      lines.forEach((line, n) => {
        if (rule.pattern.test(line)) found[i].push(`${relative}:${n + 1}  ${line.trim().slice(0, 110)}`);
      });
    });
  }

  RULES.forEach((rule, i) => check(rule.name, found[i]));

  const ran = passed + failed;
  if (ran !== EXPECTED_CHECKS) {
    failed++;
    console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
  }
  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main();
