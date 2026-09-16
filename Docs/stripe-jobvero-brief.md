# Brief d'implémentation — Stripe sur Jobvero

**Contexte :** Next.js 14 (App Router) / TypeScript / Supabase / Vercel.
Compte Stripe : `acct_1TQ5CCEFcc8zeWQt` (Melnz LLC, USD, compte externe Mercury configuré).
Lancement marché USA. Tout doit être développé et validé **en mode test** avant bascule live.

---

## 0. Décisions de conception à respecter

| Sujet | Décision |
|---|---|
| **Essai — décidé le 2026-09-16** | **7 jours.** Carte bancaire **obligatoire** à l'inscription (Stripe `trial_period_days=7`). Prélèvement automatique au 8e jour, sauf annulation avant. |
| **Essai — ce qu'il donne** | Fonctions de niveau **Pro**, quota de **10 crédits** — *pas* le quota du plan choisi. Volontaire, et à écrire clairement à l'utilisateur **avant** qu'il entre sa carte. Au 8e jour : le plan choisi et son quota mensuel normal. |
| **Essai — source de vérité** | **Stripe** (`subscription_status = 'trialing'`), plus une colonne de la base. Implémentation au bloc e9. |
| Paliers | **Non tranché — voir « À trancher avant e9 » ci-dessous.** Trois grilles de prix coexistent dans le projet. |
| Devise | USD |
| Source de vérité de l'abonnement | Les **webhooks Stripe**, jamais le client, jamais la page de succès |
| Écriture des colonnes d'abonnement | **Service role uniquement** (cohérent avec le durcissement RLS de `profiles`) |

---

## 0 bis. À trancher avant e9 — les prix

**Rien n'est décidé ici.** Trois grilles de prix coexistent dans le projet et se
contredisent. Elles sont reproduites telles quelles ; aucune n'a été modifiée, et
aucun prix n'a été inventé.

| Source | Starter | Pro | Premium | Statut |
|---|---|---|---|---|
| **Page tarifs** — `messages/en\|fr\|es\|pt.json` (`pricing.plans`), `UpgradeModal.tsx`, `features.ts` (`TIER_LABELS`) | *absent* | **19,99 $/mois** | **29,99 $/mois** | **Publié** — c'est ce que le client voit aujourd'hui |
| **CGU** — `src/content/legal/terms-of-service.md` lignes 69-72 | **11 $/mois** | **27 $/mois** | **49 $/mois** | **Contractuel** — document juridique en ligne |
| **Ce brief** — section 0 (avant le 2026-09-16) et section 1 | **20 $/mois** | **39 $/mois** | **75 $/mois** | **Hypothèse** — jamais validée |

Trois écarts à noter avant d'arbitrer :

1. **Starter n'a aucun prix publié.** Il existe dans le code (`entitlements.ts` :
   toutes les fonctions IA sauf entretien et auto-apply) et dans `admin_settings`
   (29 crédits/mois), mais la page tarifs ne le liste pas. Tant que le prix n'est
   pas tranché, la carte Starter de `UpgradeModal` affiche son quota et ses
   fonctions, et renvoie vers la page tarifs.
2. **Les CGU et le site ne disent pas la même chose.** Les CGU sont le document
   contractuel ; c'est l'écart le plus coûteux à laisser traîner.
3. **Les quotas, eux, ont une seule source** : `admin_settings.limits`
   (essai 10 · Starter 29 · Pro 57 · Premium 111 crédits par mois). Ce sont les
   nombres que la base applique réellement.

Le décompte complet des endroits à changer le jour de l'arbitrage figure dans le
rapport du bloc e8.

---

## 1. Configuration dans le dashboard Stripe (manuel, en mode test)

1. **Produits** → créer 3 produits, chacun avec un prix récurrent mensuel en USD :
   - `Jobvero Starter` → 20.00 USD / mois
   - `Jobvero Pro` → 39.00 USD / mois
   - `Jobvero Premium` → 75.00 USD / mois
2. Noter les **3 price IDs** (`price_...`) → ils vont en variables d'environnement.
3. **Paramètres → Portail client** : activer le changement de formule entre les 3 prix, l'annulation, et la mise à jour du moyen de paiement.
4. **Paramètres → Taxes** : activer Stripe Tax et renseigner l'adresse d'origine (Nouveau-Mexique). Utile même en USA-only pour le nexus de sales tax.
5. Le **webhook endpoint** sera créé à l'étape 6, une fois la route en place.

