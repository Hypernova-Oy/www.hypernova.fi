/**
 * Unit tests for the trust badge in the footer - the Finnish flag-marked label under the site's
 * tagline - and for the flag file it draws.
 *
 * It is the one place where the two languages do not say the same thing in two languages: a
 * Finnish reader reads that the work is Finnish (`Kotimaista laatutyötä`) and a reader of the
 * English pages that the quality is Nordic and privacy comes first. The flag is not the
 * language's, though: both wear Finland's (`flag="fi"` in Footer.astro), the country of origin of
 * the company the claim is about. The first test holds that pair; the second holds the file
 * behind the mark and the ratio it is drawn at, because a mark with no file behind it draws
 * nothing, and one drawn into a box of another shape than the flag letterboxes it.
 *
 * The third holds the budget the mark stays inside. The e2e case *the language picker draws its
 * own flag* counts the rules on a page that read as a country flag and allows two - the pair the
 * picker draws (LanguagePicker.astro) - so a badge whose mark were named the way the picker names
 * its flags (`fi-fi`, say) would fail a page check over about a kilobyte of SVG. That is why it is
 * `badge-flag-fi`, and this is what keeps it that way.
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

test('the footer makes a different claim in each language, under the one flag', () => {
  const footer = readFileSync(FOOTER, 'utf8');

  // One entry, whose Finnish side is not a translation of its English key: each is the claim of
  // the reader it is written for.
  assert.match(
    footer,
    /'Nordic quality\. Privacy first\.': 'Kotimaista laatutyötä'/,
    `${FOOTER} no longer says the Finnish thing under the Finnish tagline`,
  );

  // One flag for both languages, and it is Finland's: the mark is the country of origin of the
  // company, not a label of the language the page is read in.
  assert.match(
    footer,
    /flag="fi"/,
    `${FOOTER} no longer gives the badge the Finnish flag`,
  );

  // The claim the badge used to make in English is gone, and with it the mark it wore.
  assert.doesNotMatch(
    footer,
    /GDPR|European Union/,
    `${FOOTER} still carries the GDPR claim the badge dropped`,
  );
});

test('the badge draws a flag the site holds a file for, at the flag its file is drawn in', () => {
  const badge = readFileSync(BADGE, 'utf8');
  const path = join(FLAGS, 'fi.svg');

  assert.ok(existsSync(path), `${path} is gone, and the mark that names it draws nothing`);
  assert.match(
    badge,
    /url\('\.\.\/images\/flags\/fi\.svg'\)/,
    `${BADGE} no longer draws fi.svg`,
  );

  // 4:3, the shape of the mark's box, so `contain` fills it rather than letterboxing the flag.
  assert.equal(
    viewBoxRatio(readFileSync(path, 'utf8')),
    4 / 3,
    `${path} is not the 4:3 file the mark's box is drawn for`,
  );

  // The European flag the badge used to wear is out of the repository and out of the stylesheet,
  // so nothing draws it back by naming a file that is no longer there.
  assert.ok(
    !existsSync(join(FLAGS, 'eu.svg')),
    `${join(FLAGS, 'eu.svg')} is back, and no rule draws it`,
  );
  assert.doesNotMatch(
    badge,
    /badge-flag-eu|eu\.svg/,
    `${BADGE} still names the European flag, which no file draws any more`,
  );

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
    ['badge-flag', 'badge-flag-fi'],
    `${BADGE} styles something other than the one flag it can draw`,
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
