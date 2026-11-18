import { expect, test, type Page } from '@playwright/test';
import type { Conversation, ExplorationTurn } from '../../src/lib/conversations';
import type { DatasetSearch } from '../../src/lib/datasets';
import { acceptsResourceInformation, type ResourceInformationUpdate } from '../../src/lib/search-information';
import { performanceStatus } from '../../src/lib/search-performance';
import { searchResources } from '../../src/lib/search-resources';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';
import { openSearchInformation } from './search-controls';

const stamp = '2026-11-14T12:00:00Z';
const paper = { ...FIRST_SOURCE, run_id: 'information-paper', title: 'Saved information fixture paper' };
function savedTurn(update: Partial<ExplorationTurn> = {}): ExplorationTurn {
  return { id: 'information-turn', message: 'Find evidence for a saved research question', action: 'discover', agentic: false, routing: 'auto', status: 'SUCCEEDED', created_at: stamp, completed_at: '2026-11-14T12:00:02Z', providers: ['openalex'], source_scope: ['openalex'], run_ids: [paper.run_id], sources: [paper], papers: [{ paper_id: 'information-paper', representative: paper, observations: [paper], providers: ['openalex'], access: { status: 'not_requested' } }], warnings: [], response: '', usage: { research_attempts: 1, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' }, modality_limits: { papers: 4, videos: 0, datasets: 7, repos: 0 }, resource_jobs: { papers: { status: 'SUCCEEDED', phase: 'completed', limit: 4, record_count: 1 }, videos: { status: 'DISABLED', phase: 'disabled', limit: 0, record_count: 0 }, datasets: { status: 'EMPTY', phase: 'completed', limit: 7, record_count: 0, candidate_count: 0, search_id: 'information-data', providers: ['hugging_face', 'datacite'] }, repos: { status: 'DISABLED', phase: 'disabled', limit: 0, record_count: 0 } }, activity: [{ provider: 'openalex', operation: 'hybrid_search', status: 'SUCCEEDED', source_count: 1, attempts: 1 }], ...update };
}
function child(): DatasetSearch {
  return { id: 'information-data', status: 'EMPTY', revision: 2, cursor: 'data:2', question: 'Fixture child', context: { conversation_id: 'information-search', turn_id: 'information-turn', fingerprint: 'fixture', query: 'Saved data query', query_mode: 'direct', intent: 'Saved data intent', domain: null, keywords: [], tags: [] }, records: [], provider_activity: [{ provider: 'hugging_face', status: 'EMPTY', record_count: 0, attempts: 1, query: 'Saved data query', executed_arguments: { query: 'Saved data query', limit: 7 } }], timing_spans: [], warnings: [], usage: { model_http_attempts: 0, catalog_attempts: 1 }, created_at: stamp, completed_at: '2026-11-14T12:00:01Z' };
}

test('canonical status cannot call failed, unknown or incomplete resource jobs complete discovery', () => {
  const accessOnly = savedTurn({ status: 'PARTIAL', activity: [{ provider: 'openalex', operation: 'hybrid_search', status: 'SUCCEEDED', source_count: 1, attempts: 1 }, { provider: 'unpaywall', operation: 'access', status: 'FAILED', source_count: 0, attempts: 1, error_code: 'NOT_FOUND' }] });
  expect(performanceStatus(accessOnly)).toEqual({ label: 'Discovery complete · access incomplete', tone: 'success' });
  expect(performanceStatus({ ...accessOnly, resource_jobs: { ...accessOnly.resource_jobs, datasets: { status: 'FAILED', phase: 'completed', limit: 7, record_count: 0 } } })).toEqual({ label: 'Partial results', tone: 'warning' });
  expect(performanceStatus(savedTurn({ resource_jobs: {} }))).toEqual({ label: 'Search complete · resource status not recorded', tone: 'neutral' });
  expect(performanceStatus(savedTurn(), { resourceStatuses: { datasets: 'PARTIAL' } })).toEqual({ label: 'Partial results', tone: 'warning' });
  expect(performanceStatus(savedTurn({ modality_limits: undefined, resource_jobs: undefined }))).toEqual({ label: 'Search complete', tone: 'success' });
  expect(performanceStatus(savedTurn({ retrieval: { status: 'clarification_needed' } }))).toEqual({ label: 'Clarification needed', tone: 'warning' });
  expect(performanceStatus(savedTurn({ status: 'CANCELLED', retrieval: { status: 'clarification_needed' } }))).toEqual({ label: 'Search stopped', tone: 'warning' });
});

test('child information rejects old scopes, wrong links, old revisions and cleanup over a saved snapshot', () => {
  const snapshot = child();
  const report: ResourceInformationUpdate = { lane: 'datasets', conversationId: 'information-search', turnId: 'information-turn', searchId: snapshot.id, revision: snapshot.revision, snapshot, reading: false, working: false, error: '', connection: 'saved' };
  expect(acceptsResourceInformation(report, 'information-search', savedTurn())).toBe(true);
  expect(acceptsResourceInformation(report, 'different-search', savedTurn())).toBe(false);
  expect(acceptsResourceInformation(report, 'information-search', undefined)).toBe(false);
  expect(acceptsResourceInformation(report, 'information-search', savedTurn({ id: 'next-turn' }))).toBe(false);
  expect(acceptsResourceInformation(report, 'information-search', savedTurn({ resource_jobs: { datasets: { ...savedTurn().resource_jobs!.datasets!, search_id: 'replacement-data' } } }))).toBe(false);
  expect(acceptsResourceInformation({ ...report, revision: 1, snapshot: { ...snapshot, revision: 1 } }, 'information-search', savedTurn(), report)).toBe(false);
  expect(acceptsResourceInformation({ ...report, revision: null, snapshot: null }, 'information-search', savedTurn(), report)).toBe(false);
});

async function install(page: Page, initial = savedTurn()) {
  await installFixtureApi(page);
  let turn = initial;
  let revision = 1;
  const parent = (): Conversation => ({ id: 'information-search', title: 'Saved information search', routing: 'auto', status: turn.status === 'RUNNING' ? 'RUNNING' : 'IDLE', revision, cursor: `information:${revision}`, created_at: stamp, updated_at: stamp, providers: ['openalex'], filters: {}, turns: [turn] });
  const reads: string[] = [], writes: string[] = [];
  page.on('request', request => { const path = new URL(request.url()).pathname; if (!path.startsWith('/api/')) return; if (request.method() === 'GET') reads.push(path); else writes.push(path); });
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: true } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [parent()] } }));
  await page.route('**/api/conversations/information-search', route => route.fulfill({ json: parent() }));
  await page.route('**/api/dataset-searches/information-data', route => route.fulfill({ json: child() }));
  await page.route('**/api/research-runs/information-paper/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: 'information-paper', status: 'succeeded', entities: [paper] } }));
  return { reads, writes, async publish(update: Partial<ExplorationTurn>) { turn = { ...turn, ...update }; revision++; await page.evaluate(value => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(value), parent()); } };
}

