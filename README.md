# Hypernova website

Marketing site for **Hypernova Oy** — cost-effective Free and Open Source software
services: Koha library system cloud hosting, Lainuri self-service checkout machines
and Toveri access control devices.

## Stack

- **Astro 6** server-rendered (`output: 'server'`) with the **`@astrojs/node`** standalone adapter
- **Tailwind CSS 4** via `@tailwindcss/vite` plus `@tailwindcss/typography` for prose content
- **MDX** content collections for the blog, changelog and authors
- **English / Finnish** UI, resolved per request (query parameter → cookie → English)
- **Playwright** end-to-end regression tests

## Requirements

- Node.js >= 22.12.0
- A Redmine instance and API key for the quote and contact forms (optional for local UI work)

## Getting started

```bash
npm install
cp .env.example .env   # fill in the Redmine values, set FORM_TOKEN_SECRET
npm run dev            # http://localhost:4321
```

On a fresh Debian or Ubuntu server, `scripts/deploy/install.sh` does both of the above plus
the service account, the systemd unit, Apache and TLS, and checks the result (see Deployment).

## Commands

```bash
npm run dev         # Start the local dev server
npm run build       # Build the production site into dist/
npm run check       # Astro + TypeScript type check
npm run preview     # Preview the production build locally
npm start           # Run the built server (dist/server/entry.mjs)
npm run test        # Unit tests + Playwright regression tests
npm run test:unit   # Node's built-in test runner (form protection, fonts, caching, palette)
npm run test:e2e    # Playwright regression tests
npm run bench:scroll # Chromium scroll-smoothness benchmark (needs a running server)
npm run index:refresh # Build, restart the site and verify the search index (see Deployment)
npm run og:image    # Regenerate the social preview card (public/og-image.png)
npm run font:subset # Re-cut the brand font subset from the whole face (see Performance notes)
```

Playwright needs browsers installed once:

```bash
npx playwright install chromium
```

The Playwright config starts a dev server on `127.0.0.1:4321` unless something already answers
there, and on a server that runs the site the deployed build answers on that same port. The
suite then tests the deployment instead of the checkout, which hides every change under test:
stop the service first (`sudo systemctl stop hypernova`) and let Playwright start the dev server
from the working copy.

## Configuration

Site-wide settings live in `src/config.ts`:

```ts
export const SITE_TITLE = 'Hypernova';
export const SITE_DESCRIPTION = 'Cost-effective Open Source Services';
export const SITE_URL = 'https://www.hypernova.fi';
export const SOCIAL_LINKS = {
  twitter: 'https://twitter.com/farrosfr_',
  github: 'https://github.com/farrosfr',
  linkedin: 'https://linkedin.com/in/yourhandle',
};
export const NAV_LINKS = [ /* main navigation */ ];
export const FOOTER_LINKS = [ /* footer columns */ ];
```

`astro.config.mjs` holds the site URL, trailing-slash policy, legacy redirects, the
Node adapter and the locally hosted OCR-A brand font.

## Environment variables

The quote form on `/koha/` and the contact form on `/contact/` create Redmine issues
through the REST API. Copy `.env.example` to `.env` and set:

| Variable | Purpose |
| --- | --- |
| `REDMINE_NEW_QUOTE_ENDPOINT` | Issues endpoint, e.g. `https://redmine.hypernova.fi/issues.json` |
| `REDMINE_NEW_QUOTE_API_KEY` | API key used for issue creation |
| `REDMINE_NEW_QUOTE_PROJECT_ID` | Project for Koha quote requests |
| `REDMINE_NEW_QUOTE_STATUS_ID` | Initial status for quote requests |
| `REDMINE_NEW_CONTACT_PROJECT_ID` | Project for general contact requests |

`.env` is git-ignored and must never be committed.

## Routes

| Route | Rendering | Notes |
| --- | --- | --- |
| `/` | SSR | Hero, "Why FOSS" features, closing CTA |
| `/services/` | SSR | Service cards |
| `/koha/` | SSR | Koha overview + quote form (POST) |
| `/koha-hosting/` | SSR | Koha cloud hosting service detail |
| `/toveri-access-control-device/` | SSR | Toveri access control device |
| `/lainuri-checkout-machine/` | SSR | Lainuri self-service checkout machine |
| `/contact/` | SSR | Company and billing details + contact form (POST) |
| `/blog/`, `/blog/[slug]/` | SSR | MDX blog collection |
| `/changelog/` | SSR | Changelog collection |
| `/privacy/`, `/terms/` | SSR | Legal pages |
| `/sitemap.xml`, `/robots.txt` | SSR | SEO data |
| `/search-index.json` | SSR | Data for the command palette (see below) |
| any unknown URL | SSR | `src/pages/404.astro`, answered with status 404 and translated |

Legacy URLs are redirected in `astro.config.mjs`. The old standalone pages point at the
section of `/koha/` that replaced them (`/koha-hosting-quote/` →
`/koha/#request-a-quote`) or at the page that took their place (`/privacy-policy/` →
`/privacy/`, `/lainuri-self-checkout-machine/` → `/lainuri-checkout-machine/`), and the
Finnish URLs of the old site become the same page with the `?l=fi` language parameter
(`/fi/lainuri-lainausautomaatti/` → `/lainuri-checkout-machine/?l=fi`).

The Koha logo on `/koha/` and `/koha-hosting/` is a wide file (768x220) that carries no
width of its own, so it is capped below `md` (`w-56`) and left to its grid cell above it.
Without the cap it filled whatever row it sat in, which drew it wider on a phone than the
desktop layout ever does.

The company and billing details on `/contact/` are one panel with two columns from `md` up:
the VAT ID and the postal address on the left, the four billing codes on the right, and the
billing column divided from the other by a hairline. Each detail is a label above its value
in a `<dl>`, which is what lets a code be found by its name instead of by reading the
sentence around it, and keeps both columns the same shape. The codes (IBAN, BIC, EDI number,
operator) are copied off the page into an invoicing system, so they stay verbatim and are set
in `font-mono` rather than spaced out or wrapped for looks. The grid itself is `w-full` and
not `mx-auto` like the panels around it: the panel is a column flex container, so an auto
inline margin there sizes the grid to its content and centres it, which left the right half
of the panel empty above 768px.

