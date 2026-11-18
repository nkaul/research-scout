import { openSearchInformation, openResultFilter } from './search-controls';
import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const first: ChatSource = { ...FIRST_SOURCE, run_id: 'panel-run', title: 'A compact discovery result', abstract: 'An available abstract for the first result.' };
const matching: ChatSource = { ...first, provider: 'crossref', source_ref: 'crossref:matching', run_id: 'matching-run', title: 'A separate provider title' };
const second: ChatSource = { ...first, source_ref: 'openalex:second-result', title: 'Another discovery result', doi: null };

async function setup(page: Page, accessOnly = false) {
  await installFixtureApi(page);
  const counts = { reads: 0, writes: 0 };
  let saved: Conversation = {
    id: 'control-search', title: 'Saved control research', routing: 'auto', status: 'IDLE', revision: 1, cursor: 'control:1',
    created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', providers: ['openalex', 'crossref'], filters: {},
    turns: [{ id: 'control-turn', action: 'discover', routing: 'auto', message: 'Organized research controls', status: 'PARTIAL', created_at: '2026-11-12T12:00:00Z', providers: ['openalex', 'crossref'], run_ids: [first.run_id, matching.run_id],
      sources: [first, matching, second], papers: [{ paper_id: first.doi!, doi: first.doi, representative: first, providers: ['openalex', 'crossref'], observations: [first, matching], access: { status: 'not_requested' } }, { paper_id: second.source_ref, representative: second, providers: ['openalex'], observations: [second], access: { status: 'not_requested' } }],
      warnings: ['Crossref reached its saved request allowance.'], response: 'Repeated verbose prose should not be displayed in Search.',
      activity: [{ provider: 'openalex', operation: 'hybrid_search', status: 'SUCCEEDED', attempts: 1, source_count: 2 }, { provider: 'crossref', operation: 'hybrid_search', status: 'PARTIAL', attempts: 1, source_count: 1 }],
      usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' } }],
  };
  if (accessOnly) {
    saved.turns[0] = { ...saved.turns[0], sources: [first, second], warnings: [],
      papers: [first, second].map(source => ({ paper_id: source.source_ref, representative: source, providers: [source.provider], observations: [source], access: { status: 'not_requested' } })),
      activity: [{ provider: 'openalex', operation: 'hybrid_search', status: 'SUCCEEDED', attempts: 1, source_count: 2 }, { provider: 'crossref', operation: 'hybrid_search', status: 'EMPTY', attempts: 1, source_count: 0 }, { provider: 'unpaywall', operation: 'access', status: 'failed', attempts: 1, source_count: 0, error_code: 'NOT_FOUND', doi: first.doi! }],
    };
  }
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route(/\/api\/conversations(?:\/[^/?]+)?$/, route => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({ json: new URL(route.request().url()).pathname === '/api/conversations' ? { conversations: [saved] } : saved });
  });
  await page.route('**/api/research-runs/panel-run/snapshot', route => {
    counts.reads++;
    return route.fulfill({ json: { ...initialSnapshot(), id: first.run_id, status: 'succeeded', entities: [first, second] } });
  });
  page.on('request', request => { if (request.method() === 'POST') counts.writes++; });
  return { counts, async update() { saved = { ...saved, revision: saved.revision + 1, cursor: `control:${saved.revision + 1}` }; await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), saved); } };
}

test('information controls share settings and keep paper tools independent', async ({ page }) => {
  const api = await setup(page); await page.goto('/app?search=control-search');
  const header = page.locator('.hybrid-search-settings'), pane = page.getByTestId('search-information');
  await expect(header.getByTestId('search-options')).toBeVisible();
  await expect(header.getByRole('slider', { name: 'Date range' })).toBeVisible();
  await expect(pane).toHaveCount(1);
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(header.getByTestId('search-information-controls')).toBeVisible();
  await expect(pane.locator('form')).toHaveCount(0);
  expect(await pane.evaluate(node => node.closest('form') === null)).toBe(true);
  await expect(page.locator('.hybrid-search-form').getByTestId('search-options')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Expand abstracts', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open in Exploration chat', exact: true })).toBeVisible();
  await expect(page.getByTestId('performance-status')).toHaveText('Partial results');
  await expect(page.getByRole('tab', { name: /^Papers/ })).toContainText('2');
  await expect(page.getByText('Repeated verbose prose should not be displayed in Search.')).toHaveCount(0);
  await openSearchInformation(page, 'Sources and coverage');
  const coverage = pane.getByTestId('search-coverage-details');
  await expect(coverage).toContainText('Crossref reached its saved request allowance.');
  await expect(coverage).toContainText('2 provider records');
  await expect(coverage).toContainText('1 provider records');
  await expect(coverage).toContainText('Matching DOI or exact citation records appear once');
  await (await openResultFilter(page)).fill('Another');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await expect(pane.getByTestId('search-filter-status')).toContainText('Another');
  await page.keyboard.press('Escape');
  await pane.getByRole('button', { name: 'Clear result filter', exact: true }).click();
  await expect(page.getByTestId('search-result-card')).toHaveCount(2);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
  expect(api.counts.writes).toBe(0);
});

test('desktop opens saved metadata once without moving focus and respects closing across stream updates', async ({ page }) => {
  const api = await setup(page); await page.goto('/app?search=control-search');
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader.getByRole('heading', { name: first.title!, exact: true })).toHaveCount(1);
  expect(await reader.evaluate(element => element.contains(document.activeElement))).toBe(false);
  await expect.poll(() => api.counts.reads).toBe(1);
  await page.getByTestId('search-result-card').nth(1).focus();
  await expect(reader.getByRole('heading', { name: second.title!, exact: true })).toHaveCount(1);
  await reader.getByRole('button', { name: 'Close source details', exact: true }).click();
  await expect(reader).toHaveCount(0);
  await api.update();
  await expect(page.getByTestId('search-result-card')).toHaveCount(2);
  await expect(reader).toHaveCount(0);
  expect(api.counts.reads).toBe(1); expect(api.counts.writes).toBe(0);
});

test('narrow touch-style layouts keep metadata closed until an explicit record action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await setup(page); await page.goto('/app?search=control-search');
  await expect(page.getByTestId('search-result-card')).toHaveCount(2);
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toHaveCount(0);
  expect(api.counts.reads).toBe(0);
  await page.getByTestId('search-result-card').first().getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toBeVisible();
  expect(api.counts.reads).toBe(1); expect(api.counts.writes).toBe(0);
});

test('missing Unpaywall records stay separate from successful discovery', async ({ page }) => {
  const api = await setup(page, true); await page.goto('/app?search=control-search');
  const pane = page.getByTestId('search-information');
  await expect(page.getByTestId('performance-status')).toHaveText('Discovery complete · access incomplete');
  await openSearchInformation(page, 'Sources and coverage');
  const coverage = pane.getByTestId('search-coverage-details');
  await expect(coverage).toContainText('Unpaywall: 1 lookup · 0 usable access results');
  await expect(coverage).toContainText('1 unavailable or incomplete');
  await expect(coverage).toContainText('Access enrichment is separate from discovery and relevance');
  await expect(coverage).toContainText('No access record found');
  await expect(coverage).toContainText(first.doi!);
  expect(api.counts.writes).toBe(0);
});
