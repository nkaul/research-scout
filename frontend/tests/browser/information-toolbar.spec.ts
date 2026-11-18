import { expect, test, type Page } from '@playwright/test';
import type { Conversation, ExplorationTurn, RetrievalState } from '../../src/lib/conversations';
import type { DatasetSearch } from '../../src/lib/datasets';
import type { RepositorySearch } from '../../src/lib/repositories';
import { materialTone } from '../../src/lib/material-colors';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';
import { sharedPlanningFields } from './planning-fixture';
import { openResultFilter, openSearchInformation } from './search-controls';

const stamp = '2026-11-15T12:00:00Z';
const sections = ['Search overview', 'Query and focus', 'Sources and coverage', 'Timing and usage'] as const;
const source = { ...FIRST_SOURCE, run_id: 'toolbar-paper', title: 'Toolbar saved source fixture' };
const modelBody = { marker: 'HEAVY_SAVED_MODEL_BODY', input: 'The exact saved planning input.' };
function aiRetrieval(): RetrievalState {
  const plan = sharedPlanningFields();
  plan.resource_queries!.papers.query_terms = ['retrieval', 'RAG', 'question answering'];
  return { ...plan, status: 'completed', intent: 'Improve grounded generation with retrieved context', domain: 'Machine learning', lexical_query: 'canonical context retrieval generation', keywords: ['evidence selection', 'context quality'], tags: ['RAG', 'Context engineering', 'Evaluation', 'Safety', 'rag'], llm_requests: [{ step: 'plan', purpose: 'Saved planning request', status: 'received', model: 'fixture-model', body: modelBody }] };
}
function savedTurn(update: Partial<ExplorationTurn> = {}): ExplorationTurn {
  return { id: 'toolbar-turn', message: 'How can supplied context improve language-model generation?', action: 'discover', agentic: true, routing: 'auto', status: 'SUCCEEDED', created_at: stamp, completed_at: '2026-11-15T12:00:02Z', providers: ['openalex'], source_scope: ['openalex'], run_ids: [source.run_id], sources: [source], papers: [{ paper_id: 'toolbar-paper', representative: source, observations: [source], providers: ['openalex'], access: { status: 'not_requested' } }], warnings: [], response: '', usage: { research_attempts: 1, model_http_attempts: 1, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' }, retrieval: aiRetrieval(), modality_limits: { papers: 4, videos: 0, datasets: 7, repos: 10 }, resource_jobs: { papers: { status: 'SUCCEEDED', phase: 'completed', limit: 4, record_count: 1 }, videos: { status: 'DISABLED', phase: 'disabled', limit: 0, record_count: 0 }, datasets: { status: 'EMPTY', phase: 'completed', limit: 7, record_count: 0, candidate_count: 0, search_id: 'toolbar-data', providers: ['hugging_face', 'datacite'] }, repos: { status: 'EMPTY', phase: 'completed', limit: 10, record_count: 0, candidate_count: 0, search_id: 'toolbar-repos', providers: ['github'] } }, activity: [{ provider: 'openalex', operation: 'hybrid_search', status: 'SUCCEEDED', source_count: 1, attempts: 1 }], ...update };
}
async function install(page: Page, initial = savedTurn()) {
  const legacy = await installFixtureApi(page);
  let turn = initial, revision = 1;
  const parent = (): Conversation => ({ id: 'toolbar-search', title: 'Toolbar saved search', status: turn.status === 'RUNNING' ? 'RUNNING' : 'IDLE', revision, cursor: 'toolbar:' + revision, created_at: stamp, updated_at: stamp, providers: ['openalex'], filters: {}, turns: [turn] });
  const context = { conversation_id: 'toolbar-search', turn_id: 'toolbar-turn', fingerprint: 'toolbar-context', query: 'Saved data provider query', query_mode: 'ai' as const, intent: 'Saved metadata intent', domain: 'Machine learning', keywords: ['retrieval'], tags: ['RAG'] };
  const data: DatasetSearch = { id: 'toolbar-data', status: 'EMPTY', revision: 2, cursor: 'data:2', question: turn.message, context, records: [], provider_activity: [{ provider: 'hugging_face', status: 'EMPTY', record_count: 0, attempts: 1, query: 'Saved data provider query', executed_arguments: { query: 'Saved data provider query', limit: 7 } }], timing_spans: [], warnings: [], usage: { model_http_attempts: 0, catalog_attempts: 1 }, created_at: stamp, completed_at: '2026-11-15T12:00:01Z' };
  const repos: RepositorySearch = { id: 'toolbar-repos', status: 'EMPTY', revision: 2, cursor: 'repos:2', question: turn.message, context: { ...context, query: 'Saved GitHub provider query' }, limit: 10, readme_limit: 5, request_limit: 11, records: [], provider_activity: [{ provider: 'github', status: 'EMPTY', record_count: 0, attempts: 1, query: 'Saved GitHub provider query', executed_arguments: { per_page: 10, readme_limit: 5 } }], timing_spans: [], warnings: [], usage: { model_http_attempts: 0, github_http_attempts: 1 }, created_at: stamp, completed_at: '2026-11-15T12:00:01Z' };
  const reads: string[] = [], writes: string[] = [];
  page.on('request', request => { const path = new URL(request.url()).pathname; if (!path.startsWith('/api/')) return; if (['GET', 'HEAD'].includes(request.method())) reads.push(path); else writes.push(path); });
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: true } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [parent()] } }));
  await page.route('**/api/conversations/toolbar-search', route => route.fulfill({ json: parent() }));
  await page.route('**/api/research-runs/toolbar-paper/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: 'toolbar-paper', status: 'succeeded', entities: [source] } }));
  await page.route('**/api/dataset-searches/toolbar-data', route => route.fulfill({ json: data }));
  await page.route('**/api/repo-searches/toolbar-repos', route => route.fulfill({ json: repos }));
  return { legacy, reads, writes, async publish(update: Partial<ExplorationTurn>) { turn = { ...turn, ...update }; revision++; await page.evaluate(value => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(value), parent()); } };
}
async function open(page: Page) { await page.goto('/app?search=toolbar-search'); await expect(page.getByTestId('search-result-card')).toHaveCount(1); }

