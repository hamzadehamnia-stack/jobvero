// ─── What an AI route's refusal means, for the person reading the screen ──────
//
// The routes answer with a status and a reason. The interface used to read one
// of them — 403 — and call it "out of credits", which is wrong in three of the
// four cases it covers and leaves the user doing the wrong thing about it.
//
//   402  the balance is empty                  → buy credits, or change plan
//   403  the plan does not include the feature → change plan
//   403  reason 'blocked'                      → contact support, not a paywall
//   429  too many requests                     → wait
//   413  the input is too large                → shorten it
//   503  the service is off or unreachable     → not the user's fault, come back
//
// One reader, so every screen says the same thing about the same refusal.

export type AiErrorKind =
  | 'no_credits'
  | 'feature_locked'
  | 'blocked'
  | 'rate_limited'
  | 'too_large'
  | 'unavailable'
  | 'unknown';

export interface AiError {
  kind:       AiErrorKind;
  status:     number;
  /** What the server said, kept for the log and for reasons we have no copy for. */
  serverText: string;
  /**
   * The server's own reason code when it sent one ('blocked', 'trial_expired',
   * 'tier_locked', …). A response body can only be read once, so a screen that
   * needs the reason has to get it from here rather than reading the body again.
   */
  reason:     string;
  /** For no_credits and feature_locked: the plan that unlocks it. */
  upgradeTo?: 'pro' | 'premium';
  /** True when showing the upgrade window is the right answer. */
  offerUpgrade: boolean;
}

const UPGRADE_TIERS = ['pro', 'premium'] as const;

/** Reads a failed response from an AI route. Never throws. */
export async function readAiError(res: Response): Promise<AiError> {
  const body = (await res.json().catch(() => null)) as
    { error?: unknown; reason?: unknown; upgradeTo?: unknown } | null;

  const serverText = typeof body?.error === 'string' ? body.error : '';
  const reason     = typeof body?.reason === 'string' ? body.reason : '';
  const upgradeTo  = UPGRADE_TIERS.includes(body?.upgradeTo as 'pro')
    ? (body!.upgradeTo as 'pro' | 'premium')
    : undefined;

  const kind: AiErrorKind =
      res.status === 402                        ? 'no_credits'
    : res.status === 403 && reason === 'blocked' ? 'blocked'
    : res.status === 403                        ? 'feature_locked'
    : res.status === 429                        ? 'rate_limited'
    : res.status === 413                        ? 'too_large'
    : res.status === 503                        ? 'unavailable'
    : 'unknown';

  return {
    kind,
    status: res.status,
    serverText,
    reason,
    upgradeTo,
    offerUpgrade: kind === 'no_credits' || kind === 'feature_locked',
  };
}

const COPY = {
  en: {
    no_credits:    'You have no AI credits left. Add credits or move to a plan with a bigger monthly allowance.',
    feature_locked:'This feature is not included in your plan.',
    blocked:       'This account is suspended. Please contact support.',
    rate_limited:  'Too many requests in a short time. Please wait a minute and try again.',
    too_large:     'That input is too long. Please shorten it and try again.',
    unavailable:   'The AI service is temporarily unavailable. This is on our side — please try again shortly.',
    unknown:       'Something went wrong. Please try again.',
  },
  fr: {
    no_credits:    "Vous n'avez plus de crédits IA. Ajoutez des crédits ou passez à un plan au quota mensuel plus élevé.",
    feature_locked:"Cette fonctionnalité n'est pas incluse dans votre plan.",
    blocked:       'Ce compte est suspendu. Contactez le support.',
    rate_limited:  'Trop de requêtes en peu de temps. Patientez une minute et réessayez.',
    too_large:     'Ce contenu est trop long. Raccourcissez-le et réessayez.',
    unavailable:   "Le service IA est momentanément indisponible. Cela vient de chez nous — réessayez dans un instant.",
    unknown:       "Une erreur s'est produite. Réessayez.",
  },
  es: {
    no_credits:    'No te quedan créditos IA. Añade créditos o cambia a un plan con más cuota mensual.',
    feature_locked:'Esta función no está incluida en tu plan.',
    blocked:       'Esta cuenta está suspendida. Contacta con soporte.',
    rate_limited:  'Demasiadas solicitudes en poco tiempo. Espera un minuto e inténtalo de nuevo.',
    too_large:     'El contenido es demasiado largo. Acórtalo e inténtalo de nuevo.',
    unavailable:   'El servicio de IA no está disponible por ahora. Es cosa nuestra: inténtalo en unos instantes.',
    unknown:       'Algo ha ido mal. Inténtalo de nuevo.',
  },
  pt: {
    no_credits:    'Não tem mais créditos de IA. Adicione créditos ou mude para um plano com maior quota mensal.',
    feature_locked:'Esta funcionalidade não está incluída no seu plano.',
    blocked:       'Esta conta está suspensa. Contacte o suporte.',
    rate_limited:  'Demasiados pedidos em pouco tempo. Aguarde um minuto e tente novamente.',
    too_large:     'Este conteúdo é demasiado longo. Encurte-o e tente novamente.',
    unavailable:   'O serviço de IA está temporariamente indisponível. A falha é nossa — tente daqui a pouco.',
    unknown:       'Algo correu mal. Tente novamente.',
  },
} as const;

type Locale = keyof typeof COPY;

/**
 * The sentence to show. The server's own message wins only when we have no copy
 * for the case, so a raw internal string never reaches the screen by default.
 */
export function aiErrorMessage(error: AiError, locale: string): string {
  const key = (['en', 'fr', 'es', 'pt'] as const).includes(locale as Locale) ? (locale as Locale) : 'en';
  if (error.kind === 'unknown' && error.serverText) return error.serverText;
  return COPY[key][error.kind];
}
