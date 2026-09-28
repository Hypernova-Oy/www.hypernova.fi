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

/**
 * The `lang` attribute of the document, per UI language. The codes this site carries in its
 * URLs, its `?l=` parameter and its cookie are labels of its own - `gb` is not an ISO 639-1
 * code, and the previous site's URLs (and their search entries) are built on it - while `lang`
 * has to be a real language tag: it is the language a screen reader picks a voice with and the
 * one the browser hyphenates and spell-checks with.
 */
export const HTML_LANG: Record<Language, string> = {
    gb: 'en',
    fi: 'fi',
};

/** The `lang` attribute for a resolved request language, English when it is not one of ours. */
export function htmlLang(value: unknown): string {
    return HTML_LANG[isLanguage(value) ? value : FALLBACK_LANG];
}