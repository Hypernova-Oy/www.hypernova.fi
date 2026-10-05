/**
 * Unit tests for the proof-of-work challenge the two public forms carry. They run with Node's
 * own test runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 *
 * The interesting assertion here is the round trip in "the browser's search finds an answer":
 * the solver hashes with WebCrypto (which is what a browser uses) and the server verifies with
 * `node:crypto`, so passing means the two implementations of the rule agree about the rule.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  hasLeadingZeroDigits,
  PROOF_OF_WORK_DIGITS,
  proofDigestInput,
  solveProof,
  tokenDifficulty,
} from '../../src/utils/proof-of-work.ts';
import { checkFormProof } from '../../src/utils/form-protection.ts';

test('only a digest whose leading digits are zeros counts', () => {
  assert.equal(hasLeadingZeroDigits('0000abcd', 4), true);
  assert.equal(hasLeadingZeroDigits('00000000', 4), true);
  assert.equal(hasLeadingZeroDigits('000abcd0', 4), false);
  assert.equal(hasLeadingZeroDigits('000', 4), false);
  assert.equal(hasLeadingZeroDigits('1234abcd', 4), false);
  // A challenge that asks for no work at all is a broken challenge, not a free pass.
  assert.equal(hasLeadingZeroDigits('abcd', 0), false);
});

test("the browser's search finds an answer the server accepts", async () => {
  const token = 'test-token.signature';
  const answer = await solveProof(token, { digits: 2 });

  assert.notEqual(answer, null, 'a two digit difficulty has to be solvable');
  assert.match(String(answer), /^\d+$/, 'a solution travels as a decimal string');

  assert.equal(checkFormProof(token, answer, { digits: 2 }), null);
  // The next number is not a solution: the browser had to search for the one that is.
  assert.equal(checkFormProof(token, String(Number(answer) + 1), { digits: 2 }), 'bad-proof');
  // And an answer to an easier question is not an answer to the real one.
  assert.equal(checkFormProof(token, answer), 'bad-proof');
});

test('the search gives up at the cap instead of running forever', async () => {
  // One fixed input, so this is the same hundred digests on every run: none of them carries
  // seven leading zeros, and the solver reports that it gave up rather than looping on.
  assert.equal(await solveProof('capped-token.signature', { digits: 7, maxAttempts: 100 }), null);
});

test('a missing answer and a malformed one are told apart', () => {
  assert.equal(checkFormProof('token.signature', undefined), 'no-proof');
  assert.equal(checkFormProof('token.signature', ''), 'no-proof');
  assert.equal(checkFormProof('', '12'), 'no-proof');
  assert.equal(checkFormProof('token.signature', 'not-a-number'), 'bad-proof');
  assert.equal(checkFormProof('token.signature', '-1'), 'bad-proof');
  assert.equal(checkFormProof('token.signature', '1'.repeat(13)), 'bad-proof');
});

test('the browser reads the difficulty out of the token it was given', () => {
  const token = (payload: Record<string, unknown>) =>
    `${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.signature`;

  assert.equal(tokenDifficulty(token({ d: 5 })), 5);
  // A token from before the challenge existed, and anything that is not one of ours.
  assert.equal(tokenDifficulty(token({ f: 'contact', t: 1 })), null);
  assert.equal(tokenDifficulty(token({ d: '4' })), null);
  assert.equal(tokenDifficulty(token({ d: 0 })), null);
  assert.equal(tokenDifficulty(token({ d: 99 })), null);
  assert.equal(tokenDifficulty('not-a-token'), null);
  assert.equal(tokenDifficulty(''), null);
});

test('both sides hash the same string', () => {
  assert.equal(proofDigestInput('a.b', '12'), 'a.b:12');
  // The cost of a submission: 16 ** 4 tries on average. Lowering this is a decision, not an
  // edit - it is what stands between a script and a cheap submission.
  assert.equal(PROOF_OF_WORK_DIGITS, 4);
});
