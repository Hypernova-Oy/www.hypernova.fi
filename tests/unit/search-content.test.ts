/**
 * Unit tests for the search index text extraction. They run with Node's own
 * test runner and type stripping, so no test framework is needed:
 *
 *   npm run test:unit
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

import {
  htmlToPlainText,
  loadPageText,
  markdownToPlainText,
} from '../../src/utils/search-content.ts';

const PAGE = `<!doctype html>
<html>
  <head><title>Koha library system</title></head>
  <body>
    <header><nav><a href="/contact/">Contact us</a></nav></header>
    <main>
      <style>main { color: red }</style>
      <h1>Koha&nbsp;library system</h1>
      <p>We host &amp; support <strong>Koha</strong>.</p>
      <p>From &euro;100 &#8211; or 50&#37; less.</p>
      <script>console.log('script text');</script>
      <svg><title>icon label</title><path d="M0 0h10v10H0z" /></svg>
      <!-- a comment -->
    </main>
    <footer>Copyright &copy; Hypernova Oy</footer>
  </body>
</html>`;

test('the text of a page stops at the main content', () => {
  const text = htmlToPlainText(PAGE);

  assert.ok(text.includes('Koha library system'));
  assert.ok(text.includes('We host & support Koha.'));
  assert.equal(text.includes('Contact us'), false);
  assert.equal(text.includes('Copyright'), false);
});

test('markup, scripts, styles, icons and comments are not text', () => {
  const text = htmlToPlainText(PAGE);

  for (const noise of ['<', 'color: red', 'script text', 'icon label', 'a comment']) {
    assert.equal(text.includes(noise), false, `"${noise}" should not be indexed`);
  }
});

test('character references become readable characters', () => {
  const text = htmlToPlainText(PAGE);

  assert.ok(text.includes('From \u20ac100 \u2013 or 50% less.'));
});

test('whitespace collapses into single spaces', () => {
  const text = htmlToPlainText('<main>\n  <p>One</p>\n\n   <p>two</p>\n</main>');

  assert.equal(text, 'One two');
});

test('a page without main content is still indexed', () => {
  assert.equal(htmlToPlainText('<p>Hello <b>world</b></p>'), 'Hello world');
});

test('an unknown character reference is dropped', () => {
  assert.equal(htmlToPlainText('<main>a &notanentity; b</main>'), 'a b');
});

test('markdown syntax leaves the words a reader would see', () => {
  const text = markdownToPlainText(`# Heading with *emphasis*

Paragraph with a [link to Koha](https://www.hypernova.fi/koha/) and \`koha\` inline code.

- first list item
- second list item

![Lainuri checkout machine](/lainuri.png)

\`\`\`bash
npm run build
\`\`\`

> Quoted sentence.

<Card title="x">Component text</Card>
`);

  assert.ok(text.includes('Heading with emphasis'));
  assert.ok(text.includes('link to Koha'));
  assert.ok(text.includes('koha inline code.'));
  assert.ok(text.includes('first list item'));
  assert.ok(text.includes('Lainuri checkout machine'));
  assert.ok(text.includes('Quoted sentence.'));
  assert.ok(text.includes('Component text'));

  for (const noise of ['#', '*', ']', 'https://www.hypernova.fi', 'npm run build', '<Card']) {
    assert.equal(text.includes(noise), false, `"${noise}" should not be indexed`);
  }
});

/** A miniature site: pages are answered by path, `'drop'` closes the socket. */
async function startSite(pages: Record<string, string | number | 'drop'>) {
  const requests: string[] = [];

  const server = createServer((request, response) => {
    const url = request.url ?? '/';
    requests.push(url);

    const page = pages[url.split('?')[0] ?? ''];
    if (page === 'drop') return request.socket.destroy();
    if (typeof page === 'string') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(page);
    }

    response.writeHead(page ?? 404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<main>Not found</main>');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Collects the warnings of a test, so the test output stays clean. */
async function withoutWarnings<T>(run: (warnings: string[]) => Promise<T>): Promise<T> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(' '));

  try {
    return await run(warnings);
  } finally {
    console.warn = original;
  }
}

test('every page is read in the requested language and keyed by slug', async () => {
  const site = await startSite({
    '/koha/': '<main><h1>Koha-kirjastojärjestelmä</h1></main>',
    '/contact/': '<main><h1>Yhteystiedot</h1></main>',
  });

  try {
    const text = await loadPageText({
      origin: site.origin,
      lang: 'fi',
      slugs: ['/koha/', '/contact/'],
    });

    assert.equal(text.get('/koha/'), 'Koha-kirjastojärjestelmä');
    assert.equal(text.get('/contact/'), 'Yhteystiedot');
    assert.deepEqual(site.requests.sort(), ['/contact/?l=fi', '/koha/?l=fi']);
  } finally {
    await site.close();
  }
});

test('a page that cannot be read only loses its own text', async () => {
  const site = await startSite({
    '/koha/': '<main>Koha</main>',
    '/privacy/': 500,
    '/terms/': 'drop',
  });

  try {
    const text = await withoutWarnings(async (warnings) => {
      const result = await loadPageText({
        origin: site.origin,
        lang: 'gb',
        slugs: ['/koha/', '/privacy/', '/terms/'],
      });

      assert.equal(warnings.length, 2, 'both failures are reported');
      assert.ok(warnings.some((line) => line.includes('/privacy/') && line.includes('HTTP 500')));
      assert.ok(warnings.some((line) => line.includes('/terms/')));

      return result;
    });

    assert.equal(text.get('/koha/'), 'Koha');
    assert.equal(text.has('/privacy/'), false);
    assert.equal(text.has('/terms/'), false);
  } finally {
    await site.close();
  }
});

test('without cache every request reads the pages again', async () => {
  const site = await startSite({ '/terms/': '<main>Terms</main>' });

  try {
    const options = { origin: site.origin, lang: 'gb', slugs: ['/terms/'] } as const;

    await loadPageText(options);
    await loadPageText(options);

    assert.equal(site.requests.length, 2);
  } finally {
    await site.close();
  }
});

test('with cache a page is read once per process', async () => {
  const site = await startSite({ '/cached-page/': '<main>Cached</main>' });

  try {
    const options = {
      origin: site.origin,
      lang: 'fi',
      slugs: ['/cached-page/'],
      cache: true,
    } as const;

    const first = await loadPageText(options);
    const second = await loadPageText(options);

    assert.equal(first.get('/cached-page/'), 'Cached');
    assert.equal(second.get('/cached-page/'), 'Cached');
    assert.equal(site.requests.length, 1);
  } finally {
    await site.close();
  }
});
