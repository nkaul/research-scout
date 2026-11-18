import { expect, test, type Page } from '@playwright/test';
import type { Conversation, ExplorationTurn } from '../../src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';
import { chooseVideoCount } from './search-controls';

const stamp = '2026-11-14T12:00:00Z';
async function installCompact(page: Page, running = false) {
  await installFixtureApi(page);
  const turn: ExplorationTurn = { id: 'compact-turn', action: 'discover', agentic: false, routing: 'auto', message: 'Authored retrieval context question', status: running ? 'RUNNING' : 'SUCCEEDED', providers: ['openalex', 'youtube'], created_at: stamp, completed_at: running ? undefined : stamp, sources: [{ ...FIRST_SOURCE, run_id: 'compact-paper' }], run_ids: ['compact-paper'], warnings: [], response: '', usage: { research_attempts: 1, model_http_attempts: 0, model_cost_usd: 0 }, activity: [{ provider: 'openalex', operation: 'hybrid_search', status: 'succeeded' }, { provider: 'youtube', operation: 'hybrid_search', status: running ? 'running' : 'succeeded' }] };
  let saved: Conversation = { id: 'compact-toolbar', title: turn.message, status: running ? 'RUNNING' : 'IDLE', revision: 1, cursor: 'compact:1', created_at: stamp, updated_at: stamp, providers: [], filters: {}, routing: 'auto', turns: [turn] };
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') writes.push(new URL(request.url()).pathname); });
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: ['openalex', 'crossref', 'arxiv', 'youtube'].map(id => ({ id, status: 'ready', access_configured: true, mode: 'fixture' })) } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [saved] } }));
  await page.route('**/api/conversations/compact-toolbar', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/compact-paper/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: 'compact-paper', status: 'succeeded', entities: [FIRST_SOURCE] } }));
  return { writes, async publish(update: Partial<ExplorationTurn>) {
    saved = { ...saved, revision: saved.revision + 1, cursor: `compact:${saved.revision + 1}`, turns: [{ ...saved.turns[0], ...update }] };
    await page.evaluate(value => (window as unknown as { __publishScout: (value: unknown) => void }).__publishScout(value), saved);
  } };
}

test('desktop search controls share one row and project actions live in the workspace header', async ({ page }) => {
  const api = await installCompact(page); await page.goto('/app?search=compact-toolbar');
  await expect(page.getByTestId('search-result-card')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Discover Research', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Research Scout home', exact: true })).toContainText('Research Scout');
  await expect(page.locator('.brand-tagline')).toHaveText('A little curiosity goes a long way');
  await expect(page.getByTestId('research-scout-mark').first()).toBeVisible();
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1080 });
    const controls = [page.getByRole('button', { name: /^Sources:/ }), page.getByRole('slider', { name: 'Date range', exact: true }), page.getByRole('button', { name: 'Custom range', exact: true }), page.getByRole('button', { name: 'Search result limits', exact: true }), page.getByRole('switch', { name: 'AI refinement', exact: true }), page.getByTestId('search-settings').locator('summary')];
    const centers = await Promise.all(controls.map(async item => { const box = await item.boundingBox(); expect(box).toBeTruthy(); return box!.y + box!.height / 2; }));
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(5);
    expect((await page.locator('.hybrid-search-settings').boundingBox())!.height).toBeLessThanOrEqual(52);
  }
  for (const item of [page.getByLabel('Active research project'), page.getByRole('button', { name: 'Manage research projects', exact: true }), page.getByRole('button', { name: 'Add current query to project', exact: true })]) expect(await item.evaluate(element => Boolean(element.closest('.workspace-heading-row')))).toBe(true);
  await expect(page.getByRole('switch', { name: 'AI refinement', exact: true })).not.toContainText('AI refinement');
  await page.setViewportSize({ width: 1280, height: 720 });
  const sources = page.getByRole('button', { name: /^Sources:/ });
  await sources.click();
  const sourcePanel = page.getByRole('dialog', { name: 'Search sources', exact: true });
  await expect(sourcePanel).toBeVisible();
  const anchor = await sources.boundingBox(), popup = await sourcePanel.boundingBox();
  expect(popup!.y >= anchor!.y + anchor!.height || popup!.y + popup!.height <= anchor!.y).toBe(true);
  await sources.click(); await expect(sourcePanel).toHaveCount(0);
  expect(api.writes).toEqual([]);
});

