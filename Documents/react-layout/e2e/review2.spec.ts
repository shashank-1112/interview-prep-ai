import { expect, test } from '@playwright/test';
import type Konva from 'konva';
import { boot, center, drag, nodeBox, openEditor, pxPerUnit, state } from './helpers';

test.beforeEach(async ({ page }) => {
  await boot(page);
});

const readout = (page: import('@playwright/test').Page, scope: 'ground' | 'editor') =>
  page.evaluate((sc) => {
    const l = window.__layoutTest__!.stages[sc]!.findOne('.size-readout') as Konva.Label;
    return l.visible() ? l.getText().text() : null;
  }, scope);

test('ground resize readout shows the true size at any zoom (review 2: cross-layer)', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const frame = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  await page.mouse.click(frame.x + frame.width - 10, frame.y + frame.height - 10);
  const ppu = await pxPerUnit(page, 'ground');
  const a = center(await nodeBox(page, 'ground', '.middle-right'));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 2 * ppu, a.y, { steps: 6 });
  expect(await readout(page, 'ground')).toBe('22 × 14 m');
  await page.mouse.up();
});

test('editor resize keeps untouched edges exact and a handle click adds no undo step', async ({ page }) => {
  await openEditor(page, 1);
  await page.evaluate(() => {
    const s = window.__layoutTest__!.getState();
    s.commit((d) => ({ ...d, stalls: d.stalls.map((x) => (x.id === 4 ? { ...x, width: 3.6 } : x)) }));
  });
  const ppu = await pxPerUnit(page, 'editor');
  const b = center(await nodeBox(page, 'editor', '#stall-4'));
  await page.mouse.click(b.x, b.y);
  const before = await state(page, (s) => s.history.past.length);
  const anchor = center(await nodeBox(page, 'editor', '.bottom-center'));
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.mouse.up(); // click without moving
  expect(await state(page, (s) => s.history.past.length)).toBe(before);
  await drag(page, anchor, { x: anchor.x, y: anchor.y + 1 * ppu });
  expect(await state(page, (s) => s.data!.stalls.find((x) => x.id === 4)!)).toMatchObject({ width: 3.6, height: 3 });
});

test('Ctrl+Z pressed mid-resize is ignored (review 2: stopTransform on data change)', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const frame = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  await page.mouse.click(frame.x + frame.width - 10, frame.y + frame.height - 10);
  await page.keyboard.press('ArrowDown'); // one undoable nudge
  expect(await state(page, (s) => s.data!.hangars.find((h) => h.id === 3)!.y)).toBe(2.5);
  const ppu = await pxPerUnit(page, 'ground');
  const a = center(await nodeBox(page, 'ground', '.middle-right'));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 2 * ppu, a.y, { steps: 6 });
  await page.keyboard.press('Control+z');
  await page.mouse.up();
  const h = await state(page, (s) => s.data!.hangars.find((x) => x.id === 3)!);
  expect(h).toMatchObject({ y: 2.5, width: 22 }); // resize committed, undo ignored mid-gesture
});

test('hangar-scoped markers show in the ground view', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__layoutTest__!.getState();
    s.commit((d) => ({ ...d, annotations: [{ id: 1, type: 'washroom', label: 'WC', x: 20, y: 12, width: 4, height: 3, hangarId: 1 }] }));
  });
  await page.waitForTimeout(100);
  const found = await page.evaluate(() => !!(window.__layoutTest__!.stages.ground!.findOne('#hangar-1') as Konva.Group).findOne('.annotation-washroom'));
  expect(found).toBe(true);
  await expect(page.getByRole('navigation', { name: 'Layout objects' })).toContainText('Washroom: WC');
});