## Search (command palette)

The navbar search button and `Ctrl`/`Cmd` + `K` open the shared palette component
(`src/components/CommandPalette.astro`). It fetches `/search-index.json` once per
language and matches every word of the query against the title, the description, the
hidden `keywords` and the `content` of an entry.

The closed button is a chip with a fill of its own, not bare text like the links beside it, and
the greys it wore first - `zinc-500` on `zinc-100` in light mode, `zinc-400` on `night-raise` in
dark - read 4.39:1 and 5.35:1 there, close enough to their own fill that a closed search box looked
disabled. A step further apart (`zinc-700` on `zinc-200`, 8.2:1, and `zinc-300` on the `night-line`
surface, 8.0:1) leaves the label plainly the foreground and the fill plainly a surface above the
bar. The chip does not write the accelerator on itself either: a `Ctrl K` badge that a script
rewrote to `⌘K` on Apple hardware repeated what the palette's own empty state says one click later,
and was a second place to keep in step with what actually opens the palette.
`tests/unit/search-trigger.test.ts` holds the badge's absence and both ratios, so a restyle back
into the old pair fails there rather than on a page.

The chip is content-sized until `xl` and keeps a floor of 11rem from there, so `Search` and the
shorter `Haku` give a box of the same width at the size most desktops are, and the layouts without
room for it (1024px is down to 91px of spare width, 768px has none and already wraps) are left as
they were.

The component ships as a bundled script (`<script>`, not `is:inline`): the base path and the
localized message it needs are `data-` attributes on the palette element, so one file - cached
by its hash, see Performance notes - serves both languages and is parsed once rather than
written into every document. A client-side navigation replaces that element without re-running
the file, so it binds the new one and republishes `window.toggleCommandPalette` (which the two
navbar buttons call) on `astro:page-load`.

`src/pages/search-index.json.ts` builds the index:

- the static pages (home, services, Koha, Koha hosting, Lainuri, Toveri, contact,
  privacy, terms) with localized titles/descriptions, so results follow the visitor's
  language;
- `keywords`, which always holds both languages plus extra terms (for example
  `kirjasto`, `hosting`, `kulunvalvonta`), so a search matches in either language;
- `content`, the text of the page itself in the visitor's language, so a page is found
  by anything written on it (`maailman ensimmäinen`, `since 1999`) and not only by its
  title, description or keywords;
- `/blog/` and `/changelog/` plus their entries, but only once they have published
  (non-draft) content. Blog and changelog entries carry their own body text.

`content` is not written twice anywhere: the server renders the page and
`src/utils/search-content.ts` reads the `<main>` element of that answer back, in the
same request that asks for the index. The head, the navbar and the footer are left out,
because they are identical on every page and would make every page a match for
"contact" or "language". A page that cannot be read (a render error, a timeout) keeps
its title, description and keywords and is reported in the log, so a failure never
takes the palette down with it. Every page is read once per process in a production
build, and on every request in `npm run dev` so that copy changes show up immediately.

The palette highlights every word of the query where it is visible: in the title, in the
description, and - when the words are not part of those two - in a snippet of the page text,
so it is clear why an entry matched. The snippet window around a match is chosen to hold as
many of the query words as possible, which keeps a phrase (say `maailman ensimmäinen`) in one
piece, and both it and the title/description highlight the words in the casing of the entry.
A word that only `keywords` carries (`kirjasto` on an English page, for example) is still
matched but cannot be highlighted, because it is not part of the visible copy.

The contact page carries two words that are printed nowhere: `Tilinumero` beside the IBAN and
`Pankki` beside the BIC, each one `sr-only` inside the row it names and only on the Finnish
page. They are the Finnish names of those two codes, and since the index reads the text of the
page, a search for either word points at `/contact/` with the code the word stands for in the
snippet (see the billing block above). They are markup rather than `keywords` so that the
result points at the row that actually carries the number, which `keywords` - one flat string
per page - cannot do.

Because the payload depends on the language cookie, it is served with
`Cache-Control: private` and `Vary: Cookie` and must not be cached by a shared proxy.
Keep those headers when adding entries, and keep the entry shape (`title`,
`description`, `keywords`, `content`, `slug`, `type`) - the palette displays `title`,
`description` and `type`, matches on `keywords` and `content`, and links to `slug`.

## Localization

The current language is resolved once per request in `src/middleware.ts`
(`?l=` parameter → `language` cookie → English) and stored in `Astro.locals.lang`.

Pages and components declare their own dictionary and translate through
`useTranslations`:

```astro
const i18n = {
  fi: {
    'Our Services': 'Palvelumme',
  }
};
const t = useTranslations(i18n, Astro);
```

English keys are used as-is; missing Finnish entries fall back to English. Add new
copy to the component's `fi` dictionary next to where it is rendered.

`t()` returns text, so it cannot hold the markup of a sentence that carries a link:
a sentence like that is broken into pieces around its links and each piece is
translated where it sits. The credits line at the bottom of the footer is four
entries for that reason.

The language switcher is `src/components/LanguagePicker.astro`. It links to the same page
with `?l=`, so changing language never leaves the page the visitor is on. The desktop nav
bar holds it as a pill of its own (`variant="inline"`, the default): the bar around it is
bare text, so the picker carries the fill, the inset, the rounded shape and the size of a
control, its label matching the labels it follows instead of the 16px a bare link would
inherit beside them. The fill is a tint of the bar in each theme - `primary-100` under
`primary-800`, the pairing a `Badge` gives a label - rather than the solid-control colour
`primary-600`, which as a near-black pill was the heaviest thing in a bar whose other
controls stay quiet until they are hovered, and read as a competitor to the page's own
calls to action. Dark mode keeps `night-raise`, which sits above the bar it is drawn on.
Because that bar is hidden on a small screen, the mobile menu renders the same component
as full-width rows (`variant="menu"`), next to the navigation links it would otherwise be
missing from.

The mobile menu is a panel of the sticky header, so it covers the top of the page it is
open over and puts itself away unless the tap asks to stay: a tap beside the menu, or on
one of its links, closes it, while a tap on the menu's own caption or padding leaves it
open. The dismissal lives in `setupMobileMenu()` in `src/components/Navbar.astro` as one
`document` listener that looks the menu up again on each tap, because every navigation
renders a new header.

