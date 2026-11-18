import { expect, test } from '@playwright/test';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';
import { chooseModalityLimit } from './search-controls';
import { searchResources } from '../../src/lib/search-resources';
import type { ExplorationTurn } from '../../src/lib/conversations';

test('manual comparisons honor the central canonical cap while retaining overflow observations', () => {
  const first = { ...FIRST_SOURCE, run_id: 'paper-a' };
  const second = { ...FIRST_SOURCE, run_id: 'paper-b', source_ref: 'crossref:other', record_id: 'other', provider: 'crossref', doi: '10.0000/other', title: 'Another independent paper' };
  const saved = { action: 'discover', routing: 'manual', sources: [first, second], papers: [{ paper_id: 'first', representative: first, observations: [first], providers: ['openalex'], access: { status: 'not_requested' } }], modality_limits: { papers: 1, videos: 0, datasets: 0, repos: 0 } } as ExplorationTurn;
  const before = JSON.stringify(saved);
  expect(searchResources(saved)).toHaveLength(1);
  expect(JSON.stringify(saved)).toBe(before);
  expect(saved.sources).toHaveLength(2);
});

test('all four next-search limits persist, zero disables a type and editing never fetches', async ({ page }) => {
  await installFixtureApi(page);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') writes.push(new URL(request.url()).pathname); });
  await page.goto('/app');
  await chooseModalityLimit(page, 'Papers', 4);
  await chooseModalityLimit(page, 'Videos', 0);
  await chooseModalityLimit(page, 'Data per catalog', 7);
  await chooseModalityLimit(page, 'Repos', 20);
  await page.reload();
  await page.getByRole('button', { name: 'Search result limits', exact: true }).click();
  for (const [label, value] of [['Papers', '4'], ['Videos', '0'], ['Data per catalog', '7'], ['Repos', '20']]) {
    await expect(page.getByRole('slider', { name: label, exact: true })).toHaveValue(value);
    await expect(page.getByRole('slider', { name: label, exact: true })).toHaveAttribute('max', '20');
  }
  await expect(page.getByRole('slider', { name: 'Videos', exact: true })).toHaveAttribute('aria-valuetext', 'Off');
  await expect(page.getByRole('dialog', { name: 'Search result limits', exact: true })).toContainText('maximums');
  await page.keyboard.press('Escape');
  expect(writes).toEqual([]);
});

test('all disabled blocks admission and a Data-only direct query does not require a paper provider', async ({ page }) => {
  await installFixtureApi(page);
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [] } }));
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') return route.fulfill({ json: { conversations: [] } });
    writes.push({ path, body: route.request().postDataJSON() });
    return route.fulfill({ status: path.endsWith('/turns') ? 202 : 201, json: { id: 'data-only-search', revision: 0, status: 'IDLE', routing: 'auto', providers: [], filters: {}, turns: [] } });
  });
  await page.goto('/app');
  await page.getByRole('switch', { name: 'AI refinement', exact: true }).click();
  for (const label of ['Papers', 'Videos', 'Data per catalog', 'Repos'] as const) await chooseModalityLimit(page, label, 0);
  await page.getByLabel('Research question', { exact: true }).fill('retrieval evaluation datasets');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  await chooseModalityLimit(page, 'Data per catalog', 3);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body).toMatchObject({ agentic: false, source_scope: [], modality_limits: { papers: 0, videos: 0, datasets: 3, repos: 0 } });
  expect(writes[1].body.filters).toEqual({});
});

test('central jobs restore both child snapshots before visiting tabs and late job links remain read-only', async ({ page }) => {
  await installFixtureApi(page);
  const stamp = '2026-11-14T12:00:00Z';
  const limits = { papers: 20, videos: 10, datasets: 10, repos: 10 };
  const job = (limit: number) => ({ status: 'RUNNING', phase: 'waiting_for_plan', limit, record_count: 0 });
  let turn = { id: 'central-turn', message: 'embedding model domain adaptation approaches', action: 'discover', agentic: false, status: 'RUNNING', routing: 'auto', providers: [], run_ids: [], sources: [], papers: [], warnings: [], response: '', created_at: stamp, usage: { model_http_attempts: 0, research_attempts: 0 }, modality_limits: limits, resource_jobs: { papers: job(20), videos: job(10), datasets: job(10), repos: job(10) } };
  const parent = () => ({ id: 'central-parent', title: turn.message, status: turn.status === 'RUNNING' ? 'RUNNING' : 'IDLE', routing: 'auto', providers: [], filters: {}, revision: 1, cursor: 'central:1', created_at: stamp, updated_at: stamp, turns: [turn] });
  const reads: string[] = [], writes: string[] = [];
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [parent()] } }));
  await page.route('**/api/conversations/central-parent', route => route.fulfill({ json: parent() }));
  await page.route(/\/api\/(dataset-searches|repo-searches)\/central-[^/?]+(?:\?.*)?$/, route => {
    const path = new URL(route.request().url()).pathname; reads.push(path);
    if (route.request().method() !== 'GET') { writes.push(path); return route.abort(); }
    return route.fulfill({ json: { id: path.split('/').at(-1), status: 'EMPTY', revision: 1, cursor: 'child:1', question: turn.message, limit: 10, readme_limit: 5, context: { conversation_id: 'central-parent', turn_id: turn.id, fingerprint: 'fixture', query: turn.message, intent: turn.message, keywords: [], tags: [], domain: null, query_mode: 'direct' }, records: [], provider_activity: [], timing_spans: [], warnings: [], usage: { model_http_attempts: 0 }, created_at: stamp, completed_at: stamp } });
  });
  await page.goto('/app?search=central-parent');
  await expect(page.getByTestId('resource-tab-loading-data')).toBeVisible();
  await expect(page.getByTestId('resource-tab-loading-repo')).toBeVisible();
  turn = { ...turn, resource_jobs: { ...turn.resource_jobs, datasets: { ...job(10), phase: 'retrieving', search_id: 'central-data' }, repos: { ...job(10), phase: 'retrieving', search_id: 'central-repos' } } } as typeof turn;
  await page.evaluate(snapshot => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(snapshot), parent());
  await expect.poll(() => reads.includes('/api/dataset-searches/central-data') && reads.includes('/api/repo-searches/central-repos')).toBe(true);
  await page.getByRole('tab', { name: /^Data/ }).click();
  await expect(page.getByTestId('dataset-results')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find matching datasets', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /^Repos/ }).click();
  await expect(page.getByTestId('repo-results')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find matching repos', exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});
