import { Heading, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';
import { emailTranslations, type Locale } from './translations';

interface OTPEmailProps {
  otpCode: string;
  locale: Locale;
}

export default function OTPEmail({ otpCode, locale = 'en' }: OTPEmailProps) {
  const t = emailTranslations.otp[locale];

  return (
    <EmailLayout preview={t.preview} footerNote={t.footerNote}>
      <Heading style={heading}>{t.heading}</Heading>
      <Text style={paragraph}>{t.greeting}</Text>
      <Text style={paragraph}>{t.body}</Text>
      <Section style={codeContainer}>
        <Text style={code}>{otpCode}</Text>
      </Section>
      <Text style={expiryText}>{t.expiry}</Text>
    </EmailLayout>
  );
}

const heading = { color: '#1a1a2e', fontSize: '22px', fontWeight: '700', margin: '0 0 16px' };
const paragraph = { color: '#4a4a5a', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' };
const codeContainer = {
  textAlign: 'center' as const,
  margin: '28px 0',
  padding: '20px',
  backgroundColor: '#f5f3ff',
  borderRadius: '8px',
  border: '1px solid #ede9fe',
};
const code = {
  color: '#7c3aed',
  fontSize: '36px',
  fontWeight: '700',
  letterSpacing: '8px',
  margin: '0',
  fontFamily: 'monospace',
};
const expiryText = { color: '#8898aa', fontSize: '13px', lineHeight: '20px', margin: '16px 0 0' };
