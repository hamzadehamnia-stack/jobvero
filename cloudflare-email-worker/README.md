# Jobvero Email Worker

Reçoit les emails entrants sur `*@getjobvero.com` via Cloudflare Email Routing,
parse le MIME brut avec `postal-mime`, et forward un payload JSON propre vers
`https://getjobvero.com/api/inbox/webhook`.

## Déploiement

```bash
cd cloudflare-email-worker
npm install
npx wrangler login
npx wrangler secret put INBOX_WEBHOOK_SECRET
# coller exactement la même valeur que INBOX_WEBHOOK_SECRET dans .env.local / Vercel
npx wrangler deploy
```

## Configuration Cloudflare Dashboard

1. **Email** → **Email Routing** → **Routing Rules**
2. Sur l'adresse catch-all (`*@getjobvero.com`) → Action **"Send to a Worker"** → sélectionner `jobvero-email-worker`
3. Enregistrer

## Notes

- Le payload envoyé au webhook : `{ from, to, subject, text, html, messageId }`
- `to` est l'adresse exacte de l'enveloppe (`message.to`), donc `reply+{threadId}@getjobvero.com` ou `{alias}@getjobvero.com` arrive intact pour le routage côté `/api/inbox/webhook`.
- Si le webhook répond autre chose que 2xx, l'email est rejeté (bounce) via `message.setReject()`.
- Si le déploiement échoue avec une erreur d'API Node manquante, ajouter dans `wrangler.toml` :
  ```toml
  compatibility_flags = ["nodejs_compat"]
  ```
