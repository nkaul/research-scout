import { openSearchInformation } from './search-controls';
import { test, expect, type Locator, type Page } from '@playwright/test';
import type { Conversation, ExplorationTurn, RetrievalState } from '../../src/lib/conversations';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';

const tags = ['Context engineering', 'RAG', 'LLM generation', 'Evidence selection', 'Agent planning', 'Literature synthesis'];
const keywords = ['context quality', 'retrieval relevance', 'generation quality', 'evidence coverage', 'agent reasoning', 'literature synthesis'];
const providers = ['openalex', 'crossref', 'arxiv', 'youtube'] as const;
const source = { ...FIRST_SOURCE, run_id: 'fixture-run-1' };
const recordedArguments = { 'query.bibliographic': 'literal recorded terms', rows: 7, opaque_field: { preserve: true } };
const retrieval: RetrievalState = {
  status: 'completed', domain: 'Machine learning', intent: 'Find evidence about context selection for grounded generation.',
  tags, keywords, lexical_query: 'context selection grounded generation', semantic_query: 'How does evidence selection affect grounded answers?',
  round: 1, max_rounds: 2,
  provider_queries: providers.map(provider => ({ provider, lexical_query: provider + ' recorded lexical terms', semantic_query: provider + ' recorded semantic question', rationale: 'A separately recorded provider query.' })),
  source_requests: providers.map(provider => ({ provider, run_id: provider + '-recorded-run', round: 1, branch: 'lexical', transport: provider === 'openalex' ? 'mcp' : 'rest', query_input: provider + ' exact saved input', executed_arguments: recordedArguments, status: 'succeeded' })),
};

async function setup(page: Page, direct = false) {
  const fixture = await installFixtureApi(page);
  fixture.state.snapshot = { ...fixture.state.snapshot, status: 'SUCCEEDED', entities: [source] };
  const turn: ExplorationTurn = {
    id: 'colored-term-turn', action: 'discover', routing: 'auto', message: 'How does context improve grounded generation?',
    status: 'SUCCEEDED', providers: [...providers], created_at: '2026-11-14T12:00:00Z', completed_at: '2026-11-14T12:00:02Z',
    run_ids: ['fixture-run-1'], sources: [source], papers: [{ paper_id: source.source_ref, representative: source, providers: [source.provider], observations: [source], access: { status: 'not_requested' } }],
    warnings: [], response: '', usage: { research_attempts: 0, model_http_attempts: direct ? 0 : 1, model_cost_usd: 0 },
    agentic: !direct, ...(direct ? {} : { retrieval }),
  };
  let conversation: Conversation = { id: 'colored-term-search', title: turn.message, routing: 'auto', status: 'IDLE', revision: 1, cursor: 'colored-term:1', created_at: turn.created_at, updated_at: turn.completed_at!, providers: [...providers], filters: {}, turns: [turn] };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: true, status: 'ready', max_rounds: 2, max_model_calls: 9 } } }));
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: providers.map(id => ({ id, mode: 'fixture', status: 'ready', access_configured: true })) } }));
  await page.route(/\/api\/conversations(?:\/[^/?]+)?(?:\?.*)?$/, route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/conversations' ? { conversations: [conversation] } : conversation }));
  const writes: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.method()); });
  return { writes, async update(retrievalUpdate?: RetrievalState) {
    conversation = { ...conversation, revision: conversation.revision + 1, cursor: `colored-term:${conversation.revision + 1}`, turns: [{ ...conversation.turns[0], retrieval: retrievalUpdate }] };
    await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), conversation);
  } };
}

async function colors(chips: Locator) {
  return chips.evaluateAll(nodes => nodes.map(node => { const style = getComputedStyle(node); return { label: node.textContent!, foreground: style.color, background: style.backgroundColor }; }));
}

function contrast(foreground: string, background: string) {
  const luminance = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, index) => sum + n * [.2126, .7152, .0722][index], 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

