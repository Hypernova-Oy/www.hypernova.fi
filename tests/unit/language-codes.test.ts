/**
 * Unit tests for the language codes of the site - `en` and `fi`, the codes its `?l=` parameter, its
 * `language` cookie and every bilingual document are keyed by - and for the one name it no longer
 * writes: `gb`, the country code the previous site gave English.
 *
 * A code is not a private detail of the dictionaries. It is the class the picker's flag rules are
 * built from (`fi-<lang>`), so a language whose code has no rule draws an empty box beside its
 * label; it is the `?l=` of the links the picker writes, so a code the middleware does not know
 * silently leaves the visitor on the language their cookie holds; and it is the `lang` attribute of
 * the document, where a code that is not a language tag costs a screen reader its voice. The first
 * two tests hold the codes and the one input name that is still read - the links the previous site
 * handed out, its search entries and the cookies of its returning visitors all carry `gb` - and the
 * last two hold every code the picker offers to a flag rule and a file, and every code to the
 * crawlers that read the head: the `hreflang` of the page and the `og:locale` it is shared under.
 *
 * They run with Node's own test runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { FALLBACK_LANG, isLanguage, languages, resolveLanguage } from '../../src/i18n/ui.ts';

const BASE_LAYOUT = 'src/layouts/BaseLayout.astro';
const PICKER = 'src/components/LanguagePicker.astro';
const MIDDLEWARE = 'src/middleware.ts';
const PRIVACY_POLICY = 'src/legal/privacy-policy.ts';
const FLAGS = 'src/images/flags';

test('the site is read in two languages, and each code is the tag of its document', () => {
  assert.deepEqual(
    Object.keys(languages),
    ['en', 'fi'],
    'the languages the site is read in changed: these are the codes of its `?l=` links, its cookie ' +
      'and the keys of every bilingual document',
  );

  assert.equal(
    FALLBACK_LANG,
    'en',
    'a visitor who has chosen nothing and names nothing reads the English pages',
  );
  assert.ok(isLanguage(FALLBACK_LANG), 'the fallback is not one of the codes the site carries');

  // The code of a page is also the language the document is declared in, because nothing else can
  // tell a screen reader which voice to pick.
  assert.match(
    readFileSync(BASE_LAYOUT, 'utf8'),
    /const documentLang = resolveLanguage\(Astro\.locals\.lang\) \?\? FALLBACK_LANG/,
    `${BASE_LAYOUT} no longer gives the document the language resolved for the request`,
  );

  // The published document that names them, because it tells the visitor what its cookie holds.
  assert.match(
    readFileSync(PRIVACY_POLICY, 'utf8'),
    /'fi or en'/,
    `${PRIVACY_POLICY} no longer names the codes the \`language\` cookie is written with`,
  );
});

test("the previous site's name for English is still read, and never written", () => {
  assert.equal(resolveLanguage('en'), 'en');
  assert.equal(resolveLanguage('fi'), 'fi');

  assert.equal(
    resolveLanguage('gb'),
    'en',
    'the code the previous site wrote for English in its URLs, its search entries and its cookie ' +
      'is no longer read: those links would answer in whatever language the visitor last chose',
  );
  assert.equal(isLanguage('gb'), false, '`gb` is an input this site answers, not a code it carries');

  for (const value of ['xx', 'EN', 'en-US', '', ' ', null, undefined, 42, {}]) {
    assert.equal(
      resolveLanguage(value),
      undefined,
      `${JSON.stringify(value)} names a language of the site, and only the two codes do`,
    );
  }

  // Resolution happens in one place, on both inputs, and what is stored is what it resolved: a
  // literal code here is how a second, stale name for a language gets written into a browser.
  const middleware = readFileSync(MIDDLEWARE, 'utf8');

  assert.match(
    middleware,
    /\[requested, stored\]\.map\(resolveLanguage\)/,
    `${MIDDLEWARE} no longer resolves the requested and the stored language through resolveLanguage()`,
  );
  assert.match(
    middleware,
    /cookies\.set\(LANGUAGE_COOKIE, lang/,
    `${MIDDLEWARE} no longer stores the code it resolved, so an old cookie is never rewritten`,
  );
  assert.doesNotMatch(
    middleware,
    /'(en|fi|gb)'/,
    `${MIDDLEWARE} names a language code of its own instead of resolving one`,
  );
});

test('the picker draws its marks from the codes it links to', () => {
  const picker = readFileSync(PICKER, 'utf8');

  // The class of a mark is the code of the language it stands beside...
  assert.match(
    picker,
    /class=\{`fi fi-\$\{lang\}`\}/,
    `${PICKER} no longer builds the class of a mark from the language code it links to`,
  );

  // ...so every code needs a rule, and every rule a file that is really there.
  for (const lang of Object.keys(languages)) {
    const rule = new RegExp(
      `\\.fi-${lang}\\s*\\{[^}]*url\\('\\.\\./images/flags/([\\w-]+\\.svg)'\\)`,
    ).exec(picker);

    assert.ok(rule, `${PICKER} has no flag rule for \`${lang}\`: that mark draws nothing`);
    assert.ok(
      existsSync(join(FLAGS, rule[1])),
      `${join(FLAGS, rule[1])} is gone, and the rule that names it draws nothing`,
    );
  }

  // And the rules are those two: a leftover one is a rule the e2e case that counts country flags
  // on a page spends out of the budget it allows the picker.
  assert.deepEqual(
    [...picker.matchAll(/^\s*\.([\w-]+)\s*\{/gm)].map((match) => match[1]),
    ['fi', 'fi-en', 'fi-fi'],
    `${PICKER} styles something other than the box and the two flags it can draw`,
  );
});

test('every language is announced to a crawler under the code it is served as', () => {
  const layout = readFileSync(BASE_LAYOUT, 'utf8');

  // The alternates, and the canonical each language version declares as its own, are built from
  // the languages the site carries: a third language of src/i18n/ui.ts is announced by adding it
  // there and nowhere else.
  assert.match(
    layout,
    /Object\.keys\(languages\)\.map\(\(lang\) => \(\{ hreflang: lang, href: languageURL\(lang as Language\) \}\)/,
    `${BASE_LAYOUT} no longer builds its hreflang alternates from the languages the site carries`,
  );

  assert.match(
    layout,
    /\{ hreflang: 'x-default', href: languageURL\(FALLBACK_LANG\) \}/,
    `${BASE_LAYOUT} declares no x-default alternate: a crawler whose visitor reads neither of the ` +
      'two languages is then left without a version of the page',
  );

  // `og:locale` is not a language tag but a language *and* a territory - `en_GB`, `fi_FI` - because
  // that is the format a crawler matches a visitor against. Its language half is the code the page
  // is served under, or the page claims a language it is not written in.
  for (const lang of Object.keys(languages)) {
    const locale = new RegExp(`\\b${lang}: '([a-z]{2})_[A-Z]{2}'`).exec(layout);

    assert.ok(
      locale,
      `${BASE_LAYOUT} gives \`${lang}\` no og locale: a language has to be stated with a territory, ` +
        'and a page that states neither is shared as the language of nothing',
    );
    assert.equal(locale[1], lang, `the og locale of \`${lang}\` names another language`);
  }
});
