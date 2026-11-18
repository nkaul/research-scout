import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import type { Source, Snapshot } from '../../src/lib/api';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const id = 'abcdEF_12-3';
const short = 'An authored search preview about retrieval context and evidence.';
const fullText = 'A detailed authored description.\n\n' + 'Evaluate source relevance, preserve provenance and inspect complete context before drawing a conclusion.\n'.repeat(35) + '\nFinal description line: retain the complete provider text.';
const preview: ChatSource = { ...FIRST_SOURCE, run_id: 'description-run', provider: 'youtube', source_ref: `youtube:${id}`, record_id: id, title: 'Recovering a complete video description', authors: ['Example Channel'], venue: 'YouTube', doi: null, resource_type: 'video', abstract: null, description: short, description_truncated: false, preview_truncated: false, content_origin: 'youtube_search_snippet', details_loaded: true, url: `https://www.youtube.com/watch?v=${id}`, version: 2 };
const complete: Source = { ...preview, description: fullText, content_origin: 'youtube_video_details', details_loaded: true, truncated_fields: [], version: 3 };

async function setup(page: Page, options: { source?: ChatSource; records?: Source[]; response?: Source; running?: boolean } = {}) {
  await installFixtureApi(page);
  const source = options.source || preview;
  let records = options.records || [source], status = options.running ? 'running' : 'succeeded', reads = 0;
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  await page.route('https://**/*', route => route.abort());
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" />' }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  const saved: Conversation = { id: 'description-search', title: 'Video description recovery', routing: 'auto', status: 'IDLE', revision: 1, cursor: 'description:1', created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', providers: ['youtube'], filters: {}, turns: [{ id: 'description-turn', action: 'discover', routing: 'auto', message: 'Retrieval context and evidence', status: 'SUCCEEDED', created_at: '2026-11-12T12:00:00Z', providers: ['youtube'], run_ids: [source.run_id], sources: [source], papers: [{ paper_id: source.source_ref, representative: source, observations: [source], providers: ['youtube'], access: { status: 'not_requested' } }], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  const snapshot = (): Snapshot => ({ ...initialSnapshot(), id: source.run_id, provider: 'youtube', status, entities: records });
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/description-search', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/description-run/snapshot', route => { reads++; return route.fulfill({ json: snapshot() }); });
  await page.route('**/api/research-runs/description-run/papers/**/details', route => { records = [options.response || complete]; return route.fulfill({ json: snapshot() }); });
  await page.goto('/app?search=description-search');
  await page.getByRole('tab', { name: /^Videos/ }).click();
  const card = page.getByTestId('search-result-card'), reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader.getByRole('heading', { name: source.title!, exact: true })).toBeVisible();
  return { card, reader, posts, get reads() { return reads; }, finish: () => { status = 'succeeded'; } };
}

test('both result and reader plus controls recover search snippets without loading captions', async ({ page }) => {
  const api = await setup(page);
  expect(api.posts).toEqual([]);
  for (const section of [api.card, api.reader]) {
    await section.getByRole('button', { name: 'Read available description', exact: true }).click();
    await expect(section.locator('.chat-abstract-text')).toContainText(fullText);
    await expect(section.getByRole('button', { name: 'Collapse description', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await section.getByRole('button', { name: 'Collapse description', exact: true }).click();
    const reads = api.reads, posts = api.posts.length;
    await section.getByRole('button', { name: 'Read available description', exact: true }).click();
    await expect(section.locator('.chat-abstract-text')).toContainText(fullText);
    expect(api.reads).toBe(reads);
    expect(api.posts).toHaveLength(posts);
  }
  expect(api.posts.length).toBeGreaterThanOrEqual(1);
  expect(api.posts.length).toBeLessThanOrEqual(2);
  expect(new Set(api.posts)).toEqual(new Set([`/api/research-runs/description-run/papers/${encodeURIComponent(preview.source_ref)}/details`]));
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(api.reader.locator('.video-transcript li')).toHaveCount(0);
});

test('saved full description reads choose the latest whole record and expanded text has no clipping', async ({ page }) => {
  const source = { ...preview, description_truncated: true, preview_truncated: true };
  const old = { ...complete, description: 'An obsolete saved description.', version: 1 };
  const api = await setup(page, { source, records: [old, complete] });
  await api.card.getByRole('button', { name: 'Read available description', exact: true }).click();
  await expect(api.card.locator('.chat-abstract-text')).toContainText(fullText);
  await expect(api.card.locator('.chat-abstract-text')).not.toContainText(old.description);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const section of [api.card, api.reader]) {
      const expand = section.getByRole('button', { name: 'Read available description', exact: true });
      if (await expand.count()) await expand.click();
      const text = section.locator('.chat-abstract-text');
      await expect(text).toContainText('Final description line: retain the complete provider text.');
      const geometry = await text.evaluate(node => ({ client: node.clientHeight, scroll: node.scrollHeight, maxHeight: getComputedStyle(node).maxHeight, clamp: getComputedStyle(node).webkitLineClamp }));
      const context = `${width}px ${section === api.card ? 'card' : 'reader'}`;
      expect(geometry.maxHeight, context).toBe('none');
      expect(geometry.clamp, context).toBe('none');
      expect(geometry.scroll - geometry.client, context).toBeLessThanOrEqual(1);
      await expect(section.getByRole('button', { name: 'Collapse description', exact: true })).toBeVisible();
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  expect(api.posts).toEqual([]);
});

test('active searches defer metadata recovery and returned provider excerpts remain visibly partial', async ({ page }) => {
  const response = { ...complete, description: short + ' Only the available provider excerpt remains.', truncated_fields: ['description'] };
  const api = await setup(page, { source: { ...preview, description_truncated: true }, response, running: true });
  await api.card.getByRole('button', { name: 'Read available description', exact: true }).click();
  await expect(api.card).toContainText('This source’s search is still running.');
  await expect(api.card.locator('.chat-abstract-text')).toContainText('Description excerpt');
  expect(api.posts).toEqual([]);
  api.finish();
  await api.card.getByRole('button', { name: 'Check description availability', exact: true }).click();
  await expect(api.card.locator('.chat-abstract-text')).toContainText(response.description);
  await expect(api.card.locator('.chat-abstract-text')).toContainText('Description excerpt');
  await expect(api.card.getByTestId('chat-abstract')).toContainText('Provider description excerpt');
  expect(api.posts).toHaveLength(1);
  await expect(page.locator('iframe')).toHaveCount(0);
});