---

## 2. Variables d'environnement

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_PREMIUM=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=...   # déjà présent
```

Sur Vercel : les ajouter aux trois environnements (Development, Preview, Production).
En production, `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` prennent leurs valeurs live.

---

## 3. Migration base de données

Nouvelle migration versionnée (dans la continuité de `harden_profiles_write_access`).

### 3.1 Colonnes à ajouter sur `profiles`

```sql
alter table public.profiles
  add column if not exists stripe_customer_id      text unique,
  add column if not exists stripe_subscription_id  text,
  add column if not exists subscription_status     text,      -- active | past_due | canceled | incomplete
  add column if not exists current_period_end      timestamptz,
  add column if not exists cancel_at_period_end    boolean not null default false;

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);
```

### 3.2 Verrouiller ces colonnes en écriture

Le même piège que la faille corrigée le 10 septembre : sans cela, un utilisateur connecté pourrait
se donner un abonnement.

```sql
revoke update (
  stripe_customer_id, stripe_subscription_id, subscription_status,
  current_period_end, cancel_at_period_end
) on public.profiles from authenticated, anon;
```

Le service role conserve l'accès (il contourne RLS).

### 3.3 Table d'idempotence des webhooks

Stripe réémet les événements. Sans cette table, un `invoice.paid` rejoué peut recréditer deux fois.

```sql
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- aucune policy : seul le service role y accède
```

---

## 4. Résolution des droits (entitlements)

Un seul module, `src/lib/entitlements.ts`, source unique de vérité. **Toutes** les routes IA et
toutes les pages protégées passent par lui.

```ts
export type Tier = 'free' | 'trial' | 'starter' | 'pro' | 'premium';

export function resolveTier(profile: Profile): Tier {
  // 1. Abonnement payant actif
  if (profile.subscription_status === 'active' && profile.subscription_plan) {
    return profile.subscription_plan as Tier;
  }
  // 2. Essai en cours (géré hors Stripe)
  if (profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date()) {
    return 'trial';
  }
  // 3. Sinon
  return 'free';
}
```

Règles :

- `trial` donne les limites du palier **Pro** (décision produit existante).
- `past_due` ne donne **pas** l'accès payant — il retombe sur l'essai s'il court encore, sinon `free`.
- Les limites par palier viennent de `admin_settings`.

> ⚠️ **`admin_settings` est à mettre à jour.** Il contient aujourd'hui des limites pour `pro` et
> `premium` seulement. Il faut ajouter `starter`, `trial` et `free`, et retirer `premium+` qui
> n'existe plus dans la nouvelle grille.

À l'inscription (trigger ou callback d'auth) : `trial_ends_at = now() + interval '3 days'`.

---

## 5. Routes API

### 5.1 `POST /api/stripe/checkout`

Authentifiée. Corps : `{ plan: 'starter' | 'pro' | 'premium' }`.

1. Récupérer l'utilisateur via le client Supabase serveur. Sinon → 401.
2. Mapper `plan` → price ID **depuis les variables d'env**, jamais depuis le corps de la requête.
   Un plan inconnu → 400.
3. Récupérer ou créer le customer Stripe :
   - si `profile.stripe_customer_id` existe, le réutiliser ;
   - sinon `stripe.customers.create({ email, metadata: { user_id } })` puis l'écrire en base
     **avec le client service role**.
4. Créer la session :

```ts
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer: customerId,
  line_items: [{ price: priceId, quantity: 1 }],
  client_reference_id: user.id,
  subscription_data: { metadata: { user_id: user.id } },  // indispensable
  automatic_tax: { enabled: true },
  customer_update: { address: 'auto', name: 'auto' },
  allow_promotion_codes: true,
  success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
});
return Response.json({ url: session.url });
```

5. Appliquer le rate limiting existant (`api_rate_limits`) sur cette route.

### 5.2 `POST /api/stripe/portal`

Authentifiée. Crée une session de portail client pour `profile.stripe_customer_id`,
`return_url` vers `/settings/billing`. Retourne `{ url }`.
Si l'utilisateur n'a pas de `stripe_customer_id` → 400.

### 5.3 `POST /api/stripe/webhook`

Publique, mais **vérifiée par signature**.

```ts
export const runtime = 'nodejs';        // obligatoire : le body brut est requis
export const dynamic = 'force-dynamic';

