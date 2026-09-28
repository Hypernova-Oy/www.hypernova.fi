/**
 * Unit tests for the third party this site used to talk to: the testimonial avatars, which were
 * three `i.pravatar.cc` URLs - three extra connections and three requests, each one telling
 * another company who was reading the page. They run with Node's own test runner and type
 * stripping, so no test framework is needed:
 *
 *   npm run test:unit
 *
 * A remote image also needs its host in `image.domains` of astro.config.mjs, which is why the
 * second test reads the config: that entry is what would have to come back with the avatars.
 * The network side of the same rule - no page fetches anything from another origin - is
 * asserted on a running page in tests/e2e/ui-regressions.spec.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const AVATAR_HOSTS =
  /pravatar\.cc|gravatar\.com|dicebear\.com|ui-avatars\.com|placehold\.(?:co|it|jp)|placeholder\.com|unsplash\.com|cloudinary\.com/i;

/** Every `.astro` file under a directory, so a component that is on no page is still read. */
function astroFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) return astroFiles(path);
    return entry.name.endsWith('.astro') ? [path] : [];
  });
}

/**
 * What the browser is given, without the comments around it: Testimonials.astro *names* the host
 * it dropped - `i.pravatar.cc` - in the note that explains why the avatars are initials now, and
 * a comment is not a request.
 */
function withoutComments(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('the avatars are drawn from the author names, not fetched', () => {
  const source = readFileSync('src/components/Testimonials.astro', 'utf8');

  // The circles hold text now: the initials of the name next to them.
  assert.match(source, /const initials = \(name: string\)/);
  assert.match(source, /\{initials\(t\.author\)\}/);

  // And no `src` of that component may point at a host.
  const srcs = [...source.matchAll(/\bsrc=\{?["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(
    srcs.filter((src) => /^(?:https?:)?\/\//.test(src)),
    [],
    'the testimonials load a picture from another host',
  );
});

test('no component asks a placeholder service for a face', () => {
  const files = astroFiles('src');
  assert.ok(files.length > 10, `only ${files.length} .astro files were read: ${files.join(', ')}`);

  for (const file of files) {
    const source = withoutComments(readFileSync(file, 'utf8'));
    assert.ok(!AVATAR_HOSTS.test(source), `${file} asks an avatar host for a picture`);
  }
});

test('the image config allows no remote host', () => {
  const config = readFileSync('astro.config.mjs', 'utf8');

  // `image.domains` and `image.remotePatterns` are the two ways to allow - and to require - a
  // remote image. The comment above the image block talks about `domains` without setting one.
  assert.doesNotMatch(config, /\bdomains\s*:/, 'the image config names remote domains again');
  assert.doesNotMatch(config, /\bremotePatterns\s*:/, 'the image config names remote patterns again');
});
