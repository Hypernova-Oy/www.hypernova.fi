/**
 * Unit tests for the closed search trigger in the navigation bar - the filled chip that opens
 * the palette - and for the accelerator that is no longer written on it.
 *
 * The chip carried a `Ctrl K` badge that a script rewrote to `⌘K` on Apple hardware. It repeated
 * what the palette's own empty state says a click later, and it was a second place to keep in
 * step with what the accelerator actually is, so it is gone; the accelerator itself is untouched
 * (`CommandPalette.astro` still opens on `metaKey || ctrlKey` and `k`). The first test holds the
 * badge's absence - on the buttons *and* across `src/`, because a selector left behind in a file
 * reads as "there is still a badge here" to whoever opens that file next.
 *
 * The chip is also the only control in the bar whose label sits on a fill of its own, and the
 * greys it used - `zinc-500` on `zinc-100`, 4.39:1, and in dark mode 5.35:1 - were close enough
 * that a closed search box read as disabled next to the nav links beside it. One step further
 * apart (8.2:1 and 8.0:1) leaves the label plainly the foreground and the fill plainly a surface
 * above the bar. The second test measures the pair the markup names, so a later restyle back into
 * the old greys fails here instead of on a page.
 *
 * They run with Node's own test runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const NAVBAR = 'src/components/Navbar.astro';

/** The two search buttons whole, content included: a badge would live inside them. */
function triggers(source: string): string[] {
  return [...source.matchAll(/<button\b[^>]*data-search-trigger[^>]*>[\s\S]*?<\/button>/g)].map(
    (match) => match[0],
  );
}

/** Every file of the tree that is source, so a script is read as well as the components. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(astro|js|mjs|ts)$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? dir, entry.name));
}

/*
 * What the browser rasterises each colour token to, so the pair can be measured without one.
 * `zinc-*` are Tailwind v4's own oklch declarations, the two `night-*` values are the tokens
 * global.css sets - and `zinc-100`, `zinc-500`, `night-raise` and `zinc-400` are kept because
 * they are the pair the chip used to carry, which the floors below have to reject.
 */
const TOKENS: Record<string, string> = {
  'zinc-200': '#e4e4e7',
  'zinc-300': '#d4d4d8',
  'zinc-700': '#3f3f47',
  'night-line': '#333842',
  'night-line-strong': '#47505d',
  'zinc-100': '#f4f4f5',
  'zinc-500': '#71717b',
  'zinc-400': '#9f9fa9',
  'night-raise': '#272c34',
};

/** The fill the chip sits on: the `header` of Navbar.astro, one colour per theme. */
const BAR: Record<'light' | 'dark', string> = { light: '#ffffff', dark: '#1f232a' };

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** WCAG relative luminance, and the contrast ratio built from it (WCAG 2.2, definitions). */
function luminance(hex: string): number {
  return channels(hex)
    .map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * channel, 0);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The colour a `bg-`/`text-` class names, in the theme that class is written for. */
function token(classes: string[], theme: 'light' | 'dark', kind: 'bg' | 'text'): string {
  const prefix = theme === 'dark' ? `dark:${kind}-` : `${kind}-`;

  // `text-sm` and the hover pair are not this: only a class the table knows is a colour here.
  const name = classes
    .filter((entry) => entry.startsWith(prefix) && !entry.includes('hover:'))
    .map((entry) => entry.slice(prefix.length))
    .find((candidate) => TOKENS[candidate] !== undefined);

  assert.ok(name, `${NAVBAR} names no ${prefix} colour this test knows, on the trigger`);
  return TOKENS[name];
}

/** The class list of the labelled trigger - the one the contrast pair is read from. */
function chipClasses(): string[] {
  const chip = triggers(readFileSync(NAVBAR, 'utf8')).find((button) =>
    button.includes('flex items-center gap-2'),
  );

  assert.ok(chip, `${NAVBAR} has no labelled search button any more`);
  const listed = chip.match(/class="([^"]*)"/);
  assert.ok(listed, `${NAVBAR} writes no class list on the labelled search button`);
  return listed[1].split(/\s+/);
}

