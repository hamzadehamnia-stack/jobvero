import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { to, subject, body } = await req.json() as {
      to: string; subject: string; body: string;
    };

    if (!to?.trim() || !subject?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'to, subject and body are required' }, { status: 400 });
    }

    // Fetch sender identity
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email_alias')
      .eq('id', user.id)
      .single();

    const senderName  = profile?.full_name  ?? 'Jobvero';
    const emailAlias  = profile?.email_alias ?? null;
    const fromAddress = emailAlias
      ? `${senderName} <${emailAlias}@getjobvero.com>`
      : `Jobvero <apply@getjobvero.com>`;
    const fromEmail   = emailAlias ? `${emailAlias}@getjobvero.com` : 'apply@getjobvero.com';

    const preview = body.trim().slice(0, 120);

    // Create thread
    const { data: thread, error: threadErr } = await supabase
      .from('message_threads')
      .insert({
        user_id:                user.id,
        job_title:              '',
        company_name:           '',
        employer_email:         to.trim(),
        subject:                subject.trim(),
        last_message_preview:   preview,
        unread_count:           0,
        last_message_direction: 'outbound',
        status:                 'sent',
      })
      .select()
      .single();

    if (threadErr || !thread) {
      console.error('[compose] thread insert error:', threadErr?.message, threadErr);
      return NextResponse.json({ error: `Failed to create thread: ${threadErr?.message ?? 'unknown'}` }, { status: 500 });
    }

    // Insert outbound message
    const { error: msgErr } = await supabase.from('messages').insert({
      thread_id:  thread.id,
      direction:  'outbound',
      from_email: fromEmail,
      to_email:   to.trim(),
      subject:    subject.trim(),
      body:       body.trim(),
      read:       true,
    });

    if (msgErr) {
      console.error('[compose] message insert error:', msgErr.message, msgErr);
      return NextResponse.json({ error: `Failed to save message: ${msgErr.message}` }, { status: 500 });
    }

    const safeBody = body.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const { error: sendErr } = await resend.emails.send({
      from:    fromAddress,
      to:      [to.trim()],
      subject: subject.trim(),
      html:    `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;white-space:pre-line;color:#1a1a2e;">${safeBody}</div>`,
    });

    if (sendErr) {
      console.error('[compose] Resend error:', sendErr);
      return NextResponse.json({ error: `Failed to send email: ${sendErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ thread_id: thread.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[compose] unhandled error:', message, err);
    return NextResponse.json({ error: `Internal server error: ${message}` }, { status: 500 });
  }
}
