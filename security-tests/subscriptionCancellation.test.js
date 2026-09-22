// A cancellation, and everything that is NOT one, through the real webhook.
//
// Run it:  node security-tests/subscriptionCancellation.test.js
//   (the dev server must be listening on 127.0.0.1:3000)
//
// WHY THESE FIXTURES LOOK LIKE THIS
//
// On 2026-09-22 a customer cancelled in the Stripe portal and Jobvero did not
// notice. The handler tested `cancel_at_period_end`; the account's API version
// (2026-04-22.dahlia) expresses a portal cancellation as `cancel_at` and leaves
// that flag false, and it had moved the billing period onto the subscription
// ITEM. Nothing failed loudly — the event was answered 200.
//
// So the payloads below are not invented. They are the shape of the two events
// actually received that day (evt_1UIT61…, evt_1UIT63…), with the identifiers
// replaced: same field names, same nesting, same types, same nulls. A fixture
// that is prettier than reality tests nothing.
//
// ISOLATION: every case runs against ONE disposable account created here and
// deleted at the end, together with its grants and the stripe_events rows this
// run wrote. No existing account is read or written. A test suite that touches
// a real customer is a test suite that can bill one.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const URL  = 'http://127.0.0.1:3000/api/webhooks/stripe';

for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

let passed = 0;
let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ok    ${label}`); }
  else    { failed++; console.log(`  FAIL  ${label}\n          attendu ${JSON.stringify(want)}\n          obtenu  ${JSON.stringify(got)}`); }
  return ok;
}

// ─── Fixtures, modelled on the real payloads ─────────────────────────────────

const STAMP     = Date.now();
const SUB_ID    = `sub_test_${STAMP}`;
const ITEM_ID   = `si_test_${STAMP}`;
// The real period of the real cancellation, kept: 2026-09-22 → 2026-10-22.
const P_START   = 1790071560;
const P_END     = 1792663560;

/**
 * A customer.subscription.updated event in the CURRENT shape: period on the
 * item, no top-level period at all, cancellation expressed by `cancel_at`.
 */
function currentShape({ id, customer, priceId, cancelAt, canceledAt, previous, feedback }) {
  return {
    id,
    object: 'event',
    api_version: '2026-04-22.dahlia',
    created: Math.floor(STAMP / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'customer.subscription.updated',
    data: {
      previous_attributes: previous ?? { cancel_at: null, canceled_at: null },
      object: {
        id: SUB_ID,
        object: 'subscription',
        customer,
        status: 'active',
        cancel_at: cancelAt ?? null,
        cancel_at_period_end: false,
        canceled_at: canceledAt ?? null,
        cancellation_details: {
          comment: null,
          feedback: feedback ?? null,
          feedback_option: null,
          reason: cancelAt ? 'cancellation_requested' : null,
        },
        currency: 'usd',
        livemode: false,
        metadata: {},
        start_date: P_START,
        test_clock: null,
        trial_end: null,
        trial_start: null,
        items: {
          object: 'list',
          has_more: false,
          data: [{
            id: ITEM_ID,
            object: 'subscription_item',
            created: P_START,
            current_period_start: P_START,
            current_period_end: P_END,
            metadata: {},
            quantity: 1,
            subscription: SUB_ID,
            price: { id: priceId, object: 'price', active: true, currency: 'usd' },
          }],
        },
      },
    },
  };
}

/**
 * The LEGACY shape: period at the top level, cancellation expressed by
 * `cancel_at_period_end: true` and no `cancel_at`. An event replayed from the
 * dashboard, or created under an older version, still arrives like this.
 */
function legacyShape({ id, customer, priceId }) {
  return {
    id,
    object: 'event',
    api_version: '2025-01-27.acacia',
    created: Math.floor(STAMP / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'customer.subscription.updated',
    data: {
      previous_attributes: { cancel_at_period_end: false },
      object: {
        id: SUB_ID,
        object: 'subscription',
        customer,
        status: 'active',
        cancel_at: null,
        cancel_at_period_end: true,
        canceled_at: Math.floor(STAMP / 1000),
        current_period_start: P_START,
        current_period_end: P_END,
        currency: 'usd',
        livemode: false,
        metadata: {},
        items: {
          object: 'list',
          has_more: false,
          data: [{
            id: ITEM_ID,
            object: 'subscription_item',
            subscription: SUB_ID,
            quantity: 1,
            price: { id: priceId, object: 'price', active: true, currency: 'usd' },
          }],
        },
      },
    },
  };
}

// ─── The run ──────────────────────────────────────────────────────────────────

(async () => {
  const { createClient } = require(`${ROOT}/node_modules/@supabase/supabase-js`);
  const Stripe           = require(`${ROOT}/node_modules/stripe`);

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const priceId = process.env.STRIPE_PRICE_PRO;
  if (!secret)  { console.log('  FAIL  STRIPE_WEBHOOK_SECRET absent'); process.exit(1); }
  if (!priceId) { console.log('  FAIL  STRIPE_PRICE_PRO absent');      process.exit(1); }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const admin  = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const CUSTOMER = `cus_test_${STAMP}`;
  const eventIds = [];
  let userId = null;

  async function post(event) {
    const payload = JSON.stringify(event);
    const header  = stripe.webhooks.generateTestHeaderString({ payload, secret });
    eventIds.push(event.id);
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
      body: payload,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async function state() {
    const { data } = await admin.from('profiles')
      .select('subscription_plan, subscription_status, ai_credits_remaining, scheduled_plan, cancel_at_period_end, current_period_end')
      .eq('id', userId).maybeSingle();
    const { count } = await admin.from('credit_grants')
      .select('grant_key', { count: 'exact', head: true }).eq('user_id', userId);
    return { ...data, grants: count ?? 0 };
  }

  try {
    // ── A disposable Pro account ─────────────────────────────────────────────
    const email = `cancel-test-${STAMP}@jobvero-test.local`;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password: `Cancel-${STAMP}-Test!`, email_confirm: true,
    });
    if (cErr) { console.log(`  FAIL  compte jetable non cree : ${cErr.message}`); process.exit(1); }
    userId = created.user.id;

    // The profile row may be created by a trigger, or not at all. Wait for it,
    // then write on top of whatever is there.
    //
    // The first version of this file ran a bare UPDATE against a row that did
    // not exist yet. Every assertion then read `undefined` — and worse, the
    // webhook could not find the account either, so it bailed out early and the
    // "nothing was granted" checks passed while proving nothing whatsoever.
    // A test that cannot tell "correct" from "never ran" is worse than no test,
    // so the setup below is asserted before any case is allowed to run.
    const fields = {
      id:                     userId,
      is_test_account:        true,
      subscription_plan:      'pro',
      subscription_status:    'active',
      ai_credits_remaining:   60,
      current_period_start:   new Date(P_START * 1000).toISOString(),
      current_period_end:     new Date(P_END   * 1000).toISOString(),
      stripe_customer_id:     CUSTOMER,
      stripe_subscription_id: SUB_ID,
      scheduled_plan:         null,
      cancel_at_period_end:   false,
    };

    // Converge, do not wait. A fixed pause was a race and lost it twice: on the
    // first run the row did not exist yet and a bare UPDATE touched nothing; on
    // the second the database had just created it with the Free allowance, so
    // the fixture's 60 credits were overwritten by 10 between the write and the
    // read. Polling until the database AGREES is the only version of this that
    // does not depend on how fast a trigger happens to be today.
    let ready = null;
    for (let attempt = 1; attempt <= 20 && !ready; attempt++) {
      const { data: row } = await admin
        .from('profiles').select('id').eq('id', userId).maybeSingle();

      if (row) {
        await admin.from('profiles').update(fields).eq('id', userId);
      } else {
        // The row may appear between the check and the insert: a duplicate key
        // here means the database won the race, which is fine — the next turn
        // of the loop updates it.
        const { error } = await admin.from('profiles').insert(fields);
        if (error && error.code !== '23505') {
          throw new Error(`profil jetable non prepare : ${error.message}`);
        }
      }

      const seen = await state();
      if (seen.subscription_plan === 'pro'
          && seen.ai_credits_remaining === 60
          && seen.cancel_at_period_end === false
          && seen.scheduled_plan === null) {
        ready = seen;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    if (!ready) {
      const seen = await state();
      throw new Error(`le profil jetable n'a pas converge vers l'etat attendu : ${JSON.stringify(seen)}`);
    }

    console.log(`\nCompte jetable ${userId} — Pro, 60 credits, periode au ${new Date(P_END * 1000).toISOString().slice(0, 10)}\n`);

    // ── 1. Cancellation expressed by cancel_at (the shape that broke) ────────
    console.log('1. resiliation via cancel_at');
    let r = await post(currentShape({
      id: `evt_test_${STAMP}_cancel`, customer: CUSTOMER, priceId,
      cancelAt: P_END, canceledAt: Math.floor(STAMP / 1000),
    }));
    check('1 le webhook accepte', r.status, 200);
    let s = await state();
    check('1 resiliation programmee', s.cancel_at_period_end, true);
    check('1 bascule vers Gratuit programmee', s.scheduled_plan, 'free');
    check('1 toujours Pro aujourd hui', s.subscription_plan, 'pro');
    check('1 credits intacts', s.ai_credits_remaining, 60);
    check('1 aucune attribution', s.grants, 0);

    // ── 2. An event that carries only the reason: no effect ──────────────────
    console.log('\n2. evenement ne portant que le motif');
    r = await post(currentShape({
      id: `evt_test_${STAMP}_feedback`, customer: CUSTOMER, priceId,
      cancelAt: P_END, canceledAt: Math.floor(STAMP / 1000),
      previous: { cancellation_details: { feedback: null } }, feedback: 'other',
    }));
    check('2 le webhook accepte', r.status, 200);
    s = await state();
    check('2 etat inchange (resiliation)', s.cancel_at_period_end, true);
    check('2 etat inchange (bascule)', s.scheduled_plan, 'free');
    check('2 credits intacts', s.ai_credits_remaining, 60);
    check('2 aucune attribution', s.grants, 0);

    // ── 3. The customer changes their mind ───────────────────────────────────
    console.log('\n3. annulation de la resiliation');
    r = await post(currentShape({
      id: `evt_test_${STAMP}_uncancel`, customer: CUSTOMER, priceId,
      cancelAt: null, canceledAt: null,
      previous: { cancel_at: P_END, canceled_at: Math.floor(STAMP / 1000) },
    }));
    check('3 le webhook accepte', r.status, 200);
    s = await state();
    check('3 plus de resiliation', s.cancel_at_period_end, false);
    check('3 plus de bascule programmee', s.scheduled_plan, null);
    check('3 toujours Pro', s.subscription_plan, 'pro');
    check('3 credits intacts', s.ai_credits_remaining, 60);
    check('3 aucune attribution', s.grants, 0);

    // ── 4. The legacy spelling still means the same thing ────────────────────
    console.log('\n4. resiliation via cancel_at_period_end (ancienne forme)');
    r = await post(legacyShape({ id: `evt_test_${STAMP}_legacy`, customer: CUSTOMER, priceId }));
    check('4 le webhook accepte', r.status, 200);
    s = await state();
    check('4 resiliation programmee', s.cancel_at_period_end, true);
    check('4 bascule vers Gratuit programmee', s.scheduled_plan, 'free');
    check('4 credits intacts', s.ai_credits_remaining, 60);
    check('4 aucune attribution', s.grants, 0);

    // ── 5. A replay changes nothing ──────────────────────────────────────────
    console.log('\n5. evenement rejoue');
    const replay = currentShape({
      id: `evt_test_${STAMP}_replay`, customer: CUSTOMER, priceId,
      cancelAt: null, canceledAt: null,
    });
    const first  = await post(replay);
    const before = await state();
    const second = await post(replay);
    check('5 premiere livraison acceptee', first.status, 200);
    check('5 seconde livraison acceptee', second.status, 200);
    check('5 seconde livraison signalee comme doublon', second.body.duplicate, true);
    const after = await state();
    check('5 etat identique apres rejeu', after, before);
    const { count: rows } = await admin.from('stripe_events')
      .select('id', { count: 'exact', head: true }).eq('id', replay.id);
    check('5 une seule ligne dans stripe_events', rows, 1);

  } finally {
    // ── Nothing of this run stays in the database ────────────────────────────
    if (userId) {
      await admin.from('credit_grants').delete().eq('user_id', userId);
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
    if (eventIds.length) {
      await admin.from('stripe_events').delete().in('id', [...new Set(eventIds)]);
    }

    const { count: leftEvents } = await admin.from('stripe_events')
      .select('id', { count: 'exact', head: true }).in('id', [...new Set(eventIds)]);
    const { count: leftProfile } = userId
      ? await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId)
      : { count: 0 };

    console.log('\nNettoyage');
    check('aucun evenement de test restant', leftEvents ?? 0, 0);
    check('aucun profil de test restant', leftProfile ?? 0, 0);
  }

  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => { console.error(err); process.exitCode = 1; });
