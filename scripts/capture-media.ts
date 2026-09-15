/**
 * Captures the README media (screenshots + drag-and-drop GIF) from the production build.
 *   npm run media
 * Drives the locally installed Microsoft Edge through playwright-core (no browser download).
 * Set CAPTURE_CHANNEL=chrome to use Google Chrome instead.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import gifenc from 'gifenc';
import pngjs from 'pngjs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview } from 'vite';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;

const root = join(import.meta.dirname, '..');
const outDir = join(root, 'docs/media');
const PORT = 4179;
const BASE_URL = `http://localhost:${PORT}/`;

interface Setup {
  level: string;
  theme?: 'light' | 'dark';
  placements?: Record<string, string>;
  notes?: Record<string, string[]>;
}

interface Point {
  x: number;
  y: number;
}

const saveData = (setup: Setup): string =>
  JSON.stringify({
    version: 1,
    levels: {
      [setup.level]: { placements: setup.placements ?? {}, notes: setup.notes ?? {}, done: false, checks: 0, hints: 0, moves: 0 },
    },
    settings: { theme: setup.theme ?? 'light', sound: false, seenHelp: true, lastLevel: setup.level },
  });

/** A visible arrow cursor, since headless screenshots don't include the real one. */
const CURSOR_SCRIPT = `
addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div');
  c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 3l14 8.2-6.2 1.6L9.6 19z" fill="#fffaf1" stroke="#3b2b20" stroke-width="2" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: 'fixed', left: 0, top: 0, zIndex: 9999, pointerEvents: 'none', transformOrigin: '6px 4px', transition: 'scale .12s', transform: 'translate(-100px,-100px)' });
  document.body.append(c);
  const move = (e) => { c.style.transform = 'translate(' + (e.clientX - 6) + 'px,' + (e.clientY - 4) + 'px)'; };
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerdown', (e) => { move(e); c.style.scale = '.82'; }, true);
  document.addEventListener('pointerup', () => { c.style.scale = '1'; }, true);
});`;

async function open(
  browser: Browser,
  setup: Setup,
  viewport: { width: number; height: number },
  { scale = 1, mobile = false, cursor = false } = {},
): Promise<Page> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: setup.theme ?? 'light',
  });
  await context.addInitScript(
    ({ key, data }) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, data);
        sessionStorage.setItem('seeded', '1');
      }
    },
    { key: 'inklink:v1', data: saveData(setup) },
  );
  if (cursor) await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForSelector('.board .cell');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return page;
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(outDir, name) });
  await page.context().close();
  console.log(`✔ ${name}`);
}

/** Samples frames in real time so animations keep their true speed in the GIF. */
class GifRecorder {
  private readonly page: Page;
  private readonly frames: { png: Buffer; at: number }[] = [];

  constructor(page: Page) {
    this.page = page;
  }

  async snap(): Promise<void> {
    this.frames.push({ png: await this.page.screenshot(), at: performance.now() });
  }

  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
    await this.snap();
  }

  /**
   * One shared palette (sampled across the recording) plus inter-frame diffing:
   * pixels unchanged since the previous frame become transparent, which LZW compresses to almost nothing.
   */
  save(path: string, endHold: number): void {
    const images = this.frames.map((f) => PNG.sync.read(f.png));
    const { width, height } = images[0];
    const size = width * height * 4;

    const samples = images.filter((_, i) => i % Math.ceil(images.length / 8) === 0 || i === images.length - 1);
    const pool = new Uint8Array(size * samples.length);
    samples.forEach((img, i) => pool.set(img.data, i * size));
    const palette = quantize(pool, 255);
    const transparentIndex = palette.length;
    const fullPalette = [...palette, [0, 0, 0]];

    const gif = GIFEncoder();
    let previous: Uint8Array | null = null;
    let written = 0;
    images.forEach((img, i) => {
      const next = this.frames[i + 1]?.at ?? this.frames[i].at + endHold;
      const delay = Math.max(20, Math.round(next - this.frames[i].at));
      const index = applyPalette(img.data, palette);
      const diff = new Uint8Array(index);
      if (previous) {
        for (let p = 0; p < diff.length; p++) if (index[p] === previous[p]) diff[p] = transparentIndex;
      }
      gif.writeFrame(diff, width, height, {
        palette: i === 0 ? fullPalette : undefined,
        delay,
        transparent: i > 0,
        transparentIndex,
        dispose: 1,
      });
      previous = index;
      written++;
    });
    gif.finish();
    writeFileSync(path, gif.bytes());
    console.log(`✔ ${path.split(/[\\/]/).pop()} (${written} quadros)`);
  }
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

