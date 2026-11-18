import { openResultFilter, openSearchInformation } from './search-controls';
import { test, expect, type Page } from '@playwright/test';
import type { Conversation, ChatSource } from '../../src/lib/conversations';
import { FIRST_SOURCE, SECOND_SOURCE, installFixtureApi } from './fixture-api';

const source: ChatSource = { ...FIRST_SOURCE, run_id: 'fixture-run-1' };
function savedConversation(id = 'navigation-search', title = 'Navigation search'): Conversation {
  return { id, title, routing: 'auto', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', revision: 1, cursor: 'nav:1', status: 'IDLE', providers: ['openalex'], filters: {}, turns: [{
    id: `${id}-turn`, action: 'discover', routing: 'auto', message: 'Original research question', providers: ['openalex'], status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', run_ids: ['fixture-run-1'], sources: [source, { ...SECOND_SOURCE, run_id: 'fixture-run-1' }], papers: [{ paper_id: 'doi:10.0000/fixture-1', representative: source, observations: [source], providers: ['openalex'], access: { status: 'not_applicable' } }, { paper_id: 'source:second', representative: { ...SECOND_SOURCE, run_id: 'fixture-run-1' }, observations: [{ ...SECOND_SOURCE, run_id: 'fixture-run-1' }], providers: ['openalex'], access: { status: 'not_applicable' } }], warnings: [], response: 'Two saved resources.', usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' },
  }] };
}
async function installNavigation(page: Page) {
  const api = await installFixtureApi(page);
  api.state.snapshot = { ...api.state.snapshot, question: 'Different provider query', status: 'succeeded', entities: [FIRST_SOURCE, SECOND_SOURCE] };
  const first = savedConversation(), second = savedConversation('second-search', 'Second saved search');
  let posts = 0;
  await page.route('**/api/config', route => route.fulfill({ json: { generation_enabled: false, generation: { enabled: false }, retrieval: { enabled: true, ready: true } } }));
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') { posts++; return route.fulfill({ status: 409, json: { detail: 'This acceptance flow must be read-only.' } }); }
    if (path === '/api/conversations') return route.fulfill({ json: { conversations: [first, second] } });
    return route.fulfill({ json: path.includes('second-search') ? second : first });
  });
  return { api, first, second, get posts() { return posts; } };
}

test('Search survives chat source inspection and returns with its draft and per-search filter', async ({ page }) => {
  const state = await installNavigation(page); await page.goto('/app?search=navigation-search');
  await expect(page.getByTestId('search-result-card')).toHaveCount(2);
  await page.getByLabel('Research question', { exact: true }).fill('Unsent draft to keep');
  await (await openResultFilter(page)).fill('responsible');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click();
  await expect(page.getByTestId('chat-source').first()).toBeVisible();
  await page.getByTestId('chat-source').first().getByRole('button', { name: /^Open .* in workspace$/ }).click();
  await expect(page.getByTestId('source-inspection-scope')).toBeVisible();
  await page.getByRole('button', { name: 'Back to reviewed results', exact: true }).click();
  await expect(page.getByLabel('Exploration message')).toBeVisible();
  await page.getByRole('button', { name: 'Search workspace', exact: true }).click();
  await expect(page).toHaveURL(/search=navigation-search/);
  await expect(page.getByRole('tab', { name: /^Papers/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Videos/ })).toBeVisible();
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('Unsent draft to keep');
  await expect((await openResultFilter(page))).toHaveValue('responsible');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  expect(state.posts).toBe(0); expect(state.api.state.starts).toBe(0);
});

