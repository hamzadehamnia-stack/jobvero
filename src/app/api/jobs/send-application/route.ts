import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';
import { logApplicationEvent } from '@/lib/applicationEvents';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    coverLetterHtml,
    coverLetterText,
    jobTitle,
    company,
    employerEmail,
    jobId,
    jobLocation,
    salary,
    jobUrl,
  } = await req.json() as {
    coverLetterHtml:  string;
    coverLetterText?: string;
    jobTitle:         string;
    company:          string;
    employerEmail:    string;
    jobId?:           string;
    jobLocation?:     string;
    salary?:          string;
    jobUrl?:          string;
  };

  if (!employerEmail) {
    return NextResponse.json({ error: 'No employer email provided' }, { status: 400 });
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, email_alias')
    .eq('id', user.id)
    .single();

  const userName    = profile?.full_name  ?? user.email ?? 'Candidat';
  const userEmail   = profile?.email      ?? user.email ?? '';
  const emailAlias  = profile?.email_alias ?? null;
  const fromAddress = emailAlias
    ? `${userName} <${emailAlias}@getjobvero.com>`
    : `${userName} via Jobvero <apply@getjobvero.com>`;
  const fromEmail   = emailAlias ? `${emailAlias}@getjobvero.com` : 'apply@getjobvero.com';
  const subject     = `Candidature - ${jobTitle}`;

  // ── Create thread first (we need the UUID for Reply-To) ──────────────────

  const preview = (coverLetterText ?? coverLetterHtml.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  const { data: thread, error: threadErr } = await supabase
    .from('message_threads')
    .insert({
      user_id:              user.id,
      job_id:               jobId ?? null,
      job_title:            jobTitle,
      company_name:         company,
      employer_email:       employerEmail,
      subject,
      last_message_preview: preview,
      unread_count:         0,
    })
    .select('id')
    .single();

  if (threadErr || !thread) {
    console.error('[send-application] thread insert error:', threadErr);
    return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 });
  }

  const threadId = thread.id as string;

  // ── Store outbound message in DB ─────────────────────────────────────────

  await supabase.from('messages').insert({
    thread_id:  threadId,
    direction:  'outbound',
    from_email: fromEmail,
    to_email:   employerEmail,
    subject,
    body:       coverLetterText ?? preview,
    read:       true,
  });

  // ── Try to attach CV PDF from storage ─────────────────────────────────────

  const attachments: { filename: string; content: Buffer; content_type: string }[] = [];
  const { data: cvBlob, error: cvErr } = await supabase.storage
    .from('cvs')
    .download(`${user.id}/cv.pdf`);

  if (!cvErr && cvBlob) {
    const buf = Buffer.from(await cvBlob.arrayBuffer());
    attachments.push({ filename: 'CV.pdf', content: buf, content_type: 'application/pdf' });
  }

  // ── Send via Resend with Reply-To wired to the thread ────────────────────

  const { error: sendErr } = await resend.emails.send({
    from:       fromAddress,
    replyTo:    `reply+${threadId}@getjobvero.com`,
    to:         [employerEmail],
    subject,
    html:       coverLetterHtml,
    attachments,
  });

  if (sendErr) {
    console.error('[send-application] Resend error:', sendErr);
    return NextResponse.json({ error: sendErr.message }, { status: 500 });
  }

  // ── Save to applications table with status "applied" ─────────────────────

  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const { data: appRow } = await supabase.from('applications').insert({
    user_id:          user.id,
    job_title:        jobTitle,
    company_name:     company,
    company_email:    employerEmail,
    location:         jobLocation      ?? null,
    salary:           salary           ?? null,
    status:           'applied',
    notes:            `Postulé via Jobvero le ${today}`,
    job_url:          jobUrl           ?? null,
    thread_id:        threadId,
    cover_letter:     coverLetterText  ?? null,
    job_source:       'jobvero',
    application_type: 'auto',
    send_status:      'sent',
    sent_at:          new Date().toISOString(),
  }).select('id').single();

  if (appRow?.id) {
    await logApplicationEvent(supabase, appRow.id, user.id, 'created',
      `Application created for ${jobTitle} at ${company}`);
    await logApplicationEvent(supabase, appRow.id, user.id, 'sent',
      `Cover letter sent to ${employerEmail}`, { thread_id: threadId });
  }

  return NextResponse.json({ success: true, threadId });
}
