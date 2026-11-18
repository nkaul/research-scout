import { test, expect, type Page } from '@playwright/test';
import type { CanonicalPaper, ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const paper: ChatSource = { ...FIRST_SOURCE, provider: 'arxiv', source_ref: 'arxiv:2401.12345', record_id: '2401.12345', run_id: 'compact-card-run', title: 'Context retrieval and generation evidence', url: 'https://arxiv.org/abs/2401.12345v2', abstract: 'A provider abstract explaining context quality and retrieval. '.repeat(15), year: 2025 };
const other: ChatSource = { ...paper, provider: 'crossref', source_ref: 'crossref:10.0000/fixture-1', run_id: 'compact-crossref-run', title: 'Original Crossref title for the same DOI', version: 2 };
const location = { url: 'https://example.org/paper', url_for_pdf: 'https://example.org/paper.pdf', url_for_landing_page: 'https://example.org/paper', version: 'acceptedVersion', license: 'cc-by', host_type: 'repository' };

async function setup(page: Page, source = paper) {
  await installFixtureApi(page);
  const grouped: CanonicalPaper = { paper_id: 'doi:10.0000/fixture-1', doi: paper.doi, representative: source, observations: [source, other], providers: ['arxiv', 'crossref'], access: { status: 'succeeded', observation: { provider: 'unpaywall', mode: 'fixture', doi: paper.doi!, is_oa: true, oa_status: 'green', best_oa_location: location, oa_locations: [location], observed_at: '2026-11-12T12:00:00Z', version: 'fixture-access-1' } } };
  const saved: Conversation = { id: 'compact-card-search', title: 'Compact paper cards', routing: 'auto', status: 'IDLE', revision: 1, cursor: 'compact-card:1', created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', providers: [], filters: {}, turns: [{ id: 'compact-card-turn', action: 'discover', routing: 'auto', message: 'Context quality and generation', status: 'SUCCEEDED', created_at: '2026-11-12T12:00:00Z', providers: ['arxiv', 'crossref'], run_ids: [source.run_id, other.run_id], sources: [source, other], papers: [grouped], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/compact-card-search', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/compact-card-run/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: source.run_id, provider: source.provider, status: 'succeeded', entities: [source] } }));
  await page.route('**/api/research-runs/compact-crossref-run/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: other.run_id, provider: other.provider, status: 'succeeded', entities: [other] } }));
  await page.route('https://arxiv.org/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Fixture PDF placeholder</p>' }));
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  return { posts };
}

test('paper chips follow its title and all source, PDF, provider and access actions share one row', async ({ page }) => {
  const { posts } = await setup(page); await page.goto('/app?search=compact-card-search');
  const card = page.getByTestId('search-result-card');
  await expect(card.getByLabel('Resource tags')).toContainText('Paper');
  await expect(card.getByLabel('Resource tags')).toContainText('arXiv');
  await expect(card.getByLabel('Resource tags')).toContainText('2025');
  const chipLine = await card.evaluate(node => {
    const text = node.querySelector('[data-testid="paper-title-text"]')!, range = document.createRange();
    range.selectNodeContents(text);
    const lastLine = Array.from(range.getClientRects()).at(-1)!;
    const chip = node.querySelector('[aria-label="Resource tags"] > span')!.getBoundingClientRect();
    return { titleBottom: lastLine.bottom, chipBottom: chip.bottom };
  });
  expect(Math.abs(chipLine.titleBottom - chipLine.chipBottom)).toBeLessThanOrEqual(10);
  await expect(card.locator('.chat-abstract-heading,.chat-abstract-actions')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Read available abstract', exact: true })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const actions = card.locator('.resource-action-bar > button,.resource-action-bar > a');
    await expect(actions).toHaveCount(7);
    const centers = await actions.evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return r.y + r.height / 2; }));
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await card.getByRole('button', { name: 'Provider observations (2)', exact: true }).click();
  const observations = card.getByTestId('search-paper-observations');
  await expect(observations).toContainText('Matched by DOI');
  await expect(observations.getByRole('button', { name: 'Preview provider record', exact: true })).toHaveCount(2);
  await expect(observations).toContainText(other.source_ref);
  await card.getByRole('button', { name: 'Unpaywall open access: Open access', exact: true }).click();
  await expect(card.getByTestId('search-paper-access')).toContainText('DOI access locations and license metadata');
  await expect(card.getByTestId('access-result')).toContainText('Accepted manuscript');
  expect(posts).toEqual([]);
});

test('inline abstract icon expands and collapses already available text without provider work', async ({ page }) => {
  const { posts } = await setup(page); await page.goto('/app?search=compact-card-search');
  const card = page.getByTestId('search-result-card'), text = card.locator('.chat-abstract-text');
  expect((await text.textContent())!.length).toBeLessThan(paper.abstract!.length);
  await card.getByRole('button', { name: 'Read available abstract', exact: true }).click();
  await expect(text).toHaveClass(/expanded/);
  await expect(text).toContainText(paper.abstract!);
  await card.getByRole('button', { name: 'Collapse abstract', exact: true }).click();
  await expect(text).not.toHaveClass(/expanded/);
  expect(posts).toEqual([]);
});

test('a provider excerpt expands through an explicit saved read and retains latest source-version notice', async ({ page }) => {
  const source: ChatSource = { ...paper, abstract: 'A partial provider excerpt…', abstract_truncated: true };
  const { posts } = await setup(page, source);
  const full = { ...source, abstract: paper.abstract, abstract_truncated: false, details_loaded: true, version: 3 };
  let reads = 0;
  await page.route('**/api/research-runs/compact-card-run/snapshot', route => { reads++; return route.fulfill({ json: { ...initialSnapshot(), id: source.run_id, provider: source.provider, status: 'succeeded', entities: [reads > 1 ? full : source] } }); });
  await page.goto('/app?search=compact-card-search');
  const card = page.getByTestId('search-result-card');
  await expect.poll(() => reads).toBe(1);
  await card.getByRole('button', { name: 'Read available abstract', exact: true }).click();
  await expect(card.locator('.chat-abstract-text')).toContainText(paper.abstract!);
  await expect(card.getByTestId('chat-abstract')).toContainText('Latest saved provider version');
  expect(reads).toBe(2); expect(posts).toEqual([]);
});