test('saved topics and keywords use readable Material families consistently across views and reordering', async ({ page }) => {
  const api = await setup(page); await page.goto('/app?search=colored-term-search');
  await openSearchInformation(page, 'Query and focus');
  const focus = page.getByTestId('search-query-review');
  const topicGroup = focus.getByLabel('Planner tags', { exact: true });
  const keywordGroup = focus.getByLabel('Extracted search keywords', { exact: true });
  await expect(topicGroup.locator('[data-chip-kind="topic"]')).toHaveText(tags);
  await expect(keywordGroup.locator('[data-chip-kind="keyword"]')).toHaveText(keywords);
  const before = await colors(topicGroup.locator('[data-chip-kind="topic"]'));
  const keywordColors = await colors(keywordGroup.locator('[data-chip-kind="keyword"]'));
  expect(new Set(keywordColors.map(chip => chip.background)).size).toBeGreaterThanOrEqual(4);
  expect(new Set(before.map(chip => chip.background)).size).toBeGreaterThanOrEqual(3);
  for (const chip of [...before, ...keywordColors]) expect(contrast(chip.foreground, chip.background)).toBeGreaterThanOrEqual(4.5);
  await api.update({ ...retrieval, tags: [...tags].reverse(), keywords: [...keywords].reverse() });
  await expect(topicGroup.locator('[data-chip-kind="topic"]')).toHaveText([...tags].reverse());
  const after = await colors(topicGroup.locator('[data-chip-kind="topic"]'));
  for (const chip of before) expect(after.find(value => value.label === chip.label)).toEqual(chip);
  expect(api.writes).toEqual([]);
});

test('planned and captured provider badges share identity colors while keyboard navigation preserves exact saved arguments', async ({ page }) => {
  const api = await setup(page); await page.goto('/app?search=colored-term-search');
  await openSearchInformation(page, 'Query and focus');
  const focus = page.getByTestId('search-query-review');
  await focus.getByRole('tab', { name: 'Query overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight'); await expect(focus.getByRole('tab', { name: 'LLM input', exact: true })).toBeFocused(); await page.keyboard.press('ArrowRight');
  await expect(focus.getByRole('tab', { name: 'Provider queries', exact: true })).toBeFocused();
  const plans = focus.getByRole('region', { name: 'Planned provider queries', exact: true });
  const planned = await colors(plans.locator('[data-chip-kind="provider"]'));
  expect(planned).toHaveLength(3); expect(new Set(planned.map(chip => chip.background)).size).toBe(3);
  for (const chip of planned) expect(contrast(chip.foreground, chip.background)).toBeGreaterThanOrEqual(4.5);
  const execution = focus.getByRole('region', { name: 'Provider execution records', exact: true });
  const captured = await colors(execution.locator('[data-chip-kind="provider"]'));
  expect(captured).toEqual(planned);
  const request = execution.getByTestId('saved-provider-request').nth(1);
  await request.locator('summary').click();
  expect(JSON.parse((await request.getByTestId('saved-provider-arguments').textContent())!)).toEqual(recordedArguments);
  for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
  expect(api.writes).toEqual([]);
});

test('historical direct and incomplete saved records never receive invented topic or keyword chips', async ({ page }) => {
  const api = await setup(page, true); await page.goto('/app?search=colored-term-search');
  await openSearchInformation(page, 'Query and focus');
  const focus = page.getByTestId('search-query-review');
  await expect(focus).toContainText('Direct search');
  await expect(focus.locator('[data-chip-kind="topic"], [data-chip-kind="keyword"], [data-chip-kind="domain"]')).toHaveCount(0);
  await focus.getByRole('tab', { name: 'LLM input', exact: true }).click();
  await expect(focus).toContainText('No LLM request was made for this direct search.');
  await api.update({ status: 'completed', round: 1, max_rounds: 2 });
  await expect(focus).toContainText('Relevance review complete');
  await focus.getByRole('tab', { name: 'Query overview', exact: true }).click();
  await expect(focus.locator('[data-chip-kind="topic"], [data-chip-kind="keyword"], [data-chip-kind="domain"]')).toHaveCount(0);
  await expect(focus.getByTestId('trace-original-question')).toHaveText('How does context improve grounded generation?');
  expect(api.writes).toEqual([]);
});
