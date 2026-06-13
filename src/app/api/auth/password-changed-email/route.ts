import { NextResponse } from 'next/server';
import * as React from 'react';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';
import PasswordChangedEmail from '@/emails/PasswordChangedEmail';
import { emailTranslations, type Locale } from '@/emails/translations';

const resend = new Resend(process.env.RESEND_API_KEY!);
const SUPPORTED_LOCALES: Locale[] = ['en', 'fr', 'es', 'pt'];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { email, locale: rawLocale } = body as { email: string; locale: string };
  const locale: Locale = SUPPORTED_LOCALES.includes(rawLocale as Locale) ? (rawLocale as Locale) : 'en';

  const t = emailTranslations.passwordChanged[locale];

  try {
    const html = await render(
      React.createElement(PasswordChangedEmail, { locale, changedAt: new Date() })
    );
    await resend.emails.send({
      from: 'Jobvero <noreply@getjobvero.com>',
      to: email,
      subject: t.subject,
      html,
    });
  } catch (err) {
    console.error('[password-changed-email] Failed to send:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
