import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import type { ResearchProject } from '../../src/lib/projects';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const videoId = 'abcdEF_12-3';
const description = 'This authored video describes retrieval context, evaluating evidence and improving generation. '.repeat(9);
const video: ChatSource = { ...FIRST_SOURCE, provider: 'youtube', source_ref: `youtube:${videoId}`, record_id: videoId, provider_identifiers: { youtube_video_id: videoId }, run_id: 'compact-video-run', title: 'Understanding retrieval context', authors: ['Example Channel', 'Example Channel'], venue: 'YouTube', year: 2025, doi: null, url: `https://www.youtube.com/watch?v=${videoId}`, resource_type: 'video', thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, abstract: null, description, description_truncated: false, preview_truncated: false, version: 2 };
const older: ChatSource = { ...video, run_id: 'older-video-run', title: 'An older saved video title', description: 'The old description.', version: 1 };

async function setup(page: Page) {
  await installFixtureApi(page);
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() }); });
  await page.route('https://**/*', route => route.abort());
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#d7e2f3" /></svg>' }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  const records = [older, video];
  const saved: Conversation = { id: 'compact-video-search', title: 'Compact video research', routing: 'auto', status: 'IDLE', revision: 1, cursor: 'compact-video:1', created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', providers: ['youtube'], filters: {}, turns: [{ id: 'compact-video-turn', action: 'discover', routing: 'auto', message: 'Understanding retrieval context', status: 'SUCCEEDED', created_at: '2026-11-12T12:00:00Z', providers: ['youtube'], run_ids: records.map(source => source.run_id), sources: records, papers: records.map(source => ({ paper_id: source.run_id, representative: source, observations: [source], providers: ['youtube'], access: { status: 'not_requested' } })), response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/compact-video-search', route => route.fulfill({ json: saved }));
  for (const source of records) await page.route(`**/api/research-runs/${source.run_id}/snapshot`, route => route.fulfill({ json: { ...initialSnapshot(), id: source.run_id, provider: 'youtube', status: 'succeeded', entities: [source] } }));
  const project: ResearchProject = { id: 'video-project', name: 'Context research', description: '', revision: 0, created_at: saved.created_at, updated_at: saved.updated_at, concepts: [], queries: [], resources: [] };
  await page.route(/\/api\/projects(?:\/.*)?$/, route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { projects: [project] } });
    const body = route.request().postDataJSON();
    if (!new URL(route.request().url()).pathname.endsWith('/resources')) return route.fulfill({ status: 400, json: { detail: 'Only the explicit resource save is mocked.' } });
    project.revision++;
    project.resources.push({ id: 'saved-video', identity: `youtube:${videoId}`, kind: 'video', title: video.title!, provider: 'youtube', record_id: videoId, url: video.url, year: video.year, run_id: video.run_id, source_ref: video.source_ref, version: body.version, saved_at: saved.created_at, concept_ids: [], observations: [{ run_id: video.run_id, source_ref: video.source_ref, version: body.version, source: video }] });
    return route.fulfill({ json: project });
  });
  await page.goto('/app?search=compact-video-search');
  await page.getByRole('tab', { name: /^Videos/ }).click();
  return { posts, card: page.getByTestId('search-result-card') };
}

test('videos have title chips, one channel byline and aligned compact actions at every viewport', async ({ page }) => {
  const { posts, card } = await setup(page);
  await expect(card).toHaveCount(1);
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader.getByRole('heading', { name: video.title!, exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(posts).toEqual([]);
  await expect(card.getByRole('button', { name: video.title!, exact: true })).toBeVisible();
  const tags = card.getByLabel('Resource tags');
  for (const label of ['Video', 'YouTube', '2025']) await expect(tags).toContainText(label);
  await expect(card.locator('p.search-result-meta')).toHaveText('Example Channel');
  await expect(card.locator('.chat-abstract-heading,.chat-abstract-actions')).toHaveCount(0);
  await expect(card.locator('.video-thumbnail img')).toBeVisible();
  await expect(card.getByRole('button', { name: /PDF|Unpaywall/ })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Open on YouTube', exact: true })).toHaveAttribute('href', video.url!);
  const controls = page.getByTestId('search-control-panel'), text = card.locator('.chat-abstract-text');
  await controls.getByRole('button', { name: 'Expand descriptions', exact: true }).click();
  await expect(text).toHaveClass(/expanded/);
  await expect(text).toContainText(description);
  await controls.getByRole('button', { name: 'Collapse descriptions', exact: true }).click();
  await expect(text).not.toHaveClass(/expanded/);
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const actions = card.locator('.resource-action-bar > button,.resource-action-bar > a');
    await expect(actions).toHaveCount(4);
    const centers = await actions.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return r.y + r.height / 2; }));
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
    const toggle = card.getByRole('button', { name: 'Read available description', exact: true });
    await expect(toggle).toBeVisible();
    const bounds = await toggle.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.getByRole('tab', { name: /^Papers/ }).click();
  await expect(controls.getByRole('button', { name: 'Expand abstracts', exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(posts).toEqual([]);
});

test('description expansion is local and provider versions remain attributable behind one control', async ({ page }) => {
  const { posts, card } = await setup(page);
  const text = card.locator('.chat-abstract-text');
  expect((await text.textContent())!.length).toBeLessThan(description.length);
  await card.getByRole('button', { name: 'Read available description', exact: true }).click();
  await expect(text).toHaveClass(/expanded/);
  await expect(text).toContainText(description);
  await card.getByRole('button', { name: 'Collapse description', exact: true }).click();
  await expect(text).not.toHaveClass(/expanded/);
  await card.getByRole('button', { name: 'Provider observations (1)', exact: true }).click();
  const report = card.getByTestId('search-paper-observations');
  await expect(report).toContainText('Showing latest known records from 2 saved versions');
  await expect(report).toContainText(`${video.source_ref} · version 2`);
  await expect(report).not.toContainText(older.title!);
  await expect(report.getByRole('button', { name: 'Preview provider record', exact: true })).toHaveCount(1);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(posts).toEqual([]);
});

test('preview and project save keep the exact latest video without starting transcript or research work', async ({ page }) => {
  const { posts, card } = await setup(page);
  await card.getByRole('button', { name: 'Preview details', exact: true }).click();
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader.getByRole('heading', { name: video.title!, exact: true })).toBeVisible();
  await expect(reader.locator('.video-thumbnail')).toHaveCount(1);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(posts).toEqual([]);
  await card.getByRole('button', { name: 'Save to project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Research projects', exact: true });
  await expect(dialog.getByRole('group', { name: 'Save destination' })).toContainText(video.title!);
  await dialog.getByRole('button', { name: 'Save resource to project', exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ path: '/api/projects/video-project/resources', body: { run_id: video.run_id, source_ref: video.source_ref, version: video.version } });
  await expect(page.locator('iframe')).toHaveCount(0);
});
