// One table decides what a plan may do. Two tables decide nothing.
//
// Run it:  node security-tests/accessSingleSource.test.js
//
// Jobvero carried two feature tables that disagreed:
//
//   src/lib/entitlements.ts        free: false  on every AI feature
//   src/lib/subscription/features.ts  free: { access: true, credits: 1 }
//
// The server refused what the client offered. A Free account was shown the
// assistant and got a 403; a Starter account read FEATURES[feature]['starter'],
// found undefined in a table that had no starter column, and was shown nothing
// at all — a paying customer with every feature hidden. Neither table was
// wrong on its own. Having two was the defect.
//
// So: one table, server-side, in src/lib/entitlements.ts. The browser does not
// hold a copy — it asks GET /api/me/entitlement what this account may do. A
// copy in the bundle is a copy that goes stale the day the table changes, and
// nobody notices until a customer does.
//
// Four rules:
//
//   1. Only entitlements.ts declares a feature-to-tier table. Structural, not
//      by name: any line granting free / pro / premium together is a table,
//      whatever it is called.
//   2. Only entitlements.ts and the request gate index FEATURES.
//   3. There is one tier resolver. A second function turning a plan into a tier
//      is a second source of truth with a different name.
//   4. No client file imports the access modules. It reads the route.
//   5. Only the source turns a plan name into an allowance. Rule 1 measured the
//      SHAPE of a table — `free: true, pro: …, premium: …` on one line — and a
//      switch statement is not that shape. src/app/.../dashboard/page.tsx held
//      `case 'premium': return 500` and sailed past four rules, then drew "∞"
//      for any plan whose limit equalled 500. The rule was too narrow, not the
//      code too clever: deciding an allowance per plan is the thing to forbid,
//      in whatever syntax it is written.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const SRC             = path.join(ROOT, 'src');
const EXPECTED_CHECKS = 5;

// The one place access is decided.
const SOURCE = 'src/lib/entitlements.ts';

// The request gate reads the table to name the plan that unlocks a feature.
// It decides nothing the table does not already say.
const GATE = 'src/lib/ai/authorize.ts';

// What the browser must not import: it asks the server instead.
const CLIENT_DIRS = ['src/components/', 'src/hooks/', 'src/app/'];
const ACCESS_MODULES = /from\s+['"]@\/lib\/(entitlements|subscription\/[a-z]+)['"]/;

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

// A type carries no decision: `import type { Tier }` is a shape, not a gate.
function isTypeImport(line) {
  return /^\s*import\s+type\b/.test(line);
}

// Code that ships to the browser says so on its first line.
function isClientFile(source) {
  return /^\s*(?:'use client'|"use client")/m.test(source.slice(0, 200));
}

// A line that GRANTS something to several tiers at once is a feature table,
// whatever its name. Granting is a boolean or an access object — `free: true`,
// `free: { access: true }`. A line that merely NAMES the tiers is a label map
// (`free: 'Gratuit'`) or a palette (`free: 'bg-gray-100'`), and decides nothing:
// the first draft of this rule flagged four translation tables and would have
// had me mangle the interface to satisfy a bad measurement.
const TABLE_ROW = /\bfree\s*:\s*(?:true|false|\{).*\bpro\s*:\s*(?:true|false|\{).*\bpremium\s*:\s*(?:true|false|\{)/;

const RULES = [
  {
    name:    'only entitlements.ts declares a feature-to-tier table',
    test:    (line) => TABLE_ROW.test(line),
    allowed: (relative) => relative === SOURCE,
  },
  {
    name:    'only the single source and the request gate index FEATURES',
    test:    (line) => /\bFEATURES\s*\[/.test(line),
    allowed: (relative) => relative === SOURCE || relative === GATE,
  },
  {
    name:    'there is one tier resolver, not several',
    test:    (line) => /\b(?:function|const)\s+(?:resolveTier|getEffectiveTier|toFeatureTierKey|getDisplayTier)\b/.test(line),
    allowed: (relative) => relative === SOURCE,
  },
  {
    // What must not happen is a copy of the table reaching the browser bundle,
    // where it goes stale the day the table changes and nobody notices until a
    // customer does. The test for that is the 'use client' directive, not the
    // folder: a server component under src/app is server code and may read the
    // source directly.
    name:    'no client component imports the access modules — it reads the route',
    test:    (line) => ACCESS_MODULES.test(line) && !isTypeImport(line),
    allowed: (relative, source) => relative === SOURCE || !isClientFile(source),
  },
  {
    // An allowance is a number attached to a plan name. Two syntaxes say it:
    // a switch returning a literal per tier, and a one-line map of tier to
    // number. src/lib/plans.ts is allowed because it is the DISPLAY copy, and
    // security-tests/planPrices.test.js fails the day it disagrees with
    // admin_settings — which is the only reason a second copy is tolerable.
    name:    'only the single source turns a plan name into an allowance',
    test:    (line) =>
      /\bcase\s+['"](?:free|pro|premium)['"]\s*:\s*return\s+-?\d/.test(line)
      || /\bfree\s*:\s*\d+\b.*\bpro\s*:\s*\d+\b.*\bpremium\s*:\s*\d+/.test(line),
    allowed: (relative) => relative === SOURCE || relative === 'src/lib/plans.ts',
  },
];

function main() {
  const files = sourceFiles(SRC);
  console.log(`\nAccess single source — ${files.length} source files under src/`);
  console.log(`Source of truth: ${SOURCE}`);
  console.log(`Request gate:    ${GATE}\n`);

  const found = RULES.map(() => []);

  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    const raw      = fs.readFileSync(file, 'utf8');
    const lines    = stripComments(raw).split('\n');

    RULES.forEach((rule, i) => {
      if (rule.allowed(relative, raw)) return;
      lines.forEach((line, n) => {
        if (rule.test(line, relative)) {
          found[i].push(`${relative}:${n + 1}  ${line.trim().slice(0, 100)}`);
        }
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
