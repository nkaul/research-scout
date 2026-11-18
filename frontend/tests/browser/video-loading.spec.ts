import { test, expect, type Page } from '@playwright/test';
import type { Source } from '../../src/lib/api';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const videoId = 'abcdEF_12-3';
const title = 'Delayed authored video fixture';
const imageBody = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#dbe6f7"/></svg>';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function installVideo(page: Page, imageReady: Promise<void> = Promise.resolve(), playerReady: Promise<void> = Promise.resolve()) {
  await installFixtureApi(page);
  // Every upstream request is authored or aborted, including requests from frames.
  await page.route('https://**/*', route => route.abort());
  const source: Source = { ...FIRST_SOURCE, provider: 'youtube', source_ref: `youtube:${videoId}`, record_id: videoId,
    provider_identifiers: { youtube_video_id: videoId }, title, resource_type: 'video', doi: null, abstract: null,
    description: 'A fictional video used to exercise media loading.', thumbnail_url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${videoId}`, transcript: null };
  let snapshot = { ...initialSnapshot(), id: 'video-loading-run', provider: 'youtube' as const, status: 'succeeded', entities: [source] };
  const preview: ChatSource = { ...source, run_id: snapshot.id };
  const saved: Conversation = { id: 'video-loading', routing: 'auto', title: 'Saved media loading', status: 'IDLE', revision: 1, cursor: 'media:1', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: ['youtube'], filters: {},
    turns: [{ id: 'video-turn', action: 'discover', routing: 'auto', message: 'Video research', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['youtube'], sources: [preview], papers: [{ paper_id: source.source_ref, representative: preview, observations: [preview], providers: ['youtube'], access: { status: 'not_applicable' } }], run_ids: [snapshot.id], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  const counts = { images: 0, players: 0, captions: 0, posts: [] as string[] };
  page.on('request', request => { if (request.method() === 'POST') counts.posts.push(new URL(request.url()).pathname); });
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [{ id: 'youtube', mode: 'fixture', status: 'ready', access_configured: true }] } }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/video-loading', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/video-loading-run/snapshot', route => route.fulfill({ json: snapshot }));
  await page.route('**/api/research-runs/video-loading-run/papers/**/transcript', route => {
    counts.captions++;
    snapshot = { ...snapshot, revision: snapshot.revision + 1, entities: [{ ...source, version: 2,
      transcript: { status: 'available', origin: 'authored_fixture_captions', language: 'English', is_generated: false, truncated: false, segments: [{ text: 'A saved caption update while the player remains mounted.', start: 12, duration: 3 }] } }] };
    return route.fulfill({ json: snapshot });
  });
  await page.route('https://i.ytimg.com/**', async route => {
    counts.images++;
    await imageReady;
    await route.fulfill({ contentType: 'image/svg+xml', body: imageBody });
  });
  await page.route('https://www.youtube-nocookie.com/**', async route => {
    counts.players++;
    await playerReady;
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Authored player fixture</title><p>Fictional video preview</p>' });
  });
  await page.goto('/app?search=video-loading', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Videos/ }).click();
  return { counts, card: page.getByTestId('search-result-card'), reader: page.getByRole('complementary', { name: 'Source details', exact: true }) };
}

test('a delayed thumbnail shows a skeleton until its image loads without starting a player or provider work', async ({ page }) => {
  const image = deferred();
  try {
    const { card, reader, counts } = await installVideo(page, image.promise);
    const preview = card.getByRole('button', { name: `Preview video: ${title}`, exact: true });
    await expect(preview.locator('.video-image-loading')).toBeVisible();
    await expect(preview).toHaveAttribute('aria-busy', 'true');
    await expect(preview.locator('[data-load-kind="Thumbnail"]')).toHaveAttribute('data-loading', 'true');
    await expect.poll(() => counts.images).toBeGreaterThan(0);
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(counts.players).toBe(0);
    expect(counts.posts).toEqual([]);

    image.release();
    await expect(preview.locator('.video-image-loading')).toHaveCount(0);
    await expect(preview).toHaveAttribute('aria-busy', 'false');
    await expect(preview.locator('[data-load-kind="Thumbnail"]')).toHaveAttribute('data-loading', 'false');
    expect(await preview.locator('img').evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    await card.getByRole('button', { name: 'Preview details', exact: true }).click();
    await expect(reader).toBeVisible();
    await expect(reader.locator('iframe')).toHaveCount(0);
    expect(counts.players).toBe(0);
    expect(counts.posts).toEqual([]);
  } finally { image.release(); }
});

test('an explicitly opened video shows its player loader until iframe load and retains playback across saved captions', async ({ page }) => {
  const playerReady = deferred();
  try {
    const { card, reader, counts } = await installVideo(page, Promise.resolve(), playerReady.promise);
    await card.getByRole('button', { name: 'Preview details', exact: true }).click();
    await expect(reader).toBeVisible();
    await expect(reader.locator('iframe')).toHaveCount(0);
    expect(counts.players).toBe(0);
    expect(counts.posts).toEqual([]);

    await reader.getByRole('button', { name: `Preview video: ${title}`, exact: true }).click();
    const player = reader.locator('iframe');
    await expect(player).toHaveAttribute('src', new RegExp(`youtube-nocookie\\.com/embed/${videoId}`));
    await expect(reader.getByTestId('video-player-loading')).toBeVisible();
    await expect(reader.locator('[data-load-kind="Video"]')).toHaveAttribute('data-loading', 'true');
    await expect(reader.getByTestId('video-player-loading').getByRole('status')).toHaveText('Loading video preview…');
    await expect.poll(() => counts.players).toBe(1);
    expect(counts.posts).toEqual([]);

    playerReady.release();
    await expect(reader.getByTestId('video-player-loading')).toHaveCount(0);
    await expect(reader.locator('[data-load-kind="Video"]')).toHaveAttribute('data-loading', 'false');
    await expect(page.frameLocator(`iframe[title="YouTube preview: ${title}"]`).getByText('Fictional video preview')).toBeVisible();
    await player.evaluate(element => { (element as HTMLElement).dataset.stable = 'yes'; });
    await reader.getByRole('button', { name: 'Load transcript', exact: true }).click();
    await expect(reader.getByTestId('video-transcript')).toContainText('A saved caption update while the player remains mounted.');
    await expect(player).toHaveAttribute('data-stable', 'yes');
    await expect(reader.locator('.video-preview [data-load-kind="Captions"]')).toHaveAttribute('data-loading', 'false');
    await expect(reader.getByTestId('video-player-loading')).toHaveCount(0);
    expect(counts.players).toBe(1);
    expect(counts.captions).toBe(1);
    expect(counts.posts).toHaveLength(1);
    expect(counts.posts[0]).toMatch(/^\/api\/research-runs\/video-loading-run\/papers\/[^/]+\/transcript$/);
  } finally { playerReady.release(); }
});
