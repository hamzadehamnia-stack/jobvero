import * as React from 'react';
import { Webhook } from 'standardwebhooks';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import ResetPasswordEmail from '@/emails/ResetPasswordEmail';
import ConfirmSignupEmail from '@/emails/ConfirmSignupEmail';
import EmailChangeEmail from '@/emails/EmailChangeEmail';
import OTPEmail from '@/emails/OTPEmail';
import { emailTranslations, type Locale } from '@/emails/translations';

const resend = new Resend(process.env.RESEND_API_KEY!);

const SUPPORTED: Locale[] = ['en', 'fr', 'es', 'pt'];

function detectLocale(redirectTo: string | undefined, userMetadata: Record<string, unknown> | undefined): Locale {
  // 1. From redirect_to (e.g. https://getjobvero.com/fr/...)
  if (redirectTo) {
    try {
      const url = new URL(redirectTo);
      const seg = url.pathname.split('/').filter(Boolean)[0];
      if (SUPPORTED.includes(seg as Locale)) return seg as Locale;
    } catch {
      // invalid URL — fall through
    }
  }
  // 2. From user_metadata
  const metaLocale = (userMetadata?.locale ?? userMetadata?.language) as string | undefined;
  if (metaLocale && SUPPORTED.includes(metaLocale as Locale)) return metaLocale as Locale;
  // 3. Fallback
  return 'en';
}

interface EmailData {
  token: string;
  token_hash: string;
  redirect_to?: string;
  email_action_type: string;
  site_url: string;
}

interface HookPayload {
  user: {
    email: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: EmailData;
}

export async function POST(request: Request) {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  // ---- 1. Verify hook signature ----
  const rawSecret = process.env.SEND_EMAIL_HOOK_SECRET ?? '';
  // Supabase provides the secret as "v1,whsec_xxx" — standardwebhooks expects "whsec_xxx"
  const hookSecret = rawSecret.replace('v1,', '');

  let data: HookPayload;
  try {
    const wh = new Webhook(hookSecret);
    data = wh.verify(payload, headers) as HookPayload;
  } catch (err) {
    console.error('[send-email] Signature verification failed:', err);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { user, email_data } = data;
  const { token, token_hash, redirect_to, email_action_type, site_url } = email_data;
  const locale = detectLocale(redirect_to, user?.user_metadata);

  // ---- 2. Build confirmation link ----
  // For recovery, always redirect through our PKCE callback regardless of what
  // Supabase passes as redirect_to (Supabase strips it if not in the allowlist).
  const supabaseBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
  const effectiveRedirect = email_action_type === 'recovery'
    ? `https://getjobvero.com/api/auth/callback?next=/${locale}/auth/reset-password`
    : (redirect_to ?? site_url);
  const confirmLink = `${supabaseBaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(effectiveRedirect)}`;

  // ---- 3. Route to the right template ----
  let emailComponent: React.ReactElement;
  let subject: string;

  switch (email_action_type) {
    case 'signup':
      emailComponent = React.createElement(ConfirmSignupEmail, { confirmLink, locale });
      subject = emailTranslations.confirmSignup[locale].subject;
      break;
    case 'recovery':
      emailComponent = React.createElement(ResetPasswordEmail, { resetLink: confirmLink, locale });
      subject = emailTranslations.resetPassword[locale].subject;
      break;
    case 'email_change':
    case 'email_change_new':
      emailComponent = React.createElement(EmailChangeEmail, { confirmLink, locale });
      subject = emailTranslations.emailChange[locale].subject;
      break;
    case 'magiclink':
    case 'reauthentication':
      emailComponent = React.createElement(OTPEmail, { otpCode: token, locale });
      subject = emailTranslations.otp[locale].subject;
      break;
    default:
      console.warn('[send-email] Unknown action type:', email_action_type);
      emailComponent = React.createElement(ResetPasswordEmail, { resetLink: confirmLink, locale });
      subject = emailTranslations.resetPassword[locale].subject;
  }

  // ---- 4. Render + send via Resend ----
  try {
    const html = await render(emailComponent);
    await resend.emails.send({
      from: 'Jobvero <noreply@getjobvero.com>',
      to: user.email,
      subject,
      html,
    });
  } catch (err) {
    console.error('[send-email] Failed to send:', err);
    return new Response(JSON.stringify({ error: 'Failed to send email' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
