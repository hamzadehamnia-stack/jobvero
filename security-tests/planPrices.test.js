// ─── The displayed figures must match the enforced ones ──────────────────────
//
// src/lib/plans.ts is what the marketing pages SHOW. admin_settings is what the
// server ENFORCES, and it is changeable without a deploy. That makes plans.ts a
// copy, and a copy drifts: the day somebody raises Premium to 200 credits in
// admin_settings, the pricing page keeps promising 150 and nothing says so.
//
// This test compares the two through src/lib/entitlements.ts — the same module
// the billing reads — so it cannot be fooled by a key being renamed.
//
// Read-only. It writes nothing, and touches no account.
//
//   node security-tests/planPrices.test.js

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// .env.local, parsed here rather than pulled in as a dependency.
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (affiche ${actual}, applique ${expected})`}`);
}

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const { PLANS }        = await import('../src/lib/plans.ts');
  const { creditAllowance, autoApplyQuota, inboxMonthlyQuota } = await import('../src/lib/entitlements.ts');

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin
    .from('admin_settings').select('value').eq('key', 'global').maybeSingle();

  if (error)  { console.log(`  FAIL  admin_settings illisible : ${error.message}`); process.exit(1); }
  if (!data)  { console.log('  FAIL  admin_settings n’a pas de ligne "global"'); process.exit(1); }

  const limits = data.value?.limits ?? null;
  if (!limits) { console.log('  FAIL  admin_settings.value.limits est absent'); process.exit(1); }

  console.log('Credits IA par mois');
  for (const id of ['free', 'pro', 'premium']) {
    check(`${id}`, PLANS[id].credits, creditAllowance(id, limits));
  }

  console.log('\nCandidatures automatiques par mois');
  for (const id of ['free', 'pro', 'premium']) {
    check(`${id}`, PLANS[id].autoApply, autoApplyQuota(id, limits));
  }

  console.log('\nE-mails tries par mois');
  for (const id of ['free', 'pro', 'premium']) {
    // plans.ts writes null where entitlements says 'unlimited': the same fact,
    // spelled for a template that has to decide whether to print a number.
    const enforced = inboxMonthlyQuota(id, limits);
    check(`${id}`, PLANS[id].inboxMonth, enforced === 'unlimited' ? null : enforced);
  }

  console.log('\nPrix affiches');
  check('free',    PLANS.free.priceUsd,    0);
  check('pro < premium', PLANS.pro.priceUsd < PLANS.premium.priceUsd, true);

  console.log(failures === 0
    ? '\nALL CHECKS PASSED'
    : `\n${failures} ECART(S) entre ce qui est affiche et ce qui est applique`);
  // exitCode rather than exit(): the Supabase client still holds an open
  // handle, and killing the process under it made libuv assert on Windows
  // after the result had already printed.
  process.exitCode = failures === 0 ? 0 : 1;
})().catch((err) => { console.error(err); process.exitCode = 1; });
