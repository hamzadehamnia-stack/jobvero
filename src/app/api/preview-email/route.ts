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
