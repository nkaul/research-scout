import { test, expect, type Page } from '@playwright/test';
import type { Conversation, ExplorationTurn, ChatSource } from '../../src/lib/conversations';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';

const source: ChatSource = { ...FIRST_SOURCE, run_id: 'loading-run' };
function saved(status: ExplorationTurn['status'], records: ChatSource[] = [], revision = 1): Conversation {
  return { id: 'progressive', title: 'Progressive search', routing: 'auto', status: status === 'RUNNING' ? 'RUNNING' : 'IDLE', revision, cursor: `progressive:${revision}`, created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: [], filters: {}, turns: [{ id: 'loading-turn', message: 'Context retrieval', routing: 'auto', action: 'discover', status, created_at: '2026-11-11T12:00:00Z', providers: ['openalex', 'youtube'], run_ids: records.length ? ['loading-run'] : [], sources: records, papers: records.map(record => ({ paper_id: record.source_ref, representative: record, observations: [record], providers: [record.provider], access: { status: 'not_requested' } })), response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
}
async function publish(page: Page, snapshot: Conversation) {
  await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), snapshot);
}

test('skeletons cover initial and incremental loading without hiding usable results', async ({ page }) => {
  await installFixtureApi(page); const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [] } }));
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/conversations/progressive', async route => { await wait; await route.fulfill({ json: saved('RUNNING') }); });
  await page.goto('/app?search=progressive');
  await expect(page.getByTestId('search-results-skeleton')).toBeVisible();
  await expect(page.getByTestId('search-empty-paper')).toHaveCount(0);
  release();
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-status', 'running');
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-connection', 'connected');
  await publish(page, saved('RUNNING', [source], 2));
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await expect(page.getByTestId('search-results-skeleton')).toBeVisible();
  await expect(page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await expect(page.getByTestId('search-results-skeleton')).toHaveAttribute('data-category', 'video');
  await expect(page.getByTestId('search-empty-video')).toHaveCount(0);
  await publish(page, saved('SUCCEEDED', [source], 3));
  await expect(page.getByTestId('search-results-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('search-empty-video')).toBeVisible();
  await page.getByRole('tab', { name: /^Papers/ }).click();
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  expect(posts).toEqual([]);
});

test('a failed saved read ends its skeleton and exposes an actionable error', async ({ page }) => {
  await installFixtureApi(page);
  await page.route('**/api/conversations/progressive', route => route.fulfill({ status: 503, json: { detail: 'Saved state is temporarily unavailable' } }));
  await page.goto('/app?search=progressive');
  await expect(page.getByTestId('search-results').getByRole('alert')).toContainText('Saved search could not be opened');
  await expect(page.getByTestId('search-results-skeleton')).toHaveCount(0);
  await page.getByLabel('Research question', { exact: true }).fill('Retry with a new research question');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
});
