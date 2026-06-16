import PostalMime from 'postal-mime';

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

    const res = await fetch('https://getjobvero.com/api/inbox/webhook', {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Webhook-Secret': env.INBOX_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      message.setReject(`Webhook rejected the message (${res.status})`);
    }
  },
};
