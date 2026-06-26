import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const TOKEN_URL  = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const TOKEN_KEY  = 'france-travail';
const BUFFER_MS  = 5 * 60 * 1000; // refresh 5 min before expiry

// ─── Token management (Supabase-backed, no in-process state) ─────────────────

async function fetchNewToken(): Promise<{ token: string; expiresAt: Date }> {
  const clientId     = process.env.FT_CLIENT_ID;
  const clientSecret = process.env.FT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('FT_CLIENT_ID / FT_CLIENT_SECRET not set in .env.local');
  }

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
      scope:         'api_offresdemploiv2 o2dsoffre',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`France Travail OAuth failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  return { token: data.access_token, expiresAt };
}

async function getValidFranceTravailToken(forceRefresh = false): Promise<string> {
  const supabase = createAdminClient();

  if (!forceRefresh) {
    console.log('[france-travail] 🔍 Reading token from Supabase api_tokens…');
    const { data, error } = await supabase
      .from('api_tokens')
      .select('token, expires_at')
      .eq('id', TOKEN_KEY)
      .single();

    if (error) {
      // PGRST116 = no row found — not an error, just means we need to fetch
      if (error.code !== 'PGRST116') {
        console.warn('[france-travail] ⚠️ Supabase read error:', error.code, error.message);
      } else {
        console.log('[france-travail] ℹ️ No token in DB yet — will fetch new one');
      }
    }

    if (data) {
      const expiresAt  = new Date(data.expires_at).getTime();
      const remainingMs = expiresAt - Date.now();
      const remainingMin = Math.round(remainingMs / 60000);

      if (remainingMs > BUFFER_MS) {
        console.log(`[france-travail] ✅ Token cache HIT — valid for ${remainingMin} more min`);
        return data.token;
      }
      console.log(`[france-travail] ⏰ Token expires in ${remainingMin} min (< 5 min buffer) — refreshing`);
    }
  } else {
    console.log('[france-travail] 🔄 Force-refresh requested');
  }

  // Fetch new token from France Travail OAuth
  console.log('[france-travail] 🔄 Calling France Travail OAuth…');
  const { token, expiresAt } = await fetchNewToken();
  console.log(`[france-travail] ✓ New token received, expires ${expiresAt.toISOString()}`);

  const { error: upsertErr } = await supabase.from('api_tokens').upsert({
    id:         TOKEN_KEY,
    token,
    expires_at: expiresAt.toISOString(),
  });

  if (upsertErr) {
    console.error('[france-travail] ❌ Failed to save token to Supabase:', upsertErr.message);
  } else {
    console.log('[france-travail] ✅ Token saved to Supabase api_tokens');
  }

  return token;
}

// ─── Response types ───────────────────────────────────────────────────────────

interface FTFormation  { niveauLibelle?: string; domaineLibelle?: string }
interface FTCompetence { libelle: string; exigence?: string }

interface FTOffre {
  id:                  string;
  intitule:            string;
  entreprise?:         { nom?: string; description?: string };
  lieuTravail?:        { libelle?: string; typeLibelle?: string };
  salaire?:            { libelle?: string };
  description?:        string;
  origineOffre?:       { urlOrigine?: string };
  dateCreation?:       string;
  typeContratLibelle?: string;
  experienceLibelle?:  string;
  formations?:         FTFormation[];
  competences?:        FTCompetence[];
  romeLibelle?:        string;
}

interface FTResponse { resultats?: FTOffre[]; filtresPossibles?: unknown[] }

function mapOffre(o: FTOffre) {
  const education  = o.formations?.map(f => f.niveauLibelle).filter(Boolean).join(', ') || null;
  const skills     = o.competences?.map(c => c.libelle).filter(Boolean).slice(0, 12) ?? null;
  const lieuType   = o.lieuTravail?.typeLibelle?.toLowerCase() ?? '';
  const remoteType = lieuType.includes('télétravail') || lieuType.includes('teletravail') ? 'Télétravail' : null;

  return {
    id:                 o.id,
    title:              o.intitule,
    company:            o.entreprise?.nom          ?? 'Non précisé',
    location:           o.lieuTravail?.libelle      ?? '',
    salary:             o.salaire?.libelle          ?? null,
    description:        o.description               ?? '',
    redirect_url:       o.origineOffre?.urlOrigine  ?? null,
    created:            o.dateCreation              ?? null,
    jobType:            o.typeContratLibelle         ?? null,
    source:             'France Travail' as const,
    experience:         o.experienceLibelle          ?? null,
    education,
    skills:             skills?.length ? skills : null,
    companyDescription: o.entreprise?.description   ?? null,
    remoteType,
    category:           o.romeLibelle               ?? null,
  };
}

// ─── Fetch helper (with auto-retry on 401) ───────────────────────────────────

async function fetchFT(url: string, forceRefresh = false): Promise<Response> {
  const token    = await getValidFranceTravailToken(forceRefresh);
  const ac       = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: ac.signal,
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.FT_CLIENT_ID || !process.env.FT_CLIENT_SECRET) {
    console.error('[france-travail] ❌ Missing credentials: FT_CLIENT_ID or FT_CLIENT_SECRET not set in .env.local');
    return NextResponse.json(
      { error: 'France Travail credentials not configured' },
      { status: 500 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);

    const what        = searchParams.get('what')        ?? '';
    const departement = searchParams.get('departement') ?? '';
    const typeContrat = searchParams.get('typeContrat') ?? '';
    const experience  = searchParams.get('experience')  ?? '';
    const datePosted  = searchParams.get('datePosted')  ?? '';
    const page        = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10));

    const start = page * 20;
    const end   = start + 19;

    console.log(`[france-travail] → "${what}" dept=${departement || 'all'} page=${page} date=${datePosted || 'any'}`);

    // Base params (URLSearchParams — safe chars only, no colons)
    const params = new URLSearchParams({ range: `${start}-${end}` });
    if (what)        params.set('motsCles',    what);
    if (departement) params.set('departement', departement);
    if (typeContrat) params.set('typeContrat', typeContrat);
    if (experience)  params.set('experience',  experience);

    // minCreationDate must be appended raw — URLSearchParams encodes ':' as '%3A'
    // and France Travail rejects encoded colons in the date field.
    let minCreationDate = '';
    if (datePosted) {
      const daysAgo = parseInt(datePosted, 10);
      if (!isNaN(daysAgo) && daysAgo > 0) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - daysAgo);
        d.setUTCHours(0, 0, 0, 0);
        minCreationDate = d.toISOString().replace('.000Z', 'Z'); // → 2026-05-11T00:00:00Z
        console.log(`[france-travail] 📅 minCreationDate = ${minCreationDate}`);
      }
    }

    const baseUrl      = `${SEARCH_URL}?${params}`;
    const urlWithDate  = minCreationDate ? `${baseUrl}&minCreationDate=${minCreationDate}` : baseUrl;

    let res: Response;
    try {
      res = await fetchFT(urlWithDate);
    } catch (fetchErr) {
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      const msg     = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`[france-travail] ❌ fetch ${isAbort ? 'TIMEOUT' : 'FAILED'}:`, msg);
      return NextResponse.json(
        { error: isAbort ? 'France Travail request timed out. Try again.' : `Search failed: ${msg}` },
        { status: 503 },
      );
    }

    // 401 → token expired, force-refresh and retry once
    if (res.status === 401) {
      console.warn('[france-travail] ⚠️ 401 — refreshing token and retrying…');
      try {
        res = await fetchFT(urlWithDate, true);
      } catch (retryErr) {
        const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        console.error('[france-travail] ❌ retry after 401 failed:', msg);
        return NextResponse.json({ error: 'France Travail auth failed after token refresh' }, { status: 503 });
      }
    }

    // 400 with date filter → return empty, let the client fall back to Adzuna
    if (res.status === 400 && minCreationDate) {
      const body = await res.text().catch(() => '');
      console.warn(`[france-travail] ⚠️ 400 with date filter — returning empty (Adzuna will take over). Reason: ${body.slice(0, 200)}`);
      return NextResponse.json({ results: [], count: 0 });
    }

    // 204 No Content → no jobs
    if (res.status === 204) {
      return NextResponse.json({ results: [], count: 0 });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[france-travail] ❌ API error ${res.status}:`, text.slice(0, 300));
      return NextResponse.json(
        { error: `France Travail API error (${res.status})` },
        { status: 500 },
      );
    }

    const data    = await res.json() as FTResponse;
    const results = (data.resultats ?? []).map(mapOffre);

    const contentRange = res.headers.get('Content-Range') ?? '';
    const totalMatch   = contentRange.match(/\/(\d+)$/);
    const count        = totalMatch ? parseInt(totalMatch[1], 10) : results.length;

    console.log(`[france-travail] ✓ "${what}" → ${results.length} results (total ${count})`);

    return NextResponse.json({ results, count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[france-travail] ❌ unhandled error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
