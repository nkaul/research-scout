import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation, CanonicalPaper } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const first: ChatSource = { ...FIRST_SOURCE, run_id: 'seamless-a', provider: 'arxiv', source_ref: 'arxiv:2401.12345', record_id: '2401.12345', title: 'First context research paper', url: 'http://arxiv.org/abs/2401.12345v2', abstract: 'A first authored context abstract. '.repeat(35) };
const second: ChatSource = { ...FIRST_SOURCE, run_id: 'seamless-b', source_ref: 'openalex:second', title: 'Second context research paper', doi: null, abstract: 'A second authored context abstract.' };
const video: ChatSource = { ...FIRST_SOURCE, run_id: 'seamless-video', provider: 'youtube', source_ref: 'youtube:abcdEF_12-3', record_id: 'abcdEF_12-3', title: 'A context research video', resource_type: 'video', doi: null, abstract: null, description: 'A context video description.' };
const canonical = (source: ChatSource): CanonicalPaper => ({ paper_id: source.source_ref, doi: source.doi, representative: source, observations: [source], providers: [source.provider], access: { status: 'not_requested' } });

async function setup(page: Page, sources = [first, second, video]) {
  await installFixtureApi(page);
  const saved: Conversation = { id: 'seamless', title: 'Seamless reading fixture', routing: 'auto', status: 'IDLE', revision: 1, cursor: 'seamless:1', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: [], filters: {}, turns: [{ id: 'seamless-turn', message: 'Context engineering research', action: 'discover', routing: 'auto', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', run_ids: sources.map(s => s.run_id), providers: ['arxiv', 'openalex', 'youtube'], sources, papers: sources.map(canonical), response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' } }] };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/seamless', route => route.fulfill({ json: saved }));
  for (const source of sources) await page.route(`**/api/research-runs/${source.run_id}/snapshot`, route => route.fulfill({ json: { ...initialSnapshot(), id: source.run_id, provider: source.provider, status: 'succeeded', entities: [source] } }));
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" />' }));
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  return { saved, posts };
}

