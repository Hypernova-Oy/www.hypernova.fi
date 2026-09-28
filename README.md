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
npm run test:unit   # Node's built-in test runner (form protection logic)
npm run test:e2e    # Playwright regression tests
npm run bench:scroll # Chromium scroll-smoothness benchmark (needs a running server)
npm run index:refresh # Build, restart the site and verify the search index (see Deployment)
npm run og:image    # Regenerate the social preview card (public/og-image.png)
```

Playwright needs browsers installed once:

```bash
npx playwright install chromium
```

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
  globally it resolved to 421 KB, and `build.inlineStylesheets: 'always'` pasted that into
  every page: `/` weighed 563 KB, 421 KB of it flags for countries the site cannot be read
  in. The two files it needs live in `src/images/flags` and the rules are in the
  component, which puts those pages at 147 KB (29 KB gzipped, from 115 KB). The e2e case
  *the language picker draws its own flag* fails if a page carries a flag rule for a
  language the picker does not link to.
- The markup of a page is 30-50 KB, so a page that is much larger than that is carrying
  something that is not its content - the flags above were 421 KB of it. Requesting `/`
  from a running build is the quickest way to see where a page stands.
- Check changes with `npm run bench:scroll` against a running server.

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
| `-d, --domain` | `www.hypernova.fi` | Public hostname (`ServerName`, certificate) |
| `-p, --port`, `--host` | `4321`, `127.0.0.1` | Where the Node process listens |
| `-s, --service` | `hypernova` | systemd unit and `/etc/apache2/sites-available/<name>.conf` |
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

`--domain` reaches the bundle as `HYPERNOVA_SITE_URL`, which becomes the build's `site`:
canonical links and the sitemap then point at the domain that is being deployed, not at
production. The script also sets `HYPERNOVA_ALLOWED_HOSTS` to the domain and its `www` twin.
That list is what the **dev and preview servers** accept as a `Host` (Vite's host check,
`server.allowedHosts` in `astro.config.mjs`; without it a development machine reached through
a container or LAN name gets `403 Blocked request`). The built server that the deployment
runs does not look at the `Host` header, so what answers on a name is decided by Apache and
the certificate.

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
that `/search-index.json` carries page text for every entry, that Apache proxies the domain
to the process, and that a form submission posted the way a browser posts it (with
`Origin: https://<domain>`) is rendered instead of refused. A port that something else holds
fails the run, instead of reporting a green deploy while another process serves its own pages.

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