const body = await req.text();          // texte brut, surtout pas req.json()
const sig  = req.headers.get('stripe-signature')!;
const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
```

Signature invalide → 400 immédiat.

**Idempotence, avant tout traitement :**

```ts
const { error } = await admin
  .from('stripe_events')
  .insert({ id: event.id, type: event.type });
if (error?.code === '23505') return new Response('ok', { status: 200 }); // déjà traité
```

**Événements à traiter :**

| Événement | Action |
|---|---|
| `checkout.session.completed` | Rattacher `stripe_customer_id` et `stripe_subscription_id` au profil (via `client_reference_id`) |
| `customer.subscription.created` · `.updated` | Écrire `subscription_plan` (déduit du price ID), `subscription_status`, `current_period_end`, `cancel_at_period_end`. Si passage à `active` : allouer les crédits IA du palier |
| `customer.subscription.deleted` | `subscription_status = 'canceled'`, `subscription_plan = null`, ramener les crédits au niveau `free` |
| `invoice.paid` | Renouvellement mensuel : réinitialiser `ai_credits_remaining` au quota du palier |
| `invoice.payment_failed` | `subscription_status = 'past_due'` + email de relance via Resend |

Règles :

- Toutes les écritures passent par le client **service role**, jamais le client anon.
- Retrouver l'utilisateur par `subscription.metadata.user_id`, avec repli sur `stripe_customer_id`.
- Déduire le palier du **price ID**, jamais du nom du produit.
- Toujours répondre **200** après traitement, même sur erreur métier — logger et traiter à part.
  Un 500 déclenche des rejeux en boucle côté Stripe.

---

## 6. Décompte des crédits IA — point de vigilance

Après le verrouillage des colonnes du 10 septembre, `ai_credits_remaining` n'est plus modifiable
par `authenticated`. Le décompte à chaque appel IA doit donc passer soit par une fonction
`SECURITY DEFINER`, soit par le service role côté serveur.

```sql
create or replace function public.consume_ai_credit(p_amount int default 1)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_remaining int;
begin
  update public.profiles
     set ai_credits_remaining = ai_credits_remaining - p_amount
   where id = auth.uid()
     and ai_credits_remaining >= p_amount
  returning ai_credits_remaining into v_remaining;

  if v_remaining is null then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;
  return v_remaining;
end;
$$;

revoke all on function public.consume_ai_credit(int) from public, anon;
grant execute on function public.consume_ai_credit(int) to authenticated;
```

**À vérifier explicitement** : que le décompte fonctionne encore de bout en bout après la
migration. C'était déjà identifié comme point ouvert.

---

## 7. Frontend

- **Page tarifs** : chaque bouton fait `POST /api/stripe/checkout` puis `window.location.href = url`.
  Aucun price ID ne doit apparaître côté client.
- **`/settings/billing`** : bouton « Gérer mon abonnement » → `POST /api/stripe/portal`.
  Afficher le palier courant, `current_period_end`, et un avertissement si `cancel_at_period_end`.
- **`/billing/success`** : ne **jamais** accorder l'accès depuis cette page. Afficher un état
  « activation en cours », relire le profil toutes les 2 s pendant ~20 s, puis rediriger.
  C'est le webhook qui fait foi.

---

## 8. Plan de test (mode test, avant toute bascule live)

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
# copier le whsec_... affiché dans STRIPE_WEBHOOK_SECRET
```

| # | Scénario | Attendu |
|---|---|---|
| 1 | Inscription neuve | `trial_ends_at` = J+3, accès niveau Pro, aucun appel Stripe |
| 2 | Souscription Pro, carte `4242 4242 4242 4242` | `subscription_plan='pro'`, `status='active'`, crédits Pro alloués |
| 3 | `stripe trigger invoice.paid` | Crédits réinitialisés, pas de doublon |
| 4 | Rejouer le même event ID | Ignoré par `stripe_events`, aucune double allocation |
| 5 | Carte `4000 0000 0000 0341` (échec) | `status='past_due'`, accès payant retiré, email envoyé |
| 6 | Annulation via le portail | `cancel_at_period_end=true`, accès maintenu jusqu'à échéance |
| 7 | Fin de période après annulation | `status='canceled'`, retour au palier `free` |
| 8 | Changement Pro → Premium via le portail | Palier et crédits mis à jour |
| 9 | Depuis la console navigateur, tenter `update profiles set subscription_plan='premium'` | **Refusé** par RLS |
| 10 | Appel IA jusqu'à épuisement des crédits | Blocage propre, message clair, pas de 500 |