test('hover and row keyboard movement follow the newest saved source without stealing focus', async ({ page }) => {
  const { posts } = await setup(page);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const arrived = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/research-runs/seamless-a/snapshot', async route => { started(); await gate; await route.fulfill({ json: { ...initialSnapshot(), id: first.run_id, provider: 'arxiv', status: 'succeeded', entities: [first] } }); });
  await page.goto('/app?search=seamless');
  const rows = page.getByTestId('search-result-card'), panel = page.getByRole('complementary', { name: 'Source details', exact: true });
  await rows.nth(0).hover(); await arrived;
  await rows.nth(1).hover();
  await expect(panel.getByRole('heading', { name: second.title!, exact: true })).toBeVisible();
  const response = page.waitForResponse('**/api/research-runs/seamless-a/snapshot'); release(); await response;
  await expect(panel.getByRole('heading', { name: second.title!, exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Close source details', exact: true })).not.toBeFocused();
  await rows.nth(0).focus();
  await expect(panel.getByRole('heading', { name: first.title!, exact: true })).toBeVisible();
  await expect(rows.nth(0)).toBeFocused();
  await rows.nth(0).press('ArrowDown');
  await expect(panel.getByRole('heading', { name: second.title!, exact: true })).toBeVisible();
  await expect(rows.nth(1)).toBeFocused();
  await expect(rows.nth(1)).toHaveAttribute('data-active', 'true');
  expect(posts).toEqual([]);
});

test('abstracts expand inline and the global display toggle adds no retrieval calls', async ({ page }) => {
  const { posts } = await setup(page);
  await page.goto('/app?search=seamless');
  const card = page.getByTestId('search-result-card').first();
  await expect(card.locator('.chat-abstract-text')).not.toHaveClass(/expanded/);
  await page.getByRole('button', { name: 'Expand abstracts', exact: true }).click();
  await expect(card.locator('.chat-abstract-text')).toHaveClass(/expanded/);
  await page.getByRole('button', { name: 'Collapse abstracts', exact: true }).click();
  await expect(card.locator('.chat-abstract-text')).not.toHaveClass(/expanded/);
  await card.getByRole('button', { name: 'Read available abstract', exact: true }).click();
  await expect(card.locator('.chat-abstract-text')).toHaveClass(/expanded/);
  await expect(card.getByRole('button', { name: 'Collapse abstract', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?search=seamless$/);
  expect(posts).toEqual([]);
});

test('returning to the active row supersedes a different pending metadata read', async ({ page }) => {
  // B is the default reader; A remains unread until the deliberately delayed action.
  const { posts } = await setup(page, [second, first, video]);
  await page.goto('/app?search=seamless');
  const rows = page.getByTestId('search-result-card'), panel = page.getByRole('complementary', { name: 'Source details', exact: true });
  await rows.nth(0).focus();
  await expect(panel.getByRole('heading', { name: second.title!, exact: true })).toBeVisible();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/research-runs/seamless-a/snapshot', async route => {
    started(); await gate;
    await route.fulfill({ json: { ...initialSnapshot(), id: first.run_id, provider: 'arxiv', status: 'succeeded', entities: [first] } });
  });
  await rows.nth(1).focus(); await arrived;
  await rows.nth(1).press('ArrowUp');
  await expect(rows.nth(0)).toBeFocused();
  const response = page.waitForResponse('**/api/research-runs/seamless-a/snapshot'); release(); await response;
  await expect(rows.nth(1).getByRole('button', { name: 'Preview details', exact: true })).toHaveAttribute('aria-busy', 'false');
  await expect(panel.getByRole('heading', { name: second.title!, exact: true })).toBeVisible();
  await expect(rows.nth(0)).toHaveAttribute('data-active', 'true');
  expect(posts).toEqual([]);
});

test('reported PDFs embed only on request and HTTP arXiv records use the canonical HTTPS document', async ({ page }) => {
  const { posts } = await setup(page);
  let embeds = 0;
  await page.route('https://arxiv.org/pdf/2401.12345v2', async route => { embeds++; await route.fulfill({ contentType: 'text/html', body: '<p>Authored document viewer placeholder.</p>' }); });
  await page.goto('/app?search=seamless');
  const card = page.getByTestId('search-result-card').first();
  await expect(card.getByRole('link', { name: 'Open PDF in new tab', exact: true })).toHaveAttribute('href', 'https://arxiv.org/pdf/2401.12345v2');
  await expect(page.locator('.inline-document-frame')).toHaveCount(0); expect(embeds).toBe(0);
  await card.getByRole('button', { name: 'Preview PDF', exact: true }).click();
  await expect(card.locator('.inline-document-frame')).toHaveAttribute('src', 'https://arxiv.org/pdf/2401.12345v2');
  await expect(card.locator('.inline-document-note')).toContainText('does not add PDF text');
  await card.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect(card.locator('.inline-document-frame')).toHaveCount(0);
  expect(embeds).toBe(1); expect(posts).toEqual([]);
});

test('PDF locations validate legacy IDs and exclude malformed, local and credential-bearing URLs', async ({ page }) => {
  const cases = [
    { url: 'http://export.arxiv.org/abs/hep-th/9901001v3', pdf: 'https://arxiv.org/pdf/hep-th/9901001v3' },
    { url: 'https://arxiv.org/pdf/not-a-valid-id.pdf', pdf: null },
    { url: 'https://arxiv.org/abs/2499.12345', pdf: null },
    { url: 'https://user:secret@example.org/paper.pdf', pdf: null },
    { url: 'https://127.0.0.1/paper.pdf', pdf: null },
    { url: 'javascript:alert(1)', pdf: null },
  ];
  const sources = cases.map((item, index) => ({ ...second, url: item.url, run_id: `pdf-${index}`, source_ref: `openalex:pdf-${index}`, title: `PDF validation record ${index}` }));
  await setup(page, sources); await page.goto('/app?search=seamless');
  for (const [index, item] of cases.entries()) {
    const link = page.getByTestId('search-result-card').nth(index).getByRole('link', { name: 'Open PDF in new tab', exact: true });
    if (item.pdf) await expect(link).toHaveAttribute('href', item.pdf); else await expect(link).toHaveCount(0);
  }
});

test('a touch pointer does not open or fetch the reader automatically', async ({ page }) => {
  const { posts } = await setup(page); await page.setViewportSize({ width: 390, height: 844 });
  let reads = 0; page.on('request', request => { if (request.url().includes('/research-runs/seamless-a/snapshot')) reads++; });
  await page.goto('/app?search=seamless');
  const card = page.getByTestId('search-result-card').first();
  await card.dispatchEvent('pointerenter', { pointerType: 'touch' });
  await card.focus();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toHaveCount(0);
  expect(reads).toBe(0); expect(posts).toEqual([]);
});