test('information icon sections keep their selection across resource tabs and add no GET/SSE or writes', async ({ page }) => {
  const api = await install(page);
  await page.goto('/app?search=information-search');
  const pane = page.getByTestId('search-information');
  const toggle = page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true });
  await expect(pane).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => api.reads.filter(path => path === '/api/dataset-searches/information-data').length).toBe(1);
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toContainText(paper.title!);
  const savedReads = api.reads.length;
  await toggle.click();
  await expect(pane.getByTestId('saved-search-limits').getByRole('row', { name: /Data/ })).toContainText('7 per catalog');
  await page.getByTestId('search-information-controls').getByRole('button', { name: 'Query and focus', exact: true }).click();
  await expect(pane.getByTestId('trace-original-question')).toHaveCount(1);
  await page.getByRole('tab', { name: /^Data/ }).click();
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Query and focus', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await pane.getByRole('tab', { name: 'Provider queries', exact: true }).click();
  await pane.locator('details').filter({ hasText: 'Hugging Face' }).first().locator('summary').click();
  await expect(pane.getByTestId('saved-provider-arguments')).toContainText('Saved data query');
  await page.getByTestId('search-information-controls').getByRole('button', { name: 'Timing and usage', exact: true }).click();
  await expect(pane.getByTestId('performance-retrieval')).toContainText('2.00 s');
  await expect(pane).toContainText('Original search duration');
  await page.getByTestId('search-information-controls').getByRole('button', { name: 'Timing and usage', exact: true }).click();
  expect(api.reads).toHaveLength(savedReads);
  expect(api.writes).toEqual([]);
  await expect(page.locator('.hybrid-search-performance, .hybrid-query-focus').filter({ has: page.getByTestId('search-performance-bar') })).toHaveCount(0);
  await expect(page.getByTestId('resource-tabs-loading-status')).toHaveCount(1);
  await expect(page.locator('.sr-only[role="status"][aria-live="polite"]')).toHaveCount(1);
});

