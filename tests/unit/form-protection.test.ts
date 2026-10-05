/**
 * Unit tests for the form protection module. They run with Node's own test
 * runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checkFormToken,
  cleanFieldValue,
  cleanValues,
  clientFingerprint,
  clientId,
  createFormToken,
  detectSpam,
  HONEYPOT_FIELDS,
  honeypotField,
  inspectFields,
  isCrossSiteSubmission,
  isRateLimited,
  markFormTokenUsed,
  minimumFillTimeMs,
  networkPrefix,
  screenSubmission,
  MAX_MESSAGE_LENGTH,
  MAX_SHORT_FIELD_LENGTH,
  type FormId,
} from '../../src/utils/form-protection.ts';
import { solveProof } from '../../src/utils/proof-of-work.ts';

const secret = 'unit-test-secret-long-enough';
const formId: FormId = 'contact';

/**
 * A submission as the adapter hands it over: a same-origin POST of our own form, with the user
 * agent and the address our proxy appended for it when the test cares about either.
 */
const postRequest = (userAgent?: string, forwardedFor?: string) =>
  new Request('https://www.hypernova.fi/contact/', {
    method: 'POST',
    headers: {
      'sec-fetch-site': 'same-origin',
      ...(userAgent ? { 'user-agent': userAgent } : {}),
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
    },
  });

test('a token from a form that was just opened is too young', () => {
  const now = 1_000_000;
  const token = createFormToken(formId, { now, secret });

  assert.equal(checkFormToken(token, formId, { now: now + 100, secret }), 'too-fast');
});

test('a token is accepted once the visitor had time to fill the form', () => {
  const now = 1_000_000;
  const token = createFormToken(formId, { now, secret });

  assert.equal(checkFormToken(token, formId, { now: now + minimumFillTimeMs(token), secret }), null);
});

test('a token expires after a couple of hours', () => {
  const now = 1_000_000;
  const token = createFormToken(formId, { now, secret });

  assert.equal(
    checkFormToken(token, formId, { now: now + 3 * 60 * 60 * 1000, secret }),
    'stale-token'
  );
});

test('a token is bound to the form it was issued for', () => {
  const now = 1_000_000;
  const token = createFormToken('koha', { now, secret });

  assert.equal(checkFormToken(token, formId, { now: now + 5_000, secret }), 'bad-token');
});

test('missing, foreign and tampered tokens are rejected', () => {
  const now = 1_000_000;
  const token = createFormToken(formId, { now, secret });
  const [payload] = token.split('.');

  assert.equal(checkFormToken(undefined, formId, { secret }), 'no-token');
  assert.equal(checkFormToken('', formId, { secret }), 'no-token');
  assert.equal(checkFormToken('not-a-token', formId, { secret }), 'bad-token');
  assert.equal(checkFormToken(`${payload}.forged`, formId, { now: now + 5_000, secret }), 'bad-token');
  assert.equal(
    checkFormToken(token, formId, { now: now + 5_000, secret: 'a-different-secret-entirely' }),
    'bad-token'
  );
});

test('a rewritten timestamp invalidates the signature', () => {
  const now = 1_000_000;
  const [, signature] = createFormToken(formId, { now, secret }).split('.');
  const forged = Buffer.from(
    JSON.stringify({ f: formId, t: 0, n: 'forged' }),
    'utf8'
  ).toString('base64url');

  assert.equal(checkFormToken(`${forged}.${signature}`, formId, { now, secret }), 'bad-token');
});

test('repeated attempts from one client are rate limited, then allowed again', () => {
  const now = 5_000_000;
  // Each test that counts uses an address no other test counts against: the quota is module
  // state, so a test sharing a network with another would inherit its attempts.
  const request = postRequest(undefined, '198.51.100.4');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(isRateLimited(request, { now }), false, `attempt ${attempt + 1} should pass`);
  }

  assert.equal(isRateLimited(request, { now }), true, 'the sixth attempt should be limited');
  // The window slides, so the client is welcome again once it has passed.
  assert.equal(isRateLimited(request, { now: now + 15 * 60 * 1000 + 1 }), false);
});

