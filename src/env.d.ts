declare namespace App {
  interface Locals {
    /** Current UI language, resolved per request by src/middleware.ts. */
    lang: string;
  }
}

// Font packages ship CSS only and have no type declarations of their own.
declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/space-grotesk';

// Set once per document by the navbar, so the one `document` click listener that closes
// the mobile menu is not bound again by every `astro:page-load`. The other `__zenix*`
// flags live in `is:inline` scripts, which `astro check` does not read.
interface Window {
  __zenixMobileMenuOutsideBound?: boolean;
}
