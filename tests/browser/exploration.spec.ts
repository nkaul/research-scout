import { test, expect, type Page } from '../../frontend/node_modules/@playwright/test';
import type { Conversation, ExplorationTurn } from '../../frontend/src/lib/conversations';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';

async function installExploration(page: Page, blockedOpenAlex = false, generationEnabled = false) {
  const legacy = await installFixtureApi(page);
  let conversation: Conversation = {
    id: 'fixture-conversation', title: 'Fixture exploration', status: 'IDLE', revision: 0, cursor: 'conversation:0',
    created_at: '2026-11-09T12:00:00Z', updated_at: '2026-11-09T12:00:00Z', providers: ['openalex'], filters: {}, turns: [],
  };
  const submitted: Record<string, unknown>[] = [];
  let creates = 0, cancels = 0;
  await page.route('**/api/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ generation_enabled: generationEnabled, generation: { enabled: generationEnabled, model: 'test-streaming-model', profile: 'demo', status: generationEnabled ? 'ready' : 'needs_access', blocked_reason: generationEnabled ? undefined : 'Configure an answer key to enable the demo writer.' } }) }));
  if (blockedOpenAlex) await page.route('**/api/providers', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ providers: [
    { id: 'openalex', status: 'needs_access', mode: 'live', access_configured: false },
    { id: 'semantic_scholar', status: 'ready', mode: 'fixture' },
    { id: 'crossref', status: 'ready', mode: 'live' },
    { id: 'datacite', status: 'ready', mode: 'live' },
  ] }) }));
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, async route => {
    const req = route.request(), pathname = new URL(req.url()).pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (pathname === '/api/conversations') {
      if (req.method() === 'GET') return json({ conversations: creates ? [conversation] : [] });
      creates++; return json(conversation);
    }
    if (pathname.endsWith('/cancel')) {
      cancels++; conversation = { ...conversation, status: 'IDLE', revision: conversation.revision + 1, turns: conversation.turns.map(turn => ({ ...turn, status: 'CANCELLED', response: 'Exploration stopped. Already observed sources remain available.' })) };
      return json(conversation);
    }
    if (pathname.endsWith('/turns')) {
      const body = req.postDataJSON(); submitted.push(body);
      const lookup = body.action === 'lookup' || body.action === 'discover' && /^10\./.test(body.message);
      const saved = body.action === 'saved';
      const generate = body.action === 'generate';
      const turn: ExplorationTurn = {
        id: `turn-${submitted.length}`, message: body.message, action: lookup ? 'lookup' : body.action,
        providers: lookup ? ['crossref'] : body.providers, status: lookup || saved ? 'SUCCEEDED' : 'RUNNING',
        run_ids: [], created_at: '2026-11-09T12:00:00Z', response: lookup ? 'Registry metadata supplied by Crossref.' : saved ? 'Saved observations; no new discovery request.' : '',
        sources: lookup ? [{ ...FIRST_SOURCE, provider: 'crossref', source_ref: 'crossref:doi-2009', title: 'A registry record from 2009', year: 2009, mode: 'live', run_id: '', registry_only: true }] : generate ? (conversation.turns.at(-1)?.sources || []).map((source, index) => ({ ...source, citation_label: `S${index + 1}` })) : saved ? conversation.turns.at(-1)?.sources || [] : [],
        warnings: [], usage: { research_attempts: lookup ? 2 : 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'deterministic', generation: 'disabled' },
        activity: lookup ? [{ provider: 'crossref', operation: 'agency', status: 'succeeded', attempts: 1, source_count: 0 }, { provider: 'crossref', operation: 'metadata', status: 'succeeded', attempts: 1, source_count: 1 }] : generate ? [{ provider: 'openai', operation: 'generation', status: 'admitted', attempts: 1, source_count: 0 }] : saved ? [] : body.providers.map((provider: string) => ({ provider, operation: 'search', status: 'running', attempts: 1, source_count: 0 })),
        ...(generate ? { generation: { status: 'admitted', model: 'test-streaming-model' }, plan: { routing: 'deterministic', generation: 'openai_responses', model: 'test-streaming-model' } } : {}),
      };
      conversation = { ...conversation, status: turn.status === 'RUNNING' ? 'RUNNING' : 'IDLE', revision: conversation.revision + 1, turns: [...conversation.turns, turn] };
      return json(conversation, 202);
    }
    return json(conversation);
  });
  return {
    submitted, legacy,
    get conversation() { return conversation; }, get cancels() { return cancels; },
    async publish(turnUpdate: Partial<ExplorationTurn>, status: Conversation['status'] = 'RUNNING') {
      conversation = { ...conversation, status, revision: conversation.revision + 1, cursor: `conversation:${conversation.revision + 1}`, turns: conversation.turns.map((turn, index) => index === conversation.turns.length - 1 ? { ...turn, ...turnUpdate } : turn) };
      await page.evaluate(snapshot => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(snapshot), conversation);
    },
  };
}

