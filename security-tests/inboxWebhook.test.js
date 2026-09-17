// The inbound email webhook, as the internet sees it:
// authenticity → alias → daily ceilings → truncation → ledger.
//
// Run it (a few cents of real OpenRouter usage per run):
//   1. npm run dev                                     the dev server, port 3000
//   2. node security-tests/inboxWebhook.test.js [base url]
//
// Every email that reaches this route costs money to classify, so the route is
// the only thing standing between an open mailbox and an open wallet. This
// checks what it refuses and what it counts, against the production database,
// on the dedicated test account (profiles.is_test_account), whose alias is
// borrowed for the run and given back at the end — along with the threads, the
// counters and the ceilings the test moved.
//
// The ceilings are not reached by sending 26 or 201 emails: the counters of the
// day are seeded in the database, which is the same state 25 or 200 earlier
// emails would have left, and costs no model calls. The one thing that cannot
// be faked is the race, so case 5 fires two real HTTP requests at once.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const ROOT            = path.resolve(__dirname, '..');
const BASE            = process.argv[2] || 'http://localhost:3000';
const EXPECTED_CHECKS = 28;
const SIGNATURE_WINDOW_SECONDS = 300;

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function ensureServer() {
  const deadline = Date.now() + 90_000;
  let last = 'no answer';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/inbox/webhook`, { signal: AbortSignal.timeout(60_000) });
      if (res.status === 405) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = String(err);
    }
    await delay(2_000);
  }
  throw new Error(`no dev server at ${BASE} (${last}). Start it first: npm run dev`);
}

async function main() {
  const env = loadEnv(path.join(ROOT, '.env.local'));
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INBOX_WEBHOOK_SECRET']) {
    if (!env[name]) throw new Error(`${name} is missing from .env.local`);
  }
  const secret = env.INBOX_WEBHOOK_SECRET;
  // The HMAC key is its own secret; while it is unset, the shared one signs.
  const signingSecret = env.INBOX_SIGNING_SECRET || env.INBOX_WEBHOOK_SECRET;

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureServer();

  // ── The test account and its alias ────────────────────────────────────────
  const { data: profiles, error: profileError } = await admin
    .from('profiles').select('id, email_alias').eq('is_test_account', true).order('created_at').limit(2);
  if (profileError) throw profileError;
  if (profiles.length !== 1) throw new Error(`expected exactly one test account, found ${profiles.length}`);

  const userId        = profiles[0].id;
  const alias         = `e2e-inbox-${Date.now()}`;
  const previousAlias = profiles[0].email_alias;
  const today         = new Date().toISOString().slice(0, 10);

  // A paid plan for the run: classification now reads the tier, and Free
  // carries a monthly ceiling of its own (15) that would refuse the emails this
  // test sends for reasons it is not testing.
  const { error: aliasError } = await admin.from('profiles')
    .update({ email_alias: alias, subscription_plan: 'pro', subscription_status: 'active' })
    .eq('id', userId);
  if (aliasError) throw aliasError;

  // What the ceilings were before the run, to put them back.
  const { data: settingsRow, error: settingsError } = await admin
    .from('admin_settings').select('value').eq('key', 'global').single();
  if (settingsError) throw settingsError;
  const originalSettings = settingsRow.value;

  const { data: globalCounterBefore } = await admin
    .from('inbox_classify_counters').select('count')
    .eq('day', today).eq('scope', 'global').eq('subject', 'global').maybeSingle();
  const globalBefore = globalCounterBefore?.count ?? 0;

  console.log(`\nInbox webhook — alias ${alias}@getjobvero.com, user ${userId}`);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const sign = (body, timestamp) =>
    `v1=${crypto.createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex')}`;

  // How the Cloudflare worker calls us: the shared secret and, once deployed,
  // the signature. `auth` picks which of the two the request carries.
  async function post(payload, { auth = 'both', tamper = false, skewSeconds = 0 } = {}) {
    const body      = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000) + skewSeconds;
    const headers   = { 'Content-Type': 'application/json' };

    if (auth === 'secret' || auth === 'both') headers['X-Webhook-Secret'] = secret;
    if (auth === 'signature' || auth === 'both' || auth === 'signature-only') {
      headers['X-Inbox-Timestamp'] = String(timestamp);
      headers['X-Inbox-Signature'] = sign(tamper ? `${body}x` : body, timestamp);
    }
    if (auth === 'wrong-secret') headers['X-Webhook-Secret'] = 'not-the-secret';

    const res  = await fetch(`${BASE}/api/inbox/webhook`, { method: 'POST', headers, body });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  }

  const email = (subject, body, to = `${alias}@getjobvero.com`) => ({
    from: `recruteur+${Math.random().toString(36).slice(2, 8)}@northwind.example`,
    to,
    subject,
    text: body,
    html: '',
    messageId: `<${crypto.randomUUID()}@northwind.example>`,
  });

  // Everything this run created or counted, as the database has it.
  async function state() {
    const { data: threads } = await admin
      .from('message_threads')
      .select('id, employer_email, ai_category, ai_processed_at, ai_skipped_reason, ai_draft, ai_chips, created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
    const ids = (threads ?? []).map((t) => t.id);
    const { data: messages } = ids.length
      ? await admin.from('messages').select('id, thread_id, body, from_email').in('thread_id', ids)
      : { data: [] };
    const { data: usage } = await admin
      .from('ai_usage')
      .select('id, action, user_id, credits_charged, status, cost_usd, model, prompt_tokens, completion_tokens, created_at')
      .eq('user_id', userId).eq('action', 'system_inbox_classify')
      .gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
    const { data: counters } = await admin
      .from('inbox_classify_counters').select('scope, subject, count').eq('day', today);
    return {
      threads:  threads ?? [],
      messages: messages ?? [],
      usage:    usage ?? [],
      aliasCount:  (counters ?? []).find((c) => c.scope === 'alias' && c.subject === userId)?.count ?? 0,
      globalCount: (counters ?? []).find((c) => c.scope === 'global')?.count ?? 0,
    };
  }

  const setCounter = async (scope, subject, count) => {
    const { error } = await admin.from('inbox_classify_counters')
      .upsert({ day: today, scope, subject, count }, { onConflict: 'day,scope,subject' });
    if (error) throw error;
  };

  const setCap = async (key, value) => {
    const next = { ...originalSettings, limits: { ...originalSettings.limits, [key]: value } };
    const { error } = await admin.from('admin_settings').update({ value: next }).eq('key', 'global');
    if (error) throw error;
  };

  try {
    // ── 1. Authenticity: no valid proof, no work ────────────────────────────
    console.log('\n1. Authenticity of the webhook');
    const before1 = await state();
    const noAuth      = await post(email('Sans preuve', 'Bonjour, votre profil nous intéresse.'), { auth: 'none' });
    const wrongSecret = await post(email('Mauvais secret', 'Bonjour, votre profil nous intéresse.'), { auth: 'wrong-secret' });
    const tampered    = await post(email('Corps modifié', 'Bonjour, votre profil nous intéresse.'), { auth: 'signature-only', tamper: true });
    const stale       = await post(email('Horodatage vieux', 'Bonjour.'), { auth: 'signature-only', skewSeconds: -(SIGNATURE_WINDOW_SECONDS + 120) });
    const after1      = await state();
    check('1 no signature and no secret is refused', noAuth.status === 401, noAuth);
    check('1 a wrong secret is refused', wrongSecret.status === 401, wrongSecret);
    check('1 a signature that does not match the body is refused', tampered.status === 401, tampered);
    check('1 a signature older than its window is refused', stale.status === 401, stale);
    check('1 none of them reached the database or the model',
      after1.threads.length === before1.threads.length && after1.usage.length === before1.usage.length,
      { threads: [before1.threads.length, after1.threads.length], usage: [before1.usage.length, after1.usage.length] });

    // ── 2. An alias nobody owns: refused before the model ───────────────────
    console.log('\n2. An alias that does not exist');
    const before2 = await state();
    const unknown = await post(email('Bonjour', 'Votre profil nous intéresse.', 'nobody-here-9f3a@getjobvero.com'));
    const after2  = await state();
    check('2 the request is answered without an error', unknown.status === 200, unknown);
    check('2 nothing is classified, nothing is charged, no thread is created',
      after2.usage.length === before2.usage.length && after2.threads.length === before2.threads.length
        && after2.aliasCount === before2.aliasCount && after2.globalCount === before2.globalCount,
      { usage: [before2.usage.length, after2.usage.length], threads: [before2.threads.length, after2.threads.length] });

    // ── 3. The 26th email of the day on one alias ───────────────────────────
    console.log('\n3. The per-alias ceiling (25 a day)');
    await setCounter('alias', userId, 25);
    await setCounter('global', 'global', 0);
    const before3 = await state();
    const capped  = await post(email('Après le plafond', 'Bonjour, seriez-vous disponible pour un entretien mardi ?'));
    await delay(1_500);
    const after3  = await state();
    const thread3 = after3.threads.find((t) => !before3.threads.some((b) => b.id === t.id));
    check('3 the email is answered and kept', capped.status === 200 && Boolean(thread3), { status: capped.status, thread: thread3?.id });
    check('3 it is stored with the message, marked as skipped for the alias ceiling',
      thread3?.ai_skipped_reason === 'alias_limit' && thread3?.ai_processed_at === null
        && after3.messages.some((m) => m.thread_id === thread3?.id),
      { skipped: thread3?.ai_skipped_reason, processed: thread3?.ai_processed_at });
    check('3 no model call and no ledger row', after3.usage.length === before3.usage.length, [before3.usage.length, after3.usage.length]);

    // ── 4. The 201st email of the day, all aliases together ─────────────────
    console.log('\n4. The global ceiling (200 a day)');
    await setCounter('alias', userId, 0);
    await setCounter('global', 'global', 200);
    const before4 = await state();
    const global  = await post(email('Après le plafond global', 'Bonjour, pouvons-nous convenir d\'un appel ?'));
    await delay(1_500);
    const after4  = await state();
    const thread4 = after4.threads.find((t) => !before4.threads.some((b) => b.id === t.id));
    check('4 the email is kept, marked as skipped for the global ceiling',
      global.status === 200 && thread4?.ai_skipped_reason === 'global_limit' && thread4?.ai_processed_at === null,
      { status: global.status, skipped: thread4?.ai_skipped_reason });
    check('4 no model call and no ledger row', after4.usage.length === before4.usage.length, [before4.usage.length, after4.usage.length]);
    check('4 the alias ceiling was not consumed either', after4.aliasCount === 0, after4.aliasCount);

    // ── 5. Two emails at once on the last free slot ─────────────────────────
    console.log('\n5. Two emails at the exact edge of the ceiling');
    await setCounter('alias', userId, 24);   // one slot left of 25
    await setCounter('global', 'global', 0);
    const before5 = await state();
    const [raceA, raceB] = await Promise.all([
      post(email('Course A', 'Bonjour, êtes-vous disponible pour un entretien jeudi 14h ?')),
      post(email('Course B', 'Bonjour, seriez-vous libre pour un échange vendredi ?')),
    ]);
    await delay(4_000);
    const after5   = await state();
    const new5     = after5.threads.filter((t) => !before5.threads.some((b) => b.id === t.id));
    const skipped5 = new5.filter((t) => t.ai_skipped_reason === 'alias_limit');
    check('5 both emails are answered and kept', raceA.status === 200 && raceB.status === 200 && new5.length === 2,
      { statuses: [raceA.status, raceB.status], threads: new5.length });
    check('5 exactly one was classified, the other marked skipped',
      after5.usage.length === before5.usage.length + 1 && skipped5.length === 1,
      { usage: [before5.usage.length, after5.usage.length], skipped: skipped5.length });
    check('5 the counter stopped at the ceiling, never above', after5.aliasCount === 25, after5.aliasCount);

    // ── 6. A 100,000-character email ────────────────────────────────────────
    console.log('\n6. A body of 100,000 characters');
    await setCounter('alias', userId, 0);
    await setCounter('global', 'global', 0);
    const before6 = await state();
    const huge    = 'Bonjour, nous avons étudié votre candidature au poste de développeur backend. '.repeat(1_300).slice(0, 100_000);
    const long    = await post(email('Un très long fil', huge));
    await delay(4_000);
    const after6  = await state();
    const row6    = after6.usage.find((u) => !before6.usage.some((b) => b.id === u.id));
    check('6 the email is answered and classified', long.status === 200 && Boolean(row6), { status: long.status, row: row6?.id });
    check('6 what reached the model was cut to the catalogue ceiling, not 100,000 characters',
      Number(row6?.prompt_tokens) > 200 && Number(row6?.prompt_tokens) < 4_000,
      { prompt_tokens: row6?.prompt_tokens, note: '8,000 chars is about 2,700 tokens; 100,000 would be about 25,000' });

    // ── Traceability (block e5, step 6) ─────────────────────────────────────
    console.log('\n6b. The ledger row of a classification');
    check('the classification is logged as system_inbox_classify, on the alias owner, at zero credits',
      row6?.action === 'system_inbox_classify' && row6?.user_id === userId && row6?.credits_charged === 0,
      { action: row6?.action, user: row6?.user_id, credits: row6?.credits_charged });
    check('its real cost is recorded, so it shows up in cost_system_usd',
      Number(row6?.cost_usd) > 0 && row6?.status === 'settled', { cost: row6?.cost_usd, status: row6?.status });
    check('the model used is the catalogue one, not an id written in the route',
      row6?.model === (await admin.from('ai_action_costs').select('model').eq('action', 'system_inbox_classify').single()).data.model,
      row6?.model);

    // ── 7. The ceilings are read from admin_settings, live ──────────────────
    console.log('\n7. The ceilings come from admin_settings');
    await setCounter('alias', userId, 0);
    await setCounter('global', 'global', 0);
    await setCap('inbox_classify_per_alias_per_day', 0);
    const before7 = await state();
    const closed  = await post(email('Plafond mis à zéro', 'Bonjour, pouvons-nous échanger cette semaine ?'));
    await delay(1_500);
    const after7  = await state();
    const thread7 = after7.threads.find((t) => !before7.threads.some((b) => b.id === t.id));
    check('7 a ceiling set to 0 in the database stops the classification, with no deploy',
      closed.status === 200 && thread7?.ai_skipped_reason === 'alias_limit' && after7.usage.length === before7.usage.length,
      { skipped: thread7?.ai_skipped_reason, usage: [before7.usage.length, after7.usage.length] });

    await setCap('inbox_classify_per_alias_per_day', 25);
    const before7b = await state();
    const reopened = await post(email('Plafond rétabli', 'Bonjour, seriez-vous disponible lundi matin ?'));
    await delay(4_000);
    const after7b  = await state();
    const thread7b = after7b.threads.find((t) => !before7b.threads.some((b) => b.id === t.id));
    check('7 putting it back to 25 lets the next email be classified again',
      after7b.usage.length === before7b.usage.length + 1 && thread7b?.ai_skipped_reason === null && Boolean(thread7b?.ai_processed_at),
      { usage: [before7b.usage.length, after7b.usage.length], skipped: thread7b?.ai_skipped_reason });
    check('7 the counter followed the ceiling it was given', after7b.aliasCount === 1, after7b.aliasCount);

    // ── 8. The Free plan: 15 a month, and no reply written for it ───────────
    //
    // Reference §1 and §2: Free gets the address and the sorting — it is the
    // hook — but the secretary files the post, she does not answer it. Past 15
    // in a month the email still arrives and is still visible, carrying a
    // reason instead of an analysis.
    console.log('\n8. The Free plan');

    const nowUtc   = new Date();
    const month    = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const setMonth = async (count) => {
      const { error } = await admin.from('inbox_classify_counters')
        .upsert({ day: month, scope: 'month', subject: userId, count }, { onConflict: 'day,scope,subject' });
      if (error) throw error;
    };

    await admin.from('profiles')
      .update({ subscription_plan: 'free', subscription_status: null }).eq('id', userId);
    await setCounter('alias', userId, 0);
    await setCounter('global', 'global', 0);

    await setMonth(15);
    const before8 = await state();
    const over    = await post(email('Seizième du mois', 'Bonjour, nous souhaitons vous rencontrer la semaine prochaine.'));
    await delay(1_500);
    const after8  = await state();
    const thread8 = after8.threads.find((t) => !before8.threads.some((b) => b.id === t.id));
    check('8 the 16th email of the month is kept, with a readable reason, never lost',
      over.status === 200 && Boolean(thread8) && thread8?.ai_skipped_reason === 'monthly_limit' && thread8?.ai_processed_at === null,
      { status: over.status, skipped: thread8?.ai_skipped_reason });
    check('8 and it cost nothing: no model call, no ledger row',
      after8.usage.length === before8.usage.length, [before8.usage.length, after8.usage.length]);

    await setMonth(0);
    const before8b = await state();
    const within   = await post(email('Dans le quota', 'Bonjour, seriez-vous disponible pour un entretien mercredi à 10h ?'));
    await delay(4_000);
    const after8b  = await state();
    const thread8b = after8b.threads.find((t) => !before8b.threads.some((b) => b.id === t.id));
    check('8 inside the allowance, a Free email is classified normally',
      within.status === 200 && after8b.usage.length === before8b.usage.length + 1
        && thread8b?.ai_skipped_reason === null && Boolean(thread8b?.ai_processed_at),
      { status: within.status, usage: [before8b.usage.length, after8b.usage.length], skipped: thread8b?.ai_skipped_reason });
    check('8 no reply is written for a Free account — not in ai_draft, not hidden in the chips',
      !thread8b?.ai_draft && !thread8b?.ai_chips,
      { draft: thread8b?.ai_draft, chips: thread8b?.ai_chips });

    const spent = after7b.usage.reduce((sum, u) => sum + Number(u.cost_usd ?? 0), 0);
    console.log(`\nOpenRouter cost of this run: $${spent.toFixed(6)} over ${after7b.usage.length} classification(s)`);
  } finally {
    // ── Give back what the run borrowed ───────────────────────────────────────
    const { data: threads } = await admin
      .from('message_threads').select('id').eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
    if ((threads ?? []).length) {
      const { error } = await admin.from('message_threads').delete().in('id', threads.map((t) => t.id));
      if (error) console.log(`cleanup: threads not deleted: ${error.message}`);
    }
    const { error: aliasBack } = await admin.from('profiles').update({ email_alias: previousAlias }).eq('id', userId);
    if (aliasBack) console.log(`cleanup: alias not restored: ${aliasBack.message}`);
    const { error: settingsBack } = await admin.from('admin_settings').update({ value: originalSettings }).eq('key', 'global');
    if (settingsBack) console.log(`cleanup: ceilings not restored: ${settingsBack.message}`);
    const { error: aliasCounter } = await admin.from('inbox_classify_counters').delete()
      .eq('day', today).eq('scope', 'alias').eq('subject', userId);
    if (aliasCounter) console.log(`cleanup: alias counter not deleted: ${aliasCounter.message}`);
    const { error: globalCounter } = await admin.from('inbox_classify_counters')
      .upsert({ day: today, scope: 'global', subject: 'global', count: globalBefore }, { onConflict: 'day,scope,subject' });
    if (globalCounter) console.log(`cleanup: global counter not restored: ${globalCounter.message}`);

    // Section 8 moved the account onto Free and opened a monthly counter.
    const monthBack = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
    const { error: monthCounter } = await admin.from('inbox_classify_counters').delete()
      .eq('day', monthBack).eq('scope', 'month').eq('subject', userId);
    if (monthCounter) console.log(`cleanup: month counter not deleted: ${monthCounter.message}`);
    const { error: planBack } = await admin.from('profiles')
      .update({ subscription_plan: 'pro', subscription_status: 'active' }).eq('id', userId);
    if (planBack) console.log(`cleanup: plan not restored: ${planBack.message}`);
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
  console.error('\nINBOX WEBHOOK TEST FAILED TO RUN:', err);
  process.exit(1);
});
