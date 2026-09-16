// Every model call goes through the catalogue. This is the rule, not a list.
//
// Run it:  node security-tests/aiGateway.test.js
//
// A model id written in the code is invisible to the catalogue, so it escapes
// the migrations that pin models, the aiModels guard that checks them against
// OpenRouter's list, the output ceilings, and the ai_usage ledger that says
// what anything costs. That is how a preview model survived three rounds of
// review: nobody was looking at the places the catalogue does not reach.
//
// So instead of hunting those places one by one, this reads every source file
// and enforces three rules:
//
//   1. Only the gateway may talk to openrouter.ai.
//   2. Only the gateway may import the raw OpenRouter client.
//   3. Nowhere — the gateway included — may a model id be written as a literal.
//      Models come from ai_action_costs, always.
//
// The gateway is the plumbing itself: the raw client, the metered wrapper, the
// speech calls, the system-call helper. Every one of them takes its model from
// the caller, which takes it from the catalogue. Adding a file here is a
// deliberate act, and it is the only list this test holds.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const SRC             = path.join(ROOT, 'src');
const EXPECTED_CHECKS = 3;

const GATEWAY = new Set([
  'src/lib/openrouter.ts',            // the raw client: url, headers, one fetch
  'src/lib/ai/openrouterMetered.ts',  // the metered call behind withAiAction
  'src/lib/ai/openrouterSpeech.ts',   // speech-to-text and text-to-speech
  'src/lib/ai/systemCall.ts',         // zero-credit system calls, catalogue-driven
]);

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

// Comments are prose: a rule about code must not fire on a line explaining the
// rule. `(?<!:)` keeps https:// out of it.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(?<!:)\/\/.*$/, ''))
    .join('\n');
}

const PROVIDERS = 'anthropic|google|deepseek|openai|perplexity|meta-llama|mistralai|x-ai|qwen|cohere|amazon|nvidia';

const RULES = [
  {
    name:    'only the gateway calls openrouter.ai',
    pattern: /openrouter\.ai/,
    scope:   'outside-gateway',
  },
  {
    // `import type` is erased at build time and calls nothing: ORMessage is a
    // shape, not a client. The rule is about who can make a request.
    name:    'only the gateway imports the raw OpenRouter client',
    pattern: /^\s*import\s+(?!type\s)[^;]*from\s+['"](?:@\/lib\/openrouter|\.\.?\/[^'"]*\/openrouter)['"]/,
    scope:   'outside-gateway',
  },
  {
    name:    'no model id is written in the code — they come from ai_action_costs',
    pattern: new RegExp(`['"\`](?:${PROVIDERS})\\/[A-Za-z0-9._:-]+['"\`]`),
    scope:   'everywhere',
  },
];

function main() {
  const files = sourceFiles(SRC);
  console.log(`\nAI gateway — ${files.length} source files under src/`);
  console.log(`Gateway: ${[...GATEWAY].join(', ')}`);

  const found = RULES.map(() => []);

  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    const isGateway = GATEWAY.has(relative);
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');

    RULES.forEach((rule, i) => {
      if (rule.scope === 'outside-gateway' && isGateway) return;
      lines.forEach((line, n) => {
        const match = line.match(rule.pattern);
        if (match) found[i].push(`${relative}:${n + 1}  ${line.trim().slice(0, 100)}`);
      });
    });
  }

  console.log('');
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
