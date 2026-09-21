declare namespace App {
  interface Locals {
    /** Current UI language, resolved per request by src/middleware.ts. */
    lang: string;
  }
}

// Font packages ship CSS only and have no type declarations of their own.
declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/space-grotesk';
