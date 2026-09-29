import { createHash } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';

/** Matches THEME_KEY in the theme script in BaseLayout.astro and the Navbar toggle. */
const THEME_KEY = 'hypernova-theme';

async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((stored) => localStorage.setItem(stored.key, stored.theme), {
    key: THEME_KEY,
    theme,
  });
}

/**
 * Submits a form directly, bypassing the browser's native HTML5 validation
 * (the required attributes) so the server-rendered messages can be asserted.
 */
async function postForm(form: Locator) {
  await form.evaluate((el) => (el as HTMLFormElement).submit());
}

test.describe('public pages', () => {
  const pages = [
    { path: '/', heading: 'Free & Open Source Software.' },
    { path: '/services/', heading: 'Our Services' },
    { path: '/koha/', heading: 'Open source library system' },
    { path: '/koha-hosting/', heading: 'Koha Cloud Hosting Service' },
    { path: '/toveri-access-control-device/', heading: 'Toveri Access Control Device' },
    { path: '/lainuri-checkout-machine/', heading: 'Lainuri Checkout Machine' },
    { path: '/contact/', heading: 'Contact us' },
    { path: '/privacy/', heading: 'Privacy Policy' },
    { path: '/terms/', heading: 'Terms of Service' },
    { path: '/blog/', heading: 'Hypernova Blog' },
    { path: '/changelog/', heading: 'Changelog' },
  ];

  for (const { path, heading } of pages) {
    test(`${path} renders with its heading`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole('heading', { name: heading, exact: false }).first()).toBeVisible();
      // The dev server injects its own <header> elements (Astro dev toolbar), so
      // scope to the layout banner/footer instead of every header on the page.
      await expect(page.locator('body > header').first()).toBeVisible();
      await expect(page.locator('body > footer').first()).toBeVisible();
    });
  }

  // The URLs the previous site served, and where each of them lands now. Astro answers
  // every one of them with a permanent redirect (the `redirects` block in astro.config.mjs).
  const legacyRedirects: Array<{ from: string; to: string }> = [
    { from: '/lainuri-self-checkout-machine/', to: '/lainuri-checkout-machine/' },
    { from: '/privacy-policy/', to: '/privacy/' },
    { from: '/koha-hosting-quote/', to: '/koha/#request-a-quote' },
    { from: '/fi/', to: '/?l=fi' },
    { from: '/fi/koha/', to: '/koha/?l=fi' },
    { from: '/fi/koha-yllapitopalvelu/', to: '/koha/?l=fi#cloud-hosting-service' },
    { from: '/fi/koha-yllapito-tarjouspyynto/', to: '/koha/?l=fi#request-a-quote' },
    { from: '/fi/lainuri-lainausautomaatti/', to: '/lainuri-checkout-machine/?l=fi' },
    { from: '/fi/ota-yhteytta/', to: '/contact/?l=fi' },
    { from: '/fi/tietosuojaseloste/', to: '/privacy/?l=fi' },
    { from: '/fi/toveri-kulunvalvontalaite/', to: '/toveri-access-control-device/?l=fi' },
    { from: '/fi/yhteystiedot/', to: '/contact/?l=fi' },
  ];

  for (const { from, to } of legacyRedirects) {
    test(`legacy URL ${from} redirects to ${to}`, async ({ page }) => {
      const response = await page.goto(from);
      expect(response?.status()).toBeLessThan(400);

      const landed = new URL(page.url());
      expect(`${landed.pathname}${landed.search}${landed.hash}`).toBe(to);
    });
  }

  test('sitemap and robots point at the Hypernova domain', async ({ page }) => {
    const sitemap = await page.goto('/sitemap.xml');
    expect(sitemap?.ok()).toBe(true);
    await expect(page.locator('body')).toContainText('https://www.hypernova.fi/');
    await expect(page.locator('body')).toContainText('https://www.hypernova.fi/koha-hosting/');
    await expect(page.locator('body')).not.toContainText('lainuri-checkout-machine%20copy');

    const robots = await page.goto('/robots.txt');
    expect(robots?.ok()).toBe(true);
    await expect(page.locator('body')).toContainText('User-agent: *');
    await expect(page.locator('body')).toContainText('Allow: /');
    await expect(page.locator('body')).toContainText('Sitemap: https://www.hypernova.fi/sitemap.xml');
  });

  test('search index lists the site pages with searchable keywords', async ({ page }) => {
    const response = await page.goto('/search-index.json');
    expect(response?.ok()).toBe(true);

    const body = await response!.json();
    expect(Array.isArray(body)).toBe(true);

    const slugs = body.map((entry: { slug: string }) => entry.slug);
    expect(slugs).toContain('/koha-hosting/');
    expect(slugs).toContain('/contact/');

    // The palette renders these fields directly, so they always have to be there.
    for (const entry of body) {
      expect(typeof entry.title).toBe('string');
      expect(entry.title.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe('string');
      expect(entry.keywords).toBeTruthy();
      expect(entry.slug.startsWith('/')).toBe(true);
      // The text of the page itself, not just its one-line description.
      expect(typeof entry.content).toBe('string');
      expect(entry.content.length).toBeGreaterThan(100);
    }
  });

  test('search index follows the requested language', async ({ page }) => {
    type Entry = { slug: string; title: string; keywords: string; content: string };
    const titleFor = (entries: Entry[], slug: string) => entries.find((entry) => entry.slug === slug);

    const english = (await (await page.goto('/search-index.json'))!.json()) as Entry[];
    const finnish = (await (await page.goto('/search-index.json?l=fi'))!.json()) as Entry[];

    expect(titleFor(english, '/koha-hosting/')?.title).toBe('Koha cloud hosting');
    expect(titleFor(finnish, '/koha-hosting/')?.title).toBe('Kohan pilvipalvelu');

    // Keywords keep both languages searchable whichever language is active.
    expect(titleFor(finnish, '/koha-hosting/')?.keywords).toContain('hosting');
    expect(titleFor(english, '/koha-hosting/')?.keywords).toContain('pilvipalvelu');

    // The text of the pages is rendered in the language of the request.
    expect(titleFor(english, '/koha/')?.content).toContain('in the world');
    expect(titleFor(finnish, '/koha/')?.content).toContain('maailman ensimmäinen');
  });

  test('search index carries the Finnish names of the banking rows', async ({ page }) => {
    type Entry = { slug: string; content: string };
    const contentFor = (entries: Entry[], slug: string) =>
      entries.find((entry) => entry.slug === slug)?.content ?? '';

    const english = (await (await page.goto('/search-index.json'))!.json()) as Entry[];
    const finnish = (await (await page.goto('/search-index.json?l=fi'))!.json()) as Entry[];

    // "Tilinumero" (IBAN) and "Pankki" (BIC) stand in the markup of the billing rows, out of
    // sight, so the index reads them as the text of the page: a search for either word finds
    // /contact/ and the snippet of the result shows the code the word stands for. The English
    // payload is read first because `?l=fi` is remembered in the language cookie, so a request
    // without the parameter afterwards would answer in Finnish too.
    expect(contentFor(finnish, '/contact/')).toContain('IBAN Tilinumero FI50 7997 7996 3875 56');
    expect(contentFor(finnish, '/contact/')).toContain('BIC Pankki HOLVFIHH');

    // The English page is not written in Finnish, hidden words included.
    expect(contentFor(english, '/contact/')).not.toContain('Tilinumero');
    expect(contentFor(english, '/contact/')).not.toContain('Pankki');
  });
});

