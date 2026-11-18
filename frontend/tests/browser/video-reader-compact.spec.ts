import { test, expect, type Page } from '@playwright/test';
import type { Snapshot, Source } from '../../src/lib/api';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const videoId = 'abcdEF_12-3';
const title = 'Compact authored video reader';
const caption: NonNullable<Source['transcript']> = {
  status: 'available', origin: 'authored_fixture_captions', language: 'English', is_generated: false, truncated: false,
  segments: Array.from({ length: 40 }, (_, index) => ({ text: `Authored saved caption ${index + 1}: evidence stays separate from the video description.`, start: 12 + index * 8, duration: 5 })),
};

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function installVideo(page: Page, options: { transcript?: Source['transcript']; unsafeThumbnail?: boolean; captionsReady?: Promise<void> } = {}) {
  await installFixtureApi(page);
  // No request leaves this authored browser fixture, including embedded frames.
  await page.route('https://**/*', route => route.abort());
  const source: Source = { ...FIRST_SOURCE, provider: 'youtube', source_ref: `youtube:${videoId}`, record_id: videoId,
    provider_identifiers: { youtube_video_id: videoId }, title, authors: ['Authored Fixture Channel'], resource_type: 'video', doi: null, abstract: null,
    description: 'A short authored description for this saved video.', thumbnail_url: options.unsafeThumbnail ? 'https://untrusted.example/thumbnail.jpg' : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${videoId}`, transcript: options.transcript ?? null };
  let snapshot: Snapshot = { ...initialSnapshot(), id: 'compact-reader-run', provider: 'youtube', status: 'succeeded', entities: [source] };
  const preview: ChatSource = { ...source, run_id: snapshot.id };
  const saved: Conversation = { id: 'compact-reader', routing: 'auto', title: 'Saved compact video', status: 'IDLE', revision: 1, cursor: 'compact:1',
    created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: ['youtube'], filters: {},
    turns: [{ id: 'compact-turn', action: 'discover', routing: 'auto', message: 'Video research', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['youtube'], sources: [preview],
      papers: [{ paper_id: source.source_ref, representative: preview, observations: [preview], providers: ['youtube'], access: { status: 'not_applicable' } }], run_ids: [snapshot.id], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  const counts = { players: 0, captions: 0, posts: [] as string[], external: [] as string[] };
  page.on('request', request => {
    if (request.method() === 'POST') counts.posts.push(new URL(request.url()).pathname);
    if (new URL(request.url()).protocol === 'https:') counts.external.push(request.url());
  });
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [{ id: 'youtube', mode: 'fixture', status: 'ready', access_configured: true }] } }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/compact-reader', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/compact-reader-run/snapshot', route => route.fulfill({ json: snapshot }));
  await page.route('**/api/research-runs/compact-reader-run/papers/**/transcript', async route => {
    counts.captions++;
    await options.captionsReady;
    snapshot = { ...snapshot, revision: snapshot.revision + 1, entities: [{ ...source, version: 2, transcript: caption }] };
    await route.fulfill({ json: snapshot });
  });
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#dbe6f7"/></svg>' }));
  await page.route('https://www.youtube-nocookie.com/**', route => {
    counts.players++;
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Authored player</title><p>Mocked preview</p>' });
  });
  await page.goto('/app?search=compact-reader', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader).toBeVisible();
  return { reader, counts };
}

test('compact actions keep playback and captions explicit and preserve the loaded player across caption updates', async ({ page }) => {
  const captions = deferred();
  try {
    const { reader, counts } = await installVideo(page, { captionsReady: captions.promise });
    await expect(reader.getByRole('link', { name: 'Open on YouTube', exact: true })).toHaveAttribute('href', `https://www.youtube.com/watch?v=${videoId}`);
    await expect(reader.getByRole('button', { name: 'Load transcript', exact: true })).toBeVisible();
    await expect(reader.locator('iframe')).toHaveCount(0);
    expect(counts.players).toBe(0); expect(counts.posts).toEqual([]); expect(counts.captions).toBe(0);

    await reader.getByRole('button', { name: `Preview video: ${title}`, exact: true }).click();
    const player = reader.locator('iframe');
    await expect(reader.getByTestId('video-player-loading')).toHaveCount(0);
    await player.evaluate(node => { (node as HTMLElement).dataset.stable = 'yes'; });
    await reader.getByRole('button', { name: 'Load transcript', exact: true }).click();
    await expect(reader.getByTestId('video-transcript')).toHaveAttribute('aria-busy', 'true');
    await expect(reader.getByText('Checking public captions…', { exact: true })).toBeVisible();
    await expect(reader.locator('.video-preview [data-load-kind="Captions"]')).toHaveAttribute('data-loading', 'true');
    captions.release();
    await expect(reader.getByTestId('video-transcript')).toContainText('Authored saved caption 1:');
    await expect(player).toHaveAttribute('data-stable', 'yes');
    await expect(reader.getByRole('button', { name: 'Load transcript', exact: true })).toHaveCount(0);
    await expect(reader.getByText('English', { exact: true })).toBeVisible();
    const timing = reader.getByLabel('Video and captions load times', { exact: true });
    await timing.focus();
    await expect(page.getByRole('tooltip')).toContainText(/Video: .*Captions:/);
    await expect(reader.locator('[data-load-kind="Video"]')).toHaveAttribute('data-loading', 'false');
    await expect(reader.locator('.video-preview [data-load-kind="Captions"]')).toHaveAttribute('data-loading', 'false');
    expect(counts.players).toBe(1); expect(counts.captions).toBe(1); expect(counts.posts).toHaveLength(1);
    expect(counts.posts[0]).toMatch(/^\/api\/research-runs\/compact-reader-run\/papers\/[^/]+\/transcript$/);
  } finally { captions.release(); }
});

