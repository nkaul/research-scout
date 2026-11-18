import { test, expect, type Page } from '@playwright/test';
import type { Conversation, ExplorationTurn } from '../../src/lib/conversations';
import { installFixtureApi } from './fixture-api';

async function installControls(page: Page, holdCreate = false) {
  await installFixtureApi(page);
  // Scripted planner readiness; application requests remain intercepted.
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: true } } }));
  const creates: Record<string, unknown>[] = [], sends: Record<string, unknown>[] = [];
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let saved: Conversation = { id: 'control-search', routing: 'auto', title: 'Control test search', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', revision: 0, cursor: 'controls:0', status: 'IDLE', providers: [], filters: {}, turns: [] };
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/conversations' && request.method() === 'GET') return route.fulfill({ json: { conversations: [] } });
    if (path === '/api/conversations' && request.method() === 'POST') {
      creates.push(request.postDataJSON());
      if (holdCreate) await gate;
      return route.fulfill({ json: saved });
    }
    if (path.endsWith('/turns')) {
      const body = request.postDataJSON(); sends.push(body);
      const turn: ExplorationTurn = { id: 'control-turn', message: body.message, routing: 'auto', action: 'discover', providers: ['openalex'], status: 'RUNNING', created_at: '2026-11-11T12:00:00Z', run_ids: [], sources: [], papers: [], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } };
      saved = { ...saved, status: 'RUNNING', turns: [turn] };
      return route.fulfill({ status: 202, json: saved });
    }
    return route.fulfill({ json: saved });
  });
  return { creates, sends, release, async complete() {
    saved = { ...saved, status: 'IDLE', revision: 1, turns: saved.turns.map(turn => ({ ...turn, status: 'SUCCEEDED', completed_at: '2026-11-11T12:01:00Z' })) };
    await page.evaluate(snapshot => (window as unknown as { __publishScout: (s: unknown) => void }).__publishScout(snapshot), saved);
  } };
}

test('date slider uses accessible adaptive year stops and submits the selected publication bounds', async ({ page }) => {
  const api = await installControls(page);
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'));
  await page.goto('/app');
  const slider = page.getByRole('slider', { name: 'Date range', exact: true });
  await expect(slider).toHaveValue('3');
  await expect(slider).toHaveAttribute('aria-valuetext', '5 years, includes this year, 2022–2026');
  await expect(slider).toBeEnabled();
  await slider.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', '1 year, includes this year, 2026–2026');
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '2 years, includes this year, 2025–2026');
  await page.reload();
  await expect(slider).toHaveValue('1');
  await page.getByLabel('Research question', { exact: true }).fill('Context engineering research');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForURL(/search=control-search/);
  expect(api.creates[0]).toMatchObject({ filters: { year_from: 2025, year_to: 2026 } });
  expect(api.sends[0]).toMatchObject({ filters: { year_from: 2025, year_to: 2026 } });
});

test('custom slider stop retains edited bounds and existing browser preferences', async ({ page }) => {
  await installControls(page);
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'));
  await page.goto('/app');
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Date range', exact: true });
  await expect(slider).toHaveValue('4');
  await expect(page.getByLabel('Custom publication year from')).toHaveValue('2022');
  await page.getByLabel('Custom publication year from').fill('2019');
  await page.getByLabel('Custom publication year to').fill('2024');
  await page.reload();
  await expect(slider).toHaveAttribute('aria-valuetext', 'Custom range, 2019–2024');
  await expect(slider).toBeEnabled();
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await slider.press('End');
  await expect(slider).toHaveValue('4');
  await expect(page.getByLabel('Custom publication year from')).toHaveValue('2019');
  await expect(page.getByLabel('Custom publication year to')).toHaveValue('2024');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
});

test('atom and result skeleton cover pending admission and stop after retrieval completes', async ({ page }) => {
  const api = await installControls(page, true);
  await page.goto('/app');
  await expect(page.getByTestId('search-activity')).toHaveCount(0);
  await expect(page.getByTestId('search-results-skeleton')).toHaveCount(0);
  await page.getByLabel('Research question', { exact: true }).fill('Retrieval quality evaluation');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('search-activity')).toContainText('Starting search');
  await expect(page.getByTestId('search-results-skeleton')).toBeVisible();
  api.release();
  await page.waitForURL(/search=control-search/);
  await expect(page.getByTestId('search-activity')).toContainText('Finding sources');
  await expect(page.getByTestId('search-results-skeleton')).toBeVisible();
  await api.complete();
  await expect(page.getByTestId('search-activity')).toHaveCount(0);
  await expect(page.getByTestId('search-results-skeleton')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  expect(api.creates).toHaveLength(1); expect(api.sends).toHaveLength(1);
});
