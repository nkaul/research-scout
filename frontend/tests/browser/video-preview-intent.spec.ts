import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const ids = ['abcdEF_12-3', 'zyxWVU_98-7'];
const sources: ChatSource[] = ids.map((id, index) => ({ ...FIRST_SOURCE, provider: 'youtube',
  source_ref: `youtube:${id}`, record_id: id, provider_identifiers: { youtube_video_id: id },
  run_id: `video-intent-run-${index}`, title: `Authored preview intent video ${index + 1}`,
  authors: ['Fixture Channel'], venue: 'YouTube', doi: null, abstract: null,
  description: 'An authored description retained separately from captions.', resource_type: 'video',
  thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${id}`, transcript: null,
}));

function savedSnapshot(source: ChatSource) {
  return { ...initialSnapshot(), id: source.run_id, provider: 'youtube', status: 'succeeded', entities: [source] };
}

async function setup(page: Page) {
  await installFixtureApi(page);
  const posts: string[] = [], players: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  await page.route('https://**/*', route => route.abort());
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#dce6f6"/></svg>' }));
  await page.route('https://www.youtube-nocookie.com/**', route => {
    players.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<p>Authored player placeholder</p>' });
  });
  const saved: Conversation = { id: 'video-intent', title: 'Video preview intents', routing: 'auto', status: 'IDLE', revision: 1,
    created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', providers: ['youtube'], filters: {},
    turns: [{ id: 'video-intent-turn', action: 'discover', routing: 'auto', message: 'Video preview intents', status: 'SUCCEEDED',
      created_at: '2026-11-12T12:00:00Z', providers: ['youtube'], sources, run_ids: sources.map(source => source.run_id),
      papers: sources.map(source => ({ paper_id: source.source_ref, representative: source, observations: [source], providers: ['youtube'], access: { status: 'not_applicable' } })),
      response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }],
  };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [{ id: 'youtube', mode: 'fixture', status: 'ready', access_configured: true }] } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/video-intent', route => route.fulfill({ json: saved }));
  for (const source of sources) await page.route(`**/api/research-runs/${source.run_id}/snapshot`, route => route.fulfill({ json: savedSnapshot(source) }));
  await page.goto('/app?search=video-intent');
  await page.getByRole('tab', { name: /^Videos/ }).click();
  return { posts, players, reader: page.getByRole('complementary', { name: 'Source details', exact: true }), card: (index: number) => page.getByTestId('search-result-card').filter({ has: page.getByRole('button', { name: sources[index].title!, exact: true }) }) };
}

test('left thumbnail starts the right player after automatic metadata preview while the eye stays metadata-only', async ({ page }) => {
  const { posts, players, reader, card } = await setup(page);
  await expect(reader.getByRole('heading', { name: sources[0].title!, exact: true })).toBeVisible();
  await expect(reader.locator('iframe')).toHaveCount(0);
  await card(0).getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(reader.locator('iframe')).toHaveCount(0);
  await reader.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await card(0).getByRole('button', { name: `Preview video: ${sources[0].title}`, exact: true }).click();
  await expect(reader.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(reader.locator('iframe')).toHaveAttribute('src', new RegExp(`/embed/${ids[0]}\\?`));
  await expect.poll(() => players.length).toBe(1);
  expect(posts).toEqual([]);
});

test('passive selection and metadata return do not replay an earlier thumbnail playback request', async ({ page }) => {
  const { posts, players, reader, card } = await setup(page);
  await card(0).getByRole('button', { name: `Preview video: ${sources[0].title}`, exact: true }).click();
  await expect(reader.locator('iframe')).toHaveAttribute('src', new RegExp(`/embed/${ids[0]}\\?`));
  await card(1).hover();
  await expect(reader.getByRole('heading', { name: sources[1].title!, exact: true })).toBeVisible();
  await expect(reader.locator('iframe')).toHaveCount(0);
  await card(0).getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(reader.getByRole('heading', { name: sources[0].title!, exact: true })).toBeVisible();
  await expect(reader.locator('iframe')).toHaveCount(0);
  await card(1).getByRole('button', { name: `Preview video: ${sources[1].title}`, exact: true }).click();
  await expect(reader.locator('iframe')).toHaveAttribute('src', new RegExp(`/embed/${ids[1]}\\?`));
  await expect.poll(() => players.length).toBe(2);
  expect(posts).toEqual([]);
});

test('a delayed thumbnail read cannot start playback after the search is cleared', async ({ page }) => {
  const { posts, players, reader, card } = await setup(page);
  await expect(reader.getByRole('heading', { name: sources[0].title!, exact: true })).toBeVisible();
  let release!: () => void, arrived!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { arrived = resolve; });
  await page.route(`**/api/research-runs/${sources[1].run_id}/snapshot`, async route => { arrived(); await pending; await route.fulfill({ json: savedSnapshot(sources[1]) }); });
  await card(1).getByRole('button', { name: `Preview video: ${sources[1].title}`, exact: true }).click();
  await started;
  await page.getByRole('button', { name: 'New research', exact: true }).click();
  const response = page.waitForResponse(`**/api/research-runs/${sources[1].run_id}/snapshot`);
  release(); await response;
  await expect(reader).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(players).toEqual([]); expect(posts).toEqual([]);
});

test('the left thumbnail explicitly opens and starts a mobile reader without transcript work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { posts, reader, card } = await setup(page);
  await expect(reader).toHaveCount(0);
  await card(0).getByRole('button', { name: `Preview video: ${sources[0].title}`, exact: true }).click();
  await expect(reader.locator('iframe')).toHaveAttribute('src', new RegExp(`/embed/${ids[0]}\\?`));
  await expect(page).toHaveURL(/search=video-intent/);
  expect(posts).toEqual([]);
});