Le test **9** est le plus important : c'est exactement la faille corrigée le 10 septembre.

---

## 9. Bascule en production

1. Recréer les 3 produits et prix **en mode live** (les objets test ne migrent pas).
2. Créer le webhook endpoint live vers `https://getjobvero.com/api/stripe/webhook`,
   récupérer son `whsec_` live.
3. Mettre à jour les variables d'environnement Vercel en production.
4. Un premier paiement réel de bout en bout, puis vérifier l'arrivée du payout sur Mercury
   (compter **7 à 14 jours** pour le tout premier versement, puis J+2 ensuite).

---

## Ordre d'exécution recommandé

1. Migration base de données (§3) + mise à jour d'`admin_settings` (§4)
2. Module `entitlements.ts` (§4) et fonction `consume_ai_credit` (§6)
3. Route webhook (§5.3) — le cœur du système
4. Route checkout (§5.1) puis portail (§5.2)
5. Frontend (§7)
6. Plan de test complet (§8)
7. Bascule live (§9), **après** la refonte visuelle

Les étapes 1 à 6 sont indépendantes du design : la refonte ne touchera que les boutons de la
page tarifs.

---

# Section 10 — Architecture des crédits IA et accès à OpenRouter

> Cette section **remplace** la fonction `consume_ai_credit` proposée en §6. Le mécanisme décrit
> ici est plus complet : il gère la réservation, le règlement, le remboursement, l'idempotence et
> la traçabilité du coût réel.

## 10.1 Principe fondamental

**L'utilisateur ne reçoit jamais de tokens ni de clé OpenRouter.** Il n'appelle jamais OpenRouter.

```
Navigateur → route API Next.js (serveur) → OpenRouter → retour filtré
```

Règles non négociables :

- `OPENROUTER_API_KEY` n'est **jamais** préfixée `NEXT_PUBLIC_`, jamais importée dans un composant
  client, jamais renvoyée dans une réponse.
- Toute route IA est `export const runtime = 'nodejs'` et n'existe que côté serveur.
- Vérification à faire une fois : `grep -r "OPENROUTER" .next/static/` doit ne rien retourner.

Les « crédits IA » de Jobvero sont **ton unité comptable interne**. Ils n'ont aucun rapport avec
les tokens OpenRouter, et l'utilisateur n'a jamais à connaître cette distinction.

## 10.2 Définition du crédit

Un crédit vaut **une candidature**, soit environ 0,13 $ de coût IA réel.

Les autres actions sont tarifées proportionnellement à leur coût réel :

| Action | Coût réel estimé | Crédits |
|---|---|---|
| Candidature (CV + lettre + envoi) | ~0,13 $ | **1** |
| Session d'entretien IA | ~0,88 $ | **7** |
| Génération / réécriture de CV | à mesurer | à définir |
| Lettre de motivation seule | à mesurer | à définir |
| Score ATS | à mesurer | à définir |
| Recherche d'e-mail recruteur | à mesurer | à définir |
| Transcription (Whisper) | à mesurer | à définir |

> Les lignes « à mesurer » se remplissent après la première semaine de données réelles (§10.10).
> D'ici là, tarifie-les à la louche **en surestimant** — il est plus facile de baisser un coût que
> de l'augmenter.

Avantage de ce découplage : si OpenRouter change ses prix, tu ajustes la table des coûts, pas les
quotas annoncés aux clients.

## 10.3 Table des coûts par action

Table dédiée, plutôt que d'alourdir `admin_settings` (qui garde les quotas par palier).

```sql
create table if not exists public.ai_action_costs (
  action           text primary key,
  credits          int     not null check (credits > 0),
  model            text    not null,
  max_tokens       int     not null check (max_tokens > 0),
  max_input_chars  int     not null check (max_input_chars > 0),
  enabled          boolean not null default true,
  updated_at       timestamptz not null default now()
);

alter table public.ai_action_costs enable row level security;
-- lecture seule pour les utilisateurs connectés (affichage du coût dans l'UI)
create policy ai_action_costs_read on public.ai_action_costs
  for select to authenticated using (true);
-- aucune policy d'écriture : service role uniquement
```

Valeurs initiales, alignées sur ta configuration OpenRouter actuelle :

