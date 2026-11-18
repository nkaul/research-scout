import { sharedPlanningFields } from './planning-fixture';
import { openSearchInformation } from './search-controls';
import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation, ExplorationTurn } from '../../src/lib/conversations';
import type { RepositoryRecord, RepositorySearch } from '../../src/lib/repositories';
import { repositoryRecords, repositoryUrl, readmeSourceUrl } from '../../src/lib/repositories';
import { searchResourceKind } from '../../src/lib/search-resources';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const created = '2026-11-14T12:00:00Z', sha = 'a'.repeat(40);
const paper: ChatSource = { ...FIRST_SOURCE, run_id: 'repo-paper', relevance: { label: 'relevant', reason: 'Authored paper fixture.' } };
function turn(agentic = true): ExplorationTurn {
  return { id: 'repo-parent-turn', message: 'Find repositories for retrieval evaluation', action: 'discover', agentic, status: 'SUCCEEDED', created_at: created, completed_at: '2026-11-14T12:00:01Z', providers: ['openalex'], sources: [paper], run_ids: [paper.run_id], warnings: [], response: '', usage: { research_attempts: 0, model_http_attempts: agentic ? 1 : 0, model_cost_usd: 0 }, plan: { routing: 'bounded_agentic_retrieval', generation: 'disabled' }, ...(agentic ? { retrieval: { ...sharedPlanningFields(), status: 'completed', intent: 'Evaluate retrieved evidence for language model generation', domain: 'Machine learning', lexical_query: 'retrieval evaluation', keywords: ['retrieval', 'question answering'], tags: ['RAG'] } } : {}) };
}
function repo(id = '101', name = 'example/retrieval-eval', readme = true): RepositoryRecord {
  return { repo_id: 'github:' + id, observation_id: id + ':v1', provider: 'github', record_id: id, resource_type: 'repository', full_name: name, title: name, description: 'Authored repository fixture for retrieval evaluation.', url: 'https://github.com/' + name, default_branch: 'main', language: 'Python', topics: ['retrieval', 'evaluation'], stars: 12, forks: 3, open_issues: 2, license: 'Apache-2.0', archived: false, fork: false, updated_at: created, pushed_at: created, metadata_version: 'metadata-v1', evidence_version: 'evidence-v1', mode: 'fixture', observed_at: created,
    readme: { status: readme ? 'available' : 'not_assessed', sha: readme ? sha : null, path: readme ? 'README.md' : null, source_url: readme ? `https://api.github.com/repos/${name}/git/blobs/${sha}` : null, web_url: readme ? `https://github.com/${name}/blob/main/README.md` : null, coordinate_basis: 'original_markdown_lines', repository_id_revalidated:readme, identity_checked_at:created, evidence: readme ? [{ id: 'E1', section: 'Evaluation', text: 'Evaluate retrieved evidence for question answering with this authored fixture.', start_line: 4, end_line: 6, source_url: `https://api.github.com/repos/${name}/git/blobs/${sha}`, source_sha: sha }] : [], truncated: false },
    match: { status: 'candidate', score: 2.4, method: 'local_bm25_metadata_readme_v1', matched_terms: ['retrieval', 'evaluation'], evidence_ids: readme ? ['E1'] : [], reason: 'Metadata and selected README text mention retrieval evaluation.', missing_constraints: ['Check task-specific quality and maintenance'], model_reviewed: false } };
}
function snapshot(records: RepositoryRecord[] = [], status = 'RUNNING'): RepositorySearch {
  return { id: 'repo-search-1', status, revision: 1, cursor: 'repos:1', question: 'Find repositories for retrieval evaluation', limit: 10, readme_limit: 5, request_limit:11, identity_check_limit:5, context: { conversation_id: 'repo-parent', turn_id: 'repo-parent-turn', fingerprint: 'fixture-context', intent: 'Evaluate retrieved evidence for language model generation', domain: 'Machine learning', keywords: ['retrieval', 'question answering'], tags: ['RAG'], query: 'retrieval evaluation' }, records, provider_activity: [{ provider: 'github', status: status === 'RUNNING' ? 'running' : 'succeeded', attempts: 2, query: 'retrieval evaluation in:name,description,topics,readme is:public', executed_arguments: { per_page: 10, readme_limit: 5 } }], timing_spans: [{id:'github-search',phase:'repository_search',label:'GitHub repository search',provider:'github',status:'succeeded',started_at:created,completed_at:'2026-11-14T12:00:00.500Z',executed_arguments:{q:'retrieval evaluation in:name,description,topics,readme is:public',per_page:10}},{id:'readme:101',phase:'readme',label:'README 101',provider:'github',status:'succeeded',started_at:'2026-11-14T12:00:00.500Z',completed_at:'2026-11-14T12:00:01Z',executed_arguments:{path:'/repos/example/retrieval-eval/readme'}}], warnings: [], usage: { repository_attempts: 2, model_http_attempts: 0 }, created_at: created, ...(status === 'RUNNING' ? {} : { completed_at: '2026-11-14T12:00:02Z' }) };
}
async function install(page: Page, { parentTurn = turn(), saved = null as RepositorySearch | null, failFirst = false } = {}) {
  const legacy = await installFixtureApi(page);
  const parent: Conversation = { id: 'repo-parent', title: 'Repo parent research', status: 'IDLE', revision: 1, cursor: 'parent:1', created_at: created, updated_at: created, providers: ['openalex'], filters: {}, turns: [parentTurn] };
  let data = saved;
  const posts: { path: string; body: Record<string, unknown> }[] = [], reads: string[] = [];
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: false, blocked_reason: 'Existing model allowance is held.' } } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [parent] } }));
  await page.route('**/api/conversations/repo-parent', route => route.fulfill({ json: parent }));
  await page.route('**/api/research-runs/repo-paper/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: 'repo-paper', status: 'succeeded', entities: [paper] } }));
  await page.route('**/api/repo-providers', route => route.fulfill({ json: { providers: [{ id: 'github', status: 'ready', mode: 'fixture' }] } }));
  await page.route(/\/api\/repo-searches(?:[/?].*)?$/, async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'GET') { reads.push(url.pathname + url.search); return route.fulfill({ json: url.pathname === '/api/repo-searches' ? { searches: data ? [data] : [] } : data }); }
    posts.push({ path: url.pathname, body: req.postDataJSON() });
    if (failFirst && posts.length === 1) return route.fulfill({ status: 503, json: { detail: 'Interrupted fixture response' } });
    if (url.pathname.endsWith('/cancel')) data = { ...data!, status: 'CANCELLED', revision: data!.revision + 1, completed_at: '2026-11-14T12:00:02Z' };
    else data = snapshot();
    return route.fulfill({ status: 202, json: data });
  });
  return { posts, reads, legacy, parent, async publish(update: Partial<RepositorySearch>) { data = { ...data!, ...update, revision: data!.revision + 1, cursor: 'repos:' + (data!.revision + 1) }; await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), data); } };
}

