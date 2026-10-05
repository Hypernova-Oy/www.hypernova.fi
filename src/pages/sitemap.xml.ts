import type { APIRoute } from 'astro';
import { SITE_URL } from '../config';

/*
 * The addresses the site serves, in the order they are advertised.
 *
 * Nothing here carries a `<lastmod>`: no page has a date of its own, and the entries that did -
 * the blog posts and the changelog - are retired (see `redirects` in astro.config.mjs). A date
 * guessed from the build would be a date a crawler believes and the site cannot back up.
 */
const staticEntries: string[] = [
  '/',
  '/services/',
  '/koha/',
  '/lainuri-checkout-machine/',
  '/toveri-access-control-device/',
  '/contact/',
  '/privacy/',
  '/terms/',
];

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const GET: APIRoute = () => {
  const urls = staticEntries
    .map((path) => `  <url>\n    <loc>${escapeXml(new URL(path, SITE_URL).href)}</loc>\n  </url>`)
    .join('\n');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
