import { test, expect, type Page } from '@playwright/test';
import type { Snapshot } from '../../src/lib/api';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const first: ChatSource = { ...FIRST_SOURCE, run_id: 'shared-run', title: 'First cached paper', abstract: 'Saved first abstract.' };
const second: ChatSource = { ...first, source_ref: 'openalex:cached-2', record_id: 'cached-2', title: 'Second cached paper', doi: null, abstract: 'Saved second abstract.' };
const third: ChatSource = { ...first, source_ref: 'openalex:cached-3', record_id: 'cached-3', title: 'New progressive paper', doi: null };
const savedSnapshot = (entities = [first, second], revision = 1): Snapshot => ({ ...initialSnapshot(), id: first.run_id, status: 'succeeded', revision, cursor: `shared:${revision}`, entities });
const savedConversation = (sources = [first, second], revision = 1): Conversation => ({
  id: 'performance-search', title: 'Saved performance research', routing: 'auto', status: 'IDLE', revision, cursor: `performance:${revision}`,
  created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: ['openalex'], filters: {},
  turns: [{ id: 'performance-turn', action: 'discover', routing: 'auto', message: 'How do saved research previews load?', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['openalex'], run_ids: [first.run_id], sources,
    papers: sources.map(source => ({ paper_id: source.source_ref, representative: source, providers: [source.provider], observations: [source], access: { status: 'not_requested' } })),
    response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' } }],
});
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const panel = (page: Page) => page.getByRole('complementary', { name: 'Source details', exact: true });
const cards = (page: Page) => page.getByTestId('search-result-card');
const publish = (page: Page, snapshot: Snapshot | Conversation) => page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), snapshot);

async function setup(page: Page, options: { conversationGate?: Promise<void>; snapshotGate?: Promise<void> } = {}) {
  await installFixtureApi(page);
  const state = { snapshot: savedSnapshot(), conversation: savedConversation(), historyReads: 0, snapshotReads: 0, writes: 0, runListUrls: [] as string[] };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/research-runs?*', route => { state.runListUrls.push(route.request().url()); return route.fulfill({ json: { runs: [] } }); });
  await page.route(/\/api\/conversations(?:\/[^/?]+)?$/, async route => {
    expect(route.request().method()).toBe('GET');
    if (new URL(route.request().url()).pathname === '/api/conversations') { state.historyReads++; return route.fulfill({ json: { conversations: [state.conversation] } }); }
    await options.conversationGate;
    return route.fulfill({ json: state.conversation });
  });
  await page.route('**/api/research-runs/shared-run/snapshot', async route => {
    expect(route.request().method()).toBe('GET'); state.snapshotReads++;
    const captured = state.snapshot;
    await options.snapshotGate;
    return route.fulfill({ json: captured });
  });
  await page.route('**/api/research-runs/shared-run/papers/*/details', route => {
    expect(route.request().method()).toBe('POST'); state.writes++;
    state.snapshot = { ...savedSnapshot([first, { ...second, abstract: 'Refreshed second abstract.', eligible: false, filter_warnings: ['Updated saved eligibility.'], version: 2 }], 2), selections: { [second.source_ref]: { state: 'excluded', reason: 'Updated saved decision.', source_version: 2 } } };
    return route.fulfill({ json: state.snapshot });
  });
  return state;
}

test('initial Papers loading shows a skeleton and requests history once with compact recent runs', async ({ page }) => {
  const held = gate(), state = await setup(page, { conversationGate: held.promise });
  await page.goto('/app?search=performance-search');
  await expect(page.getByTestId('search-results-skeleton')).toBeVisible();
  await expect(page.getByTestId('search-results')).toContainText('Opening saved results');
  await expect(page.getByTestId('search-empty-paper')).toHaveCount(0);
  held.release();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByTestId('search-results-skeleton')).toHaveCount(0);
  expect(state.historyReads).toBe(1);
  expect(state.runListUrls).toHaveLength(1);
  expect(new URL(state.runListUrls[0]).searchParams.get('summary')).toBe('true');
  expect(new URL(state.runListUrls[0]).searchParams.get('limit')).toBe('12');
  await expect(panel(page).getByRole('heading', { name: first.title!, exact: true })).toBeVisible();
  expect(state.snapshotReads).toBe(1); expect(state.writes).toBe(0);
});

test('switching saved paper rows reuses one run snapshot without starting provider work', async ({ page }) => {
  const state = await setup(page); await page.goto('/app?search=performance-search');
  await cards(page).first().focus();
  await expect(panel(page).getByRole('heading', { name: first.title!, exact: true })).toHaveCount(1);
  await panel(page).getByRole('tab', { name: 'Metadata', exact: true }).click();
  await cards(page).nth(1).focus();
  await expect(panel(page).getByRole('heading', { name: second.title!, exact: true })).toHaveCount(1);
  await expect(panel(page).getByRole('tab', { name: 'Metadata', exact: true })).toHaveAttribute('aria-selected', 'true');
  await cards(page).first().focus();
  await expect(panel(page).getByRole('heading', { name: first.title!, exact: true })).toHaveCount(1);
  expect(state.snapshotReads).toBe(1); expect(state.writes).toBe(0); expect(state.historyReads).toBe(1);
});

