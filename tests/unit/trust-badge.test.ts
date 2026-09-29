/**
 * Unit tests for the trust badge in the footer - the flag-marked label under the site's tagline -
 * and for the flag files it draws.
 *
 * It is the one place where the two languages do not say the same thing in two languages: a
 * Finnish reader is told the work is Finnish and a reader of the English pages where their data
 * stays, each with the flag that belongs to it (TRUST_FLAG in Footer.astro). The first test holds
 * that pair; the second holds the files behind the marks and the ratio they are drawn at, because
 * a mark with no file behind it draws nothing, and one drawn into a box of another shape than the
 * flag letterboxes it.
 *
 * The third holds the budget the marks stay inside. The e2e case *the language picker draws its
 * own flag* counts the rules on a page that read as a country flag and allows two - the pair the
 * picker draws (LanguagePicker.astro) - so a badge whose marks were named the way the picker names
 * its flags (`fi-eu`, say) would fail a page check over about a kilobyte of SVG. That is why they
 * are `badge-flag-*`, and this is what keeps them that way.
 *
 * They run with Node's own test runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const FOOTER = 'src/components/Footer.astro';
const BADGE = 'src/components/Badge.astro';
const SPEC = 'tests/e2e/ui-regressions.spec.ts';
const FLAGS = 'src/images/flags';

/**
 * The shape the picker's own two rules take, and the one the e2e case counts on a page: a rule
 * whose text carries `.fi-` and exactly two letters - what a flag-icons class looks like.
 */
const COUNTRY_FLAG_RULE = /\.fi-[a-z]{2}(?![\w-])/;

/** The `.class {` names of a component's scoped stylesheet, in the order they are written. */
function styleClasses(source: string): string[] {
  return [...source.matchAll(/^\s*\.([\w-]+)\s*\{/gm)].map((match) => match[1]);
}

/** Width over height of an SVG file's `viewBox`, so the shape a mark draws into can be measured. */
function viewBoxRatio(source: string): number {
  const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/.exec(source) ?? [];
  assert.ok(width && height, 'a flag file carries no viewBox to measure');

  return Number(width) / Number(height);
}

test('the footer makes a different claim in each language, with its own flag', () => {
  const footer = readFileSync(FOOTER, 'utf8');

  // One entry, whose Finnish side is not a translation of its English key: each is the claim of
  // the reader it is written for.
  assert.match(
    footer,
    /'GDPR and privacy first': 'Kotimaista laatutyötä'/,
    `${FOOTER} no longer says the Finnish thing under the Finnish tagline`,
  );

  // The flag follows the language the page is read in, and the pair is the one intended.
  const map = /const TRUST_FLAG[^=]*=\s*\{([^}]*)\}/.exec(footer)?.[1] ?? '';
  const flags = Object.fromEntries(
    [...map.matchAll(/(\w+):\s*'(\w+)'/g)].map((match) => [match[1], match[2]]),
  );

  assert.deepEqual(
    flags,
    { fi: 'fi', gb: 'eu' },
    `${FOOTER} draws ${JSON.stringify(flags)}: the Finnish pages carry the Finnish flag and the ` +
      'English pages the European one, each beside the claim it belongs to',
  );

  assert.match(
    footer,
    /flag=\{TRUST_FLAG\[lang\]\}/,
    `${FOOTER} no longer gives the badge the flag of the language it is read in`,
  );
});

test('the badge draws a flag the site holds a file for, at the flag its file is drawn in', () => {
  const badge = readFileSync(BADGE, 'utf8');

  for (const file of ['fi.svg', 'eu.svg']) {
    const path = join(FLAGS, file);

    assert.ok(existsSync(path), `${path} is gone, and the mark that names it draws nothing`);
    assert.match(
      badge,
      new RegExp(`url\\('\\.\\./images/flags/${file.replace('.', '\\.')}'\\)`),
      `${BADGE} no longer draws ${file}`,
    );

    // 4:3, the shape of the mark's box, so `contain` fills it rather than letterboxing the flag.
    assert.equal(
      viewBoxRatio(readFileSync(path, 'utf8')),
      4 / 3,
      `${path} is not the 4:3 file the mark's box is drawn for`,
    );
  }

  assert.match(
    badge,
    /aspect-ratio: 4 \/ 3/,
    `${BADGE} draws its flags into a box of no ratio: an empty span has no height of its own, ` +
      'and a mark with no height is a mark nothing shows',
  );
});

test('the badge marks stay out of the flag rule budget the picker owns', () => {
  const classes = styleClasses(readFileSync(BADGE, 'utf8'));

  assert.deepEqual(
    classes,
    ['badge-flag', 'badge-flag-fi', 'badge-flag-eu'],
    `${BADGE} styles something other than the two flags it can draw`,
  );

  for (const name of classes) {
    assert.doesNotMatch(
      `.${name} { background-image: url('flag.svg') }`,
      COUNTRY_FLAG_RULE,
      `.${name} reads as a country flag rule to the e2e case that counts them, which allows two ` +
        'on a page - the pair the picker draws',
    );
  }

  // The floor above has teeth: a rule named the way the picker names its flags is caught by it.
  assert.match('.fi-eu { background-image: url(eu.svg) }', COUNTRY_FLAG_RULE);

  // And the budget is still counted, so a page cannot quietly carry a third flag rule either.
  assert.match(
    readFileSync(SPEC, 'utf8'),
    /country flag rules`[\s\S]{0,40}toBeLessThanOrEqual\(2\)/,
    `${SPEC} no longer counts the country flag rules of a page, which is the budget the names ` +
      'above are chosen for',
  );
});
