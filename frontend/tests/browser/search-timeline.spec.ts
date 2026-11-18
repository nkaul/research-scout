import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation, ExplorationTurn, TimingSpan } from '../../src/lib/conversations';
import { searchTimeline } from '../../src/lib/search-timeline';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';
import { openSearchInformation } from './search-controls';

const start = Date.parse('2026-11-14T12:00:00Z');
const at = (ms: number) => new Date(start + ms).toISOString();
const span = (id: string, phase: string, began: number, end: number, extra: Partial<TimingSpan> = {}): TimingSpan => ({ id, phase, label: id, started_at: at(began), completed_at: at(end), duration_ms: end - began, status: 'succeeded', ...extra });
const source: ChatSource = { ...FIRST_SOURCE, run_id: 'timeline-run', title: 'Authored timeline evidence', relevance: { label: 'relevant', reason: 'Authored reviewed fixture for timing inspection.' } };
function turn(spans: TimingSpan[] = []): ExplorationTurn {
  return { id: 'timeline-turn', message: 'How does context selection improve generation?', action: 'discover', agentic: true, status: 'SUCCEEDED', created_at: at(0), completed_at: at(10000), providers: ['openalex', 'crossref'], run_ids: ['timeline-run'], sources: [source], papers: [{ paper_id: source.source_ref, representative: source, providers: ['openalex'], observations: [source], access: { status: 'not_requested' } }], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'bounded_agentic_retrieval', generation: 'disabled' }, timing_spans: spans };
}
const spans = () => [
  span('Planning', 'planning', 100, 1100, { step: 'plan' }),
  span('OpenAlex retrieval + local ranking', 'provider', 1200, 6200, { provider: 'openalex', round: 1, run_id: 'timeline-run', query: '"context engineering" language models' }),
  span('Crossref retrieval + local ranking', 'provider', 2200, 5200, { provider: 'crossref', round: 1 }),
  span('OpenAlex lexical request', 'retrieval', 1300, 6100, { provider: 'openalex', round: 1, branch: 'lexical', run_id: 'timeline-run' }),
  span('Relevance review', 'review', 6500, 8500, { step: 'review-openalex' }),
  span('DOI access', 'access', 8000, 9000, { provider: 'unpaywall' }),
];

test('timeline unions parallel and nested recorded intervals rather than summing their durations', () => {
  const result = searchTimeline(turn(spans()));
  expect(result.wall).toBe(10000); expect(result.covered).toBe(8500); expect(result.unattributed).toBe(1500);
  expect(result.rows.find(row => row.span.id === 'Crossref retrieval + local ranking')).toMatchObject({ start: 2200, end: 5200, duration: 3000 });
});

test('unknown or corrupt timing does not invent intervals and terminal work cannot keep ticking', () => {
  const missing = turn([ { id: 'broken', phase: 'provider', label: 'Invalid timestamp', status: 'running', started_at: 'invalid', duration_ms: -1 } ]);
  expect(searchTimeline(missing, start + 50000)).toMatchObject({ wall: 10000, covered: null, unattributed: null });
  expect(searchTimeline(missing).rows[0]).toMatchObject({ start: null, end: null, duration: null, active: false });
  const cancelled = turn([{ id: 'stopped', phase: 'provider', label: 'Stopped work', status: 'running', started_at: at(1000) }]); cancelled.status = 'CANCELLED';
  expect(searchTimeline(cancelled, start + 50000).rows[0]).toMatchObject({ start: 1000, end: null, duration: null, active: false });
});

test('an active measured stage grows only from its recorded start and clips coverage to the current wall clock', () => {
  const active = turn([{ id: 'waiting', phase: 'planning', label: 'Query planning', status: 'running', started_at: at(1000) }]); active.status = 'RUNNING'; active.completed_at = undefined;
  expect(searchTimeline(active, start + 3500)).toMatchObject({ wall: 3500, covered: 2500, unattributed: 1000 });
  expect(searchTimeline(active, start + 3500).rows[0]).toMatchObject({ active: true, duration: 2500 });
});

async function install(page: Page, initial: ExplorationTurn) {
  await installFixtureApi(page);
  const saved: Conversation = { id: 'timeline-search', title: 'Timeline search', status: 'IDLE', revision: 1, cursor: 'timeline:1', created_at: at(0), updated_at: at(10000), providers: ['openalex'], filters: {}, turns: [initial] };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false, blocked_reason: 'Authored fixture model is offline.' } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/timeline-search', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/timeline-run/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: 'timeline-run', status: 'succeeded', entities: [source] } }));
  const reads: string[] = [], writes: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) (request.method() === 'GET' ? reads : writes).push(request.url()); });
  return { reads, writes };
}

test('timing plot shows actual waits, exact saved request inputs and overlap without extra research or metadata reads', async ({ page }) => {
  const saved = turn(spans());
  saved.retrieval = { status: 'completed', llm_requests: [{ step: 'plan', purpose: 'plan', status: 'response_received', model: 'fixture-planner', body: { input: 'What context helps generation?', instructions: '<img src=x onerror=alert(1)>' } }], source_requests: [{ provider: 'openalex', run_id: 'timeline-run', round: 1, branch: 'lexical', transport: 'mcp', query_input: '"context engineering" language models', executed_arguments: { search: 'context engineering', year_from: 2021 }, status: 'succeeded', cache_hit: true }] };
  const api = await install(page, saved);
  await page.goto('/app?search=timeline-search');
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByRole('heading', { name: source.title!, exact: true })).toBeVisible();
  const before = api.reads.length;
  await openSearchInformation(page, 'Timing and usage');
  const timeline = page.getByTestId('search-timeline');
  await expect(timeline.getByTestId('timeline-wall')).toHaveText('10.00 s');
  await expect(timeline.getByTestId('timeline-covered')).toHaveText('8.50 s');
  await expect(timeline.getByTestId('timeline-unattributed')).toHaveText('1.50 s');
  await expect(timeline.getByTestId('timeline-row')).toHaveCount(6);
  const provider = timeline.getByTestId('timeline-row').filter({ has: page.locator('summary strong', { hasText: /^OpenAlex retrieval \+ local ranking$/ }) });
  await provider.locator(':scope > summary').click();
  await expect(provider.getByTestId('timeline-query')).toHaveText('"context engineering" language models');
  await provider.getByText('Lexical · mcp · cached', { exact: true }).click();
  await expect(provider.getByTestId('timeline-provider-query')).toHaveText('"context engineering" language models');
  await expect(provider.locator('pre')).toContainText('year_from');
  const model = timeline.getByTestId('timeline-row').filter({ has: page.locator('summary strong', { hasText: /^Planning$/ }) });
  await model.locator(':scope > summary').click(); await model.getByText('Recorded model input', { exact: true }).click();
  await expect(model.getByTestId('timeline-model-input')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(api.reads).toHaveLength(before); expect(api.writes).toEqual([]);
  for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
});

test('old searches show their recorded total with an explicit missing-breakdown state and no invented provider bars', async ({ page }) => {
  const api = await install(page, turn()); await page.goto('/app?search=timeline-search');
  await openSearchInformation(page, 'Timing and usage');
  await expect(page.getByTestId('timeline-overall')).toContainText('10.00 s');
  await expect(page.getByTestId('timeline-unavailable')).toContainText('Detailed stage timing was not recorded');
  await expect(page.getByTestId('timeline-row')).toHaveCount(0); expect(api.writes).toEqual([]);
});
