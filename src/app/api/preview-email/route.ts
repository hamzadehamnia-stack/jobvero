import { render } from '@react-email/render';
import ResetPasswordEmail from '@/emails/ResetPasswordEmail';
import ConfirmSignupEmail from '@/emails/ConfirmSignupEmail';
import EmailChangeEmail from '@/emails/EmailChangeEmail';
import OTPEmail from '@/emails/OTPEmail';
import { type Locale } from '@/emails/translations';

export const dynamic = 'force-dynamic';

const PREVIEW_LINK = 'https://getjobvero.com/auth/reset-password?token=PREVIEW_TOKEN_12345';
const PREVIEW_OTP  = '12345678';

export async function GET(request: Request) {
  // Development-only template previewer. It renders no user data, so this is
  // surface reduction rather than a leak fix: it exposed the exact wording and
  // markup of our auth emails, which is what a convincing phishing clone is
  // built from. api/email-finder/test already applies this same gate.
  if (process.env.NODE_ENV === 'production') {
    return new Response(JSON.stringify({ error: 'disabled in prod' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);
  const type   = searchParams.get('type')   || 'reset';
  const locale = (searchParams.get('locale') || 'en') as Locale;

  let html: string;

  switch (type) {
    case 'signup':
      html = await render(ConfirmSignupEmail({ confirmLink: PREVIEW_LINK, locale }));
      break;
    case 'emailchange':
      html = await render(EmailChangeEmail({ confirmLink: PREVIEW_LINK, locale }));
      break;
    case 'otp':
      html = await render(OTPEmail({ otpCode: PREVIEW_OTP, locale }));
      break;
    case 'reset':
    default:
      html = await render(ResetPasswordEmail({ resetLink: PREVIEW_LINK, locale }));
      break;
  }

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
