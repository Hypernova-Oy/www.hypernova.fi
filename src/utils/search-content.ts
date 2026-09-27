/**
 * The readable text behind the search index (`src/pages/search-index.json.ts`).
 *
 * The copy of a page is not written down a second time anywhere: the running
 * server renders the page, and the main content of that answer is read back and
 * indexed. The index therefore follows the copy of the site automatically.
 *
 * Only the `<main>` element is used. The head, the navbar and the footer are the
 * same on every page, so indexing them would make every page a match for
 * queries like "contact" or "language".
 *
 * The pages are read when `/search-index.json` is requested. A production build
 * reads every page once per process (`cache: true`); the copy is baked into the
 * server bundle, so a new build needs a restart either way - see
 * `scripts/refresh-search-index.sh`.
 */
import type { Language } from '../i18n/ui';

/** A page that takes longer than this to render is left out of the index. */
const PAGE_TIMEOUT_MS = 10_000;

/** The character references that appear in the rendered pages. */
const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&hellip;': '...',
  '&mdash;': '\u2014',
  '&ndash;': '\u2013',
  '&euro;': '\u20ac',
};

/**
 * Squeezes every run of whitespace into one space, trims the result, and pulls
 * punctuation back onto the word that markup pushed it away from.
 */
const collapse = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:!?])/g, '$1')
    .trim();

const fromCodePoint = (value: number) => {
  try {
    return String.fromCodePoint(value);
  } catch {
    // An out of range character reference is dropped rather than fatal.
    return ' ';
  }
};

/** Turns the character references of an HTML page into plain text. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => fromCodePoint(Number(decimal)))
    .replace(/&[a-z]+;/gi, (entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? ' ');
}

/**
 * The readable text of a rendered page: one line, without markup, scripts,
 * inline styles, inline SVG icons or comments.
 */
export function htmlToPlainText(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const scope = main ? main[1] : html;

  return collapse(
    decodeEntities(
      scope
        .replace(/<(script|style|svg|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]*>/g, ' '),
    ),
  );
}

/**
 * The readable text of an author-written body (blog post, changelog entry).
 * Markdown syntax carries no information for a text search, so it is removed
 * and only the words the reader would see are kept.
 */
export function markdownToPlainText(markdown: string): string {
  return collapse(
    decodeEntities(
      markdown
        // Fenced code blocks carry no prose and would only add noise.
        .replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, ' ')
        .replace(/^[ \t]{0,3}>[ \t]?/gm, ' ')
        .replace(/^[ \t]{0,3}([-*+]|\d{1,9}\.)[ \t]+/gm, ' ')
        .replace(/[*_~]{1,3}/g, '')
        // Raw HTML and MDX components inside a body.
        .replace(/<\/?[a-z][^>]*>/gi, ' '),
    ),
  );
}

export type PageTextOptions = {
  /** Base URL of the running site, for example `http://127.0.0.1:4321`. */
  origin: string;
  /** Page paths to read, for example `/koha/`. */
  slugs: readonly string[];
  /** Language the pages are rendered in. */
  lang: Language;
  /** Read a page once per process instead of once per request. */
  cache?: boolean;
  /** Only used by the tests, which point it at a server of their own. */
  fetchImpl?: typeof globalThis.fetch;
};

/** Page text of the current process, keyed by `<lang>:<slug>`. */
const textCache = new Map<string, string>();

/**
 * Reads the pages and returns the text of those that could be read, keyed by
 * slug. A page that fails (a 404, a timeout, a render error) is left out: its
 * entry keeps its title, description and keywords, so the index stays usable
 * and the failure is reported in the log instead of breaking the palette.
 */
export async function loadPageText({
  origin,
  slugs,
  lang,
  cache = false,
  fetchImpl = fetch,
}: PageTextOptions): Promise<Map<string, string>> {
  const key = (slug: string) => `${lang}:${slug}`;
  const text = new Map<string, string>();

  const pending: string[] = [];
  for (const slug of slugs) {
    const cached = textCache.get(key(slug));
    if (cached === undefined) pending.push(slug);
    else text.set(slug, cached);
  }

  // The pages are independent of each other, so they are read side by side.
  const loaded = await Promise.all(
    pending.map(async (slug) => {
      const url = new URL(slug, origin);
      url.searchParams.set('l', lang);

      try {
        const response = await fetchImpl(url, {
          headers: { Accept: 'text/html' },
          signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return [slug, htmlToPlainText(await response.text())] as const;
      } catch (error) {
        console.warn(`Search index: no text for ${slug} (${lang}):`, error);
        return null;
      }
    }),
  );

  for (const entry of loaded) {
    if (entry === null) continue;
    const [slug, pageText] = entry;
    if (cache) textCache.set(key(slug), pageText);
    text.set(slug, pageText);
  }

  return text;
}
