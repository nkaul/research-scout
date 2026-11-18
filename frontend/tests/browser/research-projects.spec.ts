import { test, expect, type Page } from '@playwright/test';
import type { ResearchProject } from '../../src/lib/projects';
import type { Conversation, ChatSource } from '../../src/lib/conversations';
import { FIRST_SOURCE, installFixtureApi } from './fixture-api';

const source: ChatSource = { ...FIRST_SOURCE, run_id: 'fixture-run-1' };
function conversation(id = 'project-search', title = 'Original research question'): Conversation {
  return { id, title, routing: 'auto', status: 'IDLE', revision: 1, cursor: `${id}:1`, created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', providers: [], filters: {}, turns: [{ id: `${id}-turn`, action: 'discover', routing: 'auto', message: title, status: 'SUCCEEDED', created_at: '2026-11-11T12:00:00Z', providers: ['openalex'], run_ids: ['fixture-run-1'], sources: [source], papers: [{ paper_id: 'doi:10.0000/fixture-1', representative: source, observations: [source], providers: ['openalex'], access: { status: 'not_requested' } }], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
}
const initialProject = (): ResearchProject => ({ id: 'project-1', name: 'Research framework', description: '', revision: 0, created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', concepts: [], queries: [], resources: [] });

async function install(page: Page, existing = false) {
  const legacy = await installFixtureApi(page);
  legacy.state.snapshot = { ...legacy.state.snapshot, status: 'succeeded', entities: [{ ...FIRST_SOURCE, title: 'Latest provider title version two', version: 2 }] };
  let projects: ResearchProject[] = existing ? [initialProject()] : [], saved = conversation();
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/config', route => route.fulfill({ json: { generation: { enabled: false }, retrieval: { enabled: true, ready: true } } }));
  await page.route(/\/api\/projects(?:\/.*)?$/, route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') return route.fulfill({ json: { projects } });
    const body = route.request().postDataJSON(); writes.push({ path, body });
    if (path === '/api/projects') { projects.push({ ...initialProject(), name: body.name }); return route.fulfill({ json: projects[0] }); }
    const project = projects[0]; project.revision++;
    if (path.endsWith('/concepts')) project.concepts.push({ id: `concept-${project.concepts.length + 1}`, name: body.name, created_at: project.created_at });
    if (path.endsWith('/queries')) {
      const cid = body.conversation_id as string;
      if (!project.queries.some(query => query.conversation_id === cid)) project.queries.push({ id: `query-${project.queries.length + 1}`, conversation_id: cid, run_id: null, turn_id: body.turn_id, title: saved.title, question: saved.title, created_at: project.created_at, concept_ids: body.concept_ids || [] });
    }
    if (path.endsWith('/resources')) {
      if (!project.resources.length) project.resources.push({ id: 'resource-1', identity: 'doi:10.0000/fixture-1', kind: 'paper', title: source.title!, doi: source.doi, provider: source.provider, record_id: source.record_id, url: source.url, year: source.year, run_id: source.run_id, source_ref: source.source_ref, version: body.version, saved_at: project.created_at, concept_ids: body.concept_ids || [], observations: [{ run_id: source.run_id, source_ref: source.source_ref, version: body.version, source }] });
      else project.resources[0].concept_ids = [...new Set([...project.resources[0].concept_ids, ...body.concept_ids])];
    }
    return route.fulfill({ json: project });
  });
  await page.route(/\/api\/conversations(?:\/.*)?$/, route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') return route.fulfill({ json: path === '/api/conversations' ? { conversations: [saved] } : saved });
    if (path === '/api/conversations') { saved = { ...conversation('next-search', 'Next research question'), revision: 0, turns: [] }; return route.fulfill({ json: saved }); }
    const body = route.request().postDataJSON(); saved = conversation('next-search', body.message); return route.fulfill({ json: saved });
  });
  return { writes, projects: () => projects };
}

test('projects group concepts, multiple queries and explicitly saved source versions across reload', async ({ page }) => {
  const api = await install(page); await page.goto('/app?search=project-search');
  await expect(page.getByTestId('search-result-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Manage research projects', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Research projects', exact: true });
  await dialog.getByLabel('New research project name').fill('Context systems'); await dialog.getByRole('button', { name: 'Create research project', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Context systems', exact: true })).toBeVisible();
  await dialog.getByLabel('New concept name').fill('Context engineering'); await dialog.getByRole('button', { name: 'Create concept', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Context engineering', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close research projects', exact: true }).click();
  await page.getByLabel('Active project concept').selectOption('concept-1');
  await page.getByRole('button', { name: 'Add current query to project', exact: true }).click();
  await expect.poll(() => api.projects()[0].queries.length).toBe(1);
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Save to project', exact: true }).click();
  await expect(page.getByTestId('search-result-card').getByRole('button', { name: 'Saved to project', exact: true })).toBeVisible();
  expect(api.writes.find(item => item.path.endsWith('/resources'))!.body).toMatchObject({ run_id: source.run_id, source_ref: source.source_ref, version: 1, concept_ids: ['concept-1'] });
  await page.getByLabel('Research question', { exact: true }).fill('Next research question'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => api.projects()[0].queries.length).toBe(2);
  expect(api.writes.filter(item => item.path.endsWith('/queries')).at(-1)!.body).toMatchObject({ conversation_id: 'next-search', turn_id: 'next-search-turn', concept_ids: ['concept-1'] });
  await page.reload(); await expect(page.getByLabel('Active research project')).toHaveValue('project-1');
  await page.getByRole('button', { name: 'Manage research projects', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /Original research question/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Next research question/ })).toBeVisible();
  await dialog.getByRole('button', { name: new RegExp(FIRST_SOURCE.title!) }).click();
  const panel = page.getByRole('complementary', { name: 'Source details', exact: true });
  await expect(panel.getByRole('heading', { name: FIRST_SOURCE.title!, exact: true })).toBeVisible();
  await panel.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(panel.locator('.record-properties').first()).toContainText('1');
  await expect(panel.getByText('Latest provider title version two', { exact: true })).toHaveCount(0);
  await panel.getByRole('tab', { name: 'Your notes', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Include', exact: true })).toBeDisabled();
  await expect(panel.getByLabel('Reason', { exact: false })).toBeDisabled();
  await panel.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await panel.getByRole('button', { name: 'Get available details', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Latest provider title version two', exact: true })).toBeVisible();
  await panel.getByRole('tab', { name: 'Your notes', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Include', exact: true })).toBeEnabled();
});

test('save chooser pins the resource and adding another concept remains possible', async ({ page }) => {
  const api = await install(page, true); await page.goto('/app?search=project-search');
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Save to project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Research projects', exact: true });
  await expect(dialog.getByRole('group', { name: 'Save destination' })).toContainText(FIRST_SOURCE.title!);
  await dialog.getByRole('button', { name: 'Save resource to project', exact: true }).click();
  await expect.poll(() => api.projects()[0].resources.length).toBe(1);
  await dialog.getByLabel('New concept name').fill('Another concept'); await dialog.getByRole('button', { name: 'Create concept', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Another concept', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close research projects', exact: true }).click();
  await page.getByLabel('Active project concept').selectOption('concept-1');
  await page.getByTestId('search-result-card').getByRole('button', { name: 'Save to project', exact: true }).click();
  await expect.poll(() => api.projects()[0].resources[0].concept_ids).toEqual(['concept-1']);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
});
