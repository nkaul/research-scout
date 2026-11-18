import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation, ExplorationTurn } from '../../src/lib/conversations';
import { accessProgress, originalSearchDuration, performanceStatus, providerProgress } from '../../src/lib/search-performance';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';
import { openSearchInformation } from './search-controls';

function held() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
const first: ChatSource = { ...FIRST_SOURCE, run_id: 'performance-a', title: 'First performance evidence record' };
const second: ChatSource = { ...FIRST_SOURCE, run_id: 'performance-b', source_ref: 'openalex:performance-b', record_id: 'performance-b', title: 'Second performance evidence record', doi: null };
function turn(update: Partial<ExplorationTurn> = {}): ExplorationTurn {
  return { id: 'performance-turn', message: 'Measure research progress', action: 'discover', routing: 'auto', status: 'SUCCEEDED', created_at: '2026-11-14T00:00:00Z', completed_at: '2026-11-14T00:00:01.750Z', providers: ['openalex', 'crossref'], run_ids: ['performance-a', 'performance-b'], sources: [first, second], papers: [first, second].map(source => ({ paper_id: source.source_ref, representative: source, observations: [source], providers: [source.provider], access: { status: 'not_requested' } })), response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' }, ...update };
}

test('provider completion requires all recorded branches; results alone never imply provider completion', () => {
  const rows = providerProgress(turn({ status: 'RUNNING', completed_at: undefined, activity: [
    { provider: 'openalex', operation: 'lexical', status: 'SUCCEEDED', attempts: 1, source_count: 3 },
    { provider: 'openalex', operation: 'semantic', status: 'RUNNING', attempts: 1, source_count: 3 },
  ] }));
  expect(rows[0]).toMatchObject({ provider: 'openalex', tone: 'active', records: 3, attempts: 2 });
  expect(rows[1]).toMatchObject({ provider: 'crossref', tone: 'unknown', records: null, attempts: null });
  expect(providerProgress(turn())[0]).toMatchObject({ label: 'Not recorded', tone: 'unknown', records: null });
});

test('missing original end time is unavailable and incomplete DOI access is separate from completed discovery', () => {
  expect(originalSearchDuration(turn({ completed_at: undefined }), Date.now())).toBeNull();
  expect(originalSearchDuration(turn())).toBe(1750);
  const accessOnly = turn({ status: 'PARTIAL', activity: [
    { provider: 'openalex', operation: 'hybrid_search', status: 'succeeded', attempts: 2, source_count: 2 },
    { provider: 'crossref', operation: 'hybrid_search', status: 'empty', attempts: 1, source_count: 0 },
    { provider: 'unpaywall', operation: 'access', status: 'failed', attempts: 1, source_count: 0, error_code: 'NOT_FOUND' },
  ] });
  expect(performanceStatus(accessOnly)).toMatchObject({ label: 'Discovery complete · access incomplete', tone: 'success' });
  expect(accessProgress(accessOnly)).toMatchObject({ total: 1, unavailable: 1, active: 0 });
  expect(accessProgress(turn({ activity: [], papers: [{ paper_id: 'queued', representative: first, observations: [first], providers: ['openalex'], access: { status: 'pending' } }] }))).toMatchObject({ total: 1, active: 1 });
});

async function install(page: Page, { savedGate = Promise.resolve(), metadataGate = Promise.resolve(), initialTurn = turn(), startEmpty = false }: { savedGate?: Promise<void>; metadataGate?: Promise<void>; initialTurn?: ExplorationTurn; startEmpty?: boolean } = {}) {
  await installFixtureApi(page);
  // Scripted planner readiness; application requests remain intercepted.
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: true } } }));
  let saved: Conversation = { id: 'performance-search', title: 'Performance search', routing: 'auto', status: !startEmpty && initialTurn.status === 'RUNNING' ? 'RUNNING' : 'IDLE', revision: 1, cursor: 'performance:1', created_at: initialTurn.created_at, updated_at: initialTurn.completed_at || initialTurn.created_at, providers: ['openalex', 'crossref'], filters: {}, turns: startEmpty ? [] : [initialTurn] };
  let cancels = 0;
  const reads: string[] = [], writes: string[] = [];
  page.on('request', request => { if (!new URL(request.url()).pathname.startsWith('/api/')) return; if (request.method() === 'GET') reads.push(request.url()); else writes.push(request.url()); });
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: ['openalex', 'crossref'].map(id => ({ id, mode: 'fixture', status: 'ready', access_configured: true })) } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: route.request().method() === 'GET' ? { conversations: saved.turns.length ? [saved] : [] } : saved }));
  await page.route('**/api/conversations/performance-search/turns', async route => { saved = { ...saved, status: 'RUNNING', revision: saved.revision + 1, turns: [{ ...initialTurn, message: route.request().postDataJSON().message }] }; await route.fulfill({ status: 202, json: saved }); });
  await page.route('**/api/conversations/performance-search', async route => { await savedGate; await route.fulfill({ json: saved }); });
  await page.route('**/api/conversations/performance-search/turns/performance-turn/cancel', async route => { cancels++; saved = { ...saved, status: 'IDLE', revision: saved.revision + 1, turns: saved.turns.map(item => ({ ...item, status: 'CANCELLED', completed_at: new Date().toISOString() })) }; await route.fulfill({ json: saved }); });
  await page.route('**/api/research-runs/performance-a/snapshot', async route => { await metadataGate; await route.fulfill({ json: { ...initialSnapshot(), id: 'performance-a', status: 'succeeded', entities: [first] } }); });
  await page.route('**/api/research-runs/performance-b/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: 'performance-b', status: 'succeeded', entities: [second] } }));
  return { reads, writes, get cancels() { return cancels; }, async publish(update: Partial<ExplorationTurn>, status: Conversation['status'] = 'RUNNING') { saved = { ...saved, status, revision: saved.revision + 1, cursor: `performance:${saved.revision + 1}`, turns: saved.turns.map(item => ({ ...item, ...update })) }; await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), saved); } };
}

