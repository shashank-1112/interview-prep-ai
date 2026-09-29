import { expect, test } from '@playwright/test';
import { boot, center, drag, nodeBox, onGrid, openEditor, pxPerUnit, state } from './helpers';

test.beforeEach(async ({ page }) => {
  await boot(page);
  await openEditor(page, 1);
});

const stall = (page: import('@playwright/test').Page, id: number) =>
  state(page, new Function('s', `return s.data.stalls.find((x) => x.id === ${id})`) as never) as Promise<{ x: number; y: number; width: number; height: number; status: string }>;

test('select-and-drag an unselected stall in one gesture, snapped to grid', async ({ page }) => {
  const ppu = await pxPerUnit(page, 'editor');
  const b = await nodeBox(page, 'editor', '#stall-12');
  const from = center(b);
  await drag(page, from, { x: from.x + 1.2 * ppu, y: from.y + 2.6 * ppu });
  expect(await state(page, (s) => [...s.editor.stallIds])).toEqual([12]);
  const s12 = await stall(page, 12);
  expect(s12.x).toBeCloseTo(12.5, 5);
  expect(s12.y).toBeCloseTo(9, 5);
  expect(onGrid(s12.x) && onGrid(s12.y)).toBe(true);

  await page.keyboard.press('Control+z');
  const back = await stall(page, 12);
  expect([back.x, back.y]).toEqual([11.5, 6.5]);
  await page.keyboard.press('Control+Shift+z');
  expect((await stall(page, 12)).x).toBeCloseTo(12.5, 5);
});

test('shift-click builds a multi-selection that drags together', async ({ page }) => {
  const ppu = await pxPerUnit(page, 'editor');
  const b1 = center(await nodeBox(page, 'editor', '#stall-1'));
  const b2 = center(await nodeBox(page, 'editor', '#stall-6'));
  await page.mouse.click(b1.x, b1.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(b2.x, b2.y);
  await page.keyboard.up('Shift');
  expect(await state(page, (s) => [...s.editor.stallIds].sort())).toEqual([1, 6]);

  const now = center(await nodeBox(page, 'editor', '#stall-6'));
  await drag(page, now, { x: now.x, y: now.y + 6.5 * ppu });
  const [s1, s6] = [await stall(page, 1), await stall(page, 6)];
  expect(s1.y - 1.5).toBeCloseTo(s6.y - 4, 5);
  expect(s1.y).toBeGreaterThan(1.5);
});

test('marquee-selects the stalls it touches', async ({ page }) => {
  const a = await nodeBox(page, 'editor', '#stall-9');
  const c = await nodeBox(page, 'editor', '#stall-11');
  await drag(page, { x: a.x - 6, y: a.y + a.height + 12 }, { x: c.x + c.width - 5, y: c.y + c.height - 5 });
  expect(await state(page, (s) => [...s.editor.stallIds].sort((x, y) => x - y))).toEqual([9, 10, 11]);
  await expect(page.getByTestId('selection-announcer')).toHaveText('3 stalls selected.');
});

test('resizes a stall with the Transformer and clamps to gridSize × 2', async ({ page }) => {
  const ppu = await pxPerUnit(page, 'editor');
  const b = center(await nodeBox(page, 'editor', '#stall-4'));
  await page.mouse.click(b.x, b.y);
  const anchor = center(await nodeBox(page, 'editor', '.middle-right'));
  await drag(page, anchor, { x: anchor.x + 1.1 * ppu, y: anchor.y });
  const grown = await stall(page, 4);
  expect(grown.width).toBeCloseTo(4, 5);

  const a2 = center(await nodeBox(page, 'editor', '.middle-right'));
  await drag(page, a2, { x: a2.x - 10 * ppu, y: a2.y });
  const shrunk = await stall(page, 4);
  expect(shrunk.width).toBeGreaterThanOrEqual(1);
  expect(onGrid(shrunk.width)).toBe(true);
});

test('align, duplicate, merge and split from the toolbar', async ({ page }) => {
  await page.keyboard.press('Control+a');
  expect(await state(page, (s) => s.editor.stallIds.size)).toBe(17);

  // Select A-01 and A-05 (stacked) and align left — they're already aligned, so pick A-01 + A-06.
  const b1 = center(await nodeBox(page, 'editor', '#stall-1'));
  const b6 = center(await nodeBox(page, 'editor', '#stall-6'));
  await page.mouse.click(b1.x, b1.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(b6.x, b6.y);
  await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'Align left' }).click();
  expect((await stall(page, 6)).x).toBe(1);
  await page.keyboard.press('Control+z');

  // Duplicate A-12 via Ctrl+D.
  const b12 = center(await nodeBox(page, 'editor', '#stall-12'));
  await page.mouse.click(b12.x, b12.y);
  await page.keyboard.press('Control+d');
  expect(await state(page, (s) => s.data!.stalls.length)).toBe(43);

  // Split the Premium A-P1 left/right.
  const p1 = center(await nodeBox(page, 'editor', '#stall-13'));
  await page.mouse.click(p1.x, p1.y);
  await page.getByRole('button', { name: 'Split left / right' }).click();
  await page.getByRole('alertdialog', { name: 'Split Stall' }).getByRole('button', { name: 'Split' }).click();
  const halves = await state(page, (s) => s.data!.stalls.filter((x) => x.stallNo.startsWith('A-P1-')).map((x) => [x.stallNo, x.width, x.basePrice]));
  expect(halves).toEqual([
    ['A-P1-A', 2, 32500],
    ['A-P1-B', 2, 32500],
  ]);

  // The two halves are selected and adjacent → merge back.
  await page.getByRole('button', { name: 'Merge two adjacent stalls' }).click();
  await page.getByRole('alertdialog', { name: 'Merge Stalls' }).getByRole('button', { name: 'Merge' }).click();
  const merged = await state(page, (s) => s.data!.stalls.find((x) => x.stallNo === 'A-P1-A+A-P1-B'));
  expect(merged).toMatchObject({ width: 4, height: 4, basePrice: 65000 });
});

test('booking workflow: reserve, book, cancel with confirmation', async ({ page }) => {
  const b = center(await nodeBox(page, 'editor', '#stall-1'));
  await page.mouse.click(b.x, b.y);
  const panel = page.getByRole('complementary', { name: 'Selection details' });
  await panel.getByRole('button', { name: 'Reserve' }).click();
  await panel.getByLabel(/Exhibitor name/).fill('Acme Corp');
  await panel.getByRole('button', { name: 'Confirm Reserve' }).click();
  expect(await stall(page, 1)).toMatchObject({ status: 'reserved', exhibitorName: 'Acme Corp' } as never);

  await panel.getByRole('button', { name: 'Book' }).click();
  await expect(panel.getByLabel(/Exhibitor name/)).toHaveValue('Acme Corp');
  await panel.getByRole('button', { name: 'Confirm Book' }).click();
  expect((await stall(page, 1)).status).toBe('booked');

  await panel.getByRole('button', { name: 'Cancel Booking' }).click();
  await page.getByRole('alertdialog', { name: 'Cancel Booking' }).getByRole('button', { name: 'Cancel Booking' }).click();
  expect(await stall(page, 1)).toMatchObject({ status: 'available', exhibitorName: null } as never);
});

test('Esc clears the selection, then closes the editor', async ({ page }) => {
  const b = center(await nodeBox(page, 'editor', '#stall-1'));
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Escape');
  expect(await state(page, (s) => s.editor.stallIds.size)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('hangar-editor')).toBeHidden();
});
