/** Bounded actual-UI proof: two public DOI lookups, saved follow-up and reload. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root, 'frontend/.browser-cache');
const { chromium } = await import('../frontend/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chromium', args: ['--disable-gpu'] });
const report = { date: '2026-11-09', scope: 'Actual live UI → conversation LangGraph → independent registry services → public REST; no mocks or hosted inference.', cases: [], errors: [] };
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
page.on('pageerror', error => report.errors.push(error.message));
const directory = path.join(root, 'docs/validation/images/live-routing-2026-11-09');
await fs.mkdir(directory, { recursive: true });
try {
  await page.goto('http://127.0.0.1:3100/');
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click();
  await page.getByRole('button', { name: 'Try a Crossref DOI', exact: true }).click();
  await page.getByRole('button', { name: 'Look up DOI', exact: true }).click();
  await page.getByTestId('exploration-turn').first().waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="exploration-turn"]')?.dataset.status === 'succeeded', null, { timeout: 30000 });
  const id = new URL(page.url()).searchParams.get('conversation');
  const get = async () => (await page.request.get(`http://127.0.0.1:3100/api/conversations/${id}`)).json();
  let saved = await get();
  assert.equal(saved.turns[0].sources[0].provider, 'crossref');
  assert.equal(saved.turns[0].sources[0].mode, 'live');
  assert.equal(saved.turns[0].sources[0].registry_only, true);
  assert.equal(saved.turns[0].usage.research_attempts, 2);
  report.cases.push({ name: 'Crossref agency and metadata through actual UI', passed: true, provider: 'crossref', source_ref: saved.turns[0].sources[0].source_ref, attempts: 2 });
  await page.getByLabel('Exploration action', { exact: true }).selectOption('saved');
  await page.getByLabel('Exploration message', { exact: true }).fill('Show source 1');
  await page.getByRole('button', { name: 'Read saved sources', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exploration-turn"]')[1]?.dataset.status === 'succeeded');
  saved = await get();
  assert.equal(saved.turns[1].sources.length, 1);
  assert.equal(saved.turns[1].usage.research_attempts, 0);
  assert.equal(saved.turns[1].sources[0].version, saved.turns[0].sources[0].version);
  report.cases.push({ name: 'Saved 2009 metadata follow-up without inherited discovery filter or new calls', passed: true, attempts: 0 });
  await page.getByLabel('Exploration action', { exact: true }).selectOption('lookup');
  await page.getByLabel('Exploration message', { exact: true }).fill('10.14454/qdd3-ps68');
  await page.getByRole('button', { name: 'Look up DOI', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exploration-turn"]')[2]?.dataset.status === 'succeeded', null, { timeout: 30000 });
  saved = await get();
  assert.equal(saved.turns[2].sources[0].provider, 'datacite');
  assert.equal(saved.turns[2].sources[0].mode, 'live');
  assert.equal(saved.turns[2].usage.research_attempts, 2);
  assert.equal(saved.turns.flatMap(turn => turn.run_ids).length, 0);
  report.cases.push({ name: 'Crossref agency routes exact DOI to DataCite, without discovery or field blending', passed: true, provider: 'datacite', source_ref: saved.turns[2].sources[0].source_ref, attempts: 2 });
  const before = saved.turns.map(turn => ({ id: turn.id, sources: turn.sources, usage: turn.usage }));
  await page.reload();
  await page.getByTestId('exploration-turn').nth(2).waitFor();
  saved = await get();
  assert.deepEqual(saved.turns.map(turn => ({ id: turn.id, sources: turn.sources, usage: turn.usage })), before);
  report.cases.push({ name: 'Reload reopens exact saved observations and receipts', passed: true });
  await page.screenshot({ path: path.join(directory, 'exploration-desktop.png'), fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await page.getByTestId('exploration-turn').nth(2).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(directory, `exploration-${width}.png`), fullPage: true });
    report.cases.push({ name: `Saved live conversation at ${width}px without horizontal overflow`, passed: true });
  }
  report.runtime = await (await page.request.get('http://127.0.0.1:8100/health')).json();
  report.providers = (await (await page.request.get('http://127.0.0.1:3100/api/providers')).json()).providers;
  report.research_upstream_attempts = saved.turns.reduce((sum, turn) => sum + turn.usage.research_attempts, 0);
  report.model_http_attempts = saved.turns.reduce((sum, turn) => sum + turn.usage.model_http_attempts, 0);
  report.model_cost_usd = saved.turns.reduce((sum, turn) => sum + turn.usage.model_cost_usd, 0);
  assert.equal(report.model_http_attempts, 0);
  report.passed = report.errors.length === 0;
} catch (error) {
  report.passed = false;
  report.failure = error.message;
} finally {
  await browser.close();
}
await fs.writeFile(path.join(root, 'docs/validation/2026-11-09-live-routing-ui.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, cases: report.cases, research_upstream_attempts: report.research_upstream_attempts, model_http_attempts: report.model_http_attempts, error: report.failure }, null, 2));
if (!report.passed) process.exitCode = 1;