The bar is tight: from 768px up it shares the row with the logo and the controls, and the
Finnish labels are the longest, so a hairline (`span[data-nav-separator]`) carries the
separation between the items and the gaps around it are kept small (`gap-3 lg:gap-2`)
until the row has room to breathe again (`xl:gap-5`). The hairlines start at `lg`, where
the row stops wrapping its labels; the mobile menu draws its links as rows and has none.
The picker's pill costs the row about 15px more than the bare link did, which the tightest
row (`lg`, Finnish labels, `English` in the picker) still has to spare - measured at 768,
1024 and 1280px, in both languages.

The bar is a surface of its own, and a solid one: `bg-white dark:bg-night-card`, the fills
the mobile menu panel below it already used, so the two stay one surface when the menu opens.
The page scrolls underneath it, and the translucency it used to carry (`.glass-panel`, 80%)
let the copy behind it read through the links - the cards in the page keep that fill, since
nothing scrolls under them.

## Forms

`/koha/` and `/contact/` POST back to themselves. Validation errors are rendered
inline, successful submissions create a Redmine issue and show a thank-you message.
Koha hosting is quoted through `/koha/#request-a-quote`, so `/contact/` says so under its
heading and links there, instead of letting a visitor fill in the wrong form.

### Bot protection

All of it lives in `src/utils/form-protection.ts` and is deliberately built from
Node's own crypto module - no captcha and no third-party service, so nothing about a
visitor leaves our server:

- **Honeypot** - a `website` field that sits off-screen (`aria-hidden`, `tabindex="-1"`,
  `autocomplete="off"`), invisible to people and screen readers but filled by naive
  scripts.
- **Signed token** - every rendered form embeds a HMAC-signed timestamp
  (`FORM_TOKEN_SECRET`). Submissions with a missing, forged, foreign, too fast
  (< 3 s after the page was rendered) or stale (> 2 h) token are dropped. A form that
  is re-rendered after a validation error keeps the visitor's token, so fixing a typo
  is never punished.
- **Rate limit** - 5 accepted submissions per client per 15 minutes, counted in memory
  (the standalone Node server is a single process). The client address is the last
  `X-Forwarded-For` hop our Apache proxy appended, or the socket address. That last hop
  is used on purpose: behind a local proxy the socket address is always `127.0.0.1`, so
  the proxy has to append the real client address (mod_proxy does this by default). On a
  host behind `--behind-proxy` it is the edge proxy in front of Apache that saw the
  visitor, so that mode turns mod_proxy's own hop off: otherwise its hop would be the
  edge's address for every visitor and a single bucket would fill up for the whole
  internet.
- **Cross-site and content checks** - `Sec-Fetch-Site`/`Origin` must belong to us, and
  free text may not contain control characters, HTML/BBCode markup or more than 4 links.
  Astro's own origin check (`security.checkOrigin`) is switched off in `astro.config.mjs`,
  because it compares the browser's `https://` origin with the URL the Node adapter derived
  from the plain HTTP socket behind the proxy, which turns every real submission into
  `403 Cross-site POST form submissions are forbidden`. The check in `form-protection.ts`
  compares host names instead, so it keeps working behind a proxy that ends TLS.
- **Bounded fields** - every field is length-capped (inputs and textareas carry matching
  `maxlength`), stripped of control characters and single-line-normalised before it is
  stored in the form state or sent to Redmine.

Bot signals are answered with the same thank-you view as a real submission, so scripts
cannot learn that they were detected, and Redmine is never contacted. Only a
rate-limited visitor sees an explanation, because a real person should not lose their
message silently. Log lines contain the rejection reason only - never visitor data.

Because the token encodes when the page was rendered, `/contact/` and `/koha/` are
served `Cache-Control: private, no-store` (see `src/middleware.ts`) so no shared cache
can hand out a stale page whose submissions would be dropped as replays.

### No published e-mail addresses

The site does not publish e-mail addresses, not even in the legal pages: they point to
the contact form and the postal address instead. That keeps address harvesters from
having anything to collect. If you ever need to print an address, add it as an image
or through the contact form - do not put it back into the markup.

## Content

- Blog posts: `src/content/blog/`
- Changelog entries: `src/content/changelog/`
- Authors: `src/content/authors/`

Blog posts and changelog entries support a `draft: true` flag. Drafts are excluded
from the blog/changelog listings, the sitemap and the search index, and
`/blog/<slug>/` returns 404 for them. `src/content/blog/sample-post.mdx` and
`src/content/changelog/sample-entry.md` are drafts kept only so that both
collections stay initialised while there is no published content - delete them
once you add real entries.

```mdx
---
title: "Example post"
description: "A short summary."
pubDate: 2026-06-01
author: farros
tags: ["koha", "update"]
---

<Callout type="info" title="Heads up">
  MDX components can be used directly inside content.
</Callout>
```

## Performance notes

Chromium composites some CSS far more expensively than Firefox, which showed up as
janky scrolling and laggy scroll-reveals. Keep these constraints in mind:

- **No `backdrop-filter`** on `.glass-panel` cards or on anything else that sits over
  scrolling content. A permanent backdrop blur over scrolling content re-blurs it every
  frame (removing it took the homepage from ~27ms to ~17ms median frame time).
- **No `mix-blend-mode` on large decorative layers** and no infinite animations on
  blurred layers - they force full-page re-compositing while scrolling.
- **`.reveal-on-scroll` must stay compositor-driven**: `translate3d()` plus
  `will-change` (released by `.reveal-done` once the fade ends). A plain
  `translateY()` transition repaints the element every frame (~1459 raster tasks per
  scroll pass vs ~173 with promotion).
- **`.reveal-on-scroll` reveals on any overlap** - keep `threshold: 0` in
  `src/layouts/BaseLayout.astro`. A threshold that is a share of the element scales with
  its height: on a phone the one-column card stack on `/koha/` is 3711px, so 10% of it
  never fits on the screen and the section stayed at `opacity: 0` - hiding the cards
  inside it, already revealed - until the visitor scrolled. Past ten screens tall the
  share is unreachable and the section would never appear. The `8%` `rootMargin` is what
  starts the fade just before the element scrolls in.
