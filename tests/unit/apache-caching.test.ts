/**
 * Unit tests for the response-cache policy that scripts/deploy/install.sh writes into the
 * Apache virtual host. They run with Node's own test runner and type stripping, so no test
 * framework is needed:
 *
 *   npm run test:unit
 *
 * The Node adapter has no cache-header option: every file under /_astro/ (whose name carries
 * a content hash) and every file in public/ (whose name stays the same from build to build)
 * is answered with `Cache-Control: public, max-age=0`, so a browser revalidates the
 * stylesheet that blocks the first paint and the preloaded fonts on every navigation. The
 * virtual host is where that is fixed, and these tests run the two here-docs that hold the
 * directives - they only print - so the policy is read as Apache reads it, in both virtual
 * hosts the script can render, instead of as text that a comment could also match.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const INSTALL_SH = 'scripts/deploy/install.sh';

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
 * The directives a function prints, rendered by the shell itself. The here-docs are quoted,
 * so what comes back is byte for byte what lands in
 * /etc/apache2/sites-available/hypernova.conf.
 */
function rendered(name: 'caching_directives' | 'compression_directives') {
  const source = readFileSync(INSTALL_SH, 'utf8');

  return execFileSync('bash', ['-c', `${functionBody(source, name)}\n${name}`], {
    encoding: 'utf8',
  });
}

/** The whole virtual host, rendered with the variables the script sets before it is called. */
function renderedVhost(behindProxy: boolean) {
  const source = readFileSync(INSTALL_SH, 'utf8');
  const functions = [
    'compression_directives',
    'caching_directives',
    'security_directives',
    'site_scheme',
    'canonical_host_directives',
    'render_vhost',
  ]
    .map((name) => functionBody(source, name))
    .join('\n');

  const globals = [
    'DOMAIN=www.example.com',
    'DOMAIN_ALIAS=example.com',
    'PORT=4321',
    'SERVICE=hypernova',
    // --behind-proxy is the one combination the script turns TLS off for itself.
    `WITH_PROXY=${behindProxy ? 1 : 0}`,
    `WITH_TLS=${behindProxy ? 0 : 1}`,
  ].join('\n');

  return execFileSync('bash', ['-c', `${globals}\n${functions}\nrender_vhost`], {
    encoding: 'utf8',
  });
}

const HASHED_ASSETS = 'Header set Cache-Control "public, max-age=31536000, immutable"';
const STABLE_FILES = 'Header set Cache-Control "public, max-age=3600"';

test('the hashed build files are cached for a year', () => {
  const directives = rendered('caching_directives');

  assert.ok(
    directives.includes('<LocationMatch "^/_astro/">'),
    `the directive for /_astro/ is gone:\n${directives}`,
  );
  assert.ok(directives.includes(HASHED_ASSETS), `the year-long policy is gone:\n${directives}`);

  // `Header unset` has to come first: the adapter already sends a header of its own, and a
  // response with two Cache-Control headers is one every proxy and browser may ignore.
  const unset = directives.indexOf('Header unset Cache-Control');
  assert.notEqual(unset, -1, `no directive replaces the adapter's header:\n${directives}`);
  assert.ok(
    unset < directives.indexOf(HASHED_ASSETS),
    `the adapter's header is overwritten instead of replaced:\n${directives}`,
  );
});

test('the files in public keep their names, so they get an hour and not a year', () => {
  const directives = rendered('caching_directives');

  // The favicons (asked for on every document load) and the generated social card.
  const stable =
    '<LocationMatch "^/(favicon[^/]*\\.(ico|png|svg)|og-image\\.png)$">';
  assert.ok(directives.includes(stable), `the rule for the stable names is gone:\n${directives}`);
  assert.ok(directives.includes(STABLE_FILES), `the hour-long policy is gone:\n${directives}`);

  // The two policies are told apart: a name that a later build reuses must not be given the
  // immutable year that only a hashed name can promise.
  const stableRule = directives.slice(directives.indexOf(stable));
  assert.ok(!stableRule.includes('immutable'), `the stable names got the year:\n${directives}`);
});

test('both virtual hosts carry the policy, under a mod_headers guard', () => {
  for (const behindProxy of [false, true]) {
    const vhost = renderedVhost(behindProxy);
    const which = behindProxy ? 'the proxy host' : 'the plain host';

    assert.ok(
      vhost.includes('<IfModule mod_headers.c>'),
      `${which} sends the directives without knowing whether mod_headers is loaded:\n${vhost}`,
    );
    assert.ok(vhost.includes(HASHED_ASSETS), `${which} lost the cache policy:\n${vhost}`);
    assert.ok(vhost.includes(STABLE_FILES), `${which} lost the public file policy:\n${vhost}`);

    // The compression the site already relied on has to survive next to the new block.
    assert.ok(
      vhost.includes('AddOutputFilterByType BROTLI_COMPRESS'),
      `${which} lost the Brotli filter:\n${vhost}`,
    );
  }
});

test('the deploy enables the module the directives need', () => {
  const source = readFileSync(INSTALL_SH, 'utf8');

  // `Header` is mod_headers. The script enables it next to the proxy modules both with and
  // without a certificate, so a host that reaches this either way can send the headers.
  assert.match(source, /run a2enmod -q proxy proxy_http headers ssl rewrite/);
  assert.match(source, /run a2enmod -q proxy proxy_http headers rewrite/);
});
