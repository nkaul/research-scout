import { sharedPlanningFields } from './planning-fixture';
import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation, ExplorationTurn } from '../../src/lib/conversations';
import type { DatasetRecord, DatasetSearch } from '../../src/lib/datasets';
import { datasetRecords, datasetUrl } from '../../src/lib/datasets';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';
import { openResultFilter, openSearchInformation } from './search-controls';

const paper: ChatSource = { ...FIRST_SOURCE, run_id: 'dataset-paper', relevance: { label: 'relevant', reason: 'Authored paper fixture.' } };
const created = '2026-11-14T12:00:00Z';
function turn(id = 'dataset-parent-turn', agentic = true): ExplorationTurn {
  return { id, message: 'Find data for retrieval augmented generation evaluation', action: 'discover', agentic, status: 'SUCCEEDED', created_at: created, completed_at: '2026-11-14T12:00:01Z', providers: ['openalex'], sources: [paper], run_ids: [paper.run_id], warnings: [], response: '', usage: { research_attempts: 0, model_http_attempts: agentic ? 1 : 0, model_cost_usd: 0 }, plan: { routing: 'bounded_agentic_retrieval', generation: 'disabled' }, ...(agentic ? { retrieval: { ...sharedPlanningFields(), status: 'completed', intent: 'Evaluate retrieved evidence for language model generation', domain: 'Machine learning', lexical_query: 'retrieval evaluation', keywords: ['retrieval', 'question answering'], tags: ['RAG'] } } : {}) };
}
function dataset(provider = 'hugging_face', id = 'example/rag'): DatasetRecord {
  return { dataset_id: provider + ':' + id, provider, source_ref: provider + ':' + id, record_id: id, resource_type: 'dataset', title: provider === 'hugging_face' ? 'Authored RAG evaluation dataset' : 'Registered retrieval evaluation observations', description: 'An authored metadata fixture for retrieval evaluation. No dataset files were loaded.', doi: provider === 'datacite' ? '10.0000/dataset' : null, url: provider === 'hugging_face' ? 'https://huggingface.co/datasets/example/rag' : 'https://example.org/dataset', version: 'v2', authors: ['Example Data Author'], publisher: 'Example Research Lab', year: 2025, tags: ['retrieval'], tasks: ['question-answering'], formats: ['CSV'], license: 'cc-by-4.0', access: { status: 'public', gated: false, private: false }, relationships: provider === 'datacite' ? [{ identifier: '10.0000/paper', type: 'IsSupplementTo', source: 'registered' }] : [], match: { status: 'candidate', matched_terms: ['retrieval'], missing_constraints: ['Population suitability unverified'], reason: 'Catalog metadata mentions retrieval; inspect the original task and split.' }, mode: 'fixture', observed_at: created };
}
function snapshot(records: DatasetRecord[] = [], status = 'RUNNING', parent = 'dataset-parent', turnId = 'dataset-parent-turn'): DatasetSearch {
  return { id: 'dataset-search-1', status, revision: 1, cursor: 'datasets:1', question: 'Find data for retrieval augmented generation evaluation', context: { conversation_id: parent, turn_id: turnId, fingerprint: 'fixture-context', intent: 'Evaluate retrieved evidence for language model generation', domain: 'Machine learning', keywords: ['retrieval', 'question answering'], tags: ['RAG'], query: 'retrieval evaluation' }, records, provider_activity: [{ provider: 'hugging_face', status: 'succeeded', attempts: 1, record_count: records.filter(r => r.provider === 'hugging_face').length }, { provider: 'datacite', status: status === 'RUNNING' ? 'running' : 'succeeded', attempts: 1 }], timing_spans: [], warnings: [], usage: { catalog_attempts: 2, model_http_attempts: 0 }, created_at: created, ...(status === 'RUNNING' ? {} : { completed_at: '2026-11-14T12:00:02Z' }) };
}
async function install(page: Page, { parentTurn = turn(), saved = null as DatasetSearch | null } = {}) {
  const legacy = await installFixtureApi(page);
  const parent: Conversation = { id: 'dataset-parent', title: 'Dataset parent research', status: 'IDLE', revision: 1, cursor: 'parent:1', created_at: created, updated_at: created, providers: ['openalex'], filters: {}, turns: [parentTurn] };
  let data = saved;
  const posts: { path: string; body: Record<string, unknown> }[] = [], reads: string[] = [];
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: false, blocked_reason: 'Existing model allowance is held.' } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [parent] } }));
  await page.route('**/api/conversations/dataset-parent', route => route.fulfill({ json: parent }));
  await page.route('**/api/research-runs/dataset-paper/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: 'dataset-paper', status: 'succeeded', entities: [paper] } }));
  await page.route('**/api/dataset-providers', route => route.fulfill({ json: { providers: ['hugging_face', 'datacite'].map(id => ({ id, status: 'ready', mode: 'fixture' })) } }));
  await page.route(/\/api\/dataset-searches(?:[/?].*)?$/, async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'GET') {
      reads.push(url.pathname + url.search);
      if (url.pathname === '/api/dataset-searches') return route.fulfill({ json: { searches: data ? [data] : [] } });
      return route.fulfill({ json: data });
    }
    posts.push({ path: url.pathname, body: req.postDataJSON() });
    if (url.pathname.endsWith('/cancel')) data = { ...data!, status: 'CANCELLED', revision: data!.revision + 1, completed_at: '2026-11-14T12:00:02Z' };
    else data = snapshot();
    return route.fulfill({ status: 202, json: data });
  });
  return { posts, reads, legacy, parent, async publish(update: Partial<DatasetSearch>) { data = { ...data!, ...update, revision: data!.revision + 1, cursor: 'datasets:' + (data!.revision + 1) }; await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), data); } };
}