test('four information icons share the search settings toolbar and toggle one outside-form detail region', async ({ page }) => {
  const api = await install(page); await open(page);
  const controls = page.getByTestId('search-information-controls'), details = page.getByTestId('search-information');
  await expect(page.locator('.hybrid-search-settings').getByTestId('search-information-controls')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search information', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'Search information sections', exact: true })).toHaveCount(0);
  await expect(controls.getByTestId('information-clock')).toBeVisible();
  await expect(details).toHaveCount(1);
  for (const section of sections) { await expect(controls.getByRole('button', { name: section, exact: true })).toHaveAttribute('aria-expanded', 'false'); await expect(controls.getByRole('button', { name: section, exact: true })).toHaveAttribute('type', 'button'); }
  await expect.poll(() => api.reads.filter(path => path === '/api/dataset-searches/toolbar-data').length).toBe(1);
  await expect.poll(() => api.reads.filter(path => path === '/api/repo-searches/toolbar-repos').length).toBe(1);
  await expect.poll(() => api.reads.filter(path => path === '/api/research-runs/toolbar-paper/snapshot').length).toBe(1);
  const before = api.reads.length;
  const overview = controls.getByRole('button', { name: 'Search overview', exact: true });
  await overview.focus(); await page.keyboard.press('Enter'); await expect(overview).toHaveAttribute('aria-expanded', 'true');
  const controlled = await overview.getAttribute('aria-controls'); expect(controlled).toBeTruthy(); await expect(page.locator('[id="' + controlled + '"]')).toBeVisible();
  expect(await details.evaluate(node => node.closest('form') === null)).toBe(true);
  const settingsBox = (await page.locator('.hybrid-search-settings').boundingBox())!, detailBox = (await details.boundingBox())!, tabsBox = (await page.getByRole('tablist', { name: 'Search result types', exact: true }).boundingBox())!;
  expect(detailBox.y).toBeGreaterThanOrEqual(settingsBox.y + settingsBox.height - 1); expect(detailBox.y + detailBox.height).toBeLessThanOrEqual(tabsBox.y + 1);
  await page.keyboard.press('ArrowRight'); const query = controls.getByRole('button', { name: 'Query and focus', exact: true }); await expect(query).toBeFocused(); await page.keyboard.press('Space'); await expect(query).toHaveAttribute('aria-expanded', 'true'); await expect(overview).toHaveAttribute('aria-expanded', 'false');
  await query.press('Space'); await expect(query).toHaveAttribute('aria-expanded', 'false');
  const input = await openResultFilter(page); await input.fill('Toolbar'); await input.press('Enter'); await page.keyboard.press('Escape');
  expect(api.reads).toHaveLength(before); expect(api.writes).toEqual([]); expect(api.legacy.state.starts).toBe(0);
});

test('actual saved AI query and colored focus terms show automatically while heavy records stay explicit', async ({ page }) => {
  const api = await install(page); await open(page);
  const focus = page.getByTestId('ai-focus-summary'); await expect(focus).toBeVisible(); await expect(focus.getByTestId('ai-focus-query')).toContainText('papers retrieval evaluation');
  await expect(focus.locator('[data-chip-kind="tag"]').first()).toHaveAttribute('data-chip-tone', materialTone('RAG'));
  await expect(focus.locator('[data-chip-kind="domain"]')).toContainText('Machine learning');
  await expect(page.getByTestId('search-query-review')).toHaveCount(0); await expect(page.getByTestId('saved-llm-request-body')).toHaveCount(0);
  await focus.getByRole('button', { name: /Show all .* AI focus terms/ }).click();
  await expect(focus.locator('[data-chip-kind="tag"]')).toHaveCount(4); await expect(focus.locator('[data-chip-kind="keyword"]')).toHaveCount(2);
  await expect(focus.locator('[data-chip-kind="keyword"]').first()).toHaveAttribute('data-chip-tone', materialTone('retrieval'));
  await page.getByRole('tab', { name: /^Repos/ }).click(); await expect(focus.getByTestId('ai-focus-query')).toContainText('repos retrieval evaluation'); await expect(focus).not.toContainText('Saved GitHub provider query');
  await focus.getByRole('button', { name: 'Query details', exact: true }).click();
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Query and focus', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('tab', { name: 'LLM input', exact: true }).click(); await expect(page.getByTestId('saved-llm-request-body')).toContainText('HEAVY_SAVED_MODEL_BODY');
  expect(api.writes).toEqual([]); expect(api.legacy.state.starts).toBe(0);
});

test('coverage icons follow the active resource without repeating provider reads or creating streams', async ({ page }) => {
  const api = await install(page); await open(page);
  await expect.poll(() => api.reads.filter(path => path === '/api/dataset-searches/toolbar-data').length).toBe(1); await expect.poll(() => api.reads.filter(path => path === '/api/repo-searches/toolbar-repos').length).toBe(1);
  await expect.poll(() => api.reads.filter(path => path === '/api/research-runs/toolbar-paper/snapshot').length).toBe(1);
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-connection', 'connected');
  await expect(page.getByTestId('dataset-results')).toHaveAttribute('data-status', 'EMPTY');
  await expect(page.getByTestId('repo-results')).toHaveAttribute('data-status', 'EMPTY');
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByRole('heading', { name: source.title!, exact: true })).toBeVisible();
  await expect(page.getByTestId('source-preview-loading')).toHaveCount(0);
  const before = api.reads.length;
  await page.evaluate(() => { const host = window as unknown as { __toolbarStreams: number; __toolbarStreamUrls: string[] }; host.__toolbarStreams = 0; host.__toolbarStreamUrls = []; const Original = window.EventSource; window.EventSource = class extends Original { constructor(url: string | URL, options?: EventSourceInit) { super(url, options); host.__toolbarStreams++; host.__toolbarStreamUrls.push(String(url)); } }; });
  const details = await openSearchInformation(page, 'Sources and coverage'); await expect(details.getByTestId('search-coverage-details')).toContainText('Papers source outcomes');
  await page.getByRole('tab', { name: /^Data/ }).click(); await expect(details.getByTestId('search-coverage-details')).toContainText('Hugging Face'); await expect(details.getByTestId('search-coverage-details')).toContainText('Data catalog outcomes');
  await page.getByRole('tab', { name: /^Repos/ }).click(); await expect(details.getByTestId('search-coverage-details')).toContainText('GitHub'); await expect(details.getByTestId('search-coverage-details')).toContainText('five candidates'); await expect(details.getByTestId('search-coverage-details')).not.toContainText('Hugging Face');
  await openSearchInformation(page, 'Timing and usage'); await expect(details).toContainText('Repos retrieval timing');
  expect(api.reads).toHaveLength(before); expect(api.writes).toEqual([]); expect(await page.evaluate(() => (window as unknown as { __toolbarStreamUrls: string[] }).__toolbarStreamUrls)).toEqual([]);
});

