import { defineMiddleware } from 'astro:middleware';
import { FALLBACK_LANG, isLanguage } from './i18n/ui';
import { canonicalRedirectTarget } from './utils/canonical-host';

const LANGUAGE_COOKIE = 'language';

/**
 * Pages that render a form with a signed anti-bot token. They must not be cached:
 * the token carries the time the page was rendered, and a stale copy would make
 * real submissions look like replays and they would be dropped.
 */
const UNCACHEABLE_PAGES = new Set(['/contact/', '/koha/']);

/**
 * Resolves the UI language once per request and stores it in `Astro.locals.lang`
 * so every page and component reads the same, request-scoped value.
 *
 * Precedence: `?l=` query parameter -> `language` cookie -> English fallback.
 * The choice is persisted in the `language` cookie (skipped for link prefetches).
 *
 * Before any of that, a request that arrives under the other name of the site is sent to the
 * address of the deployment - `site` in astro.config.mjs, which is the name the virtual host in
 * scripts/deploy/install.sh redirects to as well (src/utils/canonical-host.ts). A build is the
 * only place that has an address to redirect to: a development server serves whatever name it is
 * reached by, so that a checkout can be browsed under a LAN name (server.allowedHosts in
 * astro.config.mjs).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, locals, request, url } = context;

  const canonical = import.meta.env.PROD ? canonicalRedirectTarget(url, context.site) : undefined;
  if (canonical) {
    return context.redirect(canonical, 301);
  }

  const requested = url.searchParams.get('l');
  const stored = cookies.get(LANGUAGE_COOKIE)?.value;

  const lang = [requested, stored].find((value) => isLanguage(value)) ?? FALLBACK_LANG;

  locals.lang = lang;

  const isPrefetch = request.headers.get('Sec-Purpose') === 'prefetch';
  if (!isPrefetch && stored !== lang) {
    cookies.set(LANGUAGE_COOKIE, lang, { path: '/' });
  }

  const response = await next();

  if (request.method === 'GET' && UNCACHEABLE_PAGES.has(url.pathname)) {
    try {
      response.headers.set('Cache-Control', 'private, no-store');
    } catch {
      // A response whose headers cannot be changed is already uncacheable.
    }
  }

  return response;
});
