import { expect, test } from '@playwright/test';
import { boot, drag, nodeBox, onGrid, pxPerUnit, state } from './helpers';

test.beforeEach(async ({ page }) => {
  await boot(page);
});

test('selects a hangar on click and shows its details', async ({ page }) => {
  const frame = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  await page.mouse.click(frame.x + frame.width - 10, frame.y + frame.height - 10);
  expect(await state(page, (s) => s.groundSelection)).toEqual({ kind: 'hangar', id: 3 });
  await expect(page.getByRole('button', { name: 'Open Hangar Editor' })).toBeVisible();
  await expect(page.getByTestId('selection-announcer')).toContainText('Hangar C');
});

test('drags a hangar in edit mode, snapping to the grid, and undo restores it', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const frame = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  const ppu = await pxPerUnit(page, 'ground');
  const from = { x: frame.x + frame.width / 2, y: frame.y + frame.height - 20 };
  await drag(page, from, { x: from.x + 3.3 * ppu, y: from.y + 5.2 * ppu });

  const h = await state(page, (s) => s.data!.hangars.find((x) => x.id === 3)!);
  expect(h.x).toBeGreaterThan(28);
  expect(h.y).toBeGreaterThan(2);
  expect(onGrid(h.x) && onGrid(h.y)).toBe(true);
  expect(h.x).toBeCloseTo(31.5, 0);
  expect(h.y).toBeCloseTo(7, 0);

  await page.keyboard.press('Control+z');
  const back = await state(page, (s) => s.data!.hangars.find((x) => x.id === 3)!);
  expect([back.x, back.y]).toEqual([28, 2]);
});

test('reverts a hangar drag that would overlap another hangar', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const c = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  const a = await nodeBox(page, 'ground', '#hangar-1 .hangar-frame');
  await drag(page, { x: c.x + 20, y: c.y + c.height - 20 }, { x: a.x + 40, y: a.y + a.height - 20 });
  await expect(page.getByText('Hangars cannot overlap')).toBeVisible();
  const h = await state(page, (s) => s.data!.hangars.find((x) => x.id === 3)!);
  expect([h.x, h.y]).toEqual([28, 2]);
});

test('resizes a hangar with the Transformer, snapped and clamped to its contents', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const frame = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  await page.mouse.click(frame.x + frame.width - 10, frame.y + frame.height - 10);
  const ppu = await pxPerUnit(page, 'ground');
  const anchor = await nodeBox(page, 'ground', '.bottom-right');
  const from = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  await drag(page, from, { x: from.x + 4.2 * ppu, y: from.y + 6.1 * ppu });
  const grown = await state(page, (s) => s.data!.hangars.find((x) => x.id === 3)!);
  expect(grown.width).toBeCloseTo(24, 0);
  expect(grown.height).toBeCloseTo(20, 0);
  expect(onGrid(grown.width) && onGrid(grown.height)).toBe(true);

  // Shrinking below the stalls' extent is refused by the transformer bound box.
  const a2 = await nodeBox(page, 'ground', '.bottom-right');
  const f2 = { x: a2.x + a2.width / 2, y: a2.y + a2.height / 2 };
  await drag(page, f2, { x: f2.x - 20 * ppu, y: f2.y - 16 * ppu });
  const shrunk = await state(page, (s) => s.data!.hangars.find((x) => x.id === 3)!);
  expect(shrunk.width).toBeGreaterThanOrEqual(20);
  expect(shrunk.height).toBeGreaterThanOrEqual(10.5);
});

test('persists changes to localStorage and reloads them', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const frame = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  const ppu = await pxPerUnit(page, 'ground');
  const from = { x: frame.x + frame.width / 2, y: frame.y + frame.height - 20 };
  await drag(page, from, { x: from.x, y: from.y + 4 * ppu });
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  const raw = await page.evaluate(() => localStorage.getItem('gs_stall_layout_v3'));
  expect(JSON.parse(raw!).hangars.find((h: { id: number }) => h.id === 3).y).toBe(6);
  await page.reload();
  await page.waitForFunction(() => window.__layoutTest__?.getState().loadState === 'ready');
  expect(await state(page, (s) => s.data!.hangars.find((x) => x.id === 3)!.y)).toBe(6);
});