test('saved history shows its original duration, leaves unmeasured first evidence unavailable and opening details adds no requests', async ({ page }) => {
  const api = await install(page);
  await page.goto('/app?search=performance-search');
  const bar = await openSearchInformation(page, 'Timing and usage');
  await expect(bar.getByTestId('performance-retrieval')).toContainText('1.75 s');
  await expect(bar.getByTestId('performance-first')).toContainText('—');
  await expect(bar.getByTestId('performance-reader')).toHaveAttribute('data-loading', 'false');
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByRole('heading', { name: first.title!, exact: true })).toBeVisible();
  const readCount = api.reads.length;
  await openSearchInformation(page, 'Timing and usage');
  await expect(bar).toContainText('Not measured for this view.');
  await expect(bar.getByTestId('timeline-unavailable')).toContainText('Detailed stage timing was not recorded');
  await openSearchInformation(page, 'Sources and coverage');
  await expect(bar.getByText('Record count not recorded', { exact: true })).toHaveCount(2);
  await openSearchInformation(page, 'Timing and usage');
  await expect(bar).not.toContainText('420 ms');
  expect(api.reads).toHaveLength(readCount); expect(api.writes).toEqual([]);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth), { message: `No horizontal overflow at ${width}px` }).toBe(false).catch(async error => {
      const outside = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].map(element => { const bounds = element.getBoundingClientRect(); return { tag: element.tagName, className: element.className, width: bounds.width, right: bounds.right }; }).filter(element => element.width > 0 && element.right > innerWidth + 1).slice(0, 20));
      await test.info().attach(`overflow-${width}.json`, { body: JSON.stringify(outside, null, 2), contentType: 'application/json' });
      throw error;
    });
  }
});