- **Do not import a stylesheet that covers the world for two elements.** The picker in
  `src/components/LanguagePicker.astro` draws one of two flags, and `flag-icons` ships a
  rule per country - about 250 of them, most carrying a base64 copy of the flag. Imported
  globally it resolved to 421 KB of CSS, which every page then carried: `/` weighed
  563 KB, 421 KB of it flags for countries the site cannot be read in. The two files it
  needs live in `src/images/flags` and the rules are in the component. The e2e case *the
  language picker draws its own flag* fails if a page carries a flag rule for a language
  the picker does not link to.
- **The stylesheet is a file, not a copy in every page.** `build.inlineStylesheets:
  'auto'` in `astro.config.mjs` keeps Astro's default: small sheets are inlined, big ones
  are written to `/_astro/`. Tailwind's output is about 100 KB, and inlined it was re-sent
  with every page and re-parsed on every client-side navigation; as a file it is fetched
  once (16 KB gzipped) and served from cache with `max-age=31536000, immutable`. With the
  flags gone and the sheet out of the markup, `/` is 37 KB of HTML (from 47 KB before the
  command palette became a file, and 563 KB before the flags went), and one 100 KB stylesheet
  on a first visit - the HTML alone afterwards.
- The markup of a page is 30-50 KB, so a page that is much larger than that is carrying
  something that is not its content - the flags above were 421 KB of it. Requesting `/`
  from a running build is the quickest way to see where a page stands.
- **Links are fetched on hover, before they are clicked** (`prefetch` in `astro.config.mjs`).
  Every page is rendered per request, so without it a click waits for a render and a round
  trip before the document starts to arrive. `prefetchAll` with the `hover` strategy fetches
  the page behind the link the pointer rests on; a touch pointer is left to the normal
  navigation. A prefetch is not a visit, so `src/middleware.ts` skips the language cookie for
  one - the e2e case *a hovered link is fetched before it is clicked, and changes nothing*
  holds both ends of that.
- **Apache sends the pages Brotli-compressed where the browser can read it.** The deploy's
  virtual host adds the filter and enables `mod_brotli` when the host has the module, and
  `SetEnvIfExpr` takes mod_deflate out of a request whose client accepts `br` - that filter is
  registered first and would otherwise answer with gzip. `/` is 9368 bytes over the wire
  against gzip's 9900, and `/search-index.json`, which the stock gzip configuration does not
  cover at all, is 9340 against 29467. A filter matches a response by its media type, so the
  list has to name the one that is sent: it carried `application/javascript` and not the
  `text/javascript; charset=utf-8` the Node adapter answers a bundled script with, so the
  scripts of every page went out uncompressed to every browser - 21 KB of script source on `/`,
  12 KiB of it under *Enable text compression* in a PageSpeed run - while a client that offers
  only gzip still got a compressed file, because `no-gzip` takes the gzip filter out of exactly
  the requests that offer `br`. The virtual host is not the only carrier: the deploy also writes
  the block to `/etc/apache2/conf-available/hypernova-compression.conf` and enables it with
  `a2enconf`, so the `:443` virtual host certbot wrote on the first deploy reads the list of the
  day even though the deploy never writes that host again while a certificate exists. That copy
  sits inside `<Location />` because a block at server scope is not enough there: mod_filter
  merges the filter list of a virtual host with the server-scope one by the name of the filter
  they each register, so the older list in that host wins for the types it names. Measured on a
  host configured as a frozen `:443` copy - the old list in the vhost, the new one at server
  scope - a script still went out as 488 bytes against Brotli's 269, exactly as if that second
  block were not there; the same block inside `<Location />` merged as the filter config of a
  directory, which is added after the host's own list, and sent 269. Two copies still compress
  once, not twice: every response decoded to exactly the identity bytes of the file (36108,
  96463, 488, 29467), which is what the merge by filter name buys.
  `tests/unit/apache-compression.test.ts` fails if a type a page is made of, the `mod_brotli`
  guard or the `no-gzip` line goes missing, if the two copies drift apart, or if the
  server-scope one loses its `<Location />` or is left enabled after Apache rejects it.
- **HTTP/2 is what keeps the requests of a page off a queue.** HTTP/1.1 opens six connections
  per origin and `/` makes fourteen requests on one origin (the document, the stylesheet, three
  fonts, eight scripts, one image), so the ones over the limit wait for a connection before
  they can even be sent - the 985 ms chain document → page.js → index.js a PageSpeed run drew
  was made of that. `configure_apache` enables `mod_http2` when the host has it (`apache2`
  carries it on Debian and Ubuntu), and the `Protocols h2 h2c http/1.1` that selects the
  protocol is written by the deploy in both places the directive can stand. At server scope:
  `conf-available/hypernova-protocols.conf`, guarded by `<IfModule mod_http2.c>` and taken back
  if Apache rejects it, so a host whose package file names no protocol any more still serves
  h2. Measured on this platform, the *first* file that names the directive at that scope is the
  one that counts - `mods-enabled` is included before `conf-enabled`, and the package's list won
  over the deploy's - so the copy is read only where the files before it name nothing, and it
  never narrows a list one of them set. Inside the `:443` virtual host certbot wrote on the
  first deploy: a `Protocols` line *there* replaces the server-scope list
  instead of adding to it, so a list that host carries of its own is what every browser gets,
  and a host carrying `Protocols h2c` offers no `h2` at all. That was the state of the
  production server when this was measured - `:80` answered an h2c upgrade while `:443`
  negotiated no ALPN, HTTP/1.1 for every browser, with Brotli already live on that same host and
  the rest of the response coming from the same virtual host. `repair_tls_vhost_protocols` reads
  certbot's file and writes it only when it carries a `Protocols` line or the deploy's marker,
  replacing either in place with the marked block `tls_vhost_protocols_block` prints; every
  other line of that file comes out byte for byte, and a file that already carries the block
  produces no write at all (`write_config` compares the text first), so a second deploy of the
  same host rewrites nothing.
  Before this the run reported *15 requests not served via HTTP/2* and 460 ms under *Use HTTP/2
  for faster loading*. Measured on one machine, the same build behind three Apache virtual hosts
  that differ only in these directives, three mobile runs each: as the deploy wrote it before, 98
  with first contentful paint at 1.6 s; the compression fix on its own, still over HTTP/1.1, 99
  and 1.4 s; both, 100 and 0.9 s, with the eight scripts of `/` at 9424 bytes over the wire
  against 27210. Both changes are needed, and the second one is worth its 2.7 KB of headers
  alone: HPACK compresses them, where HTTP/1.1 sends about 350 bytes of them with every response.
  `tests/unit/apache-http2.test.ts` holds the enabling, the server-scope copy with its guard and
  its rollback, the replacement of a list the `:443` host carries of its own, and that running
  the repair again writes nothing.
