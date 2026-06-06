import { NextResponse } from 'next/server';
import { Resend }       from 'resend';
import { requireAdmin } from '../_guard';
import { createAdminClient } from '@/lib/supabase/admin';

const resend       = new Resend(process.env.RESEND_API_KEY);
const SUPPORT_FROM = 'support@getjobvero.com';

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { messageId, userId, userEmail, subject, replyText } =
    await req.json() as {
      messageId: string;
      userId:    string;
      userEmail: string;
      subject:   string;
      replyText: string;
    };

  if (!messageId || !userId || !userEmail || !replyText?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    // ── 1. Send reply email to user ─────────────────────────────────────────
    const safeReply = replyText.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    const replyHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a2e;">
        <div style="background:linear-gradient(135deg,#7C3AED,#4F46E5);padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;color:#fff;font-size:20px;">💬 Réponse de l'équipe Jobvero</h2>
        </div>
        <div style="background:#f9fafb;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">En réponse à votre demande : <strong>${subject.trim()}</strong></p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;line-height:1.8;color:#374151;">${safeReply}</div>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
          <p style="margin:0;color:#6b7280;font-size:13px;">L'équipe Jobvero 💜</p>
        </div>
        <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:16px;">Jobvero · support@getjobvero.com</p>
      </div>`;

    const { error: emailErr } = await resend.emails.send({
      from:    `Jobvero Support <${SUPPORT_FROM}>`,
      to:      [userEmail],
      subject: `Re: ${subject.trim()}`,
      html:    replyHtml,
    });

    if (emailErr) {
      console.error('[reply-support] resend error:', emailErr);
      return NextResponse.json({ error: `Email failed: ${emailErr.message}` }, { status: 500 });
    }

    // ── 2. Save reply into the user's Inbox (message_threads + messages) ────
    // Find or create a support thread for this user
    const SUPPORT_SUBJECT = `[Support] ${subject.trim()}`;

    let threadId: string | null = null;

    const { data: existing } = await admin
      .from('message_threads')
      .select('id')
      .eq('user_id', userId)
      .eq('subject', SUPPORT_SUBJECT)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      threadId = existing.id as string;
    } else {
      const { data: newThread, error: threadErr } = await admin
        .from('message_threads')
        .insert({
          user_id:              userId,
          job_title:            'Support',
          company_name:         'Jobvero',
          employer_email:       SUPPORT_FROM,
          subject:              SUPPORT_SUBJECT,
          last_message_preview: replyText.trim().slice(0, 120),
          unread_count:         1,
          last_message_at:      new Date().toISOString(),
          last_message_direction: 'inbound',
        })
        .select('id')
        .single();

      if (threadErr) {
        console.warn('[reply-support] thread insert error:', threadErr.message);
      } else {
        threadId = (newThread as { id: string }).id;
      }
    }

    if (threadId) {
      // Update thread's last message metadata
      await admin.from('message_threads').update({
        last_message_preview:   replyText.trim().slice(0, 120),
        last_message_at:        new Date().toISOString(),
        last_message_direction: 'inbound',
        unread_count:           1,
      }).eq('id', threadId);

      // Insert the reply message
      await admin.from('messages').insert({
        thread_id:  threadId,
        direction:  'inbound',
        from_email: SUPPORT_FROM,
        to_email:   userEmail,
        subject:    `Re: ${subject.trim()}`,
        body:       replyText.trim(),
        read:       false,
      });
    }

    // ── 3. Mark support ticket as replied ───────────────────────────────────
    const { error: updateErr } = await admin
      .from('support_messages')
      .update({
        status:     'replied',
        reply_text: replyText.trim(),
        replied_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    if (updateErr) {
      console.warn('[reply-support] status update error:', updateErr.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reply-support]', err);
    const msg = err instanceof Error ? err.message : 'Reply failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
