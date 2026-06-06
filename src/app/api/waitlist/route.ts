import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_FILE = join(process.cwd(), 'data', 'waitlist.json');

interface WaitlistEntry {
  email: string;
  joinedAt: string;
}

function readEntries(): WaitlistEntry[] {
  if (!existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const entries = readEntries();

  if (entries.some((e) => e.email === email)) {
    return NextResponse.json({ error: 'already_registered' }, { status: 409 });
  }

  entries.push({ email, joinedAt: new Date().toISOString() });

  try {
    writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
