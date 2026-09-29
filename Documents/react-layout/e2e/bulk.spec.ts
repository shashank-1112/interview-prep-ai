import { expect, test } from '@playwright/test';
import { boot, state } from './helpers';

test('filters, selects all filtered, and bulk-updates status', async ({ page }) => {
  await boot(page);
  await page.getByRole('tab', { name: /Stalls/ }).click();
  const panel = page.getByRole('tabpanel');
  await panel.getByLabel('Status').selectOption('available');
  await panel.getByLabel('Hangar').selectOption({ label: 'Hangar A' });
  await expect(panel.getByText('11 of 42 stalls')).toBeVisible();
  await panel.getByRole('button', { name: 'Select all 11 filtered' }).click();
  await expect(panel.getByText('11 stalls selected')).toBeVisible();
  await panel.getByLabel('New status').selectOption('blocked');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('alertdialog', { name: 'Apply Bulk Change' }).getByRole('button', { name: 'Apply' }).click();
  const blocked = await state(page, (s) => s.data!.stalls.filter((x) => x.hangarId === 1 && x.status === 'blocked').length);
  expect(blocked).toBe(13);
});

test('price range filter and per-page selection', async ({ page }) => {
  await boot(page);
  await page.getByRole('tab', { name: /Stalls/ }).click();
  const panel = page.getByRole('tabpanel');
  await panel.getByLabel('Minimum final price').fill('45000');
  await panel.getByLabel('Maximum final price').fill('65000');
  await expect(panel.getByText('16 of 42 stalls')).toBeVisible();
  await panel.getByLabel('Select all stalls on this page').check();
  await expect(panel.getByText('10 stalls selected')).toBeVisible();
  await panel.getByLabel('Bulk action', { exact: true }).selectOption('delete');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('alertdialog', { name: 'Bulk Delete' }).getByRole('button', { name: 'Delete' }).click();
  expect(await state(page, (s) => s.data!.stalls.length)).toBe(32);
});
