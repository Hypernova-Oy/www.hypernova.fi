import { uint32 } from "astro:schema";

export const languages = {
    gb: 'English',
    fi: 'Suomi',
  };
  
export const defaultLang = 'fi';
export const langConfig = {
    currentLang: defaultLang
}

export type i18n = {
    fi: object
};