/**
 * Unit tests for the canonical hostname of the site: the deployment answers on two names
 * (`www.hypernova.fi` and `hypernova.fi`) and only one of them is its address, so a request that
 * arrives under the other one is sent there with a permanent redirect, path and query kept. They
 * run with Node's own test runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 *
 * The other half of the redirect is the Apache virtual host
 * (tests/unit/apache-canonical-host.test.ts, which renders it out of scripts/deploy/install.sh).
 * This half is what answers a request that does not reach that virtual host - the `:443` host
 * certbot wrote once, which the deploy does not rewrite - so the rule is checked here on plain
 * URLs, including the ones a development server is reached by, which have to be left alone.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canonicalRedirectTarget } from '../../src/utils/canonical-host.ts';

const SITE = new URL('https://www.hypernova.fi');

test('the other name of the site is sent to its address', () => {
  assert.equal(
    canonicalRedirectTarget(new URL('https://hypernova.fi/'), SITE),
    'https://www.hypernova.fi/',
  );
});

test('the path and the query are carried over', () => {
  // The scheme of the request is the one of the plain hop the Node process accepted; the address
  // it is sent to is the one the deployment declares, which is what the canonical links use.
  assert.equal(
    canonicalRedirectTarget(new URL('http://hypernova.fi/koha-hosting/?page=2'), SITE),
    'https://www.hypernova.fi/koha-hosting/?page=2',
  );

  // An encoded value is not touched on the way.
  assert.equal(
    canonicalRedirectTarget(new URL('http://hypernova.fi/haku/?q=%C3%A4&l=fi'), SITE),
    'https://www.hypernova.fi/haku/?q=%C3%A4&l=fi',
  );
});

test('a request that is already on the canonical name is left alone', () => {
  for (const url of [
    'https://www.hypernova.fi/',
    'https://www.hypernova.fi/koha-hosting/?page=2',
    'http://www.hypernova.fi/contact/',
  ]) {
    assert.equal(
      canonicalRedirectTarget(new URL(url), SITE),
      undefined,
      `${url} would be redirected to itself`,
    );
  }
});

test('a certificate renewal is answered on the second name too', () => {
  // The virtual host makes the same exception: a renewal has to reach whatever answers the
  // challenge, and a redirect in front of it is one more thing that can go wrong.
  assert.equal(
    canonicalRedirectTarget(new URL('http://hypernova.fi/.well-known/acme-challenge/token'), SITE),
    undefined,
  );

  // Anything else under /.well-known/ is content like any other and is moved.
  assert.equal(
    canonicalRedirectTarget(new URL('http://hypernova.fi/.well-known/security.txt'), SITE),
    'https://www.hypernova.fi/.well-known/security.txt',
  );
});

test('a host that is neither name is left alone', () => {
  // The names a development server and this deployment are reached by, plus a host that only
  // looks like the site: only the exact second name of the site is redirected, so a rewrite of
  // the first label cannot be bounced to a host nobody asked for.
  for (const url of [
    'http://127.0.0.1:4321/koha-hosting/',
    'http://localhost:4321/',
    'http://homepagenew.lxd/',
    'http://hypernova.fi.example.test/',
    'https://notwww.hypernova.fi/',
    'https://www.hypernova.fi.example.test/',
  ]) {
    assert.equal(
      canonicalRedirectTarget(new URL(url), SITE),
      undefined,
      `${url} does not answer on this site and would be sent away`,
    );
  }
});

test('a site whose address is the bare name sends its www name there', () => {
  // `--domain hypernova.fi` is the same rule the other way round: the name that is not the one
  // the deployment declares is the one that moves.
  const site = new URL('https://hypernova.fi');

  assert.equal(
    canonicalRedirectTarget(new URL('http://www.hypernova.fi/koha-hosting/'), site),
    'https://hypernova.fi/koha-hosting/',
  );
  assert.equal(canonicalRedirectTarget(new URL('https://hypernova.fi/'), site), undefined);
});

test('the name is matched without regard to case, and a port does not hide it', () => {
  // A Host header carries the port when the request does not come in on 80 or 443, and a
  // hostname is not case-sensitive.
  assert.equal(
    canonicalRedirectTarget(new URL('http://HYPERNOVA.FI:8080/koha-hosting/'), SITE),
    'https://www.hypernova.fi/koha-hosting/',
  );
  assert.equal(canonicalRedirectTarget(new URL('http://Hypernova.Fi/'), SITE), 'https://www.hypernova.fi/');
});

test('a site that does not say what its address is redirects nothing', () => {
  // `site` is optional in astro.config.mjs, and a build without it has no canonical links to
  // move a visitor to either.
  assert.equal(canonicalRedirectTarget(new URL('https://hypernova.fi/'), undefined), undefined);
});

test('the redirect never points back at the name that was asked for', () => {
  // A target on the same host as the request would be a redirect that never ends.
  for (const url of ['https://hypernova.fi/', 'http://hypernova.fi/a?b=1', 'http://hypernova.fi:8443/']) {
    const target = canonicalRedirectTarget(new URL(url), SITE);

    assert.ok(target, `${url} is the second name of the site and has to be redirected`);
    assert.equal(new URL(target).host, SITE.host, `${url} was redirected to ${target}`);
  }
});
