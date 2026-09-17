# Jobvero — Grille tarifaire et modèle de plans

**Figé le 17 septembre 2026.** Ce document fait autorité. En cas de contradiction
avec du code, une migration, un texte d'interface ou les CGU, **c'est ce document
qui a raison** et le reste qui doit être corrigé.

---

## 1. Les trois plans

| | **Gratuit** | **Pro** | **Premium** |
|---|---|---|---|
| Prix | 0 $ | **39,00 $ / mois** | **69,00 $ / mois** |
| Devise | USD | USD | USD |
| Facturation | — | mensuelle uniquement | mensuelle uniquement |
| Carte à l'inscription | non | — | — |
| **Crédits IA / mois** | **10** | **60** | **150** |
| **Candidatures automatiques / mois** | **0** | **100** | **210** |
| **Alias e-mail `@getjobvero.com`** | **oui** | oui | oui |
| **E-mails triés par l'IA / mois** | **15** | illimité* | illimité* |
| **Brouillon de réponse écrit par l'IA** | **non** | oui | oui |

*\* dans la limite de 25 par alias et par jour*

**Il n'y a pas d'essai gratuit à durée limitée.** Le plan Gratuit est permanent et
tient lieu d'essai. Les plans payants sont payants dès le premier jour.

**Le plan Starter n'existe plus.** Il a été fusionné dans le plan Gratuit.

---

## 2. Les fonctions par plan

| Fonction | Gratuit | Pro | Premium |
|---|---|---|---|
| Recherche d'emploi | ✅ | ✅ | ✅ |
| Suivi des candidatures | ✅ | ✅ | ✅ |
| CV builder + import PDF | ✅ | ✅ | ✅ |
| Lettres de motivation | ✅ | ✅ | ✅ |
| Score ATS | ✅ | ✅ | ✅ |
| Assistant IA | ✅ | ✅ | ✅ |
| **Adresse `@getjobvero.com` + tri du courrier** | ✅ *(15/mois)* | ✅ | ✅ |
| Correspondances IA | ❌ | ✅ | ✅ |
| Coach d'entretien | ❌ | ✅ | ✅ |
| **Réponse rédigée par l'IA** | ❌ | ✅ | ✅ |
| **Candidature automatique** | ❌ | 100 / mois | 210 / mois |
| Support prioritaire | ❌ | ❌ | ✅ |

**Le raisonnement du plan Gratuit :** l'utilisateur met son adresse Jobvero sur son
CV, postule à la main, et voit son courrier trié tout seul. C'est le meilleur
argument d'inscription du marché — aucun concurrent ne propose ça. Mais la
secrétaire **range** son courrier, elle ne lui **écrit** pas ses réponses. Ça, c'est
ce qu'il achète à 39 $.

---

## 3. Deux compteurs séparés

C'est une règle de structure, pas un détail d'implémentation.

- **Les crédits IA** paient les actions de rédaction et d'analyse.
- **Les candidatures automatiques** ont leur propre quota mensuel.

Une candidature automatique **ne consomme aucun crédit IA**. Les deux compteurs ne
se mangent jamais entre eux. C'est la convention de tous les concurrents du marché
(Simplify, AIApply, Jobscan) et c'est ce qui permet d'afficher deux nombres clairs
sur la page tarifs.

---

## 4. La boîte de réception — règles de protection

**Jobvero ne traite que ce qui concerne l'emploi et les candidatures.** Le reste
arrive, est marqué, et n'atteint jamais le modèle.

### Étage 1 — filtre d'en-têtes, avant toute IA. Coût : zéro.

Rejeté sans aucun appel modèle :

- présence de `List-Unsubscribe` → infolettre
- `Precedence: bulk` ou `Auto-Submitted` → envoi de masse ou message automatique
- échec des vérifications SPF / DKIM → expéditeur non authentifié
- messages d'erreur de livraison (`mailer-daemon`, bounces)

Ces messages arrivent dans la boîte de l'utilisateur, marqués « promotionnel »,
sans consommer son quota et sans coûter un centime.

### Étage 2 — hors sujet = traitement arrêté

Ce qui passe l'étage 1 est lu une fois. Si le message ne concerne pas une
candidature, il est rangé dans « autre » et **le traitement s'arrête** : pas
d'analyse, pas de brouillon, pas de mise à jour du suivi de candidature.

### Étage 3 — plafonds

- 25 e-mails par alias et par jour *(déjà en place, bloc e5)*
- 15 e-mails triés par mois sur le plan Gratuit
- plafond global journalier — **à relever avec la croissance** (voir §6)

### Forme de l'alias

L'alias porte un **suffixe aléatoire** : `hamza-a7f3@getjobvero.com`.
Une adresse devinable (`hamza@`) permettrait à un robot de générer des milliers
d'adresses valides en essayant des prénoms.

### Règles absolues

- **L'expéditeur est toujours un alias sur un domaine Jobvero.** Jamais l'adresse
  personnelle de l'utilisateur : SPF et DKIM échoueraient et les e-mails finiraient
  en indésirables.