test('exploration renders early separate-provider sources, retains drafts and cancels without duplicate search', async ({ page }) => {
  const api = await installExploration(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByRole('checkbox', { name: /Semantic Scholar/ }).check();
  await page.getByLabel('Exploration message').fill('Memory for research agents');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const turn = page.getByTestId('exploration-turn').first();
  await expect(turn).toHaveAttribute('data-status', 'running');
  expect(api.submitted[0].providers).toEqual(['openalex', 'semantic_scholar']);
  await api.publish({ sources: [{ ...FIRST_SOURCE, run_id: 'fixture-run-1' }] });
  await expect(page.getByTestId('chat-source')).toHaveCount(1);
  await expect(page.getByRole('button', { name: `Inspect OpenAlex source: ${FIRST_SOURCE.title}` })).toBeVisible();
  const draft = page.getByLabel('Exploration message');
  await draft.fill('Keep this follow-up draft'); await draft.focus();
  await api.publish({ sources: [{ ...FIRST_SOURCE, run_id: 'fixture-run-1' }, { ...FIRST_SOURCE, provider: 'semantic_scholar', source_ref: 'semantic_scholar:second', run_id: 'fixture-run-2', title: 'A separate Semantic Scholar observation' }] });
  await expect(page.getByTestId('chat-source')).toHaveCount(2);
  await expect(draft).toHaveValue('Keep this follow-up draft'); await expect(draft).toBeFocused();
  await api.legacy.disconnect();
  await expect(page.getByText('Resources are still arriving · reconnecting to saved updates')).toBeVisible();
  await page.getByRole('button', { name: 'Stop exploration', exact: true }).click();
  await expect(turn).toHaveAttribute('data-status', 'cancelled');
  expect(api.cancels).toBe(1); expect(api.submitted).toHaveLength(1); expect(api.legacy.state.starts).toBe(0);
});

test('a public DOI works with OpenAlex blocked and saved follow-up does not introduce year filters', async ({ page }) => {
  const api = await installExploration(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByRole('button', { name: 'Try a Crossref DOI', exact: true }).click();
  await expect(page.getByLabel('Exploration publication year to')).toBeDisabled();
  await page.getByRole('button', { name: 'Look up DOI', exact: true }).click();
  await expect(page.getByText('A registry record from 2009', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open A registry/ })).toHaveCount(0);
  await page.getByLabel('Exploration action').selectOption('saved');
  await page.getByLabel('Exploration message').fill('Show the first saved record');
  await page.getByRole('button', { name: 'Read saved sources', exact: true }).click();
  await expect(page.getByTestId('exploration-turn')).toHaveCount(2);
  expect(api.submitted[1].action).toBe('saved'); expect(api.submitted[1]).not.toHaveProperty('filters');
  const savedUrl = page.url(); await page.reload();
  await expect(page.getByTestId('exploration-turn')).toHaveCount(2); expect(page.url()).toBe(savedUrl); expect(api.submitted).toHaveLength(2);
  await page.getByLabel('Exploration action').selectOption('discover');
  await page.getByRole('checkbox', { name: /OpenAlex/ }).uncheck();
  await page.getByRole('checkbox', { name: /Semantic Scholar/ }).check();
  await page.getByLabel('Exploration message').fill('A separate search with Semantic Scholar');
  await expect(page.getByRole('button', { name: 'Explore', exact: true })).toBeEnabled();
});

test('exploration remains usable on a narrow phone and keeps over-budget input editable', async ({ page }) => {
  await installExploration(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Exploration message').fill('研'.repeat(700));
  await expect(page.getByLabel('Exploration message')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Explore', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByLabel('Exploration message').fill('10.1038/nphys1170');
  await page.getByRole('button', { name: 'Look up DOI', exact: true }).click();
  await expect(page.getByTestId('chat-source')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('a successful details lookup does not claim verified discovery and rate limits stay visible', async ({ page }) => {
  await installExploration(page);
  let rateLimited = false;
  await page.route('**/api/providers', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ providers: [
    { id: 'openalex', status: 'ready', mode: 'fixture' },
    { id: 'semantic_scholar', status: 'ready', mode: 'live', access_configured: true, capability_status: 'partially_verified', verified_capabilities: ['details'], last_error: rateLimited ? 'UPSTREAM_RATE_LIMIT' : null },
  ] }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  const s2 = page.getByRole('checkbox', { name: /Semantic Scholar/ });
  await expect(s2).toBeEnabled();
  await expect(s2.locator('..')).toContainText('Configured · discovery unverified');
  await expect(s2.locator('..')).not.toContainText('Discovery verified');
  await page.getByRole('button', { name: /^Providers/ }).click();
  await expect(page.getByRole('dialog', { name: 'Research providers' }).getByText('Verified operations: Details', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  rateLimited = true; await page.reload();
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: /Semantic Scholar/ }).locator('..')).toContainText('Rate-limited');
  await page.getByRole('button', { name: /^Providers/ }).click();
  await expect(page.getByRole('dialog', { name: 'Research providers' }).getByText('Last request: rate-limited. Wait before retrying.', { exact: true })).toBeVisible();
});

test('explicit generation renders real response snapshots progressively, retains citations and reopens without another request', async ({ page }) => {
  const api = await installExploration(page, true, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByRole('button', { name: 'Try a Crossref DOI', exact: true }).click();
  await page.getByRole('button', { name: 'Look up DOI', exact: true }).click();
  const lookup = page.getByTestId('exploration-turn').first();
  await expect(lookup.getByTestId('activity-crossref')).toContainText('DOI agency');
  await expect(lookup.getByTestId('activity-crossref')).toContainText('DOI metadata');
  await expect(lookup.getByTestId('activity-openalex')).toContainText('Not queried this turn');
  await expect(lookup.getByTestId('activity-datacite')).toContainText('Not queried this turn');
  await expect(lookup.getByTestId('activity-openai')).toContainText('Not used this turn');
  await page.getByLabel('Exploration action').selectOption('generate');
  await expect(page.getByRole('button', { name: 'Stream answer', exact: true })).toBeEnabled();
  await expect(page.getByText(/^Will answer:/)).toContainText('10.1038/nphys1170');
  await page.getByRole('button', { name: 'Stream answer', exact: true }).click();
  const turn = page.getByTestId('exploration-turn').nth(1);
  await expect(turn).toHaveAttribute('data-status', 'running');
  await expect(turn.getByTestId('activity-openai')).toContainText('Answer stream');
  await expect(turn.getByTestId('activity-openai')).toContainText('1 attempt');
  expect(api.submitted[1].action).toBe('generate'); expect(api.submitted[1]).not.toHaveProperty('filters');
  await expect(turn.getByTestId('chat-source')).toHaveCount(1);
  await api.publish({ response: 'The registry', generation: { status: 'streaming', model: 'test-streaming-model', omitted_source_count: 8 } });
  const answer = turn.getByTestId('streamed-answer');
  await expect(answer).toHaveText('The registry');
  await expect(turn.getByTestId('answer-coverage')).toHaveText('1 saved source preview used; 8 other records not included. Saved evidence reused; no new scholarly queries.');
  await expect(turn.getByText('Streaming draft', { exact: true })).toBeVisible();
  const full = 'The registry record identifies a 2009 publication [S1].';
  await api.publish({ response: full });
  await expect(answer).toHaveText(full);
  const citation = answer.getByRole('link', { name: /^S1: Crossref/ });
  await expect(citation).toHaveAttribute('href', '#answer-source-turn-2-S1');
  await expect(turn.locator('#answer-source-turn-2-S1')).toContainText('A registry record from 2009');
  const draft = page.getByLabel('Exploration message'); await draft.fill('Keep this next question'); await draft.focus();
  const stale = { ...api.conversation, revision: api.conversation.revision - 1, turns: api.conversation.turns.map(item => ({ ...item, response: '' })) };
  await page.evaluate(snapshot => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(snapshot), stale);
  await expect(answer).toHaveText(full); await expect(draft).toBeFocused();
  await api.publish({ status: 'SUCCEEDED', response: full, generation: { status: 'completed', model: 'test-streaming-model', input_tokens: 100, output_tokens: 20 }, citations: [{ label: 'S1', provider: 'crossref', run_id: '', source_ref: 'crossref:doi-2009', observation_version: 1 }] }, 'IDLE');
  await expect(turn).toHaveAttribute('data-status', 'succeeded');
  for (const provider of ['openalex', 'semantic_scholar', 'crossref', 'datacite']) await expect(turn.getByTestId(`activity-${provider}`)).toContainText('Not queried this turn');
  await expect(draft).toHaveValue('Keep this next question');
  expect(api.submitted).toHaveLength(2); expect(api.legacy.state.starts).toBe(0);
  const url = page.url(); await page.reload();
  await expect(page.getByTestId('streamed-answer')).toHaveText(full); expect(page.url()).toBe(url); expect(api.submitted).toHaveLength(2);
  await expect(page.getByTestId('streamed-answer').getByRole('link', { name: /^S1: Crossref/ })).toHaveAttribute('href', '#answer-source-turn-2-S1');
});

test('generation is disabled without a configured key and a failed stream retains evidence for an explicit retry', async ({ page }) => {
  const api = await installExploration(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByRole('button', { name: 'Try a Crossref DOI', exact: true }).click();
  await page.getByRole('button', { name: 'Look up DOI', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Stream answer · demo', exact: true })).toHaveJSProperty('disabled', true);
  await expect(page.getByText('Configure an answer key to enable the demo writer.', { exact: true })).toBeVisible();
  expect(api.submitted).toHaveLength(1);
  await page.route('**/api/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ generation_enabled: true, generation: { enabled: true, model: 'test-streaming-model', profile: 'demo', status: 'ready' } }) }));
  await page.reload();
  await page.getByLabel('Exploration action').selectOption('generate');
  await page.getByRole('button', { name: 'Stream answer', exact: true }).click();
  await api.publish({ status: 'FAILED', response: 'A partial answer [S1]', generation: { status: 'failed', model: 'test-streaming-model' }, warnings: ['The answer connection was interrupted. Saved sources remain available.'] }, 'IDLE');
  const turn = page.getByTestId('exploration-turn').nth(1);
  await expect(turn.getByTestId('chat-source')).toHaveCount(1);
  await expect(turn.getByTestId('streamed-answer')).toHaveText('A partial answer [S1]');
  await turn.getByRole('button', { name: 'Prepare retry', exact: true }).click();
  await expect(page.getByLabel('Exploration message')).toHaveValue('10.1038/nphys1170');
  expect(api.submitted).toHaveLength(2); expect(api.legacy.state.starts).toBe(0);
});

test('generated answer formatting stays React-safe during partial text and keeps source links and turn anchors', async ({ page }) => {
  const api = await installExploration(page, true, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByRole('button', { name: 'Try a Crossref DOI', exact: true }).click();
  await page.getByRole('button', { name: 'Look up DOI', exact: true }).click();
  await page.getByLabel('Exploration action').selectOption('generate');
  await page.getByRole('button', { name: 'Stream answer', exact: true }).click();
  const turn = page.getByTestId('exploration-turn').nth(1);
  await expect(turn).toHaveAttribute('id', 'turn-turn-2');
  await api.publish({ response: '**A partial heading', generation: { status: 'streaming', model: 'test-streaming-model' } });
  const answer = turn.getByTestId('streamed-answer');
  await expect(answer).toHaveText('**A partial heading');
  await api.publish({ response: '**A partial heading:** *A publication title* [S1]\n\n- First observation\n- Second observation\n\n1. One ordered point\n\n<img src=x onerror="window.__answerXss=true">' });
  await expect(answer.locator('strong')).toHaveText('A partial heading:');
  await expect(answer.locator('em')).toHaveText('A publication title');
  await expect(answer.locator('ul > li')).toHaveCount(2);
  await expect(answer.locator('ol > li')).toHaveCount(1);
  await expect(answer.getByRole('link', { name: /^S1: Crossref/ })).toHaveAttribute('href', '#answer-source-turn-2-S1');
  await expect(answer.locator('img,script')).toHaveCount(0);
  await expect(answer).toContainText('<img src=x onerror="window.__answerXss=true">');
  expect(await page.evaluate(() => (window as unknown as { __answerXss?: boolean }).__answerXss)).toBeUndefined();
  const deepLink = `${page.url()}#turn-turn-2`;
  await page.goto('about:blank');
  await page.goto(deepLink);
  await expect(page.locator('#turn-turn-2')).toBeFocused();
  const anchored = await page.locator('#turn-turn-2').boundingBox();
  expect(anchored!.y).toBeGreaterThanOrEqual(0);
  expect(anchored!.y).toBeLessThan(200);
});

test('chat displays abstracts immediately and reads fuller same-provider details with cached replay', async ({ page }) => {
  const api = await installExploration(page);
  const full = 'Full provider abstract. ' + 'Authored content about research methods. '.repeat(45) + 'END_OF_ABSTRACT';
  const partial = { ...FIRST_SOURCE, abstract: 'A provider abstract excerpt…', truncated_fields: ['abstract'], run_id: 'fixture-run-1', abstract_truncated: true };
  api.legacy.state.snapshot = { ...api.legacy.state.snapshot, status: 'SUCCEEDED', entities: [partial, { ...FIRST_SOURCE, abstract: null, source_ref: 'openalex:missing', record_id: 'missing' }] };
  let detailCalls = 0;
  await page.route('**/api/research-runs/fixture-run-1/papers/**/details', async route => {
    detailCalls++;
    const missing = decodeURIComponent(new URL(route.request().url()).pathname).includes('openalex:missing');
    api.legacy.state.snapshot = { ...api.legacy.state.snapshot, usage: { research_attempts: 2 + detailCalls }, entities: api.legacy.state.snapshot.entities.map(source => source.source_ref === (missing ? 'openalex:missing' : FIRST_SOURCE.source_ref) ? { ...source, abstract: missing ? null : full, truncated_fields: [], version: 2, details_loaded: true } : source) };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(api.legacy.state.snapshot) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Exploration message').fill('Authored abstract test');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await api.publish({ status: 'SUCCEEDED', sources: [partial, { ...partial, abstract: null, source_ref: 'openalex:missing', record_id: 'missing' }] }, 'IDLE');
  const first = page.getByTestId('chat-source').first();
  await expect(first.getByText('A provider abstract excerpt…', { exact: true })).toBeVisible();
  expect(detailCalls).toBe(0);
  await first.getByRole('button', { name: 'Read available abstract', exact: true }).click();
  await expect(first.getByText(full, { exact: true })).toBeVisible();
  await expect(first).toContainText('1 new external request');
  await first.getByRole('button', { name: 'Collapse abstract', exact: true }).click();
  await first.getByRole('button', { name: 'Read available abstract', exact: true }).click();
  expect(detailCalls).toBe(1);
  const missing = page.getByTestId('chat-source').nth(1);
  await missing.getByRole('button', { name: 'Look up abstract', exact: true }).click();
  await expect(missing).toContainText('No abstract was supplied in this provider record.');
  expect(detailCalls).toBe(2);
  await page.reload();
  await first.getByRole('button', { name: 'Read available abstract', exact: true }).click();
  await expect(first.getByText(full, { exact: true })).toBeVisible();
  expect(detailCalls).toBe(2);
  expect(api.submitted).toHaveLength(1);
});

test('abstract lookup failure retains the visible excerpt and does not start another discovery or generation', async ({ page }) => {
  const api = await installExploration(page);
  const partial = { ...FIRST_SOURCE, abstract: 'The saved abstract remains readable.', run_id: 'fixture-run-1', abstract_truncated: true, truncated_fields: ['abstract'] };
  api.legacy.state.snapshot = { ...api.legacy.state.snapshot, status: 'SUCCEEDED', entities: [partial] };
  await page.route('**/api/research-runs/fixture-run-1/papers/**/details', route => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ detail: 'The provider request allowance is exhausted.' }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Exploration message').fill('Authored failure test');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await api.publish({ status: 'SUCCEEDED', sources: [partial] }, 'IDLE');
  const source = page.getByTestId('chat-source');
  await source.getByRole('button', { name: 'Read available abstract', exact: true }).click();
  await expect(source.getByRole('alert')).toContainText('allowance is exhausted');
  await expect(source).toContainText('The saved abstract remains readable.');
  await expect(source.getByRole('button', { name: 'Retry abstract lookup', exact: true })).toBeVisible();
  expect(api.submitted).toHaveLength(1);
  expect(api.legacy.state.starts).toBe(0);
});
