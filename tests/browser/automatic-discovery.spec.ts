import { test, expect, type Page } from '../../frontend/node_modules/@playwright/test';
import type { AccessObservation, CanonicalPaper, Conversation, ExplorationTurn } from '../../frontend/src/lib/conversations';
import { DISCOVERY_PROVIDERS } from '../../frontend/src/lib/api';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';

async function installAutomatic(page: Page) {
  const legacy = await installFixtureApi(page);
  let conversation: Conversation = { id: 'automatic-conversation', routing: 'auto', title: 'Automatic research', created_at: '2026-11-09T12:00:00Z', updated_at: '2026-11-09T12:00:00Z', revision: 0, cursor: 'auto:0', status: 'IDLE', providers: [], filters: {}, turns: [] };
  const creates: Record<string, unknown>[] = [], sends: Record<string, unknown>[] = [];
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [...DISCOVERY_PROVIDERS.map(id => ({ id, status: 'ready', mode: 'fixture', access_configured: true })), { id: 'unpaywall', status: 'needs_access', mode: 'fixture', access_configured: false, blocked_reason: 'Configure a contact email for Unpaywall.' }] } }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation_enabled: false, generation: { enabled: false }, retrieval: { enabled: false, ready: false, max_model_calls: 9 } } }));
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/api/conversations' && req.method() === 'GET') return route.fulfill({ json: { conversations: conversation.turns.length ? [conversation] : [] } });
    if (path === '/api/conversations') { const body = req.postDataJSON(); creates.push(body); conversation = { ...conversation, routing: body.routing, filters: body.filters }; return route.fulfill({ json: conversation }); }
    if (path.endsWith('/turns')) {
      const body = req.postDataJSON(); sends.push(body);
      const turn: ExplorationTurn = { id: 'automatic-turn', routing: body.routing, message: body.message, action: body.action, providers: ['openalex', 'crossref', 'arxiv', 'openaire'], status: 'RUNNING', created_at: '2026-11-09T12:00:00Z', run_ids: [], sources: [], papers: [], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' }, source_plan: [{ provider: 'openalex', role: 'discovery', status: 'selected', reason: 'Broad scholarly discovery for this question.', health_status: 'ready', mode: 'fixture' }, { provider: 'unpaywall', role: 'access', status: 'enrichment', reason: 'Automatic DOI access checks; a contact email is required.', health_status: 'needs_access', mode: 'fixture' }, { provider: 'semantic_scholar', role: 'discovery', status: 'skipped', reason: 'Another selected resource covers this scope.', health_status: 'ready', mode: 'fixture' }] };
      conversation = { ...conversation, status: 'RUNNING', revision: conversation.revision + 1, turns: [...conversation.turns, turn] }; return route.fulfill({ status: 202, json: conversation });
    }
    return route.fulfill({ json: conversation });
  });
  return { creates, sends, legacy, async publish(update: Partial<ExplorationTurn>, status: Conversation['status'] = 'RUNNING') { conversation = { ...conversation, status, revision: conversation.revision + 1, turns: conversation.turns.map(turn => ({ ...turn, ...update })) }; await page.evaluate(snapshot => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(snapshot), conversation); } };
}

const first = { ...FIRST_SOURCE, run_id: 'auto-openalex', doi: '10.1234/shared', title: 'Whole OpenAlex title', abstract: 'An early available abstract.' };
const crossref = { ...first, run_id: 'auto-crossref', provider: 'crossref', source_ref: 'crossref:10.1234/shared', title: 'A distinct Crossref title', abstract: 'The separate Crossref abstract remains attributable.' };
const paper: CanonicalPaper = { paper_id: 'doi:10.1234/shared', doi: '10.1234/shared', representative: first, observations: [first], providers: ['openalex'], access: { status: 'queued' } };