- **La réponse rédigée par l'IA est un brouillon.** Elle ne part que sur une action
  explicite de l'utilisateur. Aucun déclencheur automatique ne peut écrire à un
  recruteur au nom d'un client.
- **Les pièces jointes ne sont jamais envoyées au modèle.**
- **Aucun e-mail n'est supprimé.** Un message filtré est conservé et visible par son
  destinataire, avec le motif en langage humain.

### À inscrire dans les CGU

L'adresse `@getjobvero.com` est fournie **pour la recherche d'emploi**, pas comme
boîte mail personnelle. Sans cette clause, un utilisateur peut s'en servir comme
adresse principale et faire trier ses factures.

---

## 5. Coûts unitaires mesurés

Mesures réelles issues de `ai_usage`, septembre 2026. Ce ne sont pas des estimations,
sauf la ligne marquée.

| Action | Crédits | Coût moyen |
|---|---|---|
| Générer un CV | 2 | 0,0253 $ |
| Entretien blanc complet | 7 | 0,0160 $ |
| Lettre de motivation | 1 | 0,0087 $ |
| Importer un CV (PDF) | 1 | 0,0062 $ |
| Adapter une lettre | 1 | 0,0054 $ |
| Score ATS / correspondance | 1 | 0,0020 $ |
| Assistant (conversation) | 1 | 0,00024 $ |
| Écriture rapide | 1 | 0,00007 $ |
| **Candidature automatique** | — | **≈ 0,040 $** *(estimé — à mesurer en e9a)* |
| **Classification d'un e-mail** | 0 | **0,0031 $** *(coût absorbé — Gemini Flash depuis e7)* |
| Envoi d'un e-mail (Resend) | — | 0,0009 $ |

---

## 6. Marges

### Frais Stripe