test('the next address in the same network does not start with a fresh quota', () => {
  const now = 6_000_000;
  // Twenty attempts from twenty different addresses inside one /64 - the prefix a residential
  // line is handed - so no address is anywhere near its own budget of five and only the network
  // counter can hold the twenty-first. Rotating the interface identifier used to reset the
  // quota, which is exactly how a script would walk past the address counter.
  const inThePrefix = (suffix: number) =>
    postRequest(undefined, `2001:db8:aaaa:bbbb::${suffix.toString(16)}`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(
      isRateLimited(inThePrefix(attempt), { now }),
      false,
      `attempt ${attempt + 1} should pass`
    );
  }

  assert.equal(isRateLimited(inThePrefix(0x21), { now }), true, 'the /64 is over its quota');
  // The neighbouring network is not punished for it.
  assert.equal(isRateLimited(postRequest(undefined, '2001:db8:aaaa:bbbc::1'), { now }), false);

  // And the same holds for the /24 an IPv4 script would walk through the same way.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(isRateLimited(postRequest(undefined, `203.0.113.${attempt + 1}`), { now }), false);
  }

  assert.equal(isRateLimited(postRequest(undefined, '203.0.113.200'), { now }), true);
});

test('a submission that was dropped still spends the quota', async () => {
  const now = 7_000_000;
  // A network of its own again (TEST-NET-1), so the counts below are the whole story.
  const request = postRequest('Mozilla/5.0 Firefox/128', '192.0.2.15');
  const client = clientFingerprint(request);
  const token = createFormToken(formId, { now, secret, client });
  const later = now + minimumFillTimeMs(token);

  // One real search, reused: nothing here marks the token used, so the same answer can carry
  // every submission in this test.
  const answer = await solveProof(token);
  assert.notEqual(answer, null, 'the challenge has to be solvable');

  const send = (raw: Record<string, string>) =>
    screenSubmission({ formId, request, host: 'www.hypernova.fi', client, now: later, secret, raw });
  const verdict = (raw: Record<string, string>) => send(raw).verdict;
  const dropReason = (raw: Record<string, string>) => {
    const screening = send(raw);

    return screening.verdict === 'drop' ? screening.reason : screening.verdict;
  };

  // Three submissions that are dropped as bot signals: one that names no answer, one that names
  // something that is not one, and one that carries no token to answer for. None of them reaches
  // Redmine - and all three are charged to the client anyway, which is the whole point of
  // counting here: a wrong answer may not be a free shot at the next one.
  assert.equal(dropReason({ form_token: token, content: 'hello' }), 'no-proof');
  assert.equal(dropReason({ form_token: token, form_pow: 'not a number' }), 'bad-proof');
  assert.equal(dropReason({ content: 'hello' }), 'no-token');

  // Two genuine submissions fit into what is left of the budget of five...
  assert.equal(verdict({ form_token: token, form_pow: String(answer), content: 'A real message.' }), 'accept');
  assert.equal(verdict({ form_token: token, form_pow: String(answer), content: 'Another one.' }), 'accept');

  // ...and the third is told rather than dropped: three dropped attempts and two messages are
  // the five, whatever the verdicts in between happened to be.
  assert.equal(verdict({ form_token: token, form_pow: String(answer), content: 'One more.' }), 'rate-limited');
});

