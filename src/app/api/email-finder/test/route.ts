import { NextRequest, NextResponse } from 'next/server';
import { findRecruiterEmail } from '@/lib/email-finder';
import type { JobContext } from '@/lib/email-finder';

const TEST_USER_UUID = '00000000-0000-0000-0000-000000000000';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled in prod' }, { status: 403 });
  }

  try {
    const body = (await req.json()) as JobContext;

    if (!body.companyDomain || !body.companyName || !body.country) {
      return NextResponse.json(
        { error: 'missing required fields: companyDomain, companyName, country' },
        { status: 400 }
      );
    }

    const result = await findRecruiterEmail(body, TEST_USER_UUID);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 }
    );
  }
}