2,9 % + 0,30 $ (carte américaine) + 0,7 % (Stripe Billing sur l'abonnement).
Carte non américaine : +1,5 %.

| | Encaissé | Frais | Net |
|---|---|---|---|
| Pro | 39,00 $ | 1,70 $ | **37,30 $** |
| Premium | 69,00 $ | 2,78 $ | **66,22 $** |

### Gain net par client

| | Usage réaliste | Marge | Plafonds saturés | Marge |
|---|---|---|---|---|
| **Pro** | **≈ 32,50 $** | 84 % | ≈ 28,00 $ | 75 % |
| **Premium** | **≈ 55,60 $** | 81 % | ≈ 51,00 $ | 77 % |

### Le plan Gratuit

| | Coût |
|---|---|
| Usage réaliste (10 e-mails triés + quelques crédits) | **≈ 0,10 $ / mois** |
| Plafonds saturés (15 e-mails + 10 crédits) | **≈ 0,18 $ / mois** |

**1 000 utilisateurs gratuits : environ 100 $ par mois**, 176 $ dans le pire cas.

---

## 7. Plafonds techniques

| Réglage | Valeur | Note |
|---|---|---|
| Crédits gratuits / mois | 10 | |
| Crédits Pro / mois | 60 | |
| Crédits Premium / mois | 150 | |
| Candidatures auto — Gratuit | 0 | |
| Candidatures auto — Pro | 100 | |
| Candidatures auto — Premium | 210 | |
| **Garde-fou candidatures / utilisateur** | **250** | *était 150 — doit rester au-dessus du plafond Premium* |
| E-mails triés / mois — Gratuit | 15 | nouveau |
| Classification — par alias / jour | 25 | inchangé |
| **Classification — global / jour** | **à relever** | *200 aujourd'hui — voir alerte* |

**Alerte de croissance :** à 148 clients recevant chacun ~30 réponses par mois, le
trafic atteint ~148 e-mails/jour, auxquels s'ajoutent les gratuits. Le plafond
global de 200/jour sature dès le troisième mois. Il doit être surveillé et relevé
avec la croissance, sinon les clients payants verront leurs e-mails arriver sans
analyse.

---

## 8. Architecture e-mail

| Domaine | Usage | Pourquoi |
|---|---|---|
| `getjobvero.com` | alias des utilisateurs — candidatures sortantes et réponses des recruteurs | c'est le produit, l'adresse doit être belle devant un recruteur |
| `mail.getjobvero.com` | reçus Stripe, réinitialisation de mot de passe, confirmations d'inscription, notifications | **isole ce dont la panne est mortelle** |

Si le volume de candidatures abîme la réputation du domaine principal, les e-mails
vitaux continuent de partir. Les 10 domaines du plan Resend Pro couvrent ce besoin
sans coût supplémentaire.

---

## 9. Infrastructure

| Service | Plan | Coût / mois |
|---|---|---|
| Vercel | Pro | 20 $ |
| Supabase | **Pro — à souscrire** | 25 $ |
| Resend | **Pro — à souscrire** | 20 $ |
| Domaine | — | ~1 $ |
| OpenRouter | à l'usage | variable |
| **Total fixe** | | **66 $ / mois** |

Resend Pro : 50 000 e-mails inclus, aucune limite journalière, 10 domaines.
Au-delà : 0,90 $ les 1 000 e-mails, sans plafond. Suffisant jusqu'à ~370 clients payants.
**Le plan gratuit de Resend est impossible** — sa limite de 100 e-mails par jour
bloquerait tout le service dès le premier client actif.

Supabase Pro : indispensable pour la conservation des journaux (7 jours au lieu de 24 h)
et pour éviter la mise en pause automatique du projet après une semaine d'inactivité.

---

## 10. Positionnement — ce que le marché vend

| Produit | Prix / mois | Candidature auto | Coach d'entretien | Boîte de réception |
|---|---|---|---|---|
| Kickresume | 24 $ | ❌ | ❌ | ❌ |
| Teal+ | 29 $ | ❌ | ❌ | ❌ |
| AIApply Pro | 29 $ | payant en plus | ✅ | ❌ |
| Simplify+ | 39,99 $ | 87 / mois | ❌ | ❌ |
| Huntr Pro | 40 $ | ❌ | ❌ | ❌ |
| Careerflow Plus | 44,99 $ | ❌ | ✅ | ❌ |
| Jobscan | 49,95 $ | payant en plus | payant en plus | ❌ |
| Final Round AI | 90 $ | ❌ | ✅ | ❌ |
| **Jobvero Pro** | **39 $** | **100 / mois** | ✅ | ✅ |
| **Jobvero Premium** | **69 $** | **210 / mois** | ✅ | ✅ |

**Aucun des neuf concurrents ne gère les réponses des recruteurs.** Tous s'arrêtent
au moment où la candidature part. C'est la seule fonction de Jobvero qu'on ne peut
obtenir nulle part ailleurs, à aucun prix.

**Pour égaler Jobvero Premium**, il faut : Teal+ (29 $) + AIApply Auto-Apply Pro
(99 $) + Final Round AI (90 $) = **218 $ / mois**, dans trois outils qui ne se
parlent pas — et il manque toujours la boîte de réception.

La page tarifs doit **montrer ce calcul**. Une liste de fonctions fait paraître 69 $
cher ; ce tableau le fait paraître évident.

---

## 11. Ce qui doit être corrigé, et par qui

### Code et base — Claude Code

- `admin_settings.limits` : nouveaux crédits, nouveaux quotas de candidatures
- Candidature automatique : compteur mensuel **séparé** des crédits, atomique
- Suppression du palier `starter` partout
- Suppression de toute la logique d'essai à durée limitée
- Unification des **deux tables FEATURES** qui se contredisent (serveur / client)
- Garde-fou candidatures : 150 → 250
- Filtre d'en-têtes avant toute classification IA
- Arrêt du traitement sur un e-mail hors sujet
- Alias avec suffixe aléatoire
- Quota de 15 e-mails triés / mois sur le Gratuit ; pas de brouillon sur le Gratuit
- Prix 39 $ / 69 $ dans `messages/{en,fr,es,pt}.json` et `UpgradeModal.tsx`

### Configuration — Hamza

- Souscrire **Supabase Pro** (25 $/mois)
- Souscrire **Resend Pro** (20 $/mois)
- Configurer le domaine `mail.getjobvero.com` dans Resend
- Créer les produits et prix dans **Stripe** (39 $ et 69 $, mensuels, USD)

### Juridique — Hamza

Les CGU annoncent aujourd'hui **11 / 27 / 49 €** et **7 jours d'essai gratuit**.
Les deux sont faux. À corriger :

- devise : **dollars**, pas euros
- montants : **0 $ / 39 $ / 69 $**, trois plans
- **supprimer toute mention d'essai gratuit** — il n'y en a plus
- décrire le plan Gratuit permanent et ses limites
- ajouter la clause sur l'usage de l'adresse `@getjobvero.com` (recherche d'emploi
  uniquement, pas de boîte mail personnelle)

---

## 12. Journal des décisions

| Date | Décision | Raison |
|---|---|---|
| 16/09 | Essai 7 jours avec carte | conversion automatique |
| 17/09 | **Annulé** — plan gratuit permanent à la place | 8 concurrents sur 9 fonctionnent ainsi ; personne ne sort sa carte pour un produit inconnu |
| 17/09 | Prix 20 / 39 / 75, puis 20 / 39 / 49 | recherche concurrentielle |
| 17/09 | **Figé : 0 / 39 / 69**, trois plans | Starter fusionné dans le Gratuit |
| 17/09 | Candidatures 0 / 100 / 210 | positionne Jobvero au meilleur prix par candidature du marché |
| 17/09 | Deux compteurs séparés | les plafonds dépassaient les crédits ; convention du marché |
| 17/09 | `mail.getjobvero.com` pour le transactionnel | isoler ce dont la panne est mortelle |
| 17/09 | **Alias donné au plan Gratuit**, 15 e-mails triés / mois | c'est le meilleur hameçon du produit : l'utilisateur met l'adresse sur son CV et voit la valeur sans payer |
| 17/09 | **Filtre d'en-têtes + arrêt sur hors-sujet** | Jobvero ne traite que l'emploi ; protège le coût et la pertinence |
| 17/09 | Coût de classification corrigé : 0,0079 $ → **0,0031 $** | chiffre périmé, antérieur au passage sur Gemini Flash au bloc e7 |
