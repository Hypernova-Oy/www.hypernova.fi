/**
 * Server-side protection for the two public forms (quote request on /koha/ and
 * the contact form on /contact/).
 *
 * The module is dependency-free: it only uses Node's built-in `crypto` module
 * and plain objects. No captcha and no third-party service is involved, so
 * nothing about the visitor leaves our own server.
 *
 * Three rules shape the design:
 *  1. bot signals get the same "thank you" page as a real submission, so scripts
 *     cannot learn whether they were detected,
 *  2. nothing a visitor submits is ever written to the logs, not even in the
 *     rejection reason, and
 *  3. every check a script can satisfy by looking harder is made to cost
 *     something: the challenge in `proof-of-work.ts` has to be solved, the
 *     honeypot's field name and the minimum filling time change with every
 *     page load, a token is spent by the submission it carried, and every
 *     submission that gets a verdict is charged to the client's quota - so a
 *     wrong answer costs the same as a genuine message.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  hasLeadingZeroDigits,
  MAX_SOLUTION_LENGTH,
  PROOF_OF_WORK_DIGITS,
  proofDigestInput,
} from './proof-of-work.ts';

export type FormId = 'contact' | 'koha';

export type SpamReason =
  | 'honeypot'
  | 'trap-focused'
  | 'no-token'
  | 'bad-token'
  | 'too-fast'
  | 'stale-token'
  | 'replayed-token'
  | 'client-mismatch'
  | 'no-proof'
  | 'bad-proof'
  | 'cross-site'
  | 'links'
  | 'markup'
  | 'control-characters';

export type TokenOptions = {
  now?: number;
  secret?: string;
  /**
   * What the token is bound to, from `clientFingerprint`. A token issued for one
   * browser is refused when another one posts it, so a page of tokens harvested
   * from one host is worth nothing anywhere else.
   */
  client?: string;
};

/** A form that was opened longer ago than this is treated as a replay. */
const TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/**
 * Nobody reads the form and fills it in faster than this. What a token is actually
 * given is this plus up to `FILL_TIME_JITTER_MS`, derived from its own signature (see
 * `minimumFillTimeMs`): a script that measured the old fixed three seconds is too fast
 * for four page loads out of five, and it cannot read the floor it has to sit out.
 */
const MIN_FILL_TIME_MS = 3_000;
const FILL_TIME_JITTER_MS = 2_000;
/**
 * Judged submissions allowed from one client address inside the window below. Every judged
 * submission is counted against it, whatever it turns out to be: see `screenSubmission`.
 */
const RATE_LIMIT_MAX_ATTEMPTS = 5;
/**
 * And judged submissions allowed from one network - the `/24` or `/64` the address belongs to -
 * which is four times the budget of a single address.
 *
 * One counter per address is not enough, because an address is not something an attacker has to
 * keep: a residential IPv6 line is normally handed a whole `/64` and may use a new interface
 * identifier for every attempt, and a hosting range offers as many addresses as it has. Counted
 * per network, moving to the next address in the range buys nothing. The four-fold budget is
 * there because a network is also an office or a home sharing one connection: twenty
 * submissions in a quarter of an hour is generous for the people behind it and still a wall for
 * a script.
 */
const NETWORK_RATE_LIMIT_MAX_ATTEMPTS = 20;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
/** Free-text fields with more links than this are treated as spam. */
const MAX_LINKS_IN_TEXT = 4;
/**
 * The interaction record the browser sends (`form_use`) is a list of field names. A longer
 * one than this is not read at all: the field is the visitor's own markup to fill, and the
 * check it feeds may not become a way to make the server scan a megabyte.
 */
const MAX_FOCUSED_FIELDS_LENGTH = 500;

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
 * The trap fields a page load may render, one of which it does render. A field name is the
 * first thing a spam script special-cases - "fill everything except `website`" is a one-line
 * rule - so the name changes with every token: a script that learned to leave one of these
 * names alone still fills the field this page load actually rendered, and it cannot know which
 * one that is without reading the token.
 *
 * Only the name and the label live here; which one a page uses is decided by `honeypotField`,
 * and the name goes into the submission as nothing but a field the server reads back. Adding an
 * entry is all it takes to make the rotation wider.
 */
