import { test, expect, type Page } from '../../frontend/node_modules/@playwright/test';
import type { Conversation, ExplorationTurn } from '../../frontend/src/lib/conversations';
import { FIRST_SOURCE, SECOND_SOURCE, installFixtureApi } from './fixture-api';

async function installRefinement(page: Page, live = true, ready = true, interruptFirst = false) {
  const legacy = await installFixtureApi(page);
  let conversation: Conversation = { id: 'refinement-conversation', title: 'ML context', created_at: '2026-11-09T12:00:00Z', updated_at: '2026-11-09T12:00:00Z', revision: 0, cursor: 'refinement:0', status: 'IDLE', providers: ['openalex'], filters: {}, turns: [] };
  const submitted: Record<string, unknown>[] = [];
  const accepted = new Set<string>();
  let interrupted = false;
  await page.route('**/api/providers', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ providers: [{ id: 'openalex', mode: live ? 'live' : 'fixture', status: 'ready', access_configured: true }, { id: 'crossref', mode: live ? 'live' : 'fixture', status: 'ready', access_configured: true }, { id: 'europe_pmc', mode: live ? 'live' : 'fixture', status: 'ready', access_configured: true }] }) }));
  await page.route('**/api/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ generation_enabled: false, generation: { enabled: false, status: 'disabled' }, retrieval: { enabled: ready, ready, status: ready ? 'ready' : 'disabled', blocked_reason: ready ? undefined : 'AI refinement is disabled for this fixture profile. Direct search is available.', model: 'test-planner-model', max_rounds: 2, max_model_calls: 5 } }) }));
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/conversations') {
      if (req.method() === 'GET') return json({ conversations: conversation.turns.length ? [conversation] : [] });
      const body = req.postDataJSON(); conversation = { ...conversation, providers: body.providers, filters: body.filters }; return json(conversation);
    }
    if (path.endsWith('/turns')) {
      const body = req.postDataJSON(); submitted.push(body);
      if (accepted.has(body.idempotency_key)) return json(conversation, 202);
      accepted.add(body.idempotency_key);
      const turn: ExplorationTurn = { id: `refinement-turn-${submitted.length}`, message: body.message, action: body.action, providers: body.providers, status: 'RUNNING', created_at: '2026-11-09T12:00:00Z', run_ids: [], sources: [], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: body.agentic ? 1 : 0, model_cost_usd: body.agentic ? null : 0 }, plan: { routing: 'deterministic', generation: 'disabled' }, agentic: body.agentic || false, ...(body.agentic ? { retrieval: { status: 'planning', round: 1, max_rounds: 2, assessments: [], query_history: [], rejected_count: 0 } } : {}) };
      conversation = { ...conversation, providers: body.providers, filters: body.filters || conversation.filters, revision: conversation.revision + 1, status: 'RUNNING', turns: [...conversation.turns, turn] };
      if (interruptFirst && !interrupted) { interrupted = true; return route.abort('connectionreset'); }
      return json(conversation, 202);
    }
    return json(conversation);
  });
  return { submitted, legacy, get conversation() { return conversation; }, async publish(update: Partial<ExplorationTurn>, status: Conversation['status'] = 'RUNNING') {
    conversation = { ...conversation, revision: conversation.revision + 1, cursor: `refinement:${conversation.revision + 1}`, status, turns: conversation.turns.map((turn, index) => index === conversation.turns.length - 1 ? { ...turn, ...update } : turn) };
    await page.evaluate(snapshot => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(snapshot), conversation);
  } };
}

const firstQuery = { round: 1, lexical_query: '"machine learning" "context engineering"', semantic_query: 'Context selection and retrieval for machine learning agents', reason: 'Expand ML to machine learning and disambiguate the context intent.' };
const intent = { intent: 'Find research on context engineering for machine learning agents', domain: 'Machine learning', assumptions: ['ML means machine learning.'], rationale: 'The brief refers to agent context rather than unrelated uses of ML.', lexical_query: firstQuery.lexical_query, semantic_query: firstQuery.semantic_query, round: 1, max_rounds: 2, rejected_count: 0, query_history: [firstQuery], assessments: [] };
const reviewed = { ...FIRST_SOURCE, mode: 'live', fictional: false, title: 'An authored context-engineering test record', run_id: 'reviewed-run', relevance: { label: 'relevant' as const, reason: 'The supplied abstract addresses context selection for machine learning agents.' }, retrieval_round: 1 };

