import { expect, test, type Page } from '@playwright/test';
import type { Conversation, ExplorationTurn } from '../../src/lib/conversations';
import { readmeStatus, type RepositoryRecord, type RepositorySearch, type RepositoryNote, type RepositoryReadmeArtifact } from '../../src/lib/repositories';
import { installFixtureApi } from './fixture-api';

const created = '2026-11-14T12:00:00Z', sha = 'a'.repeat(40);
const original = '# Saved source\n\n' + Array.from({ length: 22 }, (_, index) => 'Original paragraph ' + (index + 1) + ' explains a supplied retrieval method and its documented limitations.').join('\n\n') + '\n\n<img src="https://untrusted.example/image.png" onerror="window.injected=true">';
function repo(id = '101', overrides: Partial<RepositoryRecord> = {}): RepositoryRecord {
  const name = 'example/retrieval-' + id, source = 'https://api.github.com/repos/' + name + '/git/blobs/' + sha;
  return { repo_id: 'github:' + id, observation_id: id + ':v1', provider: 'github', record_id: id, resource_type: 'repository', full_name: name, title: name, description: 'Supplied repository description.', url: 'https://github.com/' + name, default_branch: 'main', language: 'Python', topics: ['retrieval', 'evaluation', 'language-models', 'benchmark', 'source-five', 'source-six', 'source-seven', 'source-eight'], stars: 12, forks: 3, open_issues: 2, license: 'Apache-2.0', archived: false, fork: false, updated_at: created, pushed_at: created, metadata_version: 'metadata-v1', evidence_version: 'evidence-v1', mode: 'fixture', observed_at: created,
    readme: { status: 'available', sha, path: 'README.md', source_url: source, web_url: 'https://github.com/' + name + '/blob/main/README.md', repository_id_revalidated: true, identity_checked_at: created, artifact_available: true, evidence: Array.from({ length: 8 }, (_, index) => ({ id: 'E' + (index + 1), section: 'Source section ' + (index + 1), text: 'Source point ' + (index + 1) + ' describes retrieval evaluation with stated limitations.', start_line: index * 2 + 1, end_line: index * 2 + 1, source_url: source, source_sha: sha })), truncated: true },
    match: { status: 'candidate', score: 2.4, method: 'local_bm25_metadata_readme_v1', matched_terms: ['retrieval', 'evaluation'], evidence_ids: ['E1'], reason: 'Saved source mentions retrieval evaluation.', missing_constraints: ['Task-specific quality has not been verified.'], model_reviewed: false }, ...overrides };
}
async function installReading(page: Page, records = [repo(), repo('102')]) {
  await installFixtureApi(page);
  const question = 'Find repositories for retrieval evaluation';
  const turn: ExplorationTurn = { id: 'repo-reading-turn', message: question, action: 'discover', agentic: false, status: 'SUCCEEDED', created_at: created, completed_at: created, routing: 'auto', providers: [], sources: [], papers: [], run_ids: [], warnings: [], response: '', usage: { model_http_attempts: 0, research_attempts: 0, model_cost_usd: 0 }, modality_limits: { papers: 0, videos: 0, datasets: 0, repos: 10 }, resource_jobs: { repos: { status: 'SUCCEEDED', phase: 'completed', limit: 10, search_id: 'repo-reading-search', record_count: records.length, candidate_count: records.filter(record => record.match.status === 'candidate').length } } };
  const parent: Conversation = { id: 'repo-reading-parent', title: question, status: 'IDLE', revision: 1, cursor: 'parent:1', created_at: created, updated_at: created, providers: [], filters: {}, turns: [turn] };
  const snapshot: RepositorySearch = { id: 'repo-reading-search', status: 'SUCCEEDED', revision: 1, cursor: 'reading:1', question, limit: 10, readme_limit: 5, identity_check_limit: 5, request_limit: 11, context: { conversation_id: parent.id, turn_id: turn.id, fingerprint: 'reading-context', intent: question, domain: null, keywords: ['retrieval'], tags: ['query-focus'], query: question, query_mode: 'direct' }, records, provider_activity: [], timing_spans: [], warnings: [], usage: { model_http_attempts: 0 }, created_at: created, completed_at: created };
  let note: RepositoryNote = { id: 'note-101', conversation_id: parent.id, turn_id: turn.id, record_id: '101', text: '', revision: 0, evidence_version: null, updated_at: null, references: [] };
  const artifacts: string[] = [], noteReads: string[] = [], writes: { method: string; path: string; body: unknown }[] = [];
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [parent] } }));
  await page.route('**/api/conversations/repo-reading-parent', route => route.fulfill({ json: parent }));
  await page.route('**/api/repo-providers', route => route.fulfill({ json: { providers: [{ id: 'github', status: 'ready', mode: 'fixture' }] } }));
  await page.route('**/api/repo-searches/repo-reading-search', route => route.fulfill({ json: snapshot }));
  await page.route(/\/api\/repo-searches\/repo-reading-search\/records\/\d+\/evidence\/[^/]+$/, route => route.fulfill({ json: records.find(record => record.record_id === new URL(route.request().url()).pathname.split('/').at(-3)) }));
  await page.route(/\/api\/repo-searches\/repo-reading-search\/records\/\d+\/readme(?:\?.*)?$/, route => {
    const url = new URL(route.request().url()), id = url.pathname.split('/').at(-2)!;
    artifacts.push(url.pathname + url.search);
    const record = records.find(item => item.record_id === id)!;
    const artifact: RepositoryReadmeArtifact = { text: original, record_id: id, evidence_version: record.evidence_version, source_sha: sha, source_url: record.readme.source_url!, parser_policy: 'fixture-parser', transformed: true, transformations: ['credential_redaction'], complete: false, content_sha256: 'b'.repeat(64) };
    return route.fulfill({ json: artifact });
  });
  await page.route(/\/api\/repo-searches\/repo-reading-search\/records\/\d+\/notes$/, async route => {
    const req = route.request(), id = new URL(req.url()).pathname.split('/').at(-2)!;
    if (req.method() === 'GET') { noteReads.push(id); return route.fulfill({ json: id === '101' ? note : { ...note, id: 'note-' + id, record_id: id, text: '', revision: 0, references: [] } }); }
    const body = req.postDataJSON(); writes.push({ method: req.method(), path: new URL(req.url()).pathname, body });
    if (body.expected_revision !== note.revision) return route.fulfill({ status: 409, json: { detail: 'Saved note revision changed.' } });
    note = { ...note, text: body.text, revision: note.revision + 1, evidence_version: body.evidence_version, updated_at: created, references: [{ search_id: snapshot.id, record_id: id, evidence_version: body.evidence_version, observation_id: records[0].observation_id, full_name: records[0].full_name, source_sha: sha, source_url: records[0].readme.source_url, artifact_available: true }] };
    return route.fulfill({ json: note });
  });
  return { artifacts, noteReads, writes, externalEdit() { note = { ...note, text: 'A separately saved edit.', revision: note.revision + 1 }; } };
}
async function openRepos(page: Page) { await page.goto('/app?search=repo-reading-parent'); await page.getByRole('tab', { name: /^Repos/ }).click(); await expect(page.getByTestId('repo-card').first()).toBeVisible(); }

