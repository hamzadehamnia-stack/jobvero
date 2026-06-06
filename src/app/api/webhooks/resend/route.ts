import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ResendWebhookEvent {
  type:
    | 'email.sent'
    | 'email.delivered'
    | 'email.delivery_delayed'
    | 'email.bounced'
    | 'email.complained'
    | 'email.opened'
    | 'email.clicked';
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    bounce?: {
      message?: string;
      subType?: string;
      type?: string;
    };
    tags?: Array<{ name: string; value: string }>;
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET missing');
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }

  const rawBody = await req.text();

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'missing svix headers' }, { status: 400 });
  }

  let event: ResendWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookEvent;
  } catch (err) {
    console.warn('[resend-webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  try {
    await handleEvent(event);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[resend-webhook] handler error:', err);
    return NextResponse.json({ ok: false, error: 'handler error' });
  }
}

async function handleEvent(event: ResendWebhookEvent): Promise<void> {
  const emailId = event.data.email_id;
  if (!emailId) return;

  const { data: app } = await supabase
    .from('applications')
    .select('id, user_id, recruiter_email, email_source')
    .eq('resend_email_id', emailId)
    .maybeSingle();

  await supabase.from('resend_webhook_events').insert({
    event_type: event.type,
    resend_email_id: emailId,
    application_id: app?.id ?? null,
    payload: event,
  });

  if (!app) {
    console.warn('[resend-webhook] no application found for email_id', emailId);
    return;
  }

  switch (event.type) {
    case 'email.delivered': {
      await supabase
        .from('applications')
        .update({ delivered_at: event.created_at, status: 'delivered' })
        .eq('id', app.id);
      break;
    }

    case 'email.bounced': {
      const bounceReason =
        event.data.bounce?.message ??
        event.data.bounce?.subType ??
        event.data.bounce?.type ??
        'unknown';

      await supabase
        .from('applications')
        .update({
          bounced_at: event.created_at,
          bounce_reason: bounceReason,
          status: 'bounced',
        })
        .eq('id', app.id);

      if (app.recruiter_email) {
        const domain = app.recruiter_email.split('@')[1]?.toLowerCase();
        if (domain) {
          if (app.email_source === 'pattern_n2') {
            await supabase
              .from('recruiter_contacts_cache')
              .delete()
              .eq('company_domain', domain)
              .eq('email', app.recruiter_email.toLowerCase());
          } else {
            await supabase
              .from('recruiter_contacts_cache')
              .update({ confidence: 'low' })
              .eq('company_domain', domain)
              .eq('email', app.recruiter_email.toLowerCase());
          }
        }
      }

      console.info('[resend-webhook] bounce processed:', {
        emailId,
        applicationId: app.id,
        source: app.email_source,
        reason: bounceReason,
      });
      break;
    }

    case 'email.complained': {
      await supabase
        .from('applications')
        .update({ status: 'complained' })
        .eq('id', app.id);

      if (app.recruiter_email) {
        const domain = app.recruiter_email.split('@')[1]?.toLowerCase();
        if (domain) {
          await supabase
            .from('recruiter_contacts_cache')
            .delete()
            .eq('company_domain', domain);
        }
      }
      break;
    }

    case 'email.opened': {
      await supabase
        .from('applications')
        .update({ opened_at: event.created_at })
        .eq('id', app.id)
        .is('opened_at', null);
      break;
    }

    default:
      break;
  }
}
