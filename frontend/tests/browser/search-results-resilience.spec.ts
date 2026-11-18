import { openResultFilter, openSearchInformation } from './search-controls';
import { test, expect, type Page } from '@playwright/test';
import type { CanonicalPaper, ChatSource, Conversation, ExplorationTurn } from '../../src/lib/conversations';
import { DISCOVERY_PROVIDERS, type Snapshot } from '../../src/lib/api';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';

const primaryPaper: ChatSource = { ...FIRST_SOURCE, run_id: 'first-run', title: 'First scholarly record', abstract: 'A distinctive-abstract-token improves model context.', doi: null };
const primaryVideo: ChatSource = { ...FIRST_SOURCE, run_id: 'video-run', provider: 'youtube', source_ref: 'youtube:abcdEF_12-3', record_id: 'abcdEF_12-3', resource_type: 'video', title: 'A saved research video', description: 'An available video description.', abstract: null, doi: null };
const relatedPaper: ChatSource = { ...primaryPaper, source_ref: 'openalex:adjacent', title: 'Adjacent scholarly record', relevance: { label: 'partial', reason: 'Adjacent evidence' } };
const relatedVideo: ChatSource = { ...primaryVideo, source_ref: 'youtube:xyzAB_123-4', record_id: 'xyzAB_123-4', title: 'Adjacent research video', relevance: { label: 'partial', reason: 'Adjacent evidence' } };
const canonical = (source: ChatSource): CanonicalPaper => ({ paper_id: source.source_ref, representative: source, observations: [source], providers: [source.provider], access: { status: source.provider === 'youtube' ? 'not_applicable' : 'not_requested' } });
function conversation(id: string, sources: ChatSource[], compact = false): Conversation {
  const turn: ExplorationTurn = { id: `${id}-turn`, message: `${id} research question`, action: 'discover', routing: 'auto', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['openalex', 'youtube'], run_ids: sources.map(s => s.run_id), sources: compact ? [] : sources, papers: compact ? [] : sources.map(canonical), related_sources: id === 'first' ? [relatedPaper, relatedVideo] : [], history_compacted: compact, warnings: [], response: '', usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' } };
  return { id, title: `${id} saved research`, routing: 'auto', created_at: turn.created_at, updated_at: turn.created_at, cursor: `${id}:1`, status: 'IDLE', revision: 1, providers: [], filters: {}, turns: [turn] };
}
async function install(page: Page, compact = false) {
  const legacy = await installFixtureApi(page);
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" />' }));
  const secondSource: ChatSource = { ...primaryPaper, run_id: 'second-run', source_ref: 'openalex:second', title: 'Second scholarly record' };
  const first = conversation('first', [primaryPaper, primaryVideo], compact), second = conversation('second', [secondSource]);
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: DISCOVERY_PROVIDERS.map(id => ({ id, status: 'ready', access_configured: id !== 'youtube', mode: 'fixture' })) } }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation_enabled: false, retrieval: { enabled: true, ready: true } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [first, second] } }));
  await page.route('**/api/conversations/first', route => route.fulfill({ json: first }));
  await page.route('**/api/conversations/second', route => route.fulfill({ json: second }));
  const snapshot = (id: string, source: ChatSource): Snapshot => ({ ...legacy.state.snapshot, id, status: 'succeeded', entities: [source] });
  await page.route('**/api/research-runs/second-run/snapshot', route => route.fulfill({ json: snapshot('second-run', secondSource) }));
  return { legacy, snapshot, first, second };
}

test('local filtering includes available abstracts and distinguishes hidden videos from missing access', async ({ page }) => {
  await install(page); const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.goto('/app?search=first'); await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await (await openResultFilter(page)).fill('distinctive-abstract-token');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await expect(page.getByTestId('search-empty-video')).toContainText('No matching videos for this filter');
  await expect(page.getByTestId('search-empty-video')).not.toContainText('needs a YouTube connection');
  await expect(page.getByTestId('search-filter-status')).toContainText('distinctive-abstract-token');
  await expect(page.getByTestId('search-result-card')).toHaveCount(0);
  await expect(page.getByTestId('search-empty-video')).toContainText('1 videos are available');
  await page.getByRole('button', { name: 'Clear result filter', exact: true }).click();
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await expect(page.getByTestId('search-result-card')).toHaveAttribute('data-resource-kind', 'video');
  expect(posts).toEqual([]);
});