- **Images are resized and re-encoded at the size they are drawn.** `astro.config.mjs` uses
  the default image service (sharp, already a dependency) instead of the
  `passthroughImageService()` it had, which answered every request with the original file: the
  navbar logo drew at 32px from its 1024x1024 source (39 KB), the phone screenshot was the
  whole 1320x2868 capture (253 KB) on every viewport, and a 365x500 product photo was the
  1159x1536 capture (391 KB, `content-type: image/undefined`). The markup now carries the
  widths each frame can use and the service answers with WebP: 696 B for the logo, 28-43 KB for
  the phone screenshot, 14-43 KB for the product photos. WebP rather than AVIF because these
  pages are rendered per request, so the service has no cache between visitors: the 990px
  capture encodes to WebP in 224ms and 43 KB, and to AVIF in 3.7s and 26 KB - a first visitor
  would wait seconds for the last 17 KB. AVIF is worth adding once those files are generated at
  build time instead. The cases *the screenshot is served at the size it is drawn* and *the
  logo is served at the size it is drawn* fail if a full-size file comes back.
- **Fonts: the latin subset only, and preloaded** (`fonts` in `astro.config.mjs`). The
  @fontsource packages declared a face per subset - cyrillic, cyrillic-ext, greek, greek-ext,
  vietnamese, latin-ext - and every one of those declarations was part of every page. The text
  of this site needs the latin range and nothing else (scanning `src/` for non-ASCII characters
  finds ä, ö and the punctuation of U+2000-206F). Both variable fonts live in
  `src/assets/fonts`, copied from those packages so a build needs no network, and Astro emits
  the @font-face rules - with an Arial-based metric-adjusted fallback, which is what keeps the
  text from reflowing when the real file lands - together with the `--font-inter` and
  `--font-space-grotesk` variables `src/styles/global.css` sets its families from. The two text
  faces are preloaded whole (Inter 48 KB, Space Grotesk 22 KB) by `src/layouts/BaseLayout.astro`,
  and the wordmark's own face is preloaded by the navbar that draws it - as the subset below,
  not as the 24 KB face it is cut from.
- **The brand face is a subset of the wordmark's characters** (`npm run font:subset`,
  `scripts/subset-brand-font.sh`). The face is only ever used for the `.brand-font` spans, which
  set the nine letters of the brand name, so the file that ships - `src/assets/fonts/ocra.woff2` -
  is cut down to exactly `hypernovaHYPERNOVA`: 24 KB becomes 1.7 KB, and the whole face
  (`ocr-a-full.woff2`) is in no build. Re-run the command whenever the wordmark copy changes, and
  extend the script's `characters` if the face is ever used for something else:
  `tests/unit/brand-font.test.ts` fails if the subset stops covering `BRAND_NAME`, if it stops
  being smaller than the face it is cut from, or if the face itself loses its latin range.
- **The command palette is a file, not a script in every page.** `CommandPalette.astro` used
  `is:inline` with `define:vars`, which wrote its 11.7 KB of code into every document that has a
  palette - parsed again on every load and re-sent with every page - because an inline script
  cannot be bundled or cached. It is a bundled script now: the base path and the localized "no
  results" message come from `data-` attributes on the palette element (one file serves both
  languages), the file is fetched once with the rest of the client JavaScript (5.4 KB, against
  11.7 KB in every document before) and cached by its hash, and
  `tests/unit/command-palette-bundle.test.ts` fails if it becomes inline code again.
  A bundled script is loaded once per document, so it binds the palette element again on
  `astro:page-load` and republishes `window.toggleCommandPalette` for the navbar buttons - the
  e2e case *the palette is a file of its own and survives a client-side navigation* walks that
  path.
- **Only the picture a page paints first is fetched up front.** Every `<img>` states its
  `loading` (an image without it is fetched the moment the parser reaches it, which is how the
  LCP file ended up behind the whole document), and one file per page carries
  `fetchpriority="high"`: the Koha logo on `/koha/` and the first frame of the product gallery on
  `/lainuri-checkout-machine/`. Both are what a phone paints first on those pages. `/` and the
  other pages prioritise nothing, because the element they paint first is text; that is also why
  the staff-interface screenshot on `/koha-hosting/` is `lazy` - it used to be `eager` with
  `fetchpriority="high"`, which put a screenshot that sits under a heading ahead of the heading.
  The e2e case *only the picture the first paint waits for is fetched up front* records the count
  of eager images per page and which one leads.
- **The static files get their response headers from the virtual host**
  (`caching_directives()` in `scripts/deploy/install.sh`). The Node adapter answers everything it
  serves itself with `Cache-Control: public, max-age=0`, which is what the HTML wants - a page is
  rendered per request and must be revalidated - and wrong for the two groups of files that do
  not change: the content-hashed files under `/_astro/` (stylesheet, client JavaScript, fonts,
  optimized images) never change under one name, and the files in `public/` (favicons,
  `og-image.png`, `authors/`) are asked for on every document load. Apache adds
  `max-age=31536000, immutable` for the first group and `max-age=3600` for the second, replacing
  the adapter's header rather than sending a second `Cache-Control` (`Header unset` first: a
  response with two of them is one a cache may ignore). `/_image/` needs nothing, because it
  already answers with a year and an ETag. `tests/unit/apache-caching.test.ts` renders both
  virtual hosts from the script - it only prints them - and fails if the policy, the order of the
  directives or the `mod_headers` guard goes missing.