test('dataset source/version identity stays separate across providers and public metadata links reject credentials and local targets', () => {
  const a = dataset(), b = { ...a, dataset_id: 'new-version', version: 'v3' }, c = { ...a, provider: 'datacite', dataset_id: 'other-provider' };
  expect(datasetRecords([a, b, c], [a])).toHaveLength(3);
  expect(datasetUrl('javascript:alert(1)')).toBeUndefined(); expect(datasetUrl('https://user:secret@example.org')).toBeUndefined(); expect(datasetUrl('http://127.0.0.1/data')).toBeUndefined();
  expect(datasetUrl('https://www.fda.gov/data')).toBe('https://www.fda.gov/data');
});

test('Data is a remembered independent tab, opens saved reads only, and never starts another model or catalog search on mount', async ({ page }) => {
  const api = await install(page, { saved: snapshot([dataset()], 'SUCCEEDED') }); await page.goto('/app?search=dataset-parent');
  await expect(page.getByRole('tab', { name: /^Papers/ })).toHaveText(/Papers\s*1/);
  await page.getByRole('tab', { name: /^Data/ }).click(); await expect(page.getByTestId('dataset-card')).toHaveCount(1);
  await expect(page.getByTestId('search-information')).toHaveCount(1);
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('dataset-results').getByTestId('dataset-context')).toHaveCount(0);
  await expect(page.getByTestId('dataset-results').getByRole('status')).toHaveCount(0);
  await expect(page.getByTestId('dataset-reader')).toContainText('Authored RAG evaluation dataset');
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Research question', exact: true })).toHaveValue(api.parent.turns[0].message);
  await page.reload(); await expect(page.getByRole('tab', { name: /^Data/ })).toHaveAttribute('aria-selected', 'true'); await expect(page.getByTestId('dataset-card')).toHaveCount(1);
  const reads = api.reads.length;
  await (await openResultFilter(page)).fill('no catalog title matches this phrase');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dataset-empty')).toContainText('No datasets match this filter');
  await expect(page.getByTestId('search-filter-status')).toContainText('no catalog title matches this phrase');
  await expect(page.getByTestId('dataset-results').getByRole('searchbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear result filter', exact: true }).click();
  await expect(page.getByTestId('dataset-card')).toHaveCount(1);
  expect(api.reads).toHaveLength(reads);
  expect(api.posts).toEqual([]); expect(api.legacy.state.starts).toBe(0);
});