```sql
insert into public.ai_action_costs (action, credits, model, max_tokens, max_input_chars) values
  ('application',       1, 'anthropic/claude-sonnet-4.6', 4000,  20000),
  ('cover_letter',      1, 'deepseek/deepseek-v3.2',      2000,  15000),
  ('cv_generation',     1, 'anthropic/claude-sonnet-4.6', 4000,  20000),
  ('ats_score',         1, 'google/gemini-flash-1.5',     1500,  20000),
  ('interview_session', 7, 'anthropic/claude-sonnet-4.6', 8000,  30000),
  ('chat',              1, 'deepseek/deepseek-v3.2',      2000,  10000)
on conflict (action) do nothing;
```

Le fait que le modèle vive en base te permet d'en changer sans redéployer.

## 10.4 Dimensionnement des quotas par palier

Méthode, à appliquer avec tes propres chiffres :

```
revenu net = prix − (2,9 % + 0,30 $)
budget IA  = revenu net × (1 − marge brute cible)
quota      = budget IA ÷ 0,13 $
```

Avec une marge brute cible de **80 %** :

| Palier | Prix | Net après Stripe | Budget IA | Quota ≈ |
|---|---|---|---|---|
| Starter | 20 $ | 19,12 $ | 3,82 $ | **29 crédits** |
| Pro | 39 $ | 37,57 $ | 7,51 $ | **57 crédits** |
| Premium | 75 $ | 72,52 $ | 14,50 $ | **111 crédits** |

> Chiffres à valider par toi — c'est une décision produit, pas technique. Deux garde-fous :
> arrondis vers le bas plutôt que vers le haut, et vérifie qu'un abonné Premium qui consomme
> **tout** son quota en sessions d'entretien (le poste le plus cher) reste rentable :
> 111 crédits ÷ 7 = 15 sessions × 0,88 $ = 13,20 $ — cohérent avec le budget de 14,50 $. ✅

Ces quotas vont dans `admin_settings`, avec `starter`, `trial` et `free` à ajouter (§4).

## 10.5 Registre de consommation

Une seule table qui sert à la fois de journal comptable et de piste d'audit.

```sql
create table if not exists public.ai_usage (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  idempotency_key   text not null,
  action            text not null,
  credits_charged   int  not null,
  status            text not null default 'reserved'
                    check (status in ('reserved','settled','refunded')),
  model             text,
  prompt_tokens     int,
  completion_tokens int,
  cost_usd          numeric(12,6),
  error             text,
  created_at        timestamptz not null default now(),
  settled_at        timestamptz,
  unique (user_id, idempotency_key)
);

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_status_idx       on public.ai_usage (status) where status = 'reserved';

alter table public.ai_usage enable row level security;
-- l'utilisateur lit son propre historique, rien de plus
create policy ai_usage_read_own on public.ai_usage
  for select to authenticated using (user_id = auth.uid());
```

La contrainte `unique (user_id, idempotency_key)` est ce qui empêche une double facturation quand
un mobile en connexion faible rejoue la même requête.

## 10.6 Fonctions SQL — réserver, solder, rembourser

**Répartition des droits, c'est le point critique :**

| Fonction | Appelée par | Pourquoi |
|---|---|---|
| `reserve_ai_credits` | le **client Supabase de l'utilisateur** | `auth.uid()` ne peut pas être falsifié |
| `settle_ai_usage` | **service role uniquement** | — |
| `refund_ai_usage` | **service role uniquement** | si l'utilisateur pouvait l'appeler → crédits infinis |

### Réservation

```sql
create or replace function public.reserve_ai_credits(
  p_action          text,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cost int; v_enabled boolean; v_id uuid; v_remaining int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select credits, enabled into v_cost, v_enabled
    from public.ai_action_costs where action = p_action;

  if v_cost is null    then raise exception 'unknown_action'   using errcode = 'P0002'; end if;
  if not v_enabled     then raise exception 'action_disabled'  using errcode = 'P0003'; end if;

  -- idempotence : même clé → on rend la réservation existante, sans re-débiter
  select id into v_id from public.ai_usage
   where user_id = auth.uid() and idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  -- débit atomique : le WHERE fait la vérification et la mise à jour en une seule opération
  update public.profiles
     set ai_credits_remaining = ai_credits_remaining - v_cost
   where id = auth.uid()
     and ai_credits_remaining >= v_cost
  returning ai_credits_remaining into v_remaining;

  if v_remaining is null then
    raise exception 'insufficient_credits' using errcode = 'P0004';
  end if;

  insert into public.ai_usage (user_id, action, credits_charged, idempotency_key)
  values (auth.uid(), p_action, v_cost, p_idempotency_key)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.reserve_ai_credits(text, text) from public, anon;
grant execute on function public.reserve_ai_credits(text, text) to authenticated;
```

