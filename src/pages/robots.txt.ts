import type { APIRoute } from 'astro';
import { SITE_URL } from '../config';

export const GET: APIRoute = () => {
  const sitemapURL = new URL('/sitemap.xml', SITE_URL);

  return new Response(`User-agent: *
Allow: /
# The palette's search index is a JSON endpoint, not a page, and answering one request for it
# makes a cold server render six pages of the site. Nothing is gained by letting a crawler ask.
Disallow: /search-index.json
Sitemap: ${sitemapURL.href}
`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