/**
 * The widths the chip names, in rem and with the breakpoint each is written under, so it can be
 * read as the floor it is: Tailwind's spacing scale is a quarter of a rem a step, and `min-w-44`
 * under `xl:` is 11rem from 1280px up.
 */
function widths(classes: string[]): { at: string; rem: number }[] {
  return classes
    .map((entry) => entry.match(/^(?:([a-z0-9]+):)?(?:min-)?w-(\d+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ at: match[1] ?? '(all widths)', rem: Number(match[2]) / 4 }));
}

test('the closed search trigger carries no accelerator badge', () => {
  const buttons = triggers(readFileSync(NAVBAR, 'utf8'));

  // One for the wide layout and one for the narrow one, the same way the bar has two of them.
  assert.equal(buttons.length, 2, `${NAVBAR} no longer carries the two search buttons`);

  for (const button of buttons) {
    assert.doesNotMatch(
      button,
      /<kbd\b|data-search-shortcut/,
      `${NAVBAR} writes the accelerator on a search button again - the palette's empty state ` +
        `already names it, and the platform-aware hint was a second place to keep in step: ${button}`,
    );
  }

  // And nothing reads the selector the hint used, which went with it.
  const readers = sourceFiles('src').filter((path) =>
    readFileSync(path, 'utf8').includes('data-search-shortcut'),
  );

  assert.deepEqual(
    readers,
    [],
    'a file still looks for the accelerator badge that was removed, which reads as if the badge ' +
      `were still on the page:\n${readers.join('\n')}`,
  );
});

test('the closed search trigger reads on its own fill in both themes', () => {
  const classes = chipClasses();

  for (const theme of ['light', 'dark'] as const) {
    const fill = token(classes, theme, 'bg');
    const label = contrast(token(classes, theme, 'text'), fill);

    /*
     * 7:1, not the 4.5:1 floor of the source: this label is the name of a control, and the pair
     * it replaced failed the lower bar in light mode and only just cleared it in dark mode.
     */
    assert.ok(
      label >= 7,
      `${theme}: the closed trigger's label reads ${label.toFixed(2)}:1 on its own fill, under ` +
        `the 7:1 held here (zinc-500 on zinc-100 was 4.39:1, zinc-400 on night-raise 5.35:1)`,
    );

    // The fill has to be a surface above the bar as well, or the closed control is only text.
    const surface = contrast(fill, BAR[theme]);

    assert.ok(
      surface >= 1.2,
      `${theme}: the closed trigger's fill sits ${surface.toFixed(2)}:1 above the bar it is on, ` +
        `close enough to the bar to stop reading as a box (zinc-100 on white was 1.10:1, ` +
        `night-raise on night-card 1.12:1)`,
    );
  }

  // The floors above have teeth: the pair the chip used to carry breaks them both.
  assert.ok(
    contrast(TOKENS['zinc-500'], TOKENS['zinc-100']) < 4.5,
    'the pair held up as the washed one is no longer the pair that fails',
  );
  assert.ok(
    contrast(TOKENS['zinc-400'], TOKENS['night-raise']) < 7,
    'the dark pair held up as the washed one is no longer the pair that fails',
  );
});

test('the closed search trigger is a box, not a label, where the bar has room for one', () => {
  const floors = widths(chipClasses());

  /*
   * One, and written under a breakpoint: the row has spare width at xl and not before it (227px
   * free with the longest labels at 1280, 91px at 1024, none at 768), so a width that applies to
   * every layout is a width the tight ones are squeezed by.
   */
  assert.equal(
    floors.length,
    1,
    `${NAVBAR} names ${floors.length} widths on the search trigger, where it is content-sized ` +
      'until the one breakpoint the row has room at',
  );

  const floor = floors[0];
  assert.ok(floor, `${NAVBAR} names no width on the search trigger`);
  assert.equal(
    floor.at,
    'xl',
    `the search trigger's width is written at ${floor.at}, and the layouts below xl are where ` +
      'the links run out of room first',
  );

  // A floor of 10rem, rather than the 11rem it is: this reads the box as a box, not a size.
  assert.ok(
    floor.rem >= 10,
    `the closed trigger keeps only ${floor.rem}rem at ${floor.at}, which is its label with the ` +
      'padding it already had rather than a search box',
  );
});
