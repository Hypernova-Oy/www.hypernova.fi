// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

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
    /*
     * Astro's default: a stylesheet small enough to be worth it is inlined, and the
     * rest is written to a hashed file under `/_astro/`. The site has one that is not
     * small - Tailwind's output, about 100 KB - and inlining it put that into every
     * page, where it cannot be cached and has to be parsed again on every client-side
     * navigation. As a file it is fetched once (the same 100 KB, ~15 KB compressed)
     * and then served from cache with `max-age=31536000, immutable`.
     */
    inlineStylesheets: 'auto'
  },
  image: {
    /*
     * The default service: sharp, which is a dependency already. It used to be
     * passthroughImageService(), which kept every file byte for byte and answered the
     * `/_image` endpoint with the original - a 1320x2868 PNG of the Koha staff interface was
     * sent to phones whole (253 KB), a 1024x1024 logo was sent whole to draw it at 32px
     * (39 KB), and a 365x500 request for a product photo was answered with the 1159x1536
     * capture (391 KB, content-type image/undefined). Local images are now resized and
     * re-encoded at build time into hashed files under `/_astro/`, which are immutable-
     * cacheable and served by the same static handler as everything else.
     */
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
  // Nothing here is prerendered - the language of a request is resolved per request in
  // src/middleware.ts, so every page is rendered when it is asked for. Without a prefetch
  // a click therefore waits for a render and a round trip before the new document even
  // starts; with one, the request is already on its way by the time the visitor lets go of
  // the link. `hover` covers the pointers that can hover and leaves touch devices as they
  // are, and `src/middleware.ts` already skips the language cookie for a prefetch, which is
  // not a visit.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
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
