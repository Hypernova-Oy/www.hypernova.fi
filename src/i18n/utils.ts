import { type i18n, defaultLang, langConfig } from './ui';

export function useTranslations(i18n: i18n) {
  return function t(key: keyof typeof i18n[typeof defaultLang]) {
    let lang = langConfig.currentLang;
    lang = typeof lang === 'string' ? lang : defaultLang;
    if (lang === 'gb') {
        return key;
    }
    return i18n[lang][key] || i18n[defaultLang][key];
  }
}