- **Nothing is fetched from another origin.** The testimonial avatars were three
  `i.pravatar.cc` URLs - the only third party the site talked to, announcing the visitor to a
  service that picked a face at random - and they are initials drawn in the markup now; a real
  photo belongs in `src/images/` and goes through `<Image>` like every other picture.
  `tests/unit/no-third-party-images.test.ts` reads every `.astro` file for an avatar host and the
  image config for `domains`/`remotePatterns`, and the e2e case *no page fetches a file from
  another origin* checks the `src`/`srcset`/`href` of every picture, script and stylesheet on the
  five heaviest pages, plus every `url()` inside the stylesheets.
- Check changes with `npm run bench:scroll` against a running server.

## Security

Every response carries a Content Security Policy (the header, not a `<meta>` element: each route
is rendered per request), configured under `security.csp` in `astro.config.mjs`:

- **No `'unsafe-inline'`.** The scripts and styles a page needs are listed by their SHA-256 hash,
  so an injected `<script>` or a `style` attribute has nothing to match and does not run. The one
  inline script written by hand - the theme, which has to run before the body is painted - lives
  in `src/scripts/theme-init.js`; `astro.config.mjs` hashes that file and `BaseLayout.astro`
  inlines the same file with `?raw`, so the code and the hash it is allowed by cannot drift
  apart.
- **No inline style attributes.** The reveal delays are the `reveal-delay-*` classes of
  `src/styles/global.css`, the forms hide their panels with the `hidden` class, and the Koha
  screenshot's reserved box takes its ratios from a `<style>` element whose hash the component
  hands to the policy (`Astro.csp.insertStyleHash`). Shiki is out for the same reason - it writes
  its colours as `style` attributes - and `markdown.syntaxHighlight` is Prism, which writes
  classes; a Prism theme stylesheet in `src/styles/global.css` gives the tokens colours whenever
  a post needs them.
- **No inline event handlers either.** `onclick="..."` is JavaScript, and what allows a handler is
  `'unsafe-inline'` or `'unsafe-hashes'` - the policy carries neither, and `'unsafe-hashes'` would
  allow the attribute value on *any* element, not on the one that was hashed. A control therefore
  carries a `data-` attribute and a script file binds it: the bar's two search buttons carry
  `data-search-trigger` and the palette listens for the click
  (`src/components/CommandPalette.astro`), next to Ctrl+K. `tests/unit/no-inline-event-handlers.test.ts`
  reads every `.astro` file for a handler, because the dev server sends no policy at all and a
  browser refuses one silently - the search button that did nothing being what the test was
  written after.
- **Trusted Types** (`require-trusted-types-for 'script'`) are on, with two policies: the palette
  (`hypernova-palette`, the one place markup is built from data, with everything in it escaped)
  and `default`, which Astro's view transition router needs because it re-creates the scripts of
  the page it swapped in by assigning `script.innerHTML`. Both are pass-throughs, so an injected
  string still has to match a hash in `script-src` before it runs.
- **No inline module scripts.** Vite's `assetsInlineLimit` is `0`, so every bundled script is a
  file under `/_astro/`: with an inline module in the document, the router appends
  `<script src="data:application/javascript,">` to the body on every client-side navigation -
  a script the policy refuses.

HSTS, COOP, X-Frame-Options, nosniff and Referrer-Policy are the virtual host's rather than the
app's (`security_directives()` in `scripts/deploy/install.sh`); `frame-ancestors 'none'` in the
policy covers the browsers that ignore X-Frame-Options.
`tests/unit/apache-security-headers.test.ts` renders both virtual hosts the script can write and
fails if any of the five goes missing.

Check a running deployment with:

    node scripts/verify-security-headers.mjs                         # every page of the sitemap
    node scripts/verify-security-headers.mjs http://127.0.0.1:4399    # a local `npm start`
    node scripts/verify-security-headers.mjs --require-headers URL    # also require HSTS/COOP/...

It hashes every inline script and style of every page against the policy that page was served
with, flags `style` attributes and `data:` or cross-origin scripts, and reports the transport
headers the virtual host adds.

## Legal documents

The privacy policy and the terms of service are structured, bilingual content in
`src/legal/`, rendered by `src/components/LegalDocument.astro`:

- `src/legal/privacy-policy.ts` - GDPR (2016/679) and the Finnish Data Protection Act (1050/2018)
- `src/legal/terms-of-service.ts` - website terms of use only. Terms for individual
  services (Koha cloud hosting, Toveri, Lainuri, consulting) are maintained in the
  separate agreement, order confirmation and service description for each service.

Both language versions live in the same file. When you change wording, update the English
(`gb`) and Finnish (`fi`) text together, bump `version` and `updated`, and have the change
reviewed before publishing.

## Deployment

The site is server-rendered and runs as a systemd service behind Apache on the Hypernova
servers. `scripts/deploy/install.sh` sets that up on a fresh Debian or Ubuntu host in one
command: it installs the packages, creates the service account, copies the code, writes
`.env`, builds, installs the unit and the virtual host, requests a Let's Encrypt
certificate and verifies the running site.

```bash
sudo bash scripts/deploy/install.sh                       # www.hypernova.fi, 127.0.0.1:4321
sudo bash scripts/deploy/install.sh --domain staging.example.com --no-tls
scripts/deploy/install.sh --dry-run                       # print the changes, make none
```

Every step is idempotent, so the same command deploys the next version: it syncs the code
into `--dir`, reinstalls the dependencies, rebuilds, restarts `hypernova.service` and runs
the checks again. The default source is the checkout this script lives in, because the site
lives on the `hypernova.fi` branch of this repository while `origin/master` is still the
upstream Zenix theme - run the script from an up-to-date checkout. To let the server pull
its own updates, point it at a git remote whose branch holds the site instead:

```bash
sudo bash scripts/deploy/install.sh \
  --repo https://github.com/Hypernova-Oy/www.hypernova.fi.git --branch hypernova.fi
```

The branch must exist on that remote (a run stops with a clear message when it does not) and
the service account needs read access to it - a public URL, or a deploy key in its home
directory. `origin` carries `master` only so far, so pushing the site branch there once is
what turns the flow on. Later runs fetch and hard-reset `--dir` to that branch, so that
command is also the update command. Add `--auto-update` to have the server run that command
by itself (see below).