test.describe('head metadata', () => {
  test('the home page advertises the canonical URL and social preview', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.hypernova.fi/');
    await expect(page.locator('link[rel="sitemap"]')).toHaveAttribute('href', '/sitemap.xml');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Open source library systems, hosted and supported | Hypernova',
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'Hypernova');
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://www.hypernova.fi/');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://www.hypernova.fi/og-image.png');
    // The card is composed by scripts/generate-og-image.mjs, so its size is known here and
    // declared to the crawlers alongside the file itself.
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      'content',
      'Hypernova — Cost-effective Open Source Services',
    );
  });

  test('the social preview image is the generated card', async ({ page }) => {
    const card = await page.request.get('/og-image.png');
    expect(card.status()).toBe(200);
    expect(card.headers()['content-type']).toContain('image/png');

    const png = await card.body();
    // PNG signature, then the IHDR chunk: the size is the pair of big-endian 32-bit integers
    // after the chunk header, so the file can be checked without an image library. The card is
    // the Hypernova lockup, not the theme screenshot it used to be, and it is regenerated at
    // this size by scripts/generate-og-image.mjs.
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  test('inner pages get their own canonical and preview URLs', async ({ page }) => {
    await page.goto('/koha-hosting/');

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.hypernova.fi/koha-hosting/');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://www.hypernova.fi/koha-hosting/');
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Hypernova$/);
  });

  /**
   * SHA-256 of the icon served by https://www.hypernova.fi/ (the site it was migrated
   * from). The mark is a raster file, so the hash is what pins "same favicon as
   * production"; updating the icon means updating this expectation on purpose.
   */
  const PRODUCTION_FAVICON_SHA256 = '9174dedddfc895dcd1fa931c740ac45cd1ee9342cea7ea4642b4fae08864bfa2';

  test('the favicon is the Hypernova mark served in production', async ({ page }) => {
    // The raster links now follow the reported scheme, so pin this test to light chrome.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    await expect(page.locator('link[rel="icon"][type="image/png"]')).toHaveAttribute('href', '/favicon.png');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/favicon.png');
    // The Astro starter icon that used to be linked here must not come back: the only
    // SVG icon is the Hypernova mark itself (see the colour-scheme test below).
    await expect(page.locator('link[rel="icon"][href$=".svg"]')).toHaveAttribute('href', '/favicon.svg');

    const png = await page.request.get('/favicon.png');
    expect(png.status()).toBe(200);
    expect(png.headers()['content-type']).toContain('image/png');
    expect(createHash('sha256').update(await png.body()).digest('hex')).toBe(PRODUCTION_FAVICON_SHA256);

    const ico = await page.request.get('/favicon.ico');
    expect(ico.status()).toBe(200);
    const icoBody = await ico.body();
    // A real ICO container (the previous file was a PNG renamed to .ico) holding the
    // 16x16 and 32x32 renditions, so /favicon.ico shows the same mark when requested by name.
    expect([...icoBody.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(icoBody.readUInt16LE(4)).toBe(2);
  });

  /**
   * The tab icon carries one rendition of the mark per colour scheme and picks between
   * them with `prefers-color-scheme`, so the mark stays visible on light and on dark
   * browser chrome. Both renditions are embedded in the one SVG file, and the raster
   * links next to it point at the matching PNG/ICO, because Chromium's tab icon comes
   * from a raster rather than from the theme-aware SVG.
   */
  test('the favicon follows the browser colour scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    // Declared first, and scalable, for the browsers that pick the SVG.
    const icons = page.locator('link[rel~="icon"]');
    await expect(icons).toHaveCount(3);
    await expect(icons.first()).toHaveAttribute('href', '/favicon.svg');
    await expect(icons.first()).toHaveAttribute('type', 'image/svg+xml');
    await expect(icons.first()).toHaveAttribute('sizes', 'any');

    // The rasters declare the light rendition themselves, so a browser without
    // JavaScript (or with `media`-ignoring icon selection) still shows that one.
    const raster = page.locator('#favicon-raster');
    const legacy = page.locator('#favicon-legacy');
    await expect(raster).toHaveAttribute('href', '/favicon.png');
    await expect(legacy).toHaveAttribute('href', '/favicon.ico');

    const svg = await (await page.request.get('/favicon.svg')).text();
    expect(svg).toContain('@media (prefers-color-scheme: dark)');
    // The Astro starter icon that used to live at this path must not come back.
    expect(svg).not.toContain('0 0 128 128');

    const renditions = [...svg.matchAll(/base64,([A-Za-z0-9+/=]+)"/g)].map((match) => Buffer.from(match[1], 'base64'));
    expect(renditions).toHaveLength(2);
    // The light rendition is the production file itself, embedded unchanged.
    expect(createHash('sha256').update(renditions[0]).digest('hex')).toBe(PRODUCTION_FAVICON_SHA256);

    // A scheme change while the tab is open swaps both raster links, so the icon keeps
    // up with the browser chrome without a reload.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(raster).toHaveAttribute('href', '/favicon-dark.png');
    await expect(legacy).toHaveAttribute('href', '/favicon-dark.ico');

    const darkPng = await page.request.get('/favicon-dark.png');
    expect(darkPng.status()).toBe(200);
    expect(darkPng.headers()['content-type']).toContain('image/png');

    const darkIco = await page.request.get('/favicon-dark.ico');
    expect(darkIco.status()).toBe(200);
    const darkIcoBody = await darkIco.body();
    // Same container shape as /favicon.ico: 16x16 and 32x32 renditions of the mark.
    expect([...darkIcoBody.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(darkIcoBody.readUInt16LE(4)).toBe(2);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(raster).toHaveAttribute('href', '/favicon.png');
    await expect(legacy).toHaveAttribute('href', '/favicon.ico');

    /**
     * Decodes an icon the way the browser does and measures how light the mark comes
     * out. The query string is cache-busting: without it Chromium reuses the decode
     * from the previous colour scheme instead of rendering the file again.
     */
    let probe = 0;
    const measure = async (source: string) =>
      page.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0, 32, 32);
        const { data } = context.getImageData(0, 0, 32, 32);

        let sum = 0;
        let opaque = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3] < 8) continue;
          sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
          opaque += 1;
        }
        return { mean: sum / opaque, opaque };
      }, source);

    const rendered = async (colorScheme: 'light' | 'dark') => {
      await page.emulateMedia({ colorScheme });
      probe += 1;
      return measure(`/favicon.svg?rendered=${colorScheme}-${probe}`);
    };

    // The rasters the tab actually shows carry the same two renditions.
    expect((await measure(`/favicon.png?measured=${(probe += 1)}`)).mean).toBeLessThan(90);
    expect((await measure(`/favicon-dark.png?measured=${(probe += 1)}`)).mean).toBeGreaterThan(150);

    const onLightChrome = await rendered('light');
    // The dark mark on light browser chrome (the production icon measures ~43).
    expect(onLightChrome.mean).toBeLessThan(90);

    const onDarkChrome = await rendered('dark');
    // The white-gradient mark on dark browser chrome, and the same silhouette as the
    // light rendition, so the tab icon does not jump when the scheme changes.
    expect(onDarkChrome.mean).toBeGreaterThan(150);
    expect(onDarkChrome.opaque).toBeGreaterThan(onLightChrome.opaque * 0.6);
    expect(onDarkChrome.opaque).toBeLessThan(onLightChrome.opaque * 1.4);

    // And back: the swap follows the colour scheme rather than the render order.
    expect((await rendered('light')).mean).toBeLessThan(90);
  });

  /**
   * Astro's ClientRouter swaps the head without a page load, so the freshly parsed raster
   * links carry the light hrefs again; the rerun script has to put them back on the scheme
   * the browser reports, or the mark would disappear the first time a visitor navigates.
   */
  test('the favicon keeps its scheme through client-side navigation', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('#favicon-raster')).toHaveAttribute('href', '/favicon-dark.png');

    // Dispatched programmatically so the collapsed mobile navbar does not matter.
    await page.evaluate(() => (document.querySelector('a[href="/services/"]') as HTMLElement).click());
    await page.waitForURL('**/services/');

    await expect(page.locator('#favicon-raster')).toHaveAttribute('href', '/favicon-dark.png');
    await expect(page.locator('#favicon-legacy')).toHaveAttribute('href', '/favicon-dark.ico');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('#favicon-raster')).toHaveAttribute('href', '/favicon.png');
  });

  test('draft blog posts stay hidden from the rendered site', async ({ page }) => {
    // The only blog entry is the `sample-post` draft, so there is no published
    // article page to assert `og:type="article"` / `article:published_time` against.
    const draft = await page.goto('/blog/sample-post/');
    expect(draft?.status()).toBe(404);

    const sitemap = await (await page.goto('/sitemap.xml'))!.text();
    expect(sitemap).not.toContain('/blog/');
  });
});

test.describe('404 page', () => {
  test('an unknown URL answers 404 with the not-found page', async ({ page }) => {
    const response = await page.goto('/no-such-page/');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/');
  });

  test('the not-found page follows the visitor language', async ({ page }) => {
    await page.goto('/no-such-page/?l=fi');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
    await expect(page.getByRole('heading', { name: 'Sivua ei löytynyt' })).toBeVisible();
    await expect(page.locator('main')).toContainText('Valitettavasti emme löytäneet etsimääsi sivua.');
    await expect(page.getByRole('link', { name: 'Takaisin etusivulle' })).toHaveAttribute('href', '/');
  });

  test('no page links to the blog, which has nothing published', async ({ page }) => {
    const paths = [
      '/',
      '/services/',
      '/koha/',
      '/koha-hosting/',
      '/toveri-access-control-device/',
      '/lainuri-checkout-machine/',
      '/contact/',
      '/privacy/',
      '/terms/',
      '/changelog/',
      '/no-such-page/',
    ];

    for (const path of paths) {
      await page.goto(path);

      // `/blog/` is still a route, but with nothing published it is not advertised
      // anywhere: the not-found page was the only page that linked it.
      await expect(page.locator('a[href^="/blog"]')).toHaveCount(0);
    }
  });
});

test.describe('theme', () => {
  test.describe('light default', () => {
    // Every test gets a fresh context, so nothing is stored yet.
    test.use({ colorScheme: 'dark' });

    test('white theme is the default for first-time visitors, even with a dark OS setting', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(600);

      await expect(page.locator('html')).not.toHaveClass(/dark/);
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
        .toBe('light');
      // Dark mode stays opt-in: the default is applied, not pinned to storage.
      expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBeNull();

      // Opting in still works from a fresh, unstored default.
      await page.locator('[data-theme-toggle]:visible').first().click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), THEME_KEY))
        .toBe('dark');
    });

    test('a legacy OS-derived theme entry cannot force dark mode', async ({ page }) => {
      // Older builds stored the OS colour scheme in the 'theme' key on every visit,
      // so a single dark-OS visit used to pin a browser to dark forever.
      await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
      await page.goto('/');
      await page.waitForTimeout(600);

      await expect(page.locator('html')).not.toHaveClass(/dark/);
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
        .toBe('light');
      await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBeNull();

      // A deliberate pick after the migration is honoured and survives a reload.
      await page.locator('[data-theme-toggle]:visible').first().click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), THEME_KEY))
        .toBe('dark');

      await page.reload();
      await expect(page.locator('html')).toHaveClass(/dark/);
    });
  });

  test('dark mode uses lifted surfaces instead of near-black', async ({ page }) => {
    await useTheme(page, 'dark');
    await page.goto('/');
    // The body fades between themes (transition-colors), so let it settle first.
    await page.waitForTimeout(600);

    const read = () =>
      page.evaluate(() => {
        // Computed colours come back as oklch/oklab, so read them as pixels instead.
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d')!;

        const rgb = (selector: string) => {
          const background = getComputedStyle(document.querySelector(selector) as Element).backgroundColor;
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = background;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return { r, g, b, sum: r + g + b };
        };

        return {
          page: rgb('body'),
          card: rgb('.glass-panel'),
          scheme: getComputedStyle(document.documentElement).colorScheme,
        };
      });

    const dark = await read();

    // Lifted off black: visible, but still a dark surface
    // (pure black would be 0, the old #09090b only 26).
    expect(dark.page.sum).toBeGreaterThan(40);
    expect(dark.page.sum).toBeLessThan(120);
    // Cool tint rather than neutral grey.
    expect(dark.page.b).toBeGreaterThanOrEqual(dark.page.r);
    // Cards sit visibly above the page background.
    expect(dark.card.sum).toBeGreaterThan(dark.page.sum);
    // Native widgets (scrollbars, autofill) follow the theme.
    expect(dark.scheme).toBe('dark');

    await page.locator('[data-theme-toggle]:visible').first().click();
    await page.waitForTimeout(600);

    const light = await read();

    expect(light.page.sum).toBeGreaterThan(700);
    expect(light.scheme).toBe('light');
  });

  test('form fields follow the theme instead of staying grey', async ({ page }) => {
    await useTheme(page, 'dark');
    await page.goto('/contact/');
    // The body fades between themes (transition-colors), so let it settle first.
    await page.waitForTimeout(600);

    const read = () =>
      page.evaluate(() => {
        // Computed colours come back as oklch/oklab, so read them as pixels instead.
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d')!;

        const rgb = (value: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return { r, g, b, sum: r + g + b };
        };

        const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
          const channel = (value: number) => {
            const scaled = value / 255;
            return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };

        const field = getComputedStyle(document.querySelector('#form input[name="name"]') as Element);
        const background = rgb(field.backgroundColor);
        const text = rgb(field.color);
        const lightest = Math.max(luminance(background), luminance(text));
        const darkest = Math.min(luminance(background), luminance(text));

        return {
          field: background.sum,
          page: rgb(getComputedStyle(document.body).backgroundColor).sum,
          contrast: (lightest + 0.05) / (darkest + 0.05),
        };
      });

    const dark = await read();

    // The fields used to be hard-coded to `bg-zinc-300` (sum 640) with no dark
    // variant, so a dark-mode visitor got the same pale grey field. It is now a
    // raised night surface that still sits visibly above the page background.
    expect(dark.field).toBeLessThan(200);
    expect(dark.field).toBeGreaterThan(dark.page);
    expect(dark.contrast).toBeGreaterThan(4.5);

    await page.locator('[data-theme-toggle]:visible').first().click();
    await page.waitForTimeout(600);

    const light = await read();

    // And a white field on the light background (sum 750), not a heavy grey block.
    expect(light.field).toBeGreaterThan(700);
    expect(light.field).toBeGreaterThan(light.page);
    expect(light.contrast).toBeGreaterThan(4.5);
  });

  test('theme toggle switches between dark and light', async ({ page }) => {
    await useTheme(page, 'dark');
    await page.goto('/');

    const body = page.locator('body');
    const darkBodyColor = await body.evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.locator('[data-theme-toggle]:visible').first().click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect
      .poll(() => body.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(darkBodyColor);

    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), THEME_KEY))
      .toBe('light');
  });

  test('theme survives client-side navigation', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop navigation is hidden on small viewports.');

    await useTheme(page, 'dark');
    await page.goto('/');
    await page.locator('header nav a', { hasText: 'Services' }).first().click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});