test('a new saved turn closes icon panels and removes prior AI focus and provider details', async ({ page }) => {
  const api = await install(page, savedTurn({ status: 'RUNNING', completed_at: undefined })); await open(page); await expect(page.getByTestId('search-results')).toHaveAttribute('data-connection', 'connected');
  await openSearchInformation(page, 'Query and focus'); await expect(page.getByTestId('ai-focus-summary')).toContainText('Context engineering');
  await api.publish({ id: 'toolbar-next-turn', message: 'A fresh question without saved focus yet', status: 'RUNNING', sources: [], papers: [], run_ids: [], retrieval: { status: 'planning' }, usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, modality_limits: { papers: 4, videos: 0, datasets: 0, repos: 0 }, resource_jobs: { papers: { status: 'RUNNING', phase: 'retrieving', limit: 4, record_count: 0 }, datasets: { status: 'DISABLED', phase: 'disabled', limit: 0, record_count: 0 }, repos: { status: 'DISABLED', phase: 'disabled', limit: 0, record_count: 0 } } });
  for (const section of sections) await expect(page.getByTestId('search-information-controls').getByRole('button', { name: section, exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('ai-focus-summary')).not.toContainText('Context engineering'); await expect(page.getByTestId('ai-focus-state')).toContainText('Waiting for the saved AI query focus');
  await expect(page.getByTestId('search-query-review')).toHaveCount(0);
  const details = await openSearchInformation(page, 'Query and focus'); await expect(details.getByTestId('trace-original-question')).toHaveText('A fresh question without saved focus yet'); await expect(details).not.toContainText('Saved data provider query');
  expect(api.writes).toEqual([]);
});

for (const history of ['direct', 'compacted-model'] as const) test('automatic focus treats ' + history + ' history honestly', async ({ page }) => {
  const turn = savedTurn({ agentic: history !== 'direct', retrieval: undefined, history_compacted: history === 'compacted-model', usage: { research_attempts: 1, model_http_attempts: history === 'direct' ? 0 : 1, model_cost_usd: 0 } });
  const api = await install(page, turn); await open(page);
  if (history === 'direct') await expect(page.getByTestId('ai-focus-summary')).toHaveCount(0);
  else { await expect(page.getByTestId('ai-focus-state')).toContainText('compact saved history'); await expect(page.getByTestId('ai-focus-summary')).not.toContainText('AI did not run'); }
  expect(api.writes).toEqual([]);
});

test('information icons, focus overflow and detail controls remain usable on narrow screens without submitting', async ({ page }) => {
  const api = await install(page); await page.setViewportSize({ width: 390, height: 850 }); await open(page);
  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 850 });
    const details = await openSearchInformation(page, 'Search overview'); await expect(details.getByTestId('saved-search-limits')).toBeVisible();
    await page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true }).press('Enter');
    const row = page.getByTestId('ai-focus-summary'); await row.getByRole('button', { name: /Show all .* AI focus terms/ }).click(); await expect(row).toContainText('Safety'); await row.getByRole('button', { name: 'Show less AI focus', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  expect(api.writes).toEqual([]); expect(api.legacy.state.starts).toBe(0);
});