test('icon controls open bounded accessible popovers without submitting a search', async ({ page }) => {
  const api = await installCompact(page); await page.goto('/app?search=compact-toolbar');
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Custom publication range', exact: true })).toBeVisible();
  await page.getByLabel('Custom publication year from', { exact: true }).fill('2021');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Custom range', exact: true })).toBeFocused();
  await chooseVideoCount(page, 17);
  await expect(page.getByRole('button', { name: 'Search result limits', exact: true })).toBeFocused();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('button', { name: 'Search result limits', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Search result limits', exact: true });
    await expect(panel).toBeVisible(); const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(7); expect(box!.x + box!.width).toBeLessThanOrEqual(width - 7);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(api.writes).toEqual([]);
});

test('header save-query action follows Exploration rather than a stale Search query', async ({ page }) => {
  const api = await installCompact(page); await page.goto('/app?search=compact-toolbar');
  const save = page.getByRole('button', { name: 'Add current query to project', exact: true });
  await expect(save).toBeEnabled();
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click();
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await expect(save).toBeDisabled();
  expect(api.writes).toEqual([]);
});

test('resource tabs show provider-specific progress and stop loading when their own work finishes', async ({ page }) => {
  const api = await installCompact(page, true); await page.goto('/app?search=compact-toolbar');
  await expect(page.getByTestId('search-result-card')).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Papers/ })).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('tab', { name: /^Videos/ })).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('resource-tab-loading-video')).toBeVisible();
  await expect(page.getByTestId('resource-tab-loading-data')).toHaveCount(0); await expect(page.getByTestId('resource-tab-loading-repo')).toHaveCount(0);
  await api.publish({ activity: [{ provider: 'openalex', operation: 'hybrid_search', status: 'succeeded' }, { provider: 'youtube', operation: 'hybrid_search', status: 'succeeded' }] });
  await expect(page.getByTestId('resource-tab-loading-video')).toHaveCount(0);
  await api.publish({ agentic: true, providers: [], source_scope: ['openalex', 'youtube'], retrieval: { status: 'planning' } });
  await expect(page.getByTestId('resource-tab-loading-paper')).toBeVisible();
  await expect(page.getByTestId('resource-tab-loading-video')).toBeVisible();
  await api.publish({ retrieval: { status: 'clarification_needed' } });
  await expect(page.getByTestId('resource-tab-loading-paper')).toHaveCount(0);
  await expect(page.getByTestId('resource-tab-loading-video')).toHaveCount(0);
  expect(api.writes).toEqual([]);
});

test('Data and Repos tab indicators follow saved-read loading even when another tab is selected', async ({ page }) => {
  const api = await installCompact(page);
  let releaseData!: () => void, releaseRepo!: () => void;
  const data = new Promise<void>(resolve => { releaseData = resolve; }), repo = new Promise<void>(resolve => { releaseRepo = resolve; });
  await page.route('**/api/dataset-searches?*', async route => { await data; await route.fulfill({ json: { searches: [] } }); });
  await page.route('**/api/repo-searches?*', async route => { await repo; await route.fulfill({ json: { searches: [] } }); });
  await page.goto('/app?search=compact-toolbar'); await expect(page.getByTestId('search-result-card')).toBeVisible();
  await page.getByRole('tab', { name: /^Data/ }).click(); await expect(page.getByTestId('resource-tab-loading-data')).toBeVisible();
  await page.getByRole('tab', { name: /^Papers/ }).click(); await expect(page.getByTestId('resource-tab-loading-data')).toBeVisible();
  releaseData(); await expect(page.getByTestId('resource-tab-loading-data')).toHaveCount(0);
  await page.getByRole('tab', { name: /^Repos/ }).click(); await expect(page.getByTestId('resource-tab-loading-repo')).toBeVisible();
  releaseRepo(); await expect(page.getByTestId('resource-tab-loading-repo')).toHaveCount(0);
  expect(api.writes).toEqual([]);
});

test('large atom animates its rings and particles while reduced motion keeps a static visible illustration', async ({ page }) => {
  await installCompact(page); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/conversations', async route => { if (route.request().method() === 'POST') await gate; await route.fulfill({ json: route.request().method() === 'GET' ? { conversations: [] } : { id: 'pending-atom', revision: 0, turns: [], providers: [], filters: {}, status: 'IDLE', routing: 'auto' } }); });
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.goto('/app');
  await page.getByLabel('Research question', { exact: true }).fill('Authored pending research query'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  const atom = page.getByTestId('search-atom'); await expect(atom).toBeVisible();
  expect((await atom.boundingBox())!.width).toBeGreaterThanOrEqual(98);
  expect(await atom.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBeGreaterThanOrEqual(7);
  const windowBox = await page.locator('.search-query-window').boundingBox(), atomBox = await atom.boundingBox();
  expect(atomBox!.height).toBeGreaterThanOrEqual(windowBox!.height * .85);
  const planes = atom.locator('[data-atom-plane]');
  await expect(planes).toHaveCount(3);
  const before = await planes.evaluateAll(elements => elements.map(element => getComputedStyle(element).transform));
  expect(before.every(value => value.startsWith('matrix3d('))).toBe(true);
  await expect.poll(async () => (await planes.evaluateAll(elements => elements.map(element => getComputedStyle(element).transform))).every((value, index) => value !== before[index])).toBe(true);
  const inputBox = await page.getByLabel('Research question', { exact: true }).boundingBox();
  expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(atomBox!.x + 1);
  await page.screenshot({ path: '../.scout/central-search-atom-desktop.local.png' });
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
  await expect(atom).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.getByLabel('Research question', { exact: true }).boundingBox())!.width).toBeGreaterThan(70);
  await page.screenshot({ path: '../.scout/central-search-atom-mobile.local.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(atom).toBeVisible();
  await expect.poll(() => atom.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  release();
});
