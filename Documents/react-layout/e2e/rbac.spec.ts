import { expect, test } from '@playwright/test';
import { boot, center, nodeBox, openEditor } from './helpers';

/**
 * sales_person can view and book/reserve stalls but not edit ground/hangar/stall geometry —
 * verifies the UI actually hides those controls rather than just relying on the backend's 403.
 * See src/auth/session.ts's canManageLayout and LAYOUT_RBAC_MATRIX.md.
 */
test.describe('sales_person sees a reduced, view-plus-booking UI', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page, { role: 'sales_person' });
  });

  test('ground toolbar has no layout-editing controls', async ({ page }) => {
    const toolbar = page.getByRole('toolbar', { name: 'Layout tools' });
    for (const label of ['Generate ground', 'Hangar', 'Stalls', 'Marker', 'Road', 'Parking', 'Edit layout']) {
      await expect(toolbar.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Load demo layout' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear all' })).toHaveCount(0);
    // View-only controls stay.
    await expect(page.getByRole('button', { name: 'Show dimensions' })).toBeVisible();
  });

  test('hangar details panel has no edit/duplicate/delete controls', async ({ page }) => {
    const frame = await nodeBox(page, 'ground', '#hangar-1 .hangar-frame');
    await page.mouse.click(frame.x + frame.width - 10, frame.y + frame.height - 10);
    await expect(page.getByRole('button', { name: 'Open Hangar Editor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit hangar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generate stalls' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete hangar' })).toHaveCount(0);
  });

  test('stall details panel has booking actions but no edit/open-sides/delete', async ({ page }) => {
    const box = await nodeBox(page, 'ground', '#hangar-1 .hangar-frame');
    await page.mouse.dblclick(box.x + box.width - 8, box.y + box.height - 8);
    await expect(page.getByTestId('hangar-editor')).toBeVisible();
    await page.waitForFunction(() => !!window.__layoutTest__?.stages.editor);
    const stallBox = await nodeBox(page, 'editor', '#stall-1');
    await page.mouse.click(stallBox.x + stallBox.width / 2, stallBox.y + stallBox.height / 2);

    const panel = page.getByRole('complementary', { name: 'Selection details' });
    await expect(panel.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('heading', { name: 'Open sides' })).toHaveCount(0);
    // Booking actions (Assign — stall 1 is available) stay available.
    await expect(panel.getByRole('button', { name: 'Assign' })).toBeVisible();
  });

  test('hangar editor toolbar only has view controls, and stalls cannot be dragged', async ({ page }) => {
    await openEditor(page, 1);
    const toolbar = page.getByRole('toolbar', { name: 'Hangar editor tools' });
    for (const label of ['Generate', 'Add stall', 'Add marker', 'Duplicate', 'Merge two adjacent stalls', 'Delete selection']) {
      await expect(toolbar.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    }
    await expect(toolbar.getByRole('button', { name: 'Show dimensions' })).toBeVisible();

    const before = await nodeBox(page, 'editor', '#stall-1');
    const c = center(before);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 60, c.y + 40, { steps: 5 });
    await page.mouse.up();
    const after = await nodeBox(page, 'editor', '#stall-1');
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  });
});
