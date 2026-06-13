import {
  Heading, Hr, Link, Section, Text,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';
import type { Locale } from './translations';
import { emailTranslations } from './translations';

interface JobSummary {
  title:       string;
  company:     string;
  location:    string;
  jobUrl?:     string;
  cvTailored?: boolean;
}

interface Props {
  locale: Locale;
  appliedCount: number;
  jobs: JobSummary[];
  remainingQuota: number;
  dashboardUrl: string;
}

export function AutoApplyRecapEmail({ locale, appliedCount, jobs, remainingQuota, dashboardUrl }: Props) {
  const t = emailTranslations.autoApplyRecap[locale];

  return (
    <EmailLayout
      preview={`${appliedCount} ${t.applicationsLabel}`}
      footerNote={t.footerNote}
    >
      <Heading style={h1}>{t.heading}</Heading>
      <Text style={bodyText}>{t.greeting}</Text>
      <Text style={bodyText}>{t.body}</Text>

      {/* Stats */}
      <Section style={statsBox}>
        <Text style={statLabel}>{t.applicationsLabel}</Text>
        <Text style={statNumber}>{appliedCount}</Text>
      </Section>

      {/* Job list */}
      <Text style={sectionHeading}>{t.jobListHeading}</Text>
      {jobs.map((job, i) => (
        <Section key={i} style={jobRow}>
          <Text style={jobTitle}>
            {job.jobUrl
              ? <Link href={job.jobUrl} style={jobLink}>{job.title}</Link>
              : job.title}
          </Text>
          <Text style={jobMeta}>{job.company}{job.location ? ` — ${job.location}` : ''}</Text>
          {job.cvTailored !== undefined && (
            <Text style={job.cvTailored ? tailoredBadge : standardBadge}>
              {job.cvTailored ? '✨ Tailored CV' : 'Standard CV'}
            </Text>
          )}
        </Section>
      ))}

      <Hr style={divider} />

      {/* Quota */}
      <Section style={quotaBox}>
        <Text style={quotaText}>
          {t.quotaLabel}:{' '}
          <span style={quotaBadge}>{remainingQuota}</span>
        </Text>
      </Section>

      {/* CTA */}
      <Section style={ctaSection}>
        <Link href={dashboardUrl} style={button}>{t.button}</Link>
      </Section>
    </EmailLayout>
  );
}

const h1 = {
  color: '#1a1a2e',
  fontSize: '22px',
  fontWeight: '700' as const,
  margin: '0 0 16px 0',
  letterSpacing: '-0.3px',
};
const bodyText = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '22px',
  margin: '0 0 8px 0',
};
const statsBox = {
  backgroundColor: '#7c3aed',
  borderRadius: '10px',
  padding: '20px',
  textAlign: 'center' as const,
  margin: '20px 0',
};
const statLabel = {
  color: '#e9d5ff',
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '0.8px',
  textTransform: 'uppercase' as const,
  margin: '0',
};
const statNumber = {
  color: '#ffffff',
  fontSize: '48px',
  fontWeight: '800' as const,
  lineHeight: '1',
  margin: '6px 0 0 0',
};
const sectionHeading = {
  color: '#1a1a2e',
  fontSize: '13px',
  fontWeight: '700' as const,
  letterSpacing: '0.6px',
  textTransform: 'uppercase' as const,
  margin: '24px 0 8px 0',
};
const jobRow = {
  borderLeft: '3px solid #7c3aed',
  paddingLeft: '12px',
  margin: '0 0 10px 0',
};
const jobTitle = {
  color: '#1a1a2e',
  fontSize: '14px',
  fontWeight: '600' as const,
  margin: '0 0 2px 0',
};
const jobLink = {
  color: '#7c3aed',
  textDecoration: 'none',
};
const jobMeta = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '0',
};
const tailoredBadge = {
  display: 'inline-block',
  backgroundColor: '#f5f3ff',
  color: '#7c3aed',
  fontSize: '11px',
  fontWeight: '600' as const,
  padding: '2px 8px',
  borderRadius: '4px',
  margin: '4px 0 0 0',
};
const standardBadge = {
  display: 'inline-block',
  backgroundColor: '#f3f4f6',
  color: '#9ca3af',
  fontSize: '11px',
  fontWeight: '600' as const,
  padding: '2px 8px',
  borderRadius: '4px',
  margin: '4px 0 0 0',
};
const divider = {
  borderColor: '#e5e7eb',
  margin: '20px 0',
};
const quotaBox = {
  backgroundColor: '#f5f3ff',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 20px 0',
};
const quotaText = {
  color: '#374151',
  fontSize: '14px',
  margin: '0',
};
const quotaBadge = {
  color: '#7c3aed',
  fontWeight: '700' as const,
  fontSize: '16px',
};
const ctaSection = {
  textAlign: 'center' as const,
  margin: '8px 0 4px 0',
};
const button = {
  backgroundColor: '#7c3aed',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: '600' as const,
  padding: '12px 28px',
  textDecoration: 'none',
};
