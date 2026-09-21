import { FALLBACK_LANG, defaultLang, type i18n } from './ui';

/**
 * Request-scoped translation helper.
 *
 * The language is resolved once per request in `src/middleware.ts` and stored in
 * `Astro.locals`, so concurrent requests in different languages can never leak
 * into each other (module-level state would).
 */
export function useTranslations(i18n: i18n, context: { locals: { lang?: string } }) {
  return function t(key: string) {
    const lang = context.locals?.lang ?? FALLBACK_LANG;

    if (lang === FALLBACK_LANG) {
      return key;
    }

    return i18n[lang]?.[key] || i18n[defaultLang]?.[key] || key;
  };
}