Copying the checkout leaves its `.git`, `node_modules`, `dist` and `.env` behind: the server
keeps the `.env` it was given, and the build it produces, across deploys.

| Option | Default | Effect |
| --- | --- | --- |
| `-d, --domain` | `www.hypernova.fi` | Public hostname: the canonical one (`ServerName`, certificate, canonical links). The same name with `www`, or without it, redirects to it |
| `-p, --port`, `--host` | `4321`, `127.0.0.1` | Where the Node process listens |
| `-s, --service` | `hypernova` | systemd unit, `/etc/apache2/sites-available/<name>.conf` and `/etc/apache2/conf-available/<name>-compression.conf` |
| `-u, --user`, `--dir` | `hypernova`, `/opt/hypernova/app` | Service account and the checkout it owns |
| `-r, --repo`, `-b, --branch` | this checkout | Git remote and branch to deploy |
| `--source` | this checkout | Tree to copy into `--dir` |
| `-e, --env-file`, `-m, --email` | generated, none | Seed `.env` from a file; Let's Encrypt account for expiry mail |
| `--no-packages`, `--no-apache`, `--no-tls`, `--dry-run` | - | Skip or rehearse parts of the run |
| `--behind-proxy` | - | A proxy that ends TLS sits in front: serve plain HTTP, no certificate, no listener on `443`, keep that proxy's `X-Forwarded-*` chain |
| `--auto-update`, `--auto-update-every` | off, `5` minutes | A cron job on the server repeats the same command and deploys the commits it finds on `--branch` |

Every option also has a `HYPERNOVA_*` environment variable (see `--help`).

The service account owns `--dir` with owner-only permissions, because `.env` is read while
`npm run build` runs: the Redmine endpoint and project ids are baked into the server chunks,
so the built bundle must not be world-readable. Keep `FORM_TOKEN_SECRET` stable across
restarts and deploys so forms that are already open stay valid, and re-run the script after
editing `.env` - the running service keeps the values it was built with.

`--domain` reaches the bundle as `HYPERNOVA_SITE_URL`, which becomes the build's `site`: it is
the address a deployment declares, and the one the redirect of its second name names. It is not
where the canonical links, robots.txt and the sitemap come from - those are built from `SITE_URL`
in `src/config.ts`, a literal that names the production address, so a deployment under a name of
its own carries production's canonical links. The script also sets `HYPERNOVA_ALLOWED_HOSTS` to
the domain and its `www` twin.
That list is what the **dev and preview servers** accept as a `Host` (Vite's host check,
`server.allowedHosts` in `astro.config.mjs`; without it a development machine reached through
a container or LAN name gets `403 Blocked request`). The built server that the deployment runs
refuses nothing by name - Apache decides which name reaches it - and it answers the one name
that is not the address of the site with the same redirect the virtual host sends
(`src/utils/canonical-host.ts`). The two halves matter because a request does not always arrive
through the virtual host this script writes: the `:443` host `certbot` created once keeps its
own copy of the directives, and the deploy does not rewrite that file while the certificate is
there - the one line it does replace in it is a `Protocols` list that host carries of its own,
which would otherwise leave every browser on HTTP/1.1 (the HTTP/2 bullet above). Both are
checked at the end of a run.

The two names of a deployment are not two sites. The certificate covers both, and every request
that arrives under the other one is answered with a permanent redirect to `--domain`:
`hypernova.fi/koha-hosting/?page=2` reaches `https://www.hypernova.fi/koha-hosting/?page=2`,
path and query kept. The address the redirect names is the one the deployment declares
(`HYPERNOVA_SITE_URL`, above): `https://` wherever a browser reaches this host over TLS - the
certificate, or the proxy in front of `--behind-proxy` - and `http://` on a host that serves
plain HTTP with nothing in front (`--no-tls` without `--behind-proxy`), where a redirect to
`https://` would name a port nothing listens on. Only `--domain` is the name of the site, so a
crawler that follows a link to the other one lands on the page it meant and not on another host's
copy of it. A certificate renewal is the exception: `/.well-known/acme-challenge/` is answered on
either name, without a redirect in front of it. The deploy checks both halves of the redirect on
the host it has just written.

Apache gets `ProxyPreserveHost On` (the forms compare the request host) and `retry=0` on the
proxy, so a stopped service fails fast instead of hanging. The `:80` redirect, `mod_ssl` and
the certificate come from `certbot --apache`, which the script re-runs on every deploy.
Without `--email` no expiry warnings are sent, and while the names do not resolve yet the
site stays on plain HTTP with a warning instead of failing. In the mode below, none of that
happens: this host gets no certificate and does not listen on `443`.

Check the result at any time:

```bash
sudo systemctl status hypernova
sudo journalctl -u hypernova -n 50
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/
```

The deploy ends by checking that the unit - not a leftover dev server - is what answers on
`--port`, that the homepage renders in both languages, that a legacy URL redirects with `301`,
that `/search-index.json` carries page text for every entry, that Apache proxies the domain to
the process and moves the other name of the domain to it, and that a form submission posted the
way a browser posts it (with `Origin: https://<domain>`) is rendered instead of refused. A port
that something else holds fails the run, instead of reporting a green deploy while another
process serves its own pages.

### Behind a proxy that ends TLS

Run the script with `--behind-proxy` when another machine terminates TLS for this one:

```bash
sudo bash scripts/deploy/install.sh --behind-proxy
```

This host then serves plain, unencrypted HTTP and owns no certificate. The script skips
certbot, does not enable `mod_ssl`, disables it if an earlier deploy had enabled it, and
leaves the virtual host on port `80` with no redirect to HTTPS. The module matters because
Debian's `ports.conf` puts its `Listen 443` inside `<IfModule ssl_module>`: with `mod_ssl`
gone, Apache has no listener on `443` at all. Point the proxy at `127.0.0.1:80` - or at
`--host`:`--port` with `--no-apache`.

Two things the proxy has to do:

  * pass the visitor's address on in `X-Forwarded-For`, with its own address last, because the
    rate limit counts the last hop;
  * keep that hop private: anyone who can reach the target directly can send an
    `X-Forwarded-For` of their own and step around the rate limit.

