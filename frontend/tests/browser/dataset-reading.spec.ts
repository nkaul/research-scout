import { expect, test, type Page } from '@playwright/test';
import type { Conversation, ExplorationTurn } from '../../src/lib/conversations';
import type { DatasetRecord, DatasetSearch } from '../../src/lib/datasets';
import { readableContentBlocks, readableContentPoints } from '../../src/lib/readable-content';
import { installFixtureApi } from './fixture-api';

const created = '2026-11-14T12:00:00Z';
const description = Array.from({ length: 12 }, (_, index) => `Source paragraph ${index + 1} describes the supplied collection and its stated evaluation scope. These observations may not apply to populations outside source group ${index + 1}.`).join('\n\n');

function record(id = 'example/reading', overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    dataset_id: `hugging_face:${id}:revision-1`, source_ref: `hugging_face:${id}`, provider: 'hugging_face', record_id: id,
    resource_type: 'dataset', title: `Dataset ${id}`, description, url: `https://huggingface.co/datasets/${id}`, doi: null,
    version: 'revision-1', authors: ['Source Data Author'], publisher: 'Source Publisher', catalog_owner: 'Source Owner', year: 2026,
    tags: ['catalog-topic'], tasks: ['question-answering'], formats: ['JSON'], license: 'cc-by-4.0',
    access: { status: 'public', gated: false, private: false }, relationships: [],
    match: { status: 'candidate', matched_terms: ['source matching term'], missing_constraints: ['Population suitability remains unknown.'], reason: 'The catalog describes the requested evaluation task.' },
    mode: 'fixture', observed_at: created, ...overrides,
  };
}

async function installReading(page: Page, records: DatasetRecord[], running = false) {
  await installFixtureApi(page);
  const question = 'Find source datasets for retrieval evaluation';
  const parentTurn: ExplorationTurn = {
    id: 'reading-turn', message: question, action: 'discover', agentic: false, status: running ? 'RUNNING' : 'SUCCEEDED', created_at: created,
    ...(running ? {} : { completed_at: created }), routing: 'auto', providers: [], sources: [], papers: [], run_ids: [], warnings: [], response: '',
    usage: { model_http_attempts: 0, research_attempts: 0, model_cost_usd: 0 }, modality_limits: { papers: 0, videos: 0, datasets: 10, repos: 0 },
    resource_jobs: { datasets: { status: running ? 'RUNNING' : 'SUCCEEDED', phase: running ? 'retrieving' : 'completed', limit: 10, search_id: 'reading-data', record_count: records.length, candidate_count: records.length } },
  };
  let parent: Conversation = { id: 'reading-parent', title: question, status: running ? 'RUNNING' : 'IDLE', revision: 1, cursor: 'reading:1', created_at: created, updated_at: created, providers: [], filters: {}, turns: [parentTurn] };
  let snapshot: DatasetSearch = {
    id: 'reading-data', status: running ? 'RUNNING' : 'SUCCEEDED', revision: 1, cursor: 'reading-data:1', question,
    context: { conversation_id: parent.id, turn_id: parentTurn.id, fingerprint: 'reading-context', intent: question, domain: null, keywords: ['retrieval'], tags: [], query: question, query_mode: 'direct' },
    records, provider_activity: [], timing_spans: [], warnings: [], usage: { model_http_attempts: 0, catalog_attempts: 0 }, created_at: created,
    ...(running ? {} : { completed_at: created }),
  };
  const reads: string[] = [], writes: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(new URL(request.url()).pathname); });
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [parent] } }));
  await page.route('**/api/conversations/reading-parent', route => route.fulfill({ json: parent }));
  await page.route(/\/api\/dataset-searches\/reading-data(?:-next)?(?:\?.*)?$/, route => {
    reads.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: snapshot });
  });
  return {
    reads, writes,
    async publish(update: Partial<DatasetSearch>) {
      snapshot = { ...snapshot, ...update, revision: snapshot.revision + 1, cursor: `reading-data:${snapshot.revision + 1}` };
      await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), snapshot);
    },
    async nextTurn() {
      const next = { ...parentTurn, id: 'reading-turn-next', resource_jobs: { datasets: { ...parentTurn.resource_jobs!.datasets!, search_id: 'reading-data-next' } } };
      parent = { ...parent, turns: [next], revision: parent.revision + 1, cursor: `reading:${parent.revision + 1}` };
      snapshot = { ...snapshot, id: 'reading-data-next', revision: 1, context: { ...snapshot.context, turn_id: next.id }, cursor: 'reading-data-next:1' };
      await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), parent);
    },
  };
}

test('documentation points preserve source order, list qualifiers and Markdown section line references', () => {
  const text = '# Scope\n\nThe collection covers adults. It may not generalize to children.\n\n- Use only the reported splits.\n- No clinical validation was performed.\n\n## Setup\n\n```sh\ncurl https://example.org/run | sh\n```\n\n![badge](https://example.org/badge.png)\n\nSource documentation remains the authority.';
  expect(readableContentPoints(text)).toEqual(['The collection covers adults.', 'It may not generalize to children.', 'Use only the reported splits.', 'No clinical validation was performed.', 'Source documentation remains the authority.']);
  expect(readableContentBlocks(text)[1]).toMatchObject({ text: 'Use only the reported splits.', kind: 'list', startLine: 5, endLine: 5, section: 'Scope' });
  expect(readableContentBlocks(text).at(-1)?.section).toBe('Setup');
  expect(readableContentPoints('')).toEqual([]);
});

