// Scroll performance benchmark.
//
// Measures Chromium scroll smoothness (frame pacing) and the associated style/raster
// work for a page, so compositor-heavy CSS (backdrop-filter, mix-blend-mode, infinite
// animations on blurred layers) cannot creep back in unnoticed.
//
// Usage:
//   npm run build && npm start &        # or: npm run dev
//   npm run bench:scroll                # defaults to http://127.0.0.1:4321/
//   npm run bench:scroll -- http://127.0.0.1:4321/koha/
//
// Requires the Playwright browsers (`npx playwright install chromium`).
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:4321/';
const TRACKED = new Set([
  'RasterTask',
  'Paint',
  'CompositeLayers',
  'UpdateLayerTree',
  'Layout',
  'UpdateLayoutTree',
  'RecalcStyle',
  'FunctionCall',
]);

const browser = await chromium.launch();

async function measure(throttling) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttling });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  const events = [];
  const onData = (payload) => events.push(...payload.value);
  cdp.on('Tracing.dataCollected', onData);
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc',
    transferMode: 'ReportEvents',
  });

  const frames = await page.evaluate(async () => {
    const deltas = [];
    let last = performance.now();
    for (let i = 0; i < 90; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      window.scrollBy(0, 90);
    }
    return deltas.slice(3);
  });

  await cdp.send('Tracing.end');
  await new Promise((resolve) => {
    cdp.once('Tracing.tracingComplete', resolve);
    setTimeout(resolve, 3000);
  });
  cdp.off('Tracing.dataCollected', onData);
  await page.close();

  const totals = {};
  for (const event of events) {
    if (!TRACKED.has(event.name)) continue;
    const bucket = (totals[event.name] ??= { count: 0, ms: 0 });
    bucket.count += 1;
    bucket.ms += (event.dur ?? 0) / 1000;
  }

  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

  return {
    cpu: throttling + 'x',
    frames: frames.length,
    p50: +at(0.5).toFixed(1),
    p95: +at(0.95).toFixed(1),
    max: +Math.max(...frames, 0).toFixed(1),
    janky: frames.filter((f) => f > 33.4).length,
    recalcCount: totals.UpdateLayoutTree?.count ?? 0,
    recalcMs: +(totals.UpdateLayoutTree?.ms ?? 0).toFixed(1),
    rasterMs: +(totals.RasterTask?.ms ?? 0).toFixed(1),
  };
}

const rows = [await measure(1), await measure(4)];
console.log('url: ' + url);
console.log('cpu  frames  p50    p95    max    janky(>33ms)  recalc        raster');
for (const row of rows) {
  console.log(
    [
      row.cpu.padEnd(4),
      String(row.frames).padEnd(7),
      String(row.p50).padEnd(6),
      String(row.p95).padEnd(6),
      String(row.max).padEnd(6),
      String(row.janky).padEnd(13),
      `${row.recalcCount}x ${row.recalcMs}ms`.padEnd(13),
      `${row.rasterMs}ms`,
    ].join(' '),
  );
}

await browser.close();
