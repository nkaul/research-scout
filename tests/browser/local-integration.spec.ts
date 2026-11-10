import { test, expect } from '../../frontend/node_modules/@playwright/test';

test('local fixture services reach a saved shortlist and deterministic export', async ({ page }) => {
  test.skip(process.env.SCOUT_BROWSER_INTEGRATION !== '1', 'Enable explicitly with the fixture backend/provider processes running.');
  const configuration = await page.request.get('/api/providers');
  expect(configuration.ok(), 'Explicit integration validation requires a reachable provider-configuration endpoint.').toBe(true);
  const config = await configuration.json();
  expect(config.providers?.some((provider: { mode?: string }) => provider.mode === 'fixture'), 'Explicit integration validation requires synthetic fixture services.').toBe(true);
  await page.goto('/');
  await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Research question', { exact: true }).fill('Institutional AI readiness in higher education');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const row = page.getByTestId('source-row').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: /^Include / }).click();
  await expect(row.getByRole('button', { name: /^Exclude / })).toHaveAttribute('aria-pressed', 'true');
  const runUrl = page.url();
  await page.reload();
  await expect(page.getByTestId('source-row').first()).toBeVisible();
  expect(page.url()).toBe(runUrl);
  await page.getByRole('button', { name: /^Saved shortlist/ }).click();
  await expect(page.getByTestId('source-row')).toHaveCount(1);
  await page.getByText('Export', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bibliography (.md)', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('bibliography.md');
});