export const HONEYPOT_FIELDS = [
  { name: 'website', label: 'Website' },
  { name: 'homepage', label: 'Home page' },
  { name: 'url', label: 'URL' },
  { name: 'fax', label: 'Fax' },
  { name: 'company_website', label: 'Company website' },
] as const;

/**
 * The bytes of a token's HMAC signature, or `null` when the string is not shaped like one.
 *
 * The signature is not verified here - `checkFormToken` does that, and every caller of the two
 * derivations below is either rendering a token this process just signed or has already
 * checked one. What the bytes are good for is being unknowable in advance: they come out of an
 * HMAC over the payload, so they are stable for one token, different for the next page load,
 * and nobody without the key can work out what they will be.
 */
function signatureBytes(token: string): Buffer | null {
  const signature = typeof token === 'string' ? token.split('.')[1] : undefined;
  if (!signature) return null;

  const bytes = Buffer.from(signature, 'base64url');

  return bytes.length >= 32 ? bytes : null;
}

/**
 * How long a visitor must have had the form open, in milliseconds: the minimum plus up to two
 * seconds of jitter, taken from the token's signature. A submission that arrives faster is
 * dropped, and because the floor is a per-page-load number that a script can neither read nor
 * measure, sitting out a fixed wait no longer passes - the bot trading a fixed delay for
 * throughput now has to sleep for the longest floor of them all.
 */
export function minimumFillTimeMs(token: string): number {
  const bytes = signatureBytes(token);
  if (!bytes) return MIN_FILL_TIME_MS;

  return MIN_FILL_TIME_MS + (bytes.readUInt32BE(0) % (FILL_TIME_JITTER_MS + 1));
}

/** The trap field this token's page load renders. */
export function honeypotField(token: string): (typeof HONEYPOT_FIELDS)[number] {
  const bytes = signatureBytes(token);
  if (!bytes) return HONEYPOT_FIELDS[0];

  return HONEYPOT_FIELDS[bytes[4] % HONEYPOT_FIELDS.length];
}

/**
 * Issues a signed timestamp for a freshly rendered form. The page embeds it in a
 * hidden field; a submission without a valid, old-enough token never reaches
 * Redmine.
 *
 * The payload carries four things beyond the time: the form it belongs to, a random nonce (so
 * two page loads never share a token), the fingerprint of the browser it was issued to (`c`,
 * see `clientFingerprint`), and the difficulty of the challenge the page has to solve (`d`,
 * see `tokenDifficulty`). The difficulty is a hint for the browser only - the server checks
 * the proof against its own constant, so a payload can never ask for less work.
 */
export function createFormToken(formId: FormId, options: TokenOptions = {}): string {
  const { now = Date.now(), secret = tokenSecret, client } = options;
  const payload = Buffer.from(
    JSON.stringify({
      f: formId,
      t: now,
      n: randomBytes(8).toString('hex'),
      c: client,
      d: PROOF_OF_WORK_DIGITS,
    }),
    'utf8'
  ).toString('base64url');

  return `${payload}.${sign(payload, secret)}`;
}

/**
 * The signatures of the tokens that have already carried a submission, with the time they can
 * be forgotten again. A `Map` rather than a list so the lookup on every submission is a hash
 * lookup, and bounded like the rate limiter: the standalone Node server is one process, so an
 * unbounded map is a way to grow a process that never restarts.
 */
const usedTokenSignatures = new Map<string, number>();

/**
 * Returns the reason a token is unusable, or `null` when it is fine.
 *
 * A token is spent by the submission it carried (`markFormTokenUsed`), so a replay of the
 * same one is refused even when it is still young - that is what stops one fetched page from
 * being worth an unlimited number of posts.
 */
