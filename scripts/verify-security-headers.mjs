/*
 * Checks a running deployment against the security policy it advertises: that every inline
 * script and style of every page is covered by a hash in the response's Content Security
 * Policy, that no page carries a `style="..."` attribute (which no hash can cover), that every
 * external script is same-origin, that the policy keeps Trusted Types on and 'unsafe-inline'
 * off, and that the responses carry the transport headers the virtual host is configured with.
 *
 *   node scripts/verify-security-headers.mjs                       # the deployment's own pages
 *   node scripts/verify-security-headers.mjs http://127.0.0.1:4399  # a local `npm start`
 *   node scripts/verify-security-headers.mjs --require-headers URL  # also fail on missing HSTS/COOP
 *   node scripts/verify-security-headers.mjs URL URL ...            # just these pages
 *
 * The pages come from the deployment's own /sitemap.xml when no URL is given, so this checks
 * what the site says it publishes rather than a list kept here. The policy is a response header
 * that only the built server sends (`npm start`, which is what a deployment runs): the dev
 * server does not render one and cannot be checked.
 *
 * The transport headers are reported but only fail with --require-headers. HSTS, COOP and
 * X-Frame-Options are added by the virtual host (scripts/deploy/install.sh), not by the app, so
 * pointing this at the Node entry directly is expected to report them as missing - and a browser
 * is protected either way, because `frame-ancestors` is in the policy itself.
 */
import { createHash } from 'node:crypto';

const TRANSPORT_HEADERS = [
  ['strict-transport-security', /max-age=(\d+)/, (seconds) => Number(seconds) >= 31536000],
  ['cross-origin-opener-policy', /^same-origin$/],
  ['x-frame-options', /^DENY$/i],
  ['x-content-type-options', /^nosniff$/i],
  ['referrer-policy', /^strict-origin-when-cross-origin$/i],
];

const args = process.argv.slice(2);
const requireHeaders = args.includes('--require-headers');
const targets = args.filter((argument) => !argument.startsWith('--'));
const base = (targets.shift() ?? process.env.HYPERNOVA_SITE_URL ?? 'https://www.hypernova.fi').replace(/\/+$/, '');

/** The directives of a policy, as written: `script-src 'self' 'sha256-...'`. */
function directivesOf(policy) {
  const directives = new Map();

  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), sources);
  }

  return directives;
}

/** The hash a browser computes for the bytes between the tags of an inline script or style. */
function inlineHash(value) {
  return `sha256-${createHash('sha256').update(value).digest('base64')}`;
}

/** The hashes a directive lists, unquoted, and the rest of its sources. */
function sourcesOf(directives, name) {
  const sources = directives.get(name) ?? [];

  return {
    // A hash is written as `'sha256-...'` in the policy and computed without the quotes.
    hashes: new Set(
      sources.filter((source) => source.startsWith("'sha")).map((source) => source.slice(1, -1)),
    ),
    keywords: sources.filter((source) => !source.startsWith("'sha")),
  };
}

const problems = [];
const notes = [];

function problem(where, message) {
  problems.push(`${where}: ${message}`);
}

async function pagesToCheck() {
  if (targets.length > 0) return targets;

  const response = await fetch(`${base}/sitemap.xml`);
  if (!response.ok) throw new Error(`/sitemap.xml answered ${response.status}`);

  const xml = await response.text();
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (locations.length === 0) throw new Error('/sitemap.xml lists no page');

  // The sitemap names the deployment's public address; the paths are fetched from the base that
  // was asked for, so pointing this at a local `npm start` checks that server's pages.
  return locations.map((location) => new URL(new URL(location).pathname, `${base}/`).href);
}

