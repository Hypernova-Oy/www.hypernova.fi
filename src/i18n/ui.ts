export const languages = {
    en: 'English',
    fi: 'Suomi',
  };
  
/**
 * Language whose dictionary lives in the `i18n` objects of each page/component.
 * All other languages fall back to the English key itself.
 */
export const defaultLang = 'fi';

/** Language used when the visitor has not chosen one. */
export const FALLBACK_LANG = 'en';

export type Language = keyof typeof languages;

export type i18n = Record<string, Record<string, string>>;

export function isLanguage(value: unknown): value is Language {
    return typeof value === 'string' && value in languages;
}

/**
 * The name the previous site gave English, in the URLs it handed out, in its search entries and in
 * the `language` cookie it left in its visitors' browsers: `gb`, a country code rather than a
 * language one. That is why this site does not carry it over into `languages`: what it writes is
 * `en`, a code that is also the language tag the document needs for a screen reader to pick a
 * voice with, and for the browser to hyphenate and spell-check with.
 *
 * The old name is still answered, and answered as English, wherever a language arrives from
 * outside - a `?l=` value in a link that is years old, or a cookie a returning visitor's browser
 * has held since then - and nothing writes it: src/middleware.ts resolves the request and stores
 * the code it resolved, so the cookie is rewritten with `en` the first time such a visitor is back.
 */
const LEGACY_LANG: Record<string, Language | undefined> = {
    gb: 'en',
};

/** The language a `?l=` value or a stored cookie names, `undefined` when it names none of ours. */
export function resolveLanguage(value: unknown): Language | undefined {
    if (typeof value !== 'string') return undefined;

    return isLanguage(value) ? value : LEGACY_LANG[value];
}