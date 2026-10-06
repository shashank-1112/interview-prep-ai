import { expect, test, type Page } from '@playwright/test';
import { boot, center, nodeBox, openEditor, state } from './helpers';
import type { StallLayoutData } from '../src/domain/types';

/** 32 × 24 = 768 stalls in one hangar, plus the demo hangars. */
function bigLayout(): StallLayoutData {
  const stalls = [];
  let id = 1;
  for (let r = 0; r < 24; r++) {
    for (let c = 0; c < 32; c++) {
      const no = `P-${String(id).padStart(3, '0')}`;
      stalls.push({
        id, hangarId: 1, stallNo: no, stallCode: no, stallType: id % 17 === 0 ? 'Corner' : 'Standard',
        x: 0.5 + c * 2.5, y: 0.5 + r * 2.5, width: 2, height: 2, area: 4, basePrice: 1000, finalPrice: 1000,
        status: (['available', 'reserved', 'booked', 'blocked'] as const)[id % 4]!, exhibitorName: id % 4 === 1 || id % 4 === 2 ? 'Exhibitor' : null,
      });
      id++;
    }
  }
  return {
    ground: { id: 1, exhibitionName: 'Perf Expo', venueName: 'Big Hall', unit: 'meter', width: 100, height: 70, gridSize: 0.5 },
    hangars: [{ id: 1, name: 'Mega Hall', code: 'H-M', x: 2, y: 2, width: 81, height: 61 }],
    stalls,
    annotations: [],
  };
}

async function measureDrag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __raf: boolean };
    w.__frames = [];
    w.__raf = true;
    const tick = (t: number) => {
      w.__frames.push(t);
      if (w.__raf) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 90; i++) {
    await page.mouse.move(from.x + (dx * i) / 90, from.y + (dy * i) / 90);
  }
  await page.mouse.up();
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __raf: boolean };
    w.__raf = false;
    const f = w.__frames;
    const d = f.slice(1).map((t, i) => t - f[i]!).sort((a, b) => a - b);
    return { frames: d.length, median: d[Math.floor(d.length / 2)]!, p95: d[Math.floor(d.length * 0.95)]!, max: d[d.length - 1]! };
  });
}

/**
 * ~10,400 stalls across 40 hangars (8×5 grid, 260 stalls each) — the realistic shape of a
 * large exhibition (many mid-size hangars) rather than one giant one, so this exercises the
 * ground view's "one cached bitmap per hangar" approach at real scale (40 simultaneous cached
 * layers, not 1). See LAYOUT_PHASE1_DECISIONS.md item 6.
 */
function syntheticLayout(hangarCols: number, hangarRows: number, stallCols: number, stallRows: number): StallLayoutData {
  const hangars = [];
  const stalls = [];
  let hangarId = 1;
  let stallId = 1;
  const hangarW = stallCols * 2.5 + 1;
  const hangarH = stallRows * 2.5 + 1;
  const gap = 3;
  for (let hr = 0; hr < hangarRows; hr++) {
    for (let hc = 0; hc < hangarCols; hc++) {
      const hid = hangarId++;
      hangars.push({ id: hid, name: `Hall ${hid}`, code: `H-${hid}`, x: hc * (hangarW + gap), y: hr * (hangarH + gap), width: hangarW, height: hangarH });
      for (let r = 0; r < stallRows; r++) {
        for (let c = 0; c < stallCols; c++) {
          const no = `S${hid}-${String(stallId).padStart(4, '0')}`;
          stalls.push({
            id: stallId, hangarId: hid, stallNo: no, stallCode: no, stallType: stallId % 17 === 0 ? 'Corner' : 'Standard',
            x: 0.5 + c * 2.5, y: 0.5 + r * 2.5, width: 2, height: 2, area: 4, basePrice: 1000, finalPrice: 1000,
            status: (['available', 'reserved', 'booked', 'blocked'] as const)[stallId % 4]!, exhibitorName: stallId % 4 === 1 || stallId % 4 === 2 ? 'Exhibitor' : null,
          });
          stallId++;
        }
      }
    }
  }
  return {
    ground: { id: 1, exhibitionName: 'Mega Expo', venueName: 'Convention Centre', unit: 'meter', width: hangarCols * (hangarW + gap), height: hangarRows * (hangarH + gap), gridSize: 0.5 },
    hangars,
    stalls,
    annotations: [],
  };
}

test('loads and stays usable with 10,000+ stalls across 40 hangars (3s load target)', async ({ page }) => {
  test.setTimeout(60_000);
  const layout = syntheticLayout(8, 5, 26, 10);
  expect(layout.stalls.length).toBeGreaterThanOrEqual(10_000);

  const loadStart = Date.now();
  await boot(page, { initialLayout: layout });
  const loadMs = Date.now() - loadStart;
  console.log(`10k-stall load time: ${loadMs}ms (${layout.stalls.length} stalls, ${layout.hangars.length} hangars)`);
  expect(await state(page, (s) => s.data!.stalls.length)).toBe(layout.stalls.length);
  // boot()'s own fixed 250ms settle wait is included above — this is "navigate to ready to
  // interact", the same thing the BRD's 3-second response target is about.
  expect(loadMs).toBeLessThan(8_000); // generous bound for CI/headless; local runs are well under 3s

  // Ground view: drag while all 40 hangars (one cached bitmap each) are on screen.
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const frame = await nodeBox(page, 'ground', '#hangar-1 .hangar-frame');
  const ground = await measureDrag(page, { x: frame.x + 20, y: frame.y + 20 }, 150, 80);
  console.log('10k-stall ground drag frame ms', ground);
  expect(ground.median).toBeLessThan(25);
});

test('stays smooth dragging with 768 stalls on screen', async ({ page }) => {
  test.setTimeout(60_000);
  await boot(page, { initialLayout: bigLayout() });
  expect(await state(page, (s) => s.data!.stalls.length)).toBe(768);

  // Ground view: drag the whole hangar (its 768 stalls are one cached bitmap).
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const frame = await nodeBox(page, 'ground', '#hangar-1 .hangar-frame');
  const ground = await measureDrag(page, { x: frame.x + 20, y: frame.y + 20 }, 120, 60);
  console.log('ground drag frame ms', ground);
  await page.getByRole('button', { name: 'Editing layout' }).click();

  // Hangar editor: select-and-drag one stall while 767 others sit in the cached static layer.
  await openEditor(page, 1);
  const b = center(await nodeBox(page, 'editor', '#stall-400'));
  const editor = await measureDrag(page, b, 150, 80);
  console.log('editor drag frame ms', editor);
  expect(await state(page, (s) => [...s.editor.stallIds])).toEqual([400]);

  // Generous bounds for CI/headless machines; typical local runs sit at ~16.7ms median.
  expect(ground.median).toBeLessThan(25);
  expect(editor.median).toBeLessThan(25);
  expect(editor.p95).toBeLessThan(50);
});