test('concurrent same-run preview reads share the request and preserve the latest row intent', async ({ page }) => {
  const held = gate(), state = await setup(page, { snapshotGate: held.promise });
  await page.goto('/app?search=performance-search');
  await cards(page).first().focus();
  await expect(page.getByTestId('source-preview-loading')).toContainText('Opening saved paper details');
  await cards(page).nth(1).focus();
  await expect(cards(page).nth(1).getByRole('button', { name: 'Preview details', exact: true })).toHaveAttribute('aria-busy', 'true');
  expect(state.snapshotReads).toBe(1);
  held.release();
  await expect(panel(page).getByRole('heading', { name: second.title!, exact: true })).toHaveCount(1);
  await expect(panel(page).getByRole('heading', { name: first.title!, exact: true })).toHaveCount(0);
  await expect(page.getByTestId('source-preview-loading')).toHaveCount(0);
  await expect(cards(page).nth(1)).toBeFocused();
  expect(state.snapshotReads).toBe(1); expect(state.writes).toBe(0);
});

test('newer SSE revisions seed saved previews and older replay cannot overwrite them', async ({ page }) => {
  const state = await setup(page); await page.goto('/app?search=performance-search'); await cards(page).first().focus();
  await expect(panel(page).getByRole('heading', { name: first.title!, exact: true })).toHaveCount(1);
  const newer = savedSnapshot([{ ...first, abstract: 'Newest streamed abstract.', version: 3 }, second], 3);
  await publish(page, newer);
  await expect(panel(page)).toContainText('Newest streamed abstract.');
  await publish(page, savedSnapshot());
  await page.evaluate(snapshot => window.dispatchEvent(new CustomEvent('scout:saved-run-updated', { detail: { runId: snapshot.id, snapshot } })), savedSnapshot());
  await cards(page).nth(1).focus(); await expect(panel(page).getByRole('heading', { name: second.title!, exact: true })).toHaveCount(1);
  await cards(page).first().focus(); await expect(panel(page)).toContainText('Newest streamed abstract.');
  expect(state.snapshotReads).toBe(1); expect(state.writes).toBe(0);
});

test('a saved mutation arriving during an older read wins and explicit details update cache eligibility and decisions', async ({ page }) => {
  const held = gate(), state = await setup(page, { snapshotGate: held.promise });
  await page.goto('/app?search=performance-search'); await cards(page).first().focus();
  await expect(page.getByTestId('source-preview-loading')).toBeVisible();
  const newer = savedSnapshot([{ ...first, abstract: 'Mutation response abstract.', version: 2 }, second], 2);
  await page.evaluate(snapshot => window.dispatchEvent(new CustomEvent('scout:saved-run-updated', { detail: { runId: snapshot.id, snapshot } })), newer);
  held.release();
  await expect(panel(page)).toContainText('Mutation response abstract.');
  await cards(page).nth(1).focus(); await expect(panel(page).getByRole('heading', { name: second.title!, exact: true })).toHaveCount(1);
  await panel(page).getByRole('tab', { name: 'Metadata', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Get available details', exact: true }).click();
  await expect.poll(() => state.writes).toBe(1);
  await expect(panel(page)).toContainText('Updated saved eligibility.');
  await panel(page).getByRole('tab', { name: 'Your notes', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Exclude', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).getByLabel('Reason', { exact: false })).toHaveValue('Updated saved decision.');
  await cards(page).first().focus(); await expect(panel(page).getByRole('heading', { name: first.title!, exact: true })).toHaveCount(1);
  await cards(page).nth(1).focus(); await expect(panel(page).getByRole('button', { name: 'Exclude', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(state.snapshotReads).toBe(2);
});

test('a new progressive paper refreshes an incomplete cached run once', async ({ page }) => {
  const state = await setup(page); await page.goto('/app?search=performance-search'); await cards(page).first().focus();
  await expect(panel(page).getByRole('heading', { name: first.title!, exact: true })).toHaveCount(1);
  state.snapshot = savedSnapshot([first, second, third], 2);
  await publish(page, savedConversation([first, second, third], 2));
  await expect(cards(page)).toHaveCount(3); await cards(page).nth(2).focus();
  await expect(panel(page).getByRole('heading', { name: third.title!, exact: true })).toHaveCount(1);
  expect(state.snapshotReads).toBe(2); expect(state.writes).toBe(0);
});

test('expired saved previews refresh before showing current eligibility', async ({ page }) => {
  await page.clock.install();
  const state = await setup(page); await page.goto('/app?search=performance-search'); await cards(page).first().focus();
  await expect(panel(page).getByRole('heading', { name: first.title!, exact: true })).toHaveCount(1);
  state.snapshot = savedSnapshot([first, { ...second, eligible: false, filter_warnings: ['Eligibility changed after cache expiry.'], version: 2 }], 2);
  await page.clock.fastForward(16_001);
  await cards(page).nth(1).focus(); await expect(panel(page)).toContainText('Eligibility changed after cache expiry.');
  expect(state.snapshotReads).toBe(2); expect(state.writes).toBe(0);
});
