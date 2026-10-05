/**
 * The site answers on two names - `www.hypernova.fi` and `hypernova.fi`, or whatever the
 * deployment's `--domain` is and its `www` twin - the certificate covers both, and both reach
 * the same pages. But only one of them is the address of the deployment: its `site`, which is
 * astro.config.mjs's `SITE_URL` (HYPERNOVA_SITE_URL, set from `--domain` by
 * scripts/deploy/install.sh). A request that arrives under the other name is sent there with a
 * permanent redirect, path and query kept, so a crawler and a browser see one host.
 *
 * The virtual host answers that first, without a trip through Node (canonical_host_directives in
 * scripts/deploy/install.sh is the block). This module is the other half, for a request that does
 * not go through that virtual host: the `:443` host certbot wrote once, which the deploy does not
 * rewrite when the certificate is already there, or another front end altogether.
 *
 * It is dependency-free and takes the site as an argument, so the rule is testable without a
 * server.
 */

/**
 * The URL to send a request to, or `undefined` when there is nothing to send anywhere: the
 * request is already on the address of the deployment, the site is not configured, the host is
 * neither name of the site (a development server, or an address the site does not answer on), or
 * the request is the challenge of a certificate renewal.
 *
 * @param requestUrl the URL the request was made with
 * @param site the address of the deployment, `site` from astro.config.mjs (`context.site`)
 */
export function canonicalRedirectTarget(requestUrl: URL, site: URL | undefined): string | undefined {
  if (!site?.host) {
    return undefined;
  }

  const canonical = site.host.toLowerCase();
  const otherName = canonical.startsWith('www.') ? canonical.slice(4) : `www.${canonical}`;

  // A Host header carries the port when the request does not come in on 80 or 443.
  const requested = requestUrl.host.toLowerCase().replace(/:\d+$/, '');

  if (requested !== otherName) {
    return undefined;
  }

  // The challenge of a certificate renewal is answered on either name, with nothing in between
  // to follow - the same exception the virtual host makes (canonical_host_directives).
  if (requestUrl.pathname.startsWith('/.well-known/acme-challenge/')) {
    return undefined;
  }

  // `pathname` and `search` are what the server received, so /koha/?page=2 stays the page the
  // visitor asked for, and a query string is carried over unchanged.
  return new URL(`${requestUrl.pathname}${requestUrl.search}`, site).href;
}