export function checkFormToken(
  token: unknown,
  formId: FormId,
  options: TokenOptions = {}
): SpamReason | null {
  const { now = Date.now(), secret = tokenSecret, client } = options;

  if (typeof token !== 'string' || token.length === 0) return 'no-token';
  if (token.length > 400) return 'bad-token';

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return 'bad-token';

  const expected = Buffer.from(sign(payload, secret), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'bad-token';

  // Only reached with a signature we produced, so the signature is a key no other page load
  // shares: the replay registry can hold it instead of the whole token.
  if (usedTokenSignatures.has(signature)) return 'replayed-token';

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      f?: unknown;
      t?: unknown;
      c?: unknown;
    };
    if (parsed.f !== formId || typeof parsed.t !== 'number') return 'bad-token';

    // Not every token has to be bound - an issuer that has no request to fingerprint simply
    // leaves `c` out - but a bound one may only be posted by the client it was issued to.
    if (typeof parsed.c === 'string' && client !== undefined && parsed.c !== client) {
      return 'client-mismatch';
    }

    const age = now - parsed.t;
    if (age < minimumFillTimeMs(token)) return 'too-fast';
    if (age > TOKEN_MAX_AGE_MS) return 'stale-token';
  } catch {
    return 'bad-token';
  }

  return null;
}

/**
 * Retires a token once the submission it carried has been accepted, so the same token cannot
 * carry a second one.
 *
 * Called *after* a submission is judged genuine and accepted, never at the point of checking:
 * a visitor who fixes a typo and posts the re-rendered form again still holds the same token,
 * and spending it on the first attempt would drop the corrected one.
 */
export function markFormTokenUsed(token: unknown, now = Date.now()): void {
  const signature = typeof token === 'string' ? token.split('.')[1] : undefined;
  if (!signature) return;

  usedTokenSignatures.set(signature, now + TOKEN_MAX_AGE_MS);

  if (usedTokenSignatures.size > 5_000) {
    for (const [key, expires] of usedTokenSignatures) {
      if (expires <= now) usedTokenSignatures.delete(key);
    }
  }
}

/**
 * Verifies the proof the browser had to find (see `proof-of-work.ts`).
 *
 * `token` has already been checked by `checkFormToken`: this only re-runs one hash over a
 * string the browser worked for, so a submission that names a missing or wrong answer costs
 * the server nothing to refuse while a script has to spend the work to make one.
 *
 * The difficulty is this module's own constant rather than anything the submission says, so a
 * payload - or a token from an older deploy - can never lower the work that is checked.
 */
