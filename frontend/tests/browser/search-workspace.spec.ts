import { openResultFilter, openSearchInformation } from './search-controls';
import { test, expect, type Page } from '@playwright/test';
import type { CanonicalPaper, ChatSource, Conversation, ExplorationTurn } from '../../src/lib/conversations';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';
import { chooseDateRange } from './search-controls';

async function setSourcesOpen(page: Page, open: boolean) {
  const picker = page.getByTestId('search-options').locator('details.source-picker');
  if (await picker.evaluate(element => element.hasAttribute('open')) !== open) await picker.locator('summary').click();
}

const paperSource: ChatSource = { ...FIRST_SOURCE, relevance: { label: 'relevant', reason: 'Authored fixture review: the supplied abstract matches the research question.' }, run_id: 'fixture-run-1', title: 'A relevant saved paper', abstract: 'An attributed paper abstract, available before the search completes.' };
const videoSource: ChatSource = { ...FIRST_SOURCE, relevance: { label: 'relevant', reason: 'Authored fixture review: the supplied video description matches the research question.' }, provider: 'youtube', source_ref: 'youtube:fixture-video', record_id: 'abcdEF_12-3', provider_identifiers: { youtube_video_id: 'abcdEF_12-3' }, run_id: 'youtube-run', doi: null, title: 'A relevant research video', resource_type: 'video', abstract: null, description: 'A video search description. No transcript was acquired.', content_state: 'description' };
const paper: CanonicalPaper = { paper_id: 'doi:10.0000/fixture-1', doi: FIRST_SOURCE.doi, representative: paperSource, observations: [paperSource], providers: ['openalex'], access: { status: 'queued' } };
const video: CanonicalPaper = { paper_id: 'source:youtube:fixture-video', representative: videoSource, observations: [videoSource], providers: ['youtube'], access: { status: 'not_applicable' } };