async function checkPage(url) {
  const response = await fetch(url);
  const html = await response.text();
  const where = new URL(url).pathname;

  if (!response.ok) {
    problem(where, `answered ${response.status}`);
    return;
  }

  // A prerendered route carries the policy in a <meta> element instead of the header.
  const header = response.headers.get('content-security-policy');
  const meta = /<meta[^>]+http-equiv=["']content-security-policy["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const policy = header ?? meta?.[1];

  if (!policy) {
    problem(where, 'no Content Security Policy in the response and none in a <meta> element');
    return;
  }

  const directives = directivesOf(policy);
  const scripts = sourcesOf(directives, 'script-src');
  const styles = sourcesOf(directives, 'style-src');

  for (const [name, { keywords }] of [['script-src', scripts], ['style-src', styles]]) {
    for (const keyword of keywords) {
      if (keyword === "'unsafe-inline'" || keyword === "'unsafe-eval'") {
        problem(where, `${name} allows ${keyword}`);
      }
    }
  }

  if (!directives.has('require-trusted-types-for')) {
    problem(where, "the policy does not carry require-trusted-types-for 'script'");
  }

  // Every <script> the document sends: an external one has to be same-origin (or listed), an
  // inline one has to be covered by a hash of the exact bytes between its tags.
  for (const [, attributes, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const type = /type=["']([^"']+)["']/i.exec(attributes)?.[1]?.toLowerCase();
    const src = /src=["']([^"']+)["']/i.exec(attributes)?.[1];

    if (src) {
      const origin = src.startsWith('data:') ? 'data:' : new URL(src, url).origin;

      if (origin === 'data:' && !scripts.keywords.includes('data:')) {
        problem(where, `<script src="${src.slice(0, 48)}"> is a data: URL, which script-src refuses`);
      } else if (origin !== 'data:' && origin !== new URL(url).origin && !scripts.keywords.includes(origin)) {
        problem(where, `<script src="${src}"> comes from another origin and is not listed`);
      }
      continue;
    }

    // A data block (`application/ld+json`) is not executable and needs no hash.
    if (type && type !== 'module' && type !== 'text/javascript') continue;

    const hash = inlineHash(body);
    if (!scripts.hashes.has(hash)) {
      const label = type ? `<script type="${type}">` : '<script>';
      problem(where, `the inline ${label} of ${body.length} bytes has no hash in script-src (${hash})`);
    }
  }

  // Every <style> the document sends, and every style attribute - the latter cannot be covered
  // by a hash of the element at all: only 'unsafe-hashes' could, and it covers any value.
  for (const [, attributes, body] of html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)) {
    if (body.trim().length === 0 || attributes.includes('nonce')) continue;

    const hash = inlineHash(body);
    if (!styles.hashes.has(hash)) {
      problem(where, `the inline <style> of ${body.length} bytes has no hash in style-src (${hash})`);
    }
  }

  for (const [tag, value] of html.matchAll(/<[^>]+\sstyle=["']([^"']*)["']/gi)) {
    problem(where, `a style attribute is not covered by any hash (${tag.slice(0, 72).trim()}): ${value.slice(0, 60)}`);
  }

  for (const [name, pattern, validate] of TRANSPORT_HEADERS) {
    const value = response.headers.get(name);
    const match = value === null ? null : pattern.exec(value);
    const ok = match !== null && (validate ? validate(match) : true);

    if (!ok) {
      const message = `${name} is ${value === null ? 'missing' : `"${value}"`}`;
      if (requireHeaders) problem(where, message);
      else notes.push(`${where}: ${message} (the virtual host adds it, see scripts/deploy/install.sh)`);
    }
  }
}

let pages;
try {
  pages = await pagesToCheck();
} catch (error) {
  console.error(`the pages to check could not be listed: ${error.message}`);
  process.exit(1);
}

for (const page of pages) {
  try {
    await checkPage(page);
  } catch (error) {
    problem(new URL(page).pathname, `could not be fetched: ${error.message}`);
  }
}

for (const note of new Set(notes)) console.log(`- ${note}`);
for (const entry of problems) console.error(`! ${entry}`);

console.log(
  `\nchecked ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} on ${base}: ` +
    `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`,
);

process.exit(problems.length === 0 ? 0 : 1);
