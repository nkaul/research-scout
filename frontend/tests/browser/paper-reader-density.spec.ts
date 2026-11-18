import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

async function setup(page: Page, missingDoi = false) {
  const api = await installFixtureApi(page);
  const source: ChatSource = { ...FIRST_SOURCE, run_id: 'reader-density-run', doi: missingDoi ? null : FIRST_SOURCE.doi, provider_identifiers: { openalex_id: 'W123456' } };
  api.state.snapshot = { ...initialSnapshot(), id: source.run_id, status: 'succeeded', entities: [source], revision: 1 };
  const saved: Conversation = { id: 'reader-density', title: 'Reader density research', routing: 'auto', status: 'IDLE', revision: 1, cursor: 'reader:1', created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', providers: ['openalex'], filters: {}, turns: [{ id: 'reader-turn', action: 'discover', routing: 'auto', message: 'Reader density research', status: 'SUCCEEDED', created_at: '2026-11-12T12:00:00Z', providers: ['openalex'], run_ids: [source.run_id], sources: [source], papers: [{ paper_id: source.source_ref, representative: source, providers: ['openalex'], observations: [source], access: { status: 'not_requested' } }], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/reader-density', route => route.fulfill({ json: saved }));
  await page.goto('/app?search=reader-density');
  await page.getByTestId('search-result-card').first().getByRole('button', { name: 'Preview details', exact: true }).click();
  return { api, source, panel: page.getByRole('complementary', { name: 'Source details', exact: true }) };
}

test('reader keeps a small visible title, honest author context and compact metadata with an explained DOI gate', async ({ page }) => {
  const { api, source, panel } = await setup(page);
  const heading = panel.getByRole('heading', { name: source.title!, exact: true });
  await expect(heading).toBeVisible();
  expect(await heading.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(14);
  expect(await heading.evaluate(el => Number.parseInt(getComputedStyle(el).fontWeight, 10))).toBeGreaterThanOrEqual(600);
  await expect(panel.getByText(source.authors.join(', '), { exact: true })).toBeVisible();
  await expect(panel.locator('header p').filter({ hasText: source.venue! })).toBeVisible();
  expect(api.state.details).toBe(0); expect(api.state.checks).toBe(0);
  await panel.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(heading).toBeVisible();
  await expect(panel.locator('.record-properties').first()).toContainText(source.doi!);
  await expect(panel.getByText('Record identifiers & history', { exact: true })).toHaveCount(0);
  await expect(panel.getByText(source.record_id, { exact: true })).toBeVisible();
  await expect(panel.getByText('W123456', { exact: true })).toBeVisible();
  const check = panel.getByRole('button', { name: 'Check DOI metadata', exact: true });
  await expect(check).toBeDisabled();
  await expect(check).toHaveAttribute('aria-describedby', /doi-check-help/);
  await expect(panel.getByText('Include this source in your shortlist before checking DOI metadata.', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Add to run shortlist', exact: true }).click();
  await expect(check).toBeEnabled();
  expect(api.state.checks).toBe(0); expect(api.state.details).toBe(0);
  await check.click();
  await expect(panel.getByText('title differs', { exact: true })).toBeVisible();
  expect(api.state.checks).toBe(1);
  await page.setViewportSize({ width: 320, height: 950 });
  await expect.poll(() => panel.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
});

test('notes distinguish the run shortlist from project saving and missing DOIs remain explained', async ({ page }) => {
  const { api, panel } = await setup(page, true);
  await panel.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Check DOI metadata', exact: true })).toBeDisabled();
  await expect(panel.getByText('This record does not supply a DOI.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Add to run shortlist', exact: true })).toHaveCount(0);
  await panel.getByRole('tab', { name: 'Your notes', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Research notes', exact: true })).toBeVisible();
  await expect(panel.getByText('Notes stay with this search; saving to a project is separate.', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Reason (optional)')).toHaveAttribute('rows', '3');
  await panel.getByRole('button', { name: 'Include', exact: true }).click();
  await panel.getByLabel('Reason (optional)').fill('Useful implementation evidence.');
  await panel.getByRole('button', { name: 'Save reason', exact: true }).click();
  await expect.poll(() => api.state.snapshot.selections[FIRST_SOURCE.source_ref].reason).toBe('Useful implementation evidence.');
  expect(api.state.details).toBe(0); expect(api.state.checks).toBe(0);
});