test('filters survive saved views and history without leaking into another search', async ({ page }) => {
  const state = await installNavigation(page); await page.goto('/app?search=navigation-search');
  await expect(page.getByTestId('search-result-card')).toHaveCount(2);
  await (await openResultFilter(page)).fill('responsible');
  await page.getByRole('button', { name: /^Saved shortlist/ }).click();
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect((await openResultFilter(page))).toHaveValue('responsible');
  await page.getByRole('button', { name: /^Research notes/ }).click();
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect((await openResultFilter(page))).toHaveValue('responsible');
  await page.getByRole('complementary', { name: 'Workspace navigation', exact: true }).getByRole('button', { name: 'Second saved search', exact: true }).click();
  await expect((await openResultFilter(page))).toHaveValue('');
  await expect(page.getByTestId('search-result-card')).toHaveCount(2);
  await page.getByRole('complementary', { name: 'Workspace navigation', exact: true }).getByRole('button', { name: 'Navigation search', exact: true }).click();
  await expect((await openResultFilter(page))).toHaveValue('responsible');
  await page.getByRole('button', { name: 'New research', exact: true }).click();
  await expect(page.getByTestId('search-result-card')).toHaveCount(0);
  expect(state.posts).toBe(0);
});

test('a delayed legacy run cannot resurrect after New research', async ({ page }) => {
  const state = await installNavigation(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/research-runs/fixture-run-1/snapshot', async route => { await pending; await route.fulfill({ json: state.api.state.snapshot }); });
  await page.goto('/app?run=fixture-run-1');
  await expect(page.getByText('Opening saved research…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New research', exact: true }).click();
  const response = page.waitForResponse('**/api/research-runs/fixture-run-1/snapshot'); release(); await response;
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('run-progress')).toHaveCount(0);
  await expect(page.getByText('Opening saved research…', { exact: true })).toHaveCount(0);
  await expect(page).not.toHaveURL(/run=/);
  expect(state.posts).toBe(0);
});

test('slow history does not block readiness or erase the current recent search', async ({ page }) => {
  const state = await installNavigation(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/conversations', async route => { await pending; await route.fulfill({ json: { conversations: [] } }); });
  await page.goto('/app?search=navigation-search');
  await expect(page.getByTestId('search-result-card')).toHaveCount(2);
  await expect(page.getByLabel('Research question', { exact: true })).toBeEnabled();
  await page.getByLabel('Research question', { exact: true }).fill('Draft while history is pending');
  const response = page.waitForResponse('**/api/conversations'); release(); await response;
  await expect(page.getByRole('complementary', { name: 'Workspace navigation', exact: true }).getByRole('button', { name: 'Navigation search', exact: true })).toBeVisible();
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('Draft while history is pending');
  expect(state.posts).toBe(0);
});

for (const phase of ['create', 'send'] as const) test(`New research fences a late ${phase} response without replay or UI resurrection`, async ({ page }) => {
  const state = await installNavigation(page);
  let release!: () => void, arrive!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; }); const arrived = new Promise<void>(resolve => { arrive = resolve; });
  let creates = 0, sends = 0;
  await page.route('**/api/conversations', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { conversations: [] } });
    creates++; if (phase === 'create') { arrive(); await pending; }
    await route.fulfill({ status: 201, json: { ...state.first, turns: [] } });
  });
  await page.route('**/api/conversations/navigation-search/turns', async route => {
    sends++; if (phase === 'send') { arrive(); await pending; }
    await route.fulfill({ status: 202, json: { ...state.first, status: 'RUNNING' } });
  });
  await page.goto('/app');
  await page.getByLabel('Research question', { exact: true }).fill('The search I am leaving');
  await page.getByRole('button', { name: 'Search', exact: true }).click(); await arrived;
  await page.getByRole('button', { name: 'New research', exact: true }).click();
  await page.getByLabel('Research question', { exact: true }).fill('My new draft');
  const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === (phase === 'create' ? '/api/conversations' : '/api/conversations/navigation-search/turns'));
  release(); await response;
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('My new draft');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await expect(page.getByTestId('search-result-card')).toHaveCount(0);
  await expect(page).not.toHaveURL(/search=/);
  expect(creates).toBe(1); expect(sends).toBe(phase === 'send' ? 1 : 0);
});