async function installSearch(page: Page, aiReady = true, transcriptBlocked = false) {
  const legacy = await installFixtureApi(page);
  await page.route('https://**/*', route => route.abort());
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#dbe6f7"/></svg>' }));
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Authored player placeholder</p>' }));
  legacy.state.snapshot = { ...legacy.state.snapshot, entities: [FIRST_SOURCE], status: 'succeeded' };
  let saved: Conversation = { id: 'search-conversation', routing: 'auto', title: 'A saved search', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', revision: 0, cursor: 'search:0', status: 'IDLE', providers: [], filters: {}, turns: [] };
  const creates: Record<string, unknown>[] = [], sends: Record<string, unknown>[] = [];
  let reads = 0, transcriptCalls = 0;
  let videoSnapshot = { ...legacy.state.snapshot, id: 'youtube-run', provider: 'youtube', entities: [videoSource], selections: {}, checks: {} };
  await page.route('**/api/research-runs/youtube-run/snapshot', route => route.fulfill({ json: videoSnapshot }));
  await page.route('**/api/research-runs/youtube-run/papers/**/transcript', route => {
    transcriptCalls++;
    videoSnapshot = { ...videoSnapshot, entities: [{ ...videoSource, transcript: { status: transcriptBlocked ? 'blocked' : 'available', origin: 'authored_fixture_captions', language: 'English', is_generated: false, truncated: false, message: 'An authored public-caption block.', segments: transcriptBlocked ? [] : [{ text: 'An authored timestamped transcript.', start: 12, duration: 3 }] } }] };
    return route.fulfill({ json: videoSnapshot });
  });
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [{ id: 'openalex', mode: aiReady ? 'live' : 'fixture', status: 'ready', access_configured: true }, { id: 'youtube', mode: aiReady ? 'live' : 'fixture', status: 'ready', access_configured: true }, { id: 'unpaywall', mode: 'fixture', status: 'needs_access', access_configured: false }] } }));
  await page.route('**/api/config', route => route.fulfill({ json: { generation_enabled: false, generation: { enabled: false }, retrieval: { enabled: aiReady, ready: aiReady, blocked_reason: aiReady ? null : 'The model reservation is unavailable. Topic research requires AI refinement.' } } }));
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/conversations' && request.method() === 'GET') return route.fulfill({ json: { conversations: saved.turns.length ? [saved] : [] } });
    if (path === '/api/conversations') { const body = request.postDataJSON(); creates.push(body); saved = { ...saved, id: creates.length === 1 ? 'search-conversation' : `search-conversation-${creates.length}`, routing: body.routing, providers: body.providers || [], filters: body.filters, turns: [], revision: 0, status: 'IDLE' }; return route.fulfill({ json: saved }); }
    if (path.endsWith('/turns')) {
      const body = request.postDataJSON(); sends.push(body);
      const turn: ExplorationTurn = { id: 'search-turn', message: body.message, routing: body.routing, action: body.action, agentic: body.agentic, ...(body.agentic ? { retrieval: { status: 'planning', round: 1, max_rounds: 2, assessments: [], query_history: [], rejected_count: 0 } } : {}), providers: ['openalex', 'youtube'], status: 'RUNNING', created_at: '2026-11-11T12:00:00Z', run_ids: ['fixture-run-1', 'youtube-run'], sources: [], papers: [], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'automatic', generation: 'disabled' }, source_plan: [{ provider: 'openalex', role: 'discovery', status: 'selected', reason: 'Appropriate scholarly discovery.', health_status: 'ready', mode: 'fixture' }, { provider: 'youtube', role: 'discovery', status: 'selected', reason: 'Video intent.', health_status: 'ready', mode: 'fixture' }] };
      saved = { ...saved, status: 'RUNNING', revision: saved.revision + 1, turns: [turn] }; return route.fulfill({ status: 202, json: saved });
    }
    reads++; return route.fulfill({ json: saved });
  });
  return { legacy, creates, sends, get transcriptCalls() { return transcriptCalls; }, get reads() { return reads; }, async publish(update: Partial<ExplorationTurn>, status: Conversation['status'] = 'RUNNING') { await expect.poll(() => saved.turns.length).toBeGreaterThan(0); const retrieval = saved.turns.at(-1)?.agentic ? { status: status === 'IDLE' ? 'completed' : 'retrieving', round: 1, max_rounds: 2, assessments: [], query_history: [], rejected_count: 0 } : undefined; saved = { ...saved, status, revision: saved.revision + 1, turns: saved.turns.map(turn => ({ ...turn, ...(retrieval ? { retrieval } : {}), ...update })) }; await page.evaluate(snapshot => (window as unknown as { __publishScout: (s: unknown) => void }).__publishScout(snapshot), saved); }, get saved() { return saved; } };
}