async function recordDragGif(browser: Browser): Promise<void> {
  const page = await open(
    browser,
    { level: 'tesouros', placements: { bau: 'pirata+tesouro', xis: 'pirata+mapa', bussola: 'pirata+estrela' } },
    { width: 960, height: 620 },
    { cursor: true },
  );
  const rec = new GifRecorder(page);
  let pos: Point = { x: 820, y: 520 };

  const center = async (selector: string): Promise<Point> => {
    const box = (await page.locator(selector).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const glide = async (to: Point, steps: number) => {
    const from = pos;
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      pos = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      await page.mouse.move(pos.x, pos.y);
      await rec.snap();
    }
  };

  await page.mouse.move(pos.x, pos.y);
  await rec.pause(700);

  const moves: [string, string][] = [
    ['Meteorito', 'Astronauta com Tesouro'],
    ['Satélite', 'Astronauta com Mapa'],
    ['Constelação', 'Astronauta com Estrela'],
  ];
  for (const [piece, cell] of moves) {
    await glide(await center(`.piece[aria-label="${piece}"]`), 7);
    await page.mouse.down();
    await rec.snap();
    await glide(await center(`.cell[aria-label="${cell}"]`), 12);
    await page.mouse.up();
    for (let i = 0; i < 5; i++) await rec.snap();
    await rec.pause(250);
  }

  await glide(await center('.btn--primary'), 9);
  await page.mouse.down();
  await page.mouse.up();
  for (let i = 0; i < 14; i++) await rec.snap();
  await page.waitForSelector('.modal--win');
  await rec.pause(600);
  rec.save(join(outDir, 'drag-and-drop.gif'), 3000);
  await page.context().close();
}

const museumProgress: Setup = {
  level: 'museu',
  placements: {
    moldura: 'pintor+museu',
    estrelas: 'pintor+noite',
    ambar: 'pintor+ouro',
    roubo: 'detetive+ouro',
    meteoro: 'dinossauro+noite',
    mumia: 'farao+noite',
  },
  notes: { 'detetive+deserto': ['pegadas', 'miragem'], 'farao+deserto': ['miragem', 'escaravelho'] },
};

mkdirSync(outDir, { recursive: true });
const server = await preview({ root, logLevel: 'warn', preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch({ channel: process.env.CAPTURE_CHANNEL ?? 'msedge' });

try {
  const desktop = { width: 1280, height: 800 };

  await screenshot(await open(browser, museumProgress, desktop, { scale: 1.5 }), 'hero-light.png');

  const dark = await open(
    browser,
    {
      level: 'era-uma-vez',
      theme: 'dark',
      placements: { lobisomem: 'lobo+lua', doces: 'bruxa+floresta', cacador: 'princesa+floresta', veneno: 'bruxa+maca' },
    },
    desktop,
    { scale: 1.5 },
  );
  await dark.locator('.piece[aria-label="Uivo"]').click();
  await dark.waitForTimeout(400);
  await screenshot(dark, 'dark.png');

  await screenshot(
    await open(
      browser,
      { level: 'fazenda', placements: { ninho: 'galinha+fazendeiro', ferroada: 'abelha+fazendeiro', leite: 'vaca+cafe' } },
      { width: 390, height: 844 },
      { scale: 2, mobile: true },
    ),
    'mobile.png',
  );

  const hint = await open(browser, museumProgress, desktop, { scale: 1.5 });
  await hint.getByRole('button', { name: 'Dica' }).click();
  await hint.waitForSelector('.modal--hint');
  await hint.waitForTimeout(500);
  await screenshot(hint, 'hint.png');

  await recordDragGif(browser);
} finally {
  await browser.close();
  await server.close();
}
