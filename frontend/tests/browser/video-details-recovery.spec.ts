import { test, expect, type Page } from '@playwright/test';
import type { Snapshot, Source } from '../../src/lib/api';
import type { ChatSource, Conversation } from '../../src/lib/conversations';
import type { ResearchProject } from '../../src/lib/projects';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const videoId = 'abcdEF_12-3';
const title = 'Saved video with a search excerpt';
const fullDescription = 'The complete authored provider description is now available with detailed discussion of research methods.';
const available: NonNullable<Source['transcript']> = { status: 'available', origin: 'authored_fixture_captions', language: 'English', is_generated: false, truncated: false, segments: [{ text: 'Saved authored captions remain available.', start: 12, duration: 4 }] };
const blocked: NonNullable<Source['transcript']> = { status: 'blocked', origin: 'authored_fixture_captions', truncated: false, message: 'Public-caption access was blocked on the previous attempt.', segments: [] };
function deferred() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

async function installVideo(page: Page, options: { transcript?: Source['transcript']; metadataReady?: Promise<void>; retryCooldown?: boolean; historical?: boolean } = {}) {
  await installFixtureApi(page);
  await page.route('https://**/*', route => route.abort());
  const source: Source = { ...FIRST_SOURCE, provider: 'youtube', source_ref: `youtube:${videoId}`, record_id: videoId, title, authors: ['Authored channel'], resource_type: 'video', doi: null, abstract: null,
    description: 'Saved search excerpt.', content_origin: 'youtube_search_snippet', truncated_fields: ['description'], details_loaded: true,
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, provider_identifiers: { youtube_video_id: videoId }, url: `https://www.youtube.com/watch?v=${videoId}`, transcript: options.transcript ?? null };
  const current = options.historical ? { ...source, title: 'Latest provider video title', description: 'Latest saved description must not replace a pinned excerpt.', version: 2 } : source;
  let snapshot: Snapshot = { ...initialSnapshot(), id: 'details-recovery-run', provider: 'youtube', status: 'succeeded', entities: [current] };
  const preview: ChatSource = { ...source, run_id: snapshot.id };
  const saved: Conversation = { id: 'details-recovery', routing: 'auto', title: 'Saved recovery research', status: 'IDLE', revision: 1, cursor: 'recovery:1', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: ['youtube'], filters: {},
    turns: [{ id: 'recovery-turn', action: 'discover', routing: 'auto', message: 'Video recovery research', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['youtube'], sources: [preview], papers: [{ paper_id: source.source_ref, representative: preview, observations: [preview], providers: ['youtube'], access: { status: 'not_applicable' } }], run_ids: [snapshot.id], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  const project: ResearchProject = { id: 'video-project', name: 'Saved video project', description: '', revision: 1, created_at: saved.created_at, updated_at: saved.updated_at, concepts: [], queries: [], resources: [{ id: 'saved-video', identity: source.source_ref, kind: 'video', title, doi: null, provider: 'youtube', record_id: videoId, url: source.url, year: source.year, run_id: snapshot.id, source_ref: source.source_ref, version: 1, saved_at: saved.created_at, concept_ids: [], observations: [{ run_id: snapshot.id, source_ref: source.source_ref, version: 1, source: preview }] }] };
  const counts = { details: 0, captions: 0, players: 0, posts: [] as string[] };
  page.on('request', request => { if (request.method() === 'POST') counts.posts.push(new URL(request.url()).pathname); });
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [{ id: 'youtube', mode: 'fixture', status: 'ready', access_configured: true }] } }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false } } }));
  await page.route('**/api/projects', route => route.fulfill({ json: { projects: options.historical ? [project] : [] } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/details-recovery', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/details-recovery-run/snapshot', route => route.fulfill({ json: snapshot }));
  await page.route('**/api/research-runs/details-recovery-run/papers/**/details', async route => {
    counts.details++;
    await options.metadataReady;
    snapshot = { ...snapshot, revision: snapshot.revision + 1, entities: [{ ...snapshot.entities[0], version: 3, title: 'Complete authored video details', description: fullDescription, content_origin: 'youtube_video_details', truncated_fields: [], details_loaded: true }] };
    await route.fulfill({ json: snapshot });
  });
  await page.route('**/api/research-runs/details-recovery-run/papers/**/transcript', async route => {
    counts.captions++;
    if (options.retryCooldown && counts.captions === 1) return route.fulfill({ status: 429, json: { detail: 'Caption lookup was recently attempted. Retry in 240 seconds.' } });
    if (options.retryCooldown && counts.captions === 2) return route.fulfill({ status: 409, json: { detail: 'A caption lookup is already in progress for this video.' } });
    snapshot = { ...snapshot, revision: snapshot.revision + 1, entities: [{ ...snapshot.entities[0], version: 4, transcript: available }] };
    await route.fulfill({ json: snapshot });
  });
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#dbe6f7"/></svg>' }));
  await page.route('https://www.youtube-nocookie.com/**', route => { counts.players++; return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Authored player fixture</title><p>Mocked video</p>' }); });
  await page.goto('/app?search=details-recovery', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader).toBeVisible();
  return { reader, counts };
}

test('description plus refreshes a legacy snippet through metadata only while keeping saved captions and playback', async ({ page }) => {
  const metadata = deferred();
  try {
    const { reader, counts } = await installVideo(page, { transcript: available, metadataReady: metadata.promise });
    await expect(reader.locator('iframe')).toHaveCount(0); expect(counts.posts).toEqual([]);
    await reader.getByRole('button', { name: `Preview video: ${title}`, exact: true }).click();
    const player = reader.locator('iframe'); await expect(reader.getByTestId('video-player-loading')).toHaveCount(0);
    await player.evaluate(node => { (node as HTMLElement).dataset.stable = 'yes'; });
    await reader.getByRole('button', { name: 'Read available description', exact: true }).click();
    await expect(reader.getByRole('status', { name: '' }).filter({ hasText: 'Loading video description and metadata…' })).toBeVisible();
    await expect(reader.getByTestId('video-transcript')).toHaveAttribute('aria-busy', 'false');
    await expect(reader.getByText('Checking public captions…', { exact: true })).toHaveCount(0);
    expect(counts.captions).toBe(0);
    metadata.release();
    await expect(reader.locator('.chat-abstract-text')).toContainText(fullDescription);
    await expect(reader.getByRole('button', { name: 'Collapse description', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(reader.getByTestId('video-transcript')).toContainText(available.segments[0].text);
    await expect(player).toHaveAttribute('data-stable', 'yes');
    await expect(reader.getByRole('button', { name: 'Video details loaded', exact: true })).toBeDisabled();
    expect(counts.details).toBe(1); expect(counts.captions).toBe(0); expect(counts.players).toBe(1);
    expect(counts.posts).toHaveLength(1); expect(counts.posts[0]).toMatch(/\/details$/);
  } finally { metadata.release(); }
});

test('caption retry reports cooldown then recovers independently from saved metadata without remounting playback', async ({ page }) => {
  const { reader, counts } = await installVideo(page, { transcript: blocked, retryCooldown: true });
  await expect(reader.getByRole('button', { name: 'Retry transcript', exact: true })).toBeVisible();
  await reader.getByRole('button', { name: `Preview video: ${title}`, exact: true }).click();
  const player = reader.locator('iframe'); await expect(reader.getByTestId('video-player-loading')).toHaveCount(0);
  await player.evaluate(node => { (node as HTMLElement).dataset.stable = 'yes'; });
  await reader.getByRole('button', { name: 'Retry transcript', exact: true }).click();
  await expect(reader.getByRole('alert')).toContainText('Retry in 240 seconds.');
  await expect(reader.locator('.chat-abstract-text')).toContainText('Saved search excerpt.');
  await expect(reader.getByRole('button', { name: 'Retry transcript', exact: true })).toBeEnabled();
  await reader.getByRole('button', { name: 'Retry transcript', exact: true }).click();
  await expect(reader.getByRole('alert')).toContainText('A caption lookup is already in progress for this video.');
  await expect(reader.getByRole('alert')).not.toContainText('changed while you were editing');
  await reader.getByRole('button', { name: 'Retry transcript', exact: true }).click();
  await expect(reader.getByTestId('video-transcript')).toContainText(available.segments[0].text);
  await expect(reader.getByRole('alert')).toHaveCount(0);
  await expect(player).toHaveAttribute('data-stable', 'yes');
  await expect(reader.getByRole('button', { name: 'Retry transcript', exact: true })).toHaveCount(0);
  expect(counts.details).toBe(0); expect(counts.captions).toBe(3); expect(counts.players).toBe(1);
  expect(counts.posts).toHaveLength(3); expect(counts.posts.every(path => path.endsWith('/transcript'))).toBe(true);
});

test('a historical video description expands locally until the user explicitly loads current provider details', async ({ page }) => {
  const { reader, counts } = await installVideo(page, { transcript: available, historical: true });
  await page.getByRole('button', { name: 'Manage research projects', exact: true }).click();
  const projects = page.getByRole('dialog', { name: 'Research projects', exact: true });
  await projects.getByRole('button', { name: new RegExp(title) }).click();
  await expect(reader.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await reader.getByRole('button', { name: 'Read available description', exact: true }).click();
  await expect(reader.locator('.chat-abstract-text')).toContainText('Saved search excerpt.');
  await expect(reader.getByText('Saved project excerpt. Use Load video details to inspect the current provider record.', { exact: true })).toBeVisible();
  await expect(reader.getByText('Latest saved description must not replace a pinned excerpt.', { exact: false })).toHaveCount(0);
  expect(counts.posts).toEqual([]); expect(counts.players).toBe(0);
  await reader.getByRole('button', { name: 'Refresh video details', exact: true }).click();
  await expect(reader.getByRole('heading', { name: 'Complete authored video details', exact: true })).toBeVisible();
  await expect(reader.locator('.chat-abstract-text')).toContainText(fullDescription);
  expect(counts.details).toBe(1); expect(counts.captions).toBe(0); expect(counts.players).toBe(0);
});