C'est le `update ... where ai_credits_remaining >= v_cost` qui élimine la course entre deux
requêtes simultanées. Deux appels en parallèle : le second voit le solde déjà décrémenté.

### Règlement et remboursement

```sql
create or replace function public.settle_ai_usage(
  p_id uuid, p_model text, p_prompt_tokens int,
  p_completion_tokens int, p_cost_usd numeric
) returns void
language sql security definer set search_path = public as $$
  update public.ai_usage
     set status = 'settled', model = p_model,
         prompt_tokens = p_prompt_tokens, completion_tokens = p_completion_tokens,
         cost_usd = p_cost_usd, settled_at = now()
   where id = p_id and status = 'reserved';
$$;

create or replace function public.refund_ai_usage(p_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_credits int;
begin
  update public.ai_usage
     set status = 'refunded', error = left(p_error, 500), settled_at = now()
   where id = p_id and status = 'reserved'
  returning user_id, credits_charged into v_user, v_credits;

  if v_user is null then return; end if;   -- déjà soldé ou remboursé : on ne fait rien

  update public.profiles
     set ai_credits_remaining = ai_credits_remaining + v_credits
   where id = v_user;
end;
$$;

revoke all on function public.settle_ai_usage(uuid, text, int, int, numeric) from public, anon, authenticated;
revoke all on function public.refund_ai_usage(uuid, text)                     from public, anon, authenticated;
```

Le `where ... and status = 'reserved'` rend les deux fonctions idempotentes : un double appel
n'a aucun effet.

## 10.7 Anatomie d'une route IA

```ts
// src/app/api/ai/apply/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTION = 'application';

export async function POST(req: Request) {
  // 1. Authentification
  const { supabase, user } = await getServerUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  // 2. Droit d'accès au palier
  const profile = await getProfile(user.id);
  const tier = resolveTier(profile);
  if (!canUse(tier, ACTION)) {
    return Response.json({ error: 'upgrade_required' }, { status: 403 });
  }

  // 3. Rate limiting PAR UTILISATEUR
  const rl = await enforceRateLimit({ userId: user.id, action: ACTION });
  if (!rl.ok) {
    return Response.json({ error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }

  // 4. Validation stricte de l'entrée (zod, longueurs bornées)
  const cfg = await getActionConfig(ACTION);          // lu en base, service role
  const parsed = ApplySchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 });
  if (totalChars(parsed.data) > cfg.max_input_chars) {
    return Response.json({ error: 'input_too_large' }, { status: 413 });
  }

  // 5. Réservation atomique — avec le client de L'UTILISATEUR
  const idem = req.headers.get('idempotency-key') ?? crypto.randomUUID();
  const { data: usageId, error: resErr } = await supabase.rpc('reserve_ai_credits', {
    p_action: ACTION, p_idempotency_key: idem,
  });
  if (resErr) {
    const status = resErr.message.includes('insufficient_credits') ? 402 : 400;
    return Response.json({ error: resErr.message }, { status });
  }

  // 6. Appel OpenRouter
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://getjobvero.com',
        'X-Title': 'Jobvero',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,               // ← épinglé serveur, jamais du client
        max_tokens: cfg.max_tokens,     // ← plafond dur
        messages: buildMessages(parsed.data),
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) throw new Error(`upstream_${res.status}: ${await res.text()}`);
    const out = await res.json();

    // 7. Règlement avec le coût réel — client SERVICE ROLE
    await admin.rpc('settle_ai_usage', {
      p_id: usageId,
      p_model: out.model ?? cfg.model,
      p_prompt_tokens: out.usage?.prompt_tokens ?? null,
      p_completion_tokens: out.usage?.completion_tokens ?? null,
      p_cost_usd: out.usage?.cost ?? null,
    });

    return Response.json(shapeForClient(out));   // ne jamais renvoyer la réponse brute
  } catch (e) {
    await admin.rpc('refund_ai_usage', { p_id: usageId, p_error: String(e) });
    return Response.json({ error: 'ai_unavailable' }, { status: 502 });
  }
}
```