test('README outcome labels distinguish interrupted, too-large, identity, access and empty excerpts', () => {
  const record = repo();
  expect(readmeStatus({ ...record, readme: { ...record.readme, status: 'not_assessed', error: { code: 'README_INTERRUPTED', message: 'Stopped.' } } })).toBe('README not fetched · search stopped');
  expect(readmeStatus({ ...record, readme: { ...record.readme, status: 'blocked', error: { code: 'README_TOO_LARGE', message: 'Too large.' } } })).toContain('too large');
  expect(readmeStatus({ ...record, readme: { ...record.readme, status: 'error', error: { code: 'README_IDENTITY_CHANGED', message: 'Changed.' } } })).toContain('identity check');
  expect(readmeStatus({ ...record, readme: { ...record.readme, status: 'missing' } })).toBe('README unavailable at the public endpoint');
  expect(readmeStatus({ ...record, readme: { ...record.readme, evidence: [] } })).toContain('no readable excerpts');
});

test('README previews expand independently and Original reads one version-pinned saved artifact without acquisition', async ({ page }) => {
  const api = await installReading(page); await openRepos(page);
  const card = page.getByTestId('repo-card').first(), reader = page.getByTestId('repo-reader');
  await expect(card.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(2);
  await expect(reader.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(4);
  expect(api.artifacts).toEqual([]); expect(api.noteReads).toEqual([]);
  await card.getByRole('button', { name: 'Read more', exact: true }).click();
  await expect(card.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(8);
  await expect(reader.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(4);
  await reader.getByRole('button', { name: 'Read more', exact: true }).click();
  await expect(reader.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(8);
  expect(api.artifacts).toEqual([]);
  await card.getByRole('button', { name: 'Original saved README', exact: true }).click();
  await expect(card.getByTestId('readable-original')).toHaveText(original);
  await expect(card).toContainText('sanitized');
  await reader.getByRole('button', { name: 'Original saved README', exact: true }).click();
  await expect(reader.getByTestId('readable-original')).toHaveText(original);
  expect(api.artifacts).toHaveLength(1); expect(api.artifacts[0]).toContain('evidence_version=evidence-v1');
  await expect(page.locator('img[src="https://untrusted.example/image.png"]')).toHaveCount(0);
  expect(api.writes).toEqual([]);
});

test('all retained GitHub topics remain inspectable and unknown fit stays separate from README status', async ({ page }) => {
  const metadataOnly = repo('102'); metadataOnly.readme = { ...metadataOnly.readme, status: 'not_assessed', artifact_available: false, evidence: [], sha: null, source_url: null };
  const unknown = repo('103', { match: { ...repo().match, status: 'unknown' } }); unknown.readme.artifact_available = false;
  const api = await installReading(page, [repo(), metadataOnly, unknown]); await openRepos(page);
  await expect(page.getByTestId('repo-card')).toHaveCount(2);
  await expect(page.getByTestId('repo-card').nth(1)).toContainText('Metadata only');
  await page.getByRole('button', { name: /Show other fetched repos \(1\)/ }).click();
  await expect(page.getByTestId('repo-card')).toHaveCount(3);
  await expect(page.getByTestId('repo-card').nth(2)).toContainText('Relevance not established');
  const reader = page.getByTestId('repo-reader'); await reader.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(reader.getByLabel('All GitHub topics').getByRole('button')).toHaveCount(8);
  await reader.getByLabel('All GitHub topics').getByRole('button', { name: 'source-eight', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clear topic: source-eight', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear topic: source-eight', exact: true }).click();
  const historical = page.getByTestId('repo-card').nth(2); await historical.getByRole('button', { name: 'Saved excerpts', exact: true }).click();
  await expect(historical.getByTestId('readable-original')).toContainText('Source point 1');
  expect(api.artifacts).toEqual([]); expect(api.writes).toEqual([]);
});

test('repository drafts survive reader and resource switching, persist, and retain text on conflicting saves', async ({ page }) => {
  const api = await installReading(page); await openRepos(page);
  const reader = page.getByTestId('repo-reader'); await reader.getByRole('tab', { name: 'Notes', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Your repository note', exact: true }); await expect(note).toBeEnabled(); expect(api.noteReads).toEqual(['101']);
  await note.fill('Keep this source and its limitations.');
  await page.getByTestId('repo-card').nth(1).hover(); await expect(reader.locator('header')).toContainText('retrieval-101');
  await page.getByRole('tab', { name: /^Papers/ }).click(); await page.getByRole('tab', { name: /^Repos/ }).click();
  await expect(note).toHaveValue('Keep this source and its limitations.');
  await reader.getByRole('button', { name: 'Save note', exact: true }).click(); await expect(reader).not.toContainText('Unsaved draft');
  expect(api.writes).toHaveLength(1); expect(api.writes[0].body).toMatchObject({ expected_revision: 0, evidence_version: 'evidence-v1' });
  await reader.getByText('Saved evidence references (1)', { exact: true }).click(); await reader.getByRole('button', { name: 'Inspect saved evidence', exact: true }).click(); await expect(reader).toContainText('Source point 8');
  await page.reload(); await page.getByRole('tab', { name: /^Repos/ }).click(); await reader.getByRole('tab', { name: 'Notes', exact: true }).click();
  await expect(note).toHaveValue('Keep this source and its limitations.');
  api.externalEdit(); await note.fill('My draft must survive a conflict.'); await reader.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(reader.getByRole('alert')).toContainText('draft is retained'); await expect(note).toHaveValue('My draft must survive a conflict.');
  await reader.getByRole('button', { name: 'Review latest saved note', exact: true }).click();
  await expect(note).toHaveValue('My draft must survive a conflict.'); await reader.getByText('Latest saved note', { exact: true }).click(); await expect(reader).toContainText('A separately saved edit.');
  await reader.getByRole('button', { name: 'Save note', exact: true }).click(); await expect(reader).not.toContainText('Unsaved draft');
  expect(api.writes).toHaveLength(3);
});

test('repository reader scrolls the tab body with fixed controls and narrow layouts stay bounded', async ({ page }) => {
  const api = await installReading(page, [repo()]); await page.setViewportSize({ width: 1440, height: 800 }); await openRepos(page);
  const reader = page.getByTestId('repo-reader'), panel = reader.getByRole('tabpanel');
  await reader.getByRole('button', { name: 'Original saved README', exact: true }).click(); await expect(reader.getByTestId('readable-original')).toBeVisible();
  await reader.getByRole('button', { name: 'Read more', exact: true }).click(); await reader.evaluate(node => node.scrollIntoView({ block: 'start' }));
  const before = (await reader.locator('header').boundingBox())!.y;
  await panel.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
  expect((await reader.locator('header').boundingBox())!.y).toBeCloseTo(before, 0);
  await expect(reader.getByRole('link', { name: 'Open repository', exact: true })).toBeInViewport();
  await reader.getByRole('tab', { name: 'Metadata', exact: true }).click(); await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBe(0);
  for (const width of [390, 320, 768]) { await page.setViewportSize({ width, height: 850 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
  expect(api.writes).toEqual([]);
});

test('mobile README controls keep inline intent and opening the reader remains explicit', async ({ page }) => {
  const api = await installReading(page, [repo()]); await page.setViewportSize({ width: 390, height: 850 }); await openRepos(page);
  const card = page.getByTestId('repo-card').first(); await expect(page.getByTestId('repo-reader')).toHaveCount(0);
  await card.getByRole('button', { name: 'Read more', exact: true }).click(); await expect(card.getByRole('button', { name: 'Read less', exact: true })).toBeFocused();
  await expect(page.getByTestId('repo-reader')).toHaveCount(0);
  await card.getByRole('button', { name: 'Original saved README', exact: true }).click(); await expect(card.getByTestId('readable-original')).toHaveText(original);
  await expect(page.getByTestId('repo-reader')).toHaveCount(0);
  await card.getByRole('button', { name: 'View repository details', exact: true }).click(); await expect(page.getByTestId('repo-reader')).toBeVisible();
  expect(api.artifacts).toHaveLength(1); expect(api.writes).toEqual([]);
});
