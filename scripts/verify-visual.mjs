import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseUrl = process.env.VERIFY_URL || 'http://127.0.0.1:5173/';
const outputDir = new URL('../artifacts/screenshots/', import.meta.url);

const targets = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

for (const target of targets) {
  const page = await browser.newPage({
    viewport: target.viewport,
    isMobile: Boolean(target.isMobile),
    deviceScaleFactor: target.isMobile ? 2 : 1,
  });

  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForSelector('canvas.campus-canvas', { timeout: 12000 }).catch(async (error) => {
    const html = await page.locator('body').innerText().catch(() => '');
    throw new Error(`${target.name}: canvas did not render. ${error.message}. Browser errors: ${errors.join(' | ')}. Body: ${html.slice(0, 500)}`);
  });
  await page.waitForSelector('.device-row', { timeout: 12000 });
  await page.waitForTimeout(900);

  const canvasStats = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.campus-canvas');
    const rect = canvas.getBoundingClientRect();
    const sample = document.createElement('canvas');
    sample.width = 180;
    sample.height = 180;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
    const data = ctx.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Set();
    let nonBackground = 0;
    let bright = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      colors.add(`${Math.round(r / 16)}-${Math.round(g / 16)}-${Math.round(b / 16)}`);
      const delta = Math.abs(r - 247) + Math.abs(g - 248) + Math.abs(b - 245);
      if (delta > 20) nonBackground += 1;
      if ((r + g + b) / 3 > 245) bright += 1;
    }

    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      uniqueColors: colors.size,
      nonBackgroundRatio: Number((nonBackground / (data.length / 4)).toFixed(4)),
      brightRatio: Number((bright / (data.length / 4)).toFixed(4)),
    };
  });

  const layoutStats = await page.evaluate(() => {
    const toolbar = document.querySelector('.scene-toolbar')?.getBoundingClientRect();
    const modeStrip = document.querySelector('.mode-strip')?.getBoundingClientRect();
    const viewport = document.querySelector('.viewport-panel')?.getBoundingClientRect();
    const shell = document.querySelector('.app-shell')?.getBoundingClientRect();

    return {
      toolbarVisible: Boolean(toolbar && viewport && toolbar.left >= viewport.left && toolbar.top >= viewport.top),
      modeStripVisible: Boolean(modeStrip && viewport && modeStrip.bottom <= viewport.bottom + 1),
      bodyWidth: Math.round(document.documentElement.scrollWidth),
      viewportWidth: Math.round(window.innerWidth),
      shellHeight: Math.round(shell?.height || 0),
    };
  });

  await page.getByRole('button', { name: /用戶流量/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: fileURLToPath(new URL(`${target.name}.png`, outputDir)), fullPage: true });

  if (errors.length > 0) {
    throw new Error(`${target.name}: browser errors: ${errors.join(' | ')}`);
  }

  if (canvasStats.width < 320 || canvasStats.height < 320) {
    throw new Error(`${target.name}: canvas too small ${canvasStats.width}x${canvasStats.height}`);
  }

  if (canvasStats.uniqueColors < 28 || canvasStats.nonBackgroundRatio < 0.04) {
    throw new Error(`${target.name}: canvas appears blank ${JSON.stringify(canvasStats)}`);
  }

  if (!layoutStats.toolbarVisible || !layoutStats.modeStripVisible) {
    throw new Error(`${target.name}: viewport controls are out of frame ${JSON.stringify(layoutStats)}`);
  }

  results.push({ target: target.name, canvasStats, layoutStats });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
