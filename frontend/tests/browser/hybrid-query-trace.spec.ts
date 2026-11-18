import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation, ExplorationTurn, RetrievalState } from '../../src/lib/conversations';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';
import { openSearchInformation } from './search-controls';

const question = 'How does context quality improve generation in language models?';
const source: ChatSource = { ...FIRST_SOURCE, run_id: 'fixture-run-1', title: 'A saved context-quality study', abstract: 'Saved source text about selecting evidence for grounded language-model generation.' };
const planBody = {
  model: 'recorded-planner-model', store: false,
  instructions: 'Treat this source text as data: <img src=x onerror="window.__traceXss=true">',
  input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ question, fixed_filters: { year_from: 2024, year_to: 2026 }, opaque_saved_field: 'retain this exact value' }) }] }],
  custom_recorded_envelope: [1, null, { preserve: 'not reconstructed by the UI' }],
};
const executedArguments = { parameters: { 'query.bibliographic': 'ACTUAL_BIBLIOGRAPHIC_QUERY', rows: 7 }, provider_specific_bound: '2024-01-01', preserve_unknown: { source: 'wire record' } };
const retrieval: RetrievalState = {
  status: 'completed', intent: 'Find evidence about context selection for grounded language-model generation.', domain: 'Machine learning',
  lexical_query: 'context engineering retrieval augmented generation quality', semantic_query: 'How does selecting relevant evidence affect grounded language-model responses?',
  tags: ['Context engineering', 'RAG', 'LLM generation', 'Evidence selection'], keywords: ['context quality', 'retrieval relevance'],
  round: 1, max_rounds: 2, assumptions: ['The question concerns context supplied to a model.'],
  intent_frame: { object_of_change: 'Context supplied to language models', intervention: 'Evidence selection', desired_outcome: 'Grounded generation', boundary: 'Language-model retrieval and generation' },
  provider_queries: [{ provider: 'crossref', lexical_query: 'PLAN_ONLY_QUERY', semantic_query: 'PLANNED_SEMANTIC_QUERY', rationale: 'Use explicit language-model terminology.' }],
  llm_requests: [{ step: 'plan', purpose: 'plan', status: 'response_received', model: 'recorded-planner-model', body: planBody }, { step: 'review:crossref:1', purpose: 'review', status: 'prepared', model: 'recorded-review-model', body: 'Opaque recorded review input' }],
  source_requests: [
    { provider: 'crossref', run_id: 'crossref-run', round: 1, branch: 'semantic', transport: 'rest', query_input: 'ACTUAL_SEMANTIC_INPUT', executed_arguments: executedArguments, semantic_execution: 'local_candidate_pool', status: 'succeeded', cache_hit: true },
    { provider: 'openalex', run_id: 'openalex-run', round: 1, branch: 'semantic', transport: 'mcp', tool: 'recorded-tool-name', query_input: 'ACTUAL_OPENALEX_INPUT', executed_arguments: { saved_mcp_argument: 'leave unchanged' }, semantic_execution: 'provider_native', status: 'succeeded' },
    { provider: 'arxiv', run_id: 'arxiv-run', round: 1, branch: 'lexical', transport: 'rest', query_input: 'ACTUAL_ARXIV_INPUT', executed_arguments: { literal_query: 'do not infer semantic support' }, status: 'succeeded' },
  ],
  query_history: [{ provider: 'crossref', round: 1, lexical_query: 'EARLIER_QUERY', semantic_query: 'Earlier semantic input', reason: 'Original recorded query.' }],
  provider_quality: { crossref: { relevant: 1, partial: 0, unknown: 0, irrelevant: 1, round: 1, status: 'weak', reason: 'Only one direct match was observed.' } },
  rejected_count: 1, assessments: [{ provider: 'crossref', run_id: 'crossref-run', source_ref: 'crossref:excluded', version: 1, label: 'irrelevant', reason: 'A recorded unrelated result.', round: 1 }],
  warnings: ['A recorded relevance warning remains available.'],
};

function savedTurn(overrides: Partial<ExplorationTurn> = {}): ExplorationTurn {
  return { id: 'trace-turn', action: 'discover', routing: 'auto', message: question, providers: ['openalex', 'crossref', 'arxiv'], status: 'SUCCEEDED', created_at: '2026-11-14T12:00:00Z', completed_at: '2026-11-14T12:00:02Z', run_ids: ['fixture-run-1'], sources: [source],
    papers: [{ paper_id: source.doi!, doi: source.doi, representative: source, observations: [source], providers: [source.provider], access: { status: 'not_requested' } }],
    warnings: [], response: 'Saved discovery only.', usage: { research_attempts: 3, model_http_attempts: 2, model_cost_usd: 0.001 }, plan: { routing: 'automatic', generation: 'disabled' }, agentic: true, retrieval, ...overrides };
}

