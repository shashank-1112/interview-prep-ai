import { expect, test, type Page } from '@playwright/test';
import { boot, center, nodeBox, openEditor, state } from './helpers';

/** 32 × 24 = 768 stalls in one hangar, plus the demo hangars. */
function bigLayout() {
  const stalls = [];
  let id = 1;
  for (let r = 0; r < 24; r++) {
    for (let c = 0; c < 32; c++) {
      const no = `P-${String(id).padStart(3, '0')}`;
      stalls.push({
        id, hangarId: 1, stallNo: no, stallCode: no, stallType: id % 17 === 0 ? 'Corner' : 'Standard',
        x: 0.5 + c * 2.5, y: 0.5 + r * 2.5, width: 2, height: 2, area: 4, basePrice: 1000, finalPrice: 1000,
        status: (['available', 'reserved', 'booked', 'blocked'] as const)[id % 4], exhibitorName: id % 4 === 1 || id % 4 === 2 ? 'Exhibitor' : null,
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

test('stays smooth dragging with 768 stalls on screen', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('gs_stall_layout_v3', JSON.stringify(data));
      sessionStorage.setItem('seeded', '1');
    }
  }, bigLayout());
  await boot(page);
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