test.describe('navigation', () => {
  test('main navigation links resolve', async ({ page, isMobile }) => {
    await page.goto('/');

    if (isMobile) {
      await page.getByRole('button', { name: 'Open main menu' }).click();
    }

    await expect(page.locator('header a', { hasText: 'Why FOSS' }).first()).toHaveAttribute('href', '/#whyfoss');
    await expect(page.locator('header a', { hasText: 'Services' }).first()).toHaveAttribute('href', '/services/');
    await expect(page.locator('header').getByRole('link', { name: 'Koha', exact: true }).first()).toHaveAttribute('href', '/koha/');
    await expect(page.locator('header a', { hasText: 'Contact' }).first()).toHaveAttribute('href', '/contact/');
  });

  test('desktop navigation divides its links with a hairline', async ({ page, isMobile }) => {
    await page.goto('/');

    const dividers = page.locator('header nav [data-nav-separator]');

    if (isMobile) {
      // The collapsed menu stacks full-width rows, so it draws no dividers of its own.
      await expect(dividers.first()).toBeHidden();
      await page.getByRole('button', { name: 'Open main menu' }).click();
      await expect(page.locator('#mobile-menu [data-nav-separator]')).toHaveCount(0);
      return;
    }

    // Every item is divided off from the one before it, and the picker is divided
    // off from the links, so the bar holds one divider per link.
    await expect(dividers).toHaveCount(await page.locator('header nav > a').count());

    const divider = dividers.first();
    await expect(divider).toBeVisible();

    const box = await divider.boundingBox();
    expect(box).not.toBeNull();
    // A hairline: a pixel wide and as tall as the labels it stands between.
    expect(box!.width).toBeLessThanOrEqual(2);
    expect(box!.height).toBeGreaterThanOrEqual(12);
  });

  test('mobile menu opens and closes', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile menu only renders on small viewports.');

    await page.goto('/');
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeHidden();

    await page.getByRole('button', { name: 'Open main menu' }).click();
    await expect(menu).toBeVisible();
    await expect(menu.locator('a', { hasText: 'Services' })).toHaveCount(1);

    await page.locator('#mobile-menu-btn').click();
    await expect(menu).toBeHidden();
  });

  test('clicking outside the open mobile menu collapses it', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile menu only renders on small viewports.');

    await page.goto('/');

    const menu = page.locator('#mobile-menu');
    const outside = page.getByRole('heading', { level: 1 });

    await page.getByRole('button', { name: 'Open main menu' }).click();
    await expect(menu).toBeVisible();

    // The hero heading is plain text below the menu, so a tap on it is a tap beside
    // the menu and not a link that leaves the page.
    await outside.scrollIntoViewIfNeeded();
    await outside.click();

    await expect(menu).toBeHidden();
    await expect(page).toHaveURL('/');

    // A tap on the menu itself, away from its links, leaves it open.
    await page.locator('#mobile-menu-btn').click();
    await expect(menu).toBeVisible();
    await menu.locator('p', { hasText: 'Language' }).click();
    await expect(menu).toBeVisible();

    // A tap on one of the menu's own links puts it away, including a link that only
    // scrolls the page it is already on (Astro does not re-render the navbar for those).
    await menu.locator('a', { hasText: 'Why FOSS' }).click();
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL('/#whyfoss');

    // The button still opens the menu afterwards.
    await page.locator('#mobile-menu-btn').click();
    await expect(menu).toBeVisible();
  });

  test('the language switcher is in the mobile menu', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The picker in the desktop nav bar is not visible on a small viewport.');

    await page.goto('/');
    await page.getByRole('button', { name: 'Open main menu' }).click();

    const menu = page.locator('#mobile-menu');
    await expect(menu.getByText('Language', { exact: true })).toBeVisible();

    // The page is English, so the menu offers Finnish (the current language stays hidden).
    const finnish = menu.locator('a[href="?l=fi"]');
    await expect(finnish).toBeVisible();
    await expect(finnish).toContainText('Suomi');

    await finnish.click();

    // The choice applies to the page the visitor is on, and the fresh navbar closes the menu.
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
    await expect(menu).toBeHidden();

    await page.getByRole('button', { name: 'Avaa päävalikko' }).click();
    await expect(menu.getByText('Kieli', { exact: true })).toBeVisible();
    await expect(menu.locator('a[href="?l=en"]')).toContainText('English');
  });

  test('command palette opens with Ctrl+K and closes with Escape', async ({ page }) => {
    await page.goto('/');
    const palette = page.locator('#command-palette');
    await expect(palette).toBeHidden();

    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await expect(page.locator('#search-input')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('command palette searches the site and Enter opens the best match', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');

    await page.locator('#search-input').fill('koha hosting');

    const options = page.locator('#search-results [role="option"]');
    await expect(options.first()).toBeVisible();
    await expect(page.locator('#search-results')).toContainText('Koha cloud hosting');
    await expect(page.locator('#search-results')).toContainText('Our services');

    const href = await options.first().locator('a').getAttribute('href');
    expect(href).toBeTruthy();

    await page.keyboard.press('Enter');
    await page.waitForURL(`**${href}`);
    await expect(page.locator('#command-palette')).toBeHidden();
  });

  test('command palette selection follows the arrow keys', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');

    await page.locator('#search-input').fill('koha');
    const options = page.locator('#search-results [role="option"]');
    await expect(options.first()).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.first()).toHaveAttribute('aria-selected', 'false');

    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    // An empty query brings back the help text.
    await page.locator('#search-input').fill('');
    await expect(page.locator('#search-help')).toBeVisible();
    await expect(options).toHaveCount(0);
  });

  test('command palette opens the row the arrow keys selected', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');

    await page.locator('#search-input').fill('koha');
    const options = page.locator('#search-results [role="option"]');
    await expect(options.nth(1)).toBeVisible();

    const selected = await options.nth(1).locator('a').getAttribute('href');
    expect(selected).toBeTruthy();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await page.waitForURL(`**${selected}`);
    await expect(page.locator('#command-palette')).toBeHidden();
  });

  test('command palette reports an empty result set', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');

    await page.locator('#search-input').fill('zzzzzz');
    await expect(page.locator('#search-results')).toContainText('No results found for that query.');
    await expect(page.locator('#search-results [role="option"]')).toHaveCount(0);
  });

  test('command palette is localized and searchable in Finnish', async ({ page }) => {
    await page.goto('/?l=fi');

    // The desktop navbar button carries the label, the mobile one the aria-label.
    const searchButton = page.getByRole('button', { name: 'Haku' }).first();
    if (await searchButton.isVisible()) {
      await searchButton.click();
    } else {
      await page.keyboard.press('Control+k');
    }

    const input = page.locator('#search-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', 'Hae sivuja ja palveluita');

    await input.fill('kirjasto');
    await expect(page.locator('#search-results')).toContainText('Koha-kirjastojärjestelmä');

    await input.fill('zzzzzz');
    await expect(page.locator('#search-results')).toContainText('Ei tuloksia haulla.');
  });

  test('command palette finds a page by the text on it', async ({ page }) => {
    await page.goto('/?l=fi');
    await page.keyboard.press('Control+k');

    // This sentence is only in the body copy of the Koha page: no title, no
    // description and no keyword of any entry contains these words.
    await page.locator('#search-input').fill('maailman ensimmäinen');

    const options = page.locator('#search-results [role="option"]');
    await expect(options).toHaveCount(1);
    await expect(options.first().locator('a')).toHaveAttribute('href', '/koha/');

    // The words are in the body, so the row shows the sentence that holds them and
    // highlights both of them there.
    const snippet = options.first().locator('.palette-snippet');
    await expect(snippet).toBeVisible();
    await expect(snippet).toContainText('maailman ensimmäinen');

    const marks = snippet.locator('mark');
    await expect(marks).toHaveCount(2);
    await expect(marks.nth(0)).toHaveText(/^maailman$/i);
    await expect(marks.nth(1)).toHaveText(/^ensimmäinen$/i);
  });

  test('command palette points at the banking rows by their Finnish names', async ({ page }) => {
    await page.goto('/contact/?l=fi');
    await page.keyboard.press('Control+k');

    // "Tilinumero" and "Pankki" are in no title and in no description: they are the hidden
    // words of the IBAN and BIC rows, so the row of the result shows the code they stand for
    // and highlights the word that was searched for.
    const searches = [
      { term: 'tilinumero', code: 'FI50 7997 7996 3875 56' },
      { term: 'pankki', code: 'HOLVFIHH' },
    ];

    for (const { term, code } of searches) {
      await page.locator('#search-input').fill(term);

      const options = page.locator('#search-results [role="option"]');
      await expect(options).toHaveCount(1);
      await expect(options.first().locator('a')).toHaveAttribute('href', '/contact/');

      const snippet = options.first().locator('.palette-snippet');
      await expect(snippet).toContainText(code);
      await expect(snippet.locator('mark')).toHaveText(new RegExp(`^${term}$`, 'i'));
    }
  });

  test('the Finnish contact page hides the words it is searched by', async ({ page }) => {
    // The words above are printed nowhere: each one is clipped to a speck inside the row it
    // belongs to, so the panel still shows IBAN and BIC and nothing else.
    const rows = [
      { label: 'IBAN', term: 'Tilinumero' },
      { label: 'BIC', term: 'Pankki' },
    ];

    // The English page carries no Finnish words at all. It is visited first because `?l=fi` is
    // remembered in the language cookie, so the other way round would answer in Finnish here.
    await page.goto('/contact/');
    await expect(page.locator('#contact-info span.sr-only')).toHaveCount(0);

    await page.goto('/contact/?l=fi');

    for (const { label, term } of rows) {
      const hidden = page.locator('#contact-info dt', { hasText: label }).locator('span.sr-only');
      await expect(hidden).toHaveText(term);

      const box = await hidden.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.max(box!.width, box!.height)).toBeLessThanOrEqual(1);
    }
  });

  test('command palette highlights the words it matched', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');

    await page.locator('#search-input').fill('koha hosting');

    // The row is picked by its link: with the snippet in place a text match would
    // also hit the rows whose body copy mentions the page.
    const row = page.locator('#search-results [role="option"]:has(a[href="/koha-hosting/"])');
    await expect(row).toHaveCount(1);

    // Each word is wrapped in the casing of the index entry, and the words around
    // the marks keep their place.
    const title = row.locator('.palette-title');
    await expect(title).toContainText('Koha cloud hosting');

    const marks = title.locator('mark');
    await expect(marks).toHaveCount(2);
    await expect(marks.nth(0)).toHaveText(/^koha$/i);
    await expect(marks.nth(1)).toHaveText(/^hosting$/i);

    await expect(row.locator('.palette-description mark').first()).toBeVisible();

    // Nothing to point out in the body: both words are already in the title.
    await expect(row.locator('.palette-snippet')).toHaveCount(0);
  });

  test('command palette matches the query as the plain text it is', async ({ page }) => {
    await page.goto('/');

    // Both words are in the body copy of a page and carry characters that mean
    // something in a regular expression. They have to be highlighted as typed.
    const queries = [
      { query: 'source?', slug: '/', word: /^source\?$/i },
      { query: '(GDPR)', slug: '/privacy/', word: /^\(GDPR\)$/i },
    ];

    for (const { query, slug, word } of queries) {
      await page.keyboard.press('Control+k');

      const input = page.locator('#search-input');
      await expect(input).toBeVisible();
      await input.fill(query);

      const row = page.locator(`#search-results [role="option"]:has(a[href="${slug}"])`);
      await expect(row).toHaveCount(1);
      await expect(row.locator('.palette-snippet mark').first()).toHaveText(word);

      await page.keyboard.press('Escape');
      await expect(page.locator('#command-palette')).toBeHidden();
    }
  });
});