test('local filter has keyboard popover focus and a clear indicator while diagnostics are closed', async ({ page }) => {
  const api = await install(page);
  await page.goto('/app?search=information-search');
  const pane = page.getByTestId('search-information');
  const filter = page.getByRole('button', { name: 'Filter available results', exact: true });
  await filter.click();
  await page.getByRole('searchbox', { name: 'Find in available search results', exact: true }).fill('no-fixture-title');
  await page.keyboard.press('Escape');
  await expect(filter).toBeFocused();
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(pane.getByTestId('search-filter-status')).toContainText('no-fixture-title');
  await expect(page.getByTestId('search-result-card')).toHaveCount(0);
  await pane.getByRole('button', { name: 'Clear result filter', exact: true }).click();
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  expect(api.writes).toEqual([]);
  for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 900 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
});

test('inactive lane failures remain visible without expanding diagnostics', async ({ page }) => {
  await install(page, savedTurn({ status: 'PARTIAL', resource_jobs: { ...savedTurn().resource_jobs, datasets: { status: 'FAILED', phase: 'completed', limit: 7, record_count: 0, error: { code: 'CATALOG_LIMIT', message: 'Catalog allowance is unavailable.' } } } }));
  await page.goto('/app?search=information-search');
  await expect(page.getByTestId('performance-status')).toHaveText('Partial results');
  await expect(page.getByTestId('resource-outcome-alerts')).toContainText('Data needs attention');
  await expect(page.getByTestId('resource-outcome-alerts')).toContainText('Catalog allowance is unavailable.');
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true })).toHaveAttribute('aria-expanded', 'false');
});

test('tab switches preserve existing streams and a new streamed turn resets and masks old information', async ({ page }) => {
  const api = await install(page, savedTurn({ status: 'RUNNING', completed_at: undefined }));
  await page.goto('/app?search=information-search');
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-connection', 'connected');
  const pane = await openSearchInformation(page, 'Query and focus');
  await page.getByRole('tab', { name: /^Data/ }).click();
  await pane.getByRole('tab', { name: 'Provider queries', exact: true }).click();
  await expect(pane.getByText('Hugging Face · Empty · 1 attempts', { exact: true })).toBeVisible();
  const before = api.reads.length;
  await page.evaluate(() => {
    const host = window as unknown as { __newInformationStreams: number };
    host.__newInformationStreams = 0;
    const Original = window.EventSource;
    window.EventSource = class extends Original { constructor(url: string | URL, configuration?: EventSourceInit) { super(url, configuration); host.__newInformationStreams++; } };
  });
  for (const label of ['Papers', 'Repos', 'Data']) await page.getByRole('tab', { name: new RegExp(`^${label}`) }).click();
  await page.getByTestId('search-information-controls').getByRole('button', { name: 'Query and focus', exact: true }).click();
  await openSearchInformation(page, 'Sources and coverage');
  expect(api.reads).toHaveLength(before);
  expect(await page.evaluate(() => (window as unknown as { __newInformationStreams: number }).__newInformationStreams)).toBe(0);
  await api.publish({ id: 'next-information-turn', message: 'Fresh saved question', status: 'RUNNING', sources: [], papers: [], modality_limits: { papers: 4, videos: 0, datasets: 0, repos: 0 }, resource_jobs: { papers: { status: 'RUNNING', phase: 'retrieving', limit: 4, record_count: 0 }, datasets: { status: 'DISABLED', phase: 'disabled', limit: 0, record_count: 0 } } });
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(pane).not.toContainText('Saved data intent');
  await openSearchInformation(page, 'Query and focus');
  await expect(pane.getByTestId('trace-original-question')).toHaveText('Fresh saved question');
  await expect(pane).not.toContainText('Saved data query');
  expect(api.writes).toEqual([]);
});

test('saved AI focus overflow stays separate from explicit diagnostic sections', async ({ page }) => {
  const api = await install(page, savedTurn({ agentic: true, retrieval: { status: 'completed', lexical_query: 'Saved canonical AI query', keywords: ['Saved keyword one', 'Saved keyword two'], tags: ['Saved focus one', 'Saved focus two', 'Saved focus three', 'Saved focus four'] } }));
  await page.goto('/app?search=information-search');
  const row = page.getByTestId('ai-focus-summary');
  await expect(row).toBeVisible();
  const more = row.getByRole('button', { name: /Show all .* AI focus terms/ });
  if (await more.count()) { await more.focus(); await page.keyboard.press('Enter'); }
  await expect(row).toContainText('Saved focus four');
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('search-query-review')).toHaveCount(0);
  expect(api.writes).toEqual([]);
});

