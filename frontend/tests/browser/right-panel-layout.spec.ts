import { openResultFilter, openSearchInformation } from './search-controls';
import { expect, test, type Page } from '@playwright/test';
import { DISCOVERY_PROVIDERS, type Snapshot, type Source } from '../../src/lib/api';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const video: Source = { ...FIRST_SOURCE, provider: 'youtube', source_ref: 'youtube:abcdEF_12-3', record_id: 'abcdEF_12-3', resource_type: 'video', title: 'Authored context engineering video', authors: ['Example Channel'], venue: null, doi: null, abstract: null, description: 'An authored fixture description of context retrieval for language models.', url: 'https://www.youtube.com/watch?v=abcdEF_12-3', transcript: { status: 'available', origin: 'authored_fixture_captions', language: 'English', is_generated: false, truncated: false, segments: [{ text: 'An authored caption visible alongside research results.', start: 10, duration: 4 }] } };

async function setup(page: Page) {
  await installFixtureApi(page);
  await page.route('https://**/*', route => route.abort());
  const paper = { ...FIRST_SOURCE, run_id: 'panel-paper-run' }, clip = { ...video, run_id: 'panel-video-run' };
  const saved = { id: 'panel-search', routing: 'auto', title: 'Panel layout fixture', status: 'IDLE', revision: 1, created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: ['openalex', 'youtube'], filters: {}, turns: [{ id: 'panel-turn', message: 'Context engineering research', action: 'discover', routing: 'auto', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['openalex', 'youtube'], run_ids: ['panel-paper-run', 'panel-video-run'], sources: [paper, clip], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' } }] };
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: DISCOVERY_PROVIDERS.map(id => ({ id, status: 'ready', mode: 'fixture', access_configured: true })) } }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/panel-search', route => route.fulfill({ json: saved }));
  for (const source of [paper, clip]) {
    const snapshot: Snapshot = { ...initialSnapshot(), id: source.run_id, provider: source.provider, status: 'succeeded', entities: [source] };
    await page.route(`**/api/research-runs/${source.run_id}/snapshot`, route => route.fulfill({ json: snapshot }));
  }
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#dce6f4"/></svg>' }));
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.goto('/app?search=panel-search');
  return { posts };
}

test('desktop details dock on the right and leave research controls interactive', async ({ page }) => {
  const { posts } = await setup(page);
  const card = page.getByTestId('search-result-card');
  await card.getByRole('button', { name: 'Preview details', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(panel).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const listBounds = await page.locator('.search-results-column').boundingBox(), panelBounds = await panel.boundingBox();
  expect(panelBounds!.x).toBeGreaterThanOrEqual(listBounds!.x + listBounds!.width);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
  await panel.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(panel.locator('.record-properties').first()).toContainText(FIRST_SOURCE.doi!);
  await panel.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Record details', exact: true })).toBeVisible();
  await (await openResultFilter(page)).fill('institutional');
  await expect(card).toHaveCount(1);
  await expect(panel).toBeVisible();
  await page.screenshot({ path: '../.scout/right-panel-desktop.local.png' });
  await page.setViewportSize({ width: 1024, height: 850 });
  const narrowListBounds = await page.locator('.search-results-column').boundingBox(), narrowPanelBounds = await panel.boundingBox();
  expect(narrowPanelBounds!.x).toBeGreaterThanOrEqual(narrowListBounds!.x + narrowListBounds!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await (await openResultFilter(page)).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Filter available results', exact: true })).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect((await openResultFilter(page))).toHaveValue('institutional');
  expect(posts).toEqual([]);
});

test('video cards keep a small thumbnail next to their description and saved captions in the panel', async ({ page }) => {
  const { posts } = await setup(page);
  await page.getByRole('tab', { name: /^Videos/ }).click();
  const card = page.getByTestId('search-result-card'), thumbnail = card.getByRole('button', { name: `Preview video: ${video.title}`, exact: true });
  const thumbBounds = await thumbnail.boundingBox(), textBounds = await card.locator('.search-result-content').boundingBox();
  expect(thumbBounds!.width).toBeLessThanOrEqual(140);
  expect(textBounds!.x).toBeGreaterThan(thumbBounds!.x);
  expect(Math.abs(textBounds!.y - thumbBounds!.y)).toBeLessThan(10);
  await card.getByRole('button', { name: 'Preview details', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(panel.getByTestId('video-transcript')).toContainText('An authored caption visible alongside research results.');
  await expect(panel.getByRole('button', { name: 'Load transcript', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('link', { name: /Open on YouTube/ })).toHaveCount(1);
  await page.screenshot({ path: '../.scout/right-panel-video.local.png' });
  expect(posts).toEqual([]);
});

test('narrow details remain an inline panel with no horizontal overflow or backdrop', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  const { posts } = await setup(page);
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(panel).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const panelBounds = await panel.boundingBox(), listBounds = await page.locator('.search-results-column').boundingBox();
  expect(panelBounds!.y).toBeLessThan(listBounds!.y);
  expect(panelBounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: '../.scout/right-panel-narrow.local.png' });
  await panel.getByRole('button', { name: 'Close source details', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Papers/ })).toHaveAttribute('aria-selected', 'true');
  expect(posts).toEqual([]);
});
