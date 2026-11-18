import { test, expect } from '@playwright/test';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';
import { abstractPoints } from '../../src/lib/abstract-points';
import { searchResources } from '../../src/lib/search-resources';
import { latestSourceRecords } from '../../src/lib/source-versions';
import type { ChatSource, ExplorationTurn } from '../../src/lib/conversations';

const text = 'We investigate reliable evidence retrieval for language models. Background context can be lengthy and difficult to inspect. We compare two retrieval methods on a controlled dataset. Results show a 20% improvement under the evaluated conditions. These findings may not apply to other datasets. We conclude that further validation is needed.';
const source: ChatSource = { ...FIRST_SOURCE, run_id: 'clean-reader-run', title: 'An exact long research title about context and reliable generation', authors: ['Ada Lee', 'Ada Lee', 'Bo Smith'], abstract: text, venue: 'Research Methods Journal', year: 2026, version: 2, observed_at: '2026-11-12T12:00:00Z' };
const turn = (sources: ChatSource[]) => ({ action: 'discover', routing: 'auto', sources, papers: sources.map(item => ({ paper_id: `doi:${item.doi}`, doi: item.doi, representative: item, observations: [item], providers: [item.provider], access: { status: 'not_requested' } })) } as ExplorationTurn);

test('latest numeric versions and dated opaque revisions replace duplicate records without sorting hashes', () => {
  const old = { ...source, version: 2, observed_at: '2026-11-13T12:00:00Z' }, latest = { ...source, version: 10 };
  expect(latestSourceRecords([latest, old])[0].version).toBe(10);
  expect(latestSourceRecords([{ ...source, version: 'ffff', observed_at: '2026-11-11T12:00:00Z' }, { ...source, version: 'aaaa' }])[0].version).toBe('aaaa');
  expect(latestSourceRecords([{ ...source, version: 'ffff', observed_at: undefined }, { ...source, version: 'aaaa', observed_at: undefined }])[0].version).toBe('aaaa');
  const snapshot = turn([old, latest]), before = JSON.stringify(snapshot), result = searchResources(snapshot);
  expect(result).toHaveLength(1);
  expect(result[0].source.version).toBe(10);
  expect(result[0].paper?.observations).toHaveLength(1);
  expect(JSON.stringify(snapshot)).toBe(before);
});

test('exact citation duplicates with different DOIs group visually while retaining both provider records and access boundaries', () => {
  const updated = { ...source, source_ref: 'openalex:new-doi', record_id: 'new-doi', doi: '10.1234/new', observed_at: '2026-11-13T12:00:00Z' };
  const result = searchResources(turn([source, updated]));
  expect(result).toHaveLength(1);
  expect(result[0].matchBasis).toBe('citation');
  expect(result[0].source.doi).toBe(updated.doi);
  expect(result[0].paper?.observations.map(item => item.doi)).toEqual([source.doi, updated.doi]);
  expect(searchResources(turn([source, { ...updated, venue: 'A Different Journal' }]))).toHaveLength(2);
  expect(searchResources(turn([{ ...source, title: 'Editorial' }, { ...updated, title: 'Editorial' }]))).toHaveLength(2);
});

test('compact observation references do not erase full citation fields or prevent duplicate grouping', () => {
  const duplicate = { ...source, record_id: 'another-doi', source_ref: 'openalex:another-doi', doi: '10.1234/another' };
  const saved = turn([source, duplicate]);
  for (const paper of saved.papers!) paper.observations = [{ source_ref: paper.representative.source_ref, provider: source.provider, record_id: paper.representative.record_id, run_id: source.run_id, version: source.version, title: source.title, doi: paper.doi, observation_reference: true } as ChatSource];
  const grouped = searchResources(saved);
  expect(grouped).toHaveLength(1);
  expect(grouped[0].source.abstract).toBe(text);
  expect(grouped[0].source.authors).toEqual(source.authors);
  expect(grouped[0].paper?.observations).toHaveLength(2);
});

