import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { threadId, body } = await req.json() as { threadId: string; body: string };
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
  const safeBody = body.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Send via Resend — keep Reply-To wired to same thread
  const { error: sendErr } = await resend.emails.send({
    from:    `${userName} via Jobvero <apply@getjobvero.com>`,
    replyTo: `reply+${threadId}@getjobvero.com`,
    to:      [thread.employer_email],
    subject,
    html:    `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;white-space:pre-line;color:#1a1a2e;">${safeBody}</div>`,
  });

  if (sendErr) {
    console.error('[inbox/reply] Resend error:', sendErr);
    return NextResponse.json({ error: sendErr.message }, { status: 500 });
  }

  // Insert outbound message
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({
      thread_id:  threadId,
      direction:  'outbound',
      from_email: 'apply@getjobvero.com',
      to_email:   thread.employer_email,
      subject,
      body:       body.trim(),
      read:       true,
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