test('live discovery shows interpreted queries, reviewed batches and refinement history without an answer-generation call', async ({ page }) => {
  const api = await installRefinement(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  const toggle = page.getByRole('checkbox', { name: 'Refine search with AI', exact: true }); await expect(toggle).toBeChecked();
  await page.getByRole('checkbox', { name: /Europe PMC/ }).check();
  await page.getByLabel('Exploration message').fill('ML context engineering'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect.poll(() => api.submitted.length).toBe(1); expect(api.submitted[0].agentic).toBe(true); expect(api.submitted[0].providers).toEqual(['openalex', 'europe_pmc']); expect(api.submitted[0].action).toBe('discover');
  const panel = page.getByTestId('search-refinement'); await expect(panel).toHaveAttribute('data-status', 'planning'); await expect(panel).toContainText('Interpreting your question'); await expect(page.getByTestId('chat-source')).toHaveCount(0);
  const draft = page.getByLabel('Exploration message'); await draft.fill('Keep this follow-up draft'); await draft.focus();
  await api.publish({ retrieval: { ...intent, status: 'retrieving' } });
  await expect(panel).toContainText(firstQuery.lexical_query); await expect(panel).toContainText(firstQuery.semantic_query); await expect(panel).toContainText('Machine learning');
  await api.publish({ retrieval: { ...intent, status: 'reviewing' }, sources: [{ ...reviewed, relevance: undefined }, { ...reviewed, source_ref: 'openalex:irrelevant-leak', relevance: { label: 'irrelevant', reason: 'This raw source is outside the interpreted domain.' } }] }); await expect(page.getByTestId('chat-source')).toHaveCount(0);
  await api.publish({ retrieval: { ...intent, status: 'retrieving' }, sources: [reviewed] });
  await expect(page.getByTestId('chat-source')).toHaveCount(1); await expect(page.getByTestId('source-relevance')).toContainText('AI relevance · Relevant'); await expect(page.getByTestId('exploration-turn')).toHaveAttribute('data-status', 'running'); await expect(draft).toBeFocused();
  const nextQuery = { round: 2, lexical_query: '"context engineering" "retrieval augmented" agents', semantic_query: 'Evidence selection for reliable retrieval-augmented agents', reason: 'The first pool included unrelated ML applications.' };
  await api.publish({ retrieval: { ...intent, status: 'refining', round: 2, lexical_query: nextQuery.lexical_query, semantic_query: nextQuery.semantic_query, query_history: [firstQuery, nextQuery], rejected_count: 1, assessments: [{ source_ref: 'openalex:unrelated-record', provider: 'openalex', version: 'v1', run_id: 'raw-run', label: 'irrelevant', reason: 'The available abstract concerns a different domain.', round: 1 }] } });
  await expect(panel).toContainText('Round 2 of 2'); await panel.getByText('Query history (2)', { exact: true }).click(); await expect(panel).toContainText(nextQuery.reason);
  await panel.getByText('Excluded by relevance review (1)', { exact: true }).click(); await expect(panel).toContainText('The available abstract concerns a different domain.'); await expect(panel).toContainText('openalex:unrelated-record');
  await draft.focus();
  await api.publish({ status: 'SUCCEEDED', retrieval: { ...intent, status: 'completed', round: 2, lexical_query: nextQuery.lexical_query, semantic_query: nextQuery.semantic_query, query_history: [firstQuery, nextQuery] }, response: 'Reviewed provider records are ready.', sources: [reviewed, { ...reviewed, provider: 'europe_pmc', source_ref: 'europe_pmc:MED:222', run_id: 'biomedical-run', title: 'A separate reviewed provider record', retrieval_round: 2, relevance: { label: 'partial', reason: 'Only part of the supplied abstract addresses the research intent.' } }] }, 'IDLE');
  await expect(page.getByTestId('chat-source')).toHaveCount(1); await expect(page.getByTestId('related-source')).toHaveCount(1); await expect(draft).toHaveValue('Keep this follow-up draft'); await expect(draft).toBeFocused(); await expect(page.getByTestId('streamed-answer')).toHaveCount(0);
  await page.reload(); await expect(panel).toHaveAttribute('data-status', 'completed'); expect(api.submitted).toHaveLength(1); expect(api.legacy.state.starts).toBe(0);
});

test('fixture defaults and explicit opt-out preserve direct search, and metadata actions never request AI refinement', async ({ page }) => {
  const api = await installRefinement(page, false, false);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  const toggle = page.getByRole('checkbox', { name: 'Refine search with AI', exact: true }); await expect(toggle).not.toBeChecked(); await expect(toggle).toBeDisabled();
  await expect(page.getByText('AI refinement is disabled for this fixture profile. Direct search is available.', { exact: true })).toBeVisible();
  await page.getByLabel('Exploration message').fill('A direct provider question'); await page.getByRole('button', { name: 'Explore', exact: true }).click(); expect(api.submitted[0].agentic).toBe(false);
  await api.publish({ status: 'SUCCEEDED', response: 'Direct results saved.' }, 'IDLE');
  await page.getByLabel('Exploration action').selectOption('lookup'); await expect(toggle).toHaveCount(0); await page.getByLabel('Exploration message').fill('10.1038/nphys1170'); await page.getByRole('button', { name: 'Look up DOI', exact: true }).click(); expect(api.submitted[1]).not.toHaveProperty('agentic');
});

test('AI refinement can be explicitly opted out and failures do not erase reviewed records or automatically rerun', async ({ page }) => {
  const api = await installRefinement(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  const toggle = page.getByRole('checkbox', { name: 'Refine search with AI', exact: true }); await expect(toggle).toBeChecked(); await toggle.uncheck();
  await page.getByLabel('Exploration message').fill('Direct retrieval first'); await page.getByRole('button', { name: 'Explore', exact: true }).click(); expect(api.submitted[0].agentic).toBe(false); await api.publish({ status: 'SUCCEEDED' }, 'IDLE');
  await toggle.check(); await page.getByLabel('Exploration message').fill('Context engineering for ML agents'); await page.getByRole('button', { name: 'Explore', exact: true }).click(); expect(api.submitted[1].agentic).toBe(true);
  await api.publish({ sources: [reviewed], retrieval: { ...intent, status: 'reviewing' } }); await api.publish({ status: 'PARTIAL', response: 'Saved reviewed records remain available.', retrieval: { ...intent, status: 'failed', warnings: ['The relevance service could not complete the next review. No automatic retry was started.'] } }, 'IDLE');
  const last = page.getByTestId('exploration-turn').last(); await expect(last.getByTestId('chat-source')).toHaveCount(1); await expect(last.getByTestId('search-refinement')).toContainText('Search refinement interrupted'); await expect(last).toContainText('No automatic retry was started.'); expect(api.submitted).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('a clarification request shows the unresolved scope without fabricating searches or sources', async ({ page }) => {
  const api = await installRefinement(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByLabel('Exploration message').fill('ML context'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await api.publish({ status: 'EMPTY', response: 'Which aspect of machine learning context would you like to investigate?', retrieval: { status: 'clarification_needed', round: 1, max_rounds: 2, assessments: [], query_history: [], rejected_count: 0 } }, 'IDLE');
  const panel = page.getByTestId('search-refinement'); await expect(panel).toContainText('Clarification needed'); await expect(page.getByTestId('chat-source')).toHaveCount(0); await expect(panel.getByText('Lexical query', { exact: true })).toHaveCount(0); await expect(page.getByText('Which aspect of machine learning context would you like to investigate?', { exact: true })).toBeVisible(); expect(api.submitted).toHaveLength(1); expect(api.legacy.state.starts).toBe(0);
});

test('a wrong-reference review rejection shows the error without inventing or automatically retrieving a source', async ({ page }) => {
  const api = await installRefinement(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByLabel('Exploration message').fill('ML agent context'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await api.publish({ status: 'FAILED', response: 'The review could not be accepted.', retrieval: { ...intent, status: 'failed', assessments: [], warnings: ['The relevance review returned a source reference outside the admitted observations. No search was replayed.'] }, sources: [] }, 'IDLE');
  await expect(page.getByTestId('search-refinement')).toContainText('source reference outside the admitted observations'); await expect(page.getByTestId('chat-source')).toHaveCount(0); expect(api.submitted).toHaveLength(1); expect(api.legacy.state.starts).toBe(0);
});

test('saved mixed v1 records are grouped without changing their data and weak provider queries remain explicit', async ({ page }) => {
  const api = await installRefinement(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('checkbox', { name: /Crossref/ }).check(); await page.getByLabel('Exploration message').fill('ML context engineering'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const second = { ...reviewed, source_ref: 'openalex:second', record_id: 'second', title: 'A second directly relevant record' };
  const partial = { ...reviewed, provider: 'crossref', source_ref: 'crossref:partial', record_id: 'partial', run_id: 'crossref-run', title: 'Only partly related Crossref record', abstract: 'A partial metadata abstract.', relevance: { label: 'partial' as const, reason: 'The record covers only an adjacent context.' } };
  const uncertain = { ...partial, source_ref: 'crossref:unknown', record_id: 'unknown', title: 'An uncertain Crossref record', relevance: { label: 'unknown' as const, reason: 'Available metadata is insufficient to establish relevance.' } };
  await api.publish({ status: 'SUCCEEDED', response: 'Four relevant records: Only partly related Crossref record; An uncertain Crossref record.', sources: [reviewed, second, partial, uncertain], retrieval: { ...intent, status: 'completed', policy: 'scout-agentic-retrieval-v1', current_provider: 'crossref', round: 2, provider_queries: [{ provider: 'openalex', lexical_query: 'OpenAlex actual phrase', semantic_query: 'OpenAlex meaning', rationale: 'A native query.' }, { provider: 'crossref', lexical_query: 'Crossref repaired terms', semantic_query: 'Crossref local rerank intent', rationale: 'Terms were adapted to Crossref.' }], query_history: [{ ...firstQuery, provider: 'openalex' }, { ...firstQuery, provider: 'crossref' }, { ...firstQuery, provider: 'crossref', round: 2, lexical_query: 'Crossref repaired terms' }], provider_quality: { openalex: { relevant: 2, partial: 0, unknown: 0, irrelevant: 1, round: 1, status: 'sufficient' }, crossref: { relevant: 0, partial: 1, unknown: 1, irrelevant: 4, round: 2, status: 'weak', reason: 'The registry pool remains weakly related.' } } } }, 'IDLE');
  const turn = page.getByTestId('exploration-turn'); await expect(turn.getByTestId('chat-source')).toHaveCount(2); await expect(turn.locator('.resource-response')).toContainText('2 reviewed relevant sources'); await expect(turn.locator('.resource-response')).not.toContainText('Only partly related Crossref record');
  await expect(turn.getByTestId('related-source').first()).toBeHidden(); await turn.getByText('Related or uncertain records (2)', { exact: true }).click(); await expect(turn.getByTestId('related-source')).toHaveCount(2); await expect(turn.getByTestId('related-source').first().getByRole('button', { name: 'Read available abstract', exact: true })).toBeEnabled();
  await expect(turn.getByTestId('quality-crossref')).toContainText('0 relevant'); await expect(turn.getByTestId('quality-crossref')).toContainText('Weak relevance'); await expect(turn.getByRole('region', { name: 'Crossref search query', exact: true })).toContainText('Crossref repaired terms');
  await turn.getByText('Query history (3)', { exact: true }).click(); await expect(turn).toContainText('Crossref · Round 2');
  expect(api.conversation.turns[0].sources).toHaveLength(4); expect(api.conversation.turns[0].sources[2].version).toBe(partial.version);
  await page.reload(); await expect(page.getByTestId('chat-source')).toHaveCount(2); expect(api.submitted).toHaveLength(1);
});

test('only related results do not enable generation and partial failures keep their explicit error text', async ({ page }) => {
  const api = await installRefinement(page);
  await page.route('**/api/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ generation_enabled: true, generation: { enabled: true, model: 'test-writer' }, retrieval: { enabled: true, ready: true, max_rounds: 2, max_model_calls: 5 } }) }));
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByLabel('Exploration message').fill('ML context'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const partial = { ...reviewed, relevance: { label: 'partial' as const, reason: 'Only a neighboring topic is covered.' } };
  await api.publish({ status: 'SUCCEEDED', sources: [], related_sources: [partial], response: 'One relevant record.', retrieval: { ...intent, status: 'completed' } }, 'IDLE');
  await expect(page.getByTestId('chat-source')).toHaveCount(0); await expect(page.getByTestId('related-source')).toHaveCount(1); await expect(page.getByTestId('exploration-turn').locator('.resource-response')).toContainText('No directly relevant sources'); await expect(page.getByRole('option', { name: 'Stream answer · demo', exact: true })).toHaveJSProperty('disabled', true);
  await api.publish({ status: 'PARTIAL', response: 'Crossref failed; previously reviewed records remain available.', retrieval: { ...intent, status: 'failed' }, sources: [reviewed] }, 'IDLE');
  await expect(page.getByTestId('exploration-turn').locator('.resource-response')).toHaveText('Crossref failed; previously reviewed records remain available.');
});

test('Search workspace opens a reviewed exploration with the chosen provider and filters, admitting a duplicate click only once', async ({ page }) => {
  const api = await installRefinement(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await expect(page.getByRole('checkbox', { name: 'Refine search with AI', exact: true })).toBeChecked(); await page.getByLabel('Discovery provider', { exact: true }).selectOption('crossref'); await page.getByRole('button', { name: 'Edit publication years', exact: true }).click(); await page.getByLabel('Publication year from').fill('2022'); await page.getByLabel('Publication year to').fill('2025'); await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByLabel('Research question', { exact: true }).fill('ML context engineering'); await expect(page.getByText('Clarifies this question and checks relevance. Reviewed results open in Exploration chat.', { exact: true })).toBeVisible();
  await page.locator('form.research-form').evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect(page.getByRole('heading', { name: 'Explore research', exact: true })).toBeVisible(); await expect(page.getByTestId('search-refinement')).toHaveAttribute('data-status', 'planning'); expect(api.submitted).toHaveLength(1); expect(api.submitted[0]).toMatchObject({ action: 'discover', agentic: true, providers: ['crossref'], filters: { year_from: 2022, year_to: 2025 } }); expect(api.legacy.state.starts).toBe(0);
});

test('an uncertain reviewed-search POST is not automatically repeated and explicit retry retains its send key', async ({ page }) => {
  const api = await installRefinement(page, true, true, true);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await expect(page.getByRole('checkbox', { name: 'Refine search with AI', exact: true })).toBeChecked(); await page.getByLabel('Research question', { exact: true }).fill('ML context engineering'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open saved exploration', exact: true })).toBeVisible(); await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('ML context engineering'); expect(api.submitted).toHaveLength(1);
  await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect(page.getByTestId('exploration-turn')).toHaveCount(1); expect(api.submitted).toHaveLength(2); expect(api.submitted[1].idempotency_key).toBe(api.submitted[0].idempotency_key); expect(api.legacy.state.starts).toBe(0);
});

test('actual planner prompts, intent facets, keywords and provider arguments remain auditable saved text', async ({ page }) => {
  const api = await installRefinement(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByLabel('Exploration message').fill('ML context engineering'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const body = { model: 'test-planner-model', instructions: 'Interpret the supplied question; <img src=x onerror=alert(1)>', input: [{ role: 'user', content: [{ type: 'input_text', text: 'ML context engineering' }] }], text: { format: { type: 'json_schema', name: 'research_plan' } }, max_output_tokens: 900 };
  await api.publish({ status: 'SUCCEEDED', sources: [{ ...reviewed, relevance: { ...reviewed.relevance, evidence_quote: 'context selection for machine learning agents' } }], retrieval: { ...intent, status: 'completed', intent_frame: { object_of_change: 'Machine learning agent context', intervention: 'Context selection', desired_outcome: 'More relevant retrieved evidence', boundary: 'Research metadata and supplied abstracts' }, keywords: ['context engineering', 'machine learning'], tags: ['agent context', 'retrieval'], llm_requests: [{ step: 'plan', purpose: 'plan', status: 'response_received', model: 'test-planner-model', body }], source_requests: [{ provider: 'crossref', run_id: 'reviewed-run', round: 1, branch: 'semantic', transport: 'local_encoder', query_input: 'Context selection for agents', executed_arguments: { query: 'context engineering', rows: 20 }, semantic_execution: 'local_candidate_pool_rerank', query_policy: 'bounded_pool', status: 'SUCCEEDED', cache_hit: false }] } }, 'IDLE');
  await expect(page.getByLabel('Interpreted question frame')).toContainText('More relevant retrieved evidence'); await expect(page.getByLabel('Search keywords')).toContainText('context engineering'); await expect(page.getByLabel('Planner tags')).toContainText('agent context');
  const llm = page.getByTestId('llm-request-audit'); await expect(llm.locator('pre')).toBeHidden(); await llm.locator('summary').click(); await expect(llm.locator('pre')).toHaveText(JSON.stringify(body, null, 2)); await expect(llm).toContainText('Response received'); await expect(llm.locator('img')).toHaveCount(0);
  const provider = page.getByTestId('provider-request-audit'); await provider.locator('summary').click(); await expect(provider).toContainText('local_encoder'); await expect(provider).toContainText('local_candidate_pool_rerank'); await expect(provider.locator('pre')).toContainText('"rows": 20');
  await expect(page.getByTestId('source-relevance')).toContainText('context selection for machine learning agents');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload(); await expect(page.getByTestId('llm-request-audit')).toBeVisible(); expect(api.submitted).toHaveLength(1); expect(api.legacy.state.starts).toBe(0);
});

test('inspection pins the exact reviewed source across reload; invalid pins never expose other raw candidates', async ({ page }) => {
  const api = await installRefinement(page);
  api.legacy.state.snapshot = { ...api.legacy.state.snapshot, id: reviewed.run_id, status: 'succeeded', entities: [reviewed, SECOND_SOURCE] };
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByLabel('Exploration message').fill('ML context engineering'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await api.publish({ status: 'SUCCEEDED', sources: [reviewed], retrieval: { ...intent, status: 'completed' } }, 'IDLE');
  await page.getByTestId('chat-source').getByRole('button', { name: /^Open .* in workspace$/ }).click();
  await expect(page.getByTestId('source-inspection-scope')).toBeVisible(); await expect(page.getByTestId('source-row')).toHaveCount(1); await expect(page.getByTestId('source-row')).toHaveAttribute('data-source-ref', reviewed.source_ref); await expect(page.getByLabel('Find in results', { exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('source')).toBe(reviewed.source_ref); expect(new URL(page.url()).searchParams.get('from_conversation')).toBe(api.conversation.id);
  await page.reload(); await expect(page.getByTestId('source-row')).toHaveCount(1); await expect(page.getByTestId('source-row')).toHaveAttribute('data-source-ref', reviewed.source_ref);
  await page.getByRole('button', { name: 'Back to reviewed results', exact: true }).click(); await expect(page.getByTestId('chat-source')).toHaveCount(1);
  await page.getByTestId('chat-source').getByRole('button', { name: /^Open .* in workspace$/ }).click(); await page.getByRole('button', { name: 'View all raw provider candidates', exact: true }).click(); await expect(page.getByTestId('source-row')).toHaveCount(2); expect(new URL(page.url()).searchParams.has('source')).toBe(false);
  await page.goto(`/?run=${reviewed.run_id}&source=missing-exact-reference&from_conversation=${api.conversation.id}`); await expect(page.getByRole('heading', { name: 'This saved source is unavailable.', exact: true })).toBeVisible(); await expect(page.getByTestId('source-row')).toHaveCount(0); await expect(page.locator('.embedded-inspector .preview-title')).toHaveCount(0);
  await page.getByRole('button', { name: 'View all raw provider candidates', exact: true }).click(); await expect(page.getByTestId('source-row')).toHaveCount(2); expect(api.submitted).toHaveLength(1); expect(api.legacy.state.starts).toBe(0); expect(api.legacy.state.details).toBe(0); expect(api.legacy.state.checks).toBe(0);
});

test('Search workspace retains an explicit direct-search opt-out', async ({ page }) => {
  const api = await installRefinement(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); const checkbox = page.getByRole('checkbox', { name: 'Refine search with AI', exact: true }); await expect(checkbox).toBeChecked(); await checkbox.uncheck(); await page.getByLabel('Research question', { exact: true }).fill('Direct search requested'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect(page.getByTestId('run-progress')).toBeVisible(); expect(api.legacy.state.starts).toBe(1); expect(api.submitted).toHaveLength(0);
});
