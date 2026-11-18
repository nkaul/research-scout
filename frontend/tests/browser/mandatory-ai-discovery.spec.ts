import { test, expect, type Page } from '@playwright/test';
import type { Conversation, ExplorationTurn } from '../../src/lib/conversations';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';
import { chooseDateRange, chooseVideoCount, openSearchInformation } from './search-controls';

const blockedReason = 'The shared model allowance is spent or held by unresolved requests.';
const timestamp = '2026-11-14T12:00:00Z';
const legacyTurn: ExplorationTurn = {
  id: 'legacy-direct-turn', message: 'A previously saved direct search', action: 'discover',
  routing: 'manual', agentic: false, providers: ['openalex'], status: 'SUCCEEDED',
  created_at: timestamp, run_ids: ['fixture-run-1'],
  sources: [{ ...FIRST_SOURCE, run_id: 'fixture-run-1' }], response: 'Saved direct evidence.',
  warnings: [], usage: { research_attempts: 2, model_http_attempts: 0, model_cost_usd: 0 },
  plan: { routing: 'deterministic', generation: 'disabled' },
};

async function installRequiredAi(page: Page, options: { ready?: boolean; configError?: boolean; saved?: boolean; providersBlocked?: boolean; holdConfig?: boolean } = {}) {
  const legacy = await installFixtureApi(page);
  legacy.state.snapshot = { ...legacy.state.snapshot, status: 'succeeded', entities: [FIRST_SOURCE] };
  let conversation: Conversation = {
    id: 'required-rag-conversation', title: 'Saved required-RAG conversation',
    created_at: timestamp, updated_at: timestamp, revision: options.saved ? 1 : 0,
    cursor: 'required:0', status: 'IDLE', routing: 'manual', providers: ['openalex'],
    filters: {}, turns: options.saved ? [legacyTurn] : [],
  };
  const creates: Record<string, unknown>[] = [], sends: Record<string, unknown>[] = [];
  let releaseConfig!: () => void;
  const configGate = new Promise<void>(resolve => { releaseConfig = resolve; });
  await page.route('**/api/providers', route => route.fulfill({ json: { providers:
    ['openalex', 'crossref', 'arxiv', 'youtube', 'datacite'].map(id => ({ id, mode: 'fixture', status: options.providersBlocked ? 'blocked' : 'ready', access_configured: !options.providersBlocked }))
  } }));
  await page.route('**/api/config', async route => {
    if (options.holdConfig) await configGate;
    if (options.configError) return route.fulfill({ status: 503, json: { detail: 'Configuration unavailable.' } });
    return route.fulfill({ json: { generation_enabled: false, generation: { enabled: false, status: 'disabled' }, retrieval: { enabled: true, ready: !!options.ready, status: options.ready ? 'ready' : 'blocked', blocked_reason: options.ready ? undefined : blockedReason, model: 'authored-test-planner' } } });
  });
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/conversations' && request.method() === 'GET') return route.fulfill({ json: { conversations: conversation.turns.length ? [conversation] : [] } });
    if (path === '/api/conversations') {
      const body = request.postDataJSON(); creates.push(body);
      conversation = { ...conversation, routing: body.routing, providers: body.providers || [], filters: body.filters || {} };
      return route.fulfill({ json: conversation });
    }
    if (path.endsWith('/turns')) {
      const body = request.postDataJSON(); sends.push(body);
      const turn: ExplorationTurn = {
        id: `required-turn-${sends.length}`, message: body.message, action: body.action,
        routing: body.routing, agentic: body.agentic, providers: body.providers || ['openalex'],
        status: 'SUCCEEDED', created_at: timestamp, run_ids: [], sources: [], response: '', warnings: [],
        usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 },
        plan: { routing: body.routing === 'auto' ? 'automatic' : 'deterministic', generation: 'disabled' },
        ...(body.agentic ? { retrieval: { status: 'completed', round: 1, max_rounds: 2, query_history: [], assessments: [], rejected_count: 0 } } : {}),
      };
      conversation = { ...conversation, revision: conversation.revision + 1, turns: [...conversation.turns, turn] };
      return route.fulfill({ status: 202, json: conversation });
    }
    return route.fulfill({ json: conversation });
  });
  return { legacy, creates, sends, releaseConfig, get conversation() { return conversation; } };
}

