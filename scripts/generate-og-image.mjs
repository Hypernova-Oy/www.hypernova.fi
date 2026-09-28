// Social preview card generator.
//
// The card that social platforms show when hypernova.fi is shared is the raster file
// public/og-image.png, declared as `og:image` in src/layouts/BaseLayout.astro. Because it is
// a raster, it has to be committed, and this script is how it gets made: the card is composed
// from the brand assets in the repo instead of by hand, so it can be regenerated whenever the
// mark, the wordmark or the palette changes.
//
// Chromium renders it, so the Ocra wordmark and the Inter tagline are the real fonts the site
// ships, not lookalikes. They are embedded as data URLs together with the mark, which keeps
// the rendering independent of what is installed on the machine and of the network.
//
// Usage:
//   npm run og:image                    # writes public/og-image.png
//   npm run og:image -- /tmp/card.png   # writes elsewhere, for eyeballing a change
//
// Requires the Playwright browsers (`npx playwright install chromium`).
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

/** The size platforms crop to for a large preview card. Declared as og:image:* in the layout. */
const WIDTH = 1200;
const HEIGHT = 630;

const ROOT = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.argv[2] ?? path.join(ROOT, 'public/og-image.png'));

// Colours mirror the @theme tokens in src/styles/global.css.
const NIGHT = '#14161b'; // --color-night, the dark page background
const MUTED = '#b3b9c4'; // --color-primary-400, supporting text on dark surfaces
const GLOW_COOL = '#4a515d'; // --color-primary-900, the cool wash in the hero
const GLOW_WARM = '#134e4a'; // --color-accent-900, the warm wash in the hero

// Text mirrors src/config.ts (SITE_TITLE, SITE_DESCRIPTION). This script runs outside the
// Astro build, so those constants are copied here rather than imported.
const BRAND_NAME = 'hypernova';
const TAGLINE = 'Cost-effective Open Source Services';

/** Reads a file into the data URL the page embeds, so nothing is fetched while rendering. */
async function dataUrl(file, mime) {
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

const [mark, ocra, inter] = await Promise.all([
  dataUrl(path.join(ROOT, 'src/images/hypernova-logo.png'), 'image/png'),
  dataUrl(path.join(ROOT, 'src/assets/fonts/ocra.woff2'), 'font/woff2'),
  dataUrl(path.join(ROOT, 'src/assets/fonts/inter-latin.woff2'), 'font/woff2'),
]);

// The lockup follows the site's own header: the dark mark on a white tile (as the Navbar
// renders it in dark mode, where the mark would otherwise disappear into the background),
// the wordmark in the brand font beneath it, and the site's description as the tagline.
// The dots and the two blurred washes are the hero's background, at card scale.
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: 'OCR-A';
        src: url('${ocra}') format('woff2');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'Inter Variable';
        src: url('${inter}') format('woff2');
        font-weight: 100 900;
        font-style: normal;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
      body {
        position: relative;
        overflow: hidden;
        background: ${NIGHT};
        color: #ffffff;
        font-family: 'Inter Variable', sans-serif;
      }
      .dots {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.05) 1px, transparent 0);
        background-size: 24px 24px;
        mask-image: linear-gradient(to bottom, #000, transparent 85%);
      }
      .glow { position: absolute; border-radius: 50%; filter: blur(64px); }
      .glow-cool { top: -180px; right: -200px; width: 760px; height: 560px; background: ${GLOW_COOL}; opacity: 0.45; }
      .glow-warm { bottom: -200px; left: -180px; width: 620px; height: 480px; background: ${GLOW_WARM}; opacity: 0.6; }
      .card {
        position: relative;
        display: flex;
        height: 100%;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .tile {
        display: flex;
        width: 156px;
        height: 156px;
        align-items: center;
        justify-content: center;
        border-radius: 36px;
        background: #ffffff;
        box-shadow: 0 28px 64px -24px rgba(0, 0, 0, 0.85);
      }
      .tile img { display: block; width: 128px; height: 128px; }
      .wordmark {
        margin-top: 46px;
        font-family: 'OCR-A', monospace;
        font-size: 96px;
        font-weight: 400;
        line-height: 1;
        letter-spacing: 0.01em;
      }
      .tagline {
        margin-top: 30px;
        font-size: 30px;
        font-weight: 500;
        letter-spacing: 0.06em;
        color: ${MUTED};
      }
    </style>
  </head>
  <body>
    <div class="dots"></div>
    <div class="glow glow-cool"></div>
    <div class="glow glow-warm"></div>
    <div class="card">
      <div class="tile"><img src="${mark}" alt="" /></div>
      <div class="wordmark">${BRAND_NAME}</div>
      <div class="tagline">${TAGLINE}</div>
    </div>
  </body>
</html>`;


const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: 'load' });

// Every asset travels inside the document, so the page is complete once it has loaded; but a
// silent fallback to a system font (or a mark that never decoded) would end up in the
// committed file unopposed, so the three of them are asserted instead of assumed.
const ready = await page.evaluate(async () => {
  await document.fonts.ready;
  return {
    ocra: document.fonts.check("96px 'OCR-A'"),
    inter: document.fonts.check("30px 'Inter Variable'"),
    mark: (document.querySelector('.tile img')?.naturalWidth ?? 0) > 0,
  };
});
if (!ready.ocra || !ready.inter || !ready.mark) {
  await browser.close();
  throw new Error(`the card did not render as expected: ${JSON.stringify(ready)}`);
}

const screenshot = await page.screenshot({ type: 'png' });
await browser.close();

const image = sharp(screenshot);
const { width, height } = await image.metadata();
if (width !== WIDTH || height !== HEIGHT) {
  throw new Error(`expected a ${WIDTH}x${HEIGHT} card, Chromium produced ${width}x${height}`);
}
await image.png({ compressionLevel: 9, effort: 10 }).toFile(output);

const { size } = await stat(output);
const shown = output.startsWith(ROOT) ? path.relative(ROOT, output) : output;
console.log(`wrote ${shown} ${width}x${height} ${Math.round(size / 1024)} kB`);
// Worth remembering when a platform keeps showing the previous card: previews are cached by
// URL, so a replaced file has to be refreshed through that platform's own debugger (or reach
// a URL the platform has not seen yet) before the new card shows up.

