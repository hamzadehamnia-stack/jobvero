import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { threadId, body, attachmentUrl, attachmentName, attachmentSize } = await req.json() as {
    threadId: string; body: string;
    attachmentUrl?: string | null; attachmentName?: string | null; attachmentSize?: number | null;
  };
  if (!threadId || !body?.trim()) {
    return NextResponse.json({ error: 'threadId and body are required' }, { status: 400 });
  }

  // Verify thread belongs to user
  const { data: thread } = await supabase
    .from('message_threads')
    .select('id, employer_email, subject, company_name')
    .eq('id', threadId)
    .single();

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single();

  const userName = profile?.full_name ?? user.email ?? 'Candidat';
  const subject  = `Re: ${thread.subject}`;

  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (attachmentUrl && attachmentName) {
    try {
      const fileRes = await fetch(attachmentUrl);
      if (fileRes.ok) {
        attachments = [{ filename: attachmentName, content: Buffer.from(await fileRes.arrayBuffer()) }];
      } else {
        console.warn('[inbox/reply] attachment fetch failed:', fileRes.status);
      }
    } catch (e) {
      console.error('[inbox/reply] attachment fetch error:', e);
    }
  }

  // Send via Resend — keep Reply-To wired to same thread
  const { error: sendErr } = await resend.emails.send({
    from:    `${userName} via Jobvero <apply@getjobvero.com>`,
    replyTo: `reply+${threadId}@getjobvero.com`,
    to:      [thread.employer_email],
    subject,
    html:    `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#1a1a2e;">${body.trim()}</div>`,
    ...(attachments ? { attachments } : {}),
  });

  if (sendErr) {
    console.error('[inbox/reply] Resend error:', sendErr);
    return NextResponse.json({ error: sendErr.message }, { status: 500 });
  }

  // Insert outbound message
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({
      thread_id:   threadId,
      direction:   'outbound',
      from_email:  'apply@getjobvero.com',
      to_email:    thread.employer_email,
      subject,
      body:        body.trim(),
      read:        true,
      attachments: attachmentUrl && attachmentName ? [{ url: attachmentUrl, name: attachmentName, size: attachmentSize ?? null }] : null,
    })
    .select()
    .single();

  if (msgErr) {
    console.error('[inbox/reply] message insert error:', msgErr);
    return NextResponse.json({ error: 'DB insert failed' }, { status: 500 });
  }

  // Update thread metadata
  const preview = body.trim().slice(0, 120);
  await supabase.from('message_threads').update({
    last_message_at:        new Date().toISOString(),
    last_message_preview:   preview,
    last_message_direction: 'outbound',
  }).eq('id', threadId);

  return NextResponse.json({ message });
}
