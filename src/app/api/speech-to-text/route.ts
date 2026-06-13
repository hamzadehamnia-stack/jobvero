import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'STT not configured' }, { status: 503 });
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const openAIForm = new FormData();
    openAIForm.append('file', audioFile, 'audio.webm');
    openAIForm.append('model', 'whisper-1');
    openAIForm.append('response_format', 'text');

    const res = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      body: openAIForm,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('[/api/speech-to-text] Whisper error:', err);
      return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
    }

    const transcript = (await res.text()).trim();
    return NextResponse.json({ transcript });
  } catch (err) {
    console.error('[/api/speech-to-text]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
