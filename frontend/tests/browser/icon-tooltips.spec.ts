import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

async function setup(page: Page) {
  await installFixtureApi(page);
  const source: ChatSource = { ...FIRST_SOURCE, run_id: 'tooltip-run' };
  const saved: Conversation = { id: 'tooltip-search', title: 'Tooltip research', routing: 'auto', status: 'IDLE', revision: 1, cursor: 'tooltip:1', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: [], filters: {}, turns: [{ id: 'tooltip-turn', action: 'discover', routing: 'auto', message: 'Research controls', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['openalex'], run_ids: [source.run_id], sources: [source], papers: [{ paper_id: source.source_ref, representative: source, providers: [source.provider], observations: [source], access: { status: 'not_requested' } }], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/tooltip-search', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/tooltip-run/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: source.run_id, status: 'succeeded', entities: [source] } }));
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.goto('/app?search=tooltip-search');
  return { posts, card: page.getByTestId('search-result-card') };
}

test('icon tooltips appear on hover and keyboard focus, describe their trigger and dismiss with Escape', async ({ page }) => {
  const { card, posts } = await setup(page);
  const preview = card.getByRole('button', { name: 'Preview details', exact: true });
  await preview.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(/read|preview|metadata/i);
  await expect(preview).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
  await expect(preview).not.toHaveAttribute('title');
  expect(await tooltip.evaluate(element => !!element.closest('[data-testid="search-result-card"]'))).toBe(false);
  const save = card.getByRole('button', { name: 'Save to project', exact: true });
  await save.focus();
  await expect(tooltip).toHaveCount(1);
  await expect(tooltip).toContainText(/project/i);
  await expect(save).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  expect(posts).toEqual([]);
});

test('provider tooltip remains within a narrow viewport and icon actions retain their click behavior', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const { card, posts } = await setup(page);
  const provider = card.getByRole('button', { name: 'Provider observations (1)', exact: true });
  await provider.focus();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(/provider|record|observation/i);
  const bounds = (await tooltip.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  await provider.click();
  await expect(tooltip).toHaveCount(0);
  await expect(card.getByTestId('search-paper-observations')).toBeVisible();
  await expect(provider).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(posts).toEqual([]);
});