test('migrates a v2 layout (no annotations) on load', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'gs_stall_layout_v2',
      JSON.stringify({
        ground: { id: 1, exhibitionName: 'Legacy Expo', venueName: 'Old Hall', unit: 'meter', width: 30, height: 20, gridSize: 0.5 },
        hangars: [{ id: 1, name: 'Hall 1', code: 'H-1', x: 1, y: 1, width: 10, height: 8 }],
        stalls: [],
      }),
    );
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Legacy Expo', level: 1 })).toBeVisible();
  const v3 = await page.evaluate(() => JSON.parse(localStorage.getItem('gs_stall_layout_v3')!));
  expect(v3.annotations).toEqual([]);
});

test('generates a new ground from the form', async ({ page }) => {
  await page.getByRole('button', { name: 'Generate ground' }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate Ground' });
  await dialog.getByLabel('Exhibition name').fill('Auto Expo');
  await dialog.getByLabel('Venue').fill('Hall 9');
  await dialog.getByLabel('Number of hangars').fill('4');
  await dialog.getByRole('button', { name: 'Auto-fit size' }).click();
  await dialog.getByRole('button', { name: 'Generate' }).click();
  await expect(dialog).toBeHidden();
  const d = await state(page, (s) => s.data!);
  expect(d.ground.exhibitionName).toBe('Auto Expo');
  expect(d.hangars.map((h) => h.name)).toEqual(['Hangar A', 'Hangar B', 'Hangar C', 'Hangar D']);
  expect(d.stalls).toHaveLength(0);
});

test('keyboard: ? opens help, Esc closes; Delete asks to confirm', async ({ page }) => {
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeHidden();

  const frame = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  await page.mouse.click(frame.x + frame.width - 10, frame.y + frame.height - 10);
  await page.keyboard.press('Delete');
  const confirm = page.getByRole('alertdialog', { name: 'Delete Hangar' });
  await expect(confirm).toContainText('10 stall(s)');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  expect(await state(page, (s) => s.data!.hangars.length)).toBe(2);
  await page.keyboard.press('Control+z');
  expect(await state(page, (s) => [s.data!.hangars.length, s.data!.stalls.length])).toEqual([3, 42]);
});

test('duplicates a hangar with its stalls (Ctrl+D) and reports when the ground is full', async ({ page }) => {
  const frame = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  await page.mouse.click(frame.x + frame.width - 10, frame.y + frame.height - 10);
  await page.keyboard.press('Control+d');
  const d = await state(page, (s) => s.data!);
  expect(d.hangars).toHaveLength(4);
  const copy = d.hangars[3]!;
  expect(copy).toMatchObject({ name: 'Hangar D', code: 'H-D', width: 20, height: 14, x: 28, y: 18 });
  const copied = d.stalls.filter((s) => s.hangarId === copy.id);
  expect(copied).toHaveLength(10);
  expect(copied.every((s) => s.status === 'available' && s.exhibitorName === null)).toBe(true);
  expect(copied[0]!.stallNo).toBe('D-01');
  await expect(page.getByTestId('selection-announcer')).toContainText('Hangar D');

  // The demo ground has no room for a third 20×14 hangar: the empty duplicate reports it and changes nothing.
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByText(/No free space on the ground/)).toBeVisible();
  expect(await state(page, (s) => s.data!.hangars.length)).toBe(4);

  await page.keyboard.press('Control+z');
  expect(await state(page, (s) => [s.data!.hangars.length, s.data!.stalls.length])).toEqual([3, 42]);
});
