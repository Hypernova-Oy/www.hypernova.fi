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
  clientId,
  createFormToken,
  inspectFields,
  isCrossSiteSubmission,
  isRateLimited,
  MAX_MESSAGE_LENGTH,
  MAX_SHORT_FIELD_LENGTH,
  type FormId,
} from '../../src/utils/form-protection.ts';

const secret = 'unit-test-secret-long-enough';
const formId: FormId = 'contact';

test('a token from a form that was just opened is too young', () => {
  const now = 1_000_000;
  const token = createFormToken(formId, { now, secret });

  assert.equal(checkFormToken(token, formId, { now: now + 100, secret }), 'too-fast');
});

test('a token is accepted once the visitor had time to fill the form', () => {
  const now = 1_000_000;
  const token = createFormToken(formId, { now, secret });

  assert.equal(checkFormToken(token, formId, { now: now + 5_000, secret }), null);
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
  const client = `unit-test-client-${process.pid}`;
  const now = 5_000_000;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(isRateLimited(client, now), false, `attempt ${attempt + 1} should pass`);
  }

  assert.equal(isRateLimited(client, now), true, 'the sixth attempt should be limited');
  // The window slides, so the client is welcome again once it has passed.
  assert.equal(isRateLimited(client, now + 15 * 60 * 1000 + 1), false);
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