**Note sur le remboursement.** OpenRouter facture dès qu'il a généré des tokens. Un échec avant
génération (4xx, 5xx, réseau) n'est pas facturé → remboursement légitime. Un timeout survenu
*après* le début de la génération peut, lui, avoir été facturé : tu rembourses l'utilisateur et
tu absorbes le coût. C'est marginal et c'est le bon arbitrage commercial. Le rapprochement exact
se fait a posteriori via `GET /api/v1/generation?id=...`.

`out.usage` contient `prompt_tokens`, `completion_tokens`, `total_tokens` et **`cost`** —
OpenRouter le renvoie automatiquement, sans paramètre à ajouter.

## 10.8 Les six verrous obligatoires

| # | Verrou | Sans lui |
|---|---|---|
| 1 | Modèle épinglé côté serveur | Le client envoie `model: "<le plus cher du catalogue>"` et tu payes |
| 2 | `max_tokens` sur chaque appel | Une réponse qui part en boucle coûte 50× ton benchmark |
| 3 | `max_input_chars` validé avant l'appel | Un CV de 200 pages collé dans le prompt |
| 4 | Timeout (`AbortSignal.timeout`) | Une requête pendante bloque une lambda Vercel jusqu'au plafond |
| 5 | Réservation **avant** l'appel | L'utilisateur coupe la connexion en cours de route et consomme gratuitement |
| 6 | Réponse remise en forme, jamais brute | Fuite de métadonnées : modèle, coûts, structure interne |

## 10.9 Rate limiting par utilisateur

Ton `api_rate_limits` actuel est indexé sur l'IP (salée). C'est insuffisant : un abonné légitime
avec des crédits valides peut marteler tes routes depuis une seule session, et plusieurs
utilisateurs derrière un même NAT se pénalisent mutuellement.

Ajoute la dimension `user_id`, avec deux fenêtres cumulatives :

- **rafale** : 5 appels IA / minute
- **soutenu** : 60 appels IA / heure

L'IP reste utile pour les routes non authentifiées (`/api/waitlist`, inscription).

## 10.10 Observabilité et surveillance de marge

Vue à consulter chaque semaine :

```sql
create or replace view public.ai_margin_weekly as
select
  date_trunc('week', u.created_at)            as semaine,
  p.subscription_plan                          as palier,
  count(*)                                     as appels,
  sum(u.credits_charged)                       as credits,
  round(sum(u.cost_usd), 2)                    as cout_reel_usd,
  round(sum(u.cost_usd) / nullif(sum(u.credits_charged), 0), 4) as cout_par_credit
from public.ai_usage u
join public.profiles p on p.id = u.user_id
where u.status = 'settled'
group by 1, 2
order by 1 desc, 2;
```

Le signal à surveiller : **`cout_par_credit` doit rester proche de 0,13 $.** S'il dérive vers le
haut, ta tarification par action est fausse et ta marge fond sans que rien ne casse.

Deuxième requête utile — les utilisateurs dont le coût réel dépasse ce qu'ils payent :

```sql
select u.user_id, p.subscription_plan,
       round(sum(u.cost_usd), 2) as cout_mois
from public.ai_usage u join public.profiles p on p.id = u.user_id
where u.status = 'settled' and u.created_at > date_trunc('month', now())
group by 1, 2
having sum(u.cost_usd) > 15
order by 3 desc;
```

## 10.11 Coupe-circuit — plafond dur sur la clé OpenRouter

C'est ta dernière ligne de défense, celle qui te protège même si tout le reste a échoué.

OpenRouter permet de **plafonner une clé en dollars** via la Management API (`/api/v1/keys`,
champ `limit`, avec `limit_reset` en `daily` / `weekly` / `monthly`). Une fois le plafond
atteint, les requêtes sont **rejetées avant d'être envoyées au fournisseur** — donc sans coût.

À faire :

1. Créer une clé de management sur `openrouter.ai/settings/management-keys`
2. Provisionner une clé **dédiée à Jobvero production**, avec `limit` = un plafond mensuel que tu
   peux encaisser sans douleur (par exemple 3× ton coût IA prévisionnel), `limit_reset: "monthly"`
3. Une seconde clé pour le développement, plafonnée à quelques dollars
4. Ne jamais utiliser ta clé de compte principale dans l'application

Ajoute en complément un flag `ai_enabled` dans `admin_settings`, vérifié en tête de chaque route
IA : il te permet de tout couper depuis la base, sans redéploiement, si tu vois une anomalie.

## 10.12 Protection de l'essai gratuit — le vrai risque