test.describe('localization', () => {
  test('?l=fi renders Finnish and is remembered in the language cookie', async ({ page, isMobile }) => {
    await page.goto('/?l=fi');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
    await expect(page.getByRole('heading', { name: 'Vapaa ja avoin lähdekoodi.' })).toBeVisible();

    if (!isMobile) {
      // FI for the NAV_LINKS labels is rendered in the desktop navbar.
      await expect(page.locator('header a', { hasText: 'Palvelut' }).first()).toBeVisible();
    }

    await page.goto('/services/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
  });

  test('English is the default without a language cookie', async ({ page }) => {
    await page.goto('/');

    // `en`, the code of the English pages in src/i18n/ui.ts and a real language tag at once: the
    // `lang` attribute is what a screen reader picks a voice with, so it is never a label of the
    // site's own.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Free & Open' })).toBeVisible();
  });

  test('the old name for English is read as English, cookie or not', async ({ page }) => {
    // The previous site named English `gb` in the `?l=` of the URLs it handed out, in its search
    // entries and in the `language` cookie it left behind, so that name is still answered - as
    // English (LEGACY_LANG in src/i18n/ui.ts). Finnish first, because a name that was dropped
    // instead of read would leave this request to the cookie, which says Finnish.
    await page.goto('/?l=fi');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi');

    await page.goto('/?l=gb');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Free & Open' })).toBeVisible();

    // What is remembered is the code this site carries, so the old one is answered once rather
    // than kept alive in the visitor's browser.
    expect(await page.evaluate(() => document.cookie)).toContain('language=en');
  });

  test('an unsupported language falls back to English instead of crashing', async ({ page }) => {
    const response = await page.goto('/?l=xx');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('Finnish translations render on the hosting page', async ({ page }) => {
    await page.goto('/koha-hosting/?l=fi');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
    await expect(page.getByRole('heading', { name: 'Helppo ja luotettava' })).toBeVisible();
  });

  test('the two Koha calls to action follow the language', async ({ page }) => {
    // The row below the screenshot: our hosting service next to the demo instance a library
    // can try before it talks to us.
    const hosting = page.locator('#kohaSection a[href="#cloud-hosting-service"]');
    const demo = page.locator('#kohaSection a[href="https://fi-demointra.koha.fi"]');

    await page.goto('/koha/');
    await expect(hosting).toHaveText('Koha Cloud Hosting Service');
    await expect(demo).toHaveText('Try Koha for free');

    // The demo instance is a site of its own, so the link leaves this one.
    await expect(demo).toHaveAttribute('target', '_blank');
    await expect(demo).toHaveAttribute('rel', /noopener/);

    await page.goto('/koha/?l=fi');
    await expect(hosting).toHaveText('Koha-pilvipalvelu');
    await expect(demo).toHaveText('Kokeile Kohaa ilmaiseksi');
  });

  test('the contact page sends Koha hosting questions to the quote form', async ({ page }) => {
    // Koha hosting is quoted through a form of its own, so the contact page says so under its
    // heading and links there, rather than letting the visitor fill in the wrong form.
    const heading = page.locator('#form h2').first();
    const hint = page.locator('#form h2 + p').first();
    const fields = page.locator('#form form');

    await page.goto('/contact/');
    await expect(hint).toContainText('Are you contacting us about Koha hosting?');
    await expect(hint.getByRole('link', { name: 'Koha hosting quote form' })).toHaveAttribute('href', '/koha/#request-a-quote');

    // It reads below the heading and above the fields of the form it steers away from.
    const boxes = await Promise.all([heading.boundingBox(), hint.boundingBox(), fields.boundingBox()]);
    expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
    expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);

    await page.goto('/contact/?l=fi');
    await expect(hint).toContainText('Oletko yhteydessä Kohan pilvipalvelusta?');
    await expect(hint.getByRole('link', { name: 'Kohan pilvapalvelun tarjouspyyntölomaketta' })).toHaveAttribute('href', '/koha/#request-a-quote');
  });

  test('the credits line in the footer follows the language, links and all', async ({ page }) => {
    const footer = page.locator('body > footer').first();

    await page.goto('/');
    await expect(footer).toContainText('Hypernova Oy. All rights reserved. Built on Astro web framework.');
    await expect(footer).toContainText('Theme "hypernova", a fork of "Zenix".');

    // Reading the Finnish page is what sets the language cookie, so it comes second.
    await page.goto('/?l=fi');
    await expect(footer).toContainText('Kaikki oikeudet pidätetään. Rakennettu Astro-verkkokehyksellä.');
    await expect(footer).toContainText('Teema "hypernova", joka on "Zenix"-teeman haarautuma.');

    // The three links keep their names and their targets in either language.
    await expect(footer.locator('a[href="https://astro.build"]')).toHaveText('Astro');
    await expect(footer.locator('a[href="https://github.com/Hypernova-Oy/www.hypernova.fi"]')).toHaveText('hypernova');
    await expect(footer.locator('a[href="https://github.com/farrosfr/zenix"]')).toHaveText('Zenix');
  });

  test('the trust badge under the tagline follows the language, flag and all', async ({ page }) => {
    const footer = page.locator('body > footer').first();
    const mark = footer.locator('.badge-flag').first();

    await page.goto('/');

    const tagline = footer.getByText('Cost-effective Open Source Services');
    const badge = footer.getByText('GDPR and privacy first');
    await expect(badge).toBeVisible();

    /*
     * The mark is a background image on an empty span, so a mark that is really there - and
     * sized - is the only thing that makes the flag visible; and the badge sits under the tagline
     * it belongs to, in the tagline's own column.
     */
    const english = await mark.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(english, 'the trust badge draws no flag').toContain('svg');

    const boxes = await Promise.all([tagline.boundingBox(), badge.boundingBox(), mark.boundingBox()]);
    for (const box of boxes) expect(box).not.toBeNull();

    expect(boxes[2]!.width, 'the flag of the trust badge has collapsed to nothing').toBeGreaterThan(8);
    expect(
      boxes[1]!.y,
      'the trust badge is not under the tagline it belongs to',
    ).toBeGreaterThanOrEqual(boxes[0]!.y + boxes[0]!.height - 1);
    expect(
      Math.abs(boxes[1]!.x - boxes[0]!.x),
      'the trust badge is not in the column the tagline is written in',
    ).toBeLessThan(1);

    // Read in Finnish: the same badge, saying the Finnish thing under the Finnish flag.
    await page.goto('/?l=fi');
    await expect(footer.getByText('Kotimaista laatutyötä')).toBeVisible();
    await expect(footer.getByText('GDPR and privacy first')).toHaveCount(0);

    const finnish = await mark.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(finnish, 'the Finnish trust badge draws no flag').toContain('svg');
    expect(finnish, 'both languages draw the same flag').not.toBe(english);
  });

});

test.describe('forms', () => {
  test('no e-mail addresses are published anywhere on the site', async ({ page }) => {
    const paths = [
      '/',
      '/services/',
      '/koha/',
      '/koha-hosting/',
      '/toveri-access-control-device/',
      '/lainuri-checkout-machine/',
      '/contact/',
      '/privacy/',
      '/terms/',
      '/blog/',
      '/changelog/',
    ];

    for (const path of paths) {
      await page.goto(path);
      const html = await page.content();

      expect(html, `${path} must not link a mailto:`).not.toContain('mailto:');
      expect(html.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? [], `${path} must not publish an address`).toEqual([]);
    }
  });

  test('forms carry a signed token and an off-screen honeypot', async ({ page }) => {
    for (const selector of ['#form form', '#request-a-quote form']) {
      await page.goto(selector === '#form form' ? '/contact/' : '/koha/');
      const form = page.locator(selector);

      const token = form.locator('input[name="form_token"]');
      await expect(token).toHaveCount(1);
      await expect(token).toHaveValue(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      const honeypot = form.locator('div[aria-hidden="true"] input[name="website"]');
      await expect(honeypot).toHaveCount(1);
      await expect(honeypot).toHaveAttribute('tabindex', '-1');
      await expect(honeypot).toHaveAttribute('autocomplete', 'off');
    }
  });

  test('every page load issues a fresh form token', async ({ page }) => {
    await page.goto('/koha/');
    const token = page.locator('#request-a-quote input[name="form_token"]');
    const first = await token.inputValue();

    await page.reload();

    expect(await token.inputValue()).not.toBe(first);
  });

  test('form pages are not stored by shared caches', async ({ page }) => {
    for (const path of ['/contact/', '/koha/']) {
      const response = await page.goto(path);
      expect(response?.headers()['cache-control']).toContain('no-store');
    }
  });

  test('a filled honeypot is answered exactly like a real submission', async ({ page }) => {
    await page.goto('/contact/');
    const form = page.locator('#form form');

    await form.locator('input[name="name"]').fill('Automated Submission');
    await form.locator('input[name="email"]').fill('bot@example.com');
    // A script that fills every field it finds trips the honeypot.
    await form.locator('input[name="website"]').fill('https://spam.example');
    await postForm(form);

    await expect(page.locator('#form').getByText('Thank you for submitting your request.')).toBeVisible();
    // Nothing reveals the detection, and Redmine is never contacted (see
    // src/utils/form-protection.ts and the unit tests in tests/unit/).
    await expect(page.locator('#form').getByText('Unfortunately an error occurred', { exact: false })).toBeHidden();
    await expect(page.locator('#form').getByText('Please enter your name.')).toBeHidden();
  });

  test('contact form renders validation messages', async ({ page }) => {
    await page.goto('/contact/');
    await postForm(page.locator('#form form'));

    await expect(page.locator('#form').getByText('Please enter your name.')).toBeVisible();
    await expect(page.locator('#form').getByText('Please enter an email address.')).toBeVisible();
  });

  test('koha quote form renders validation messages for every required field', async ({ page }) => {
    await page.goto('/koha/');
    await postForm(page.locator('#request-a-quote form'));

    await expect(page.locator('#request-a-quote').getByText('Please enter your name.')).toBeVisible();
    await expect(page.locator('#request-a-quote').getByText('Please enter your organization.')).toBeVisible();
    await expect(page.locator('#request-a-quote').getByText('Please enter an email address.')).toBeVisible();
  });

  test('koha quote form keeps submitted values after a failed validation', async ({ page }) => {
    await page.goto('/koha/');
    const form = page.locator('#request-a-quote form');
    await form.locator('input[name="name"]').fill('Test Person');
    await form.locator('input[name="organization"]').fill('Test Library');
    await form.locator('input[name="email"]').fill('not-an-email');
    await postForm(form);

    await expect(form.locator('input[name="name"]')).toHaveValue('Test Person');
    await expect(form.locator('input[name="organization"]')).toHaveValue('Test Library');
    await expect(page.locator('#request-a-quote').getByText('Please enter an email address.')).toBeVisible();
  });

  test('clicking submit on the empty koha form shows inline messages and stays put', async ({ page }) => {
    await page.goto('/koha/');
    const section = page.locator('#request-a-quote');
    const form = section.locator('form');

    await form.locator('button[type="submit"]').click();

    await expect(section.getByText('Please enter your name.')).toBeVisible();
    await expect(section.getByText('Please enter your organization.')).toBeVisible();
    await expect(section.getByText('Please enter an email address.')).toBeVisible();
    await expect(form.locator('input[name="name"]')).toBeFocused();
    await expect(form.locator('input[name="name"]')).toHaveAttribute('aria-invalid', 'true');
    expect(new URL(page.url()).pathname).toBe('/koha/');

    // Typing in the field clears its message again.
    await form.locator('input[name="name"]').fill('Test Person');
    await expect(form.locator('#koha-error-name')).toBeHidden();
  });

  test('clicking submit on the empty contact form shows inline messages and stays put', async ({ page }) => {
    await page.goto('/contact/');
    const section = page.locator('#form');
    const form = section.locator('form');

    await form.locator('button[type="submit"]').click();

    await expect(section.getByText('Please enter your name.')).toBeVisible();
    await expect(section.getByText('Please enter an email address.')).toBeVisible();
    // The first invalid field is focused, i.e. the name field.
    await expect(form.locator('input[name="name"]')).toBeFocused();
    expect(new URL(page.url()).pathname).toBe('/contact/');
  });
});

test.describe('layout regressions', () => {
  test('service cards on the services page do not overlap', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Grid overlap check targets tablet and desktop layouts.');

    await useTheme(page, 'light');
    await page.goto('/services/');

    const boxes = [];
    for (const card of await page.locator('#services .glass-panel').all()) {
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      boxes.push(box!);
    }
    expect(boxes.length).toBeGreaterThan(0);

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        expect(overlapX * overlapY).toBe(0);
      }
    }
  });

  test('feature cards do not clip their text in light mode', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Clipping check targets tablet and desktop layouts.');

    await useTheme(page, 'light');
    await page.goto('/');

    for (const card of await page.locator('#whyfoss .glass-panel').all()) {
      const clipped = await card.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
      expect(clipped).toBe(false);
    }
  });

  test('navigation bar keeps its links on one row', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The collapsed menu replaces the bar on a small viewport.');

    for (const path of ['/', '/?l=fi']) {
      await page.goto(path);

      const bar = await page.evaluate(() => {
        const nav = document.querySelector('header nav')!;
        // The picker keeps the language in use as a hidden link, which has no box to measure.
        const links = [...nav.querySelectorAll('a')].filter((link) => link.getBoundingClientRect().height > 0);
        // The picker is a pill, so it stands taller than the bare labels beside it: one row
        // is the links sharing a centre, not a top edge.
        const rows = links.map((link) => {
          const box = link.getBoundingClientRect();
          return Math.round(box.top + box.height / 2);
        });

        return { rows: new Set(rows).size, height: Math.round(nav.getBoundingClientRect().height) };
      });

      // The Finnish labels are the longest, and a bar that runs out of room wraps them
      // onto more than one row instead of widening (which would reach the controls).
      expect(bar.rows).toBe(1);
      expect(bar.height).toBeLessThanOrEqual(40);
    }
  });

  test('the logo is served at the size it is drawn, as WebP', async ({ page }) => {
    await page.goto('/');

    const logo = page.locator('header img[alt="Hypernova Oy"]');
    await expect.poll(() => logo.evaluate((el) => (el as HTMLImageElement).currentSrc)).not.toBe('');

    const src = await logo.evaluate((el) => (el as HTMLImageElement).currentSrc);
    expect(src, `the logo is served as ${src}`).toContain('f=webp');

    // It is drawn at 32px, and used to be served as its 1024x1024 source - 39 KB, in the bar of
    // every page. The 32px WebP is 696 bytes and the 64px one 1.5 KB (see the Performance notes
    // in the README).
    const bytes = (await (await page.request.get(src)).body()).length;
    expect(bytes, `the logo transfers ${bytes} bytes`).toBeLessThan(4_000);
  });

  test('the sticky header is opaque', async ({ page }) => {
    /*
     * The page scrolls underneath the bar, so the bar must not let it show through: it used
     * to carry `.glass-panel` (`bg-white/80 dark:bg-night-card/80`) and the copy behind it
     * read through the links. Both themes are checked, because the dark fill is a token of
     * its own, and the mobile menu opens inside the same bar, so the two have to agree on
     * one surface. The translucency is read from the alpha channel rather than from a
     * colour, so any pair of opaque fills passes and any fade fails.
     */
    for (const theme of ['light', 'dark'] as const) {
      await useTheme(page, theme);
      await page.goto('/');

      const chrome = await page.evaluate(() => {
        const paint = (selector: string) =>
          getComputedStyle(document.querySelector(selector)!).backgroundColor;

        return {
          position: getComputedStyle(document.querySelector('body > header')!).position,
          bar: paint('body > header'),
          menu: paint('#mobile-menu'),
        };
      });

      // A value with no alpha comes back as `rgb(r, g, b)` or a hex, one with alpha as
      // `rgb(r g b / a)` or `rgba(r, g, b, a)` - whichever form the token serialises to.
      const alphaOf = (color: string) => {
        if (color.includes('/')) {
          const alpha = parseFloat(color.slice(color.lastIndexOf('/') + 1));
          return color.trimEnd().endsWith('%') ? alpha / 100 : alpha;
        }

        const channels = color.match(/^rgba\(([^)]*)\)$/)?.[1].split(',').map(Number);
        return channels?.length === 4 ? channels[3] : 1;
      };

      expect(chrome.position).toBe('sticky');
      expect(alphaOf(chrome.bar), `${theme}: the page shows through the bar`).toBe(1);

      // The menu is a panel of that bar, so it is the same surface when it opens.
      expect(chrome.menu, `${theme}: the menu is a different surface than the bar`).toBe(chrome.bar);
    }
  });

  test('the language switcher reads as a control, not another link', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The picker in the desktop nav bar is not visible on a small viewport.');

    for (const theme of ['light', 'dark'] as const) {
      await useTheme(page, theme);
      await page.goto('/');

      const picker = page.locator('header nav a[href="?l=fi"]');
      await expect(picker).toBeVisible();

      const shape = await picker.evaluate((el) => {
        const style = getComputedStyle(el);
        const label = document.querySelector('header nav a:not([href^="?l="])')!;
        const labelStyle = getComputedStyle(label);
        const box = el.getBoundingClientRect();

        return {
          fill: style.backgroundColor,
          panel: getComputedStyle(document.querySelector('header')!).backgroundColor,
          padding: parseFloat(style.paddingLeft),
          radius: parseFloat(style.borderTopLeftRadius),
          fontSize: style.fontSize,
          labelFontSize: labelStyle.fontSize,
          height: Math.round(box.height),
          labelHeight: Math.round(label.getBoundingClientRect().height),
        };
      });

      // A surface of its own, unlike the bare labels: filled, inset from its own edge and
      // rounded, standing taller than the line the links sit on.
      expect(shape.fill, `${theme}: the picker draws no fill of its own`).not.toBe('rgba(0, 0, 0, 0)');
      expect(shape.fill, `${theme}: the picker blends into the bar behind it`).not.toBe(shape.panel);
      expect(shape.padding, `${theme}: the picker has no room around its flag`).toBeGreaterThanOrEqual(4);
      expect(shape.radius, `${theme}: the picker is not rounded`).toBeGreaterThan(0);
      expect(shape.height, `${theme}: the picker is no taller than a bare link`).toBeGreaterThan(shape.labelHeight);

      // Sized as a link next to the links, rather than inheriting the larger body text.
      expect(shape.fontSize, `${theme}: the picker is set larger than the links`).toBe(shape.labelFontSize);
    }
  });

  test('the language picker draws its own flag, not a flag-icons sheet', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'The picker in the desktop nav bar is not visible on a small viewport.');

    await page.goto('/');

    // The page is English, so the picker offers Finnish and draws that flag. The mark is
    // a background image on an empty span, so a mark that is really there - and sized -
    // is the only thing that makes it visible.
    const flag = page.locator('header nav a[href="?l=fi"] .fi').first();
    await expect(flag).toBeVisible();

    const drawn = await flag.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(drawn, 'the picker draws no flag').toContain('svg');
    expect(
      await flag.evaluate((el) => el.getBoundingClientRect().width),
      'the flag has collapsed to nothing',
    ).toBeGreaterThan(8);

    /*
     * The stylesheet this component used to import carried one rule per country - about
     * 250 of them, most with a base64 copy of the flag inside - while the site can only
     * show the languages of src/i18n/ui.ts. That sheet was 421 KB of the 563 KB a page
     * weighed, and this is what keeps it from coming back through a global import: a page
     * may only carry a flag rule for the languages the picker links to.
     */
    const flagRules = await page.evaluate(() =>
      [...document.styleSheets]
        .flatMap((sheet) => {
          try {
            return [...sheet.cssRules].map((rule) => rule.cssText);
          } catch {
            // A sheet that cannot be read carries no rules of ours.
            return [];
          }
        })
        .filter((rule) => /\.fi-[a-z]{2}(?![\w-])/.test(rule)),
    );

    expect(
      flagRules.length,
      `the page carries ${flagRules.length} country flag rules`,
    ).toBeLessThanOrEqual(2);
  });

  test('a hovered link is fetched before it is clicked, and changes nothing', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'A touch pointer does not hover, so there is nothing to prefetch.');

    await page.goto('/');

    // Astro's prefetch (astro.config.mjs) puts a `link[rel=prefetch]` in the head while the
    // pointer rests on a link. Every page is rendered when it is asked for, so this is what
    // keeps a click from waiting for a render and a round trip before the document arrives.
    const services = page.waitForRequest(
      (request) =>
        request.url().endsWith('/services/') && request.headers()['sec-purpose'] === 'prefetch',
    );
    await page.locator('header nav a[href="/services/"]').hover();
    await services;

    // A prefetch is not a visit: src/middleware.ts skips the language cookie for one, so
    // resting the pointer on the Finnish link must not switch the page behind the visitor.
    const picker = page.waitForRequest(
      (request) =>
        request.url().includes('?l=fi') && request.headers()['sec-purpose'] === 'prefetch',
    );
    await page.locator('header nav a[href="?l=fi"]').hover();
    await picker;

    expect(
      await page.evaluate(() => document.cookie),
      'the prefetch wrote the language cookie',
    ).not.toContain('language=fi');

    // Still the English document; its `lang` is the code of the page, `en` (src/i18n/ui.ts).
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the language switcher is a tint of the bar, not a block of ink', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The picker in the desktop nav bar is not visible on a small viewport.');

    for (const theme of ['light', 'dark'] as const) {
      await useTheme(page, theme);
      await page.goto('/');

      const pill = await page.locator('header nav a[href="?l=fi"]').evaluate((el) => {
        // Computed colours come back as oklch/oklab, so read them as pixels instead.
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d')!;

        const rgb = (value: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return { r, g, b };
        };

        const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
          const channel = (value: number) => {
            const scaled = value / 255;
            return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };

        const style = getComputedStyle(el);
        const fill = luminance(rgb(style.backgroundColor));
        const label = luminance(rgb(style.color));
        const lightest = Math.max(fill, label);
        const darkest = Math.min(fill, label);

        return { fill, label, contrast: (lightest + 0.05) / (darkest + 0.05) };
      });

      // The fill is a tint of the bar in its own theme - light in the light theme, dark in
      // the dark one - and not a block of the opposite ink. The light pill used to be the
      // solid-control colour `primary-600` (#222), the darkest thing on a white bar, in a
      // row whose other controls stay quiet until they are hovered.
      if (theme === 'light') {
        expect(pill.fill, 'the light-theme pill is a dark block').toBeGreaterThan(0.5);
      } else {
        expect(pill.fill, 'the dark-theme pill is a block of light ink').toBeLessThan(0.5);
      }

      // And the tint is still dark enough (or light enough) to read its label on.
      expect(pill.contrast, `${theme}: the picker's label does not read on its own fill`).toBeGreaterThan(4.5);
    }
  });

  test('tablet widths do not scroll the page sideways', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The check drives the viewport itself.');

    // 768px is where the bar replaces the collapsed menu, so it is the tightest width
    // the logo, the links and the controls have to share.
    await page.setViewportSize({ width: 768, height: 900 });

    for (const path of ['/', '/?l=fi']) {
      await page.goto(path);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(overflow).toBeLessThanOrEqual(0);
    }
  });

  test('the sections on screen at load reveal without a scroll', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The check drives the viewport itself.');

    // A phone, where /koha/ stacks its three cards into one column: that makes the
    // section wrapping them several screens tall, which is the case that used to fail.
    await page.setViewportSize({ width: 393, height: 727 });
    await page.goto('/koha/');

    // The observer is built at `astro:page-load`, and the first element it reveals is the
    // proof its first callback has been delivered, so nothing here races a timing guess.
    await page.waitForFunction(() => document.querySelectorAll('.reveal-on-scroll.is-revealed').length > 0);

    const state = () =>
      page.evaluate(() => {
        const height = window.innerHeight;

        const rows = [...document.querySelectorAll('.reveal-on-scroll')].map((el) => {
          const box = el.getBoundingClientRect();
          const onScreen = Math.max(0, Math.min(height, box.bottom) - Math.max(0, box.top));

          return {
            top: Math.round(box.top),
            tall: Math.round(box.height),
            onScreen: Math.round(onScreen),
            revealed: el.classList.contains('is-revealed'),
            opacity: getComputedStyle(el).opacity,
          };
        });

        return {
          scrolled: window.scrollY,
          shown: rows.filter((row) => row.onScreen > 0),
          // Well below the fold, past the 8% the observer reaches beyond the viewport.
          below: rows.filter((row) => row.top > height * 1.2),
        };
      });

    const atLoad = await state();

    expect(atLoad.scrolled, 'the check scrolled the page, so it proves nothing').toBe(0);
    expect(atLoad.shown.length, 'nothing is on screen at load, so the case proves nothing').toBeGreaterThan(0);

    // Everything the first screen shows has to be revealed once the page has loaded.
    // `threshold: 0.1` asked for a share of the element, and the section wrapping the
    // stacked cards is taller than the screen, so it stayed at opacity 0 - hiding the
    // cards inside it that had already been revealed - until the visitor scrolled on.
    for (const row of atLoad.shown) {
      expect(
        row.revealed,
        `a section at the top of the page (${row.onScreen}px of a ${row.tall}px element in view) stayed hidden at load`,
      ).toBe(true);
    }

    // The sections further down still wait for their own scroll, which is the point of
    // the fade - only what the visitor has already seen may skip it.
    expect(atLoad.below.length, 'the page got too short to check what still waits').toBeGreaterThan(0);

    for (const row of atLoad.below) {
      expect(row.revealed, `a section ${row.top}px down was revealed without being scrolled to`).toBe(false);
    }

    // And the fade is over by the time a visitor has looked at it: the first screen is
    // opaque rather than caught half-way through.
    await page.waitForTimeout(900);

    const settled = await state();

    for (const row of settled.shown) {
      expect(row.opacity, `a section in view at load is still fading (opacity ${row.opacity})`).toBe('1');
    }
  });

  test('the Koha logo never outgrows its desktop size', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The check drives the viewport itself.');

    // The logo is a wide file (768x220) with no width of its own, so it used to stretch to
    // whatever row it sat in: a phone drew it wider than the desktop layout does. It is
    // lazy (it sits at the end of the page), so its box only exists once the browser has it.
    const logo = async () => {
      await expect
        .poll(() => page.evaluate(() => (document.querySelector('img[alt="Koha"]') as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);

      return page.evaluate(() => {
        const image = document.querySelector('img[alt="Koha"]')!;
        const box = image.getBoundingClientRect();
        const cell = image.closest('div')!.getBoundingClientRect();

        return { width: box.width, left: box.left - cell.left, right: cell.right - box.right };
      });
    };

    for (const path of ['/koha/', '/koha-hosting/']) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      const desktop = await logo();

      for (const width of [768, 640, 393]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);

        const narrow = await logo();
        const where = `${path} at ${width}px`;

        // The cap keeps the narrower viewports at or under the desktop size, and leaves
        // the logo in the middle of its cell rather than against one edge.
        expect(narrow.width, `${where} draws a wider logo than the desktop layout`).toBeLessThanOrEqual(
          desktop.width + 1,
        );
        expect(Math.abs(narrow.left - narrow.right), `${where} is not centred in its cell`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('form section labels stay centred inside their panel', async ({ page }) => {
    await useTheme(page, 'light');

    for (const path of ['/koha/', '/contact/', '/koha/?l=fi', '/contact/?l=fi']) {
      await page.goto(path);

      const rows = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;

        return [...document.querySelectorAll('form [data-form-section]')].map((wrapper) => {
          const badge = wrapper.querySelector('span')!;
          const label = badge.getBoundingClientRect();
          const panel = wrapper.parentElement!.getBoundingClientRect();

          return {
            label: badge.textContent!.trim(),
            left: label.left,
            right: label.right,
            center: label.left + label.width / 2,
            panelCenter: panel.left + panel.width / 2,
            viewport,
            clipped: badge.scrollWidth > badge.clientWidth + 1 || badge.scrollHeight > badge.clientHeight + 1,
          };
        });
      });

      expect(rows.length).toBeGreaterThan(0);

      for (const row of rows) {
        const where = `${path} "${row.label}"`;
        expect(row.left, `${where} starts off the left edge`).toBeGreaterThanOrEqual(0);
        expect(row.right, `${where} runs past the right edge`).toBeLessThanOrEqual(row.viewport);
        expect(Math.abs(row.center - row.panelCenter), `${where} is not centred on its panel`).toBeLessThanOrEqual(1.5);
        expect(row.clipped, `${where} is clipped`).toBe(false);
      }
    }
  });

  test('the company and billing details span their panel', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The check drives the viewport itself.');

    await useTheme(page, 'light');

    // The panel is a column flex container, so the grid inside it cannot carry the `mx-auto`
    // of the panels around it: an auto inline margin would size the grid to its content and
    // centre it, leaving the right half of the panel empty from `md` up. The grid is `w-full`.
    const details = () =>
      page.evaluate(() => {
        const panel = document.querySelector('#contact-info .glass-panel')!;
        const grid = panel.querySelector(':scope > .grid')!;
        const style = getComputedStyle(panel);
        const box = panel.getBoundingClientRect();

        return {
          gridLeft: Math.round(grid.getBoundingClientRect().left),
          gridRight: Math.round(grid.getBoundingClientRect().right),
          innerLeft: Math.round(box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)),
          innerRight: Math.round(box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)),
          columns: [...grid.children].map((column) => {
            const rect = column.getBoundingClientRect();
            return { top: Math.round(rect.top), width: Math.round(rect.width) };
          }),
          rows: [...grid.querySelectorAll(':scope > div > dl > div')].map((row) => ({
            label: row.querySelector('dt')!.getBoundingClientRect().top,
            value: row.querySelector('dd')!.getBoundingClientRect().top,
          })),
        };
      });

    for (const width of [1280, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/contact/');

      const panel = await details();
      const where = `at ${width}px`;

      // No auto inline margin: the grid runs the width of the panel's content box.
      expect(panel.gridLeft, `${where} the grid is inset from the panel's left edge`).toBe(panel.innerLeft);
      expect(panel.gridRight, `${where} the grid stops short of the panel's right edge`).toBe(panel.innerRight);

      // Two columns level with each other and equally wide, from `md` up.
      expect(panel.columns, `${where} the details are not in two columns`).toHaveLength(2);
      expect(panel.columns[0].top, `${where} the two columns are not on one row`).toBe(panel.columns[1].top);
      expect(Math.abs(panel.columns[0].width - panel.columns[1].width), `${where} the columns differ in width`).toBeLessThanOrEqual(1);

      // Every detail is a label above its own value, in both columns.
      expect(panel.rows, `${where} no detail rows were found`).toHaveLength(6);
      for (const row of panel.rows) {
        expect(row.label, `${where} a value sits at or above its label`).toBeLessThan(row.value);
      }
    }

    // A phone stacks the two columns instead.
    await page.setViewportSize({ width: 393, height: 900 });
    await page.goto('/contact/');

    const phone = await details();
    expect(phone.columns[0].top, 'the two columns share a row on a phone').toBeLessThan(phone.columns[1].top);
  });
});

