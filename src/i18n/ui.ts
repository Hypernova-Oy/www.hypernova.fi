export const languages = {
    gb: 'English',
    fi: 'Suomi',
  };
  
/**
 * Language whose dictionary lives in the `i18n` objects of each page/component.
 * All other languages fall back to the English key itself.
 */
export const defaultLang = 'fi';

/** Language used when the visitor has not chosen one. */
export const FALLBACK_LANG = 'gb';

export type Language = keyof typeof languages;

export type i18n = Record<string, Record<string, string>>;

export function isLanguage(value: unknown): value is Language {
    return typeof value === 'string' && value in languages;
}