import { Button, Heading, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';
import { emailTranslations, type Locale } from './translations';

interface EmailChangeEmailProps {
  confirmLink: string;
  locale: Locale;
}

export default function EmailChangeEmail({ confirmLink, locale = 'en' }: EmailChangeEmailProps) {
  const t = emailTranslations.emailChange[locale];

  return (
    <EmailLayout preview={t.preview} footerNote={t.footerNote}>
      <Heading style={heading}>{t.heading}</Heading>
      <Text style={paragraph}>{t.greeting}</Text>
      <Text style={paragraph}>{t.body}</Text>
      <Section style={buttonContainer}>
        <Button style={button} href={confirmLink}>
          {t.button}
        </Button>
      </Section>
      <Text style={expiryText}>{t.expiry}</Text>
    </EmailLayout>
  );
}

const heading = {
  color: '#1a1a2e',
  fontSize: '22px',
  fontWeight: '700',
  margin: '0 0 16px',
};
const paragraph = {
  color: '#4a4a5a',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 16px',
};
const buttonContainer = {
  textAlign: 'center' as const,
  margin: '28px 0',
};
const button = {
  backgroundColor: '#7c3aed',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
};
const expiryText = {
  color: '#8898aa',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '16px 0 0',
};
