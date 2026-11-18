import { openSearchInformation } from './search-controls';
import { test, expect, type Page } from '@playwright/test';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';
import { chooseVideoCount } from './search-controls';

async function expectVideoLimit(page: Page, count: number) {
  await page.getByRole('button', { name: 'Search result limits', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Videos', exact: true })).toHaveValue(String(count));
  await page.keyboard.press('Escape');
}

const preferenceKey = 'research-scout:search-preferences:v1';
async function setSourcesOpen(page: Page, open: boolean) {
  const picker = page.getByTestId('search-options').locator('details.source-picker');
  if (await picker.evaluate(element => element.hasAttribute('open')) !== open) await picker.locator('summary').click();
}
async function setup(page: Page) {
  await installFixtureApi(page);
  const writes: Record<string, unknown>[] = [];
  let saved: Record<string, unknown> = { id: 'count-search', routing: 'auto', title: 'Video count fixture', status: 'IDLE', revision: 0, cursor: 'count:0', filters: {}, providers: ['youtube'], created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', turns: [] };
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: ['openalex','crossref','arxiv','youtube'].map(id => ({ id, status: 'ready', mode: 'fixture', access_configured: true, run_attempt_cap: 8 })) } }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: true } } }));
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'GET') return route.fulfill({ json: path === '/api/conversations' ? { conversations: [] } : saved });
    const body = req.postDataJSON(); writes.push(body);
    if (path === '/api/conversations') { saved = { ...saved, video_count: body.video_count }; return route.fulfill({ json: saved }); }
    const count = body.video_count;
    const sources = Array.from({ length: count }, (_, index) => ({ ...FIRST_SOURCE, provider: 'youtube', source_ref: `youtube:vid${String(index).padStart(8,'0')}`, record_id: `vid${String(index).padStart(8,'0')}`, run_id: 'count-run', title: `Authored video ${index + 1}`, resource_type: 'video', doi: null, abstract: null, description: 'Authored complete video description.', content_origin: 'youtube_video_details' }));
    saved = { ...saved, video_count: count, revision: 1, turns: [{ id: 'count-turn', message: body.message, action: 'discover', providers: ['youtube'], video_count: count, status: 'SUCCEEDED', created_at: '2026-11-12T12:00:00Z', run_ids: [], sources, papers: [], response: '', warnings: [], usage: { research_attempts: 1, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' } }] };
    return route.fulfill({ status: 202, json: saved });
  });
  await page.goto('/app');
  return { writes };
}

test('visible video count persists and is sent through creation and search without running on edit', async ({ page }) => {
  const { writes } = await setup(page);
  const count = page.getByRole('button', { name: 'Search result limits', exact: true });
  await expectVideoLimit(page, 10);
  await setSourcesOpen(page, true);
  await expect(page.getByText('YouTube allowance: 8 requests per run.', { exact: false })).toBeVisible();
  await setSourcesOpen(page, false);
  await chooseVideoCount(page, 15);
  expect(writes).toHaveLength(0);
  await page.reload(); await expectVideoLimit(page, 15);
  await page.getByLabel('Research question', { exact: true }).fill('Authored video settings');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForURL(/search=count-search/);
  expect(writes).toHaveLength(2); expect(writes[0]).toMatchObject({ video_count: 15 }); expect(writes[1]).toMatchObject({ video_count: 15, action: 'discover' });
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await expect(page.getByTestId('search-result-card')).toHaveCount(15);
  await chooseVideoCount(page, 2);
  await expect(page.getByTestId('search-result-card')).toHaveCount(15);
  const information = await openSearchInformation(page, 'Search overview');
  await expect(information.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Videos', exact: true }) })).toContainText('15');
  expect(writes).toHaveLength(2);
  for (const width of [1440, 1024, 390, 320]) { await page.setViewportSize({ width, height: 1080 }); await expect(count).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
});

test('old preferences migrate and disabled YouTube retains the chosen count', async ({ page }) => {
  await page.addInitScript(key => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ sources: ['openalex','crossref','arxiv','youtube'], datePreset: '3', customFrom: '', customTo: '' })); }, preferenceKey);
  const { writes } = await setup(page);
  const count = page.getByRole('button', { name: 'Search result limits', exact: true });
  await expectVideoLimit(page, 10); await chooseVideoCount(page, 20);
  await setSourcesOpen(page, true);
  await page.getByRole('button', { name: 'Remove YouTube', exact: true }).click();
  await setSourcesOpen(page, false);
  await expect(count).toBeEnabled(); await page.reload(); await expectVideoLimit(page, 20); await expect(count).toBeEnabled();
  await setSourcesOpen(page, true);
  await expect(page.getByRole('button', { name: 'Remove YouTube', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Search YouTube', exact: true })).not.toBeChecked();
  await setSourcesOpen(page, false);
  expect(writes).toHaveLength(0);
});

test('exploration shares the remembered count and includes it on provider discovery', async ({ page }) => {
  const { writes } = await setup(page);
  await chooseVideoCount(page, 7);
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click();
  await expectVideoLimit(page, 7);
  await page.getByLabel('Exploration message', { exact: true }).fill('Authored video exploration');
  await page.locator('form.exploration-composer button[type="submit"]').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0]).toMatchObject({ video_count: 7 }); expect(writes[1]).toMatchObject({ video_count: 7 });
});
