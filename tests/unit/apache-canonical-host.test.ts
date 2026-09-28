/**
 * Unit tests for the canonical hostname of the site, which scripts/deploy/install.sh writes into
 * the Apache virtual host as a redirect. A deployment answers on two names - `www.hypernova.fi`
 * and `hypernova.fi`, or whatever `--domain` is and its `www` twin - and only one of them is the
 * address of the site: src/config.ts (SITE_URL) is the name in every canonical link, in
 * robots.txt and in the sitemap, while the certificate covers both names. So the other name has
 * to move its visitor to that one. They run with Node's own test runner and type stripping, so
 * no test framework is needed:
 *
 *   npm run test:unit
 *
 * The virtual hosts are rendered by the shell itself, the way tests/unit/apache-caching.test.ts
 * does it, so the rules are read as Apache reads them. What the rules do at runtime was checked
 * against Apache 2.4.58 as well: with the redirect in place, a request for
 * /koha-hosting/?page=2 with `Host: example.com` answers `301` with
 * `Location: https://www.example.com/koha-hosting/?page=2`, the canonical name is served instead
 * of redirected, /.well-known/acme-challenge/ is left alone, and a host with no TLS anywhere
 * answers with the scheme of the request (http) instead of a port nothing listens on.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const INSTALL_SH = 'scripts/deploy/install.sh';
const ASTRO_CONFIG = 'astro.config.mjs';
const SITE_CONFIG = 'src/config.ts';

const DOMAIN = 'www.example.com';
const ALIAS = 'example.com';

/** The body of a top-level shell function, up to the closing brace in the first column. */
function functionBody(source: string, name: string) {
  const start = source.indexOf(`\n${name}() {\n`);
  assert.notEqual(start, -1, `${name}() is not defined in ${INSTALL_SH}`);

  const body = source.slice(start + 1);
  const end = body.indexOf('\n}\n');
  assert.notEqual(end, -1, `${name}() is not closed by a brace in the first column`);

  return body.slice(0, end + 3);
}

/**
 * The three ways the script can end up deploying: an ordinary host with a certificate, a host
 * whose TLS is ended by a proxy in front (`--behind-proxy`, which sets WITH_TLS=0 itself), and a
 * host that serves plain HTTP and has nothing in front (`--no-tls`). The scheme the redirect
 * uses is the one thing that differs between them.
 */
const CASES = [
  { name: 'a host with a certificate', behindProxy: false, tls: true },
  { name: 'a host behind a proxy that ends TLS', behindProxy: true, tls: false },
  { name: 'a host that serves plain HTTP', behindProxy: false, tls: false },
];

/** The globals the script sets before it renders anything, plus what the case adds to them. */
function globals(tls: boolean, behindProxy: boolean) {
  return [
    `DOMAIN=${DOMAIN}`,
    `DOMAIN_ALIAS=${ALIAS}`,
    'PORT=4321',
    'SERVICE=hypernova',
    `WITH_TLS=${tls ? 1 : 0}`,
    `WITH_PROXY=${behindProxy ? 1 : 0}`,
  ].join('\n');
}

/** The canonical-host block on its own, rendered by the shell. */
function renderedDirectives(tls: boolean, behindProxy: boolean) {
  const source = readFileSync(INSTALL_SH, 'utf8');
  const functions = ['canonical_scheme', 'canonical_host_directives']
    .map((name) => functionBody(source, name))
    .join('\n');

  return execFileSync(
    'bash',
    ['-c', `${globals(tls, behindProxy)}\n${functions}\ncanonical_host_directives`],
    { encoding: 'utf8' },
  );
}

/** The whole virtual host, rendered with the variables the script sets before it is called. */
function renderedVhost(tls: boolean, behindProxy: boolean) {
  const source = readFileSync(INSTALL_SH, 'utf8');
  const functions = [
    'compression_directives',
    'caching_directives',
    'security_directives',
    'canonical_scheme',
    'canonical_host_directives',
    'render_vhost',
  ]
    .map((name) => functionBody(source, name))
    .join('\n');

  return execFileSync('bash', ['-c', `${globals(tls, behindProxy)}\n${functions}\nrender_vhost`], {
    encoding: 'utf8',
  });
}

const RULE = /^ {2}RewriteRule \^ (\S+):\/\/www\.example\.com%\{REQUEST_URI\} \[R=301,L\]$/m;
const HOST_CONDITION = `RewriteCond %{HTTP_HOST} ^example\\.com(:[0-9]+)?$ [NC]`;
const ACME_CONDITION = 'RewriteCond %{REQUEST_URI} !^/\\.well-known/acme-challenge/';

test('both virtual hosts send the other name to the canonical one', () => {
  for (const { name, tls, behindProxy } of CASES) {
    const vhost = renderedVhost(tls, behindProxy);

    assert.ok(vhost.includes('RewriteEngine On'), `${name} leaves mod_rewrite off:\n${vhost}`);
    assert.ok(vhost.includes(HOST_CONDITION), `${name} does not match the second name:\n${vhost}`);
    assert.ok(RULE.test(vhost), `${name} does not redirect the second name:\n${vhost}`);
  }
});

test('the canonical name is never sent to itself', () => {
  // Read the condition the way Apache does and try the names a request can arrive under: a
  // rule that matched the canonical name too would send every visitor round and round.
  const directives = renderedDirectives(true, false);
  const line = directives.split('\n').find((entry) => entry.includes('RewriteCond %{HTTP_HOST}'));
  assert.ok(line, `no condition on the Host header:\n${directives}`);

  const pattern = line.replace('  RewriteCond %{HTTP_HOST} ', '').replace(' [NC]', '');
  const matches = new RegExp(pattern);

  assert.ok(matches.test(ALIAS), `${pattern} does not match the name the rule exists for`);
  assert.ok(matches.test(`${ALIAS}:8443`), `${pattern} misses a Host header that carries a port`);
  assert.ok(
    !matches.test(DOMAIN),
    `${pattern} matches the canonical name, so the redirect would point at itself`,
  );
  assert.ok(!matches.test('other.test'), `${pattern} matches a host that is not this site`);
});