Trois jours gratuits sans carte, avec des appels IA derrière : c'est une invitation aux comptes
jetables. À 0,13 $ la candidature, cent faux comptes qui font vingt candidatures chacun te
coûtent 260 $, prélevés directement sur ta trésorerie.

Quatre protections, à mettre **toutes** :

1. **Vérification e-mail obligatoire avant allocation des crédits.** `trial_ends_at` et les
   crédits ne sont posés qu'au premier login après confirmation, pas à l'inscription.
2. **Quota d'essai volontairement bas — 5 crédits, pas le quota Pro.** Trois jours pour découvrir
   le produit, pas pour postuler à cinquante offres. Exposition maximale par faux compte : 0,65 $.
3. **Un seul essai par adresse e-mail**, y compris après suppression du compte. Conserve une table
   `trial_claims (email_hash, claimed_at)` — hash, pas l'e-mail en clair.
4. **Turnstile déjà en place sur l'inscription** — le garder, et l'étendre à la première action IA
   d'un compte en essai.

Bloque aussi les domaines d'e-mail jetables les plus courants à l'inscription.

## 10.13 Report des crédits — décision à prendre

**Recommandation : pas de report.** Les crédits non consommés sont perdus à chaque
renouvellement, `ai_credits_remaining` est remis au quota du palier sur `invoice.paid`.

Trois raisons : c'est simple à expliquer, ça protège ta marge d'un stock de crédits dormants qui
se déverse d'un coup, et ça évite qu'un utilisateur accumule six mois de quota avant de résilier.

Si tu veux quand même un geste commercial, plafonne le report à **un mois de quota maximum**.

## 10.14 Tests spécifiques à cette section

| # | Scénario | Attendu |
|---|---|---|
| 11 | Deux appels IA simultanés avec 1 seul crédit restant | Un passe, l'autre renvoie 402. Jamais de solde négatif |
| 12 | Même `Idempotency-Key` envoyée deux fois | Un seul débit, la même réponse |
| 13 | Coupure réseau simulée vers OpenRouter | Crédit remboursé, `ai_usage.status = 'refunded'` |
| 14 | `model` injecté dans le corps de la requête | Ignoré — le modèle utilisé reste celui de `ai_action_costs` |
| 15 | Entrée de 500 000 caractères | 413 avant tout appel OpenRouter, aucun crédit débité |
| 16 | 20 appels en 10 secondes | 429 avec `Retry-After` |
| 17 | Depuis la console : `rpc('refund_ai_usage', ...)` | **Refusé** — droit révoqué pour `authenticated` |
| 18 | Depuis la console : `update profiles set ai_credits_remaining = 9999` | **Refusé** par les grants colonne |
| 19 | `ai_enabled = false` dans `admin_settings` | Toutes les routes IA renvoient 503, message clair |
| 20 | `grep -r "OPENROUTER" .next/static/` | **Aucun résultat** |

Les tests **17, 18 et 20** sont les trois qui comptent vraiment. Les deux premiers protègent ta
marge, le dernier protège ta clé.

## 10.15 Variables d'environnement supplémentaires

```env
OPENROUTER_API_KEY=sk-or-v1-...        # clé DÉDIÉE, plafonnée (§10.11)
OPENROUTER_APP_URL=https://getjobvero.com
```

Jamais de `NEXT_PUBLIC_` sur la clé. Jamais.

## 10.16 Limites connues

Ce qu'on sait imparfait et qu'on lance quand même, avec la mesure qui le dit.

| Domaine | Limite mesurée | Date | Cause | Suite |
|---|---|---|---|---|
| Voix française de l'entretien (`aura-2-agathe-fr`) | ~7 % de mots erronés sur un aller-retour synthèse → transcription (anglais `aura-2-thalia-en` : 0 erreur sur 54 mots) | 2026-09-15 | Homophones : la transcription rend un mot qui se prononce pareil mais s'écrit autrement | À revoir avant l'ouverture du marché FR |
| Voix espagnole et portugaise | Aucune voix retenue en espagnol ; aura-2 n'a aucune voix portugaise | 2026-09-15 | Lancement USA uniquement, choix reporté | L'entretien se fait en texte, et l'interface le dit avant le démarrage. Aucun crédit de différence entre texte et voix |

Règle qui en découle, déjà codée : une langue sans voix ne bascule **jamais** sur une voix d'une
autre langue. `POST /api/text-to-speech` répond 422 `voice_unavailable` avant de consommer quoi
que ce soit, et l'entretien continue en texte.