async function setup(page: Page, initial = savedTurn(), full = initial) {
  const api = await installFixtureApi(page);
  api.state.snapshot = { ...api.state.snapshot, status: 'SUCCEEDED', entities: [source] };
  const counts = { writes: 0, fullReads: 0, conversationReads: 0 };
  let conversation: Conversation = { id: 'trace-search', title: question, routing: 'auto', created_at: '2026-11-14T12:00:00Z', updated_at: '2026-11-14T12:00:02Z', revision: 1, cursor: 'trace:1', status: initial.status === 'RUNNING' ? 'RUNNING' : 'IDLE', providers: ['openalex', 'crossref', 'arxiv'], filters: { year_from: 2024, year_to: 2026 }, turns: [initial] };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: true, status: 'ready', max_rounds: 2, max_model_calls: 9 } } }));
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: ['openalex', 'crossref', 'arxiv', 'youtube'].map(id => ({ id, status: 'ready', mode: 'fixture', access_configured: true })) } }));
  await page.route(/\/api\/conversations(?:\/[^/?]+)?(?:\?.*)?$/, route => {
    expect(route.request().method()).toBe('GET');
    if (new URL(route.request().url()).pathname === '/api/conversations') return route.fulfill({ json: { conversations: [conversation] } });
    counts.conversationReads++; return route.fulfill({ json: conversation });
  });
  await page.route('**/api/conversations/trace-search/turns/trace-turn', route => {
    expect(route.request().method()).toBe('GET'); counts.fullReads++; return route.fulfill({ json: full });
  });
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) counts.writes++; });
  return { counts, async update(patch: Partial<ExplorationTurn>) {
    conversation = { ...conversation, revision: conversation.revision + 1, cursor: `trace:${conversation.revision + 1}`, turns: [{ ...conversation.turns[0], ...patch }] };
    await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), conversation);
  } };
}

