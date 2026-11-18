import { expect, test, type Page } from '@playwright/test';
import { installFixtureApi } from './fixture-api';
import { economicsFixture, economicsReportFixture } from './economics-fixture';

const meter = (page: Page) => page.locator('header details').filter({ has: page.getByRole('progressbar') }).locator('summary');

test('daily meter shows used credits and preserves available and reserved balances using reads only', async ({ page }) => {
  await installFixtureApi(page);
  let budget = economicsFixture({ used: 7, reserved: 9, remaining: 84 });
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.route('**/api/economics', route => route.fulfill({ json: budget }));
  await page.goto('/app');
  await expect(meter(page)).toHaveAccessibleName(/7 of 100 daily credits used; 84 available; 9 reserved/);
  await expect(meter(page).locator('strong')).toHaveText('7/100');
  await expect(meter(page).getByText('Used', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Daily credits consumed or reserved' })).toHaveAttribute('aria-valuenow', '16');
  await meter(page).click();
  await expect(page.getByText('1 credit per hosted model call.', { exact: false })).toBeVisible();
  await expect(page.locator('header details[open] dl > div').filter({ hasText: 'Available' }).locator('dd')).toHaveText('84');
  await expect(page.locator('header details[open] dl > div').filter({ hasText: 'Reserved' }).locator('dd')).toHaveText('9');
  budget = { ...budget, used: 8, reserved: 0, remaining: 92, revision: 2 };
  await page.evaluate(() => window.dispatchEvent(new Event('scout:economics-updated')));
  await expect(meter(page)).toHaveAccessibleName(/8 of 100 daily credits used; 92 available; 0 reserved/);
  await expect(meter(page).locator('strong')).toHaveText('8/100');
  expect(writes).toEqual([]);
});

test('reset is explicit, window-bound and immediately rechecks blocked search readiness', async ({ page }) => {
  await installFixtureApi(page);
  let budget = economicsFixture({ used: 100, remaining: 0 });
  let resets = 0;
  await page.route('**/api/economics', route => route.fulfill({ json: budget }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation_enabled: false, generation: { enabled: false }, retrieval: { enabled: true, ready: budget.remaining > 0, blocked_reason: 'Daily allowance spent.' } } }));
  await page.route('**/api/economics/reset', async route => {
    const body = route.request().postDataJSON();
    expect(body.expected_window_id).toBe(budget.window_id);
    expect(body.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    resets++;
    budget = economicsFixture({ window_id: 'fixture-credit-window-2', epoch: 1, revision: 2 });
    await route.fulfill({ json: budget });
  });
  await page.goto('/app');
  await expect(page.getByTestId('mandatory-refinement-status')).toContainText('AI refinement is unavailable');
  await expect(meter(page)).toHaveAccessibleName(/100 of 100 daily credits used; 0 available; 0 reserved/);
  await expect(meter(page).locator('strong')).toHaveText('100/100');
  expect(resets).toBe(0);
  await meter(page).click();
  await page.getByRole('button', { name: 'Reset today', exact: true }).click();
  await expect(meter(page)).toHaveAccessibleName(/0 of 100 daily credits used; 100 available; 0 reserved/);
  await expect(meter(page).locator('strong')).toHaveText('0/100');
  await expect(page.getByText('Daily credits reset. Previous usage remains in Admin history.')).toBeVisible();
  await expect(page.getByTestId('mandatory-refinement-status')).toContainText('AI refines this question');
  expect(resets).toBe(1);
});

test('conflicting reset refreshes the canonical window without silently posting again', async ({ page }) => {
  await installFixtureApi(page);
  let budget = economicsFixture({ used: 20, remaining: 80 });
  let resets = 0;
  await page.route('**/api/economics', route => route.fulfill({ json: budget }));
  await page.route('**/api/economics/reset', async route => {
    resets++;
    budget = economicsFixture({ window_id: 'other-tab-reset', revision: 3, epoch: 1 });
    await route.fulfill({ status: 409, json: { detail: 'Window changed.' } });
  });
  await page.goto('/app'); await expect(meter(page)).toHaveAccessibleName(/20 of 100 daily credits used; 80 available/);
  await meter(page).click(); await page.getByRole('button', { name: 'Reset today', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'allowance changed' })).toBeVisible();
  await expect(meter(page)).toHaveAccessibleName(/0 of 100 daily credits used; 100 available/);
  expect(resets).toBe(1);
});

