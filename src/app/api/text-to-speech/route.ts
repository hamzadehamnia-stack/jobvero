import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const VOICE_MAP: Record<string, string> = {
  fr: 'nova',
  en: 'alloy',
  es: 'nova',
  pt: 'nova',
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'TTS not configured' }, { status: 503 });
    }

    const { text, language }: { text: string; language: string } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const voice = VOICE_MAP[language] ?? 'nova';

    const openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice,
        input: text.trim(),
        speed: 1.0,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text().catch(() => '');
      console.error('[/api/text-to-speech] OpenAI error:', err);
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 });
    }

    const arrayBuffer = await openaiRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return NextResponse.json({ audio: base64, mimeType: 'audio/mpeg' });
  } catch (err) {
    console.error('[/api/text-to-speech]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
