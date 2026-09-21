/**
 * Server-side protection for the two public forms (quote request on /koha/ and
 * the contact form on /contact/).
 *
 * The module is dependency-free: it only uses Node's built-in `crypto` module
 * and plain objects. No captcha and no third-party service is involved, so
 * nothing about the visitor leaves our own server.
 *
 * Two rules shape the design:
 *  1. bot signals get the same "thank you" page as a real submission, so scripts
 *     cannot learn whether they were detected, and
 *  2. nothing a visitor submits is ever written to the logs, not even in the
 *     rejection reason.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type FormId = 'contact' | 'koha';

export type SpamReason =
  | 'honeypot'
  | 'no-token'
  | 'bad-token'
  | 'too-fast'
  | 'stale-token'
  | 'cross-site'
  | 'links'
  | 'markup'
  | 'control-characters';

export type TokenOptions = { now?: number; secret?: string };

/** A form that was opened longer ago than this is treated as a replay. */
const TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Nobody reads the form and fills it in faster than this. */
const MIN_FILL_TIME_MS = 3_000;
/** Submissions accepted from one client inside the window below. */
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
/** Free-text fields with more links than this are treated as spam. */
const MAX_LINKS_IN_TEXT = 4;

/** Hard limits; the forms carry matching `maxlength` attributes as well. */
export const MAX_SHORT_FIELD_LENGTH = 500;
export const MAX_MESSAGE_LENGTH = 4000;
const EMAIL_MAX_LENGTH = 254;

const MULTILINE_FIELDS = new Set(['content', 'about_my_library', 'additional_services']);

/**
 * Read from .env in production. Without it a random per-process key is used,
 * which still works but invalidates forms that are open during a restart, so
 * setting FORM_TOKEN_SECRET (see .env.example) is recommended.
 */
const configuredSecret = (import.meta.env as Record<string, string | undefined> | undefined)
  ?.FORM_TOKEN_SECRET;
const tokenSecret =
  configuredSecret && configuredSecret.length >= 16 ? configuredSecret : randomBytes(32).toString('hex');

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

/**
 * Issues a signed timestamp for a freshly rendered form. The page embeds it in a
 * hidden field; a submission without a valid, old-enough token never reaches
 * Redmine.
 */
export function createFormToken(formId: FormId, options: TokenOptions = {}): string {
  const { now = Date.now(), secret = tokenSecret } = options;
  const payload = Buffer.from(
    JSON.stringify({ f: formId, t: now, n: randomBytes(8).toString('hex') }),
    'utf8'
  ).toString('base64url');

  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the reason a token is unusable, or `null` when it is fine. */
export function checkFormToken(
  token: unknown,
  formId: FormId,
  options: TokenOptions = {}
): SpamReason | null {
  const { now = Date.now(), secret = tokenSecret } = options;

  if (typeof token !== 'string' || token.length === 0) return 'no-token';
  if (token.length > 400) return 'bad-token';

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return 'bad-token';

  const expected = Buffer.from(sign(payload, secret), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'bad-token';

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      f?: unknown;
      t?: unknown;
    };
    if (parsed.f !== formId || typeof parsed.t !== 'number') return 'bad-token';

    const age = now - parsed.t;
    if (age < MIN_FILL_TIME_MS) return 'too-fast';
    if (age > TOKEN_MAX_AGE_MS) return 'stale-token';
  } catch {
    return 'bad-token';
  }

  return null;
}

/**
 * The address a submission is attributed to. Behind our own reverse proxy the
 * last `X-Forwarded-For` hop is the address that proxy appended; without a proxy
 * the socket address from the adapter is used.
 */
export function clientId(request: Request, socketAddress?: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const lastHop = forwarded
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();

  return lastHop || request.headers.get('x-real-ip')?.trim() || socketAddress || 'unknown';
}

/** `Astro.clientAddress` throws when the adapter cannot provide the address. */
export function safeClientAddress(read: () => string | undefined): string | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

const attempts = new Map<string, number[]>();

/**
 * Records an attempt for a client and reports whether it has used up its quota.
 * An in-memory counter is enough here: the standalone node server is a single
 * process, and losing the counter on restart does not open a real hole.
 */
export function isRateLimited(client: string, now = Date.now()): boolean {
  const recent = (attempts.get(client) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  attempts.set(client, recent);

  // Keep the map from growing without bound on a busy day.
  if (attempts.size > 5_000) {
    for (const [key, times] of attempts) {
      if (times.every((time) => now - time >= RATE_LIMIT_WINDOW_MS)) attempts.delete(key);
    }
  }

  return recent.length > RATE_LIMIT_MAX_ATTEMPTS;
}

/** A submission has to come from our own pages, not from another site. */
export function isCrossSiteSubmission(request: Request, siteHost?: string): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return true;

  const origin = request.headers.get('origin');
  if (!origin || !siteHost) return false;

  try {
    return new URL(origin).host !== siteHost;
  } catch {
    return true;
  }
}

/** Catches the content patterns that automated submissions share. */
export function inspectFields(raw: Record<string, string>): SpamReason | null {
  const text = Object.values(raw).join('\n');

  // Control characters are never typed by a person; \n, \r and \t are allowed.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) return 'control-characters';

  if (/<a\s+href|<br\s*\/?>|\[url=|\[link=/i.test(text)) return 'markup';

  const links = text.match(/https?:\/\//gi)?.length ?? 0;
  if (links > MAX_LINKS_IN_TEXT) return 'links';

  return null;
}

/**
 * Normalises a submitted value before it is stored in the form state and sent
 * to Redmine: no control characters, a bounded length, and for single-line
 * fields no line breaks either.
 */
export function cleanFieldValue(
  value: string,
  maxLength: number,
  options: { multiline?: boolean } = {}
): string {
  const { multiline = false } = options;

  const withoutControls = value.replace(/[\u0000-\u001F\u007F]/g, (char) => {
    if (multiline && (char === '\n' || char === '\t')) return char;
    return ' ';
  });

  return withoutControls.replace(/\r\n?/g, '\n').replace(/[ \t]{2,}/g, ' ').trim().slice(0, maxLength);
}

/** Applies `cleanFieldValue` with the limits that fit each field of the forms. */
export function cleanValues(raw: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw)) {
    const multiline = MULTILINE_FIELDS.has(key);
    const maxLength = key === 'email'
      ? EMAIL_MAX_LENGTH
      : multiline
        ? MAX_MESSAGE_LENGTH
        : MAX_SHORT_FIELD_LENGTH;

    cleaned[key] = cleanFieldValue(value, maxLength, { multiline });
  }

  return cleaned;
}

/** Runs every bot signal that does not depend on the visitor's field values. */
export function detectSpam(input: {
  formId: FormId;
  request: Request;
  host?: string;
  /** Values exactly as submitted, for the content heuristics. */
  raw: Record<string, string>;
  /** Cleaned values, used for the honeypot and the token. */
  fields: Record<string, string>;
}): SpamReason | null {
  const { formId, request, host, raw, fields } = input;

  if ((fields.website ?? '').length > 0) return 'honeypot';

  const tokenReason = checkFormToken(raw.form_token, formId);
  if (tokenReason) return tokenReason;

  if (isCrossSiteSubmission(request, host)) return 'cross-site';

  return inspectFields(raw);
}
