import { expect, test } from '@playwright/test';
import type Konva from 'konva';
import { boot, center, drag, nodeBox, nodeBoxOrNull, openEditor, pxPerUnit, state } from './helpers';

test.beforeEach(async ({ page }) => {
  await boot(page);
});

async function addRoad(page: import('@playwright/test').Page, side: 'top' | 'bottom' | 'left' | 'right' = 'top') {
  await page.getByRole('button', { name: 'Road', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Road' });
  await dialog.getByLabel('Label').fill('Service Road');
  await dialog.getByLabel('Beside which side').selectOption(side);
  await dialog.getByRole('button', { name: 'Add road' }).click();
  await expect(dialog).toBeHidden();
}

test('adds a road outside the ground and a parking area beside it', async ({ page }) => {
  await addRoad(page, 'top');
  await page.getByRole('button', { name: 'Parking', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Parking Area' });
  await dialog.getByLabel('Beside which side').selectOption('top');
  await dialog.getByRole('button', { name: 'Add parking' }).click();
  const a = await state(page, (s) => s.data!.annotations);
  expect(a[0]).toMatchObject({ type: 'road', label: 'Service Road', x: 0, y: -6, width: 60, height: 6 });
  // Parking on the same side is pushed out beyond the road.
  expect(a[1]!.type).toBe('parking');
  expect(a[1]!.y + a[1]!.height).toBeLessThanOrEqual(-6);
  await expect(page.getByRole('complementary', { name: 'Sidebar' })).toContainText('outside the ground');
});

test('dragging a road onto the ground is reverted; along the outside it sticks', async ({ page }) => {
  await addRoad(page, 'bottom');
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const ppu = await pxPerUnit(page, 'ground');
  const road = center(await nodeBox(page, 'ground', '.annotation-road'));
  await drag(page, road, { x: road.x, y: road.y - 10 * ppu });
  await expect(page.getByText(/Roads must be outside the ground/)).toBeVisible();
  expect(await state(page, (s) => s.data!.annotations[0]!.y)).toBe(40);

  const again = center(await nodeBox(page, 'ground', '.annotation-road'));
  await drag(page, again, { x: again.x, y: again.y + 3 * ppu });
  expect(await state(page, (s) => s.data!.annotations[0]!.y)).toBe(43);
});

test('road resize via the Transformer cannot extend onto the ground', async ({ page }) => {
  await addRoad(page, 'top');
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const ppu = await pxPerUnit(page, 'ground');
  const road = center(await nodeBox(page, 'ground', '.annotation-road'));
  await page.mouse.click(road.x, road.y);
  const anchor = center(await nodeBox(page, 'ground', '.bottom-center'));
  await drag(page, anchor, { x: anchor.x, y: anchor.y + 5 * ppu });
  const r = await state(page, (s) => s.data!.annotations[0]!);
  expect(r.y + r.height).toBeLessThanOrEqual(0);
  // Growing it outward (top edge) is fine.
  const top = center(await nodeBox(page, 'ground', '.top-center'));
  await drag(page, top, { x: top.x, y: top.y - 2 * ppu });
  const grown = await state(page, (s) => s.data!.annotations[0]!);
  expect(grown).toMatchObject({ y: -8, height: 8 });
});

test('dimensions: ground, hangar and stall side lengths, toggled with M', async ({ page }) => {
  const dims = () => page.evaluate(() => window.__layoutTest__!.stages.ground!.find('.dimension').length);
  // Ground (2) + 3 hangars × 2.
  expect(await dims()).toBe(8);
  const labels = await page.evaluate(() =>
    window.__layoutTest__!.stages.ground!.find('.dimension').map((d) => (d as unknown as { findOne: (s: string) => { text: () => string } }).findOne('Text').text()),
  );
  expect(labels).toEqual(expect.arrayContaining(['60 m', '40 m', '24 m', '16 m', '20 m', '14 m']));
  await page.keyboard.press('m');
  expect(await dims()).toBe(0);
  await page.keyboard.press('m');

  await openEditor(page, 1);
  const stallDims = await page.evaluate(() =>
    window.__layoutTest__!.stages.editor!.find('.stall-dim').map((t) => (t as unknown as { text: () => string }).text()),
  );
  expect(stallDims).toHaveLength(17 * 2);
  expect(stallDims.slice(0, 2)).toEqual(['3 m', '2 m']);
});

test('shows a live size readout while resizing a stall', async ({ page }) => {
  await openEditor(page, 1);
  const ppu = await pxPerUnit(page, 'editor');
  const b = center(await nodeBox(page, 'editor', '#stall-4'));
  await page.mouse.click(b.x, b.y);
  const anchor = center(await nodeBox(page, 'editor', '.middle-right'));
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.mouse.move(anchor.x + 1.1 * ppu, anchor.y, { steps: 8 });
  const text = await page.evaluate(() => {
    const l = window.__layoutTest__!.stages.editor!.findOne('.size-readout') as unknown as { visible: () => boolean; getText: () => { text: () => string } };
    return l.visible() ? l.getText().text() : null;
  });
  await page.mouse.up();
  expect(text).toBe('4 × 2 m');
});

test('a flush road with an off-grid width slides along its side (review: snap-onto-ground)', async ({ page }) => {
  await page.getByRole('button', { name: 'Road', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Road' });
  await dialog.getByLabel('Length along side (m)').fill('30');
  await dialog.getByLabel('Road width (m)').fill('3.6');
  await dialog.getByRole('button', { name: 'Add road' }).click();
  expect(await state(page, (s) => s.data!.annotations[0]!)).toMatchObject({ x: 15, y: -3.6, height: 3.6 });
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const ppu = await pxPerUnit(page, 'ground');
  const road = center(await nodeBox(page, 'ground', '.annotation-road'));
  await drag(page, road, { x: road.x + 5.2 * ppu, y: road.y + 0.2 * ppu });
  const moved = await state(page, (s) => s.data!.annotations[0]!);
  expect(moved).toMatchObject({ x: 20, y: -3.6 });
  // Lengthening via the right handle keeps the 3.6 m width.
  await page.mouse.click(center(await nodeBox(page, 'ground', '.annotation-road')).x, road.y);
  const anchor = center(await nodeBox(page, 'ground', '.middle-right'));
  await drag(page, anchor, { x: anchor.x + 4 * ppu, y: anchor.y });
  expect(await state(page, (s) => s.data!.annotations[0]!)).toMatchObject({ width: 34, height: 3.6, y: -3.6 });
});

test('Esc during a resize cancels it and restores the node (review: transform-cancel)', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const frame = await nodeBox(page, 'ground', '#hangar-3 .hangar-frame');
  await page.mouse.click(frame.x + frame.width - 10, frame.y + frame.height - 10);
  const ppu = await pxPerUnit(page, 'ground');
  const anchor = center(await nodeBox(page, 'ground', '.middle-right'));
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.mouse.move(anchor.x + 4 * ppu, anchor.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await state(page, (s) => s.data!.hangars.find((h) => h.id === 3)!.width)).toBe(20);
  const drawn = await page.evaluate(() => {
    const st = window.__layoutTest__!.stages.ground!;
    const g = st.findOne('#hangar-3') as Konva.Group;
    const f = g.findOne('.hangar-frame') as Konva.Rect;
    return { w: f.width() * f.scaleX(), dims: g.findOne('.hangar-dims')?.visible() ?? null, readout: st.findOne('.size-readout')!.visible() };
  });
  expect(drawn).toEqual({ w: 20 * 20, dims: true, readout: false });
});

test('adds a gift counter outside and a washroom inside the ground', async ({ page }) => {
  await page.getByRole('button', { name: 'Marker', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add Marker' });
  await dialog.getByText('Gift Counter', { exact: true }).click();
  await dialog.getByText('Outside the ground', { exact: true }).click();
  await dialog.getByLabel('Beside which side').selectOption('bottom');
  await dialog.getByRole('button', { name: 'Add marker' }).click();
  await page.getByRole('button', { name: 'Marker', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Add Marker' });
  await dialog.getByText('Washroom', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Add marker' }).click();
  const a = await state(page, (s) => s.data!.annotations);
  expect(a[0]).toMatchObject({ type: 'gift-counter', label: 'Gift Counter', y: 40, hangarId: null });
  expect(a[1]).toMatchObject({ type: 'washroom', label: 'Washroom', width: 4, height: 3, hangarId: null });
  expect(a[1]!.x).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId('selection-announcer')).toContainText('Washroom');
  // The size readout draws above the ground-dimension layer.
  expect(await page.evaluate(() => window.__layoutTest__!.stages.ground!.getLayers().at(-1)!.name())).toBe('readout');
});

test('CCTV (ground level) and Fire Exit (inside a hangar) can be placed, and the safety-markers toggle hides/shows them in both views', async ({ page }) => {
  // Ground-level CCTV.
  await page.getByRole('button', { name: 'Marker', exact: true }).click();
  const groundDialog = page.getByRole('dialog', { name: 'Add Marker' });
  await groundDialog.getByText('CCTV Camera', { exact: true }).click();
  await groundDialog.getByRole('button', { name: 'Add marker' }).click();
  const cctv = (await state(page, (s) => s.data!.annotations)).find((a) => a.type === 'cctv')!;
  expect(cctv).toMatchObject({ type: 'cctv', hangarId: null });

  await nodeBox(page, 'ground', `#annotation-${cctv.id}`);
  await page.getByRole('button', { name: 'Hide safety markers (CCTV, Fire Exit)' }).click();
  expect(await nodeBoxOrNull(page, 'ground', `#annotation-${cctv.id}`)).toBeNull();
  await page.getByRole('button', { name: 'Show safety markers (CCTV, Fire Exit)' }).click();
  await nodeBox(page, 'ground', `#annotation-${cctv.id}`);

  // Fire Exit inside a hangar — same annotation type system, just hangarId set.
  await openEditor(page, 1);
  await page.getByTestId('hangar-editor').getByRole('button', { name: 'Add marker' }).click();
  const editorDialog = page.getByRole('dialog', { name: 'Add Marker' });
  await editorDialog.getByText('Fire Exit', { exact: true }).click();
  await editorDialog.getByRole('button', { name: 'Add marker' }).click();
  const fireExit = (await state(page, (s) => s.data!.annotations)).find((a) => a.type === 'fire-exit')!;
  expect(fireExit).toMatchObject({ type: 'fire-exit', hangarId: 1 });

  await nodeBox(page, 'editor', `#annotation-${fireExit.id}`);
  // Toggling was already exercised via the main header above — here, exercise
  // the hangar editor's OWN copy of the same button (both are mounted at once
  // while the editor overlay is open, hence the scoped locator).
  await page.getByTestId('hangar-editor').getByRole('button', { name: 'Hide safety markers (CCTV, Fire Exit)' }).click();
  expect(await nodeBoxOrNull(page, 'editor', `#annotation-${fireExit.id}`)).toBeNull();
});