test('saved captions remain readable, timestamped and bounded on a narrow screen without automatic calls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { reader, counts } = await installVideo(page, { transcript: caption });
  const transcript = reader.getByRole('list', { name: 'Saved transcript', exact: true });
  await expect(transcript).toBeVisible();
  await expect(transcript.getByRole('listitem')).toHaveCount(40);
  await expect(transcript.getByRole('link', { name: '0:12', exact: true })).toHaveAttribute('href', `https://www.youtube.com/watch?v=${videoId}&t=12s`);
  const bounds = await transcript.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight, width: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(bounds.height).toBeLessThanOrEqual(280); expect(bounds.scrollHeight).toBeGreaterThan(bounds.height); expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
  await transcript.focus();
  await expect(transcript).toBeFocused();
  await expect(reader.getByRole('link', { name: 'Open on YouTube', exact: true })).toBeVisible();
  await expect(reader.getByTestId('video-transcript')).toContainText('Source captions may contain errors.');
  await expect(reader.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(counts.players).toBe(0); expect(counts.posts).toEqual([]); expect(counts.captions).toBe(0);
});

test('a saved unavailable-caption outcome stays concise and offers explicit retry without automatic work', async ({ page }) => {
  const { reader, counts } = await installVideo(page, { unsafeThumbnail: true,
    transcript: { status: 'blocked', origin: 'authored_fixture_captions', truncated: false, message: 'Public captions could not be accessed.', segments: [] } });
  await expect(reader.getByTestId('video-transcript').getByRole('status')).toContainText('Transcript access blocked');
  await expect(reader.getByTestId('video-transcript')).toContainText('Show transcript');
  await expect(reader.getByRole('button', { name: 'Load transcript', exact: true })).toHaveCount(0);
  await expect(reader.getByRole('button', { name: 'Retry transcript', exact: true })).toBeVisible();
  await expect(reader.getByRole('img', { name: `Video thumbnail: ${title}`, exact: true })).toHaveAttribute('src', `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  await expect(reader.locator('iframe')).toHaveCount(0);
  expect(counts.external.every(url => url.startsWith(`https://i.ytimg.com/vi/${videoId}/`))).toBe(true);
  expect(counts.players).toBe(0); expect(counts.posts).toEqual([]); expect(counts.captions).toBe(0);
});

test('a fast thumbnail does not begin an endless elapsed clock when visibility is delivered after image load', async ({ page }) => {
  await page.addInitScript(() => {
    class DeferredVisibility {
      readonly root = null; readonly rootMargin = '0px'; readonly thresholds = [0];
      private timer?: ReturnType<typeof setTimeout>;
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        const deliver = () => { this.timer = setTimeout(() => this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver), 80); };
        const image = target as HTMLImageElement;
        if (image.complete && image.naturalWidth > 0) deliver();
        else target.addEventListener('load', deliver, { once: true });
      }
      unobserve() {}
      disconnect() { clearTimeout(this.timer); }
      takeRecords() { return []; }
    }
    window.IntersectionObserver = DeferredVisibility as unknown as typeof IntersectionObserver;
  });
  const { reader, counts } = await installVideo(page, { transcript: caption });
  const thumbnail = reader.getByRole('button', { name: `Preview video: ${title}`, exact: true });
  await expect(thumbnail).toHaveAttribute('aria-busy', 'false');
  // Wait for the authored observer delivery, not for a network request.
  await page.waitForTimeout(150);
  await expect(thumbnail.locator('[data-load-kind="Thumbnail"][data-loading="true"]')).toHaveCount(0);
  expect(counts.posts).toEqual([]); expect(counts.players).toBe(0);
});
