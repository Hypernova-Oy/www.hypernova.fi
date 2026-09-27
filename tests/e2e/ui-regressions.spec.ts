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
