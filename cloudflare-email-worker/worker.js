import PostalMime from 'postal-mime';

// Signs `${timestamp}.${body}` with the shared secret, HMAC-SHA256, hex.
// The route checks this signature and refuses a body that was edited on the
// way or a request replayed later than its window (5 minutes).
async function sign(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async email(message, env, ctx) {
    let parsed;
    try {
      parsed = await PostalMime.parse(message.raw);
    } catch (err) {
      message.setReject('Failed to parse email');
      return;
    }

    const payload = {
      from:      parsed.from?.address ?? message.from,
      to:        message.to,
      subject:   parsed.subject ?? '',
      text:      parsed.text ?? '',
      html:      parsed.html ?? '',
      messageId: parsed.messageId ?? '',
    };

    const body      = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await sign(env.INBOX_WEBHOOK_SECRET, `${timestamp}.${body}`);

    const res = await fetch('https://getjobvero.com/api/inbox/webhook', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        // The shared secret stays while the route accepts both. Once
        // INBOX_REQUIRE_SIGNATURE=true is set on the app, only the signature
        // below counts, and this header can go.
        'X-Webhook-Secret':  env.INBOX_WEBHOOK_SECRET,
        'X-Inbox-Timestamp': timestamp,
        'X-Inbox-Signature': `v1=${signature}`,
      },
      body,
    });

    if (!res.ok) {
      message.setReject(`Webhook rejected the message (${res.status})`);
    }
  },
};
