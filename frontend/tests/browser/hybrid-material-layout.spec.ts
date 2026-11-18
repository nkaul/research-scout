import { test, expect, type Page } from '@playwright/test';
import type { CanonicalPaper, ChatSource, Conversation } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

const first: ChatSource = {
  ...FIRST_SOURCE, run_id: 'hybrid-paper-run', source_ref: 'openalex:hybrid-first',
  title: 'Evidence selection and context quality for grounded language-model answers',
  doi: '10.0000/hybrid-context', year: 2026,
};
const observation: ChatSource = { ...first, provider: 'crossref', run_id: 'hybrid-crossref-run', source_ref: 'crossref:hybrid-first' };
const preprint: ChatSource = {
  ...FIRST_SOURCE, provider: 'arxiv', run_id: 'hybrid-arxiv-run', source_ref: 'arxiv:2401.12345', record_id: '2401.12345',
  title: 'Ranking retrieved evidence for reliable research assistants', url: 'https://arxiv.org/abs/2401.12345',
  doi: '10.0000/hybrid-ranking', year: 2025,
};
const video: ChatSource = {
  ...FIRST_SOURCE, provider: 'youtube', resource_type: 'video', run_id: 'hybrid-video-run',
  source_ref: 'youtube:AbCdEfGhI12', record_id: 'AbCdEfGhI12', title: 'Building a better context pipeline',
  url: 'https://www.youtube.com/watch?v=AbCdEfGhI12', doi: null, abstract: null,
  description: 'An authored fixture describing retrieval, context selection and evaluation.',
  authors: ['Example research channel'], year: 2026,
};

async function installHybridFixture(page: Page) {
  await installFixtureApi(page);
  const location = { url: 'https://example.org/paper', url_for_pdf: 'https://example.org/hybrid.pdf', version: 'acceptedVersion', license: 'cc-by' };
  const paper: CanonicalPaper = {
    paper_id: 'doi:10.0000/hybrid-context', doi: first.doi!, representative: first,
    providers: ['openalex', 'crossref'], observations: [first, observation],
    access: { status: 'succeeded', observation: { provider: 'unpaywall', mode: 'fixture', doi: first.doi!, is_oa: true, oa_status: 'green', best_oa_location: location, oa_locations: [location], observed_at: '2026-11-14T12:00:00Z', version: 'fixture-access-1' } },
  };
  const papers: CanonicalPaper[] = [paper,
    { paper_id: 'doi:10.0000/hybrid-ranking', doi: preprint.doi!, representative: preprint, providers: ['arxiv'], observations: [preprint], access: { status: 'not_requested' } },
    { paper_id: 'youtube:AbCdEfGhI12', doi: null, representative: video, providers: ['youtube'], observations: [video], access: { status: 'not_applicable' } },
  ];
  const saved: Conversation = {
    id: 'hybrid-layout-search', title: 'Context evidence', routing: 'auto', status: 'IDLE', revision: 1, cursor: 'hybrid-layout:1',
    created_at: '2026-11-14T12:00:00Z', updated_at: '2026-11-14T12:00:00Z', providers: [], filters: {},
    turns: [{ id: 'hybrid-layout-turn', message: 'How does better context improve generation?', action: 'discover', routing: 'auto', status: 'SUCCEEDED',
      created_at: '2026-11-14T12:00:00Z', completed_at: '2026-11-14T12:00:02Z', providers: ['openalex', 'crossref', 'arxiv', 'youtube'],
      run_ids: [first.run_id, observation.run_id, preprint.run_id, video.run_id], sources: [first, observation, preprint, video], papers,
      response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }],
  };
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: false, ready: false }, youtube: { video_count: { default: 10, min: 1, max: 20 } } } }));
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: ['openalex', 'crossref', 'arxiv', 'youtube', 'semantic_scholar', 'openaire', 'europe_pmc', 'datacite', 'unpaywall'].map(id => ({ id, status: 'ready', access_configured: true, mode: 'fixture', run_attempt_cap: 8 })) } }));
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/conversations' ? { conversations: [saved] } : saved }));
  await page.route(/\/api\/research-runs\/hybrid-[^/]+\/snapshot/, route => {
    const runId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const source = [first, observation, preprint, video].find(item => item.run_id === runId)!;
    return route.fulfill({ json: { ...initialSnapshot(), id: runId, provider: source.provider, status: 'succeeded', entities: [source] } });
  });
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#173960"/></svg>' }));
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/')) writes.push(new URL(request.url()).pathname); });
  return { writes };
}

