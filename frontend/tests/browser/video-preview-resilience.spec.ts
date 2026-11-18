import { test, expect, type Page } from '@playwright/test';
import type { Source } from '../../src/lib/api';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const videoId = 'abcdEF_12-3';
const caption = { status: 'available' as const, origin: 'authored_fixture_captions', language: 'English', is_generated: false, truncated: false, segments: [{ text: 'An authored public-caption fixture.', start: 12, duration: 3 }] };

async function installVideo(page: Page, invalid = false, cached = false) {
  await installFixtureApi(page);
  await page.route('https://**/*', route => route.abort());
  const source: Source = { ...FIRST_SOURCE, provider: 'youtube', source_ref: `youtube:${invalid ? 'invalid' : videoId}`, record_id: invalid ? 'invalid' : videoId,
    provider_identifiers: { youtube_video_id: invalid ? 'invalid' : videoId }, title: 'Resilient video preview', resource_type: 'video', doi: null, abstract: null,
    description: 'An authored video description.', thumbnail_url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg?revision=old`,
    url: invalid ? 'javascript:alert(1)' : `https://www.youtube.com/watch?v=${videoId}`, transcript: cached ? caption : null };
  let snapshot = { ...initialSnapshot(), id: 'video-run', provider: 'youtube' as const, status: 'succeeded', entities: [source] };
  let captions = 0;
  const preview = { ...source, run_id: snapshot.id };
  const saved = { id: 'video-recovery', routing: 'auto', title: 'Saved video recovery', status: 'IDLE', revision: 1, created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: ['youtube'], filters: {},
    turns: [{ id: 'video-turn', action: 'discover', routing: 'auto', message: 'Video research', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['youtube'], sources: [preview], papers: [{ paper_id: `youtube:${source.record_id}`, representative: preview, observations: [preview], providers: ['youtube'], access: { status: 'not_applicable' } }], run_ids: ['video-run'], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' } }] };
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [{ id: 'youtube', mode: 'fixture', status: 'ready', access_configured: true }] } }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/video-recovery', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/video-run/snapshot', route => route.fulfill({ json: snapshot }));
  await page.route('**/api/research-runs/video-run/papers/**/transcript', route => {
    captions++;
    snapshot = { ...snapshot, revision: snapshot.revision + 1, entities: [{ ...source, version: 2, thumbnail_url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg?revision=new`, transcript: caption }] };
    return route.fulfill({ json: snapshot });
  });
  await page.route('https://i.ytimg.com/**', route => new URL(route.request().url()).searchParams.get('revision') === 'new'
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#dbe6f7"/></svg>' }) : route.abort());
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Authored player fixture</p>' }));
  await page.goto('/app?search=video-recovery');
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toBeVisible();
  return { get captions() { return captions; } };
}

test('a failed thumbnail recovers when same-video saved details supply a new safe image', async ({ page }) => {
  const api = await installVideo(page); const dialog = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(dialog.getByText('Thumbnail unavailable · preview video', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Load transcript', exact: true }).click();
  await expect(dialog.getByTestId('video-transcript')).toContainText('An authored public-caption fixture.');
  await expect(dialog.getByRole('img', { name: 'Video thumbnail: Resilient video preview', exact: true })).toHaveAttribute('src', /maxresdefault\.jpg\?revision=new$/);
  expect(api.captions).toBe(1);
});

test('updating same-video transcript metadata retains an already opened player', async ({ page }) => {
  const api = await installVideo(page); const dialog = page.getByRole('complementary', { name: 'Source details', exact: true });
  await dialog.getByRole('button', { name: 'Preview video: Resilient video preview', exact: true }).click();
  const player = dialog.locator('iframe'); await expect(player).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/abcdEF_12-3/);
  await player.evaluate(node => { (node as HTMLElement).dataset.stable = 'yes'; });
  await dialog.getByRole('button', { name: 'Load transcript', exact: true }).click();
  await expect(dialog.getByTestId('video-transcript')).toContainText('An authored public-caption fixture.');
  await expect(player).toHaveAttribute('data-stable', 'yes'); expect(api.captions).toBe(1);
});

for (const cached of [false, true]) test(`an invalid saved video identity has no unsafe URL or broken seek target (${cached ? 'saved captions' : 'no captions'})`, async ({ page }) => {
  const api = await installVideo(page, true, cached); const dialog = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(dialog.getByText('This saved record has no valid YouTube video identifier. Its saved metadata remains available.', { exact: true })).toBeVisible();
  await expect(dialog.locator('iframe')).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: /Open on YouTube/ })).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  if (cached) { await expect(dialog.getByTestId('video-transcript')).toContainText('An authored public-caption fixture.'); await expect(dialog.getByTestId('video-transcript').getByRole('link')).toHaveCount(0); }
  else await expect(dialog.getByRole('button', { name: 'Load transcript', exact: true })).toBeDisabled();
  expect(api.captions).toBe(0);
});
