declare namespace App {
  interface Locals {
    /** Current UI language, resolved per request by src/middleware.ts. */
    lang: string;
  }
}

/** One entry of `/search-index.json`, as the command palette reads it. */
interface SearchIndexEntry {
  title: string;
  description: string;
  keywords: string;
  content: string;
  slug: string;
  type: string;
}

// Set once per document by the navbar, so the one `document` click listener that closes
// the mobile menu is not bound again by every `astro:page-load`. The palette's own flags
// are here too: it is a bundled script, which `astro check` reads. The remaining `__zenix*`
// flags live in `is:inline` scripts, which it does not.
interface Window {
  __zenixMobileMenuOutsideBound?: boolean;
  /** The search index of the language it was fetched in (see `__zenixSearchLang`). */
  __zenixSearchIndex?: SearchIndexEntry[];
  __zenixSearchLoaded?: boolean;
  __zenixSearchLang?: string;
  __zenixSearchKeyBound?: boolean;
  /** Published by the palette; the two navbar search buttons call it. */
  toggleCommandPalette?: () => void;
}
