import type { LegalDocument } from './types';

/**
 * Privacy policy for the hypernova.fi website, customer relationships and the
 * services we provide. Written for the GDPR (2016/679) and the Finnish Data
 * Protection Act (1050/2018).
 *
 * Both language versions are published from this file - keep them in sync.
 */
export const privacyPolicy: LegalDocument = {
  title: {
    en: 'Privacy Policy',
    fi: 'Tietosuojaseloste',
  },
  description: {
    en: 'How Hypernova Oy processes personal data under the GDPR and the Finnish Data Protection Act.',
    fi: 'Miten Hypernova Oy käsittelee henkilötietoja EU:n yleisen tietosuoja-asetuksen ja tietosuojalain mukaisesti.',
  },
  updated: '2026-09-21',
  version: '2.0',
  sections: [
    {
      heading: { en: '1. Controller', fi: '1. Rekisterinpitäjä' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'Hypernova Oy is the controller of the personal data described in this policy. We process personal data in accordance with the EU General Data Protection Regulation (2016/679, "GDPR") and the Finnish Data Protection Act (1050/2018).',
            fi: 'Hypernova Oy on tässä selosteessa kuvattujen henkilötietojen rekisterinpitäjä. Käsittelemme henkilötietoja EU:n yleisen tietosuoja-asetuksen (2016/679, "GDPR") ja tietosuojalain (1050/2018) mukaisesti.',
          },
        },
        {
          kind: 'address',
          lines: {
            en: [
              'Hypernova Oy',
              'Business ID: 2925676-3',
              'VAT ID: FI29256763',
              'PL 16',
              '80101 Joensuu',
              'Finland',
              'Contact form: www.hypernova.fi/contact/',
            ],
            fi: [
              'Hypernova Oy',
              'Y-tunnus: 2925676-3',
              'ALV-tunnus: FI29256763',
              'PL 16',
              '80101 Joensuu',
              'Suomi',
              'Yhteydenottolomake: www.hypernova.fi/contact/',
            ],
          },
        },
        {
          kind: 'p',
          text: {
            en: 'Data Protection Officer Lari Taskula. Reach us with the contact form at www.hypernova.fi/contact/ or by post at the address above.',
            fi: 'Tietosuojavastaava Lari Taskula. Tavoitat tietosuojavastaavan osoitteessa www.hypernova.fi/contact/ olevalla yhteydenottolomakkeella tai postitse yllä olevalla osoitteella.',
          },
        },
      ],
    },
    {
      heading: { en: '2. What we process and why', fi: '2. Mitä tietoja käsittelemme ja miksi' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We process only personal data that is necessary for the purposes listed below. The legal basis of each processing activity is shown in the table.',
            fi: 'Käsittelemme vain henkilötietoja, jotka ovat välttämättömiä jäljempänä lueteltuja käyttötarkoituksia varten. Kunkin käsittelyn oikeusperuste on esitetty taulukossa.',
          },
        },
        {
          kind: 'table',
          columns: {
            en: ['Purpose', 'Personal data', 'Legal basis (GDPR)'],
            fi: ['Käyttötarkoitus', 'Henkilötiedot', 'Oikeusperuste (GDPR)'],
          },
          rows: [
            {
              en: [
                'Answering contact and quote requests',
                'Name, e-mail address, organization, message content and the other details you send us',
                'Art. 6(1)(b) steps prior to a contract; Art. 6(1)(f) legitimate interest',
              ],
              fi: [
                'Yhteydenotto- ja tarjouspyyntöihin vastaaminen',
                'Nimi, sähköpostiosoite, organisaatio, viestin sisältö ja muut lähettämäsi tiedot',
                '6(1)(b) sopimusta edeltävät toimet; 6(1)(f) oikeutettu etu',
              ],
            },
            {
              en: [
                'Delivering and managing services and customer support',
                "Contact person's name, e-mail address, telephone number, organization, agreement, service and support ticket data",
                'Art. 6(1)(b) contract',
              ],
              fi: [
                'Palveluiden toimittaminen ja hallinnointi sekä asiakastuki',
                'Yhteyshenkilön nimi, sähköpostiosoite, puhelinnumero, organisaatio, sopimus-, palvelu- ja tukipyyntötiedot',
                '6(1)(b) sopimus',
              ],
            },
            {
              en: [
                'Website security, availability and preventing abuse',
                'IP address, time of the request, requested address, browser information, error and server logs',
                'Art. 6(1)(f) legitimate interest',
              ],
              fi: [
                'Verkkosivuston tietoturva, käytettävyys ja väärinkäytön estäminen',
                'IP-osoite, pyynnön ajankohta, pyydetty osoite, selaintiedot, virhe- ja palvelinlokit',
                '6(1)(f) oikeutettu etu',
              ],
            },
            {
              en: [
                'Website statistics',
                'Aggregated, de-identified usage data',
                'Art. 6(1)(f) legitimate interest; consent where identifiers are stored on your device',
              ],
              fi: [
                'Verkkosivuston käyttötilastot',
                'Yhdistetty ja tunnistamaton käyttötieto',
                '6(1)(f) oikeutettu etu; suostumus, jos laitteellesi tallennetaan tunnisteita',
              ],
            },
            {
              en: [
                'Remembering your language and colour theme',
                'The language cookie and the theme setting stored in your browser',
                'Strictly necessary for the service you requested, see section 8',
              ],
              fi: [
                'Kielivalintasi ja väriteemasi muistaminen',
                'Kielieväste sekä selaimeesi tallennettu teema-asetus',
                'Välttämätön pyytämäsi palvelun toteuttamiseksi, ks. kohta 8',
              ],
            },
          ],
        },
      ],
    },
    {
      heading: { en: '3. How long we keep data', fi: '3. Kuinka kauan säilytämme tietoja' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We keep personal data only as long as it is needed for the purpose it was collected for, or as long as the law requires. The main retention periods are:',
            fi: 'Säilytämme henkilötietoja vain niin kauan kuin niitä tarvitaan siihen tarkoitukseen, jota varten ne on kerätty, tai niin kauan kuin lainsäädäntö edellyttää. Keskeiset säilytysajat ovat:',
          },
        },
        {
          kind: 'ul',
          items: {
            en: [
              'Contact and quote requests: 24 months from the last contact, if no customer relationship is established.',
              'Customer agreements and support requests: for the duration of the customer relationship and 24 months after it ends.',
              'Server logs: 14 days, unless they are needed to investigate a security incident.',
              'Language and theme preferences: the language cookie is a session cookie; the theme setting stays in your browser until you clear your browser data.',
            ],
            fi: [
              'Yhteydenotto- ja tarjouspyynnöt: 24 kuukautta viimeisestä yhteydenotosta, jos asiakassuhdetta ei synny.',
              'Asiakassopimukset ja tukipyynnöt: asiakassuhteen ajan ja 24 kuukautta sen päättymisestä.',
              'Palvelinlokit: 14 vuorokautta, ellei niitä tarvita tietoturvapoikkeaman selvittämiseen.',
              'Kieli- ja teema-asetukset: kielieväste on istuntokohtainen, ja teema-asetus säilyy selaimessasi, kunnes tyhjennät selaimen tiedot.',
            ],
          },
        },
      ],
    },
    {
      heading: { en: '4. Recipients and processors', fi: '4. Vastaanottajat ja henkilötietojen käsittelijät' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We do not sell or rent personal data. We disclose personal data only where necessary, and always under a written data processing agreement (Article 28 GDPR) when a service provider processes data on our behalf.',
            fi: 'Emme myy tai vuokraa henkilötietoja. Luovutamme henkilötietoja vain silloin kun se on tarpeen, ja aina kirjallisen henkilötietojen käsittelysopimuksen (tietosuoja-asetuksen 28 artikla) nojalla, kun palveluntarjoaja käsittelee tietoja puolestamme.',
          },
        },
        {
          kind: 'ul',
          items: {
            en: [
              'Data centre and hosting services: Hetzner Finland Oy (Tuusula, Finland). Our servers and backups are located in the EEA.',
              'Our own systems: this website, our support and ticketing system (Redmine) and our email run on our own servers in Finland.',
              'IT support and maintenance partners, bound by confidentiality and data processing agreements.',
              'Public authorities, such as the tax authority, where we are legally obliged to disclose data.',
            ],
            fi: [
              'Konesali- ja hostingpalvelut: Hetzner Finland Oy (Tuusula, Suomi). Palvelimemme ja varmuuskopiomme sijaitsevat ETA-alueella.',
              'Omat järjestelmämme: tämä verkkosivusto, tuki- ja tikettijärjestelmämme (Redmine) sekä sähköpostimme toimivat omilla palvelimillamme Suomessa.',
              'IT-tuki- ja ylläpitokumppanit, joita sitovat salassapito- ja henkilötietojen käsittelysopimukset.',
              'Viranomaiset, kuten verohallinto, silloin kun lainsäädäntö velvoittaa meidät luovuttamaan tietoja.',
            ],
          },
        },
        {
          kind: 'p',
          text: {
            en: 'When you send us a request through the website, the information you submit is stored as a ticket in our Redmine system so that we can handle and follow up on your request.',
            fi: 'Kun lähetät meille pyynnön verkkosivuston kautta, lähettämäsi tiedot tallennetaan tiketiksi Redmine-järjestelmäämme, jotta voimme käsitellä pyyntösi ja seurata sen edistymistä.',
          },
        },
      ],
    },
    {
      heading: { en: '5. Transfers outside the EEA', fi: '5. Siirrot ETA-alueen ulkopuolelle' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We primarily process personal data within the European Economic Area and our data centre is located in Tuusula, Finland. If personal data is transferred outside the EEA, we ensure an adequate level of protection as required by Chapter V of the GDPR, for example by using the European Commission standard contractual clauses together with a transfer impact assessment, or on the basis of an adequacy decision.',
            fi: 'Käsittelemme henkilötietoja ensisijaisesti Euroopan talousalueella, ja konesalimme sijaitsee Tuusulassa. Jos henkilötietoja siirretään ETA-alueen ulkopuolelle, varmistamme tietosuoja-asetuksen V luvun edellyttämän riittävän suojan tason esimerkiksi Euroopan komission vakiosopimuslausekkeilla ja siirtoa koskevalla vaikutustenarvioinnilla tai tietosuojan riittävyyttä koskevan päätöksen perusteella.',
          },
        },
      ],
    },
    {
      heading: { en: '6. Your rights', fi: '6. Oikeutesi' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'Under the GDPR you have the following rights:',
            fi: 'Sinulla on tietosuoja-asetuksen mukaisesti seuraavat oikeudet:',
          },
        },
        {
          kind: 'ul',
          items: {
            en: [
              'Right of access (Art. 15): to know whether we process personal data about you and to receive a copy of it.',
              'Right to rectification (Art. 16): to have inaccurate or incomplete data corrected.',
              'Right to erasure (Art. 17): to have your data deleted, for example when it is no longer needed.',
              'Right to restriction of processing (Art. 18).',
              'Right to object (Art. 21): you may object to processing based on our legitimate interest.',
              'Right to data portability (Art. 20): to receive the data you provided in a machine-readable format, or to have it transferred.',
              'Right to withdraw your consent (Art. 7(3)) at any time; this does not affect the lawfulness of processing carried out before the withdrawal.',
            ],
            fi: [
              'Oikeus saada tietoja (15 artikla): saada tieto siitä, käsittelemmekö henkilötietojasi, sekä jäljennös tiedoista.',
              'Oikeus tietojen oikaisemiseen (16 artikla): virheellisten tai puutteellisten tietojen korjaaminen.',
              'Oikeus tietojen poistamiseen (17 artikla): esimerkiksi kun tietoja ei enää tarvita.',
              'Oikeus käsittelyn rajoittamiseen (18 artikla).',
              'Oikeus vastustaa käsittelyä (21 artikla): voit vastustaa oikeutettuun etuun perustuvaa käsittelyä.',
              'Oikeus siirtää tiedot järjestelmästä toiseen (20 artikla): saat toimittamasi tiedot koneellisesti luettavassa muodossa tai siirrettyinä.',
              'Oikeus peruuttaa suostumuksesi (7 artiklan 3 kohta) milloin tahansa. Peruuttaminen ei vaikuta ennen sitä tehdyn käsittelyn lainmukaisuuteen.',
            ],
          },
        },
        {
          kind: 'p',
          text: {
            en: 'To exercise your rights, use the contact form at www.hypernova.fi/contact/ or write to us at the postal address above. We reply within one month; for complex requests the deadline may be extended by two months (Art. 12(3)). Requests are free of charge, and we may need to verify your identity. We may refuse a manifestly unfounded or excessive request as allowed by Article 12(5).',
            fi: 'Käyttääksesi oikeuksiasi käytä osoitteessa www.hypernova.fi/contact/ olevaa yhteydenottolomaketta tai kirjoita meille yllä olevaan postiosoitteeseen. Vastaamme kuukauden kuluessa; monimutkaisissa pyynnöissä määräaikaa voidaan jatkaa kahdella kuukaudella (12 artiklan 3 kohta). Pyynnöt ovat maksuttomia, ja saatamme tarvita henkilöllisyytesi vahvistamisen. Voimme kieltäytyä selvästi perusteettomasta tai kohtuuttomasta pyynnöstä 12 artiklan 5 kohdan mukaisesti.',
          },
        },
        {
          kind: 'p',
          text: {
            en: 'If you consider that we process your personal data unlawfully, you have the right to lodge a complaint with the supervisory authority: Office of the Data Protection Ombudsman (Tietosuojavaltuutetun toimisto), Lintulahdenkuja 4, 00530 Helsinki, Finland, tel. +358 29 56 6700, tietosuoja.fi. You may also lodge the complaint in the EU member state where you live or work.',
            fi: 'Jos katsot, että käsittelemme henkilötietojasi lainvastaisesti, sinulla on oikeus tehdä valitus valvontaviranomaiselle: Tietosuojavaltuutetun toimisto, Lintulahdenkuja 4, 00530 Helsinki, puh. +358 29 56 6700, tietosuoja.fi. Voit tehdä valituksen myös siinä EU:n jäsenvaltiossa, jossa asut tai työskentelet.',
          },
        },
      ],
    },
    {
      heading: { en: '7. How we protect data', fi: '7. Miten suojaamme tietoja' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We protect personal data with appropriate technical and organisational measures, including: encrypted connections (TLS) for all traffic; role-based access control and least privilege for our staff; SSH-only remote access to our servers; daily encrypted backups stored in multiple locations; regular software and security updates; confidentiality commitments for our personnel and partners; and logging that allows us to investigate incidents.',
            fi: 'Suojaamme henkilötiedot asianmukaisilla teknisillä ja organisatorisilla toimenpiteillä, kuten: salatut yhteydet (TLS) kaikessa liikenteessä; roolipohjaiset käyttöoikeudet ja vähimmän oikeuden periaate henkilöstöllemme; etähallinta palvelimillemme vain SSH-yhteydellä; päivittäiset salatut varmuuskopiot useassa sijainnissa; säännölliset ohjelmisto- ja tietoturvapäivitykset; henkilöstömme ja kumppaneidemme salassapitositoumukset sekä lokit, joiden avulla poikkeamia voidaan selvittää.',
          },
        },
        {
          kind: 'p',
          text: {
            en: 'Our servers and backups are located in Finland. If a personal data breach is likely to result in a high risk to your rights, we notify the supervisory authority within 72 hours (Art. 33) and, where required, also you and the other affected people without undue delay (Art. 34).',
            fi: 'Palvelimemme ja varmuuskopiot sijaitsevat Suomessa. Jos henkilötietojen tietoturvaloukkaus todennäköisesti aiheuttaa korkean riskin oikeuksillesi, ilmoitamme siitä valvontaviranomaiselle 72 tunnin kuluessa (33 artikla) ja tarvittaessa myös sinulle ja muille loukkauksen kohteille viivytyksettä (34 artikla).',
          },
        },
      ],
    },
    {
      heading: { en: '8. Cookies and device storage', fi: '8. Evästeet ja laitteeseen tallennettavat tiedot' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'This website does not use advertising or tracking cookies and it does not load content from third-party servers. We store only the following information on your device:',
            fi: 'Tämä verkkosivusto ei käytä mainonta- tai seurantaevästeitä eikä lataa sisältöä kolmansien osapuolten palvelimilta. Tallennamme laitteeseesi vain seuraavat tiedot:',
          },
        },
        {
          kind: 'table',
          columns: {
            en: ['Name', 'Content', 'Purpose', 'Storage time', 'Type'],
            fi: ['Nimi', 'Sisältö', 'Käyttötarkoitus', 'Säilytysaika', 'Tyyppi'],
          },
          rows: [
            {
              en: [
                'language (cookie)',
                'fi or en',
                'Remembers the language you selected',
                'Session: removed when you close the browser',
                'Strictly necessary',
              ],
              fi: [
                'language (eväste)',
                'fi tai en',
                'Muistaa valitsemasi kielen',
                'Istunto: poistuu, kun suljet selaimen',
                'Välttämätön',
              ],
            },
            {
              en: [
                'theme (browser local storage, not a cookie)',
                'dark or light',
                'Remembers the colour theme you selected',
                'Until you clear your browser data',
                'Strictly necessary',
              ],
              fi: [
                'theme (selaimen paikallinen tallennus, ei eväste)',
                'dark tai light',
                'Muistaa valitsemasi väriteeman',
                'Kunnes tyhjennät selaimen tiedot',
                'Välttämätön',
              ],
            },
          ],
        },
        {
          kind: 'p',
          text: {
            en: 'These entries are created only as a result of your own action (switching the language or toggling dark mode). They are not used to identify or track you and are not shared with anyone. Because they are necessary to provide the service you requested, they do not require consent (Act on Electronic Communications Services 917/2014, Chapter 5).',
            fi: 'Nämä tiedot syntyvät vain oman toimintosi seurauksena (kielen vaihtaminen tai tumman tilan valinta). Niitä ei käytetä sinun tunnistamiseesi tai seuraamiseesi eikä luovuteta kenellekään. Koska ne ovat välttämättömiä pyytämäsi palvelun toteuttamiseksi, ne eivät edellytä suostumusta (sähköisen viestinnän palveluista annettu laki 917/2014, 5 luku).',
          },
        },
        {
          kind: 'p',
          text: {
            en: 'If we later introduce statistics or other cookies that are not strictly necessary, we will ask for your consent before setting them and provide an easy way to withdraw it at any time.',
            fi: 'Jos otamme myöhemmin käyttöön tilastointia tai muita kuin välttämättömiä evästeitä, pyydämme suostumuksesi ennen niiden asettamista ja tarjoamme helpon tavan peruuttaa suostumuksen milloin tahansa.',
          },
        },
      ],
    },
    {
      heading: { en: '9. Automated decisions and profiling', fi: '9. Automatisoidut päätökset ja profilointi' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We do not use your personal data for automated decision-making, including profiling, that would produce legal effects or similarly significantly affect you (Article 22 GDPR).',
            fi: 'Emme käytä henkilötietojasi automatisoituun päätöksentekoon emmekä profilointiin, jolla olisi oikeusvaikutuksia tai vastaavia merkittäviä vaikutuksia sinuun (tietosuoja-asetuksen 22 artikla).',
          },
        },
      ],
    },
    {
      heading: { en: '10. Children', fi: '10. Lapset' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'Our website and services are aimed at organizations and professionals, and they are not directed at children. We do not knowingly collect personal data from children. If you believe that a child has submitted personal data to us, please tell us with the contact form at www.hypernova.fi/contact/ and we will delete it.',
            fi: 'Verkkosivustomme ja palvelumme on suunnattu organisaatioille ja ammattilaisille, eivät lapsille. Emme kerää tietoisesti lasten henkilötietoja. Jos uskot lapsen lähettäneen meille henkilötietoja, ilmoita siitä osoitteessa www.hypernova.fi/contact/ olevalla lomakkeella, niin poistamme ne.',
          },
        },
      ],
    },
    {
      heading: {
        en: '11. When we process data on behalf of a customer',
        fi: '11. Kun käsittelemme tietoja asiakkaan puolesta',
      },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'When we host, maintain or support a library system (for example Koha) or another system for a customer, the customer - for example the library - is the controller of its patron and staff data, and Hypernova Oy acts as a processor. In that role we process personal data only on the documented instructions of the customer, in accordance with a written data processing agreement (Article 28 GDPR).',
            fi: 'Kun ylläpidämme, hostaamme tai tuemme asiakkaalle kirjastojärjestelmää (esimerkiksi Kohaa) tai muuta järjestelmää, asiakas - esimerkiksi kirjasto - on sen asiakas- ja henkilöstötietojen rekisterinpitäjä ja Hypernova Oy toimii henkilötietojen käsittelijänä. Tässä roolissa käsittelemme henkilötietoja vain asiakkaan dokumentoitujen ohjeiden mukaisesti ja kirjallisen henkilötietojen käsittelysopimuksen (tietosuoja-asetuksen 28 artikla) nojalla.',
          },
        },
        {
          kind: 'p',
          text: {
            en: 'If you are a library patron and want to exercise your rights, for example to access, correct or delete your borrower data, please contact your library, which is the controller of that data. We assist our customers in responding to such requests, and we never use customer data for our own purposes.',
            fi: 'Jos olet kirjaston asiakas ja haluat käyttää oikeuksiasi, esimerkiksi tarkastaa, oikaista tai poistaa lainaajatietosi, ota yhteyttä kirjastoosi, joka on näiden tietojen rekisterinpitäjä. Autamme asiakkaitamme vastaamaan tällaisiin pyyntöihin emmekä koskaan käytä asiakkaidemme tietoja omiin tarkoituksiimme.',
          },
        },
      ],
    },
    {
      heading: { en: '12. Changes and contact', fi: '12. Muutokset ja yhteydenotot' },
      blocks: [
        {
          kind: 'p',
          text: {
            en: 'We may update this policy when our services or the legislation change. The version and date at the top of the page show when it was last revised. If a change is material, we will announce it on this page and, where necessary, inform our customers directly.',
            fi: 'Voimme päivittää tätä selostetta, kun palvelumme tai lainsäädäntö muuttuvat. Sivun yläosassa näkyvät versio ja päivämäärä kertovat viimeisimmästä päivityksestä. Jos muutos on olennainen, ilmoitamme siitä tällä sivulla ja tarvittaessa suoraan asiakkaillemme.',
          },
        },
        {
          kind: 'p',
          text: {
            en: 'If you have questions about this policy or about how we process personal data, contact us with the contact form at www.hypernova.fi/contact/ or by post: Hypernova Oy, PL 16, 80101 Joensuu, Finland. We do not publish e-mail addresses on this website, so the contact form and the postal address are how you reach us.',
            fi: 'Jos sinulla on kysyttävää tästä selosteesta tai henkilötietojen käsittelystä, ota yhteyttä osoitteessa www.hypernova.fi/contact/ olevalla lomakkeella tai postitse: Hypernova Oy, PL 16, 80101 Joensuu. Emme julkaise sähköpostiosoitteita verkkosivustollamme, joten yhteydenottolomake ja postiosoite ovat keinot tavoittaa meidät.',
          },
        },
      ],
    },
  ],
};
