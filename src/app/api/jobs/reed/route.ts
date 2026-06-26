// SUSPENDED — returns 410 Gone immediately; Reed API key is never called.
// To reactivate: restore the full implementation from git history.
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'Reed job search is no longer available.' },
    { status: 410 },
  );
}