test('slow saved and selected-source reads have independent clocks and a late older reader cannot replace the current clock', async ({ page }) => {
  await page.clock.install();
  const savedGate = held(), metadataGate = held();
  const api = await install(page, { savedGate: savedGate.promise, metadataGate: metadataGate.promise });
  await page.goto('/app?search=performance-search');
  const bar = await openSearchInformation(page, 'Timing and usage'), savedClock = bar.getByTestId('performance-saved'), readerClock = bar.getByTestId('performance-reader');
  await expect(savedClock).toHaveAttribute('data-loading', 'true');
  const savedBefore = Number(await savedClock.getAttribute('data-duration-ms'));
  await page.clock.runFor(1250);
  await expect.poll(async () => Number(await savedClock.getAttribute('data-duration-ms'))).toBeGreaterThanOrEqual(savedBefore + 1000);
  await expect(savedClock).toContainText('loading');
  savedGate.release(); await expect(page.getByTestId('performance-status')).toHaveText('Search complete');
  await openSearchInformation(page, 'Timing and usage');
  await expect(savedClock).toHaveAttribute('data-loading', 'false');
  await expect(bar.getByTestId('performance-retrieval')).toContainText('1.75 s');
  await expect(readerClock).toHaveAttribute('data-loading', 'true');
  const readerBefore = Number(await readerClock.getAttribute('data-duration-ms'));
  await page.clock.runFor(450);
  await expect.poll(async () => Number(await readerClock.getAttribute('data-duration-ms'))).toBeGreaterThanOrEqual(readerBefore + 250);
  await expect(readerClock).toContainText('loading');
  await page.getByTestId('search-result-card').nth(1).focus();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByRole('heading', { name: second.title!, exact: true })).toBeVisible();
  await expect(readerClock).toHaveAttribute('data-loading', 'false');
  const duration = await readerClock.getAttribute('data-duration-ms');
  const response = page.waitForResponse('**/api/research-runs/performance-a/snapshot'); metadataGate.release(); await response;
  await page.clock.fastForward(125_000);
  await expect(readerClock).toHaveAttribute('data-duration-ms', duration!);
  await expect(bar.getByTestId('performance-retrieval')).toContainText('1.75 s');
  await expect(bar.getByTestId('performance-first')).toContainText('—'); expect(api.writes).toEqual([]);
});

test('current-view first arrival and source progress update without premature completion; Stop retains available evidence', async ({ page }) => {
  await page.clock.install();
  const running = turn({ status: 'RUNNING', created_at: new Date().toISOString(), completed_at: undefined, sources: [], papers: [], activity: [{ provider: 'openalex', operation: 'hybrid_search', status: 'running', attempts: 1, source_count: 0 }] });
  const api = await install(page, { initialTurn: running, startEmpty: true });
  await page.goto('/app');
  await page.getByLabel('Research question', { exact: true }).fill('Measure research progress');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForURL(/search=performance-search/);
  const bar = await openSearchInformation(page, 'Timing and usage');
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-connection', 'connected');
  await expect(bar.getByTestId('performance-first')).toContainText('—');
  await page.clock.runFor(650);
  await api.publish({ sources: [first], papers: [{ paper_id: first.source_ref, representative: first, observations: [first], providers: ['openalex'], access: { status: 'queued' } }], activity: [
    { provider: 'openalex', operation: 'lexical', status: 'succeeded', attempts: 1, source_count: 1 },
    { provider: 'openalex', operation: 'semantic', status: 'running', attempts: 1, source_count: 1 },
  ] });
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await expect(bar.getByTestId('performance-first')).toHaveAttribute('data-duration-ms', /\d+/);
  await openSearchInformation(page, 'Sources and coverage');
  await expect(bar.getByText('OpenAlex · In progress', { exact: true })).toBeVisible();
  await expect(bar.getByText('Crossref · Waiting for status', { exact: true })).toBeVisible();
  await expect(bar.getByText(/^Unpaywall: 1 lookup/)).toContainText('0 usable access results · 1 pending');
  await page.getByTestId('search-information-controls').getByRole('button', { name: 'Stop search', exact: true }).click();
  await expect(page.getByTestId('performance-status')).toHaveText('Search stopped');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  expect(api.cancels).toBe(1); expect(api.writes).toHaveLength(3); expect(api.writes.at(-1)).toMatch(/\/cancel$/);
});