export function checkFormProof(
  token: unknown,
  solution: unknown,
  options: { digits?: number } = {}
): SpamReason | null {
  const digits = options.digits ?? PROOF_OF_WORK_DIGITS;

  if (typeof token !== 'string' || token.length === 0) return 'no-proof';
  if (typeof solution !== 'string' || solution.length === 0) return 'no-proof';
  if (solution.length > MAX_SOLUTION_LENGTH || !/^\d+$/.test(solution)) return 'bad-proof';

  const digest = createHash('sha256')
    .update(proofDigestInput(token, solution), 'utf8')
    .digest('hex');

  return hasLeadingZeroDigits(digest, digits) ? null : 'bad-proof';
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

/** An IPv6 hextet as four digits, lowercase, so every spelling of an address looks the same. */
const normaliseHextet = (hextet: string) => hextet.padStart(4, '0').toLowerCase();

/** `::` written out in full, or `null` when the string is not an address after all. */
function expandIPv6(address: string): string[] | null {
  const parts = address.split('::');
  if (parts.length > 2) return null;

  const groups = (part: string) => (part.length === 0 ? [] : part.split(':'));

  if (parts.length === 1) {
    const whole = groups(parts[0]);

    return whole.length === 8 ? whole.map(normaliseHextet) : null;
  }

  const head = groups(parts[0]);
  const tail = groups(parts[1]);
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;

  return [...head, ...Array<string>(missing).fill('0'), ...tail].map(normaliseHextet);
}

/**
 * The network an address belongs to: the `/24` of an IPv4 address and the `/64` of an IPv6
 * one.
 *
 * The exact address is deliberately not part of it. A phone on a mobile network can be moved
 * between addresses inside its operator's prefix while a visitor is filling in a form - and an
 * IPv6 client is usually handed a whole `/64` with rotating interface identifiers - so binding
 * a token to the address itself would drop real visitors mid-form. The prefix still separates
 * one network from another, which is what a token farm needs to be worth anything.
 */
export function networkPrefix(address: string): string {
  const withoutZone = address.split('%')[0];

  // `::ffff:203.0.113.7` is an IPv4 client, and taking its first four IPv6 groups would put
  // every one of them in the same bucket.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(withoutZone)?.[1];
  if (mapped) return mapped.split('.').slice(0, 3).join('.');

  if (!withoutZone.includes(':')) {
    const octets = withoutZone.split('.');

    return octets.length === 4 ? octets.slice(0, 3).join('.') : withoutZone;
  }

  const hextets = expandIPv6(withoutZone);

  return hextets ? hextets.slice(0, 4).join(':') : withoutZone;
}

/**
 * What a token is tied to: the browser's `User-Agent` and the network its address belongs to,
 * hashed together.
 *
 * A token lands in the page, so the raw user agent and address must not - but they cannot be
 * left out either, or a token farm could hand one batch of tokens to anybody: a token that was
 * fetched from one host would post from any other. Hashed, a token is only good for the
 * browser and the network it was issued to, and the visitor sees nothing but a third opaque
 * string next to the other two.
 *
 * A real visitor keeps both for as long as a form takes to fill: a user agent does not change
 * mid-session (only an update in between does), and mobile addresses move inside their /24 or
 * /64 rather than out of it.
 */
export function clientFingerprint(request: Request, socketAddress?: string): string {
  const userAgent = request.headers.get('user-agent') ?? '';
  const address = networkPrefix(clientId(request, socketAddress));

  return createHash('sha256').update(`${userAgent}\n${address}`, 'utf8').digest('hex').slice(0, 32);
}

/** `Astro.clientAddress` throws when the adapter cannot provide the address. */
export function safeClientAddress(read: () => string | undefined): string | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/**
 * Attempts per counted key, keyed as `<kind>:<value>`: the address itself and the network it
 * belongs to (see `networkPrefix`). Both live in one map so pruning stays a single pass, and it
 * is bounded like the replay registry: the standalone Node server is one process, so an
 * unbounded map is a way to grow a process that never restarts.
 */
const attempts = new Map<string, number[]>();

/**
 * Charges one attempt to one key and reports whether that key is now over its budget.
 *
 * Attempts older than the window are forgotten first, which makes the quota a sliding one: a
 * client that keeps knocking while it is over the limit stays over it for as long as it keeps
 * knocking, because every knock is a fresh timestamp, and it is welcome again once it has been
 * quiet for the whole window.
 */
function chargeAttempt(key: string, max: number, now: number): boolean {
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);

  return recent.length > max;
}

/**
 * Records a submission against the client that sent it and the network it came from, and reports
 * whether it is over quota.
 *
 * The two counters answer two questions. The address counter is one host hammering us. The
 * network counter is the same script moving to the next address inside the `/24` or `/64` its
 * provider handed it - and that second counter is what keeps the challenge in `proof-of-work.ts`
 * honest: with only the address counted, an attacker holding a `/64` has as many attempts as it
 * has addresses, and at 65 536 possible answers for a four-digit challenge a lucky guess only
 * takes patience. Counted per network, guesses come out of the same budget as messages.
 *
 * Every judged submission is charged, including the ones `detectSpam` has just condemned:
 * `screenSubmission` is the only caller, and it charges before it applies the verdict, so a
 * wrong answer is never a free shot at the next one.
 */
