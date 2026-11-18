import { test, expect } from '@playwright/test';
import { admitFixtureDiscovery } from './diagnostic-discovery';
import { openSearchInformation } from './search-controls';

test('actual diagnostic fixture automatic discovery merges shared DOIs and resolves Unpaywall in saved results', async ({ page, request }) => {
  test.skip(process.env.SCOUT_BROWSER_INTEGRATION !== '1', 'Requires explicitly started local fixture services.');
  const configured = await request.get('/api/providers'); expect(configured.ok()).toBe(true);
  expect((await configured.json()).providers.every((provider: { mode: string }) => provider.mode === 'fixture')).toBe(true);
  const diagnostic = await admitFixtureDiscovery(request, 'Institutional AI readiness in higher education');
  await page.goto(`/app?search=${diagnostic.id}`);
  await expect(page.getByTestId('search-result-card').first()).toBeVisible();
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-status', /succeeded|partial/, { timeout: 40_000 });
  const id = new URL(page.url()).searchParams.get('search');
  const before = await (await request.get(`/api/conversations/${id}`)).json(); const turn = before.turns.at(-1);
  expect(turn.routing).toBe('auto'); expect(turn.providers.length).toBeGreaterThanOrEqual(2);
  expect(turn.usage.model_http_attempts).toBe(0);
  expect(turn.papers.length).toBeLessThan(turn.sources.length);
  expect(new Set(turn.papers.map((paper: { paper_id: string }) => paper.paper_id)).size).toBe(turn.papers.length);
  const grouped = turn.papers.filter((paper: { doi: string; providers: string[] }) => paper.doi && paper.providers.length > 1);
  expect(grouped.length).toBe(2);
  expect(grouped.every((paper: { access: { status: string; observation: { provider: string } } }) => paper.access.status === 'succeeded' && paper.access.observation.provider === 'unpaywall')).toBe(true);
  expect(turn.activity.filter((activity: { provider: string }) => activity.provider === 'unpaywall')).toHaveLength(2);
  // Backend DOI identities remain separate; the reader additionally groups
  // exact matching citations without discarding their provider observations.
  const rawPaperCount = turn.papers.filter((p: { representative: { resource_type: string } }) => p.representative.resource_type !== 'video').length;
  const paperCount = 4;
  expect(rawPaperCount).toBeGreaterThan(paperCount);
  await expect(page.getByTestId('search-result-card')).toHaveCount(paperCount);
  const titles = await page.getByTestId('search-result-card').getByTestId('paper-title-text').allTextContents();
  expect(new Set(titles).size).toBe(paperCount);
  await openSearchInformation(page, 'Sources and coverage');
  await expect(page.getByTestId('search-coverage-details')).toContainText('Matching DOI or exact citation records appear once');
  await expect(page.getByTestId('search-coverage-details')).toContainText('provider observations and historical evidence versions remain separately preserved');
  await page.reload(); await expect(page.getByTestId('search-result-card')).toHaveCount(paperCount);
  const after = await (await request.get(`/api/conversations/${id}`)).json();
  expect(after.turns.at(-1).usage).toEqual(turn.usage); expect(after.turns.at(-1).papers).toEqual(turn.papers);
});

test('actual model-disabled fixture UI blocks new topic discovery without raw API fallback', async ({ page, request }) => {
  test.skip(process.env.SCOUT_BROWSER_INTEGRATION !== '1', 'Requires explicitly started local fixture services.');
  const configured = await (await request.get('/api/providers')).json();
  expect(configured.providers.every((provider: { mode: string }) => provider.mode === 'fixture')).toBe(true);
  const beforeRuns = (await (await request.get('/api/research-runs')).json()).runs.length;
  const beforeConversations = (await (await request.get('/api/conversations')).json()).conversations.length;
  const writes: string[] = [];
  page.on('request', event => { if (event.method() === 'POST') writes.push(event.url()); });
  await page.goto('/app');
  await page.getByLabel('Research question', { exact: true }).fill('Improve evidence context for language models');
  await expect(page.getByTestId('mandatory-refinement-status')).toContainText('AI refinement is unavailable');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await page.getByLabel('Research question', { exact: true }).evaluate(node => node.closest('form')!.requestSubmit());
  await expect(page.getByTestId('mandatory-refinement-status')).toContainText('AI refinement is unavailable');
  expect(new URL(page.url()).searchParams.has('search')).toBe(false);
  expect(writes).toEqual([]);
  expect((await (await request.get('/api/research-runs')).json()).runs.length).toBe(beforeRuns);
  expect((await (await request.get('/api/conversations')).json()).conversations.length).toBe(beforeConversations);
});

