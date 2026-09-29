import type { LegalDocument } from './types';

/**
 * Terms for browsing and using the hypernova.fi website only.
 *
 * Service-specific terms (Koha cloud hosting, Toveri, Lainuri, consulting) are
 * maintained in the separate agreement, order confirmation and service description
 * for each service - do not extend these website terms into service terms.
 *
 * Both language versions are published from this file - keep them in sync.
 */
export const termsOfService: LegalDocument = {
  title: {
    en: 'Terms of Service',
    fi: 'Palveluehdot',
  },
  description: {
    en: 'Terms for browsing and using the hypernova.fi website.',
    fi: 'Verkkosivuston hypernova.fi selaamista ja käyttöä koskevat ehdot.',
  },
  updated: '2026-09-21',
  version: '3.0',
  sections: [
    {
      heading: { en: '1. Scope', fi: '1. Soveltamisala' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'These terms apply to browsing and using the website hypernova.fi and they cover the website only. The terms of our services - for example Koha cloud hosting, Toveri access control devices and Lainuri checkout machines - are set out in the separate agreement, order confirmation and service description for each service. If a service-specific term conflicts with these terms, the service-specific term prevails for that service.',
            fi: 'Nämä ehdot koskevat verkkosivuston hypernova.fi selaamista ja käyttöä, ja ne koskevat vain verkkosivustoa. Palveluidemme - esimerkiksi Kohan pilvipalvelun, Toveri-kulunvalvontalaitteiden ja Lainuri-lainausautomaattien - ehdot esitetään kunkin palvelun erillisessä sopimuksessa, tilausvahvistuksessa ja palvelukuvauksessa. Jos palvelukohtainen ehto on ristiriidassa näiden ehtojen kanssa, palvelukohtainen ehto on ensisijainen kyseisen palvelun osalta.',
          },
        },
        {
          kind: 'address',
          lines: {
            en: [
              'Hypernova Oy',
              'Business ID: 2925676-3',
              'PL 16, 80101 Joensuu',
              'Finland',
              'Contact form: www.hypernova.fi/contact/',
            ],
            fi: [
              'Hypernova Oy',
              'Y-tunnus: 2925676-3',
              'PL 16, 80101 Joensuu',
              'Suomi',
              'Yhteydenottolomake: www.hypernova.fi/contact/',
            ],
          },
        },
        {
          kind: 'p',
          text: {
            en: 'By using the website you accept these terms. If you do not accept them, please do not use the website.',
            fi: 'Käyttämällä verkkosivustoa hyväksyt nämä ehdot. Jos et hyväksy niitä, älä käytä verkkosivustoa.',
          },
        },
      ],
    },
    {
      heading: { en: '2. Website content', fi: '2. Verkkosivuston sisältö' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'The content of this website is general information about us and our services. It is not a binding offer, an order confirmation or professional advice, and it should not be relied on as the sole basis for a decision. Prices, availability and technical details may change without notice.',
            fi: 'Verkkosivuston sisältö on yleistä tietoa meistä ja palveluistamme. Se ei ole sitova tarjous, tilausvahvistus eikä ammatillinen neuvo, eikä sen varaan tule tehdä päätöksiä yksinomaan sen perusteella. Hinnat, saatavuus ja tekniset tiedot voivat muuttua ilman erillistä ilmoitusta.',
          },
        },
      ],
    },
    {
      heading: { en: '3. Acceptable use', fi: '3. Sallittu käyttö' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'You may use the website for its intended purpose. You must not:',
            fi: 'Voit käyttää verkkosivustoa sen käyttötarkoituksen mukaisesti. Et saa:',
          },
        },
        {
          kind: 'ul',
          items: {
            en: [
              'attempt to gain unauthorised access to the website or to the systems behind it;',
              'distribute malware or other harmful material through the website;',
              'send automated requests that overload the service, or copy content at scale (scraping);',
              'use the website unlawfully or in a way that harms us or other users;',
              'interfere with the security, integrity or availability of the website.',
            ],
            fi: [
              'yrittää saada luvattoman pääsyn verkkosivustolle tai sen taustalla oleviin järjestelmiin;',
              'levittää haittaohjelmia tai muuta vahingollista aineistoa verkkosivuston kautta;',
              'lähettää automatisoituja pyyntöjä, jotka kuormittavat palvelua, tai kopioida sisältöä laajassa mitassa (skreippaus);',
              'käyttää verkkosivustoa lainvastaisesti tai tavalla, joka aiheuttaa haittaa meille tai muille käyttäjille;',
              'vaarantaa verkkosivuston tietoturvaa, eheyttä tai saatavuutta.',
            ],
          },
        },
        {
          kind: 'p',
          text: {
            en: 'If we have reason to believe that the website is used contrary to these terms, we may restrict or block access to it.',
            fi: 'Jos meillä on perusteltu syy epäillä, että verkkosivustoa käytetään näiden ehtojen vastaisesti, voimme rajoittaa tai estää pääsyn sivustolle.',
          },
        },
      ],
    },
    {
      heading: { en: '4. Availability of the website', fi: '4. Verkkosivuston saatavuus' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'The website is provided as is. We aim for good availability, but we do not guarantee uninterrupted, timely or error-free operation. We may change, add to, suspend or remove content and take the website offline for maintenance or updates without prior notice.',
            fi: 'Verkkosivusto tarjotaan sellaisenaan. Pyrimme hyvään saatavuuteen, mutta emme takaa keskeytyksetöntä, viivytyksetöntä tai virheetöntä toimintaa. Voimme muuttaa, lisätä, keskeyttää tai poistaa sisältöä sekä ottaa verkkosivuston pois käytöstä huoltoa tai päivityksiä varten ilman ennakkoilmoitusta.',
          },
        },
      ],
    },
    {
      heading: { en: '5. Intellectual property', fi: '5. Immateriaalioikeudet' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'The content of this website - texts, images, structure and the Hypernova name and logo - belongs to Hypernova Oy or its licensors, unless otherwise stated.',
            fi: 'Verkkosivuston sisältö - tekstit, kuvat, rakenne sekä Hypernova-nimi ja -logo - kuuluu Hypernova Oy:lle tai sen lisenssinantajille, ellei toisin mainita.',
          },
        },
        {
          kind: 'p',
          text: {
            en: 'You may browse the website, link to it and quote it with attribution. Any other use, such as copying content onto another website, commercial reuse, or using our name or logo, requires our prior written permission.',
            fi: 'Voit selata verkkosivustoa, linkittää siihen ja lainata sitä lähde mainiten. Muu käyttö, kuten sisällön kopioiminen toiselle verkkosivustolle, kaupallinen uudelleenkäyttö taikka nimen tai logon käyttäminen, edellyttää kirjallista lupaamme etukäteen.',
          },
        },
        {
          kind: 'p',
          text: {
            en: 'Software and other material that we offer under an open source licence (for example Koha, Lainuri and Toveri) is governed by the terms of those licences.',
            fi: 'Ohjelmistot ja muu aineisto, jota tarjoamme avoimen lähdekoodin lisenssillä (esimerkiksi Koha, Lainuri ja Toveri), ovat kyseisten lisenssien ehtojen alaisia.',
          },
        },
      ],
    },
    {
      heading: { en: '6. Links to other websites', fi: '6. Linkit muille verkkosivustoille' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'This website contains links to third-party websites and code repositories. We are not responsible for their content, their availability or the way they process personal data. Their own terms of use and privacy policies apply to them.',
            fi: 'Tämä verkkosivusto sisältää linkkejä kolmansien osapuolten verkkosivustoille ja koodivarastoihin. Emme vastaa niiden sisällöstä, saatavuudesta emmekä niiden tavasta käsitellä henkilötietoja. Niihin sovelletaan niiden omia käyttöehtoja ja tietosuojaselosteita.',
          },
        },
      ],
    },
    {
      heading: { en: '7. Personal data', fi: '7. Henkilötiedot' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We process personal data in accordance with our Privacy Policy, which forms part of these terms. The website stores only your language choice and colour theme on your device; section 8 of the Privacy Policy describes them.',
            fi: 'Käsittelemme henkilötietoja tietosuojaselosteemme mukaisesti, ja se on osa näitä ehtoja. Verkkosivusto tallentaa laitteeseesi vain kielivalintasi ja väriteemasi; tietosuojaselosteen kohdassa 8 on niiden kuvaus.',
          },
        },
      ],
    },
    {
      heading: { en: '8. Liability', fi: '8. Vastuu' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We are not liable for damage caused by the website being unavailable, by content being changed or removed, or by third-party services linked from the website. Nothing in these terms limits liability that cannot be limited under mandatory law, including the statutory rights of consumers.',
            fi: 'Emme vastaa vahingoista, jotka aiheutuvat verkkosivuston käyttökatkoksesta, sisällön muuttamisesta tai poistamisesta taikka sivustolta linkitetyistä kolmannen osapuolen palveluista. Mikään näissä ehdoissa ei rajoita vastuuta, jota ei pakottavan lainsäädännön mukaan voida rajoittaa, mukaan lukien kuluttajien lakisääteiset oikeudet.',
          },
        },
      ],
    },
    {
      heading: { en: '9. Changes to these terms', fi: '9. Ehtojen muuttaminen' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We may change these terms. The version in force is the one published on this page, and the version number and date at the top show when it was last updated. Continuing to use the website after a change means that you accept the updated terms.',
            fi: 'Voimme muuttaa näitä ehtoja. Voimassa on tällä sivulla julkaistu versio, ja sivun yläosassa näkyvät versionumero ja päivämäärä kertovat viimeisimmästä päivityksestä. Verkkosivuston käyttämisen jatkaminen muutoksen jälkeen tarkoittaa, että hyväksyt päivitetyt ehdot.',
          },
        },
      ],
    },
    {
      heading: { en: '10. Governing law and disputes', fi: '10. Sovellettava laki ja erimielisyydet' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'These terms are governed by Finnish law. We aim to settle any disagreement through negotiation. For business users, disputes are resolved in the District Court of Pohjois-Karjala in Joensuu as the first instance. Consumer customers may bring proceedings in the district court of their own domicile and may also submit a dispute to the Consumer Disputes Board (Kuluttajariitalautakunta, Hämeentie 3, 00530 Helsinki); a decision of the Board is a recommendation and is not binding.',
            fi: 'Näihin ehtoihin sovelletaan Suomen lakia. Pyrimme ratkaisemaan erimielisyydet neuvotteluin. Yrityskäyttäjien osalta erimielisyydet ratkaistaan Pohjois-Karjalan käräjäoikeudessa Joensuussa ensimmäisenä oikeusasteena. Kuluttaja-asiakkaat voivat nostaa kanteen käräjäoikeudessa, jonka tuomiopiirissä heillä on kotipaikka, ja saattaa asian myös Kuluttajariitalautakunnan (Hämeentie 3, 00530 Helsinki) käsiteltäväksi; lautakunnan ratkaisu on suositus eikä ole sitova.',
          },
        },
      ],
    },
    {
      heading: { en: '11. Contact', fi: '11. Yhteydenotot' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'If you have questions about these terms, contact us with the contact form at www.hypernova.fi/contact/ or by post: Hypernova Oy, PL 16, 80101 Joensuu, Finland. We do not publish e-mail addresses on this website, so the contact form and the postal address are the ways to reach us.',
            fi: 'Jos sinulla on kysyttävää näistä ehdoista, ota yhteyttä osoitteessa www.hypernova.fi/contact/ olevalla lomakkeella tai postitse: Hypernova Oy, PL 16, 80101 Joensuu. Emme julkaise sähköpostiosoitteita verkkosivustollamme, joten yhteydenottolomake ja postiosoite ovat tapoja tavoittaa meidät.',
          },
        },
      ],
    },
  ],
};