for (const central of [true, false]) test(`compacted ${central ? 'central' : 'legacy'} results use ${central ? 'recorded lane counts' : 'unknown counts'} rather than zero`, async ({ page }) => {
  await install(page, savedTurn({ history_compacted: true, sources: [], papers: [], saved_result_counts: { sources: 9, papers: 4, related_sources: 0, llm_requests: 0, source_requests: 0, assessments: 0 }, ...(central ? { resource_jobs: { ...savedTurn().resource_jobs, papers: { status: 'SUCCEEDED', phase: 'completed', limit: 4, record_count: 4 } } } : { modality_limits: undefined, resource_jobs: undefined }) }));
  await page.goto('/app?search=information-search');
  await expect(page.getByRole('tab', { name: /^Papers/ })).toContainText(central ? '4' : '—');
  const pane = await openSearchInformation(page, 'Search overview');
  const row = pane.getByTestId('saved-search-limits').getByRole('row', { name: /^Papers/ });
  await expect(row.getByRole('cell').nth(2)).toHaveText(central ? '4' : '—');
});

test('retained compacted identities keep citation-group display counts over pre-group job counts', async ({ page }) => {
  const first = { ...paper, title: 'Saved authored scholarly evidence about responsible research information architecture', doi: null };
  const second = { ...first, provider: 'crossref', source_ref: 'crossref:information-copy', record_id: 'information-copy' };
  const turn = savedTurn({ history_compacted: true, sources: [first, second], papers: [first, second].map(source => ({ paper_id: source.source_ref, representative: source, observations: [source], providers: [source.provider], access: { status: 'not_requested' } })), resource_jobs: { ...savedTurn().resource_jobs, papers: { status: 'SUCCEEDED', phase: 'completed', limit: 4, record_count: 2 } } });
  expect(searchResources(turn)).toHaveLength(1);
  await install(page, turn);
  await page.goto('/app?search=information-search');
  await expect(page.getByRole('tab', { name: /^Papers/ })).toContainText('1');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  const pane = await openSearchInformation(page, 'Search overview');
  await expect(pane.getByTestId('saved-search-limits').getByRole('row', { name: /^Papers/ }).getByRole('cell').nth(2)).toHaveText('1');
});

test('starting a new search closes and masks the previous local filter and saved details', async ({ page }) => {
  await install(page);
  let release!: () => void;
  const admission = new Promise<void>(resolve => { release = resolve; });
  const turn = savedTurn({ id: 'next-turn', message: 'Fresh explicit question', status: 'RUNNING', completed_at: undefined, sources: [], papers: [] });
  const next: Conversation = { id: 'next-search', title: turn.message, status: 'RUNNING', revision: 1, cursor: 'next:1', created_at: stamp, updated_at: stamp, providers: ['openalex'], filters: {}, turns: [turn] };
  await page.route('**/api/conversations', async route => { if (route.request().method() !== 'POST') return route.fallback(); await admission; await route.fulfill({ status: 201, json: { ...next, status: 'IDLE', turns: [] } }); });
  await page.route('**/api/conversations/next-search/turns', route => route.fulfill({ status: 202, json: next }));
  await page.route('**/api/conversations/next-search', route => route.fulfill({ json: next }));
  await page.goto('/app?search=information-search');
  const pane = await openSearchInformation(page, 'Query and focus');
  await page.getByRole('textbox', { name: 'Research question', exact: true }).fill('Fresh explicit question');
  await page.getByRole('button', { name: 'Filter available results', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find in available search results', exact: true }).fill('previous-filter-only');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('performance-status')).toHaveText('Starting search');
  await expect(page.getByRole('dialog', { name: 'Filter available results', exact: true })).toHaveCount(0);
  await expect(pane.getByTestId('search-filter-status')).toHaveCount(0);
  await expect(pane).not.toContainText('previous-filter-only');
  await expect(pane.getByTestId('trace-original-question')).toHaveCount(0);
  release();
  await page.waitForURL(/search=next-search/);
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await openSearchInformation(page, 'Query and focus');
  await expect(pane.getByTestId('trace-original-question')).toHaveText('Fresh explicit question');
});