test('top Search keeps progressive papers and videos in separate remembered tabs without opening chat', async ({ page }) => {
  const api = await installSearch(page); await page.goto('/app');
  await expect(page.getByRole('tab', { name: /^Papers/ })).toBeVisible(); await expect(page.getByRole('tab', { name: /^Web|^All/ })).toHaveCount(0); await expect(page.getByRole('tab', { name: /^Videos/ })).toBeVisible();
  expect(await page.getByRole('tab', { name: /^Papers/ }).evaluate(el => el.getBoundingClientRect().top + scrollY)).toBeLessThan(650);
  await page.getByTestId('search-settings').locator('summary').click();
  await expect(page.getByRole('switch', { name: 'AI refinement', exact: true })).toBeChecked();
  await page.getByLabel('Research question', { exact: true }).fill('Research papers and video lectures'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForURL(/\?search=search-conversation/); await expect(page.getByRole('button', { name: 'Search workspace', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByLabel('Exploration message')).toHaveCount(0);
  await api.publish({ sources: [paperSource], papers: [paper] }); const first = page.getByTestId('search-result-card'); await expect(first).toHaveCount(1); await expect(first).toContainText(paperSource.abstract!); await first.evaluate(node => node.setAttribute('data-stable', 'yes'));
  await api.publish({ status: 'SUCCEEDED', sources: [paperSource, videoSource], papers: [{ ...paper, access: { status: 'blocked', reason: 'Contact configuration required.' } }, video] }, 'IDLE');
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-status', 'succeeded'); await expect(page.getByTestId('search-result-card')).toHaveCount(1); await expect(page.getByTestId('search-result-card').first()).toHaveAttribute('data-stable', 'yes');
  await page.getByRole('tab', { name: /^Videos/ }).click(); await expect(page.getByTestId('search-result-card')).toHaveCount(1); await expect(page.getByTestId('search-result-card')).toContainText('A video search description'); await expect(page.getByTestId('search-paper-access')).toHaveCount(0);
  await page.getByRole('tab', { name: /^Videos/ }).press('ArrowLeft'); await expect(page.getByRole('tab', { name: /^Papers/ })).toHaveAttribute('aria-selected', 'true'); await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  expect(api.sends).toHaveLength(1); expect(api.creates).toHaveLength(1); expect(api.sends[0]).toMatchObject({ routing: 'auto', agentic: true }); expect(api.legacy.state.starts).toBe(0);
  await page.reload(); await expect(page.getByTestId('search-result-card')).toHaveCount(1); await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('Research papers and video lectures'); expect(api.sends).toHaveLength(1);
});

test('a source opens a right panel while preserving the search, tab, filter and draft', async ({ page }) => {
  const api = await installSearch(page); await page.goto('/app');
  await page.getByLabel('Research question', { exact: true }).fill('A research question'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.waitForURL(/search=/);
  await api.publish({ status: 'SUCCEEDED', sources: [paperSource], papers: [paper] }, 'IDLE');
  await page.getByLabel('Research question', { exact: true }).fill('My unsent next question');
  await (await openResultFilter(page)).fill('relevant');
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toBeVisible(); await expect(page).toHaveURL(/\?search=search-conversation/);
  await expect(page.getByTestId('search-results')).toHaveCount(1);
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByRole('heading', { name: FIRST_SOURCE.title!, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close source details', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('My unsent next question');
  await expect((await openResultFilter(page))).toHaveValue('relevant');
  await expect(page.getByRole('tab', { name: /^Papers/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  // Reopening the active history item must not leave Search disabled.
  await page.getByRole('complementary', { name: 'Workspace navigation', exact: true }).getByRole('button', { name: 'A saved search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  expect(api.sends).toHaveLength(1); expect(api.legacy.state.starts).toBe(0);
});

test('AI-refined top Search stays a search and mobile category views do not add requests', async ({ page }) => {
  const api = await installSearch(page, true); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/app'); await page.getByTestId('search-settings').locator('summary').click(); await expect(page.getByRole('switch', { name: 'AI refinement', exact: true })).toBeChecked();
  await page.getByLabel('Research question', { exact: true }).fill('Improve model context'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.waitForURL(/search=/); expect(api.sends[0].agentic).toBe(true); await expect(page.getByLabel('Exploration message')).toHaveCount(0);
  const relevant = { ...paperSource, relevance: { label: 'relevant' as const, reason: 'Authored model judgment for the fixture.', evidence_quote: 'An attributed paper abstract' } };
  await api.publish({ status: 'SUCCEEDED', sources: [relevant], papers: [{ ...paper, representative: relevant }], related_sources: [{ ...paperSource, source_ref: 'crossref:partial', provider: 'crossref', relevance: { label: 'partial', reason: 'Adjacent fixture evidence.' } }] }, 'IDLE');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1); await expect(page.getByText('Related or uncertain records (1)', { exact: true })).toBeVisible();
  expect(await page.getByRole('tab', { name: /^Papers/ }).evaluate(el => el.getBoundingClientRect().top + scrollY)).toBeLessThan(850);
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await page.getByRole('tab', { name: /^Videos/ }).click(); await page.getByRole('tab', { name: /^Papers/ }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
  expect(api.sends).toHaveLength(1); await page.getByRole('button', { name: 'New research', exact: true }).click(); await expect(page.getByTestId('search-result-card')).toHaveCount(0); await expect(page.getByLabel('Research question', { exact: true })).toHaveValue(''); expect(api.sends).toHaveLength(1);
});


test('a new manual AI-refined search replaces prior grouped Search results', async ({ page }) => {
  const api = await installSearch(page); await page.goto('/app'); await page.getByLabel('Research question', { exact: true }).fill('First grouped search'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.waitForURL(/search=/); await api.publish({ status: 'SUCCEEDED', sources: [paperSource], papers: [paper] }, 'IDLE'); await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await page.getByTestId('search-settings').locator('summary').click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByLabel('Research question', { exact: true }).fill('Second manual search'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect.poll(() => api.sends.length).toBe(2); await expect(page.getByTestId('search-results')).toBeVisible(); await expect(page.getByTestId('search-result-card')).toHaveCount(0); expect(api.sends[1]).toMatchObject({ message: 'Second manual search', routing: 'manual', providers: ['openalex'], agentic: true }); expect(api.legacy.state.starts).toBe(0);
});

test('source removals and adaptive date presets survive reload, history and New research', async ({ page }) => {
  const api = await installSearch(page);
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'));
  await page.goto('/app');
  await setSourcesOpen(page, true);
  await expect(page.getByLabel('Selected search sources')).toBeVisible();
  await expect(page.getByLabel('Selected search sources')).toContainText('OpenAlex');
  await expect(page.getByLabel('Selected search sources')).toContainText('Crossref');
  await expect(page.getByLabel('Selected search sources')).toContainText('arXiv');
  await expect(page.getByLabel('Selected search sources')).toContainText('YouTube');
  await expect(page.getByRole('slider', { name: 'Date range', exact: true })).toHaveValue('3');
  await page.getByRole('button', { name: 'Remove Crossref', exact: true }).click();
  await setSourcesOpen(page, false);
  await chooseDateRange(page, '2');
  await page.reload();
  await setSourcesOpen(page, true);
  await expect(page.getByRole('button', { name: 'Remove Crossref', exact: true })).toHaveCount(0);
  await setSourcesOpen(page, false);
  await expect(page.getByRole('slider', { name: 'Date range', exact: true })).toHaveValue('1');
  await page.getByLabel('Research question', { exact: true }).fill('Adaptive date and selected sources');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForURL(/search=/);
  expect(api.creates[0]).toMatchObject({ source_scope: ['openalex', 'arxiv', 'youtube'], filters: { year_from: 2025, year_to: 2026 } });
  expect(api.sends[0]).toMatchObject({ source_scope: ['openalex', 'arxiv', 'youtube'], filters: { year_from: 2025, year_to: 2026 } });
  await api.publish({ status: 'SUCCEEDED', sources: [paperSource, videoSource], papers: [paper, video] }, 'IDLE');
  await chooseDateRange(page, '3');
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: /^Videos/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await expect(page.getByTestId('search-result-card')).toHaveAttribute('data-resource-kind', 'video');
  await expect(page.getByRole('slider', { name: 'Date range', exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'New research', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Date range', exact: true })).toHaveValue('2');
  await setSourcesOpen(page, true);
  await expect(page.getByRole('button', { name: 'Remove Crossref', exact: true })).toHaveCount(0);
  await setSourcesOpen(page, false);
  await page.clock.setFixedTime(new Date('2027-02-01T12:00:00Z'));
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Date range', exact: true })).toHaveAttribute('aria-valuetext', /2025–2027/);
  await expect(page.getByTestId('search-options').locator('.date-range-hint')).toHaveAttribute('title', '2025–2027');
  expect(api.sends).toHaveLength(1);
});

test('custom years persist and a literature-only search with no sources cannot fall back accidentally', async ({ page }) => {
  const api = await installSearch(page); await page.goto('/app');
  await page.getByRole('button', { name: 'Search result limits', exact: true }).click();
  await page.getByRole('slider', { name: 'Data per catalog', exact: true }).press('Home');
  await page.getByRole('slider', { name: 'Repos', exact: true }).press('Home');
  await page.keyboard.press('Escape');
  await chooseDateRange(page, 'custom');
  await page.getByLabel('Custom publication year from').fill('2019');
  await page.getByLabel('Custom publication year to').fill('2024');
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Date range', exact: true })).toHaveValue('4');
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  await expect(page.getByLabel('Custom publication year from')).toHaveValue('2019');
  await expect(page.getByLabel('Custom publication year to')).toHaveValue('2024');
  await setSourcesOpen(page, true);
  for (const label of ['OpenAlex', 'Crossref', 'arXiv', 'YouTube']) await page.getByRole('button', { name: `Remove ${label}`, exact: true }).click();
  await setSourcesOpen(page, false);
  await page.getByLabel('Research question', { exact: true }).fill('No selected sources');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await page.reload();
  await setSourcesOpen(page, true);
  await expect(page.getByLabel('Selected search sources')).toBeVisible();
  await expect(page.getByLabel('Selected search sources')).toContainText('Select a paper/video source');
  await page.getByRole('checkbox', { name: 'Search YouTube', exact: true }).check();
  await setSourcesOpen(page, false);
  await page.getByLabel('Research question', { exact: true }).fill('Video context tutorials');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForURL(/search=/);
  expect(api.sends[0]).toMatchObject({ source_scope: ['youtube'], filters: { year_from: 2019, year_to: 2024 } });
  expect(api.sends).toHaveLength(1);
});

test('exact dataset registry metadata is preserved in Data and is not counted as a paper', async ({ page }) => {
  const api = await installSearch(page); await page.goto('/app');
  await page.getByLabel('Research question', { exact: true }).fill('10.1234/dataset');
  await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.waitForURL(/search=/);
  await api.publish({ action: 'lookup', status: 'SUCCEEDED', sources: [{ ...paperSource, provider: 'datacite', resource_type: 'dataset', title: 'An exact registry dataset record' }], papers: [] }, 'IDLE');
  await expect(page.getByRole('tab', { name: /^Papers/ })).toHaveText(/Papers\s*0/);
  await page.getByRole('tab', { name: /^Data/ }).click();
  await expect(page.getByTestId('dataset-card')).toHaveCount(1);
  await expect(page.getByTestId('dataset-card')).toContainText('An exact registry dataset record');
  await expect(page.getByTestId('dataset-card')).toContainText('Dataset');
  await expect(page.getByRole('tab', { name: /^Data/ })).toHaveAttribute('aria-selected', 'true');
  expect(api.sends).toHaveLength(1);
});

test('video thumbnails open a stable preview and transcript loading is explicit and saved', async ({ page }) => {
  const api = await installSearch(page); await page.goto('/app');
  await page.getByLabel('Research question', { exact: true }).fill('Video research'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.waitForURL(/search=/);
  await api.publish({ status: 'SUCCEEDED', sources: [paperSource, videoSource], papers: [paper, video] }, 'IDLE');
  await page.getByRole('tab', { name: /^Videos/ }).click();
  await expect(page.getByTestId('search-result-card').getByRole('img', { name: /^Video thumbnail/ })).toHaveAttribute('src', /i.ytimg.com\/vi\/abcdEF_12-3/);
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  const dialog = page.getByRole('complementary', { name: 'Source details', exact: true }); await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/search=search-conversation/); expect(api.transcriptCalls).toBe(0);
  await expect(dialog.locator('iframe')).toHaveCount(0);
  await dialog.getByRole('button', { name: /^Preview video:/ }).click();
  await expect(dialog.locator('iframe')).toHaveAttribute('src', /youtube-nocookie.com\/embed\/abcdEF_12-3/);
  await dialog.getByRole('button', { name: 'Load transcript', exact: true }).click();
  await expect(dialog.getByTestId('video-transcript')).toContainText('An authored timestamped transcript.');
  await expect(dialog.getByTestId('video-transcript').getByRole('link', { name: '0:12', exact: true })).toHaveAttribute('href', /t=12s/);
  expect(api.transcriptCalls).toBe(1);
  await page.getByRole('button', { name: 'Close source details', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Videos/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByTestId('video-transcript')).toContainText('An authored timestamped transcript.');
  expect(api.transcriptCalls).toBe(1); expect(api.sends).toHaveLength(1);
  await page.keyboard.press('Escape'); await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toHaveCount(0);
});

test('blocked captions leave the video usable and do not retry automatically', async ({ page }) => {
  const api = await installSearch(page, true, true); await page.goto('/app');
  await page.getByLabel('Research question', { exact: true }).fill('Video research'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.waitForURL(/search=/);
  await api.publish({ status: 'SUCCEEDED', sources: [videoSource], papers: [video] }, 'IDLE');
  await page.getByRole('tab', { name: /^Videos/ }).click(); await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  await page.getByRole('complementary', { name: 'Source details', exact: true }).getByRole('button', { name: 'Load transcript', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByTestId('video-transcript')).toContainText('Transcript access blocked');
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByRole('button', { name: 'Retry transcript', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByRole('link', { name: /Open on YouTube/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Close source details', exact: true }).click(); await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true }).getByTestId('video-transcript')).toContainText('Transcript access blocked');
  expect(api.transcriptCalls).toBe(1); expect(api.sends).toHaveLength(1);
  await page.keyboard.press('Escape');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toBeVisible(); expect(await page.getByRole('complementary', { name: 'Source details', exact: true }).evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Close source details', exact: true }).click();
    await expect(page.getByRole('tab', { name: /^Videos/ })).toHaveAttribute('aria-selected', 'true');
  }
});

test('a delayed preview cannot replace a newly cleared search', async ({ page }) => {
  const api = await installSearch(page); await page.goto('/app');
  await page.getByLabel('Research question', { exact: true }).fill('Video research'); await page.getByRole('button', { name: 'Search', exact: true }).click(); await page.waitForURL(/search=/);
  await api.publish({ status: 'SUCCEEDED', sources: [videoSource], papers: [video] }, 'IDLE');
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; }); const arrived = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/research-runs/youtube-run/snapshot', async route => { started(); await pending; await route.fulfill({ json: { ...api.legacy.state.snapshot, id: 'youtube-run', provider: 'youtube', entities: [videoSource] } }); });
  await page.getByRole('tab', { name: /^Videos/ }).click(); await page.getByTestId('search-result-card').getByRole('button', { name: 'Preview details', exact: true }).click(); await arrived;
  await page.getByRole('button', { name: 'New research', exact: true }).click();
  const response = page.waitForResponse('**/api/research-runs/youtube-run/snapshot'); release(); await response;
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue(''); await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toHaveCount(0); await expect(page.getByTestId('search-result-card')).toHaveCount(0);
  expect(api.sends).toHaveLength(1);
});

test('startup tabs wait for hydration and an early Videos choice survives a delayed saved search', async ({ page }) => {
  await installSearch(page);
  let hydrate!: () => void, reveal!: () => void;
  const scripts = new Promise<void>(resolve => { hydrate = resolve; }); const data = new Promise<void>(resolve => { reveal = resolve; });
  await page.route('**/_next/static/chunks/**', async route => { if (new URL(route.request().url()).pathname.endsWith('.js')) await scripts; await route.continue(); });
  await page.route('**/api/conversations/search-conversation', async route => { await data; await route.fulfill({ json: {
    id: 'search-conversation', routing: 'auto', title: 'Delayed saved search', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', revision: 1, status: 'IDLE', providers: ['openalex','youtube'], filters: {}, turns: [{ id: 'saved-turn', action: 'discover', routing: 'auto', message: 'A saved video question', status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['openalex','youtube'], sources: [paperSource,videoSource], papers: [paper,video], run_ids: [], warnings: [], response: '', usage: {research_attempts:0,model_http_attempts:0,model_cost_usd:0}, plan: {routing:'automatic',generation:'disabled'} }]
  } }); });
  await page.goto('/app?search=search-conversation', { waitUntil: 'commit' });
  await expect(page.getByRole('tab', { name: /^Videos/ })).toBeDisabled();
  hydrate(); await expect(page.getByRole('tab', { name: /^Videos/ })).toBeEnabled();
  await page.getByLabel('Research question', { exact: true }).fill('Draft while saved results are loading');
  await page.getByRole('tab', { name: /^Videos/ }).click(); reveal();
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await expect(page.getByTestId('search-result-card')).toHaveAttribute('data-resource-kind','video');
  await expect(page.getByLabel('Research question', { exact: true })).toHaveValue('Draft while saved results are loading');
  await expect(page.getByRole('tab', { name: /^Videos/ })).toHaveAttribute('aria-selected','true');
});