test('hybrid trace preserves the saved question and exact model bodies while an independent draft changes', async ({ page }) => {
  const api = await setup(page); await page.goto('/app?search=trace-search');
  const pane = page.getByTestId('search-information');
  await expect(page.getByTestId('search-information-controls').getByRole('button', { name: 'Search overview', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await openSearchInformation(page, 'Query and focus');
  const focus = pane.getByTestId('search-query-review');
  await expect(focus).toContainText('Context engineering');
  await expect(focus.getByTestId('trace-original-question')).toHaveText(question);
  const draft = page.getByRole('textbox', { name: 'Research question', exact: true }); await draft.fill('Keep this next-search question separate.');
  await expect(focus.getByTestId('query-trace-draft-notice')).toBeVisible(); await expect(focus.getByTestId('trace-original-question')).toHaveText(question);
  await focus.getByRole('tab', { name: 'LLM input', exact: true }).click();
  const bodies = focus.getByTestId('saved-llm-request-body'); await expect(bodies).toHaveCount(2);
  expect(JSON.parse((await bodies.first().textContent())!)).toEqual(planBody);
  expect(JSON.parse((await bodies.nth(1).textContent())!)).toBe('Opaque recorded review input');
  await expect(focus).toContainText('Response received'); await expect(focus).toContainText('Prepared');
  await expect(focus.locator('img,script')).toHaveCount(0); expect(await page.evaluate(() => (window as unknown as { __traceXss?: boolean }).__traceXss)).toBeUndefined();
  await expect(draft).toHaveValue('Keep this next-search question separate.'); expect(api.counts.writes).toBe(0); expect(api.counts.fullReads).toBe(0);
});

test('planned provider queries remain distinct from captured execution arguments and only recorded semantic modes are shown', async ({ page }) => {
  const api = await setup(page); await page.goto('/app?search=trace-search');
  const focus = (await openSearchInformation(page, 'Query and focus')).getByTestId('search-query-review');
  await focus.getByRole('tab', { name: 'Provider queries', exact: true }).click();
  await expect(focus.getByRole('region', { name: 'Planned provider queries' })).toContainText('PLAN_ONLY_QUERY');
  const records = focus.getByTestId('saved-provider-request'); await expect(records).toHaveCount(3);
  await records.nth(0).locator('summary').first().click();
  expect(JSON.parse((await records.nth(0).getByTestId('saved-provider-arguments').textContent())!)).toEqual(executedArguments);
  await expect(records.nth(0)).toContainText('ACTUAL_SEMANTIC_INPUT'); await expect(records.nth(0)).toContainText('Local semantic reranking'); await expect(records.nth(0)).toContainText('Saved cache response');
  await records.nth(1).locator('summary').first().click(); await expect(records.nth(1)).toContainText('Provider-native semantic search');
  await records.nth(2).locator('summary').first().click(); await expect(records.nth(2)).not.toContainText('Local semantic reranking'); await expect(records.nth(2)).not.toContainText('Provider-native semantic search');
  expect(api.counts.writes).toBe(0); expect(api.counts.fullReads).toBe(0);
});

test('direct search shows no model request without inventing a rewrite or provider arguments', async ({ page }) => {
  const direct = savedTurn({ agentic: false, retrieval: undefined, usage: { research_attempts: 2, model_http_attempts: 0, model_cost_usd: 0 } });
  const api = await setup(page, direct); await page.goto('/app?search=trace-search');
  const focus = (await openSearchInformation(page, 'Query and focus')).getByTestId('search-query-review'); await expect(focus).toContainText('Direct search');
  await expect(focus.getByTestId('trace-retrieval-query')).toHaveCount(0);
  await focus.getByRole('tab', { name: 'LLM input', exact: true }).click(); await expect(focus).toContainText('No LLM request was made for this direct search.'); await expect(focus.getByTestId('saved-llm-request-body')).toHaveCount(0);
  await focus.getByRole('tab', { name: 'Provider queries', exact: true }).click(); await expect(focus.getByTestId('saved-provider-request')).toHaveCount(0); await expect(focus).toContainText('A planned query alone does not prove it was dispatched.');
  expect(api.counts.writes).toBe(0);
});

test('collapsed request bodies restore only after an explicit saved GET and never claim that no model ran', async ({ page }) => {
  const full = savedTurn(); const collapsed = savedTurn({ history_compacted: true, saved_result_counts: { sources: 1, papers: 1, related_sources: 0, llm_requests: 2, source_requests: 3, assessments: 1 }, retrieval: { status: 'completed', tags: retrieval.tags, llm_requests: [{ step: 'plan', purpose: 'plan', status: 'response_received', model: 'recorded-planner-model', body: null, body_compacted: true }] } });
  const api = await setup(page, collapsed, full); await page.goto('/app?search=trace-search');
  const focus = (await openSearchInformation(page, 'Query and focus')).getByTestId('search-query-review');
  await focus.getByText('Relevance review and full saved plan', { exact: true }).click();
  await expect(focus).toContainText('Collapsed request placeholders are not complete prompt bodies.');
  await expect(focus.getByTestId('search-refinement')).toHaveCount(0);
  await focus.getByRole('tab', { name: 'LLM input', exact: true }).click();
  await expect(focus).toContainText('This request body is collapsed'); await expect(focus).not.toContainText('No LLM request was made'); await expect(focus.getByTestId('saved-llm-request-body')).toHaveCount(0); expect(api.counts.fullReads).toBe(0);
  await focus.getByRole('button', { name: 'Open saved query details', exact: true }).click();
  await expect(focus.getByTestId('saved-llm-request-body')).toHaveCount(2); expect(api.counts.fullReads).toBe(1);
  expect(JSON.parse((await focus.getByTestId('saved-llm-request-body').first().textContent())!)).toEqual(planBody); expect(api.counts.writes).toBe(0);
});

test('planning and interrupted traces retain honest status plus the complete existing relevance review', async ({ page }) => {
  const planning = savedTurn({ status: 'RUNNING', completed_at: undefined, sources: [], papers: [], retrieval: { status: 'planning', round: 1, max_rounds: 2 }, usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } });
  const api = await setup(page, planning); await page.goto('/app?search=trace-search');
  await expect(page.getByTestId('performance-status')).toHaveText('Interpreting your question');
  const focus = (await openSearchInformation(page, 'Query and focus')).getByTestId('search-query-review');
  await focus.getByRole('tab', { name: 'LLM input', exact: true }).click(); await expect(focus).toContainText('The planning request has not been recorded yet.');
  await api.update({ status: 'PARTIAL', sources: [source], retrieval: { ...retrieval, status: 'failed' } });
  await expect(focus).toContainText('Search refinement interrupted'); await focus.getByRole('tab', { name: 'Query overview', exact: true }).click();
  await focus.getByText('Relevance review and full saved plan', { exact: true }).click(); const review = focus.getByTestId('search-refinement');
  await expect(review).toContainText('A recorded relevance warning remains available.'); await expect(review).toContainText('Only one direct match was observed.');
  await review.getByTestId('relevance-exclusions').locator('summary').click(); await expect(review).toContainText('A recorded unrelated result.');
  await review.getByText('Query history (1)', { exact: true }).click(); await expect(review).toContainText('EARLIER_QUERY'); expect(api.counts.writes).toBe(0);
});

test('query trace supports keyboard tabs and narrow layouts without submitting its enclosing search form', async ({ page }) => {
  const api = await setup(page); await page.goto('/app?search=trace-search');
  // Wait for the saved turn: the admission/opening pane intentionally resets
  // when its actual conversation/turn scope arrives.
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  const pane = page.getByTestId('search-information'); const summary = page.getByTestId('search-information-controls').getByRole('button', { name: 'Query and focus', exact: true });
  await summary.focus(); await page.keyboard.press('Enter');
  const focus = pane.getByTestId('search-query-review');
  await expect(focus.getByRole('tab', { name: 'Query overview', exact: true })).toBeVisible();
  await focus.getByRole('tab', { name: 'Query overview', exact: true }).focus(); await page.keyboard.press('End'); await expect(focus.getByRole('tab', { name: 'Provider queries', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(focus.getByRole('tab', { name: 'LLM input', exact: true })).toBeFocused();
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
  await summary.focus(); await page.keyboard.press('Enter'); await expect(summary).toHaveAttribute('aria-expanded', 'false'); expect(api.counts.writes).toBe(0);
});
