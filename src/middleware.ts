import { defineMiddleware } from 'astro:middleware';
import { FALLBACK_LANG, resolveLanguage } from './i18n/ui';
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
 * Precedence: `?l=` query parameter -> `language` cookie -> English fallback. A value that names
 * no language of ours is skipped, with one exception: `gb`, the code the previous site wrote for
 * English, is read as `en` (LEGACY_LANG in src/i18n/ui.ts). The choice is persisted in the
 * `language` cookie (skipped for link prefetches), so a cookie still holding that old code is
 * rewritten with the one this site carries.
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

  const lang = [requested, stored].map(resolveLanguage).find((value) => value) ?? FALLBACK_LANG;

  locals.lang = lang;

  const isPrefetch = request.headers.get('Sec-Purpose') === 'prefetch';
  /*
   * The cookie records a choice, and only a choice: `?l=fi` asked for a language, and a cookie
   * that already holds one (including `gb`, the name the previous site used) is rewritten to the
   * name this site carries. A visitor who asked for nothing is served the fallback and is given
   * no cookie for it - a `Set-Cookie` on every response is what kept these pages out of every
   * shared cache, and a crawler that carries no cookie met one on every request it made.
   */
  const choseALanguage = requested !== null || stored !== undefined;
  if (!isPrefetch && choseALanguage && stored !== lang) {
    cookies.set(LANGUAGE_COOKIE, lang, { path: '/' });
  }

  const response = await next();

  if (request.method === 'GET') {
    try {
      if (UNCACHEABLE_PAGES.has(url.pathname)) {
        response.headers.set('Cache-Control', 'private, no-store');
      } else if (response.status >= 200 && response.status < 300 && !response.headers.has('Cache-Control')) {
        /*
         * A page is the same document for every visitor except for the language the cookie
         * holds, so it can be cached for a moment - and it has to say that it varies by cookie,
         * or a shared cache would hand the Finnish page to a visitor who chose English. A
         * minute in the browser, five in a shared cache: long enough to take the repeat of a
         * navigation off the server, short enough that a deploy is not served from a cache.
         *
         * Only a successful answer: a 404 or a 500 that a cache keeps for five minutes is a
         * page that stays broken after it was fixed.
         */
        response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');

        const vary = response.headers.get('Vary');
        if (!vary) {
          response.headers.set('Vary', 'Cookie');
        } else if (!/\bcookie\b/i.test(vary)) {
          response.headers.set('Vary', `${vary}, Cookie`);
        }
      }
    } catch {
      // A response whose headers cannot be changed is already uncacheable.
    }
  }

  return response;
});