test('repository identities preserve whole latest records; GitHub links distinguish immutable blob evidence from mutable web URLs', () => {
  const old = repo(), newer = { ...repo(), evidence_version: 'v2', observed_at: '2026-11-14T13:00:00Z' }, fork = { ...repo('102', 'example/fork'), fork: true };
  expect(repositoryRecords([old, newer, fork])).toEqual([newer, fork]);
  expect(repositoryUrl('javascript:alert(1)')).toBeUndefined(); expect(repositoryUrl('https://token@github.com/example/repo')).toBeUndefined(); expect(repositoryUrl('https://github.com.evil.example/a/b')).toBeUndefined(); expect(repositoryUrl('http://github.com/a/b')).toBeUndefined();
  expect(readmeSourceUrl(`https://api.github.com/repos/example/repo/git/blobs/${sha}`)).toContain('/git/blobs/'); expect(readmeSourceUrl(`https://api.github.com/repos/example/repo/git/blobs/${sha}?token=secret`)).toBeUndefined(); expect(readmeSourceUrl('https://example.org/blob')).toBeUndefined();
  expect(searchResourceKind({ provider: 'github', resource_type: 'repository' })).toBe('repo');
});

test('Repos is a remembered saved-read tab with README provenance and no provider or model work on mount', async ({ page }) => {
  const api = await install(page, { saved: snapshot([repo()], 'SUCCEEDED') }); await page.goto('/app?search=repo-parent'); await page.getByRole('tab', { name: /^Repos/ }).click(); await expect(page.getByTestId('repo-card')).toHaveCount(1);
  await expect(page.getByText('Provider activity and saved usage', {exact:true})).toHaveCount(0);
  const reader = page.getByTestId('repo-reader'); await expect(reader).toContainText('Evaluate retrieved evidence for question answering'); await expect(reader).toContainText('Public repository ID rechecked'); await reader.getByText('README source sections and lines', { exact: true }).click(); await expect(reader.getByRole('link', { name: /README blob/ })).toHaveAttribute('href', /\/git\/blobs\//); await expect(reader).toContainText('current branch may differ');
  await expect(page.getByRole('complementary', { name: 'Source details', exact: true })).toHaveCount(0); await expect(page.getByRole('textbox', { name: 'Research question', exact: true })).toHaveValue(api.parent.turns[0].message);
  await page.getByLabel('Repositories to fetch').selectOption('15'); await page.reload(); await expect(page.getByRole('tab', { name: /^Repos/ })).toHaveAttribute('aria-selected', 'true'); await expect(page.getByLabel('Repositories to fetch')).toHaveValue('15'); await expect(page.getByTestId('repo-card')).toHaveCount(1); expect(api.posts).toEqual([]); expect(api.legacy.state.starts).toBe(0);
});

test('explicit repo lookup reuses saved AI intent and progressively upgrades metadata to README evidence with stable row selection', async ({ page }) => {
  const api = await install(page); await page.goto('/app?search=repo-parent'); await page.getByRole('tab', { name: /^Repos/ }).click(); await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await page.getByLabel('Repositories to fetch').selectOption('15'); expect(api.posts).toHaveLength(0); await page.getByRole('button', { name: 'Find matching repos', exact: true }).click(); await expect(page.getByTestId('repo-skeleton')).toBeVisible();
  expect(api.posts).toHaveLength(1); expect(api.posts[0].body).toMatchObject({ conversation_id: 'repo-parent', turn_id: 'repo-parent-turn', limit: 15 }); expect(api.posts[0].body).not.toHaveProperty('question');
  await api.publish({ records: [repo('101', 'example/retrieval-eval', false)] }); await expect(page.getByTestId('repo-card')).toHaveCount(1); await expect(page.getByTestId('repo-reader')).toContainText('Only the first five locally ranked repositories');
  await api.publish({ records: [repo(), repo('102', 'example/other')], status: 'SUCCEEDED', provider_activity: snapshot([], 'SUCCEEDED').provider_activity, completed_at: '2026-11-14T12:00:02Z' }); await expect(page.getByTestId('repo-reader')).toContainText('Evaluate retrieved evidence for question answering');
  await openSearchInformation(page, 'Query and focus'); await page.getByRole('tab', { name: 'Provider queries', exact: true }).click(); await page.getByText('GitHub · Succeeded · 2 attempts', { exact: true }).click(); await expect(page.getByTestId('repo-executed-query')).toContainText('is:public'); await openSearchInformation(page, 'Timing and usage'); const readmeStage=page.getByTestId('timeline-row').filter({hasText:'README 101'}); await readmeStage.locator(':scope > summary').click(); await readmeStage.getByText('Recorded stage input',{exact:true}).click(); await expect(readmeStage.getByTestId('timeline-stage-input')).toContainText('/repos/example/retrieval-eval/readme'); await expect(readmeStage.getByTestId('timeline-stage-input')).not.toContainText('per_page');
  const reads = api.reads.length; await page.getByTestId('repo-card').nth(1).hover(); await expect(page.getByTestId('repo-reader')).toContainText('example/other'); expect(api.reads).toHaveLength(reads); expect(api.posts).toHaveLength(1);
  await page.getByRole('tab', { name: /^Papers/ }).click(); await expect(page.getByTestId('search-result-card')).toHaveCount(1); await expect(page.getByRole('tab', { name: /^Repos/ })).toHaveText(/Repos\s*2/);
});

test('unrefined and failed query plans cannot start repository work', async ({ page }) => {
  const failed = turn(); failed.retrieval = { ...failed.retrieval!, status: 'failed' }; const api = await install(page, { parentTurn: failed }); await page.goto('/app?search=repo-parent'); await page.getByRole('tab', { name: /^Repos/ }).click(); await expect(page.getByRole('button', { name: 'Find matching repos', exact: true })).toBeDisabled(); expect(api.posts).toEqual([]);
});

test('partial README failures and cancellation preserve received repository metadata; reload never replays work', async ({ page }) => {
  const api = await install(page); await page.goto('/app?search=repo-parent'); await page.getByRole('tab', { name: /^Repos/ }).click(); await page.getByRole('button', { name: 'Find matching repos', exact: true }).click();
  const blocked = { ...repo(), readme: { ...repo().readme, evidence: [], status: 'blocked' as const, error: { code: 'UPSTREAM_RATE_LIMIT', message: 'GitHub read limit. Wait before retrying.' } } };
  await api.publish({ records: [blocked], provider_activity:[{provider:'github',status:'partial',error:{code:'GITHUB_RATE_LIMIT',message:'GitHub read limit. Wait before retrying.'}}], warnings: ['GitHub rate limit; available repository metadata is retained.'] }); await expect(page.getByTestId('repo-card')).toHaveCount(1); await expect(page.getByTestId('repo-reader')).toContainText('Wait before retrying'); await openSearchInformation(page, 'Query and focus'); await page.getByRole('tab', { name: 'Provider queries', exact: true }).click(); await page.getByText('GitHub · Partial',{exact:true}).click(); await expect(page.getByTestId('search-information')).toContainText('Wait before retrying'); await openSearchInformation(page, 'Sources and coverage'); await expect(page.getByTestId('search-information')).toContainText('GitHub rate limit');
  await page.getByRole('button', { name: 'Stop repo search', exact: true }).click(); await expect(page.getByTestId('repo-results')).toHaveAttribute('data-status', 'CANCELLED'); await page.reload(); await expect(page.getByTestId('repo-card')).toHaveCount(1); expect(api.posts).toHaveLength(2); expect(api.posts[1].path).toMatch(/\/cancel$/);
});

test('unassessed repos and unsafe README text remain explicit and mobile details require intent', async ({ page }) => {
  const unknown = { ...repo(), description: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', readme: { ...repo().readme, source_url: 'https://evil.example/blob', web_url: 'https://evil.example/readme', evidence: [{ ...repo().readme.evidence[0], text: '<script>window.injected=true</script>', source_url: 'https://evil.example/blob' }] }, match: { ...repo().match, status: 'unknown' as const, matched_terms: [], reason: 'Metadata does not establish task fit.' } };
  const api = await install(page, { saved: snapshot([unknown], 'PARTIAL') }); await page.setViewportSize({ width: 390, height: 1000 }); await page.goto('/app?search=repo-parent'); await page.getByRole('tab', { name: /^Repos/ }).click(); await expect(page.getByTestId('repo-card')).toHaveCount(0); await page.getByRole('button', { name: 'Show other fetched repos (1) · relevance not established', exact: true }).click(); await expect(page.getByTestId('repo-reader')).toHaveCount(0); await page.getByRole('button', { name: 'View repository details', exact: true }).click(); await expect(page.getByTestId('repo-reader')).toContainText('<script>'); await expect(page.locator('img[src="x"]')).toHaveCount(0); await expect(page.getByRole('link', { name: 'Open repository on GitHub', exact: true })).toHaveCount(0); await expect(page.getByRole('link', { name: 'Open README blob', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close repository details', exact: true }).click(); await expect(page.getByTestId('repo-reader')).toHaveCount(0); for(const width of [390,320,768,1440]) { await page.setViewportSize({width,height:1000});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false); } expect(api.posts).toEqual([]);
});

test('an interrupted admission retains its idempotency key and saved recovery is GET-only', async ({ page }) => {
  const api = await install(page, { failFirst: true }); await page.goto('/app?search=repo-parent'); await page.getByRole('tab', { name: /^Repos/ }).click(); await page.getByRole('button', { name: 'Find matching repos', exact: true }).click(); await expect(page.getByTestId('search-information').getByRole('alert')).toContainText('may already be running'); await page.getByRole('button', { name: 'Open saved repos', exact: true }).click(); expect(api.posts).toHaveLength(1); await page.getByRole('button', { name: 'Find matching repos', exact: true }).click(); await expect(page.getByTestId('repo-results')).toHaveAttribute('data-status','RUNNING'); expect(api.posts).toHaveLength(2); expect(api.posts[0].body.idempotency_key).toEqual(api.posts[1].body.idempotency_key);
});

test('Repos and Data preserve an unsaved paper note; all four resource tabs support keyboard navigation', async ({ page }) => {
  const api = await install(page); await page.goto('/app?search=repo-parent'); const reader = page.getByRole('complementary', { name: 'Source details', exact: true }); await expect(reader).toBeVisible(); await reader.getByRole('tab', { name: 'Your notes', exact: true }).click(); await page.getByLabel('Reason (optional)').fill('Keep the paper note while browsing code.');
  await page.getByRole('tab', { name: /^Repos/ }).click(); await expect(reader).toBeHidden(); await page.getByRole('tab', { name: /^Data/ }).click(); await expect(reader).toBeHidden(); await page.getByRole('tab', { name: /^Papers/ }).click(); await expect(reader).toBeVisible(); await expect(page.getByLabel('Reason (optional)')).toHaveValue('Keep the paper note while browsing code.'); const tab=page.getByRole('tab', { name: /^Papers/ }); await tab.focus(); await tab.press('End'); await expect(page.getByRole('tab', { name: /^Repos/ })).toBeFocused(); await expect(page.getByRole('tab', { name: /^Repos/ })).toHaveAttribute('aria-selected','true'); expect(api.posts).toEqual([]);
});
