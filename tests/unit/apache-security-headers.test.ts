/**
 * Unit tests for the security headers and the legacy-sitemap redirect that
 * scripts/deploy/install.sh writes into the Apache virtual host. They run with Node's own test
 * runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 *
 * The Node entry sends the Content Security Policy itself, as a response header of every page
 * it renders, and nothing else: HSTS, COOP, X-Frame-Options, nosniff and Referrer-Policy are
 * the virtual host's (see the `security_directives` comment in the script). These tests run the
 * here-doc that holds them, and render the two virtual hosts the script can write, the way
 * tests/unit/apache-caching.test.ts does for the cache policy.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const INSTALL_SH = 'scripts/deploy/install.sh';
const ASTRO_CONFIG = 'astro.config.mjs';

/** The body of a top-level shell function, up to the closing brace in the first column. */
function functionBody(source: string, name: string) {
  const start = source.indexOf(`\n${name}() {\n`);
  assert.notEqual(start, -1, `${name}() is not defined in ${INSTALL_SH}`);

  const body = source.slice(start + 1);
  const end = body.indexOf('\n}\n');
  assert.notEqual(end, -1, `${name}() is not closed by a brace in the first column`);

  return body.slice(0, end + 3);
}

/** The directives a function prints, rendered by the shell itself. */
function rendered(name: 'security_directives') {
  const source = readFileSync(INSTALL_SH, 'utf8');

  return execFileSync('bash', ['-c', `${functionBody(source, name)}\n${name}`], {
    encoding: 'utf8',
  });
}

/** The whole virtual host, rendered with the variables the script sets before it is called. */
function renderedVhost(behindProxy: boolean) {
  const source = readFileSync(INSTALL_SH, 'utf8');
  const functions = ['compression_directives', 'caching_directives', 'security_directives', 'render_vhost']
    .map((name) => functionBody(source, name))
    .join('\n');

  const globals = [
    'DOMAIN=www.example.com',
    'DOMAIN_ALIAS=example.com',
    'PORT=4321',
    'SERVICE=hypernova',
    `WITH_PROXY=${behindProxy ? 1 : 0}`,
  ].join('\n');

  return execFileSync('bash', ['-c', `${globals}\n${functions}\nrender_vhost`], {
    encoding: 'utf8',
  });
}

const REQUIRED = [
  'Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"',
  'Header always set Cross-Origin-Opener-Policy "same-origin"',
  'Header always set X-Frame-Options "DENY"',
  'Header always set X-Content-Type-Options "nosniff"',
  'Header always set Referrer-Policy "strict-origin-when-cross-origin"',
];

const REDIRECT = 'RedirectMatch 301 ^/page-sitemap\\.xml$ /sitemap.xml';
const EXCLUSION = 'ProxyPass /page-sitemap.xml !';

test('the security headers are sent, and under a mod_headers guard', () => {
  const directives = rendered('security_directives');

  for (const header of REQUIRED) {
    assert.ok(directives.includes(header), `${header} is gone:\n${directives}`);
  }

  assert.ok(
    directives.includes('<IfModule mod_headers.c>'),
    `the headers are sent without knowing whether mod_headers is loaded:\n${directives}`,
  );

  // `always` and not a bare `set`: the header has to be on the 404s and 500s as well.
  assert.ok(
    !/^\s*Header set /m.test(directives),
    `a header is only sent with a successful response:\n${directives}`,
  );
});

test('both virtual hosts carry the headers', () => {
  for (const behindProxy of [false, true]) {
    const vhost = renderedVhost(behindProxy);
    const which = behindProxy ? 'the proxy host' : 'the plain host';

    for (const header of REQUIRED) {
      assert.ok(vhost.includes(header), `${which} lost ${header}:\n${vhost}`);
    }
  }
});

test('the previous site\'s sitemap is redirected from the virtual host too', () => {
  for (const behindProxy of [false, true]) {
    const vhost = renderedVhost(behindProxy);
    const which = behindProxy ? 'the proxy host' : 'the plain host';

    assert.ok(vhost.includes(REDIRECT), `${which} lost the sitemap redirect:\n${vhost}`);

    // mod_proxy answers before mod_alias when the path reaches it, so the exclusion has to be
    // there and it has to come first.
    const exclusion = vhost.indexOf(EXCLUSION);
    const proxy = vhost.indexOf('ProxyPass / http://127.0.0.1:');
    assert.notEqual(exclusion, -1, `${which} lets Node answer a path the redirect owns:\n${vhost}`);
    assert.ok(exclusion < proxy, `${which} puts the exclusion after the catch-all:\n${vhost}`);
  }
});

test('the app answers the redirect as well, and the same one', () => {
  const config = readFileSync(ASTRO_CONFIG, 'utf8');

  // The virtual host is the fast path; the app is what answers on a host where mod_alias is
  // not enabled, so the two have to agree on the target.
  assert.match(config, /"\/page-sitemap\.xml": "\/sitemap\.xml"/);
});

test('the deploy enables the module the redirect needs', () => {
  const source = readFileSync(INSTALL_SH, 'utf8');

  // `RedirectMatch` is mod_alias. It is enabled on any Debian, so a host where that was
  // turned off still answers with the app's own redirect - which is why the line may not stop
  // the deploy.
  assert.match(source, /run a2enmod -q alias \|\| true/);
});
