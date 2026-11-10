import { test, expect } from '../../frontend/node_modules/@playwright/test';
import { FIRST_SOURCE, SECOND_SOURCE, installFixtureApi } from './fixture-api';

test('first rows can be inspected and saved before completion; updates preserve identity and focus', async ({ page }) => {
  const api = await installFixtureApi(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Research question', { exact: true }).fill('Institutional AI readiness in higher education');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('run-progress')).toHaveAttribute('data-status', 'running');
  await api.publish({ entities: [FIRST_SOURCE], operations: { lexical: { status: 'succeeded' }, semantic: { status: 'running' } } });
  const title = page.getByRole('button', { name: FIRST_SOURCE.title, exact: true });
  await expect(title).toBeVisible();
  await expect(page.getByTestId('run-progress')).toHaveAttribute('data-status', 'running');
  await page.getByRole('button', { name: `Include ${FIRST_SOURCE.title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Exclude ${FIRST_SOURCE.title}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await title.focus();
  await api.publish({ entities: [{ ...FIRST_SOURCE, branch_ranks: { lexical: 1, semantic: 2 } }, SECOND_SOURCE] });
  await expect(page.getByTestId('source-row')).toHaveCount(2);
  await expect(title).toBeFocused();
  await expect(page.getByTestId('source-row').first()).toHaveAttribute('data-source-ref', FIRST_SOURCE.source_ref);
  await title.click();
  await expect(page.getByRole('region', { name: 'Source preview', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Your notes', exact: true }).click();
  await page.getByLabel('Reason (optional)').fill('Useful institutional context; inspect the methods later.');
  await page.getByRole('button', { name: 'Save reason', exact: true }).click();
  await api.publish({ status: 'succeeded', operations: { lexical: { status: 'succeeded' }, semantic: { status: 'succeeded' } }, summary: 'Fixture-generated fit note; not a research finding.' });
  await expect(page.getByLabel('Reason (optional)')).toHaveValue('Useful institutional context; inspect the methods later.');
  await page.keyboard.press('Escape');
  await expect(title).toBeFocused();
  await expect(page.getByTestId('source-row').first()).toHaveAttribute('data-source-ref', FIRST_SOURCE.source_ref);
  await page.getByRole('button', { name: 'Final ranking available' }).click();
  await expect(page.getByTestId('source-row').first()).toHaveAttribute('data-source-ref', SECOND_SOURCE.source_ref);
  expect(api.state.starts).toBe(1);
  await expect(page.getByText('Saved ranking applied. Your shortlist is unchanged.', { exact: true })).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('workspace-desktop.png'), fullPage: true });
});

test('reopen and exports use saved state; DOI observations remain separate and stale writes retain drafts', async ({ page }) => {
  const api = await installFixtureApi(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Research question', { exact: true }).fill('Institutional AI readiness');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('run-progress')).toBeVisible();
  await api.publish({ entities: [FIRST_SOURCE], status: 'succeeded', operations: { lexical: { status: 'succeeded' }, semantic: { status: 'succeeded' } } });
  await page.getByRole('button', { name: FIRST_SOURCE.title, exact: true }).click();
  await page.getByRole('tab', { name: 'Your notes', exact: true }).click();
  await page.getByLabel('Reason (optional)').fill('Keep this reason through a stale write.');
  api.state.conflictNextSelection = true;
  await page.getByRole('button', { name: 'Include source', exact: true }).click();
  await expect(page.getByLabel('Reason (optional)')).toHaveValue('Keep this reason through a stale write.');
  await expect(page.getByRole('region', { name: 'Source preview', exact: true }).getByText('This research changed while you were editing.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Include source', exact: true }).click();
  await page.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await page.getByRole('button', { name: 'Check DOI metadata', exact: true }).click();
  await expect(page.getByText('Fixture registry title observed separately')).toBeVisible();
  await expect(page.getByRole('heading', { name: FIRST_SOURCE.title, exact: true })).toBeVisible();
  await expect(page.getByText('The original discovery fields remain unchanged.')).toBeVisible();
  await page.getByRole('button', { name: 'Use registry record for citation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Using registry record for citation', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(api.state.snapshot.selections[FIRST_SOURCE.source_ref].citation_source).toBe('registry');
  await page.keyboard.press('Escape');
  const started = api.state.starts, checked = api.state.checks;
  await page.reload();
  await expect(page.getByRole('button', { name: FIRST_SOURCE.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Saved shortlist/ }).click();
  await expect(page.getByText('Keep this reason through a stale write.')).toBeVisible();
  await page.getByText('Export', { exact: true }).click();
  const markdownDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bibliography (.md)', exact: true }).click();
  expect((await markdownDownload).suggestedFilename()).toBe('bibliography.md');
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Query manifest (.json)', exact: true }).click();
  expect((await jsonDownload).suggestedFilename()).toBe('manifest.json');
  expect(api.state.starts).toBe(started);
  expect(api.state.checks).toBe(checked);
  expect(api.state.details).toBe(0);
  expect(api.state.exports).toBe(2);
});

test('provider edits are explicit and reconnection cannot rerun research or duplicate sources', async ({ page }) => {
  const api = await installFixtureApi(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  const question = page.getByLabel('Research question', { exact: true });
  const multilingualQuestion = '研'.repeat(700);
  await question.fill(multilingualQuestion);
  await expect(question).toHaveValue(multilingualQuestion);
  await expect(question).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('2,100 / 2,000 UTF-8 bytes', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Shorten your question to 2,000 UTF-8 bytes or fewer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await question.press('Enter');
  expect(api.state.starts).toBe(0);
  const boundaryQuestion = 'a'.repeat(2000);
  await question.fill(boundaryQuestion);
  await expect(page.getByText('2,000 / 2,000 UTF-8 bytes', { exact: true })).toBeVisible();
  await expect(question).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
  await page.getByLabel('Discovery provider').selectOption('semantic_scholar');
  await page.getByRole('button', { name: 'Edit publication years', exact: true }).click();
  await page.getByLabel('Publication year from').fill('2022');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(api.state.starts).toBe(0);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  expect(api.state.submitted[0].question).toBe(boundaryQuestion);
  expect(api.state.submitted[0].provider).toBe('semantic_scholar');
  expect(api.state.submitted[0].filters).toEqual({ year_from: 2022, year_to: null });
  const source = { ...FIRST_SOURCE, provider: 'semantic_scholar', source_ref: 'semantic_scholar:fixture-work-1' };
  await api.publish({ entities: [source] });
  await api.disconnect();
  await expect(page.getByText('Reconnecting · updates may be stale')).toBeVisible();
  await expect(page.getByRole('button', { name: source.title, exact: true })).toBeVisible();
  await api.publish({ entities: [source] });
  await api.publish({ entities: [source], status: 'partial', operations: { lexical: { status: 'succeeded' }, semantic: { status: 'unavailable' } }, warnings: ['Semantic capability unavailable; lexical fixture results retained.'] });
  await expect(page.getByTestId('source-row')).toHaveCount(1);
  await expect(page.getByText('Semantic capability unavailable; lexical fixture results retained.')).toBeVisible();
  expect(api.state.starts).toBe(1);
});

test('mobile keyboard flow, modal focus and reading layout remain usable', async ({ page }) => {
  const api = await installFixtureApi(page);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  const question = page.getByLabel('Research question', { exact: true });
  await question.fill('Institutional AI readiness');
  await question.press('Enter');
  await expect(page.getByTestId('run-progress')).toBeVisible();
  await api.publish({ entities: [FIRST_SOURCE], status: 'succeeded', operations: { lexical: { status: 'succeeded' }, semantic: { status: 'succeeded' } } });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('button', { name: /^Saved shortlist/ })).toBeVisible();
  await page.keyboard.press('Escape');
  const title = page.getByRole('button', { name: FIRST_SOURCE.title, exact: true });
  await title.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Include source', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(title).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.getByRole('banner').getByText('Fixture data', { exact: true })).toBeVisible();
  await expect(page.getByText('Included in your saved shortlist.', { exact: true })).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('workspace-mobile.png'), fullPage: true });
});

test('three-paper cap and eligibility updates preserve human decisions visibly', async ({ page }) => {
  const api = await installFixtureApi(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Research question', { exact: true }).fill('Fixture shortlist review');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('run-progress')).toBeVisible();
  const sources = Array.from({ length: 4 }, (_, index) => ({ ...FIRST_SOURCE, source_ref: `openalex:cap-${index}`, record_id: `cap-${index}`, title: `Fixture candidate ${index + 1}` }));
  await api.publish({ entities: sources });
  for (const source of sources.slice(0, 3)) {
    await page.getByRole('button', { name: `Include ${source.title}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Exclude ${source.title}`, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: `Include ${sources[3].title}`, exact: true })).toBeDisabled();
  await api.publish({ entities: [{ ...sources[0], eligible: false, filter_warnings: ['Selected fixture no longer passes the enforced year filter.'] }, ...sources.slice(1)] });
  await expect(page.getByTestId('source-row').first().getByText('Selected fixture no longer passes the enforced year filter.')).toBeVisible();
  await expect(page.getByRole('button', { name: `Exclude ${sources[0].title}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(api.state.snapshot.selections[sources[0].source_ref].state).toBe('included');
  await page.getByRole('button', { name: `Exclude ${sources[0].title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Include ${sources[3].title}`, exact: true })).toBeEnabled();
});

test('untitled and truncated records remain honest and DOI checks require inclusion', async ({ page }) => {
  const api = await installFixtureApi(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Research question', { exact: true }).fill('Incomplete metadata review');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('run-progress')).toBeVisible();
  await api.publish({
    entities: [{
      ...FIRST_SOURCE,
      title: null,
      authors: ['Only Supplied Author'],
      missing_fields: ['title'],
      truncated_fields: ['authors'],
      metadata_status: 'provider_supplied',
      content_state: 'abstract',
    }],
    status: 'succeeded',
    operations: { lexical: { status: 'succeeded' }, semantic: { status: 'succeeded' } },
  });

  await expect(page.getByRole('button', { name: 'Include Untitled provider record', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Untitled provider record', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Source preview', exact: true });
  await expect(inspector.getByRole('heading', { name: 'Untitled provider record', exact: true })).toBeVisible();
  await expect(inspector.locator('.inspector-authors')).toHaveText('Only Supplied Author');
  await expect(inspector.getByText('Truncated provider fields: authors. Displayed values may be incomplete.')).toBeVisible();
  await expect(inspector.getByText('Missing provider fields: title. Missing values have not been filled in.')).toBeVisible();
  await inspector.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(inspector.getByRole('button', { name: 'Check DOI metadata', exact: true })).toBeDisabled();
  await expect(inspector.getByText('Include this source in your shortlist before checking DOI metadata.')).toBeVisible();

  await inspector.getByRole('button', { name: 'Get available details', exact: true }).click();
  expect(api.state.details).toBe(1);
  await expect(inspector.locator('.inspector-authors')).toHaveText('Only Supplied Author');
  await expect(inspector.getByText('Truncated provider fields: authors. Displayed values may be incomplete.')).toBeVisible();
  await inspector.getByRole('button', { name: 'Include source', exact: true }).click();
  await expect(inspector.getByRole('button', { name: 'Check DOI metadata', exact: true })).toBeEnabled();
  expect(api.state.checks).toBe(0);
  await inspector.evaluate(element => { element.scrollTop = 0; });
  await inspector.screenshot({ path: test.info().outputPath('metadata-completeness-inspector.png') });
});


test('desktop split preview, notes and display preferences use existing saved data', async ({ page }) => {
  const api = await installFixtureApi(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Research question', { exact: true }).fill('Review the source-first workspace');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('run-progress')).toBeVisible();
  await api.publish({ entities: [FIRST_SOURCE, SECOND_SOURCE] });
  const preview = page.getByRole('region', { name: 'Source preview', exact: true });
  await expect(preview.getByRole('heading', { name: FIRST_SOURCE.title, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  await preview.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(preview.getByRole('tab', { name: 'Your notes', exact: true })).toBeFocused();
  await page.getByLabel('Reason (optional)').fill('A saved reason in the redesigned reading workspace.');
  await api.publish({ entities: [{ ...FIRST_SOURCE, version: 2, eligible: false, filter_warnings: ['The active record changed eligibility during review.'] }, SECOND_SOURCE] });
  await expect(page.getByLabel('Reason (optional)')).toHaveValue('A saved reason in the redesigned reading workspace.');
  await expect(page.getByLabel('Reason (optional)')).toBeFocused();
  await expect(preview.getByRole('heading', { name: FIRST_SOURCE.title, exact: true })).toBeVisible();
  await api.publish({ entities: [FIRST_SOURCE, SECOND_SOURCE] });
  await preview.getByRole('button', { name: 'Include source', exact: true }).click();
  await page.getByRole('button', { name: /^Research notes/ }).click();
  await expect(page.getByTestId('source-row')).toHaveCount(1);
  await expect(page.getByLabel('Reason (optional)')).toHaveValue('A saved reason in the redesigned reading workspace.');
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await page.getByLabel('Find in results').fill('policy');
  await expect(page.getByTestId('source-row')).toHaveCount(1);
  await expect(page.getByTestId('source-row').first()).toHaveAttribute('data-source-ref', SECOND_SOURCE.source_ref);
  await page.getByLabel('Find in results').fill('');
  await page.getByRole('button', { name: 'Open workspace settings', exact: true }).click();
  await page.getByLabel('Source density', { exact: true }).selectOption('compact');
  await page.getByLabel('Source excerpts', { exact: true }).check();
  await page.getByLabel('Publication year from').fill('2201');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('main').getByText('Choose whole publication years between 1500 and 2200.', { exact: true }).first()).toBeVisible();
  expect(api.state.starts).toBe(1);
  await page.getByRole('button', { name: 'Open workspace settings', exact: true }).click();
  await page.getByLabel('Publication year from').fill('2024');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compact source density', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('source-row').first().locator('.source-excerpt')).toBeVisible();
  expect(api.state.starts).toBe(1);
  expect(api.state.submitted[0].filters).toEqual({ year_from: 2020, year_to: null });
  expect(api.state.details).toBe(0);
  expect(api.state.checks).toBe(0);
  await page.getByRole('button', { name: /^Providers/ }).click();
  await expect(page.getByRole('dialog', { name: 'Research providers', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('Dub-inspired workspace remains readable at tablet and narrow phone widths', async ({ page }) => {
  const api = await installFixtureApi(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Research question', { exact: true }).fill('How can persistent memory improve reliability in long-running AI agents?');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('run-progress')).toBeVisible();
  const sources = [FIRST_SOURCE, SECOND_SOURCE, ...Array.from({ length: 4 }, (_, index) => ({ ...FIRST_SOURCE, source_ref: `openalex:design-${index}`, record_id: `design-${index}`, title: ['Fixture study: memory consolidation for research agents', 'Fixture review: evidence and recovery in agent workflows', 'Fixture methods: comparing retrieval policies', 'Fixture survey: maintaining reliable working context'][index], year: 2026 - index % 3 }))];
  await api.publish({ entities: sources, status: 'succeeded', operations: { lexical: { status: 'succeeded' }, semantic: { status: 'succeeded' } } });
  await expect(page.getByTestId('source-row')).toHaveCount(6);
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    if (width < 900) await expect(page.getByRole('dialog')).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath(`dub-workspace-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Workspace settings', exact: true });
  await expect(settings).toBeVisible();
  await page.getByLabel('Publication year from').fill('2023');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const title = page.getByRole('button', { name: FIRST_SOURCE.title, exact: true });
  await title.click();
  const reader = page.getByRole('dialog', { name: FIRST_SOURCE.title, exact: true });
  await expect(reader).toBeVisible();
  await expect.poll(() => reader.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
  await reader.screenshot({ path: test.info().outputPath('dub-mobile-reader.png') });
  await page.keyboard.press('Escape');
  await expect(title).toBeFocused();
  expect(api.state.starts).toBe(1);
});
