import { test, expect, type Page } from '@playwright/test';
import { formatLoadTime } from '../../src/lib/load-timing';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';
import { openSearchInformation } from './search-controls';

function held() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

async function setup(page: Page, savedReady = Promise.resolve(), metadataReady = Promise.resolve()) {
  await installFixtureApi(page);
  const first = { ...FIRST_SOURCE, run_id: 'timing-a', title: 'First timed paper' }, second = { ...FIRST_SOURCE, run_id: 'timing-b', source_ref: 'openalex:timing-b', title: 'Second timed paper', doi: null };
  const saved = { id: 'timing-search', status: 'IDLE', revision: 1, cursor: 'timing:1', title: 'Saved timed query', created_at: '2026-11-12T00:00:00Z', updated_at: '2026-11-12T00:00:01.750Z', providers: ['openalex'], filters: {}, turns: [{ id: 'timing-turn', action: 'discover', routing: 'auto', message: 'Time research loads', status: 'SUCCEEDED', created_at: '2026-11-12T00:00:00Z', completed_at: '2026-11-12T00:00:01.750Z', providers: ['openalex'], run_ids: ['timing-a', 'timing-b'], sources: [first, second], papers: [first, second].map(source => ({ paper_id: source.source_ref, representative: source, providers: ['openalex'], observations: [source], access: { status: 'not_requested' } })), response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  await page.route('**/api/conversations/timing-search', async route => { await savedReady; await route.fulfill({ json: saved }); });
  await page.route('**/api/research-runs/timing-a/snapshot', async route => { await metadataReady; await route.fulfill({ json: { ...initialSnapshot(), id: first.run_id, status: 'succeeded', entities: [first] } }); });
  await page.route('**/api/research-runs/timing-b/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: second.run_id, status: 'succeeded', entities: [second] } }));
  const writes: string[] = []; page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method()); });
  return { first, second, writes };
}

test('duration units cover sub-millisecond, millisecond, second and minute waits', () => {
  expect(formatLoadTime(0.1)).toBe('<1 ms');
  expect(formatLoadTime(48.4)).toBe('48 ms');
  expect(formatLoadTime(999)).toBe('999 ms');
  expect(formatLoadTime(1750)).toBe('1.75 s');
  expect(formatLoadTime(125_000)).toBe('2 min 5 s');
});

test('saved-view and metadata waits show live elapsed time, stop on completion and stay separate from original search duration', async ({ page }) => {
  await page.clock.install();
  const savedGate = held(), metadataGate = held();
  const { first, writes } = await setup(page, savedGate.promise, metadataGate.promise);
  await page.goto('/app?search=timing-search');
  await openSearchInformation(page, 'Timing and usage');
  const savedTime = page.getByTestId('performance-saved');
  await expect(savedTime).toHaveAttribute('data-loading', 'true');
  await page.clock.runFor(1250);
  await expect(savedTime).toContainText(/1\.\d{2} s/);
  savedGate.release();
  await expect(page.getByTestId('search-result-card').first()).toBeVisible();
  // Accepting the newly loaded turn resets disclosure state for that scope.
  await openSearchInformation(page, 'Timing and usage');
  await expect(savedTime).toHaveAttribute('data-loading', 'false');
  const originalSearch = page.getByTestId('performance-retrieval');
  await expect(originalSearch).toContainText('1.75 s');
  await expect(originalSearch).toHaveAttribute('data-duration-ms', '1750');
  await expect(originalSearch).toHaveAttribute('data-loading', 'false');
  const loading = page.getByTestId('source-preview-loading');
  await expect(loading.locator('[data-load-kind="Metadata"]')).toHaveAttribute('data-loading', 'true');
  await page.clock.runFor(450);
  await expect(loading.locator('[data-load-kind="Metadata"]')).toContainText(/\d+ ms elapsed/);
  metadataGate.release();
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader.getByRole('heading', { name: first.title, exact: true })).toBeVisible();
  const metadataTime = reader.locator('[data-load-kind="Metadata"]');
  await expect(metadataTime).toHaveAttribute('data-loading', 'false');
  const elapsed = await metadataTime.getAttribute('data-duration-ms');
  expect(Number(elapsed)).toBeGreaterThanOrEqual(400);
  await page.clock.fastForward(125_000);
  await expect(metadataTime).toHaveAttribute('data-duration-ms', elapsed!);
  await expect(originalSearch).toContainText('1.75 s');
  await expect(originalSearch).toHaveAttribute('data-duration-ms', '1750');
  expect(writes).toEqual([]);
});

test('a late paper response cannot replace the selected paper’s completed load time', async ({ page }) => {
  const metadataGate = held(), { second, writes } = await setup(page, Promise.resolve(), metadataGate.promise);
  await page.goto('/app?search=timing-search');
  await expect(page.getByTestId('source-preview-loading')).toBeVisible();
  await page.getByTestId('search-result-card').nth(1).focus();
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader.getByRole('heading', { name: second.title, exact: true })).toBeVisible();
  const timing = reader.locator('[data-load-kind="Metadata"]');
  await expect(timing).toHaveAttribute('data-loading', 'false');
  const before = await timing.getAttribute('data-duration-ms');
  const lateResponse = page.waitForResponse('**/api/research-runs/timing-a/snapshot'); metadataGate.release(); await lateResponse;
  await expect(timing).toHaveAttribute('data-duration-ms', before!);
  await expect(reader.getByRole('heading', { name: second.title, exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
