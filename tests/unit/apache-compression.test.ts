/**
 * Unit tests for the types scripts/deploy/install.sh tells Apache to compress. They run with
 * Node's own test runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 *
 * A filter matches a response by its media type, and a type the list does not name is sent as
 * it is on disk. The list carried `application/javascript`, which nothing here sends: the Node
 * adapter answers a bundled script with `text/javascript`, so the scripts of a page went out
 * uncompressed to every browser - 21 KB of them on `/`, 12 KiB of which PageSpeed counted under
 * "Enable text compression" - while a client that offers only gzip still got a compressed file,
 * because `SetEnvIfExpr` takes the gzip filter out of exactly the requests that offer `br`.
 * These tests render the here-doc that holds the directives, the way
 * tests/unit/apache-caching.test.ts does for the cache policy.
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

/** The directives the here-doc prints, rendered by the shell itself. */
function rendered() {
  const source = readFileSync(INSTALL_SH, 'utf8');
  const body = functionBody(source, 'compression_directives');

  return execFileSync('bash', ['-c', `${body}\ncompression_directives`], { encoding: 'utf8' });
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

/** The media types of the AddOutputFilterByType line that registers the Brotli filter. */
function brotliTypes(directives: string) {
  const line = directives
    .split('\n')
    .find((candidate) => candidate.includes('AddOutputFilterByType BROTLI_COMPRESS'));

  assert.ok(line, `the Brotli filter is not registered here:\n${directives}`);

  // The directive, the filter it registers, and then the types it is registered for.
  return line.trim().split(/\s+/).slice(2);
}

test('the type the Node adapter sends a bundled script as is compressed', () => {
  const types = brotliTypes(rendered());

  // `Content-Type: text/javascript; charset=utf-8` is what the adapter answers a file under
  // /_astro/ with; a filter matches on the media type and ignores the parameter.
  assert.ok(
    types.includes('text/javascript'),
    `the client JavaScript is sent uncompressed again:\n${types.join(' ')}`,
  );
});

test('every type a page of this site is made of is on the list', () => {
  const types = brotliTypes(rendered());

  for (const type of [
    'text/html', // the documents
    'text/css', // the stylesheet, 96 KB of Tailwind
    'text/javascript', // the client JavaScript the adapter serves
    'application/javascript', // the same file from a front end that normalises the type
    'application/json', // /search-index.json and the menu index
    'application/xml', // /sitemap.xml
    'text/xml', // the same document from an older route
    'image/svg+xml', // the inline icons and the favicon
  ]) {
    assert.ok(types.includes(type), `${type} is not compressed:\n${types.join(' ')}`);
  }
});

test('the formats that are compressed already are left alone', () => {
  const types = brotliTypes(rendered());

  // A second pass over them costs the server time and saves nothing: woff2, png, webp and avif
  // are each a compressed container of their own.
  for (const type of ['font/woff2', 'image/png', 'image/webp', 'image/avif']) {
    assert.ok(!types.includes(type), `${type} is compressed twice:\n${types.join(' ')}`);
  }
});

test('gzip is taken out of the request for the clients that read Brotli', () => {
  const directives = rendered();

  // Both filters are registered for these types and mod_deflate's runs first, so without this
  // line every browser that offers `br, gzip` - all of them - would be answered with gzip and
  // the Brotli filter would never run. The expression tests the header, not the browser:
  // `no-gzip` on its own would take compression away from everyone.
  const line = directives.split('\n').find((candidate) => candidate.includes('SetEnvIfExpr'));
  assert.ok(line, `nothing takes mod_deflate out of the request:\n${directives}`);
  assert.ok(
    line.includes('%{HTTP:Accept-Encoding}') && line.includes('no-gzip'),
    `the gzip filter is not tied to what the client accepts:\n${line}`,
  );
});

test('both virtual hosts compress, under a mod_brotli guard', () => {
  for (const behindProxy of [false, true]) {
    const vhost = renderedVhost(behindProxy);
    const which = behindProxy ? 'the proxy host' : 'the plain host';

    // A host without the module still has to start, and gzip is Debian's own default.
    assert.ok(
      vhost.includes('<IfModule mod_brotli.c>'),
      `${which} adds the filter without knowing whether mod_brotli is loaded:\n${vhost}`,
    );
    assert.ok(
      vhost.includes('text/javascript'),
      `${which} lost the type the client JavaScript is served as:\n${vhost}`,
    );
  }
});

/** The server-scope copy of the block, rendered by the shell the way the deploy writes it. */
function renderedServerConf() {
  const source = readFileSync(INSTALL_SH, 'utf8');
  const functions = ['compression_directives', 'render_compression_conf']
    .map((name) => functionBody(source, name))
    .join('\n');

  return execFileSync('bash', ['-c', `${functions}\nrender_compression_conf`], { encoding: 'utf8' });
}

test('the deploy enables the modules the filter needs', () => {
  const source = readFileSync(INSTALL_SH, 'utf8');

  // SETENVIF is mod_setenvif and BROTLI_COMPRESS is mod_brotli; `AddOutputFilterByType` is
  // mod_filter, which Debian ships enabled. The enabling is guarded by the module's presence,
  // so a host that cannot install it deploys without Brotli instead of failing.
  assert.match(source, /run a2enmod -q brotli setenvif/);
  assert.match(source, /if \[ -e \/etc\/apache2\/mods-available\/brotli\.load \]; then/);
});

test('a copy at server scope carries the list to the host certbot wrote', () => {
  const conf = renderedServerConf();

  // render_vhost() writes sites-available/$SERVICE.conf, and obtain_certificate() returns early
  // while a certificate exists, so the `:443` host certbot wrote on the first deploy is never
  // written again. mods-available/http2.conf is what carries the protocol to that host for the
  // same reason (tests/unit/apache-http2.test.ts); this file is the compression end of it.
  assert.ok(
    conf.includes('text/javascript'),
    `the server-scope copy is missing the type the client JavaScript is served as:\n${conf}`,
  );
  assert.deepEqual(
    brotliTypes(conf),
    brotliTypes(rendered()),
    `the two copies register the filter for different types, so they drift:\n${conf}`,
  );

  // The `<Location />` is what makes the copy work on that host. A block at server scope is
  // merged with the filter list of the virtual host by the name of the filter they each
  // register, and the list an older deploy wrote into the `:443` host wins for the types it
  // names - measured on a host: with the old list in the vhost and this list at server scope,
  // a script still went out as 488 bytes against Brotli's 269, exactly as if the block were
  // not there. A block inside a container is merged as the filter config of a directory
  // instead, which is added after the virtual host's own list, and there it does reach the
  // type. Registered twice it still compresses once: the response decoded to the identity
  // bytes of the file.
  const lines = conf.split('\n');
  const guard = lines.indexOf('<IfModule mod_brotli.c>');
  const location = lines.indexOf('  <Location />');
  const closing = lines.indexOf('  </Location>');
  const guardEnd = lines.lastIndexOf('</IfModule>');
  const directive = lines.findIndex((line) => line.includes('AddOutputFilterByType BROTLI_COMPRESS'));

  assert.equal(guard, 0, `the copy is not guarded by the module from its first line:\n${conf}`);
  assert.ok(
    directive > location && closing > directive && guardEnd > closing,
    `the copy is not scoped to a container, so a :443 host written by an older deploy ignores it:\n${conf}`,
  );
});

test('the deploy writes and enables the server-scope copy, and can take it back', () => {
  const apache = functionBody(readFileSync(INSTALL_SH, 'utf8'), 'configure_apache');

  // Written where Apache reads it when the host has mod_brotli, and enabled by name.
  assert.match(
    apache,
    /if \[ -e \/etc\/apache2\/mods-available\/brotli\.load \]; then[\s\S]*?render_compression_conf/,
    `the copy is not written inside the branch that knows the host has mod_brotli:\n${apache}`,
  );
  assert.match(
    apache,
    /write_config 644 root:root "\/etc\/apache2\/conf-available\/\$SERVICE-compression\.conf" < <\(render_compression_conf\)/,
    `the copy is not written where Apache reads it:\n${apache}`,
  );
  assert.match(
    apache,
    /run a2enconf -q "\$SERVICE-compression"/,
    `the file is written but never enabled, so no host reads it:\n${apache}`,
  );

  // A configuration Apache rejects would keep every later reload of this host broken, so the
  // file has to go away again when it is the reason for that; the vhost has its own copy.
  assert.match(
    apache,
    /! apache2ctl configtest[\s\S]*?run a2disconf -q "\$SERVICE-compression"/,
    `a rejected copy stays enabled, so Apache cannot be reloaded again:\n${apache}`,
  );
});