test('default Search automatically routes four resources and progressively groups DOI observations with integrated access', async ({ page }) => {
  const api = await installAutomatic(page); await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Choose sources manually', exact: true })).not.toBeChecked(); await expect(page.getByLabel('Discovery provider', { exact: true })).toHaveCount(0); await expect(page.getByLabel('Automatically routed resources')).toContainText('Unpaywall · access');
  await page.getByLabel('Research question', { exact: true }).fill('Memory for research agents'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect(page.getByTestId('exploration-turn')).toHaveCount(1);
  expect(api.creates[0]).toMatchObject({ routing: 'auto' }); expect(api.creates[0]).not.toHaveProperty('providers'); expect(api.sends[0]).toMatchObject({ routing: 'auto', action: 'discover', agentic: false }); expect(api.sends[0]).not.toHaveProperty('providers'); expect(api.legacy.state.starts).toBe(0);
  await api.publish({ sources: [first], papers: [paper] }); const card = page.getByTestId('chat-source'); await expect(card).toHaveCount(1); await expect(card).toContainText('An early available abstract.'); await expect(card.getByTestId('paper-access')).toContainText('queued'); await expect(page.getByTestId('exploration-turn')).toHaveAttribute('data-status', 'running'); await card.evaluate(node => { (node as HTMLElement).dataset.stable = 'yes'; });
  const access: AccessObservation = { provider: 'unpaywall', mode: 'fixture', doi: '10.1234/shared', is_oa: true, oa_status: 'green', observed_at: '2026-11-09T12:00:00Z', version: 'oa1', best_oa_location: { url_for_pdf: 'https://repository.example.org/paper.pdf', license: 'cc-by', version: 'acceptedVersion' }, oa_locations: [] };
  await api.publish({ status: 'SUCCEEDED', sources: [first, crossref], papers: [{ ...paper, observations: [first, crossref], providers: ['openalex', 'crossref'], access: { status: 'succeeded', observation: access } }] }, 'IDLE');
  await expect(card).toHaveCount(1); await expect(card).toHaveAttribute('data-stable', 'yes'); await expect(card.getByLabel('Matching source providers')).toContainText('Crossref'); await expect(card.getByRole('link', { name: 'Open PDF', exact: true })).toHaveAttribute('href', 'https://repository.example.org/paper.pdf'); await expect(card).toContainText('Accepted manuscript'); await expect(page.locator('.resource-response')).toContainText('1 paper is available');
  await card.getByTestId('paper-observations').locator('summary').first().click(); await expect(card.getByTestId('paper-observations')).toContainText('A distinct Crossref title'); await expect(card.getByTestId('paper-observations')).toContainText('Whole OpenAlex title');
  await page.getByTestId('source-routing-plan').locator('summary').click(); await expect(page.getByTestId('source-routing-plan')).toContainText('Skipped'); await expect(page.getByTestId('source-routing-plan')).toContainText('a contact email is required');
  await page.reload(); await expect(page.getByTestId('chat-source')).toHaveCount(1); expect(api.sends).toHaveLength(1); expect(api.legacy.state.starts).toBe(0);
});

test('default chat needs no provider selection and a blocked automatic access check stays visible without retrying', async ({ page }) => {
  const api = await installAutomatic(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click();
  await expect(page.getByRole('group', { name: /Discovery providers/ })).toHaveCount(0); await page.getByLabel('Exploration message').fill('How do research agents use memory?'); await page.getByRole('button', { name: 'Explore', exact: true }).click(); await expect(page.getByTestId('exploration-turn')).toHaveCount(1);
  expect(api.sends[0]).not.toHaveProperty('providers'); await api.publish({ status: 'SUCCEEDED', sources: [first], papers: [{ ...paper, access: { status: 'blocked', reason: 'Configure a contact email for Unpaywall.' } }] }, 'IDLE');
  await expect(page.getByTestId('paper-access')).toContainText('blocked'); await expect(page.getByTestId('paper-access')).toContainText('Configure a contact email'); await expect(page.getByTestId('paper-access').getByRole('link')).toHaveCount(0); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload(); await expect(page.getByTestId('paper-access')).toContainText('blocked'); expect(api.sends).toHaveLength(1); expect(api.legacy.state.details).toBe(0);
});

test('compacted history restores one saved turn with a GET and retains it across compact SSE updates', async ({ page }) => {
  const api = await installAutomatic(page); let savedReads = 0;
  await page.goto('/'); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByLabel('Exploration message').fill('Saved research question'); await page.getByRole('button', { name: 'Explore', exact: true }).click(); await expect(page.getByTestId('exploration-turn')).toHaveCount(1);
  const compact: Partial<ExplorationTurn> = { status: 'SUCCEEDED', history_compacted: true, saved_result_counts: { sources: 2, papers: 1, related_sources: 0, llm_requests: 0, source_requests: 0, assessments: 0 }, papers: [], sources: [] };
  await page.route('**/api/conversations/automatic-conversation/turns/automatic-turn', async route => { expect(route.request().method()).toBe('GET'); savedReads++; await route.fulfill({ json: { id: 'automatic-turn', routing: 'auto', message: 'Saved research question', action: 'discover', providers: ['openalex'], status: 'SUCCEEDED', created_at: '2026-11-09T12:00:00Z', run_ids: [], sources: [first], papers: [paper], response: 'Saved result.', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' } } }); });
  await api.publish(compact, 'IDLE'); await expect(page.getByTestId('compacted-history')).toContainText('Saved results: 1.'); await page.getByRole('button', { name: 'Open saved results', exact: true }).click(); await expect(page.getByTestId('chat-source')).toHaveCount(1); await expect(page.getByTestId('compacted-history')).toHaveCount(0);
  await api.publish(compact, 'IDLE'); await expect(page.getByTestId('chat-source')).toHaveCount(1); await expect(page.getByTestId('chat-source')).toContainText('An early available abstract.'); expect(savedReads).toBe(1); expect(api.sends).toHaveLength(1); expect(api.legacy.state.starts).toBe(0); expect(api.legacy.state.details).toBe(0);
});
