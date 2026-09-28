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
// are here too: it is a bundled script, which `astro check` reads. So are the theme and
// favicon flags - their scripts are files under src/scripts/ and src/layouts/BaseLayout.astro
// rather than `is:inline` blocks, one of them inlined from a file with `?raw`.
interface Window {
  __zenixMobileMenuOutsideBound?: boolean;
  /** The search index of the language it was fetched in (see `__zenixSearchLang`). */
  __zenixSearchIndex?: SearchIndexEntry[];
  __zenixSearchLoaded?: boolean;
  __zenixSearchLang?: string;
  __zenixSearchKeyBound?: boolean;
  /** Published by the palette; the two navbar search buttons call it. */
  toggleCommandPalette?: () => void;
  /** The theme listeners (documented in src/scripts/theme-init.js) are bound once. */
  __zenixThemeBound?: boolean;
  /** The favicon listeners of src/layouts/BaseLayout.astro are bound once. */
  __zenixFaviconBound?: boolean;
}

/*
 * The part of the Trusted Types API this site uses (src/scripts/trusted-types.ts): the
 * factory to create a policy with and the policy itself. Trusted Types is not in TypeScript's
 * DOM library and `@types/trusted-types` is not a dependency, so the three declarations below
 * are the ones to delete if that package is ever added - it declares all of them, and with
 * the post-specification signatures (`createHTML` returns a `TrustedHTML`, not a `string`).
 */
interface TrustedTypePolicy {
  createHTML: (input: string) => string;
  createScript: (input: string) => string;
  createScriptURL: (input: string) => string;
}

interface TrustedTypePolicyOptions {
  createHTML?: (input: string) => string;
  createScript?: (input: string) => string;
  createScriptURL?: (input: string) => string;
}

interface Window {
  /** Only a browser that implements Trusted Types has this. */
  trustedTypes?: {
    createPolicy: (name: string, rules: TrustedTypePolicyOptions) => TrustedTypePolicy;
  };
}

/*
 * A Vite import that hands over a file as a string, without processing it. The one use is the
 * theme script of src/layouts/BaseLayout.astro, which is inlined into the document; the same
 * file is read by astro.config.mjs, which hashes it for the Content Security Policy.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}