test('an uncertain reset retries its original idempotency key even after the current window advances', async ({ page }) => {
  await installFixtureApi(page);
  let budget = economicsFixture({ used: 30, remaining: 70 });
  const bodies: Record<string, string>[] = [];
  await page.route('**/api/economics', route => route.fulfill({ json: budget }));
  await page.route('**/api/economics/reset', async route => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      budget = economicsFixture({ window_id: 'committed-reset-window', epoch: 1, revision: 2 });
      await route.abort('failed');
    } else await route.fulfill({ json: budget });
  });
  await page.goto('/app'); await expect(meter(page)).toHaveAccessibleName(/30 of 100 daily credits used; 70 available/);
  await meter(page).click(); await page.getByRole('button', { name: 'Reset today', exact: true }).click();
  await expect(meter(page)).toHaveAccessibleName(/0 of 100 daily credits used; 100 available/);
  await page.getByRole('button', { name: 'Retry reset', exact: true }).click();
  await expect(page.getByText('Daily credits reset. Previous usage remains in Admin history.')).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
});

test('a missing economics service shows unavailable rather than inventing credits', async ({ page }) => {
  await installFixtureApi(page);
  await page.route('**/api/economics', route => route.fulfill({ status: 503, json: { detail: 'Accounting temporarily unavailable.' } }));
  await page.goto('/app');
  await expect(page.locator('header summary').filter({ hasText: 'Used' })).toHaveAccessibleName('Daily credits unavailable');
  await expect(page.locator('header summary').filter({ hasText: 'Used' }).locator('strong')).toHaveText('—');
  await page.locator('header summary').filter({ hasText: 'Used' }).click();
  await expect(page.getByRole('button', { name: 'Refresh balance' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset today', exact: true })).toHaveCount(0);
});

test('credit bar and disclosure fit the narrow workspace without increasing its header', async ({ page }) => {
  await installFixtureApi(page); await page.goto('/app');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(meter(page)).toBeVisible(); await meter(page).click();
    await expect(page.getByRole('banner').getByText('Fixture data', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset today', exact: true })).toBeVisible();
    const disclosure = await page.locator('header details[open] > div').boundingBox();
    expect(disclosure!.x).toBeGreaterThanOrEqual(8);
    expect(disclosure!.x + disclosure!.width).toBeLessThanOrEqual(width - 8);
    expect(await page.locator('header.topbar').evaluate(element => element.getBoundingClientRect().height)).toBe(51);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
  }
});

test('Admin opens without login and retains unknown usage and historical cost holds', async ({ page }) => {
  await installFixtureApi(page);
  const report = economicsReportFixture();
  report.totals = { ...report.totals, operations: 1, invocations: 1, unknown_usage: 1, unknown_held_usd: 0.05 };
  report.operations = [{ operation_id: 'fixture-old-operation', purpose: 'retrieval', model: 'gpt-6-luna', status: 'retrieval_stopped_uncertain', window_id: 'fixture-old-window', day: '2026-11-11', created_at: '2026-11-11T10:00:00Z', completed_at: null, used_credits: 1, reserved_credits: 0, max_invocations: 3, reservation_usd: .05, estimated_cost_usd: null, known_cost_usd: 0, unknown_held_usd: .05, invocations: [{ step: 0, role: 'plan', model: 'gpt-6-luna', status: 'uncertain', dispatched_at: '2026-11-11T10:00:00Z', settled_at: null, duration_ms: null, input_tokens: null, output_tokens: null, cached_input_tokens: null, reasoning_tokens: null, estimated_cost_usd: null, cost_basis_version: 'scout-legacy-estimate-v1' }] }];
  await page.route('**/api/admin/economics*', route => route.fulfill({ json: report }));
  const writes: string[] = []; page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Model economics' })).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await page.locator('details').filter({ hasText: 'retrieval stopped uncertain' }).locator('summary').click();
  await expect(page.getByText('fixture-old-operation', { exact: true })).toBeVisible();
  await expect(page.getByRole('table').filter({ has: page.getByText('Model invocations', { exact: true }) })).toContainText('Unavailable');
  expect(writes).toEqual([]);
});
