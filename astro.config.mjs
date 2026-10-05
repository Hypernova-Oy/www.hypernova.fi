// @ts-check
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import mdx from '@astrojs/mdx';
import node from '@astrojs/node';

// The public address of this deployment, used for canonical links and the sitemap. A staging
// deployment passes its own name in HYPERNOVA_SITE_URL (scripts/deploy/install.sh does, from
// --domain); without it the checkout default (production) is used.
const SITE_URL = process.env.HYPERNOVA_SITE_URL ?? 'https://www.hypernova.fi';

/*
 * BaseLayout.astro inlines the theme script into the document, because it has to run before
 * the body is painted (a module would run too late), and the Content Security Policy below
 * only allows an inline script whose contents it lists as a hash. The hash is therefore
 * computed here, from the very file the layout inlines with `?raw`, so the script and the
 * hash that allows it cannot drift apart.
 */
const themeInit = readFileSync(new URL('./src/scripts/theme-init.js', import.meta.url), 'utf8');
/** @type {`sha256-${string}`} The policy types these as a template literal; the value is one. */
const themeInitHash = `sha256-${createHash('sha256').update(themeInit).digest('base64')}`;

// Host names the dev and preview servers answer: both refuse a Host header that is not in
// this list (plus IP addresses and *.localhost), so a name used to reach a development
// machine - a container, a LAN name - has to be listed. The built server (`npm start`, which
// is what the deployment runs) refuses nothing by name - Apache decides which name reaches
// it - and answers the one name that is not the address of the site with a redirect
// (src/utils/canonical-host.ts, which is what the `site` above is for). A development server
// is left out of that on purpose, so a checkout can be browsed under a LAN name.
// scripts/deploy/install.sh adds the domain it deploys.
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
    /*
     * No `domains`: nothing is optimized from another origin any more. The testimonial
     * avatars were the only remote images (`i.pravatar.cc`), and they are drawn from the
     * author's initials now - see src/components/Testimonials.astro. A remote image would
     * have to be listed here again, and it would be resized per request instead of at build
     * time, which is why every picture on the site is a local file under src/images/.
     */
  },
  // Legacy URLs from the previous site. The Finnish pages of the old site become the
  // same page on this site with the `?l=fi` language parameter: the old Koha hosting
  // service page is the page that describes that service now, and the old quote page is
  // the quote form on `/koha/`.
  redirects: {
    // Finnish legacy URLs.
    "/fi/": "/?l=fi",
    "/fi/koha/": "/koha/?l=fi",
    "/fi/koha-yllapitopalvelu/": "/koha-hosting/?l=fi",
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
    // The sitemap of the previous site. Search Console holds its address, and a crawler
    // that still asks for it has to land on the sitemap of this site instead of the 404.
    "/page-sitemap.xml": "/sitemap.xml",
  },
  vite: {
    /*
     * `assetsInlineLimit: 0` means "inline nothing", for the same reason as the policy below:
     * an inlined `<script>` is the one kind of script the router cannot leave alone.
     *
     * Astro inlines a bundled <script> below Vite's limit (4 KB by default) into the document
     * instead of writing it to /_astro/ (dist/core/build/plugins/plugin-scripts.js keeps those
     * in `internals.inlinedScripts`), and Vite inlines an asset of that size as a data: URL.
     * Both are refused by the policy - `script-src 'self'` does not cover a data: URL - but the
     * first one is what makes Astro's view transition router a problem: a document that has a
     * module script without `src` makes transitions/router.js append `<script type="module"
     * src="data:application/javascript,">` to the body after every client-side swap
     * (`needsWaitForInlineModuleScript`, which only looks at the last module script it finds),
     * and the policy refuses that script with a violation on every navigation. The navbar's
     * script and the reveal observer were both under the limit and were being inlined; at `0`
     * every module script carries a `src`, the router leaves that line alone, and `script-src`
     * needs no `data:`. The stylesheet is 97 KB and was never a candidate.
     */
    build: { assetsInlineLimit: 0 },
    plugins: [tailwindcss()]
  },
  /*
   * Shiki, Astro's default highlighter, writes its colours as `style="..."` attributes: an
   * inline style is only allowed by a hash, no hash covers an attribute, and 'unsafe-hashes'
   * would allow any attribute value. A page with a code block would therefore be rendered
   * without its highlighting and with a violation for every token (Astro warns about this at
   * build time). Prism writes the same information as classes, which the policy is content
   * with; giving those classes colours again is a Prism theme stylesheet, imported in
   * src/styles/global.css, whenever a post needs one. No page has a code block today: the only
   * entry in src/content/blog/ is a draft, which the blog index, the sitemap and the search
   * index leave out.
   */
  markdown: {
    syntaxHighlight: 'prism',
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
    checkOrigin: false,
    /*
     * Content Security Policy. Every page is rendered per request, so Astro answers with the
     * policy as a response header (`cspDestination` follows the route: a prerendered route
     * would carry it as a `<meta>` element instead) and stamps the hashes of the scripts and
     * styles it inlined into this page into `script-src`/`style-src`. The hash list is what
     * makes `'unsafe-inline'` unnecessary, so nothing of ours is trusted just because it sits
     * in the markup: an injected `<script>` has no matching hash and does not run.
     *
     * The directives Astro writes itself are `script-src`, `style-src` (plus `font-src` for
     * the fonts of the Font API, and `script-src-elem`/`style-src-elem` when a page has no
     * inline block of that kind); everything below is added to them.
     */
    csp: {
      algorithm: 'SHA-256',
      directives: [
        // The default for every fetch directive not listed below is the same origin: the
        // stylesheet, the scripts, the fonts under /_astro/fonts/ and the pictures.
        "default-src 'self'",
        // No <base href> is rendered, and an injected one could reroute every relative URL.
        "base-uri 'self'",
        // Nothing on the site is a plugin or a PDF viewer.
        "object-src 'none'",
        /*
         * Nobody frames the site (the only copy is Apache on this host), and this covers the
         * browsers that ignore X-Frame-Options. Apache sends that header as well - see
         * scripts/deploy/install.sh - because a `frame-ancestors` in a `<meta>` element is
         * ignored by every browser, so this directive only counts once the header is there.
         */
        "frame-ancestors 'none'",
        // The two forms post to their own page, and nothing posts anywhere else.
        "form-action 'self'",
        // The dotted background of the hero and the call to action is an inline SVG in a
        // data: URL (Tailwind's bg-[url(...)] class); the rest of the pictures are files.
        "img-src 'self' data:",
        "font-src 'self'",
        // The command palette fetches /search-index.json; nothing calls out to another origin.
        "connect-src 'self'",
        /*
         * Trusted Types, the browser-side half of DOM-XSS defence: with the directive in
         * force, a string assigned to a sink that parses HTML (`innerHTML`,
         * `insertAdjacentHTML`, `document.write`, `eval`-less script URLs) is refused with a
         * TypeError unless it came out of a policy. `hypernova-palette` is our own policy (see
         * src/components/CommandPalette.astro) and holds the one place that builds markup
         * from the search index.
         *
         * `default` is the policy a sink falls back to for a bare string, and it is needed
         * because Astro's view transition router (ClientRouter) is not Trusted-Types-aware: on
         * every client-side navigation it re-creates the page's scripts by assigning
         * `script.innerHTML` and inserting `<script>` markup (node_modules/astro/dist/
         * transitions/router.js, `runScripts`). That policy is a pass-through, so the
         * protection this directive gives is the one it gives a Trusted-Types-aware site plus
         * Astro's own code: a script that an attacker manages to inject into the document as a
         * *string* still has to match a hash in `script-src` before it runs. Removing the
         * router (or a Trusted-Types-aware release of it) is what would let `default` go.
         */
        "require-trusted-types-for 'script'",
        "trusted-types hypernova-palette default",
      ],
      scriptDirective: {
        /*
         * `'self'` is for the scripts under /_astro/. The hashes are the ones Astro computes
         * itself for the inline scripts it writes into the document (hydration and `client:`
         * directives; `assetsInlineLimit: 0` above leaves nothing else inline) plus
         * `themeInitHash`: the one inline script this site writes by hand has to be listed
         * here, because an `is:inline` script (or one written with `set:html`) is passed
         * through as written, leaving Astro nothing to hash.
         *
         * `strictDynamic` stays at its default (off). Turning it on would let every script the
         * bundle loads run, which is wider than this list; scripts/verify-security-headers.mjs
         * hashes the inline scripts of a rendered page against these hashes and is what checks
         * a deployment against the list as it stands.
         */
        resources: ["'self'"],
        hashes: [themeInitHash],
      },
      styleDirective: {
        // Same for the stylesheet, and no 'unsafe-inline': the @font-face rules the Font
        // components inline carry a hash, the Koha screenshot's reserved box is a hashed <style>
        // element, and the reveal delays are the `reveal-delay-*` classes of
        // src/styles/global.css - not `style="transition-delay: ..."` attributes, which no hash
        // can cover ('unsafe-hashes' would be the only way, and it would cover any attribute
        // value on any element).
        resources: ["'self'"],
      },
    }
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
    },
    /*
     * Inter (body) and Space Grotesk (headings), as the latin subset of the variable fonts and
     * from copies in src/assets/fonts, so a build needs no network.
     *
     * The packages that ship them declare a face per subset - cyrillic, cyrillic-ext, greek,
     * greek-ext, vietnamese, latin-ext - and every one of those declarations used to be part of
     * every page. The text of this site needs the latin range only (checked across src/: ä, ö,
     * and the punctuation U+2000-206F), so those are the files that are declared here. Astro
     * emits the @font-face rules and preloads the files, which starts them before the
     * stylesheet has been parsed instead of after.
     */
    {
      provider: fontProviders.local(),
      name: 'Inter Variable',
      cssVariable: '--font-inter',
      formats: ['woff2'],
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/inter-latin.woff2'],
            weight: '100 900',
            style: 'normal'
          }
        ]
      }
    },
    {
      provider: fontProviders.local(),
      name: 'Space Grotesk Variable',
      cssVariable: '--font-space-grotesk',
      formats: ['woff2'],
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/space-grotesk-latin.woff2'],
            weight: '300 700',
            style: 'normal'
          }
        ]
      }
    }
  ]
});
