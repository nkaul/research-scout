import { test, expect } from '@playwright/test';
import { admitFixtureDiscovery } from './diagnostic-discovery';
import { openSearchInformation } from './search-controls';

test('restored workspace retains automatic YouTube descriptions alongside papers and saved replay', async ({ page, request }) => {
  test.skip(process.env.SCOUT_BROWSER_INTEGRATION !== '1', 'Requires explicit local fixture services.');
  const config = await (await request.get('/api/providers')).json();
  expect(config.providers).toHaveLength(9);
  expect(config.providers.every((p: { mode: string }) => p.mode === 'fixture')).toBe(true);
  const diagnostic = await admitFixtureDiscovery(request, 'Video tutorials and lectures about retrieval augmented generation');
  await page.goto(`/app?search=${diagnostic.id}`);
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-status', /succeeded|partial/, { timeout: 40_000 });
  const id = new URL(page.url()).searchParams.get('search');
  const saved = await (await request.get(`/api/conversations/${id}`)).json();
  const turn = saved.turns.at(-1);
  expect(turn.providers).toContain('youtube'); expect(turn.providers).toContain('openalex');
  expect(turn.providers).not.toContain('europe_pmc');
  expect(turn.usage.model_http_attempts).toBe(0);
  const videos = turn.papers.filter((p: { representative: { resource_type: string } }) => p.representative.resource_type === 'video');
  expect(videos.length).toBeGreaterThan(0);
  expect(videos.every((p: { doi: string | null; access: { status: string }; representative: { abstract: string | null; description: string } }) => !p.doi && p.access.status === 'not_applicable' && !p.representative.abstract && !!p.representative.description)).toBe(true);
  const paperCount = 4; // Exact citation duplicates share a display card.
  const information = await openSearchInformation(page, 'Search overview');
  const outcomes = information.getByTestId('saved-search-limits');
  await expect(outcomes.getByRole('row', { name: /^Papers/ }).getByRole('cell').nth(2)).toHaveText(String(paperCount));
  await expect(outcomes.getByRole('row', { name: /^Videos/ }).getByRole('cell').nth(2)).toHaveText(String(videos.length));
  await openSearchInformation(page, 'Sources and coverage');
  await expect(information.getByTestId('search-coverage-details')).toContainText('Matching DOI or exact citation records appear once');
  await expect(information.getByTestId('search-coverage-details')).toContainText('provider observations and historical evidence versions remain separately preserved');
  const videoSource = videos[0].representative;
  const snapshotUrl = `/api/research-runs/${encodeURIComponent(videoSource.run_id)}/snapshot`;
  const beforeCaptions = await (await request.get(snapshotUrl)).json();
  const postRequests: string[] = []; page.on('request', r => { if (r.method() === 'POST') postRequests.push(r.url()); });
  await expect(page.getByTestId('search-result-card')).toHaveCount(paperCount);
  await page.getByRole('tab', { name: /^Videos\s*\d*$/ }).click();
  const video = page.locator('[data-testid="search-result-card"][data-resource-kind="video"]').first();
  await expect(video.getByTestId('chat-abstract')).toContainText('Description');
  await video.getByRole('button', { name: 'Read available description', exact: true }).click();
  await expect(video.locator('.chat-abstract-text')).toHaveClass(/expanded/);
  await video.getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByTestId('video-transcript')).toContainText('Load transcript');
  await page.getByRole('complementary', { name: 'Source details', exact: true }).getByRole('button', { name: 'Load transcript', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByTestId('video-transcript')).toContainText('Fictional transcript: context retrieval');
  const afterCaptions = await (await request.get(snapshotUrl)).json();
  // A repeated fixture run may reuse the provider's caption cache. Both paths
  // must stay within one attempt and persist the separately acquired captions.
  const captionAttempts = afterCaptions.usage.research_attempts - beforeCaptions.usage.research_attempts;
  expect([0, 1]).toContain(captionAttempts);
  expect(afterCaptions.entities.find((source: { source_ref: string }) => source.source_ref === videoSource.source_ref).transcript.status).toBe('available');
  const savedAfterCaptions = await (await request.get(`/api/conversations/${id}`)).json();
  await page.getByRole('button', { name: 'Close source details', exact: true }).click();
  await page.getByRole('tab', { name: /^Videos\s*\d*$/ }).click();
  await expect(page.getByTestId('search-result-card')).toHaveCount(videos.length);
  await expect(page.getByRole('tab', { name: /^Web|^All/ })).toHaveCount(0);
  await page.getByRole('tab', { name: /^Papers\s*\d*$/ }).click();
  await expect(page.getByTestId('search-result-card')).toHaveCount(paperCount);
  expect(postRequests).toHaveLength(1); expect(postRequests[0]).toMatch(/\/transcript$/);
  await page.reload(); await expect(page.getByTestId('search-result-card')).toHaveCount(paperCount);
  const replay = await (await request.get(`/api/conversations/${id}`)).json();
  expect(replay.turns.at(-1).usage).toEqual(savedAfterCaptions.turns.at(-1).usage);
  expect((await (await request.get(snapshotUrl)).json()).usage).toEqual(afterCaptions.usage);
  expect(postRequests).toHaveLength(1);
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
});
