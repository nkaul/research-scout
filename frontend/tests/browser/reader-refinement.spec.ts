import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const paper: ChatSource = { ...FIRST_SOURCE, run_id: 'compact-paper', title: 'A compact paper', year: 2021 };
const recent: ChatSource = { ...paper, run_id: 'recent-paper', source_ref: 'openalex:recent', title: 'A recent paper', year: 2025, doi: '10.0000/recent-paper' };
const video: ChatSource = { ...paper, run_id: 'compact-video', provider: 'youtube', source_ref: 'youtube:abcdEF_12-3', record_id: 'abcdEF_12-3', title: 'A compact video', resource_type: 'video', year: 2024, abstract: null, description: 'A provider video description.' };
const records = [paper, recent, video];
const snapshot = (source: ChatSource) => ({ ...initialSnapshot(), id: source.run_id, provider: source.provider, status: 'succeeded', entities: [source] });

async function setup(page: Page) {
  await installFixtureApi(page);
  let saved: Conversation = { id: 'compact-search', title: 'Compact research', routing: 'auto', status: 'IDLE', revision: 1, cursor: 'compact:1', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: [], filters: {}, turns: [] };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const populate = (sources: ChatSource[], question = 'A compact research question') => { saved = { ...saved, turns: [{ id: `${saved.id}-turn`, action: 'discover', routing: 'auto', message: question, status: 'SUCCEEDED', created_at: saved.created_at, providers: ['openalex', 'youtube'], filters: saved.filters, run_ids: sources.map(s => s.run_id), sources, papers: sources.map(source => ({ paper_id: source.source_ref, representative: source, providers: [source.provider], observations: [source], access: { status: 'not_requested' } })), response: '', warnings: ['One provider supplied partial coverage.'], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] }; };
  populate(records);
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: true } } }));
  await page.route(/\/api\/conversations(?:\/.*)?$/, route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') return route.fulfill({ json: path === '/api/conversations' ? { conversations: [saved] } : saved });
    const body = route.request().postDataJSON(); writes.push({ path, body });
    if (path === '/api/conversations') saved = { ...saved, id: 'filtered-search', filters: body.filters, turns: [] };
    else { const bounds = body.filters; populate(records.filter(source => (!bounds.year_from || source.year! >= bounds.year_from) && (!bounds.year_to || source.year! <= bounds.year_to)), body.message); }
    return route.fulfill({ json: saved });
  });
  for (const source of records) await page.route(`**/api/research-runs/${source.run_id}/snapshot`, route => route.fulfill({ json: snapshot(source) }));
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" />' }));
  return { writes };
}

test('reader keeps a small title in every tab and secondary reports collapsed', async ({ page }) => {
  await setup(page); await page.goto('/app?search=compact-search');
  await page.getByTestId('search-result-card').first().getByRole('button', { name: 'Preview details', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Source details', exact: true });
  for (const tab of ['Overview', 'Metadata', 'Your notes']) {
    await panel.getByRole('tab', { name: tab, exact: true }).click();
    await expect(panel.getByRole('heading', { name: paper.title!, exact: true })).toBeVisible();
    expect(await panel.getByRole('heading', { name: paper.title!, exact: true }).evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(14);
    await expect(panel.locator('.inspector-authors,.inspector-kicker,.document-banner')).toHaveCount(0);
  }
  await panel.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(panel.locator('.record-properties').first()).toContainText(paper.doi!);
  await expect(panel.getByRole('tabpanel').locator('details')).toHaveCount(0);
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true })).toHaveAttribute('aria-expanded', 'false');
});

test('paper and video actions stay on one line while reports open separately', async ({ page }) => {
  await setup(page); await page.goto('/app?search=compact-search');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of ['Papers', 'Videos']) {
      await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
      const card = page.getByTestId('search-result-card').first();
      const centers = await card.locator('.resource-action-bar > button,.resource-action-bar > a').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return r.y + r.height / 2; }));
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
      const toggle = card.getByRole('button', { name: 'Provider observations (1)', exact: true });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle, `${width}px ${tab}`).toHaveAttribute('aria-expanded', 'true');
      await expect(card.getByTestId('search-paper-observations')).toBeVisible();
      await card.getByRole('button', { name: 'Provider observations (1)', exact: true }).click();
      await expect(card.getByTestId('search-paper-observations')).toBeHidden();
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
});

test('slow paper and video reads show a skeleton without allowing an obsolete read to win', async ({ page }) => {
  await setup(page);
  let releasePaper!: () => void, releaseVideo!: () => void;
  const paperGate = new Promise<void>(resolve => { releasePaper = resolve; }), videoGate = new Promise<void>(resolve => { releaseVideo = resolve; });
  await page.route('**/api/research-runs/compact-paper/snapshot', async route => { await paperGate; await route.fulfill({ json: snapshot(paper) }); });
  await page.route('**/api/research-runs/compact-video/snapshot', async route => { await videoGate; await route.fulfill({ json: snapshot(video) }); });
  await page.goto('/app?search=compact-search');
  await page.getByTestId('search-result-card').first().getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(page.getByTestId('source-preview-loading')).toContainText('Opening saved paper details');
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(page.getByTestId('source-preview-loading')).toContainText('Opening saved video details');
  releaseVideo();
  const panel = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(panel.getByRole('heading', { name: video.title!, exact: true })).toHaveCount(1);
  releasePaper();
  await expect(page.getByTestId('source-preview-loading')).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: paper.title!, exact: true })).toHaveCount(0);
});

test('applying a custom range dispatches the new bounds and replaces the results', async ({ page }) => {
  const api = await setup(page); await page.goto('/app?search=compact-search');
  await expect(page.getByTestId('search-result-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  await page.getByLabel('Custom publication year from').fill('2020');
  await page.getByLabel('Custom publication year to').fill('2022');
  expect(api.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Apply range & search', exact: true }).click();
  await expect(page).toHaveURL(/search=filtered-search/);
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await expect(page.getByTestId('search-result-card')).toContainText(paper.title!);
  expect(api.writes.at(-1)!.body).toMatchObject({ filters: { year_from: 2020, year_to: 2022 }, source_scope: ['openalex', 'crossref', 'arxiv', 'youtube'] });
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  await page.getByLabel('Custom publication year from').fill('2027');
  await page.getByRole('button', { name: 'Apply range & search', exact: true }).click();
  await expect(page.getByText('The start year must be earlier than or equal to the end year.', { exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByText('The start year must be earlier than or equal to the end year.', { exact: true })).toHaveCount(0);
  expect(api.writes).toHaveLength(2);
});

test('loading another record makes old actions inert and closing prevents a late reopen', async ({ page }) => {
  await setup(page); await page.goto('/app?search=compact-search');
  await page.getByTestId('search-result-card').first().getByRole('button', { name: 'Preview details', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(panel.getByRole('tab', { name: 'Metadata', exact: true })).toBeVisible();
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/research-runs/compact-video/snapshot', async route => { await wait; await route.fulfill({ json: snapshot(video) }); });
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(page.getByTestId('source-preview-loading')).toBeVisible();
  await expect(panel.locator('.inspector-content')).toHaveAttribute('inert', '');
  await expect(panel.locator('.inspector-bottom')).toHaveAttribute('inert', '');
  await panel.getByRole('button', { name: 'Close source details', exact: true }).click();
  const response = page.waitForResponse('**/api/research-runs/compact-video/snapshot'); release(); await response;
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId('source-preview-loading')).toHaveCount(0);
});