async function forceSubmit(page: Page, label: 'Research question' | 'Exploration message') {
  // Exercise the event-handler guard even when a disabled button cannot be clicked.
  await page.getByLabel(label, { exact: true }).evaluate(input => input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

test('top Search defaults to AI refinement while retaining selected sources, dates and video limit', async ({ page }) => {
  const api = await installRequiredAi(page, { ready: true });
  await page.goto('/app');
  await expect(page.getByRole('switch', { name: 'AI refinement', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Refine search with AI', exact: true })).toHaveCount(0);
  await page.getByTestId('search-options').locator('details.source-picker > summary').click();
  await page.getByRole('button', { name: 'Remove Crossref', exact: true }).click();
  await page.getByTestId('search-options').locator('details.source-picker > summary').click();
  await chooseDateRange(page, 'custom');
  await page.getByLabel('Custom publication year from').fill('2021');
  await page.getByLabel('Custom publication year to').fill('2025');
  await chooseVideoCount(page, 17);
  await page.getByLabel('Research question', { exact: true }).fill('Context selection for reliable language-model agents');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => api.sends.length).toBe(1);
  expect(api.sends[0]).toMatchObject({ action: 'discover', agentic: true, routing: 'auto', source_scope: ['openalex', 'arxiv', 'youtube'], filters: { year_from: 2021, year_to: 2025 }, video_count: 17 });
  expect(api.creates[0]).toMatchObject({ source_scope: ['openalex', 'arxiv', 'youtube'], filters: { year_from: 2021, year_to: 2025 }, video_count: 17 });
  expect(api.sends[0].idempotency_key).toEqual(expect.any(String)); expect(api.legacy.state.starts).toBe(0);
});

test('blocked top Search explains the model allowance and rejects topic submission without creating a raw run or conversation', async ({ page }) => {
  const api = await installRequiredAi(page);
  await page.goto('/app'); await page.getByLabel('Research question', { exact: true }).fill('Improve research retrieval');
  await expect(page.getByTestId('mandatory-refinement-status')).toContainText(blockedReason);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await forceSubmit(page, 'Research question');
  await expect(page.locator('.feedback.error-feedback[role="alert"]')).toContainText('AI refinement is unavailable.');
  expect(api.creates).toHaveLength(0); expect(api.sends).toHaveLength(0); expect(api.legacy.state.starts).toBe(0);
});

test('unknown or failed configuration never silently downgrades topic Search', async ({ page }) => {
  const api = await installRequiredAi(page, { holdConfig: true, configError: true });
  await page.goto('/app'); await page.getByLabel('Research question', { exact: true }).fill('Improve evidence retrieval');
  await expect(page.getByTestId('mandatory-refinement-status')).toContainText('Checking AI query-refinement availability.');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled(); await forceSubmit(page, 'Research question');
  expect(api.creates).toHaveLength(0); expect(api.sends).toHaveLength(0);
  api.releaseConfig();
  await expect(page.getByTestId('mandatory-refinement-status')).toContainText('AI query-refinement availability could not be loaded.');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled(); await forceSubmit(page, 'Research question');
  await expect(page.locator('.feedback.error-feedback[role="alert"]')).toContainText('AI query-refinement availability could not be loaded.');
  expect(api.creates).toHaveLength(0); expect(api.sends).toHaveLength(0); expect(api.legacy.state.starts).toBe(0);
});

test('an exact DOI remains available while AI and discovery providers are blocked, without topic settings leaking into its request', async ({ page }) => {
  const api = await installRequiredAi(page, { providersBlocked: true });
  await page.goto('/app'); await chooseDateRange(page, 'custom');
  await page.getByLabel('Custom publication year from').fill('2025'); await page.getByLabel('Custom publication year to').fill('2021');
  const picker = page.getByTestId('search-options').locator('details.source-picker'); await picker.locator('summary').click();
  for (const label of ['OpenAlex', 'Crossref', 'arXiv', 'YouTube']) await page.getByRole('button', { name: `Remove ${label}`, exact: true }).click();
  await picker.locator('summary').click();
  await page.getByLabel('Research question', { exact: true }).fill('https://doi.org/10.1234/exact-doi');
  const information = await openSearchInformation(page);
  await expect(information.getByText('Exact DOI lookup', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect.poll(() => api.sends.length).toBe(1);
  expect(api.sends[0]).toMatchObject({ action: 'lookup', message: 'https://doi.org/10.1234/exact-doi', filters: {} });
  expect(api.sends[0]).not.toHaveProperty('agentic'); expect(api.sends[0]).not.toHaveProperty('source_scope'); expect(api.sends[0]).not.toHaveProperty('providers'); expect(api.legacy.state.starts).toBe(0);
});

test('Exploration defaults to AI refinement for manual comparison and preserves publication scope and video count', async ({ page }) => {
  const api = await installRequiredAi(page, { ready: true });
  await page.goto('/app'); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click();
  const composer = page.locator('.exploration-composer');
  await expect(composer.getByRole('switch', { name: 'AI refinement', exact: true })).toBeChecked();
  await expect(composer.getByRole('checkbox', { name: 'Refine search with AI', exact: true })).toHaveCount(0);
  await composer.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await composer.getByRole('checkbox', { name: /Crossref/ }).check();
  await chooseVideoCount(page, 13);
  await composer.locator('.exploration-scope-details > summary').click(); await page.getByLabel('Exploration publication year from').fill('2022'); await page.getByLabel('Exploration publication year to').fill('2026');
  await page.getByLabel('Exploration message').fill('Context engineering for language-model agents'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect.poll(() => api.sends.length).toBe(1);
  expect(api.sends[0]).toMatchObject({ action: 'discover', agentic: true, routing: 'manual', providers: ['openalex', 'crossref'], filters: { year_from: 2022, year_to: 2026 }, video_count: 13 }); expect(api.legacy.state.starts).toBe(0);
});

test('blocked Exploration keeps saved direct history readable and exact DOI and saved-source actions available', async ({ page }) => {
  const api = await installRequiredAi(page, { saved: true });
  await page.goto('/app?conversation=required-rag-conversation');
  await expect(page.getByTestId('chat-source')).toContainText(FIRST_SOURCE.title!);
  await page.getByLabel('Exploration message').fill('Another topic query'); await expect(page.getByRole('button', { name: 'Explore', exact: true })).toBeDisabled();
  await expect(page.locator('.exploration-composer').getByTestId('mandatory-refinement-status')).toContainText(blockedReason);
  await forceSubmit(page, 'Exploration message'); await expect(page.locator('.feedback.error-feedback[role="alert"]')).toContainText('AI refinement is unavailable.'); expect(api.sends).toHaveLength(0); expect(api.creates).toHaveLength(0);
  await page.getByLabel('Exploration action').selectOption('saved'); await page.getByLabel('Exploration message').fill('Inspect the saved sources');
  await page.getByRole('button', { name: 'Read saved sources', exact: true }).click(); await expect.poll(() => api.sends.length).toBe(1); expect(api.sends[0]).toMatchObject({ action: 'saved' }); expect(api.sends[0]).not.toHaveProperty('agentic');
  await page.getByLabel('Exploration action').selectOption('discover'); await page.getByLabel('Exploration message').fill('10.1234/registry-record');
  await page.getByRole('button', { name: 'Look up DOI', exact: true }).click(); await expect.poll(() => api.sends.length).toBe(2); expect(api.sends[1]).toMatchObject({ action: 'lookup' }); expect(api.sends[1]).not.toHaveProperty('agentic');
  expect(api.creates).toHaveLength(0); expect(api.legacy.state.starts).toBe(0); expect(api.conversation.turns[0]).toEqual(legacyTurn);
});

test('the visible AI toggle opts into direct automatic search without model readiness and preserves the exact query and scope', async ({ page }) => {
  const api = await installRequiredAi(page, { configError: true });
  await page.goto('/app');
  const toggle = page.getByRole('switch', { name: 'AI refinement', exact: true });
  await expect(toggle).toBeChecked(); await toggle.click(); await expect(toggle).not.toBeChecked();
  expect(api.creates).toEqual([]); expect(api.sends).toEqual([]);
  await expect(page.getByText('Agentic RAG · required', { exact: true })).toHaveCount(0);
  const question = 'How does context selection improve generation?';
  await page.getByLabel('Research question', { exact: true }).fill(question);
  await chooseDateRange(page, 'custom'); await page.getByLabel('Custom publication year from').fill('2022'); await page.getByLabel('Custom publication year to').fill('2026');
  await chooseVideoCount(page, 12);
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => api.sends.length).toBe(1);
  expect(api.sends[0]).toMatchObject({ message: question, action: 'discover', agentic: false, routing: 'auto', source_scope: ['openalex', 'crossref', 'arxiv', 'youtube'], filters: { year_from: 2022, year_to: 2026 }, video_count: 12 });
  expect(api.conversation.turns[0].usage.model_http_attempts).toBe(0);
  expect(api.legacy.state.starts).toBe(0);
});

test('direct preference survives reload and opening AI history and is shared with Exploration', async ({ page }) => {
  const api = await installRequiredAi(page, { ready: true });
  await page.goto('/app'); await page.getByLabel('Research question', { exact: true }).fill('A saved AI-planned search');
  await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect.poll(() => api.sends.length).toBe(1);
  expect(api.sends[0].agentic).toBe(true);
  const toggle = page.getByRole('switch', { name: 'AI refinement', exact: true });
  await toggle.click(); await expect(toggle).not.toBeChecked(); expect(api.sends).toHaveLength(1);
  await page.goto('/app?search=required-rag-conversation'); await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click();
  await expect(page.locator('.exploration-composer').getByRole('switch', { name: 'AI refinement', exact: true })).not.toBeChecked();
  await page.getByLabel('Exploration message').fill('Use the exact direct follow-up query');
  await page.getByRole('button', { name: 'Explore', exact: true }).click(); await expect.poll(() => api.sends.length).toBe(2);
  expect(api.sends[1]).toMatchObject({ message: 'Use the exact direct follow-up query', agentic: false });
  expect(api.conversation.turns[0].agentic).toBe(true);
});

test('manual direct search keeps a visible toggle and selected provider without requiring model credits', async ({ page }) => {
  const api = await installRequiredAi(page);
  await page.goto('/app');
  await page.getByRole('switch', { name: 'AI refinement', exact: true }).click();
  const settings = page.getByTestId('search-settings'); await settings.locator('summary').click();
  await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Discovery provider', { exact: true }).selectOption('crossref');
  if (await settings.evaluate(element => (element as HTMLDetailsElement).open)) await settings.locator('summary').click();
  await expect(page.getByRole('switch', { name: 'AI refinement', exact: true })).toBeVisible();
  await page.getByLabel('Research question', { exact: true }).fill('retrieval context evaluation');
  await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect.poll(() => api.sends.length).toBe(1);
  expect(api.sends[0]).toMatchObject({ agentic: false, routing: 'manual', providers: ['crossref'] });
  expect(api.conversation.turns[0].usage.model_http_attempts).toBe(0);
});

test('changing refinement modes never submits and AI unavailability blocks only the selected AI mode', async ({ page }) => {
  const api = await installRequiredAi(page);
  await page.goto('/app'); await page.getByLabel('Research question', { exact: true }).fill('retrieved context quality');
  const toggle = page.getByRole('switch', { name: 'AI refinement', exact: true });
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await toggle.click(); await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await toggle.click(); await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  expect(api.creates).toEqual([]); expect(api.sends).toEqual([]);
});

test('refinement switch stays in the compact settings row with usable bounds on narrow screens', async ({ page }) => {
  await installRequiredAi(page, { ready: true }); await page.goto('/app');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const toggle = page.getByRole('switch', { name: 'AI refinement', exact: true });
    await expect(toggle).toBeVisible();
    expect(await toggle.evaluate(element => Boolean(element.closest('.hybrid-search-settings')))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('direct queries show inline date errors before dispatch while DOI lookup ignores topic filters', async ({ page }) => {
  const api = await installRequiredAi(page); await page.goto('/app');
  await page.getByRole('switch', { name: 'AI refinement', exact: true }).click();
  await chooseDateRange(page, 'custom'); await page.getByLabel('Custom publication year from').fill('2201');
  await page.getByLabel('Research question', { exact: true }).fill('retrieval context evaluation');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('main').getByText('Choose whole publication years between 1500 and 2200.', { exact: true })).toBeVisible();
  expect(api.creates).toEqual([]); expect(api.sends).toEqual([]);
  await page.getByLabel('Research question', { exact: true }).fill('10.1234/lookup-ignores-topic-range');
  await page.getByRole('button', { name: 'Search', exact: true }).click(); await expect.poll(() => api.sends.length).toBe(1);
  expect(api.sends[0]).toMatchObject({ action: 'lookup', filters: {} });
  expect(api.sends[0]).not.toHaveProperty('agentic'); expect(api.sends[0]).not.toHaveProperty('source_scope');
});