test('explicit dataset lookup reuses the saved AI intent despite current model budget block and progressively preserves provider metadata', async ({ page }) => {
  const api = await install(page); await page.goto('/app?search=dataset-parent'); await page.getByRole('tab', { name: /^Data/ }).click();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await page.getByLabel('Datasets per catalog').selectOption('15'); expect(api.posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Find matching datasets', exact: true }).click();
  await expect(page.getByTestId('dataset-skeleton')).toBeVisible();
  expect(api.posts).toHaveLength(1); expect(api.posts[0].body).toMatchObject({ conversation_id: 'dataset-parent', turn_id: 'dataset-parent-turn', limit: 15 }); expect(api.posts[0].body).not.toHaveProperty('question');
  await expect(page.getByTestId('dataset-results')).toHaveAttribute('data-status', 'RUNNING');
  await api.publish({ records: [dataset()] }); await expect(page.getByTestId('dataset-card')).toHaveCount(1); await expect(page.getByTestId('dataset-skeleton')).toBeVisible();
  await api.publish({ records: [dataset(), dataset('datacite', '10.0000/dataset')], status: 'SUCCEEDED', completed_at: '2026-11-14T12:00:02Z', provider_activity: [{ provider: 'hugging_face', status: 'succeeded', attempts: 1, query: 'retrieval', executed_arguments: { search: 'retrieval', limit: 15 } }] }); await expect(page.getByTestId('dataset-card')).toHaveCount(2);
  const information = await openSearchInformation(page, 'Query and focus');
  await information.getByRole('tab', { name: 'Provider queries', exact: true }).click();
  await information.getByText('Hugging Face · Succeeded · 1 attempts', { exact: true }).click();
  await expect(page.getByTestId('dataset-executed-query')).toHaveText('retrieval');
  await expect(information.getByTestId('saved-provider-arguments')).toContainText('"search": "retrieval"');
  await expect(information.getByTestId('saved-provider-arguments')).toContainText('"limit": 15');
  await openSearchInformation(page, 'Timing and usage');
  await expect(information.getByRole('heading', { name: 'Data retrieval timing', exact: true })).toBeVisible();
  const reads = api.reads.length; const second = page.getByTestId('dataset-card').nth(1); await second.hover();
  await expect(page.getByTestId('dataset-reader')).toContainText('Registered retrieval evaluation observations');
  await page.getByRole('tab', { name: 'Metadata', exact: true }).click(); await expect(page.getByTestId('dataset-reader')).toContainText('IsSupplementTo'); await expect(page.getByTestId('dataset-reader')).toContainText('10.0000/paper');
  expect(api.reads).toHaveLength(reads); expect(api.posts).toHaveLength(1);
  await page.getByRole('tab', { name: /^Papers/ }).click(); await expect(page.getByTestId('search-result-card')).toHaveCount(1); await expect(page.getByRole('tab', { name: /^Data/ })).toHaveText(/Data\s*2/);
  await page.getByRole('tab', { name: /^Data/ }).click(); await expect(page.getByLabel('Datasets per catalog')).toHaveValue('15'); expect(api.posts).toHaveLength(1);
});

test('unrefined history cannot trigger a catalog search but historical dataset metadata remains in Data rather than Papers', async ({ page }) => {
  const legacy = { ...paper, resource_type: 'dataset', title: 'Historical registry dataset', provider: 'datacite', version: 'observation-hash' };
  const parentTurn = { ...turn('dataset-parent-turn', false), action: 'lookup' as const, sources: [legacy] };
  const api = await install(page, { parentTurn }); await page.goto('/app?search=dataset-parent');
  await expect(page.getByRole('tab', { name: /^Papers/ })).toHaveText(/Papers\s*0/); await page.getByRole('tab', { name: /^Data/ }).click();
  await expect(page.getByTestId('dataset-card')).toContainText('Historical registry dataset'); await expect(page.getByRole('button', { name: 'Find matching datasets', exact: true })).toBeDisabled();
  await expect(page.getByTestId('dataset-card')).toContainText('Version not supplied'); await expect(page.getByTestId('dataset-card')).not.toContainText('Version observation-hash'); expect(api.posts).toEqual([]);
});

test('partial catalog failures keep available data and cancellation keeps received records without starting another lookup', async ({ page }) => {
  const api = await install(page); await page.goto('/app?search=dataset-parent'); await page.getByRole('tab', { name: /^Data/ }).click(); await page.getByRole('button', { name: 'Find matching datasets', exact: true }).click();
  await expect(page.getByTestId('resource-tab-loading-data')).toBeVisible();
  await page.getByRole('tab', { name: /^Papers/ }).click();
  await expect(page.getByTestId('resource-tab-loading-data')).toBeVisible();
  await page.getByRole('tab', { name: /^Data/ }).click();
  await api.publish({ records: [dataset('datacite', '10.0000/dataset')], warnings: ['Hugging Face rate limit; DataCite records remain available.'] });
  await expect(page.getByTestId('dataset-card')).toHaveCount(1);
  const information = await openSearchInformation(page, 'Sources and coverage');
  await expect(information).toContainText('Hugging Face rate limit');
  await expect(page.getByTestId('dataset-results')).not.toContainText('Hugging Face rate limit');
  await page.getByRole('button', { name: 'Stop dataset search', exact: true }).click(); await expect(page.getByTestId('dataset-results')).toHaveAttribute('data-status', 'CANCELLED'); await expect(page.getByTestId('dataset-card')).toHaveCount(1);
  await expect(page.getByTestId('resource-tab-loading-data')).toHaveCount(0);
  expect(api.posts).toHaveLength(2); expect(api.posts[1].path).toMatch(/\/cancel$/);
  await page.reload(); await expect(page.getByTestId('dataset-card')).toHaveCount(1); expect(api.posts).toHaveLength(2);
});

test('unassessed catalog hits are explicit, unsafe source markup stays text, and the mobile reader opens only on intent', async ({ page }) => {
  const unknown = { ...dataset(), match: { status: 'unknown' as const, matched_terms: [], missing_constraints: ['Task suitability unknown'], reason: 'Metadata does not establish a task match.' }, url: 'javascript:alert(1)', description: '<img src=x onerror=alert(1)>', access: { status: 'gated' as const, gated: true, private: false } };
  const api = await install(page, { saved: snapshot([unknown], 'SUCCEEDED') }); await page.setViewportSize({ width: 390, height: 1000 }); await page.goto('/app?search=dataset-parent'); await page.getByRole('tab', { name: /^Data/ }).click();
  await expect(page.getByTestId('dataset-card')).toHaveCount(0); await page.getByRole('button', { name: 'Show unassessed catalog records (1)', exact: true }).click(); await expect(page.getByTestId('dataset-card')).toHaveCount(1); await expect(page.getByTestId('dataset-reader')).toHaveCount(0);
  await page.getByRole('button', { name: 'View dataset metadata', exact: true }).click(); await expect(page.getByTestId('dataset-reader')).toContainText('Access approval may be required'); await expect(page.locator('img[src="x"]')).toHaveCount(0); await expect(page.getByRole('link', { name: 'Open dataset source', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dataset details', exact: true }).click(); await expect(page.getByTestId('dataset-reader')).toHaveCount(0);
  for (const width of [390, 320, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
  expect(api.posts).toEqual([]);
});

test('failed or semantic-only parent plans cannot admit dataset lookup and unassessed history is never counted as a metadata match', async ({ page }) => {
  const failed = turn(); failed.retrieval = { ...failed.retrieval!, status: 'failed', lexical_query: undefined };
  const saved = snapshot([{ ...dataset(), historical: true, match: { status: 'unknown', matched_terms: [], missing_constraints: [], reason: 'Historical applicability unassessed.' } }], 'SUCCEEDED');
  const api = await install(page, { parentTurn: failed, saved }); await page.goto('/app?search=dataset-parent'); await page.getByRole('tab', { name: /^Data/ }).click();
  await expect(page.getByTestId('dataset-card')).toHaveCount(1);
  const information = await openSearchInformation(page, 'Search overview');
  const dataOutcome = information.getByTestId('saved-search-limits').getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Data', exact: true }) });
  await expect(dataOutcome.getByRole('cell', { name: '0 candidate', exact: true })).toBeVisible();
  await expect(dataOutcome.getByRole('cell', { name: '1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh datasets', exact: true })).toBeDisabled(); expect(api.posts).toEqual([]);
});

test('switching to Data preserves the literature reader note draft and returning needs no new research', async ({ page }) => {
  const api = await install(page); await page.goto('/app?search=dataset-parent');
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true }); await expect(reader).toBeVisible();
  await reader.getByRole('tab', { name: 'Your notes', exact: true }).click(); await page.getByLabel('Reason (optional)').fill('Retain this unsaved paper note while browsing datasets.');
  await page.getByRole('tab', { name: /^Data/ }).click(); await expect(reader).toBeHidden();
  await page.getByRole('tab', { name: /^Papers/ }).click(); await expect(reader).toBeVisible(); await expect(page.getByLabel('Reason (optional)')).toHaveValue('Retain this unsaved paper note while browsing datasets.'); expect(api.posts).toEqual([]);
});