test('submissions from another origin are flagged as cross-site', () => {
  const url = 'https://www.hypernova.fi/contact/';

  assert.equal(
    isCrossSiteSubmission(new Request(url, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }), 'www.hypernova.fi'),
    false
  );
  assert.equal(
    isCrossSiteSubmission(new Request(url, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', origin: 'https://spam.example' } }), 'www.hypernova.fi'),
    true
  );
  assert.equal(
    isCrossSiteSubmission(new Request(url, { method: 'POST', headers: { origin: 'https://spam.example' } }), 'www.hypernova.fi'),
    true
  );
  // A client that sends neither header stays usable: no signal is not a signal.
  assert.equal(isCrossSiteSubmission(new Request(url, { method: 'POST' }), 'www.hypernova.fi'), false);
});

test('the client address comes from the last proxy hop', () => {
  const proxied = new Request('https://www.hypernova.fi/contact/', {
    headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.4' },
  });

  assert.equal(clientId(proxied), '198.51.100.4');
  assert.equal(clientId(new Request('https://www.hypernova.fi/contact/'), '127.0.0.1'), '127.0.0.1');
});

test('content heuristics catch link spam, markup and control characters', () => {
  assert.equal(inspectFields({ content: 'Hello, could you send us a quote for Koha?' }), null);
  assert.equal(
    inspectFields({
      content: 'a https://a.example b https://b.example c https://c.example d https://d.example e https://e.example',
    }),
    'links'
  );
  assert.equal(inspectFields({ content: '<a href="https://spam.example">cheap pills</a>' }), 'markup');
  assert.equal(inspectFields({ content: '[url=https://spam.example]cheap[/url]' }), 'markup');
  assert.equal(inspectFields({ content: 'normal text \u0007' }), 'control-characters');
});

test('values are normalised before they are stored or sent to Redmine', () => {
  assert.equal(cleanFieldValue('  Anne   Example  ', 100), 'Anne Example');
  assert.equal(cleanFieldValue('line\nbreak', 100), 'line break');
  assert.equal(cleanFieldValue('keep\nlines', 100, { multiline: true }), 'keep\nlines');
  assert.equal(cleanFieldValue('bcc: leak\r\nX-Evil: 1', 200), 'bcc: leak X-Evil: 1');
  assert.equal(cleanFieldValue('x'.repeat(50), 10).length, 10);
});

test('cleanValues applies the limit that fits each field', () => {
  const cleaned = cleanValues({
    email: 'info@example.fi',
    name: 'y'.repeat(MAX_SHORT_FIELD_LENGTH + 50),
    content: 'x'.repeat(MAX_MESSAGE_LENGTH + 50),
  });

  assert.equal(cleaned.email, 'info@example.fi');
  assert.equal(cleaned.name.length, MAX_SHORT_FIELD_LENGTH);
  assert.equal(cleaned.content.length, MAX_MESSAGE_LENGTH);
});

/** A token-shaped string whose signature bytes are known, so the derivations are checkable. */
const tokenWithSignature = (byte: number) => `payload.${Buffer.alloc(32, byte).toString('base64url')}`;

test('every page load renders one of the trap fields, and every one of them is used', () => {
  const derived = new Set<string>();

  for (const byte of [0, 1, 2, 3, 4]) {
    const trap = honeypotField(tokenWithSignature(byte));

    assert.ok(
      HONEYPOT_FIELDS.some((field) => field.name === trap.name && field.label === trap.label),
      `${trap.name} is not one of the trap fields`
    );
    assert.equal(honeypotField(tokenWithSignature(byte)).name, trap.name, 'stable for one token');
    derived.add(trap.name);
  }

  // A trap that always had the same name would be no better than the fixed `website` field it
  // replaced: the whole point is that a script cannot learn the name it has to leave alone.
  assert.equal(derived.size, HONEYPOT_FIELDS.length);
  assert.equal(new Set(HONEYPOT_FIELDS.map((field) => field.name)).size, HONEYPOT_FIELDS.length);

  // No trap may shadow a field the form actually asks for.
  const realFields = new Set([
    'name', 'organization', 'email', 'content', 'records', 'items', 'circulation', 'patrons',
    'librarians', 'current_ils', 'about_my_library', 'additional_services',
    'form_token', 'form_pow', 'form_use',
  ]);
  for (const field of HONEYPOT_FIELDS) {
    assert.equal(realFields.has(field.name), false, `${field.name} is also a real field`);
  }
});

test('the trap is caught under the name this page load rendered', () => {
  const now = 1_000_000;
  const token = createFormToken(formId, { now, secret });
  const trap = honeypotField(token).name;
  const later = now + minimumFillTimeMs(token);

  const submission = { formId, request: postRequest(), now: later, secret };

  assert.equal(detectSpam({ ...submission, raw: { form_token: token, [trap]: 'https://spam.example' } }), 'honeypot');
  // Normalising never turns a filled field back into an empty one: the check reads what was
  // submitted, not what `cleanValues` leaves of it.
  assert.equal(detectSpam({ ...submission, raw: { form_token: token, [trap]: ' ' } }), 'honeypot');
});

test('a script that focuses the trap gives itself away', () => {
  const now = 1_000_000;
  const token = createFormToken(formId, { now, secret });
  const trap = honeypotField(token).name;
  const later = now + minimumFillTimeMs(token);

  const submission = { formId, request: postRequest(), now: later, secret };

  assert.equal(
    detectSpam({ ...submission, raw: { form_token: token, form_use: `name,email,${trap}` } }),
    'trap-focused'
  );

  // The paths a person takes - the fields they type in, the ones a browser fills in without
  // them, and a record that never arrived at all - are not signals.
  for (const list of ['name,email', 'name,organization,email', '']) {
    assert.notEqual(
      detectSpam({ ...submission, raw: { form_token: token, form_use: list } }),
      'trap-focused'
    );
  }
});

test('each token carries its own minimum filling time, between three and five seconds', () => {
  const now = 1_000_000;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = createFormToken(formId, { now, secret });
    const floor = minimumFillTimeMs(token);

    assert.ok(floor >= 3_000 && floor <= 5_000, `the floor was ${floor} ms`);
    assert.equal(checkFormToken(token, formId, { now: now + floor - 1, secret }), 'too-fast');
    assert.equal(checkFormToken(token, formId, { now: now + floor, secret }), null);
  }

  // The floor is derived from the signature, so a script cannot read it: a fixed wait that a bot
  // measured can be too short for the next page load. The bytes below are fixed, so this holds
  // for every run rather than for most of them.
  assert.equal(minimumFillTimeMs(tokenWithSignature(0)), 3_000);
  assert.equal(minimumFillTimeMs('not-a-token'), 3_000, 'anything unreadable gets the lower floor');
  const floors = [0, 1, 2, 3, 4].map((byte) => minimumFillTimeMs(tokenWithSignature(byte)));
  assert.ok(new Set(floors).size > 1, `the floor does not follow the signature: ${floors}`);
});

