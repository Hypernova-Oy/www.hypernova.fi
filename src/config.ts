// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'Hypernova';
export const SITE_DESCRIPTION = 'Cost-effective Open Source Services';
export const SITE_DESCRIPTION_I18N = {
  'fi': 'Kustannustehokkaat avoimen lähdekoodin palvelut'
}
export const SITE_URL = 'https://www.hypernova.fi';
export const REPOSITORY_URL = 'https://github.com/Hypernova-Oy/zenix';

// Brand Settings
export const BRAND_NAME = 'hypernova';

// Social Links
export const SOCIAL_LINKS = {
  github: 'https://github.com/Hypernova-Oy',
};

// Navigation Links
export const NAV_LINKS = [
  { href: '/#whyfoss', label: 'Why FOSS' },
  { href: '/services/', label: 'Services' },
  { href: '/koha/#cloud-hosting-service', label: 'Koha Cloud Hosting' },
  { href: '/contact/', label: 'Contact' }
];

// Footer Links
export const FOOTER_LINKS = [
  {
    title: 'Services',
    links: [
      { label: 'Why FOSS', href: '/#whyfoss' },
      { label: 'Our Services', href: '/services/' },
    ],
  },
  {
    title: 'For Clients',
    links: [
      { label: 'Support', href: 'https://redmine.hypernova.fi' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact', href: '/contact/' },
      { label: 'Privacy Policy', href: '/privacy/' },
      { label: 'Terms of Service', href: '/terms/' },
    ],
  },
];
