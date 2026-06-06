import { NextResponse } from 'next/server';
import { Resend }       from 'resend';
import { createClient } from '@/lib/supabase/server';

const resend       = new Resend(process.env.RESEND_API_KEY);
const SUPPORT_TO   = 'hamzadehamnia@gmail.com';
const SUPPORT_FROM = 'support@getjobvero.com';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { subject, message } = await req.json() as { subject: string; message: string };

    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'Objet et message sont requis.' }, { status: 400 });
    }
    if (message.trim().length < 50) {
      return NextResponse.json({ error: 'Le message doit contenir au moins 50 caractères.' }, { status: 400 });
    }
    if (message.trim().length > 1000) {
      return NextResponse.json({ error: 'Le message ne peut pas dépasser 1000 caractères.' }, { status: 400 });
    }

    // Retrieve user identity server-side — never trusted from client
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email_alias')
      .eq('id', user.id)
      .single();

    const name  = (profile?.full_name as string | undefined)
      ?? (user.user_metadata?.full_name as string | undefined)
      ?? user.email?.split('@')[0]
      ?? 'Utilisateur';
    const email = user.email ?? '';

    const dateStr = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    const safeMsg = message.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    // ── Email to admin ──────────────────────────────────────────────────────
    const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a2e;">
        <div style="background:linear-gradient(135deg,#7C3AED,#4F46E5);padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;color:#fff;font-size:20px;">📩 Nouveau ticket support — Jobvero</h2>
        </div>
        <div style="background:#f9fafb;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;font-weight:600;color:#6b7280;width:80px;">Nom</td><td style="padding:8px 0;color:#111827;">${name}</td></tr>
            <tr><td style="padding:8px 0;font-weight:600;color:#6b7280;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#7C3AED;">${email}</a></td></tr>
            <tr><td style="padding:8px 0;font-weight:600;color:#6b7280;">Objet</td><td style="padding:8px 0;color:#111827;">${subject.trim()}</td></tr>
            <tr><td style="padding:8px 0;font-weight:600;color:#6b7280;">Date</td><td style="padding:8px 0;color:#111827;">${dateStr}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
          <p style="margin:0 0 8px;font-weight:600;color:#6b7280;">Message :</p>
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;line-height:1.7;color:#374151;">${safeMsg}</div>
          <p style="margin-top:16px;font-size:12px;color:#9ca3af;">Répondre à cet email pour contacter directement l'utilisateur.</p>
        </div>
      </div>`;

    const { error: adminErr } = await resend.emails.send({
      from:    `Jobvero Support <${SUPPORT_FROM}>`,
      to:      [SUPPORT_TO],
      replyTo: email,
      subject: `[Jobvero Support] ${subject.trim()} — ${name}`,
      html:    adminHtml,
    });

    if (adminErr) {
      console.error('[support] admin email error:', adminErr);
      return NextResponse.json({ error: `Envoi échoué : ${adminErr.message}` }, { status: 500 });
    }

    // ── Confirmation to user (non-fatal) ────────────────────────────────────
    const confirmHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a2e;">
        <div style="background:linear-gradient(135deg,#7C3AED,#4F46E5);padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;color:#fff;font-size:20px;">✅ Votre message a bien été reçu</h2>
        </div>
        <div style="background:#f9fafb;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 16px;color:#374151;">Bonjour <strong>${name}</strong>,</p>
          <p style="margin:0 0 16px;color:#374151;">Votre message a été envoyé. Nous vous répondons sous <strong>24–48h</strong>.</p>
          <div style="background:#ede9fe;border-left:4px solid #7C3AED;border-radius:0 8px 8px 0;padding:14px 16px;margin:20px 0;">
            <p style="margin:0;font-size:13px;color:#5b21b6;font-weight:600;">Objet : ${subject.trim()}</p>
          </div>
          <p style="margin:20px 0 0;color:#6b7280;font-size:13px;">L'équipe Jobvero 💜</p>
        </div>
        <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:16px;">Jobvero · support@getjobvero.com</p>
      </div>`;

    if (email) {
      await resend.emails.send({
        from:    `Jobvero Support <${SUPPORT_FROM}>`,
        to:      [email],
        subject: '✅ Votre message a bien été reçu — Jobvero Support',
        html:    confirmHtml,
      });
    }

    // Persist ticket so admin can see and reply from dashboard
    await supabase.from('support_messages').insert({
      user_id:    user.id,
      user_email: email,
      user_name:  name,
      subject:    subject.trim(),
      message:    message.trim(),
      status:     'pending',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[support]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur interne' }, { status: 500 });
  }
}
