/**
 * Unit tests for the HTTP/2 that scripts/deploy/install.sh turns on. They run with Node's own
 * test runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 *
 * HTTP/1.1 opens at most six connections per origin, and the document of `/` is followed by
 * thirteen requests on that origin - the stylesheet, three fonts, eight scripts and an image.
 * The ones over the limit wait for a connection to come free, one round trip each on the phone
 * connection PageSpeed simulates, which is what the 985 ms chain a run of the site was drawn
 * with - document to page.js to index.js - was made of. `mod_http2` multiplexes them over the
 * connection the document arrived on. The platform the script deploys to ships the module
 * together with the configuration that selects the protocol, so the deploy only has to enable
 * it - which is the one thing that works for the `:443` virtual host certbot wrote on the first
 * deploy and this script then leaves alone.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const INSTALL_SH = 'scripts/deploy/install.sh';
const HTTP2_CONF = '/etc/apache2/mods-available/http2.conf';

/** The body of a top-level shell function, up to the closing brace in the first column. */
function functionBody(source: string, name: string) {
  const start = source.indexOf(`\n${name}() {\n`);
  assert.notEqual(start, -1, `${name}() is not defined in ${INSTALL_SH}`);

  const body = source.slice(start + 1);
  const end = body.indexOf('\n}\n');
  assert.notEqual(end, -1, `${name}() is not closed by a brace in the first column`);

  return body.slice(0, end + 3);
}

test('the deploy enables the module when the host has it', () => {
  const apache = functionBody(readFileSync(INSTALL_SH, 'utf8'), 'configure_apache');

  // `apache2` is installed by the first step of the deploy and carries mod_http2, so the
  // module is there on the systems this script supports.
  assert.match(
    apache,
    /if \[ -e \/etc\/apache2\/mods-available\/http2\.load \]; then/,
    `the module is enabled without checking whether the host has it:\n${apache}`,
  );
  assert.match(apache, /run a2enmod -q http2/, `the module is never enabled:\n${apache}`);

  // A host that does not have it has to deploy anyway, over HTTP/1.1 and with a warning.
  assert.match(
    apache,
    /else\n\s+warn "[^"]*HTTP\/1\.1[^"]*"/,
    `a host without mod_http2 is failed instead of warned about:\n${apache}`,
  );
});

test('the configuration the package ships is what selects the protocol', (context) => {
  if (!existsSync(HTTP2_CONF)) {
    context.skip(`this host has no ${HTTP2_CONF}`);
    return;
  }

  // The file next to http2.load is included at server scope once the module is enabled, so it
  // covers every virtual host - including the `:443` one certbot wrote on the first deploy,
  // which this script does not rewrite while the certificate is already there. A host whose
  // http2.conf carried no `Protocols` line would load the module and still answer over
  // HTTP/1.1, which is why the deploy is checked against the file rather than trusted.
  assert.match(
    readFileSync(HTTP2_CONF, 'utf8'),
    /^Protocols\s+h2\b/m,
    `${HTTP2_CONF} no longer turns HTTP/2 on for the hosts that load it`,
  );
});

test('the protocol is not left to the virtual host, which certbot copies once', () => {
  const vhost = functionBody(readFileSync(INSTALL_SH, 'utf8'), 'render_vhost');

  // A `Protocols` line in the vhost would reach the `:443` host only on the deploy that writes
  // it, and certbot writes that host from this one once, when the certificate is issued. The
  // module's own configuration is what has to carry it (the test above).
  assert.ok(
    !/^\s*Protocols\s/m.test(vhost),
    `the protocol is set from the vhost, so a host that already has a certificate keeps getting\n` +
      `HTTP/1.1:\n${vhost}`,
  );
});