test('key points use complete original sentences, retain qualifiers and avoid repeated sentences', () => {
  const points = abstractPoints(text);
  expect(points.length).toBeLessThanOrEqual(4);
  for (const point of points) expect(text).toContain(point);
  expect(points).toContain('Results show a 20% improvement under the evaluated conditions.');
  expect(points).toContain('These findings may not apply to other datasets.');
  expect(points).toContain('We conclude that further validation is needed.');
  expect(abstractPoints('A provider excerpt. A provider excerpt.')).toEqual(['A provider excerpt.']);
});

test('reader puts publication before abstract points and authors after, with timing in the footer and flat metadata', async ({ page }) => {
  await installFixtureApi(page);
  const saved = { id: 'clean-reader', title: 'Clean reader', status: 'IDLE', revision: 1, cursor: 'clean:1', providers: ['openalex'], filters: {}, created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', turns: [{ ...turn([source]), id: 'clean-turn', message: 'Readable abstract', status: 'SUCCEEDED', created_at: '2026-11-12T12:00:00Z', run_ids: [source.run_id], providers: ['openalex'], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  await page.route('**/api/conversations/clean-reader', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/clean-reader-run/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: source.run_id, status: 'succeeded', entities: [source], revision: 1 } }));
  const writes: string[] = []; page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method()); });
  await page.goto('/app?search=clean-reader');
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader.getByRole('heading', { name: source.title!, exact: true })).toBeVisible();
  await expect(reader.getByTestId('abstract-key-points').getByRole('listitem')).toHaveCount(4);
  const authors = reader.getByTestId('source-authors');
  await expect(authors).toHaveText('AuthorsAda Lee, Bo Smith');
  expect(await authors.evaluate(node => !!(document.querySelector('[aria-label="Source details"] [data-testid="abstract-key-points"]')!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(reader.getByRole('tabpanel').locator('[data-load-kind="Metadata"]')).toHaveCount(0);
  await expect(reader.locator('.inspector-bottom [data-load-kind="Metadata"]')).toHaveCount(1);
  await reader.getByRole('button', { name: 'Original abstract', exact: true }).click();
  await expect(reader.getByTestId('original-abstract')).toHaveText(text);
  await reader.getByRole('button', { name: 'Key points', exact: true }).click();
  await reader.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(reader.getByRole('tabpanel').locator('details')).toHaveCount(0);
  await expect(reader.locator('.record-properties')).toContainText(source.record_id);
  await expect(reader.getByText('Metadata coverage', { exact: true })).toHaveCount(0);
  await reader.getByRole('tab', { name: 'Your notes', exact: true }).click();
  await expect(reader.getByRole('heading', { name: 'Research notes' })).toBeVisible();
  expect(writes).toEqual([]);
  await page.setViewportSize({ width: 320, height: 950 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('a newer streamed version refreshes the selected saved record without duplicating the card or reopening a closed reader', async ({ page }) => {
  await installFixtureApi(page);
  const old = { ...source, version: 2 }, latest = { ...source, run_id: 'latest-reader-run', version: 10, abstract: 'The latest saved abstract has arrived. It retains the provider wording.' };
  const saved = (sources: ChatSource[], revision: number) => ({ id: 'version-reader', status: 'IDLE', revision, cursor: `versions:${revision}`, title: 'Version research', created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', providers: ['openalex'], filters: {}, turns: [{ ...turn(sources), id: 'version-turn', message: 'Latest metadata', status: 'SUCCEEDED', created_at: '2026-11-12T12:00:00Z', providers: ['openalex'], run_ids: sources.map(source => source.run_id), response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] });
  await page.route('**/api/conversations/version-reader', route => route.fulfill({ json: saved([old], 1) }));
  for (const record of [old, latest]) await page.route(`**/api/research-runs/${record.run_id}/snapshot`, route => route.fulfill({ json: { ...initialSnapshot(), id: record.run_id, status: 'succeeded', entities: [record], revision: 1 } }));
  await page.goto('/app?search=version-reader');
  const reader = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(reader.getByTestId('abstract-key-points')).toBeVisible();
  await page.evaluate(snapshot => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(snapshot), saved([old, latest], 2));
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await expect(reader).toContainText('The latest saved abstract has arrived.');
  await reader.getByRole('button', { name: 'Close source details', exact: true }).click();
  await page.evaluate(snapshot => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(snapshot), saved([old, latest], 3));
  await expect(reader).toHaveCount(0);
});