test('a project query reopens its exact earlier turn and keeps that query on reload', async ({ page }) => {
  const api = await install(page);
  const older: ChatSource = { ...primaryPaper, title: 'Earlier query evidence' };
  const newer: ChatSource = { ...primaryPaper, source_ref: 'openalex:newer', title: 'Later query evidence' };
  api.first.turns = [
    { ...api.first.turns[0], id: 'older-turn', message: 'Saved older query', sources: [older], papers: [canonical(older)] },
    { ...api.first.turns[0], id: 'newer-turn', message: 'Newer question', sources: [newer], papers: [canonical(newer)] },
  ];
  await page.route('**/api/projects', route => route.fulfill({ json: { projects: [{ id: 'query-project', name: 'Query provenance', description: '', revision: 1, created_at: api.first.created_at, updated_at: api.first.updated_at, concepts: [], resources: [], queries: [{ id: 'query-old', conversation_id: 'first', turn_id: 'older-turn', run_id: null, question: 'Saved older query', title: 'Saved older query', created_at: api.first.created_at, concept_ids: [] }] }] } }));
  await page.goto('/app?search=first');
  await expect(page.getByTestId('search-result-card')).toContainText('Later query evidence');
  await page.getByRole('button', { name: 'Manage research projects', exact: true }).click();
  await page.getByRole('dialog', { name: 'Research projects', exact: true }).getByRole('button', { name: /Saved older query/ }).click();
  await expect(page.getByTestId('search-result-card')).toContainText('Earlier query evidence');
  expect(new URL(page.url()).searchParams.get('turn')).toBe('older-turn');
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('Saved older query');
  await page.reload();
  await expect(page.getByTestId('search-result-card')).toContainText('Earlier query evidence');
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('Saved older query');
});

