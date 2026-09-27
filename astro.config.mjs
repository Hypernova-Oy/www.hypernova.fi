// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { passthroughImageService } from 'astro/config';

import mdx from '@astrojs/mdx';
import node from '@astrojs/node';

// The public address of this deployment, used for canonical links and the sitemap. A staging
// deployment passes its own name in HYPERNOVA_SITE_URL (scripts/deploy/install.sh does, from
// --domain); without it the checkout default (production) is used.
const SITE_URL = process.env.HYPERNOVA_SITE_URL ?? 'https://www.hypernova.fi';

// Host names the dev and preview servers answer: both refuse a Host header that is not in
// this list (plus IP addresses and *.localhost), so a name used to reach a development
// machine - a container, a LAN name - has to be listed. The built server (`npm start`,
// which is what the deployment runs) does not check the Host header; Apache is what decides
// which name reaches it. scripts/deploy/install.sh adds the domain it deploys.
const allowedHosts = [new URL(SITE_URL).host, 'hypernova.fi', 'homepagenew.lxd'];
for (const name of (process.env.HYPERNOVA_ALLOWED_HOSTS ?? '').split(',')) {
  if (name.trim() && !allowedHosts.includes(name.trim())) {
    allowedHosts.push(name.trim());
  }
}

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: '/',
  trailingSlash: 'always',
  build: {
    inlineStylesheets: 'always'
  },
  image: {
    service: passthroughImageService(),
    domains: ['i.pravatar.cc']
  },
  // Legacy URLs from the previous site. The Finnish pages of the old site become the
  // same page on this site with the `?l=fi` language parameter, and the old standalone
  // quote/hosting pages point at the matching section of `/koha/`.
  redirects: {
    // Finnish legacy URLs.
    "/fi/": "/?l=fi",
    "/fi/koha/": "/koha/?l=fi",
    "/fi/koha-yllapitopalvelu/": "/koha/?l=fi#cloud-hosting-service",
    "/fi/koha-yllapito-tarjouspyynto/": "/koha/?l=fi#request-a-quote",
    "/fi/lainuri-lainausautomaatti/": "/lainuri-checkout-machine/?l=fi",
    "/fi/ota-yhteytta/": "/contact/?l=fi",
    "/fi/tietosuojaseloste/": "/privacy/?l=fi",
    "/fi/toveri-kulunvalvontalaite/": "/toveri-access-control-device/?l=fi",
    "/fi/yhteystiedot/": "/contact/?l=fi",
    // English legacy URLs.
    "/koha-hosting-quote/": "/koha/#request-a-quote",
    "/lainuri-self-checkout-machine/": "/lainuri-checkout-machine/",
    "/privacy-policy/": "/privacy/",
  },
  vite: {
    plugins: [tailwindcss()]
  },
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Astro's built-in origin check compares the browser's `Origin` header with the URL the Node
  // adapter built for the request, and it compares the two as strings. The adapter takes the
  // scheme from the socket it accepted, not from X-Forwarded-Proto, so once a proxy ends TLS
  // in front of the Node process (Apache alone with certbot, or Apache behind HAProxy with
  // --behind-proxy) that URL is `http://<domain>` while a browser always posts an
  // `https://<domain>` origin: every real form submission would be answered with
  // `403 Cross-site POST form submissions are forbidden`.
  // The forms therefore rely on their own, proxy-aware protection (src/utils/form-protection.ts):
  // a submission has to come from our own host (Origin/Sec-Fetch-Site, compared by host name,
  // so the scheme behind the proxy does not matter), carry a signed form token, pass the
  // honeypot, stay inside the content rules and the rate limit.
  security: {
    checkOrigin: false
  },
  integrations: [mdx()],
  server: {
    allowedHosts
  },
  fonts: [  
    {
      provider: fontProviders.local(),
      name: "OCR-A",
      cssVariable: "--font-ocra",
      formats: ["woff2"],
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/ocra.woff2'],
            weight: 'normal',
            style: 'normal'
          }
        ]
      }
    }
  ]
});