export function isRateLimited(
  request: Request,
  options: { socketAddress?: string; now?: number } = {}
): boolean {
  const { socketAddress, now = Date.now() } = options;
  const address = clientId(request, socketAddress);

  const overClientQuota = chargeAttempt(`addr:${address}`, RATE_LIMIT_MAX_ATTEMPTS, now);
  const overNetworkQuota = chargeAttempt(
    `net:${networkPrefix(address)}`,
    NETWORK_RATE_LIMIT_MAX_ATTEMPTS,
    now
  );

  // Keep the map from growing without bound on a busy day. Two keys per submission, so this
  // counts keys rather than visitors.
  if (attempts.size > 5_000) {
    for (const [key, times] of attempts) {
      if (times.every((time) => now - time >= RATE_LIMIT_WINDOW_MS)) attempts.delete(key);
    }
  }

  return overClientQuota || overNetworkQuota;
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

/**
 * Everything a judgement about a submission needs: the form it belongs to, the request that
 * carries it, the fingerprint the page was rendered for, and the values exactly as submitted.
 */
export type SubmissionInput = {
  formId: FormId;
  request: Request;
  host?: string;
  /** The fingerprint the page was rendered for, from `clientFingerprint`. */
  client?: string;
  /** Values exactly as submitted. */
  raw: Record<string, string>;
  /** The unit tests pass a fixed clock and key; a request uses neither. */
  now?: number;
  secret?: string;
};

/**
 * Runs the signals that decide a submission on their own: the trap, the interaction record,
 * the token, the proof and the content heuristics. The pages call this only when the field
 * validation passed, so a visitor who is fixing a typo still gets the field messages.
 */
export function detectSpam(input: SubmissionInput): SpamReason | null {
  const { formId, request, host, raw, client, now, secret } = input;

  const token = typeof raw.form_token === 'string' ? raw.form_token : '';
  const trap = honeypotField(token);

  // The trap's name is decided by the token, so a script that learned to leave one field name
  // alone still fills the one this page load rendered. The raw value is read, not the cleaned
  // one: a single space in the field is a filled field, whatever normalising does to it later.
  if ((raw[trap.name] ?? '').length > 0) return 'honeypot';

  // A person cannot focus the trap: it is off-screen, out of the tab order and hidden from
  // screen readers. A script that walks the form and focuses every field it finds - the
  // cheapest way to look like a person - writes its name into this list.
  const used = raw.form_use ?? '';
  if (used.length > 0 && used.length <= MAX_FOCUSED_FIELDS_LENGTH && used.split(',').includes(trap.name)) {
    return 'trap-focused';
  }

  // The token has to be ours, young enough, old enough, unused, and posted by the browser it
  // was issued to.
  const tokenReason = checkFormToken(raw.form_token, formId, { client, now, secret });
  if (tokenReason) return tokenReason;

  // And the submission has to name the answer to the challenge that came with it.
  const proofReason = checkFormProof(raw.form_token, raw.form_pow);
  if (proofReason) return proofReason;

  if (isCrossSiteSubmission(request, host)) return 'cross-site';

  return inspectFields(raw);
}

/** What a page does with a submission that passed its field validation. */
export type SubmissionScreening =
  /** Genuine, and inside the client's quota: send it. */
  | { verdict: 'accept' }
  /** A bot signal: answered exactly like an accepted submission, and never sent. */
  | { verdict: 'drop'; reason: SpamReason }
  /** Genuine, but over the client's quota: the visitor is told instead of losing the message. */
  | { verdict: 'rate-limited' };

/**
 * Decides what to do with a validated submission, and charges the client's quota for it.
 *
 * The charge happens here, before the verdict is applied, and for *every* submission that gets a
 * verdict - including the ones `detectSpam` has just condemned. That is the point rather than an
 * accident: a script that guesses at the proof instead of solving it has to pay for its guesses
 * out of the same budget as a visitor's messages, so wrong answers cannot be poured in any
 * faster than the budget allows. Charging only accepted submissions would make a wrong answer
 * free, and free guesses against a sixteen-bit challenge are a matter of patience.
 *
 * A submission that is not judged is not charged either: the pages call this only once the
 * fields validate, so a visitor who is fixing a typo spends nothing.
 *
 * The verdict order matters too. A dropped submission is answered like an accepted one (see
 * `detectSpam`), so a script never learns from the response whether it was detected. Being over
 * quota is not a detection - it is a count of the visitor's own submissions, which a person can
 * keep anyway - so that verdict is the one the visitor is told about.
 */
export function screenSubmission(
  input: SubmissionInput & { socketAddress?: string }
): SubmissionScreening {
  const reason = detectSpam(input);

  const overQuota = isRateLimited(input.request, {
    socketAddress: input.socketAddress,
    now: input.now,
  });

  if (reason) return { verdict: 'drop', reason };
  if (overQuota) return { verdict: 'rate-limited' };

  return { verdict: 'accept' };
}
