/*
 * Page views, counted by our own Matomo instance (analytics.hypernova.fi), without cookies.
 *
 * Three things shape this file.
 *
 * It is a bundled module rather than the snippet Matomo hands out. That snippet is an inline
 * script, and this site's Content Security Policy allows an inline script only by hash - the theme
 * initialiser is the one such script, and its hash is computed from its file. A module under
 * /_astro/ needs no hash: `'self'` covers it, and the tracker it loads (matomo.js on
 * analytics.hypernova.fi) is named in `script-src` as the one other origin allowed to run code
 * here.
 *
 * It disables cookies. Section 8 of the privacy policy tells a visitor that this site stores only
 * their language and their colour theme on their device, and that stays true: the tracker counts
 * the page view and leaves nothing behind, so there is no cookie banner to add and nothing to
 * withdraw.
 *
 * It counts client-side navigations. The site uses Astro's ClientRouter, which replaces the
 * document without a page load, so one page view is counted when the page loads and one per
 * `astro:page-load` after that - which is what makes the numbers match the pages a visitor read.
 *
 * Only the production host is counted: a staging deployment of this same bundle carries a
 * different `site` (HYPERNOVA_SITE_URL) and must not add to the live numbers.
 */
import { MATOMO_SITE_ID, MATOMO_URL, SITE_URL } from '../config';

type Paq = unknown[][];

const PRODUCTION_HOST = 'www.hypernova.fi';

const siteHost = (() => {
  try {
    return new URL(import.meta.env.SITE ?? SITE_URL).host;
  } catch {
    return '';
  }
})();

if (siteHost === PRODUCTION_HOST) {
  const browser = window as typeof window & { _paq?: Paq };
  const queue: Paq = (browser._paq = browser._paq ?? []);

  queue.push(['disableCookies']);
  queue.push(['setTrackerUrl', `${MATOMO_URL}matomo.php`]);
  queue.push(['setSiteId', MATOMO_SITE_ID]);

  let trackerRequested = false;

  const countPageView = () => {
    queue.push(['setCustomUrl', window.location.href]);
    queue.push(['setDocumentTitle', document.title]);
    queue.push(['trackPageView']);
  };

  // Fired once for the page that was requested, and again for every navigation the router makes.
  document.addEventListener('astro:page-load', () => {
    if (!trackerRequested) {
      trackerRequested = true;
      const tracker = document.createElement('script');
      tracker.src = `${MATOMO_URL}matomo.js`;
      tracker.async = true;
      document.head.append(tracker);
    }
    countPageView();
  });
}
