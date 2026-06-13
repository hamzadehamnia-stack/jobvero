import { Heading, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';
import { emailTranslations, type Locale } from './translations';

interface PasswordChangedEmailProps {
  locale: Locale;
  changedAt: Date;
}

const localeMap: Record<Locale, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-BR',
};

export default function PasswordChangedEmail({ locale = 'en', changedAt }: PasswordChangedEmailProps) {
  const t = emailTranslations.passwordChanged[locale];
  const formattedDate = changedAt.toLocaleString(localeMap[locale], {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return (
    <EmailLayout preview={t.preview} footerNote={t.footerNote}>
      <Heading style={heading}>{t.heading}</Heading>
      <Text style={paragraph}>{t.greeting}</Text>
      <Text style={paragraph}>{t.body}</Text>
      <Section style={dateBox}>
        <Text style={dateLabel}>{t.changedAtLabel}</Text>
        <Text style={dateValue}>{formattedDate}</Text>
      </Section>
      <Text style={securityText}>{t.securityNote}</Text>
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
const dateBox = {
  backgroundColor: '#f4f4f7',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
};
const dateLabel = {
  color: '#8898aa',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 4px',
};
const dateValue = {
  color: '#1a1a2e',
  fontSize: '15px',
  fontWeight: '600',
  margin: '0',
};
const securityText = {
  color: '#8898aa',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '16px 0 0',
};