test('related evidence stays in the current resource tab and outside primary counts', async ({ page }) => {
  await install(page); await page.goto('/app?search=first'); await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await page.locator('.search-related-results > summary').click();
  await expect(page.getByTestId('search-related-card')).toHaveCount(1); await expect(page.getByTestId('search-related-card')).toContainText('Adjacent scholarly record');
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await expect(page.getByRole('tab', { name: /^Videos/ })).toHaveText(/Videos\s*1/);
  await expect(page.getByTestId('search-result-card').getByRole('link', { name: 'Open on YouTube', exact: true })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdEF_12-3');
  await expect(page.getByTestId('search-related-card')).toHaveCount(1); await expect(page.getByTestId('search-related-card')).toContainText('Adjacent research video');
  await expect(page.getByTestId('search-related-card')).toHaveAttribute('data-resource-kind', 'video');
  await expect(page.getByText('Adjacent scholarly record', { exact: true })).toHaveCount(0);
});

test('an obsolete preview failure cannot contaminate or block the next search preview', async ({ page }) => {
  await install(page); let release!: () => void, started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/research-runs/first-run/snapshot', async route => { started(); await pending; await route.fulfill({ status: 503, json: { detail: 'Obsolete preview failure' } }); });
  await page.goto('/app?search=first'); await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click(); await arrived;
  await page.getByRole('complementary', { name: 'Workspace navigation', exact: true }).getByRole('button', { name: 'second saved research', exact: true }).click();
  await expect(page.getByTestId('search-result-card')).toContainText('Second scholarly record');
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click(); await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toBeVisible();
  const response = page.waitForResponse('**/api/research-runs/first-run/snapshot'); release(); await response;
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toBeVisible(); await expect(page.getByText('Obsolete preview failure', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close source details', exact: true }).click(); await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
});

test('an obsolete compact-history failure does not replace the current results with an error', async ({ page }) => {
  await install(page, true); let release!: () => void, started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/conversations/first/turns/first-turn', async route => { started(); await pending; await route.fulfill({ status: 503, json: { detail: 'Obsolete saved-history failure' } }); });
  await page.goto('/app?search=first'); await page.getByRole('button', { name: 'Open saved results', exact: true }).click(); await arrived;
  await page.getByRole('complementary', { name: 'Workspace navigation', exact: true }).getByRole('button', { name: 'second saved research', exact: true }).click(); await expect(page.getByTestId('search-result-card')).toContainText('Second scholarly record');
  const response = page.waitForResponse('**/api/conversations/first/turns/first-turn'); release(); await response;
  await expect(page.getByText('Obsolete saved-history failure', { exact: false })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
});

test('opening a full running history cannot freeze subsequent compact completion updates', async ({ page }) => {
  const api = await install(page, true);
  api.first.status = 'RUNNING'; api.first.turns[0].status = 'RUNNING';
  api.first.turns[0].saved_result_counts = { sources: 1, papers: 1, related_sources: 0, llm_requests: 0, source_requests: 0, assessments: 0 };
  let full: ExplorationTurn = { ...api.first.turns[0], history_compacted: false, sources: [primaryPaper], papers: [canonical(primaryPaper)] };
  await page.route('**/api/conversations/first/turns/first-turn', route => route.fulfill({ json: full }));
  await page.goto('/app?search=first'); await page.getByRole('button', { name: 'Open saved results', exact: true }).click();
  await expect(page.getByTestId('search-result-card')).toHaveCount(1); await expect(page.getByTestId('search-results')).toHaveAttribute('data-status', 'running');
  api.first.status = 'IDLE'; api.first.revision = 2; api.first.turns[0].status = 'SUCCEEDED';
  const publish = () => page.evaluate(snapshot => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(snapshot), api.first);
  await publish(); await expect(page.getByTestId('search-results')).toHaveAttribute('data-status', 'succeeded');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  const finalSource = { ...primaryPaper, title: 'Completed current scholarly record' };
  full = { ...full, status: 'SUCCEEDED', sources: [finalSource], papers: [canonical(finalSource)] };
  await page.getByRole('button', { name: 'Open saved results', exact: true }).click(); await expect(page.getByTestId('search-result-card')).toContainText('Completed current scholarly record');
  api.first.revision++; await publish(); await expect(page.getByTestId('search-result-card')).toContainText('Completed current scholarly record');
});

test('a delayed full query restore cannot replace a newer streamed completion or its request trace', async ({ page }) => {
  const api = await install(page, true);
  api.first.status = 'RUNNING';
  const oldRequest = { step: 'plan', purpose: 'plan', status: 'prepared', model: 'fixture-routing-model', body: { instructions: 'Stale planner input' } };
  api.first.turns[0] = { ...api.first.turns[0], status: 'RUNNING', agentic: true, saved_result_counts: { sources: 1, papers: 1, related_sources: 0, llm_requests: 1, source_requests: 0, assessments: 0 }, retrieval: { status: 'planning', llm_requests: [{ ...oldRequest, body: { compacted: true }, body_compacted: true }] } };
  const olderFull: ExplorationTurn = { ...api.first.turns[0], history_compacted: false, sources: [primaryPaper], papers: [canonical(primaryPaper)], retrieval: { status: 'planning', llm_requests: [oldRequest] } };
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/conversations/first/turns/first-turn', async route => { started(); await pending; await route.fulfill({ json: olderFull }); });
  const latestSource = { ...primaryPaper, title: 'Newest streamed completion evidence' };
  await page.route('**/api/research-runs/first-run/snapshot', route => route.fulfill({ json: api.snapshot('first-run', latestSource) }));
  const writes: string[] = []; page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
  await page.goto('/app?search=first');
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-connection', 'connected');
  await openSearchInformation(page, 'Query and focus');

  await page.getByRole('tab', { name: 'LLM input', exact: true }).click();
  await page.getByRole('button', { name: 'Open saved query details', exact: true }).click();
  await arrived;
  api.first.status = 'IDLE'; api.first.revision = 2; api.first.cursor = 'first:2';
  api.first.turns[0] = { ...api.first.turns[0], status: 'SUCCEEDED', completed_at: '2026-11-11T12:00:02Z', sources: [latestSource], papers: [canonical(latestSource)], retrieval: { status: 'completed', llm_requests: [{ ...oldRequest, status: 'response_received', body: { compacted: true }, body_compacted: true }] } };
  await page.evaluate(snapshot => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(snapshot), api.first);
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-status', 'succeeded');
  const response = page.waitForResponse('**/api/conversations/first/turns/first-turn'); release(); await response;
  await expect(page.getByRole('button', { name: 'Open saved query details', exact: true })).toBeEnabled();
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-status', 'succeeded');
  await expect(page.getByTestId('performance-status')).toHaveText('Search complete');
  await expect(page.getByTestId('search-result-card')).toContainText('Newest streamed completion evidence');
  await expect(page.getByTestId('saved-llm-request-body')).toHaveCount(0);
  await expect(page.getByText('Stale planner input', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  expect(writes).toEqual([]);
});
