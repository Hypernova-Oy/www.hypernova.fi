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

Legacy URLs are redirected in `astro.config.mjs` (for example
`/lainuri-self-checkout-machine/` → `/lainuri-checkout-machine/`).

## Search (command palette)

The navbar search button and `Ctrl`/`Cmd` + `K` open the shared palette component
(`src/components/CommandPalette.astro`). It fetches `/search-index.json` once per
language and matches every word of the query against the title, the description and
the hidden `keywords` of an entry.

`src/pages/search-index.json.ts` builds the index:

- the static pages (home, services, Koha, Koha hosting, Lainuri, Toveri, contact,
  privacy, terms) with localized titles/descriptions, so results follow the visitor's
  language;
- `keywords`, which always holds both languages plus extra terms (for example
  `kirjasto`, `hosting`, `kulunvalvonta`), so a search matches in either language;
- `/blog/` and `/changelog/` plus their entries, but only once they have published
  (non-draft) content.

Because the payload depends on the language cookie, it is served with
`Cache-Control: private` and `Vary: Cookie` and must not be cached by a shared proxy.
Keep those headers when adding entries, and keep the entry shape
(`title`, `description`, `keywords`, `slug`, `type`) - the palette renders those fields
and links to `slug` directly.

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

## Forms

`/koha/` and `/contact/` POST back to themselves. Validation errors are rendered
inline, successful submissions create a Redmine issue and show a thank-you message.

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
  the proxy has to append the real client address (mod_proxy does this by default).
- **Cross-site and content checks** - `Sec-Fetch-Site`/`Origin` must belong to us, and
  free text may not contain control characters, HTML/BBCode markup or more than 4 links.
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

- **No `backdrop-filter`** on the sticky header or on `.glass-panel`. A permanent
  backdrop blur over scrolling content re-blurs it every frame (removing it took the
  homepage from ~27ms to ~17ms median frame time).
- **No `mix-blend-mode` on large decorative layers** and no infinite animations on
  blurred layers - they force full-page re-compositing while scrolling.
- **`.reveal-on-scroll` must stay compositor-driven**: `translate3d()` plus
  `will-change` (released by `.reveal-done` once the fade ends). A plain
  `translateY()` transition repaints the element every frame (~1459 raster tasks per
  scroll pass vs ~173 with promotion).
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

The site is server-rendered and is deployed behind Apache on the Hypernova servers.
Build and run it as a long-lived Node process:

```bash
npm ci
npm run build          # emits dist/client and dist/server
HOST=127.0.0.1 PORT=4321 npm start
```

`.env` is read while `npm run build` runs - the Redmine endpoint and project ids are
baked into the server chunks - so build on the machine (or with the values) that the
deployment uses, and keep `FORM_TOKEN_SECRET` stable across restarts and deploys so
open forms stay valid.

The Node entry respects the `HOST` and `PORT` environment variables. Apache then
proxies the domain to that process (mod_proxy + mod_ssl), including the legacy
redirects that Astro answers itself:

```apache
<VirtualHost *:443>
  ServerName www.hypernova.fi
  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:4321/
  ProxyPassReverse / http://127.0.0.1:4321/
</VirtualHost>
```

Keep the Redmine environment variables available to the service (for example in an
`EnvironmentFile`) so the forms can create issues in production.

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

