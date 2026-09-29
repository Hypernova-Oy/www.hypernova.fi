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
 * connection the document arrived on.
 *
 * The directive that selects the protocol is `Protocols`, and the deploy puts it in both places
 * it can stand: `/etc/apache2/conf-available/hypernova-protocols.conf`, included at server
 * scope, and - when a `:443` virtual host certbot wrote carries a list of its own, which
 * replaces the server-scope one - a marked block inside that host. The platform the script
 * deploys to ships the module together with a configuration that already names the protocol,
 * which is what the `:443` host of a fresh deployment reads; these tests hold the two copies
 * the deploy owns, since a host that had either of them wrong answered browsers over HTTP/1.1
 * while everything else about it was in order.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const INSTALL_SH = 'scripts/deploy/install.sh';
const HTTP2_CONF = '/etc/apache2/mods-available/http2.conf';
const SERVICE = 'hypernova';
const DOMAIN = 'www.example.com';

/** `warn` from the script, so a function under test can report what it replaced. */
const WARN = `warn() { printf '!!! %s\\n' "$*" >&2; }`;

/** The body of a top-level shell function, up to the closing brace in the first column. */
function functionBody(source: string, name: string) {
  const start = source.indexOf(`\n${name}() {\n`);
  assert.notEqual(start, -1, `${name}() is not defined in ${INSTALL_SH}`);

  const body = source.slice(start + 1);
  const end = body.indexOf('\n}\n');
  assert.notEqual(end, -1, `${name}() is not closed by a brace in the first column`);

  return body.slice(0, end + 3);
}

/** A top-level function of the script, rendered by the shell with SERVICE in place. */
function rendered(name: string) {
  const source = readFileSync(INSTALL_SH, 'utf8');
  const body = functionBody(source, name);

  return execFileSync('bash', ['-c', `SERVICE=${SERVICE}\n${body}\n${name}`], { encoding: 'utf8' });
}

/** The file certbot writes for this site, with a protocol list of its own in it. */
function certbotVhost(protocols = '  Protocols h2c\n') {
  return `<VirtualHost *:443>
  ServerName ${DOMAIN}
  ServerAlias example.com

  SSLEngine on
  SSLCertificateFile /etc/letsencrypt/live/${DOMAIN}/fullchain.pem
  SSLCertificateKeyFile /etc/letsencrypt/live/${DOMAIN}/privkey.pem

  # A list of its own, from a hand edit or from an older deploy.
${protocols}
  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:4321/ retry=0
  ProxyPassReverse / http://127.0.0.1:4321/
</VirtualHost>
`;
}

/** That host put through tls_vhost_with_protocols(), the way the deploy repairs the file. */
function repaired(vhost: string) {
  const source = readFileSync(INSTALL_SH, 'utf8');
  const functions = ['tls_vhost_protocols_block', 'tls_vhost_with_protocols']
    .map((name) => functionBody(source, name))
    .join('\n');

  return execFileSync(
    'bash',
    ['-c', `SERVICE=${SERVICE}\nDOMAIN=${DOMAIN}\n${WARN}\n${functions}\ntls_vhost_with_protocols`],
    { encoding: 'utf8', input: vhost },
  );
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
  // list at server scope is what covers both hosts (the test above), and the deploy writes one
  // of its own as well, so this vhost has no reason to name the protocol.
  assert.ok(
    !/^\s*Protocols\s/m.test(vhost),
    `the protocol is set from the vhost, so a host that already has a certificate keeps getting\n` +
      `HTTP/1.1:\n${vhost}`,
  );
});

test('the deploy writes its own copy of the protocol at server scope', () => {
  const conf = rendered('render_protocols_conf');
  const lines = conf.split('\n');

  // The module's file is what the hosts of a fresh deployment read, and a host where it was
  // replaced or edited would load mod_http2 and still answer over HTTP/1.1.
  assert.match(
    conf,
    /^\s*Protocols h2 h2c http\/1\.1$/m,
    `the copy does not name the protocol, so a host whose package file lost the line has none:\n${conf}`,
  );

  // The guard is what keeps a host where the module was turned off afterwards able to start:
  // an unknown directive in conf-enabled/ would fail every later reload of Apache.
  assert.equal(lines[0], '<IfModule mod_http2.c>', `the copy is not guarded by the module:\n${conf}`);
  assert.ok(
    lines.indexOf('</IfModule>') > lines.findIndex((line) => line.includes('Protocols')),
    `the copy names the protocol outside the guard:\n${conf}`,
  );

  const apache = functionBody(readFileSync(INSTALL_SH, 'utf8'), 'configure_apache');
  assert.match(
    apache,
    /write_config 644 root:root "\/etc\/apache2\/conf-available\/\$SERVICE-protocols\.conf" < <\(render_protocols_conf\)/,
    `the copy is not written where Apache reads it:\n${apache}`,
  );
  assert.match(
    apache,
    /run a2enconf -q "\$SERVICE-protocols"/,
    `the copy is written but never enabled, so no host reads it:\n${apache}`,
  );
  assert.match(
    apache,
    /! apache2ctl configtest[\s\S]*?run a2disconf -q "\$SERVICE-protocols"/,
    `a rejected copy stays enabled, so Apache cannot be reloaded again:\n${apache}`,
  );
});