test('a token is spent by the submission that carried it', () => {
  const now = 1_000_000;
  const token = createFormToken(formId, { now, secret });
  const later = now + minimumFillTimeMs(token);

  assert.equal(checkFormToken(token, formId, { now: later, secret }), null);
  markFormTokenUsed(token, later);
  assert.equal(checkFormToken(token, formId, { now: later, secret }), 'replayed-token');

  // The next page load is unaffected, even on the same clock and the same form.
  const next = createFormToken(formId, { now, secret });
  assert.equal(checkFormToken(next, formId, { now: now + minimumFillTimeMs(next), secret }), null);
});

test('a token only posts from the browser and network it was issued to', () => {
  const now = 1_000_000;
  const issued = createFormToken(formId, { now, secret, client: 'the-browser-that-asked' });
  const later = now + minimumFillTimeMs(issued);

  assert.equal(
    checkFormToken(issued, formId, { now: later, secret, client: 'the-browser-that-asked' }),
    null
  );
  assert.equal(
    checkFormToken(issued, formId, { now: later, secret, client: 'somebody-else' }),
    'client-mismatch'
  );

  // A token with no binding of its own - issued by a caller that had no request to fingerprint -
  // stays usable, and a caller that cannot fingerprint cannot turn that into a mismatch.
  const unbound = createFormToken(formId, { now, secret });
  assert.equal(
    checkFormToken(unbound, formId, { now: now + minimumFillTimeMs(unbound), secret, client: 'anyone' }),
    null
  );
});

test('a client is attributed to its network, not to one address', () => {
  assert.equal(networkPrefix('203.0.113.7'), '203.0.113');
  assert.equal(networkPrefix('203.0.113.200'), '203.0.113');
  assert.equal(networkPrefix('203.0.114.7'), '203.0.114');
  assert.equal(networkPrefix('2001:db8:1::1'), '2001:0db8:0001:0000');
  assert.equal(networkPrefix('2001:db8:1:0:0:0:0:99'), '2001:0db8:0001:0000');
  assert.equal(networkPrefix('2001:db8:1:1::1'), '2001:0db8:0001:0001');
  assert.equal(networkPrefix('2001:db8:1::1%eth0'), '2001:0db8:0001:0000');
  // An IPv4 client that arrives over IPv6 is an IPv4 client, not a member of `0000::/64`.
  assert.equal(networkPrefix('::ffff:203.0.113.7'), '203.0.113');
  assert.equal(networkPrefix('unknown'), 'unknown');
});

test('two browsers on one network are still two clients', () => {
  const firefox = clientFingerprint(postRequest('Mozilla/5.0 Firefox/128'));

  assert.equal(clientFingerprint(postRequest('Mozilla/5.0 Firefox/128')), firefox);
  assert.notEqual(clientFingerprint(postRequest('Mozilla/5.0 Chrome/140')), firefox);
  // What travels in the token is a hash: no user agent and no address in the clear.
  assert.match(firefox, /^[0-9a-f]{32}$/);
  assert.equal(firefox.includes('Mozilla'), false);
});

test('a submission is only accepted with an answer to its challenge', async () => {
  const now = 1_000_000;
  const request = postRequest('Mozilla/5.0 Firefox/128');
  const client = clientFingerprint(request);
  const token = createFormToken(formId, { now, secret, client });
  const later = now + minimumFillTimeMs(token);

  // A real search at the difficulty the server checks, because that is the point: the answer a
  // browser found, over the token it was handed, is what makes a submission acceptable. The
  // search hashes with WebCrypto and the check with node:crypto, so this also says the two
  // agree about the rule.
  const answer = await solveProof(token);
  assert.notEqual(answer, null, 'the challenge has to be solvable');

  const submission = { formId, request, client, now: later, secret };
  assert.equal(
    detectSpam({ ...submission, raw: { form_token: token, form_pow: String(answer) } }),
    null
  );

  // Without it, and with something that is not an answer, the submission is a bot signal - and
  // the same token cannot be carried by a second submission either.
  assert.equal(detectSpam({ ...submission, raw: { form_token: token } }), 'no-proof');
  assert.equal(detectSpam({ ...submission, raw: { form_token: token, form_pow: 'not a number' } }), 'bad-proof');

  markFormTokenUsed(token, later);
  assert.equal(detectSpam({ ...submission, raw: { form_token: token, form_pow: String(answer) } }), 'replayed-token');
});
