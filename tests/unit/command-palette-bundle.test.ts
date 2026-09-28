/**
 * Unit tests for how the command palette ships its JavaScript. They run with Node's own test
 * runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 *
 * Astro writes a bundled `<script>` into a file that every page shares and that the deploy
 * caches by its hash for a year. An `is:inline` one - which is what the palette used, with
 * `define:vars` handing it the base path and the localized message - is written into every
 * document instead: 11.7 KB of the 49 KB that `/` used to be, parsed again on every load and
 * re-sent with every page that has a palette. Which of the two a component gets is decided by
 * an attribute that no type checker and no rendered page can see, so it is pinned here, next
 * to the two data attributes that replaced `define:vars`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const PALETTE = 'src/components/CommandPalette.astro';

const source = readFileSync(PALETTE, 'utf8');
const scriptTags = [...source.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);

test('the palette is a bundled script and not inline code in every document', () => {
  assert.equal(scriptTags.length, 1, `${PALETTE} should hold exactly one client script`);

  for (const tag of scriptTags) {
    assert.doesNotMatch(tag, /is:inline/, `the palette is inlined into every page again: ${tag}`);
    assert.doesNotMatch(tag, /define:vars/, `the palette takes its config from define:vars: ${tag}`);
  }
});

test('the config define:vars used to pass in comes from the palette element', () => {
  // The markup renders the two values...
  assert.match(source, /data-search-base=\{resolvePath\('\/'\)\}/);
  assert.match(source, /data-search-no-results=\{t\('No results found for that query\.'\)\}/);

  // ...and the script reads them back off the element, which is what lets the file be shared
  // by both languages instead of being rendered per page.
  assert.match(source, /palette\.dataset\.searchBase/);
  assert.match(source, /palette\.dataset\.searchNoResults/);
});