test('a list the :443 host carries of its own is replaced where it stands', () => {
  const before = certbotVhost();
  const after = repaired(before);

  // A list of its own replaces the one at server scope, so a host carrying `Protocols h2c` -
  // from a hand edit or an older deploy - advertised no h2 over TLS while `:80` still did h2c.
  assert.ok(
    !/^\s*Protocols h2c$/m.test(after),
    `the list of its own is still there, and it is the one that counts for that host:\n${after}`,
  );
  assert.match(
    after,
    /^\s*Protocols h2 h2c http\/1\.1$/m,
    `the host does not carry the deploy's list:\n${after}`,
  );

  // In place, with everything else byte for byte: this is certbot's file, and it carries the
  // certificate paths and the proxy of the site.
  assert.equal(
    after,
    before.replace('  Protocols h2c\n', rendered('tls_vhost_protocols_block')),
    `the file came out with more than its protocol list changed:\n${after}`,
  );
});

test('the host certbot wrote is left alone once it carries the list', () => {
  const once = repaired(certbotVhost());

  // The second deploy has to come out with exactly the same bytes, because write_config()
  // compares the text before it installs a file: anything else would rewrite certbot's file on
  // every run of the deploy, and restart nothing.
  assert.equal(
    repaired(once),
    once,
    `the repair is not idempotent, so every deploy rewrites the file:\n${repaired(once)}`,
  );
});

test('a host that names no protocol of its own is not written at all', () => {
  const before = certbotVhost('');

  // Such a host reads the list at server scope, which is the copy the test above holds.
  assert.equal(
    repaired(before),
    before,
    `a host that names no protocol was rewritten:\n${repaired(before)}`,
  );
});

test('the repair reads before it writes, and only certbot\'s file', () => {
  const repair = functionBody(readFileSync(INSTALL_SH, 'utf8'), 'repair_tls_vhost_protocols');

  // The one file certbot writes for this site, and nothing at all when there is no certificate.
  assert.match(
    repair,
    /local file="\/etc\/apache2\/sites-available\/\$SERVICE-le-ssl\.conf"/,
    `the repair does not target the host certbot writes:\n${repair}`,
  );
  assert.match(
    repair,
    /\[ -f "\$file" \] \|\| return 0/,
    `the repair runs on a host without a certificate:\n${repair}`,
  );
  assert.match(
    repair,
    /grep -qE[^\n]*# BEGIN \.\* protocols\|[^\n]*Protocols\[\[:space:\]\]/,
    `the repair writes the file without looking at what it carries:\n${repair}`,
  );
  assert.match(
    repair,
    /write_config 644 root:root "\$file" < <\(tls_vhost_with_protocols < "\$file"\)/,
    `the repair does not write what tls_vhost_with_protocols() returns:\n${repair}`,
  );

  const apache = functionBody(readFileSync(INSTALL_SH, 'utf8'), 'configure_apache');
  assert.match(
    apache,
    /run a2enmod -q http2[\s\S]*?run repair_tls_vhost_protocols/,
    `the repair is not run by the deploy:\n${apache}`,
  );
});

test('the block is marked with the service name, so a renamed deploy finds it again', () => {
  const block = rendered('tls_vhost_protocols_block');

  assert.match(
    block,
    new RegExp(`^\\s*# BEGIN ${SERVICE} protocols\\b`, 'm'),
    `the block carries no marker to find it by:\n${block}`,
  );
  assert.match(
    block,
    new RegExp(`^\\s*# END ${SERVICE} protocols$`, 'm'),
    `the block carries no marker to find its end by:\n${block}`,
  );
  assert.match(
    block,
    /^\s*Protocols h2 h2c http\/1\.1$/m,
    `the block does not name the protocol:\n${block}`,
  );
});
