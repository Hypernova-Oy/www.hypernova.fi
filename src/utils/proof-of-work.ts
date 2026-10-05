/**
 * The proof-of-work challenge both public forms carry (see "Bot protection" in the README).
 *
 * The rule is deliberately small: a submission has to name a number whose SHA-256 digest -
 * over the form's own token and that number - starts with a fixed count of zero hex digits.
 * Finding one costs a browser a fraction of a second, and the server checks it with a single
 * hash.
 *
 * It lives in its own module, away from `form-protection.ts`, because the browser has to run
 * it as well: `form-protection.ts` imports `node:crypto`, so it can never be part of a client
 * script. Everything here works unchanged in Node - which is what the unit tests use - and in
 * a browser, so the rule a visitor's browser solves is literally the same function the server
 * checks. A second implementation of the digest on one side would be a second place to be
 * wrong.
 *
 * The difficulty is not a secret: without it a client would not know when to stop. What keeps
 * the challenge honest is the HMAC signature around it - `createFormToken` puts the difficulty
 * in the signed payload (`d`), the browser reads it back out of the token, and the server
 * verifies against its own constant. Raising `PROOF_OF_WORK_DIGITS` therefore changes the
 * tokens, and nothing about the client script.
 */

/**
 * Leading zero hex digits the digest of a solution has to carry - four digits, sixteen bits.
 * An average solve needs 16 ** digits tries, so this is what the challenge costs: about 65 000
 * hashes, most of a second in a browser on a slow phone, and a constant to raise if a script
 * with a native digest ever decides the work is cheap.
 */
export const PROOF_OF_WORK_DIGITS = 4;

/** A solution is a decimal integer; a longer string than this is refused without being read. */
export const MAX_SOLUTION_LENGTH = 12;

/** The exact string both sides hash. Kept in one place so the two can never drift apart. */
export function proofDigestInput(token: string, solution: string): string {
  return `${token}:${solution}`;
}

/**
 * True when `hex` is a digest with at least `digits` leading zeros. A challenge that asks for
 * no work at all (`0`, a negative, or a fraction) is refused rather than waved through: every
 * caller here treats "the difficulty is missing" as a reason to close, never to open.
 */
export function hasLeadingZeroDigits(hex: string, digits: number = PROOF_OF_WORK_DIGITS): boolean {
  if (!Number.isInteger(digits) || digits < 1 || hex.length < digits) return false;

  for (let index = 0; index < digits; index += 1) {
    if (hex[index] !== '0') return false;
  }

  return true;
}

const encoder = new TextEncoder();

/** A digest as lowercase hex. WebCrypto is the one digest a browser and Node both have. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * How many hashes the solver runs before it gives the event loop a turn. A frame is about
 * 16 ms and a digest takes a few microseconds, so this keeps a solve from being felt as a
 * stutter while it stays far too coarse to slow the search down.
 */
const YIELD_EVERY = 1024;

/**
 * Searches for a solution to the challenge a token carries.
 *
 * `maxAttempts` defaults to 64 times the average search, so the cap is a stop for a broken
 * digest and never something a real browser reaches; when it is hit the solver reports `null`
 * and the caller has to refuse the submission rather than send it without an answer. The
 * solution is returned as a decimal string, because that is what travels in the form.
 */
export async function solveProof(
  token: string,
  options: { digits?: number; maxAttempts?: number } = {}
): Promise<string | null> {
  const digits = options.digits ?? PROOF_OF_WORK_DIGITS;
  const maxAttempts = options.maxAttempts ?? 16 ** digits * 64;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const solution = String(attempt);

    if (hasLeadingZeroDigits(await sha256Hex(proofDigestInput(token, solution)), digits)) {
      return solution;
    }

    if (attempt > 0 && attempt % YIELD_EVERY === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return null;
}

/** The highest difficulty a token may ask for before it is treated as unreadable. */
const MAX_TOKEN_DIFFICULTY = 8;

/**
 * The difficulty the token was issued with, read out of its payload. The payload is signed, so
 * the browser can be told the number it has to solve for without either side keeping a copy of
 * a constant that can go stale: the page reads it from the token it was handed, and the server
 * ignores it and verifies against `PROOF_OF_WORK_DIGITS`, so a payload can never lower the
 * work that is actually checked.
 *
 * `null` means the payload could not be read - a token from before the challenge existed, or
 * anything that is not one of ours - and the caller falls back to the module's own difficulty.
 */
export function tokenDifficulty(token: string): number | null {
  const payload = token.split('.')[0];
  if (!payload) return null;

  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { d?: unknown };

    if (typeof parsed.d !== 'number' || !Number.isInteger(parsed.d)) return null;
    if (parsed.d < 1 || parsed.d > MAX_TOKEN_DIFFICULTY) return null;

    return parsed.d;
  } catch {
    return null;
  }
}
