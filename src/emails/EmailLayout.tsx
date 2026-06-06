import {
  Body, Container, Head, Html, Link, Preview, Section, Text, Hr, Heading,
} from '@react-email/components';
import * as React from 'react';

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  footerNote: string;
}

export function EmailLayout({ preview, children, footerNote }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Jobvero</Heading>
          </Section>

          {/* Content */}
          <Section style={content}>
            {children}
          </Section>

          {/* Footer */}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>{footerNote}</Text>
            <Text style={footerText}>
              Jobvero is operated by MELNZ LLC
            </Text>
            <Text style={footerTextSmall}>
              1209 Mountain Road PL NE, STE N, Albuquerque, New Mexico 87110, USA
            </Text>
            <Text style={footerTextSmall}>
              <Link href="https://getjobvero.com" style={footerLink}>getjobvero.com</Link>
              {'  •  '}
              <Link href="https://getjobvero.com/en/privacy" style={footerLink}>Privacy</Link>
              {'  •  '}
              <Link href="https://getjobvero.com/en/terms" style={footerLink}>Terms</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f4f4f7',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};
const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  maxWidth: '560px',
  borderRadius: '12px',
  overflow: 'hidden' as const,
  border: '1px solid #e6e6e6',
};
const header = {
  background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
  padding: '32px 0',
  textAlign: 'center' as const,
};
const logo = {
  color: '#ffffff',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0',
  letterSpacing: '-0.5px',
};
const content = {
  padding: '32px 40px',
};
const hr = {
  borderColor: '#e6e6e6',
  margin: '0',
};
const footer = {
  padding: '24px 40px',
  backgroundColor: '#fafafa',
};
const footerText = {
  color: '#8898aa',
  fontSize: '13px',
  lineHeight: '18px',
  margin: '2px 0',
  textAlign: 'center' as const,
};
const footerTextSmall = {
  color: '#a0a0a0',
  fontSize: '11px',
  lineHeight: '16px',
  margin: '2px 0',
  textAlign: 'center' as const,
};
const footerLink = {
  color: '#7c3aed',
  textDecoration: 'none',
};