test('material provider tags retain readable contrast and separate record provenance', async ({ page }) => {
  const { writes } = await installHybridFixture(page);
  await page.goto('/app?search=hybrid-layout-search');
  const card = page.getByTestId('search-result-card').first();
  await expect(card.getByLabel('Resource tags')).toContainText('OpenAlex');
  await card.getByRole('button', { name: 'Provider observations (2)', exact: true }).click();
  await expect(card.getByTestId('search-paper-observations')).toContainText(observation.source_ref);
  const chips = card.locator('[data-provider="openalex"], [data-provider="crossref"]');
  const pairs = await chips.evaluateAll(nodes => nodes.map(node => { const s = getComputedStyle(node); return { foreground: s.color, background: s.backgroundColor }; }));
  expect(new Set(pairs.map(pair => pair.background)).size).toBeGreaterThan(1);
  const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  for (const pair of pairs) { const a = luminance(pair.foreground), b = luminance(pair.background); expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5); }
  await expect(card.getByRole('button', { name: 'Unpaywall open access: Open access', exact: true })).toHaveAttribute('data-access-status', 'open');
  expect(writes).toEqual([]);
});

test('refined cards keep readable type and every paper action aligned at desktop and narrow widths', async ({ page }) => {
  const { writes } = await installHybridFixture(page);
  await page.goto('/app?search=hybrid-layout-search');
  const card = page.getByTestId('search-result-card').first();
  await expect(card).toBeVisible();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const titleSize = await card.locator('[data-testid="paper-title-text"]').evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
    const bodySize = await card.locator('.chat-abstract-text').evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(titleSize).toBeGreaterThanOrEqual(16); expect(bodySize).toBeGreaterThanOrEqual(14);
    const actions = card.locator('.resource-action-bar > button, .resource-action-bar > a');
    await expect(actions).toHaveCount(7);
    const boxes = await actions.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { center: r.y + r.height / 2, width: r.width, height: r.height }; }));
    expect(Math.max(...boxes.map(box => box.center)) - Math.min(...boxes.map(box => box.center))).toBeLessThanOrEqual(2);
    expect(boxes.every(box => box.width >= 24 && box.height >= 24)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await expect(card.getByRole('link', { name: 'Open PDF in new tab', exact: true })).toHaveAttribute('target', '_blank');
  expect(writes).toEqual([]);
});

test('video styling keeps the explicit media actions and preserves the search draft', async ({ page }) => {
  const { writes } = await installHybridFixture(page);
  await page.goto('/app?search=hybrid-layout-search');
  const draft = page.getByRole('textbox', { name: 'Research question', exact: true });
  await expect(page.getByTestId('search-result-card').first()).toBeVisible();
  await draft.fill('Keep my next research question');
  await page.getByRole('tab', { name: /^Videos/ }).click();
  const card = page.getByTestId('search-result-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByLabel('Resource tags').locator('[data-provider="youtube"]')).toContainText('YouTube');
  await expect(card.getByRole('link', { name: 'Open on YouTube', exact: true })).toHaveAttribute('target', '_blank');
  await expect(page.locator('iframe[src*="youtube"]')).toHaveCount(0);
  await expect(draft).toHaveValue('Keep my next research question');
  expect(writes).toEqual([]);
});