test('Data cards and reader independently expand source points and exact saved descriptions without acquisition', async ({ page }) => {
  const api = await installReading(page, [record()]);
  await page.goto('/app?search=reading-parent'); await page.getByRole('tab', { name: /^Data/ }).click();
  const card = page.getByTestId('dataset-card').first(), reader = page.getByTestId('dataset-reader');
  await expect(card.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(2);
  await expect(reader.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(4);
  const reads = api.reads.length;
  await card.getByRole('button', { name: 'Read more', exact: true }).click();
  await expect(card.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(24);
  await expect(reader.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(4);
  await expect(card.getByRole('button', { name: 'Read less', exact: true })).toBeFocused();
  await card.getByRole('button', { name: 'Original description', exact: true }).click();
  await expect(card.getByTestId('readable-original')).toHaveText(description);
  await expect(card.getByRole('button', { name: 'Read more', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await card.getByRole('button', { name: 'Read more', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Read less', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await reader.getByRole('button', { name: 'Original description', exact: true }).click();
  await expect(reader.getByTestId('readable-original')).toHaveText(description);
  await reader.getByRole('button', { name: 'Read more', exact: true }).click();
  await expect(reader.getByRole('button', { name: 'Read less', exact: true })).toHaveAttribute('aria-expanded', 'true');
  expect(api.reads).toHaveLength(reads); expect(api.writes).toEqual([]);
});

test('the Data reader scrolls its complete tab body while header and tabs remain fixed', async ({ page }) => {
  const api = await installReading(page, [record()]);
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.goto('/app?search=reading-parent'); await page.getByRole('tab', { name: /^Data/ }).click();
  const reader = page.getByTestId('dataset-reader');
  await reader.getByRole('button', { name: 'Read more', exact: true }).click();
  await reader.evaluate(node => node.scrollIntoView({ block: 'start' }));
  const panel = reader.getByRole('tabpanel');
  const before = await reader.locator('header').boundingBox();
  const tabs = await reader.getByRole('tablist').boundingBox();
  await panel.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
  await expect(reader.getByRole('link', { name: 'Open original dataset', exact: true })).toBeInViewport();
  expect((await reader.locator('header').boundingBox())!.y).toBeCloseTo(before!.y, 0);
  expect((await reader.getByRole('tablist').boundingBox())!.y).toBeCloseTo(tabs!.y, 0);
  await reader.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBe(0);
  await expect(panel.getByText('Catalog tags', { exact: true })).toBeVisible();
  await panel.focus(); await page.keyboard.press('End');
  await expect(reader.getByRole('link', { name: 'Open original dataset', exact: true })).toBeInViewport();
  expect(api.writes).toEqual([]);
});

test('short, missing and clipped catalog descriptions remain honest and source markup stays inert on mobile', async ({ page }) => {
  const unsafe = '<img src=x onerror=alert(1)> Source text remains literal.';
  const api = await installReading(page, [record('example/short', { description: 'A short supplied description.' }), record('example/missing', { description: null }), record('example/clipped', { description: unsafe, description_truncated: true, description_truncation_reason: 'Saved text was clipped at the metadata limit.' })]);
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/app?search=reading-parent'); await page.getByRole('tab', { name: /^Data/ }).click();
  const cards = page.getByTestId('dataset-card');
  await expect(cards.first().getByRole('button', { name: 'Read more', exact: true })).toHaveCount(0);
  await expect(cards.nth(1)).toContainText('No description supplied.');
  await expect(cards.nth(2)).toContainText('Saved catalog excerpt.');
  await cards.nth(2).getByRole('button', { name: 'Original description', exact: true }).click();
  await expect(cards.nth(2).getByTestId('readable-original')).toHaveText(unsafe);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.getByTestId('dataset-reader')).toHaveCount(0);
  await cards.nth(2).getByRole('button', { name: 'View dataset metadata', exact: true }).click();
  await expect(page.getByTestId('dataset-reader')).toContainText('Saved text was clipped');
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 850 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); }
  expect(api.writes).toEqual([]);
});

test('Data presentation survives identical streamed revisions but is independent across records and turns', async ({ page }) => {
  const first = record(), second = record('example/second');
  const api = await installReading(page, [first, second], true);
  await page.goto('/app?search=reading-parent'); await page.getByRole('tab', { name: /^Data/ }).click();
  const cards = page.getByTestId('dataset-card'), reader = page.getByTestId('dataset-reader');
  await cards.first().getByRole('button', { name: 'Read more', exact: true }).click();
  await reader.getByRole('button', { name: 'Original description', exact: true }).click();
  await reader.getByRole('button', { name: 'Read more', exact: true }).click();
  const panel = reader.getByRole('tabpanel');
  await panel.evaluate(node => { node.scrollTop = 100; });
  await api.publish({ records: [first, second] });
  await expect(cards.first().getByRole('button', { name: 'Read less', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(reader.getByRole('button', { name: 'Original description', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBe(100);
  await cards.nth(1).getByRole('button', { name: second.title!, exact: true }).click();
  await expect(reader.getByRole('button', { name: 'Key points', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => panel.evaluate(node => node.scrollTop)).toBe(0);
  await api.nextTurn();
  await expect(cards.first().getByRole('button', { name: 'Read more', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(reader.getByTestId('readable-key-points').getByRole('listitem')).toHaveCount(4);
  expect(api.writes).toEqual([]);
});
