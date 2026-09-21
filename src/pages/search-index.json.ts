import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { FALLBACK_LANG, isLanguage, type Language } from '../i18n/ui';

type LocalizedText = Record<Language, string>;

type PageEntry = {
  /** Path the palette links to, relative to the site root. */
  slug: string;
  /** Badge label shown in the result list. */
  type: string;
  title: LocalizedText;
  description: LocalizedText;
  /** Extra search terms that are not part of the visible title/description. */
  keywords: string;
};

/**
 * Index every page a visitor can actually reach. Titles and descriptions are
 * shown in the visitor's language, while `keywords` always contains both
 * languages so a search matches in either one.
 */
const PAGES: PageEntry[] = [
  {
    slug: '/',
    type: 'Page',
    title: {
      gb: 'Home - Free and Open Source software services',
      fi: 'Etusivu - vapaan ja avoimen lähdekoodin palvelut',
    },
    description: {
      gb: 'What we host, support and develop for libraries - and why we build on open source.',
      fi: 'Mitä ylläpidämme, tuemme ja kehitämme kirjastoille - ja miksi rakennamme avoimelle lähdekoodille.',
    },
    keywords: 'hypernova foss avoin lähdekoodi open source kirjasto library yleisesittely',
  },
  {
    slug: '/services/',
    type: 'Page',
    title: { gb: 'Our services', fi: 'Palvelumme' },
    description: {
      gb: 'Koha hosting, Lainuri and Toveri - what we deliver and to whom.',
      fi: 'Koha-pilvipalvelu, Lainuri ja Toveri - mitä toimitamme ja kenelle.',
    },
    keywords: 'services palvelut tarjonta kokonaisuus hinnasto quote tarjous',
  },
  {
    slug: '/koha/',
    type: 'Page',
    title: { gb: 'Koha library system', fi: 'Koha-kirjastojärjestelmä' },
    description: {
      gb: 'The Open Source library system for acquisitions, circulation and catalogue.',
      fi: 'Avoimen lähdekoodin kirjastojärjestelmä hankintaan, lainaukseen ja luettelointiin.',
    },
    keywords:
      'koha kirjasto kirjastojärjestelmä library system lainaus circulation luettelointi catalogue marc hankinta acquisitions omatoimi',
  },
  {
    slug: '/koha-hosting/',
    type: 'Page',
    title: { gb: 'Koha cloud hosting', fi: 'Kohan pilvipalvelu' },
    description: {
      gb: 'We host, update and monitor your Koha library system on our own servers in Finland.',
      fi: 'Ylläpidämme, päivitämme ja valvomme Koha-kirjastojärjestelmääsi omilla palvelimillamme Suomessa.',
    },
    keywords:
      'pilvipalvelu hosting cloud palvelin server ylläpito maintenance varmuuskopio backup päivitys update suomi finland tuki support sla',
  },
  {
    slug: '/lainuri-checkout-machine/',
    type: 'Page',
    title: { gb: 'Lainuri checkout machine', fi: 'Lainuri-lainausautomaatti' },
    description: {
      gb: 'Self-service checkout machine with an integrated receipt printer.',
      fi: 'Itsepalvelulainausautomaatti ja integroitu kuittitulostin.',
    },
    keywords:
      'lainuri lainausautomaatti checkout machine self service itsepalvelu rfid kuitti receipt tulostin printer',
  },
  {
    slug: '/toveri-access-control-device/',
    type: 'Page',
    title: { gb: 'Toveri access control device', fi: 'Toveri-kulunvalvontalaite' },
    description: {
      gb: 'Access control for self-service libraries, with Koha patron authentication.',
      fi: 'Kulunvalvonta itsepalvelukirjastoihin ja tunnistautuminen Koha-kirjaston asiakastiedoilla.',
    },
    keywords:
      'toveri kulunvalvonta access control ovi door lukko lock itsepalvelukirjasto self service library tunnistautuminen',
  },
  {
    slug: '/contact/',
    type: 'Page',
    title: { gb: 'Contact us', fi: 'Yhteystiedot' },
    description: {
      gb: 'Contact details, quote requests and billing information.',
      fi: 'Yhteystiedot, tarjouspyynnöt ja laskutustiedot.',
    },
    keywords: 'yhteys contact yhteystiedot email sähköposti puhelin phone osoite address laskutus billing',
  },
  {
    slug: '/privacy/',
    type: 'Page',
    title: { gb: 'Privacy Policy', fi: 'Tietosuojaseloste' },
    description: {
      gb: 'How we process personal data, and your rights under the GDPR.',
      fi: 'Miten käsittelemme henkilötietoja ja mitkä ovat oikeutesi tietosuoja-asetuksen mukaan.',
    },
    keywords: 'tietosuoja gdpr privacy henkilötiedot personal data evästeet cookies rekisteri',
  },
  {
    slug: '/terms/',
    type: 'Page',
    title: { gb: 'Terms of Service', fi: 'Palveluehdot' },
    description: {
      gb: 'The terms that apply to using this website.',
      fi: 'Verkkosivuston käyttöä koskevat ehdot.',
    },
    keywords: 'ehdot terms käyttöehdot sopimusehdot tekijänoikeus copyright vastuu liability',
  },
];

