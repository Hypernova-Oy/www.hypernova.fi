import { defineMiddleware } from 'astro:middleware';
import { FALLBACK_LANG, isLanguage } from './i18n/ui';

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
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, locals, request, url } = context;

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