test.describe('koha staff interface screenshot', () => {
  const figureSelector = '[data-koha-screenshot-figure]';
  const screenshot = '[data-koha-screenshot]';
  const option = (view: 'desktop' | 'mobile') => `[data-koha-screenshot-option="${view}"]`

  /**
   * The screenshots are large bitmaps, so `currentSrc` - the file the browser actually
   * settled on - is the only reliable way to tell which view is on screen. It becomes
   * readable once the image has been scrolled into view.
   */
  async function screenshotInView(page: Page): Promise<Locator> {
    const image = page.locator(screenshot);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc)).not.toBe('');
    return image;
  }

  /**
   * The ratio of the file the browser settled on, read from the file itself.
   *
   * `naturalWidth / naturalHeight` cannot answer this once a `srcset` is involved: those are
   * the *density-corrected* dimensions, so a 1152x453 file in a 1024px slot reports 1024x402
   * and its rounded height moves the ratio by about a tenth of a percent. The reserved box is
   * built from the capture, so the two are compared through the file's own pixels here.
   */
  async function fileRatio(page: Page, src: string) {
    return page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();

      return image.naturalWidth / image.naturalHeight;
    }, src);
  }

  /** Everything the layout promises about the painted screenshot, in one round trip. */
  async function paintState(image: Locator) {
    return image.evaluate((el) => {
      const img = el as HTMLImageElement;
      const panel = img.closest('[data-koha-screenshot-panel]') as HTMLElement;
      const hint = document.querySelector('[data-koha-screenshot-pan-hint]') as HTMLElement | null;
      const box = img.getBoundingClientRect();
      return {
        src: img.currentSrc,
        naturalWidth: img.naturalWidth,
        ratio: img.naturalWidth / img.naturalHeight,
        boxWidth: box.width,
        boxHeight: box.height,
        panelWidth: panel.getBoundingClientRect().width,
        // The frame animates between the two widths, so the settled value is the CSS one.
        panelMaxWidth: parseFloat(getComputedStyle(panel).maxWidth),
        // A frame that pans scrolls its own box, and only its own box.
        panelScrollsSideways: panel.scrollWidth > panel.clientWidth + 1,
        panelTabIndex: panel.getAttribute('tabindex'),
        panHintShown: hint !== null && getComputedStyle(hint).display !== 'none',
        reservedRatio: getComputedStyle(img).aspectRatio,
        pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
  }

  test('the view that matches the viewport is the one that loads', async ({ page, isMobile }) => {
    await page.goto('/koha/');
    const image = await screenshotInView(page);
    const view = isMobile ? 'mobile' : 'desktop';

    await expect(page.locator(figureSelector)).toHaveAttribute('data-koha-screenshot-view', view);
    expect(await image.evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(`en_koha_${view}`);
    // The view that is on screen is the one announced as pressed.
    await expect(page.locator(option(view))).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(option(view === 'desktop' ? 'mobile' : 'desktop'))).toHaveAttribute('aria-pressed', 'false');
  });

  test('the screenshot is served at the size it is drawn, as WebP', async ({ page }) => {
    await page.goto('/koha/');
    const image = await screenshotInView(page);
    const src = await image.evaluate((el) => (el as HTMLImageElement).currentSrc);

    expect(src, `the screenshot is served as ${src}`).toContain('f=webp');

    // The image service resizes and re-encodes at request time (see the note in the component
    // and the Performance notes in the README). With the passthrough service this slot held the
    // whole 1320x2868 capture, 253 KB, on every viewport, and the <picture> had nothing smaller
    // to offer. A phone picks the 990px WebP of that capture, 43 KB.
    const bytes = (await (await page.request.get(src)).body()).length;
    expect(bytes, `the screenshot transfers ${bytes} bytes`).toBeLessThan(80_000);
  });

  test('the view buttons switch between the two renditions', async ({ page }) => {
    await page.goto('/koha/');
    const figure = page.locator(figureSelector);
    const image = await screenshotInView(page);

    await expect(figure).toHaveAttribute('data-koha-screenshot-view', /^(desktop|mobile)$/);
    const initial = (await figure.getAttribute('data-koha-screenshot-view')) as 'desktop' | 'mobile';
    const target = initial === 'desktop' ? 'mobile' : 'desktop';

    await page.locator(option(target)).click();

    await expect(figure).toHaveAttribute('data-koha-screenshot-view', target);
    await expect(page.locator(option(target))).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(option(initial))).toHaveAttribute('aria-pressed', 'false');
    // Choosing a view really swaps the file: the browser re-runs its picture selection.
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(`koha_${target}`);
  });

  test('Finnish visitors get the Finnish staff interface screenshots', async ({ page, isMobile }) => {
    await page.goto('/koha/?l=fi');
    const image = await screenshotInView(page);

    expect(await image.evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(
      isMobile ? 'fi_koha_mobile' : 'fi_koha_desktop',
    );
  });

  test('the screenshot scales with its panel and keeps the ratio of the decoded file', async ({ page }) => {
    await page.goto('/koha/');
    const image = await screenshotInView(page);
    await expect.poll(async () => (await paintState(image)).naturalWidth).toBeGreaterThan(0);

    const box = await image.boundingBox();
    const painted = await paintState(image);
    const ratio = await fileRatio(page, painted.src);

    expect(box).not.toBeNull();
    // Never wider than the card that frames it: a wide screenshot must not push the page sideways.
    expect(box!.width).toBeLessThanOrEqual(painted.panelWidth + 1);
    // The painted box matches the file the browser decoded, so nothing is stretched.
    expect(box!.width / box!.height).toBeCloseTo(ratio, 2);
    // The space reserved before the file arrives matches as well, which is what keeps
    // the scroll position stable while the screenshot is still loading.
    const [reservedWidth, reservedHeight] = painted.reservedRatio.split('/').map((part) => Number(part.trim()));
    expect(reservedWidth / reservedHeight).toBeCloseTo(ratio, 2);
    // No stretched-up bitmap: the file is at least as wide as the box it is drawn in.
    expect(painted.naturalWidth).toBeGreaterThanOrEqual(box!.width);
    expect(painted.pageScrollsSideways).toBe(false);
  });

  test('a forced view keeps its own ratio, and pans rather than shrinking where it must', async ({ page }) => {
    await page.goto('/koha/');
    const figure = page.locator(figureSelector);
    const image = await screenshotInView(page);

    const initial = (await figure.getAttribute('data-koha-screenshot-view')) as 'desktop' | 'mobile';
    const target = initial === 'desktop' ? 'mobile' : 'desktop';
    await page.locator(option(target)).click();
    await expect(figure).toHaveAttribute('data-koha-screenshot-view', target);

    // Wait for the rendition the visitor picked, not for the file the viewport asked for.
    await expect.poll(async () => (await paintState(image)).src).toContain(`koha_${target}`);
    await expect.poll(async () => (await paintState(image)).naturalWidth).toBeGreaterThan(0);

    const painted = await paintState(image);
    const box = await image.boundingBox();
    const ratio = await fileRatio(page, painted.src);

    // The painted box and the reserved box both follow the file that is on screen.
    expect(box!.width / box!.height).toBeCloseTo(ratio, 2);
    const [reservedWidth, reservedHeight] = painted.reservedRatio.split('/').map((part) => Number(part.trim()));
    expect(reservedWidth / reservedHeight).toBeCloseTo(ratio, 2);
    // The frame animates onto the width of the chosen view: phone sized on a wide screen,
    // the full card for the desktop rendition.
    await expect
      .poll(async () => (await paintState(image)).panelMaxWidth, {
        message: 'the frame settles on the width of the chosen view',
      })
      .toBeCloseTo((target === 'mobile' ? 20 : 72) * 16, -1);
    expect(painted.panelWidth).toBeLessThanOrEqual(painted.panelMaxWidth + 1);

    // A desktop capture squeezed into a phone-width frame is unreadable, so there the frame
    // keeps a readable minimum width and pans instead of shrinking. Everywhere else the
    // screenshot fits the frame exactly and the frame has nothing to scroll.
    const phoneWidth = (page.viewportSize()?.width ?? 0) < 768;
    if (target === 'desktop' && phoneWidth) {
      expect(painted.panelScrollsSideways).toBe(true);
      // 66rem: the capture is painted at roughly 80% of its logical size.
      expect(box!.width).toBeGreaterThanOrEqual(66 * 16);
      // A scroll container no keyboard can reach would be a pointer-only feature.
      expect(painted.panelTabIndex).toBe('0');
      expect(painted.panHintShown).toBe(true);
    } else {
      expect(painted.panelScrollsSideways).toBe(false);
      expect(box!.width).toBeLessThanOrEqual(painted.panelWidth + 1);
      expect(painted.panHintShown).toBe(false);
    }

    // Either way the forced view never widens the page.
    expect(painted.pageScrollsSideways).toBe(false);
  });

  test('the screenshots sit above the sustainable choice copy', async ({ page }) => {
    await page.goto('/koha/');
    const figure = page.locator(figureSelector);
    await expect(figure).toBeVisible();
    await figure.scrollIntoViewIfNeeded();

    // The heading the figure introduces is the one about the responsive interface.
    await expect(page.locator('#kohaSection h2')).toHaveText(/Sustainable choice|Kestävä valinta/);

    // Reading order: the cards come first, then the screenshot, then that copy.
    const figureInBetween = await page.evaluate(() => {
      const shot = document.querySelector('[data-koha-screenshot-figure]');
      const card = document.querySelector('#kohaSection h3');
      const heading = document.querySelector('#kohaSection h2');
      if (!shot || !card || !heading) return false;
      const afterCard = Boolean(card.compareDocumentPosition(shot) & Node.DOCUMENT_POSITION_FOLLOWING);
      const beforeHeading = Boolean(shot.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING);
      return afterCard && beforeHeading;
    });
    expect(figureInBetween).toBe(true);

    const shotBox = await figure.boundingBox();
    const cardBox = await page.locator('#kohaSection h3').first().boundingBox();
    const headingBox = await page.locator('#kohaSection h2').boundingBox();
    expect(shotBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    // ... and it is painted between them, below all three cards and above the heading.
    expect(shotBox!.y).toBeGreaterThan(cardBox!.y);
    expect(shotBox!.y + shotBox!.height).toBeLessThanOrEqual(headingBox!.y);
  });

  test('the screenshot sits above the two buttons that follow it', async ({ page }) => {
    await page.goto('/koha/');
    const figure = page.locator(figureSelector);
    const buttons = page.locator('#kohaSection a[href="#cloud-hosting-service"]');

    await expect(figure).toBeVisible();
    await expect(buttons).toBeVisible();
    await buttons.scrollIntoViewIfNeeded();

    // Reading order: the cards, then the interface itself, then the two ways forward.
    const figureAboveButtons = await page.evaluate(() => {
      const shot = document.querySelector('[data-koha-screenshot-figure]');
      const button = document.querySelector('#kohaSection a[href="#cloud-hosting-service"]');
      if (!shot || !button) return false;
      return Boolean(shot.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(figureAboveButtons).toBe(true);

    const shotBox = await figure.boundingBox();
    const buttonBox = await buttons.boundingBox();
    expect(shotBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    // ... and it is painted above the row, the figure's own bottom margin being the gap.
    expect(shotBox!.y + shotBox!.height).toBeLessThanOrEqual(buttonBox!.y);
  });

  test('the view buttons work after a client-side navigation to the page', async ({ page }) => {
    // ClientRouter swaps the document instead of reloading it, so the page script has to
    // pick up the figure it finds after the swap.
    await page.goto('/services/');
    // The service card in the body: the header links sit behind the closed menu on mobile,
    // and this test runs on every platform.
    await page.locator('main a[href="/koha/"]').first().click();
    await page.waitForURL('**/koha/');

    const figure = page.locator(figureSelector);
    await expect(figure).toHaveAttribute('data-koha-screenshot-view', /^(desktop|mobile)$/);

    const image = await screenshotInView(page);
    await page.locator(option('mobile')).click();

    await expect(figure).toHaveAttribute('data-koha-screenshot-view', 'mobile');
    await expect(page.locator(option('mobile'))).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain('koha_mobile');
  });

  test('the hosting page shows the same screenshot above its cards', async ({ page, isMobile }) => {
    await page.goto('/koha-hosting/');
    const figure = page.locator(figureSelector);
    await expect(figure).toHaveCount(1);
    await expect(figure).toBeVisible();

    // Reading order: the section introduces itself, then shows the interface, then the cards.
    const figureComesFirst = await page.evaluate(() => {
      const shot = document.querySelector('[data-koha-screenshot-figure]');
      const card = document.querySelector('#cloud-hosting-service h3');
      if (!shot || !card) return false;
      return Boolean(shot.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(figureComesFirst).toBe(true);

    const image = await screenshotInView(page);
    const view = isMobile ? 'mobile' : 'desktop';
    await expect(figure).toHaveAttribute('data-koha-screenshot-view', view);
    expect(await image.evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(`en_koha_${view}`);
  });

  test('the hosting page view buttons switch renditions in the visitor language', async ({ page }) => {
    await page.goto('/koha-hosting/?l=fi');
    const figure = page.locator(figureSelector);
    const image = await screenshotInView(page);

    // The figure speaks Finnish here too, buttons included.
    await expect(page.locator(option('desktop'))).toContainText('Tietokonenäkymä');
    await expect(page.locator(option('mobile'))).toContainText('Matkapuhelinnäkymä');

    const initial = (await figure.getAttribute('data-koha-screenshot-view')) as 'desktop' | 'mobile';
    const target = initial === 'desktop' ? 'mobile' : 'desktop';
    await page.locator(option(target)).click();

    await expect(figure).toHaveAttribute('data-koha-screenshot-view', target);
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(`fi_koha_${target}`);
  });
});

/**
 * What a page fetches on its own, before the visitor touches anything.
 *
 * Each expectation is a decision that a measurement made - the element a page paints first,
 * recorded in the comments of Navbar.astro, koha.astro, KohaScreenshot.astro and
 * lainuri-checkout-machine.astro - or a rule the whole site keeps: nothing comes from another
 * origin, and the preloaded brand face is the file `npm run font:subset` cuts. They are read
 * off a running page, because that is where every one of those answers lives.
 */
test.describe('what a page fetches', () => {
  const paths = [
    '/',
    '/koha/',
    '/koha-hosting/',
    '/toveri-access-control-device/',
    '/lainuri-checkout-machine/',
  ];

  /** The `rel` values whose `href` a browser fetches by itself. */
  const FETCHED_RELS = [
    'stylesheet',
    'preload',
    'modulepreload',
    'prefetch',
    'icon',
    'apple-touch-icon',
    'manifest',
    'preconnect',
    'dns-prefetch',
  ];

  test('no page fetches a file from another origin', async ({ page }) => {
    for (const path of paths) {
      await page.goto(path);
      const origin = new URL(page.url()).origin;

      /*
       * No third-party font, no analytics, and - the reason this test exists - no avatar
       * service: the testimonials used to draw three 48px circles from `i.pravatar.cc`, which
       * told another company who was reading the page. They are initials in the markup now
       * (see the unit test for that component).
       */
      const urls = await page.evaluate((rels) => {
        const found: string[] = [];
        const add = (value: string | null) => {
          if (!value) return;

          // A `srcset` is a comma separated list of "url descriptor" pairs.
          for (const candidate of value.split(',')) {
            const url = candidate.trim().split(/\s+/)[0];
            if (url && !url.startsWith('data:')) found.push(url);
          }
        };

        const attributes: Array<[string, string[]]> = [
          ['img', ['src', 'srcset']],
          ['source', ['src', 'srcset']],
          ['script', ['src']],
          ['video', ['src', 'poster']],
          ['audio', ['src']],
          ['iframe', ['src']],
          ['embed', ['src']],
          ['object', ['data']],
        ];

        for (const [selector, names] of attributes) {
          for (const element of document.querySelectorAll(selector)) {
            for (const name of names) add(element.getAttribute(name));
          }
        }

        for (const link of document.querySelectorAll('link[href]')) {
          if (rels.includes((link.getAttribute('rel') ?? '').toLowerCase())) {
            add(link.getAttribute('href'));
          }
        }

        return found;
      }, FETCHED_RELS);

      const foreign = urls.filter((url) => new URL(url, page.url()).origin !== origin);
      expect(foreign, `${path} fetches a file from another host`).toEqual([]);

      /*
       * A background image or an `@import` is the same request an attribute would be, and it
       * is how a third party usually comes back: the flag sheet this site used to import
       * carried one rule - and one base64 copy of a flag - for every country on earth, and a
       * remote one would be fetched from wherever it is hosted.
       */
      const css = await page.evaluate(() =>
        [
          ...[...document.styleSheets].flatMap((sheet) => {
            try {
              return [...sheet.cssRules].map((rule) => rule.cssText);
            } catch {
              // A sheet that cannot be read is not ours; its own <link> was checked above.
              return [];
            }
          }),
          ...[...document.querySelectorAll('style')].map((style) => style.textContent ?? ''),
        ].join('\n'),
      );

      const painted = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)]
        .map((match) => match[2].trim())
        .filter((url) => !url.startsWith('data:') && !url.startsWith('#'));

      const remote = painted.filter((url) => new URL(url, page.url()).origin !== origin);
      expect(remote, `${path} paints a file that comes over the network`).toEqual([]);

      expect(css, `${path} imports a stylesheet over the network`).not.toMatch(
        /@import\s+(?:url\(\s*)?['"](?:https?:)?\/\//i,
      );
    }
  });

  test('only the picture the first paint waits for is fetched up front', async ({ page }) => {
    /*
     * `loading` and `fetchpriority` are the two knobs a page has over the queue: an image with
     * no `loading` is fetched the moment the parser reaches it, and `high` puts a file ahead of
     * the ones already asked for. Each of these numbers is a measurement - what the page paints
     * first at 393x900 (the phone view the LCP hints were tuned against) and at 1280x900 - read
     * back from the rendered page.
     */
    const expectations: Array<{ path: string; eager: number; leads?: RegExp }> = [
      // The mark in the navbar is on screen everywhere. `/` paints the wordmark - OCR-A text,
      // not a picture - first, so nothing else there is fetched early.
      { path: '/', eager: 1 },
      // The Koha logo in the hero, together with the navbar mark.
      { path: '/koha/', eager: 2, leads: /koha/i },
      // The first frame of the product gallery: the machine itself, above the fold.
      { path: '/lainuri-checkout-machine/', eager: 2, leads: /lainuri/i },
      // These two wait for layout. The screenshot and the product photo sit under a heading,
      // and it is the copy above them that the page paints; the screenshot used to be `eager`
      // with `fetchpriority="high"`, which pushed the file it does not need first in front of
      // the text that it does.
      { path: '/koha-hosting/', eager: 1 },
      { path: '/toveri-access-control-device/', eager: 1 },
    ];

    for (const { path, eager, leads } of expectations) {
      await page.goto(path);

      const images = await page.evaluate(() =>
        [...document.querySelectorAll('img')].map((image) => ({
          src: image.getAttribute('src') ?? '',
          loading: image.getAttribute('loading') ?? '',
          priority: image.getAttribute('fetchpriority') ?? '',
        })),
      );

      expect(images.length, `${path} shows no picture at all`).toBeGreaterThan(0);

      const undeclared = images.filter(
        (image) => image.loading !== 'eager' && image.loading !== 'lazy',
      );
      expect(
        undeclared.map((image) => image.src),
        `${path} leaves the loading of a picture to the browser`,
      ).toEqual([]);

      const upFront = images.filter((image) => image.loading === 'eager');
      expect(
        upFront.map((image) => image.src),
        `${path} fetches ${upFront.length} pictures before layout`,
      ).toHaveLength(eager);

      const first = images.filter((image) => image.priority === 'high');
      if (leads) {
        expect(first, `${path} names no picture to fetch first`).toHaveLength(1);
        expect(first[0].src, `${path} fetches the wrong picture first`).toMatch(leads);
      } else {
        expect(first, `${path} fetches a picture first that the page does not paint first`).toEqual([]);
      }
    }
  });

  test('the preloaded brand face is the subset, not the whole font', async ({ page }) => {
    /*
     * Navbar.astro preloads the face the wordmark is drawn in, and `npm run font:subset` cuts
     * that file down to the characters the site ever sets in it - 23 KB to 1.7 KB. A preload of
     * tens of kilobytes means the full face is back in the critical path of the wordmark, which
     * is the element `/` paints first; the two text families are preloaded whole (48 KB and
     * 22 KB), so the smallest preloaded file is the brand face and nothing else.
     */
    await page.goto('/');

    const hrefs = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));

    expect(hrefs.length, 'the brand face is not preloaded any more').toBeGreaterThan(0);

    const sizes: number[] = [];
    for (const href of hrefs) {
      const response = await page.request.get(href);
      expect(response.status(), `${href} is not served`).toBe(200);
      sizes.push((await response.body()).byteLength);
    }

    const smallest = Math.min(...sizes);
    expect(smallest, `the smallest preloaded font is ${smallest} bytes`).toBeLessThan(4096);
  });

  test('the palette is a file of its own and survives a client-side navigation', async ({ page }) => {
    /*
     * The palette used to be an `is:inline` script with `define:vars`: 11.7 KB of the 49 KB that
     * `/` weighed, parsed again on every load and sent again with every page that has a palette.
     * It is a bundled script now - parsed once, fetched once, cached by its hash - and the swap
     * below is the price of that: a client-side navigation replaces the palette element without
     * re-running the file, so the script has to bind the new element and publish the toggle the
     * navbar buttons call.
     */
    await page.goto('/');

    const inlined = await page.evaluate(() =>
      [...document.querySelectorAll('script:not([src])')]
        .map((script) => script.textContent ?? '')
        .filter((code) => code.includes('search-index.json')),
    );
    expect(inlined, 'the palette is written into every document again').toEqual([]);

    const files = await page.evaluate(() =>
      [...document.querySelectorAll('script[src]')].map((script) => (script as HTMLScriptElement).src),
    );
    expect(
      files.some((src) => src.includes('CommandPalette')),
      'no script file carries the palette',
    ).toBe(true);

    // A value on `window` survives a swap and dies in a reload, so it is what tells the two
    // apart: what runs below has to work without the palette file being loaded again.
    await page.evaluate(() => {
      (window as Window & { __paletteSurvived?: boolean }).__paletteSurvived = true;
    });

    // A link in the copy of the footer, so it is there and clickable in every viewport.
    await page.locator('body > footer a[href="/services/"]').first().click();
    await page.waitForURL('**/services/');

    const swapped = await page.evaluate(
      () => (window as Window & { __paletteSurvived?: boolean }).__paletteSurvived === true,
    );
    expect(swapped, 'the navigation reloaded the document, so nothing was rebound').toBe(true);

    await expect(page.locator('#command-palette')).toBeHidden();

    // The search button in the bar calls the toggle the palette publishes; one of the two in
    // the navbar is hidden per viewport, so the visible one is the one clicked.
    await page.locator('body > header button[aria-label="Search"]:visible').first().click();
    await expect(page.locator('#command-palette')).toBeVisible();
    await expect(page.locator('#search-input')).toBeFocused();

    // The palette of the new page answers for itself, from its own element.
    await page.locator('#search-input').fill('koha');
    await expect(page.locator('#search-results [role="option"]').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#command-palette')).toBeHidden();
  });
});