The mode also tells Apache to keep the `X-Forwarded-For` chain the proxy sent
(`ProxyAddHeaders Off`). On its own, mod_proxy appends a hop of its own, which behind an edge
is that edge's address for every visitor: one bucket for the whole internet, and the sixth
submission from anyone would be refused. The checks at the end of a proxy-mode run send the
headers such a proxy adds, so what they verify is the path visitors take.

A certificate or a certbot that an earlier run left on this host is no longer served. Nothing
renews it while the site is in this mode, so stop the timer too unless another site on the
host uses it: `sudo systemctl disable --now certbot.timer`.

### Following the branch on its own

`--auto-update` leaves the server to deploy the branch by itself:

```bash
sudo bash scripts/deploy/install.sh --behind-proxy --auto-update \
  --repo https://github.com/Hypernova-Oy/www.hypernova.fi.git --branch hypernova.fi
```

A cron job in `/etc/cron.d/<unit>-auto-update` then runs the same installer every five minutes
(`--auto-update-every MINUTES`, 1-59; the package `cron` is installed and started if it is
missing). The job carries the flags of the run that installed it, so an automatic deploy is
the same deploy as a manual one - same `--dir`, same unit, same `--behind-proxy` - and it adds
`--if-changed` and `--no-packages`, so an unattended run never stops to install packages.

Each run first asks the remote for the branch. While that still points at the revision in
`--dir`, the run stops right there and changes nothing; otherwise it updates the code,
reinstalls the dependencies, rebuilds, restarts the unit and runs the checks, exactly as a
manual run does. `/etc/cron.d/<unit>-auto-update` is written again by every later run, so
`--auto-update-every`, `--branch` and the like are changed by re-running the installer.

An unattended run must not leave a revision that does not work answering the domain. When the
build fails, or when any of the checks fails, the run puts back the revision that was live
before the pull, builds it and restarts the unit, and says so in the log. That run ends as a
failure rather than as a success, so the journal shows the difference between a deploy that
happened and one that was undone. The next run of the job tries again, so a fixed commit is
deployed without anyone touching the server; a remote that cannot be reached is not read as
"nothing to deploy" either - such a run stops with a warning and leaves the checkout alone.

What the job did is in the journal, tagged per unit, and it stops in two ways:

```bash
sudo journalctl -t hypernova-auto-update -n 50
sudo bash scripts/deploy/install.sh ... --no-auto-update   # also removes the job
sudo rm /etc/cron.d/hypernova-auto-update                  # the same, without a re-run
```

Two things to keep in mind:

  * the fetch runs as the service account, so a private remote needs a deploy key in that
    account's home directory (`--user`, `--home`); a public URL needs nothing;
  * only what is committed and pushed to the branch is deployed - the pull overwrites local
    edits in `--dir`, so make changes in a checkout and push them.

This needs the git flow, because the job has to know what the remote holds. A `--dir` that was
filled by copying a checkout (the default flow) is turned into a clone of the branch by the
first run that uses `--repo`/`--branch`: git refuses to clone into a directory that is not
empty, so such a directory is initialized, fetched and hard-reset instead. `.env`,
`node_modules` and the built bundle are ignored by git and survive that, and the service is
rebuilt and restarted from the branch in the same run.

### Without the script

For another platform, or to see what the script does, build and run the site as a
long-lived Node process:

```bash
npm ci
npm run build          # emits dist/client and dist/server
HOST=127.0.0.1 PORT=4321 npm start
```

The Node entry respects the `HOST` and `PORT` environment variables, and Apache proxies the
domain to that process (mod_proxy + mod_ssl), including the legacy redirects that Astro
answers itself:

```apache
<VirtualHost *:443>
  ServerName www.hypernova.fi
  ServerAlias hypernova.fi
  # the name that is not the canonical one moves to it, path and query kept
  RewriteEngine On
  RewriteCond %{HTTP_HOST} ^hypernova\.fi(:[0-9]+)?$ [NC]
  RewriteRule ^ https://www.hypernova.fi%{REQUEST_URI} [R=301,L]
  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:4321/ retry=0
  ProxyPassReverse / http://127.0.0.1:4321/
</VirtualHost>
```

Pass `HOST`/`PORT` to the process (the generated unit does): `/search-index.json` renders each
page over `http://127.0.0.1:$PORT` to fill the searchable text.

### Refreshing the search index

`/search-index.json` (the data behind the command palette) is generated per request from the
running bundle, so nothing is cached and nothing has to be purged: new content shows up once
the service runs the new build. `scripts/refresh-search-index.sh` builds, restarts and verifies
in one step, and is meant to run on the server that serves the site (it is also available as
`npm run index:refresh -- <options>`):

```bash
scripts/refresh-search-index.sh                        # build, restart, verify
scripts/refresh-search-index.sh --url https://www.hypernova.fi --service hypernova
scripts/refresh-search-index.sh --restart "sudo systemctl restart hypernova"
scripts/refresh-search-index.sh --no-build --no-restart   # only compare, change nothing
```

It starts the bundle just built on a spare port (`--probe-port`, default 4399) and compares
`/search-index.json` for English and Finnish against the live URL. Every entry must carry
`slug`, `title`, `description`, `keywords`, `content` and `type`, slugs must be unique, and
the live payload must be identical to the fresh build for both languages. A service that was
not restarted - or that still runs an older bundle - fails the run with the differing entry
named, instead of silently serving a stale index. `Cache-Control: private, no-cache` and
`Vary: Cookie` are reported as notes when the live headers drift from what the README
describes. Exit status: `0` the live index matches the new build, `1` it does not, `2` the
arguments or the environment are wrong.

Both the live server and the probe server read the pages of the site themselves to fill
`content` (once per process and language), so a run that reports a missing `content` means
the pages could not be rendered - check the service log for the lines
`Search index: no text for <path>`.

## Contributing and Collaboration

We welcome contributions and collaboration! Whether you want to fix a bug, add a new feature, or improve documentation, your help is greatly appreciated. 

To contribute:
1. Fork the repository.
2. Create a new branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'feat: add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

If you have an idea for a major change or a new feature, please open an issue first to discuss it with the maintainers. We are also open to collaborations on expanding Zenix for different use cases! Let's build something awesome together.

## License

MIT. The site started from the [Zenix](https://github.com/farrosfr/zenix) Astro theme
by farrosfr.

