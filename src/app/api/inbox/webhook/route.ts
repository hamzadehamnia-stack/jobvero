import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logApplicationEvent } from '@/lib/applicationEvents';

// Service-role client — bypasses RLS for inbound webhook inserts
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const WEBHOOK_SECRET = process.env.INBOX_WEBHOOK_SECRET;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Status keyword lists ─────────────────────────────────────────────────────

const KEYWORDS = {
  interview: [
    'entretien', 'interview', 'rendez-vous', 'rdv', 'rencontrer',
    'convoquer', 'convocation', 'schedule', 'meet', 'call us', 'available for',
  ],
  offer: [
    'offre', 'proposition', 'embauche', 'engagement', 'contract offer',
    "we'd like to offer", 'job offer', 'nous vous proposons',
  ],
  rejected: [
    'regret', 'désolé', 'ne pas donner suite', 'candidature non retenue',
    'unfortunately', 'not selected', 'not moving forward',
  ],
} as const;

type DetectedStatus = 'interview' | 'offer' | 'rejected';

function detectStatus(body: string): DetectedStatus | null {
  const lower = body.toLowerCase();
  if (KEYWORDS.offer.some(kw    => lower.includes(kw))) return 'offer';
  if (KEYWORDS.rejected.some(kw => lower.includes(kw))) return 'rejected';
  if (KEYWORDS.interview.some(kw => lower.includes(kw))) return 'interview';
  return null;
}

const STATUS_LABELS: Record<DetectedStatus, string> = {
  interview: 'Entretien',
  offer:     'Offre reçue',
  rejected:  'Refusé',
};

// ─── Extract username from an email address or a "Name <email>" string ────────

function parseUsername(addressStr: string): string {
  const angleMatch = addressStr.match(/<([^>]+)>/);
  const addr = angleMatch ? angleMatch[1] : addressStr;
  const local = addr.split('@')[0] ?? '';
  return local.toLowerCase();
}

// ─── Handle thread-based routing (reply+{uuid}@getjobvero.com) ───────────────

async function handleThreadReply(
  threadId: string,
  from: string,
  body: string,
  preview: string,
) {
  const { data: thread, error: threadErr } = await admin
    .from('message_threads')
    .select('id, user_id, company_name, unread_count')
    .eq('id', threadId)
    .single();

  if (threadErr || !thread) {
    console.warn('[inbox/webhook] thread not found:', threadId);
    return;
  }

  const { error: msgErr } = await admin.from('messages').insert({
    thread_id:  threadId,
    direction:  'inbound',
    from_email: from,
    body,
    read:       false,
  });
  if (msgErr) console.error('[inbox/webhook] message insert error:', msgErr);

  // Log reply event if there's a linked application
  const { data: appForEvent } = await admin
    .from('applications')
    .select('id')
    .eq('thread_id', threadId)
    .maybeSingle();

  if (appForEvent?.id) {
    await logApplicationEvent(admin, appForEvent.id, thread.user_id as string,
      'reply_received', `Reply received from ${from || 'employer'}`, { from });
  }

  // Status detection
  const detected = detectStatus(body);
  if (detected) {
    const { data: application, error: appErr } = await admin
      .from('applications')
      .select('id, status, company_name')
      .eq('thread_id', threadId)
      .maybeSingle();

    if (!appErr && application) {
      const currentStatus = application.status as string;
      const companyName   = (application.company_name as string) || (thread.company_name as string) || 'Unknown';
      const shouldUpdate  =
        detected === 'offer'    ||
        detected === 'rejected' ||
        (detected === 'interview' && currentStatus === 'applied');

      if (shouldUpdate && currentStatus !== detected) {
        const { error: updateErr } = await admin
          .from('applications')
          .update({ status: detected, updated_at: new Date().toISOString() })
          .eq('id', application.id);

        if (!updateErr) {
          await logApplicationEvent(admin, application.id, thread.user_id as string,
            'status_changed',
            `Status updated to ${STATUS_LABELS[detected]} (${detected})`,
            { from: currentStatus, to: detected });

          await admin.from('notifications').insert({
            user_id: thread.user_id,
            type:    'status_update',
            title:   `Statut mis à jour : ${companyName} — ${STATUS_LABELS[detected]}`,
            message: `${companyName} a répondu à votre candidature. ` +
                     `Nouveau statut : ${STATUS_LABELS[detected]}. ` +
                     `Ouvrez la messagerie pour lire la réponse complète.`,
            read:    false,
          });
        }
      }
    }
  }

  // Update thread metadata
  await admin.from('message_threads').update({
    unread_count:           (thread.unread_count ?? 0) + 1,
    last_message_at:        new Date().toISOString(),
    last_message_preview:   preview,
    last_message_direction: 'inbound',
  }).eq('id', threadId);
}