test('actual direct UI search reaches Papers Data and Repos while model access is disabled and credits stay unchanged', async ({ page, request }) => {
  test.skip(process.env.SCOUT_BROWSER_INTEGRATION !== '1', 'Requires explicitly started local fixture services.');
  test.setTimeout(90_000);
  const providers = (await (await request.get('/api/providers')).json()).providers;
  expect(providers.every((provider: { mode: string }) => provider.mode === 'fixture')).toBe(true);
  const before = await (await request.get('/api/economics')).json();
  const question = 'retrieval language model evaluation';
  const acquisitions: string[] = [];
  page.on('request', item => { if (item.method() === 'POST' && /\/api\/(dataset-searches|repo-searches)$/.test(new URL(item.url()).pathname)) acquisitions.push(new URL(item.url()).pathname); });
  await page.goto('/app'); await page.getByRole('switch', { name: 'AI refinement', exact: true }).click();
  await page.getByLabel('Research question', { exact: true }).fill(question);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/[?&]search=/);
  const id = new URL(page.url()).searchParams.get('search'); expect(id).toBeTruthy();
  // Progressive partial rows are available before the final provider finishes.
  await expect.poll(async () => (await (await request.get(`/api/conversations/${id}`)).json()).turns.at(-1).status, { timeout: 45_000 }).toMatch(/^(SUCCEEDED|PARTIAL|EMPTY)$/);
  const parent = await (await request.get(`/api/conversations/${id}`)).json();
  const turn = parent.turns.at(-1);
  expect(turn).toMatchObject({ agentic: false, message: question, action: 'discover', usage: { model_http_attempts: 0, model_cost_usd: 0 } });
  expect(turn.retrieval).toBeFalsy();
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await expect(page.getByTestId('search-result-card').first()).toBeVisible();
  // One main admission owns these children before their tabs have been opened.
  expect(turn.modality_limits).toEqual({ papers: 20, videos: 10, datasets: 10, repos: 10 });
  expect(turn.resource_jobs.datasets.search_id).toBeTruthy();
  expect(turn.resource_jobs.repos.search_id).toBeTruthy();
  const data = await (await request.get('/api/dataset-searches/' + turn.resource_jobs.datasets.search_id)).json();
  const repos = await (await request.get('/api/repo-searches/' + turn.resource_jobs.repos.search_id)).json();
  expect(data.context).toMatchObject({ query: question, query_mode: 'direct', query_origin: 'user_direct_query', origin: 'saved_direct_query' });
  expect(repos.context).toMatchObject({ query: question, query_mode: 'direct', query_origin: 'user_direct_query', origin: 'saved_direct_query' });
  expect(data.usage.model_http_attempts).toBe(0); expect(repos.usage.model_http_attempts).toBe(0);
  expect(data.records.length).toBeGreaterThan(0); expect(repos.records.length).toBeGreaterThan(0);
  await expect(page.getByRole('tab', { name: /^Data/ })).toHaveText(new RegExp('Data\\s*' + data.records.length));
  await page.getByRole('tab', { name: /^Data/ }).click();
  await expect(page.getByTestId('dataset-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find matching datasets', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /^Repos/ }).click();
  await expect(page.getByTestId('repo-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find matching repos', exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId('repo-card').first()).toBeVisible();
  expect(acquisitions).toEqual([]);
  const after = await (await request.get('/api/economics')).json();
  expect({ used: after.used, reserved: after.reserved, invocations: after.invocations, tokens: after.tokens }).toEqual({ used: before.used, reserved: before.reserved, invocations: before.invocations, tokens: before.tokens });
});