test('the redirect keeps the path and the query', () => {
  const directives = renderedDirectives(true, false);
  const rule = directives.split('\n').find((entry) => entry.includes('RewriteRule'));
  assert.ok(rule, `no redirect rule:\n${directives}`);

  // %{REQUEST_URI} is the path and the query together, so a visitor who follows a link to
  // /koha-hosting/?page=2 lands on that page of the canonical name and not on its homepage.
  assert.ok(
    /^ {2}RewriteRule \^ https:\/\/www\.example\.com%\{REQUEST_URI\} \[R=301,L\]$/.test(rule),
    `the rule does not carry the request through:\n${rule}`,
  );
});

test('the redirect goes to HTTPS whenever a browser can reach this site over TLS', () => {
  const https = `RewriteRule ^ https://${DOMAIN}%{REQUEST_URI} [R=301,L]`;

  // The certificate of an ordinary deploy, and the proxy in front of --behind-proxy (which
  // needs no certificate of its own, so WITH_TLS is 0 there): the visitor is on HTTPS either
  // way, and a redirect to plain HTTP would undo that.
  assert.ok(
    renderedDirectives(true, false).includes(https),
    'an ordinary deploy does not use HTTPS',
  );
  assert.ok(
    renderedDirectives(false, true).includes(https),
    'the redirect behind a proxy is not HTTPS',
  );

  // Nothing ends TLS for this host, so https:// would be a port nothing answers on.
  assert.ok(
    renderedDirectives(false, false).includes(
      `RewriteRule ^ %{REQUEST_SCHEME}://${DOMAIN}%{REQUEST_URI}`,
    ),
    'a host that serves plain HTTP sends its visitors to HTTPS',
  );
});

test('a certificate renewal is not redirected', () => {
  for (const { name, tls, behindProxy } of CASES) {
    const directives = renderedDirectives(tls, behindProxy);

    assert.ok(
      directives.includes(ACME_CONDITION),
      `${name} would redirect the challenge of a renewal:\n${directives}`,
    );
  }

  // Both conditions guard the rule that follows them.
  const directives = renderedDirectives(true, false);
  assert.ok(
    directives.indexOf(ACME_CONDITION) < directives.indexOf('RewriteRule'),
    `the exception is not part of the rule:\n${directives}`,
  );
});

test('the redirect is answered before the catch-all ProxyPass', () => {
  for (const { name, tls, behindProxy } of CASES) {
    const vhost = renderedVhost(tls, behindProxy);
    const rule = vhost.indexOf('RewriteRule ^ ');
    const proxy = vhost.indexOf('ProxyPass / http://127.0.0.1:');

    assert.notEqual(rule, -1, `${name} has no redirect to answer with:\n${vhost}`);
    assert.notEqual(proxy, -1, `${name} has no catch-all proxy:\n${vhost}`);
    assert.ok(
      rule < proxy,
      `${name} answers the redirect only after the catch-all ProxyPass:\n${vhost}`,
    );
  }
});

test('the deploy enables the module the redirect needs', () => {
  const source = readFileSync(INSTALL_SH, 'utf8');

  // `RewriteRule` is mod_rewrite. The script enables it next to the proxy modules both with
  // and without a certificate, so a host that reaches this either way can redirect.
  assert.match(source, /run a2enmod -q proxy proxy_http headers ssl rewrite/);
  assert.match(source, /run a2enmod -q proxy proxy_http headers rewrite/);
});

test('the run checks the redirect on the host it has just written', () => {
  const source = readFileSync(INSTALL_SH, 'utf8');
  const check = functionBody(source, 'verify_deployment');

  // The deploy asks Apache for a page under the canonical Host header; the second name has to
  // be asked for as well, or a virtual host that stopped redirecting is deployed as fine.
  assert.ok(
    check.includes('-H "Host: $DOMAIN_ALIAS"'),
    `the run never asks for the second name:\n${check}`,
  );
  assert.ok(check.includes('!= 301'), `the run does not expect a redirect:\n${check}`);
});

test('the name the pages call canonical is the name the redirect uses', () => {
  // The redirect is only the right one while the app and the deploy agree on the name: what a
  // page puts in its canonical link has to be the host this script answers on. src/config.ts is
  // what the pages, the sitemap and robots.txt are built from
  // (tests/e2e/ui-regressions.spec.ts reads those back from a running server).
  const source = readFileSync(INSTALL_SH, 'utf8');
  const deployed = source.match(/DOMAIN="\$\{HYPERNOVA_DOMAIN:-([^}]+)\}"/)?.[1];
  assert.ok(deployed, `the default domain is not readable from ${INSTALL_SH}`);

  const siteUrl = readFileSync(SITE_CONFIG, 'utf8').match(/SITE_URL = '([^']+)'/)?.[1];
  assert.ok(siteUrl, `SITE_URL is not readable from ${SITE_CONFIG}`);

  const configured = readFileSync(ASTRO_CONFIG, 'utf8').match(
    /HYPERNOVA_SITE_URL \?\? '([^']+)'/,
  )?.[1];
  assert.ok(configured, `the default site is not readable from ${ASTRO_CONFIG}`);

  assert.equal(
    new URL(siteUrl).host,
    deployed,
    'the canonical links and the deploy name different hosts',
  );
  assert.equal(
    new URL(configured).host,
    deployed,
    'the build "site" and the deploy name different hosts',
  );
});