// ─── Handle alias-based routing ({alias}@getjobvero.com) ─────────────────────

async function handleAliasEmail(
  username: string,
  from: string,
  subject: string,
  body: string,
  preview: string,
) {
  // Look up user by email_alias
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id')
    .eq('email_alias', username)
    .single();

  if (profileErr || !profile) {
    console.warn(`[inbox/webhook] no user found for alias "${username}" — dropping email from ${from}`);
    return;
  }

  const userId = profile.id as string;

  // Find the most recent non-deleted thread between this user and the sender
  const { data: existingThread } = await admin
    .from('message_threads')
    .select('id, unread_count')
    .eq('user_id', userId)
    .eq('employer_email', from)
    .eq('deleted', false)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let threadId: string;

  if (existingThread) {
    threadId = existingThread.id as string;
  } else {
    // Create a new thread for this conversation
    const { data: newThread, error: threadErr } = await admin
      .from('message_threads')
      .insert({
        user_id:                userId,
        job_title:              '',
        company_name:           '',
        employer_email:         from,
        subject:                subject || '(Sans objet)',
        last_message_preview:   preview,
        unread_count:           0,
        last_message_direction: 'inbound',
      })
      .select('id')
      .single();

    if (threadErr || !newThread) {
      console.error('[inbox/webhook] failed to create thread for alias routing:', threadErr);
      return;
    }
    threadId = newThread.id as string;
  }

  const { error: msgErr } = await admin.from('messages').insert({
    thread_id:  threadId,
    direction:  'inbound',
    from_email: from,
    body,
    read:       false,
  });
  if (msgErr) console.error('[inbox/webhook] message insert error (alias):', msgErr);

  // Update thread metadata
  const { data: thread } = await admin
    .from('message_threads')
    .select('unread_count')
    .eq('id', threadId)
    .single();

  await admin.from('message_threads').update({
    unread_count:           ((thread?.unread_count as number) ?? 0) + 1,
    last_message_at:        new Date().toISOString(),
    last_message_preview:   preview,
    last_message_direction: 'inbound',
  }).eq('id', threadId);

  console.log(`[inbox/webhook] alias routing: ${username}@getjobvero.com → user=${userId} thread=${threadId}`);
}

// ─── Webhook handler ──────────────────────────────────────────────────────────
// Receives forwarded inbound emails from the Cloudflare Email Worker
// (see cloudflare-email-worker/). Payload: { from, to, subject, text, html, messageId }

export async function POST(req: Request) {
  const secret = req.headers.get('x-webhook-secret');
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await req.json() as {
      from?: string; to?: string; subject?: string; text?: string; html?: string;
    };

    const toStr   = payload.to ?? '';
    const from    = payload.from ?? '';
    const subject = payload.subject ?? '';
    const rawBody = payload.text || (payload.html ? stripHtml(payload.html) : '');
    const body    = rawBody.trim() || '(message vide)';
    const preview = body.slice(0, 120);

    // 1. Handle reply+{uuid}@getjobvero.com (existing thread-reply routing)
    const threadMatch = toStr.match(/reply\+([0-9a-f-]{36})@/i);
    if (threadMatch) {
      console.log(`[inbox/webhook] thread reply: ${threadMatch[1]}`);
      await handleThreadReply(threadMatch[1], from, body, preview);
      return NextResponse.json({ ok: true });
    }

    // 2. Parse the username from the To address
    const username = parseUsername(toStr);

    // 3. Skip special system addresses
    if (!username || username === 'noreply') {
      console.log(`[inbox/webhook] ignoring email to "${toStr}"`);
      return NextResponse.json({ ok: true });
    }

    if (username === 'reply') {
      // reply@ without a uuid — log and skip
      console.warn('[inbox/webhook] bare reply@ address (no uuid) — skipping:', toStr);
      return NextResponse.json({ ok: true });
    }

    if (username === 'apply') {
      // Legacy fallback: try to find a thread by subject line containing a known thread ID
      const subjectThreadMatch = subject.match(/([0-9a-f-]{36})/i);
      if (subjectThreadMatch) {
        await handleThreadReply(subjectThreadMatch[1], from, body, preview);
      } else {
        console.warn('[inbox/webhook] apply@ address with no thread ID in subject — dropping');
      }
      return NextResponse.json({ ok: true });
    }

    // 4. Route by email_alias
    await handleAliasEmail(username, from, subject, body, preview);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[inbox/webhook] error:', err);
    return NextResponse.json({ ok: true }); // always 200 so the Worker doesn't bounce the email on a processing error
  }
}
