import { NextResponse } from 'next/server';

// Log the detail, return a generic message.
//
// Route handlers were returning `err.message` straight to the client. What that
// message contains is decided by whatever threw, not by us:
//
//   - Postgres/Supabase errors name columns, constraints and RLS policies,
//     which maps out the schema for an attacker;
//   - URL and fetch errors can embed the URL that failed, and the job-search
//     proxies build theirs with app_id and app_key in the query string, so an
//     upstream failure could hand a third-party API credential to the caller;
//   - Node errors carry absolute filesystem paths from the deployment.
//
// The detail still reaches the server log, where it is actually useful.

export function serverError(
  context: string,
  err: unknown,
  publicMessage = 'Internal server error',
  status = 500,
): NextResponse {
  console.error(`[${context}]`, err);
  return NextResponse.json({ error: publicMessage }, { status });
}
