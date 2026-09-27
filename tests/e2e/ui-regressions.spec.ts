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

  test('legacy Lainuri URLs redirect to the checkout machine page', async ({ page }) => {
    const response = await page.goto('/lainuri-self-checkout-machine/');
    expect(response?.status()).toBeLessThan(400);
    expect(new URL(page.url()).pathname).toBe('/lainuri-checkout-machine/');
  });

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
    }
  });

  test('search index follows the requested language', async ({ page }) => {
    type Entry = { slug: string; title: string; keywords: string };
    const titleFor = (entries: Entry[], slug: string) => entries.find((entry) => entry.slug === slug);

    const english = (await (await page.goto('/search-index.json'))!.json()) as Entry[];
    const finnish = (await (await page.goto('/search-index.json?l=fi'))!.json()) as Entry[];

    expect(titleFor(english, '/koha-hosting/')?.title).toBe('Koha cloud hosting');
    expect(titleFor(finnish, '/koha-hosting/')?.title).toBe('Kohan pilvipalvelu');

    // Keywords keep both languages searchable whichever language is active.
    expect(titleFor(finnish, '/koha-hosting/')?.keywords).toContain('hosting');
    expect(titleFor(english, '/koha-hosting/')?.keywords).toContain('pilvipalvelu');
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
    await expect(page.locator('header a', { hasText: 'Contact' }).first()).toHaveAttribute('href', '/contact/');
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
    await expect(page.locator('html')).toHaveAttribute('lang', 'gb');
    await expect(page.getByRole('heading', { name: 'Free & Open' })).toBeVisible();
  });

  test('an unsupported language falls back to English instead of crashing', async ({ page }) => {
    const response = await page.goto('/?l=xx');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('html')).toHaveAttribute('lang', 'gb');
  });

  test('Finnish translations render on the hosting page', async ({ page }) => {
    await page.goto('/koha-hosting/?l=fi');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
    await expect(page.getByRole('heading', { name: 'Helppo ja luotettava' })).toBeVisible();
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

    expect(box).not.toBeNull();
    // Never wider than the card that frames it: a wide screenshot must not push the page sideways.
    expect(box!.width).toBeLessThanOrEqual(painted.panelWidth + 1);
    // The painted box matches the file the browser decoded, so nothing is stretched.
    expect(box!.width / box!.height).toBeCloseTo(painted.ratio, 2);
    // The space reserved before the file arrives matches as well, which is what keeps
    // the scroll position stable while the screenshot is still loading.
    const [reservedWidth, reservedHeight] = painted.reservedRatio.split('/').map((part) => Number(part.trim()));
    expect(reservedWidth / reservedHeight).toBeCloseTo(painted.ratio, 3);
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

    // The painted box and the reserved box both follow the file that is on screen.
    expect(box!.width / box!.height).toBeCloseTo(painted.ratio, 2);
    const [reservedWidth, reservedHeight] = painted.reservedRatio.split('/').map((part) => Number(part.trim()));
    expect(reservedWidth / reservedHeight).toBeCloseTo(painted.ratio, 3);
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

  test('the view buttons work after a client-side navigation to the page', async ({ page }) => {
    // ClientRouter swaps the document instead of reloading it, so the page script has to
    // pick up the figure it finds after the swap.
    await page.goto('/services/');
    await page.locator('a[href="/koha/"]').first().click();
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

