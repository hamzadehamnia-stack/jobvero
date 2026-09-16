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

## Authenticité (signature HMAC)

Cloudflare Email Routing ne signe rien : c'est ce Worker qui prouve son identité.
Il envoie, en plus du secret partagé :

```
X-Inbox-Timestamp: <secondes unix>
X-Inbox-Signature: v1=<hmac_sha256("<timestamp>.<corps brut>", INBOX_SIGNING_SECRET)>
```

**Deux secrets distincts**, aucun en `NEXT_PUBLIC_` :

| Variable | Rôle | Où la poser |
|---|---|---|
| `INBOX_SIGNING_SECRET` | clé HMAC de la signature | `npx wrangler secret put INBOX_SIGNING_SECRET` **et** Vercel |
| `INBOX_WEBHOOK_SECRET` | jeton porteur de la transition (en-tête `X-Webhook-Secret`) | déjà posé des deux côtés |

Signer avec le jeton porteur reviendrait à ce qu'une seule fuite coûte les deux,
et interdirait d'en changer un sans l'autre. Tant que `INBOX_SIGNING_SECRET`
n'est pas posée, l'ancien secret sert aussi de clé de signature des deux côtés :
rien ne casse, mais la séparation n'est pas encore acquise.

La route vérifie la signature **avant** de lire le corps, d'interroger la base ou
d'appeler un modèle. Elle refuse une signature qui ne correspond pas au corps, et
une signature de plus de 5 minutes (rejeu).

**Transition.** Tant que `INBOX_REQUIRE_SIGNATURE` n'est pas positionnée, la route
accepte aussi l'ancien secret partagé seul : le Worker peut donc être redéployé
avant ou après l'application, sans coupure. Chaque requête acceptée de cette
façon écrit dans les journaux :

```
[inbox/webhook] TRANSITION: accepted on the shared secret alone, no HMAC signature — the Worker sending this is not yet redeployed
```

Le jour où cette ligne n'apparaît plus, le Worker est entièrement déployé :
poser alors `INBOX_REQUIRE_SIGNATURE=true` côté Vercel ferme la porte au secret
seul.

## Notes

- Le payload envoyé au webhook : `{ from, to, subject, text, html, messageId }`
- `to` est l'adresse exacte de l'enveloppe (`message.to`), donc `reply+{threadId}@getjobvero.com` ou `{alias}@getjobvero.com` arrive intact pour le routage côté `/api/inbox/webhook`.
- Si le webhook répond autre chose que 2xx, l'email est rejeté (bounce) via `message.setReject()`.
- Si le déploiement échoue avec une erreur d'API Node manquante, ajouter dans `wrangler.toml` :
  ```toml
  compatibility_flags = ["nodejs_compat"]
  ```
