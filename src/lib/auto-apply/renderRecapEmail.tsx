import * as React from 'react';
import { render } from '@react-email/render';
import { AutoApplyRecapEmail } from '@/emails/AutoApplyRecapEmail';
import type { Locale } from '@/emails/translations';

interface RecapEmailData {
  locale: Locale;
  appliedCount: number;
  jobs: Array<{ title: string; company: string; location: string; jobUrl?: string; cvTailored?: boolean }>;
  remainingQuota: number;
  dashboardUrl: string;
}

export async function renderRecapEmail(data: RecapEmailData): Promise<string> {
  return render(
    <AutoApplyRecapEmail
      locale={data.locale}
      appliedCount={data.appliedCount}
      jobs={data.jobs}
      remainingQuota={data.remainingQuota}
      dashboardUrl={data.dashboardUrl}
    />,
  );
}
