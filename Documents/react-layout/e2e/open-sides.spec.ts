import { expect, test } from '@playwright/test';
import type Konva from 'konva';
import { boot, center, nodeBox, openEditor, state } from './helpers';

test.beforeEach(async ({ page }) => {
  await boot(page);
});

test('generates stalls along the walls with an island, open sides drawn dotted', async ({ page }) => {
  // An empty hangar to fill.
  await page.getByRole('button', { name: 'Hangar', exact: true }).click();
  const hd = page.getByRole('dialog', { name: 'Add Hangar' });
  for (const [label, value] of [['Name', 'Hangar D'], ['Code', 'H-D'], ['X (m)', '28'], ['Y (m)', '18'], ['Width (m)', '24'], ['Height (m)', '20']]) {
    await hd.getByLabel(label!, { exact: true }).fill(value!);
  }
  await hd.getByRole('button', { name: 'Add hangar' }).click();

  await page.getByRole('button', { name: 'Generate stalls' }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate Stalls' });
  await expect(dialog.getByTestId('plan-summary')).toContainText('24 stalls — top 8 · right 5 · left 5 · 1 island (6)');
  // Preview draws the open sides dotted.
  expect(await dialog.locator('[data-testid="layout-preview"] line[stroke-dasharray]').count()).toBeGreaterThan(20);
  await dialog.getByRole('button', { name: 'Generate 24 stalls' }).click();
  await expect(dialog).toBeHidden();

  const gen = await state(page, (s) => s.data!.stalls.filter((x) => x.hangarId === 4));
  expect(gen).toHaveLength(24);
  expect(gen.filter((x) => x.openSides?.length).length).toBe(22);

  await openEditor(page, 4);
  // Stalls with openings get the edge-by-edge outline shape.
  expect(await page.evaluate(() => window.__layoutTest__!.stages.editor!.find('.stall-outline').length)).toBe(22);
});

test('marks a side of an existing stall as an opening from the details panel', async ({ page }) => {
  await openEditor(page, 1);
  const b = center(await nodeBox(page, 'editor', '#stall-1'));
  await page.mouse.click(b.x, b.y);
  const panel = page.getByRole('complementary', { name: 'Selection details' });
  await panel.getByRole('button', { name: 'Bottom side: wall' }).click();
  expect(await state(page, (s) => s.data!.stalls.find((x) => x.id === 1)!.openSides)).toEqual(['bottom']);
  await expect(panel.getByRole('button', { name: 'Bottom side: open' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('selection-announcer')).toContainText('open on bottom');
  expect(await page.evaluate(() => !!(window.__layoutTest__!.stages.editor!.findOne('#stall-1') as Konva.Group).findOne('.stall-outline'))).toBe(true);
  await page.keyboard.press('Control+z');
  expect(await state(page, (s) => s.data!.stalls.find((x) => x.id === 1)!.openSides)).toBeUndefined();
});