const localized = (value: LocalizedText, lang: Language) => value[lang] ?? value[FALLBACK_LANG];

const toIndexEntry = (page: PageEntry, lang: Language) => ({
  title: localized(page.title, lang),
  description: localized(page.description, lang),
  keywords: [
    page.title.gb,
    page.title.fi,
    page.description.gb,
    page.description.fi,
    page.keywords,
  ].join(' '),
  slug: page.slug,
  type: page.type,
});

export const GET: APIRoute = async ({ locals }) => {
  const lang: Language = isLanguage(locals.lang) ? locals.lang : FALLBACK_LANG;

  const posts = await getCollection('blog', ({ data }) => data.draft !== true);
  const changelog = await getCollection('changelog', ({ data }) => data.draft !== true);

  const index = [
    ...PAGES.map((page) => toIndexEntry(page, lang)),
    // Only advertise the index pages once they actually have entries.
    ...(posts.length > 0
      ? [
          toIndexEntry(
            {
              slug: '/blog/',
              type: 'Blog',
              title: { gb: 'Blog', fi: 'Blogi' },
              description: {
                gb: 'Articles about Free and Open Source software.',
                fi: 'Artikkeleita vapaasta ja avoimesta lähdekoodista.',
              },
              keywords: 'blog blogi artikkelit articles kirjoitukset',
            },
            lang
          ),
        ]
      : []),
    ...posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      keywords: [post.data.title, post.data.description, ...post.data.tags].join(' '),
      slug: `/blog/${post.id}/`,
      type: 'Blog Post',
    })),
    ...(changelog.length > 0
      ? [
          toIndexEntry(
            {
              slug: '/changelog/',
              type: 'Changelog',
              title: { gb: 'Changelog', fi: 'Muutosloki' },
              description: {
                gb: 'Product updates and release notes.',
                fi: 'Palveluiden päivitykset ja julkaisutiedotteet.',
              },
              keywords: 'muutosloki changelog release notes päivitykset updates versio',
            },
            lang
          ),
        ]
      : []),
    ...changelog.map((entry) => ({
      title: `${entry.data.version}: ${entry.data.title}`,
      description:
        lang === 'fi' ? 'Palveluiden päivitys ja julkaisutiedote.' : 'Product update and release note.',
      keywords: [entry.data.version, entry.data.title, entry.data.type].join(' '),
      slug: '/changelog/',
      type: 'Changelog',
    })),
  ];

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // The payload depends on the language cookie, so it must never be shared
      // between visitors by a proxy cache.
      'Cache-Control': 'private, no-cache',
      Vary: 'Cookie',
    },
  });
};

