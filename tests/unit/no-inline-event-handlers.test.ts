/**
 * Unit tests for the one rule the Content Security Policy puts on the markup: no inline event
 * handlers. They run with Node's own test runner and type stripping, so no test framework is
 * needed:
 *
 *   npm run test:unit
 *
 * `script-src` (astro.config.mjs) lists what a page may run by `'self'` and by SHA-256 hash. An
 * inline handler - `onclick="..."` - is JavaScript as well, and what allows it is 'unsafe-inline'
 * or 'unsafe-hashes': a bare hash does not cover an attribute. Neither keyword is in the policy,
 * so a browser refuses the handler with a console violation and the control does nothing at all.
 * That is invisible in development, where Astro serves no policy at all, and invisible to the
 * type checker and to a screenshot alike - which is how
 * `onclick="window.toggleCommandPalette?.()"` stayed on the two search buttons of the navigation
 * bar while the search button of a built site was dead: only Ctrl+K still opened the palette,
 * because that listener lives in the palette's script file. It is scanned here, off the source,
 * because nothing else in the tree would notice it.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const NAVBAR = 'src/components/Navbar.astro';
const PALETTE = 'src/components/CommandPalette.astro';

/** Every `.astro` file under a directory, so a component that is on no page is still read. */
function astroFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) return astroFiles(path);
    return entry.name.endsWith('.astro') ? [path] : [];
  });
}

/**
 * What the browser is handed, without the parts of a `.astro` file that are not markup: the
 * comments (which are allowed to discuss an attribute), the frontmatter, and the `<script>` and
 * `<style>` blocks. An event handler is an attribute of an element, so only the markup is
 * scanned - and a comment that says `onclick` is not an attribute.
 */
function markupOnly(source: string) {
  return source
    .replace(/^---[\s\S]*?\n---/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
}

test('no element carries an inline event handler', () => {
  const offenders = astroFiles('src').flatMap((path) => {
    const matches = [...markupOnly(readFileSync(path, 'utf8')).matchAll(/\son[a-z]+\s*=/gi)];

    // The attribute name is what the message needs; the position is not worth the noise.
    return matches.map((match) => `${path}: ${match[0].trim()}`);
  });

  assert.deepEqual(
    offenders,
    [],
    'an inline event handler is refused by script-src (no \'unsafe-inline\', no \'unsafe-hashes\'), ' +
      'so the control it is on does nothing in a browser:\n' +
      offenders.join('\n'),
  );
});

test('the search buttons ask the palette to open, and the palette listens for them', () => {
  const navbar = readFileSync(NAVBAR, 'utf8');
  const triggers = [...navbar.matchAll(/<button\b[^>]*data-search-trigger[^>]*>/g)].map(
    (match) => match[0],
  );

  // One for the wide layout and one for the narrow one, the same way the bar has two of them.
  assert.equal(triggers.length, 2, `${NAVBAR} no longer carries the two search buttons`);

  const palette = readFileSync(PALETTE, 'utf8');

  // The attribute and the binding have to name each other: a button nothing listens for is the
  // same dead control as an inline handler, just without the console message.
  assert.match(
    palette,
    /window\.addEventListener\('click',[\s\S]*?closest\('\[data-search-trigger\]'\)/,
    `${PALETTE} does not bind the [data-search-trigger] the bar carries`,
  );

  // Bound to `window` rather than to the elements, and once: the bar is replaced by every
  // client-side navigation, so two bindings would open the palette and close it again in the
  // same click.
  assert.match(
    palette,
    /if \(!window\.__zenixSearchWindowBound\) \{\n\s+window\.__zenixSearchWindowBound = true;/,
    `${PALETTE} would bind its window listeners again on every client-side navigation`,
  );
});

test('the search buttons announce the name of the page they are on', () => {
  // A second `aria-label` in the same tag is dropped by the parser, so a localized one followed
  // by a literal English one leaves the button announcing English on the Finnish pages - and an
  // e2e case that looks the button up by its name skips silently instead of failing.
  const source = readFileSync(NAVBAR, 'utf8');

  for (const match of source.matchAll(/<button\b[^>]*data-search-trigger[^>]*>/g)) {
    const labels = [...match[0].matchAll(/aria-label=(?:"[^"]*"|\{[^}]*\})/g)].map(
      (label) => label[0],
    );

    assert.deepEqual(labels, ["aria-label={t('Search')}"], `unexpected label on ${match[0]}`);
  }
});
