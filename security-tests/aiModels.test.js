// Every model in the AI catalogue must be a model OpenRouter lists.
//
// Run it:  node security-tests/aiModels.test.js
//
// ai_action_costs.model is sent as-is to OpenRouter, and so is each model an
// action pins in its limits (limits.models: the interview's speech-to-text and
// text-to-speech). An id it does not know makes every call of that kind fail,
// and a failed call is refunded: the ledger looks healthy while the feature is
// down. This checks each of them against the live list,
// GET https://openrouter.ai/api/v1/models, asked for every output modality so
// that speech models are listed along with text ones.
//
// Reads the catalogue with the service role key from .env.local; writes nothing.
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT                 = path.resolve(__dirname, '..');
const EXPECTED_ACTIONS     = 13;   // asserted by migration 20260914120000_ai_action_letter_adapt
const EXPECTED_STEP_MODELS = 2;    // interview_session stt and tts, migration 20260915120600_ai_action_interview_voice
const EXPECTED_CHECKS      = 2 + EXPECTED_ACTIONS + EXPECTED_STEP_MODELS;

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${detail}`}`);
  }
}

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[m[1]] = value;
  }
  return env;
}

// Punctuation-blind comparison, to point at the id a typo was meant to be.
const bare = (id) => id.replace(/[.-]/g, '');

async function main() {
  const env = loadEnv(path.join(ROOT, '.env.local'));
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[name]) throw new Error(`${name} is missing from .env.local`);
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [catalogue, listing] = await Promise.all([
    admin.from('ai_action_costs').select('action, model, enabled, limits').order('action'),
    fetch('https://openrouter.ai/api/v1/models?output_modalities=all', { signal: AbortSignal.timeout(30_000) }),
  ]);
  if (catalogue.error) throw catalogue.error;

  const body = listing.ok ? await listing.json() : null;
  const ids  = new Set((body?.data ?? []).map((model) => model.id));

  const listed = (name, id) => {
    const listedAs = [...ids].find((known) => bare(known) === bare(id));
    check(name, ids.has(id), listedAs ? `not listed; OpenRouter lists ${listedAs}` : 'not listed by OpenRouter');
  };

  console.log('\nOpenRouter model list');
  check('the list is reachable and not empty', listing.ok && ids.size > 0, `HTTP ${listing.status}, ${ids.size} models`);
  check(`the catalogue has ${EXPECTED_ACTIONS} actions`, catalogue.data.length === EXPECTED_ACTIONS,
    `${catalogue.data.length} rows`);

  console.log(`\nCatalogue models (${ids.size} listed by OpenRouter)`);
  for (const row of catalogue.data) {
    listed(`${row.action.padEnd(28)} ${row.model}${row.enabled ? '' : ' (disabled)'}`, row.model);
  }

  console.log('\nModels pinned in limits.models');
  for (const row of catalogue.data) {
    const steps = row.limits?.models;
    if (typeof steps !== 'object' || steps === null) continue;
    for (const [step, id] of Object.entries(steps)) {
      listed(`${`${row.action}.${step}`.padEnd(28)} ${id}`, String(id));
    }
  }

  const ran = passed + failed;
  if (ran !== EXPECTED_CHECKS) {
    failed++;
    console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
  }
  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nMODEL CHECK FAILED TO RUN:', err);
  process.exit(1);
});
