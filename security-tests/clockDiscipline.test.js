// A timestamp that gates a decision in the database belongs to the database.
//
// Run it:  node security-tests/clockDiscipline.test.js
//
// A cancelled customer kept 150 credits. The handler wrote current_period_end
// with the APPLICATION's clock and then asked renew_due_periods whether that
// date had passed according to the DATABASE's clock. Measured at the same
// instant, that machine ran 6 seconds ahead of Supabase, so the comparison was
// false every time. Not a race — deterministic, and silent: the sweep returned
// an empty set and nobody was told.
//
// The rule that prevents the next one:
//
//   A column that is compared against now() in SQL must never be written from
//   `new Date()` or `Date.now()` in application code.
//
// Those columns are listed below. They are the ones some migration compares to
// now() — a period that decides whether an account is due, a reservation that
// decides whether it is stale, a window that decides whether a rate limit has
// reset. Writing them from the app's clock makes the comparison depend on two
// clocks agreeing, and they do not.
//
// What is still allowed, and on purpose:
//   · a timestamp that comes from an external system (Stripe's period dates):
//     that is data, not our clock;
//   · a timestamp written by the database itself (now(), a DEFAULT, an RPC);
//   · display and ordering columns — last_message_at, updated_at, cached_at —
//     which nothing compares to now() in SQL.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const SRC             = path.join(ROOT, 'src');
const EXPECTED_CHECKS = 2;

// Columns some SQL compares against now(). Written by the database, or by a
// value that came from outside — never by this application's clock.
const CLOCK_GATED = [
  'current_period_start',   // renew_due_periods: current_period_end <= now()
  'current_period_end',     // idem — the column that caused the defect
  'ai_credits_reset_at',    // retired, still on the table
  'trial_ends_at',          // retired, still on the table
  'reserved_at',            // refund_stale_ai_reservations: reserved_at < now() - interval
  'expires_at',             // ai_sessions: expires_at <= now()
  'cost_next_attempt_at',   // claim_pending_ai_call_costs: <= now()
  'window_start',           // api_rate_limits: window_start <= now() - window
];

// The application's own clock. Not `new Date(<something>)`, which parses a
// value that came from elsewhere.
const APP_CLOCK = /new Date\(\s*\)|Date\.now\(\s*\)/;

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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(?<!:)\/\/.*$/, ''))
    .join('\n');
}

function main() {
  const files = sourceFiles(SRC);
  console.log(`\nClock discipline — ${files.length} source files under src/`);
  console.log(`Clock-gated columns: ${CLOCK_GATED.join(', ')}\n`);

  const written  = [];
  const compared = [];

  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');

    lines.forEach((line, n) => {
      // Rule 1 — a gated column assigned from this application's clock.
      for (const column of CLOCK_GATED) {
        const assigned = new RegExp(`\\b${column}\\s*:`);
        if (assigned.test(line) && APP_CLOCK.test(line)) {
          written.push(`${relative}:${n + 1}  ${line.trim().slice(0, 110)}`);
        }
      }

      // Rule 2 — a gated column filtered against this application's clock.
      // `.lte('current_period_end', new Date().toISOString())` asks the same
      // question the wrong way round, and fails the same way.
      if (/\.(gte|lte|gt|lt)\(/.test(line) && APP_CLOCK.test(line)) {
        for (const column of CLOCK_GATED) {
          if (line.includes(`'${column}'`) || line.includes(`"${column}"`)) {
            compared.push(`${relative}:${n + 1}  ${line.trim().slice(0, 110)}`);
          }
        }
      }
    });
  }

  check('no clock-gated column is written from the application clock', written);
  check('no clock-gated column is filtered against the application clock', compared);

  const ran = passed + failed;
  if (ran !== EXPECTED_CHECKS) {
    failed++;
    console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
  }
  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main();
