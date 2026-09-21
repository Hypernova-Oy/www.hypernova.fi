import type { Language } from '../i18n/ui';

/** A text that exists in every supported UI language (see src/i18n/ui.ts). */
export type Localized = Record<Language, string>;

/** A list of texts in every supported UI language. */
export type LocalizedList = Record<Language, string[]>;

export type LegalBlock =
  | { kind: 'p'; text: Localized }
  | { kind: 'ul'; items: LocalizedList }
  | { kind: 'address'; lines: LocalizedList }
  | { kind: 'table'; columns: LocalizedList; rows: LocalizedList[] };

export type LegalSection = {
  heading: Localized;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  title: Localized;
  description: Localized;
  /** ISO date of the latest revision, shown to the reader. */
  updated: string;
  version: string;
  sections: LegalSection[];
};
