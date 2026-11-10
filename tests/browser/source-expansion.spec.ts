import { test, expect, type Page } from '../../frontend/node_modules/@playwright/test';
import { DISCOVERY_PROVIDERS, type ProviderId } from '../../frontend/src/lib/api';
import type { AccessObservation, Conversation, ExplorationTurn } from '../../frontend/src/lib/conversations';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

async function installSources(page: Page, missingContact = false) {
  const legacy = await installFixtureApi(page);
  let conversation: Conversation = { id: 'source-expansion', title: 'Source expansion test', status: 'IDLE', revision: 0, cursor: 'expansion:0', created_at: '2026-11-09T12:00:00Z', updated_at: '2026-11-09T12:00:00Z', providers: ['openalex'], filters: {}, turns: [] };
  const sent: Record<string, unknown>[] = [];
  let accessRequests = 0;
  let closed = false;
  let failAccess = false;
  const access: AccessObservation = { provider: 'unpaywall', mode: 'fixture', doi: '10.1234/example', is_oa: true, oa_status: 'green', observed_at: '2026-11-09T12:00:00Z', version: 'access-v1', best_oa_location: { url_for_landing_page: 'https://repository.example.org/paper', url_for_pdf: 'https://repository.example.org/paper.pdf', version: 'acceptedVersion', license: 'cc-by', host_type: 'repository' }, oa_locations: [{ url: 'javascript:window.__accessXss=true', license: '<img src=x onerror="window.__accessXss=true">', version: 'submittedVersion' }] };
  await page.route('**/api/providers', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ providers: [...DISCOVERY_PROVIDERS.map(id => ({ id, mode: 'fixture', status: 'ready', capabilities: { search: true, semantic: true } })), { id: 'datacite', mode: 'fixture', status: 'ready' }, { id: 'unpaywall', mode: 'fixture', status: missingContact ? 'needs_access' : 'ready', access_configured: !missingContact, blocked_reason: missingContact ? 'Configure a contact email for Unpaywall.' : null }] }) }));
  await page.route('**/api/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ generation_enabled: false, generation: { enabled: false, status: 'disabled' } }) }));
  await page.route(/\/api\/conversations(?:\/.*)?(?:\?.*)?$/, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/conversations') {
      if (req.method() === 'GET') return json({ conversations: conversation.turns.length ? [conversation] : [] });
      const body = req.postDataJSON(); conversation = { ...conversation, providers: body.providers, filters: body.filters }; return json(conversation);
    }
    if (path.endsWith('/turns')) {
      const body = req.postDataJSON(); sent.push(body);
      if (body.providers.length > 2) return json({ detail: 'Choose at most two discovery providers.' }, 422);
      const isAccess = body.action === 'access'; if (isAccess) accessRequests++;
      const turn: ExplorationTurn = { id: `expansion-turn-${sent.length}`, message: body.message, action: body.action, providers: isAccess ? ['unpaywall'] : body.providers, status: isAccess ? failAccess ? 'FAILED' : 'SUCCEEDED' : 'RUNNING', created_at: '2026-11-09T12:00:00Z', run_ids: [], sources: [], response: isAccess ? failAccess ? 'Unpaywall could not complete this access lookup.' : 'Unpaywall access metadata returned.' : '', warnings: isAccess && failAccess ? ['Access service unavailable; no other provider was queried.'] : [], usage: { research_attempts: isAccess ? 1 : 0, model_http_attempts: 0, model_cost_usd: 0 }, plan: { routing: 'deterministic', generation: 'disabled' }, activity: isAccess ? [{ provider: 'unpaywall', operation: 'access', status: failAccess ? 'failed' : 'succeeded', attempts: 1, source_count: 0 }] : body.providers.map((provider: string) => ({ provider, operation: 'hybrid_search', status: 'running', attempts: 1, source_count: 0 })), ...(isAccess && !failAccess ? { access: closed ? { ...access, is_oa: false, oa_status: 'closed', best_oa_location: null, oa_locations: [] } : access } : {}) };
      conversation = { ...conversation, revision: conversation.revision + 1, status: isAccess ? 'IDLE' : 'RUNNING', turns: [...conversation.turns, turn] }; return json(conversation, 202);
    }
    return json(conversation);
  });
  return { legacy, sent, get accessRequests() { return accessRequests; }, setClosed() { closed = true; }, setFailure() { failAccess = true; }, async publish(update: Partial<ExplorationTurn>, status: Conversation['status'] = 'RUNNING') {
    conversation = { ...conversation, status, revision: conversation.revision + 1, cursor: `expansion:${conversation.revision + 1}`, turns: conversation.turns.map((turn, index) => index === conversation.turns.length - 1 ? { ...turn, ...update } : turn) };
    await page.evaluate(snapshot => (window as unknown as { __publishScout: (snapshot: unknown) => void }).__publishScout(snapshot), conversation);
  } };
}

test('six discovery choices remain explicit and at most two can be selected; access lookup is separate', async ({ page }) => {
  await installSources(page);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await expect(page.getByLabel('Discovery provider').locator('option')).toHaveCount(6);
  for (const value of DISCOVERY_PROVIDERS) await expect(page.getByLabel('Discovery provider').locator(`option[value="${value}"]`)).toBeEnabled();
  await expect(page.getByLabel('Discovery provider').locator('option[value="unpaywall"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await expect(page.getByRole('group', { name: /Discovery providers/ }).getByRole('checkbox')).toHaveCount(6);
  await page.getByRole('checkbox', { name: /arXiv/ }).check();
  await expect(page.getByRole('checkbox', { name: /Europe PMC/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: /OpenAlex/ }).uncheck();
  await page.getByRole('checkbox', { name: /Europe PMC/ }).check();
  await expect(page.getByText('Discovery providers · 2 of 2 selected')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Unpaywall/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Providers/ }).click();
  await expect(page.getByRole('dialog', { name: 'Research providers' }).getByText('Open-access DOI lookup', { exact: true })).toBeVisible();
});

test('early abstracts expand from saved records while another provider runs; only new details wait for the source run', async ({ page }) => {
  const api = await installSources(page);
  const first = { ...FIRST_SOURCE, provider: 'arxiv', source_ref: 'arxiv:2411.00001v1', record_id: '2411.00001v1', title: 'First page arXiv record', abstract: 'An early arXiv abstract excerpt.', abstract_truncated: true, run_id: 'arxiv-child' };
  const missing = { ...first, source_ref: 'arxiv:2411.00002v1', record_id: '2411.00002v1', title: 'A second early record', abstract: null };
  const fullAbstract = 'Complete saved abstract. ' + 'The original provider described its study methods. '.repeat(20);
  api.legacy.state.snapshot = { ...initialSnapshot(), id: 'arxiv-child', provider: 'arxiv', status: 'RUNNING', entities: [{ ...first, abstract: fullAbstract, truncated_fields: [] }, missing] };
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByRole('checkbox', { name: /OpenAlex/ }).uncheck(); await page.getByRole('checkbox', { name: /arXiv/ }).check(); await page.getByRole('checkbox', { name: /Europe PMC/ }).check();
  await page.getByLabel('Exploration message').fill('Independent scholarly resource results'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await api.publish({ sources: [first, missing] });
  const firstCard = page.getByTestId('chat-source').first(); await expect(firstCard.getByText('An early arXiv abstract excerpt.', { exact: true })).toBeVisible();
  await firstCard.getByRole('button', { name: 'Read available abstract', exact: true }).click(); await expect(firstCard.getByText(fullAbstract, { exact: true })).toBeVisible();
  await expect(page.getByTestId('exploration-turn')).toHaveAttribute('data-status', 'running'); expect(api.legacy.state.details).toBe(0);
  const missingCard = page.getByTestId('chat-source').nth(1); await missingCard.getByRole('button', { name: 'Look up abstract', exact: true }).click();
  await expect(missingCard).toContainText('no external abstract request was made'); expect(api.legacy.state.details).toBe(0);
  api.legacy.state.snapshot.status = 'SUCCEEDED';
  await page.route('**/api/research-runs/arxiv-child/papers/**/details', async route => {
    api.legacy.state.details++; api.legacy.state.snapshot.entities[1] = { ...missing, abstract: 'Available after the source run completed.', details_loaded: true, truncated_fields: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(api.legacy.state.snapshot) });
  });
  await missingCard.getByRole('button', { name: 'Check abstract availability', exact: true }).click(); await expect(missingCard.getByText('Available after the source run completed.', { exact: true })).toBeVisible(); expect(api.legacy.state.details).toBe(1);
  const draft = page.getByLabel('Exploration message'); await draft.fill('Preserve this follow-up'); await draft.focus();
  const biomedical = { ...FIRST_SOURCE, provider: 'europe_pmc', source_ref: 'europe_pmc:MED:12345', record_id: 'MED:12345', title: 'Europe PMC record arriving later', abstract: 'A Europe PMC abstract is now available.', run_id: 'europe-child' };
  await api.publish({ sources: [first, missing, biomedical] });
  await expect(page.getByText('A Europe PMC abstract is now available.', { exact: true })).toBeVisible(); await expect(draft).toBeFocused(); await expect(firstCard.getByText(fullAbstract, { exact: true })).toBeVisible();
  expect(api.sent).toHaveLength(1);
});

test('Unpaywall locations stay separate, links are safe, closed access is valid and replay makes no lookup', async ({ page }) => {
  const api = await installSources(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check();
  await page.getByLabel('Exploration action').selectOption('access'); await page.getByLabel('Exploration message').fill('10.1234/example'); await page.getByRole('button', { name: 'Find open-access copy', exact: true }).click();
  const result = page.getByTestId('access-result'); await expect(result).toContainText('Open-access copy reported'); await expect(result).toContainText('cc-by'); await expect(result.getByRole('link', { name: 'Open PDF', exact: true })).toHaveAttribute('href', 'https://repository.example.org/paper.pdf');
  await expect(page.getByTestId('chat-source')).toHaveCount(0); await expect(page.getByTestId('chat-abstract')).toHaveCount(0);
  await result.getByText('Other reported locations (1)', { exact: true }).click(); await expect(result.getByRole('link')).toHaveCount(2); await expect(result.locator('img,script')).toHaveCount(0); expect(await page.evaluate(() => (window as unknown as { __accessXss?: boolean }).__accessXss)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const url = page.url(); await page.reload(); await expect(page.getByTestId('access-result')).toBeVisible(); expect(page.url()).toBe(url); expect(api.accessRequests).toBe(1); expect(api.legacy.state.starts).toBe(0);
  api.setClosed(); await page.getByLabel('Exploration action').selectOption('access'); await page.getByLabel('Exploration message').fill('10.1234/closed'); await page.getByRole('button', { name: 'Find open-access copy', exact: true }).click();
  const closed = page.getByTestId('exploration-turn').nth(1); await expect(closed).toHaveAttribute('data-status', 'succeeded'); await expect(closed.getByTestId('access-result')).toContainText('No open-access copy reported'); await expect(closed.getByRole('link')).toHaveCount(0);
});

test('missing Unpaywall contact and access failures remain visible without automatic provider fallback', async ({ page }) => {
  await installSources(page, true);
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByLabel('Exploration action').selectOption('access'); await page.getByLabel('Exploration message').fill('10.1234/example');
  await expect(page.locator('.access-action-note').getByText('Configure a contact email for Unpaywall.', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Find open-access copy', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Look up DOI', exact: true })).toHaveCount(0);
});

test('OpenAIRE descriptions are not presented as abstracts', async ({ page }) => {
  const api = await installSources(page); await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('checkbox', { name: /OpenAlex/ }).uncheck(); await page.getByRole('checkbox', { name: /OpenAIRE Graph/ }).check();
  await page.getByLabel('Exploration message').fill('OpenAIRE research descriptions'); await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await api.publish({ sources: [{ ...FIRST_SOURCE, provider: 'openaire', source_ref: 'openaire:record-1', record_id: 'record-1', abstract: null, description: 'A provider-supplied research description.', content_origin: 'provider_description', content_state: 'description', run_id: 'openaire-child' }] });
  const card = page.getByTestId('chat-source'); await expect(card.getByText('Description', { exact: true })).toBeVisible(); await expect(card.getByText('A provider-supplied research description.', { exact: true })).toBeVisible(); await expect(card.getByText('Abstract', { exact: true })).toHaveCount(0);
});

test('failed access lookup does not retry or switch to paper or registry search', async ({ page }) => {
  const api = await installSources(page); api.setFailure();
  await page.goto('/'); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByRole('button', { name: 'Exploration chat', exact: true }).click(); await page.getByRole('checkbox', { name: 'Choose sources manually', exact: true }).check(); await page.getByLabel('Exploration action').selectOption('access'); await page.getByLabel('Exploration message').fill('10.1234/example'); await page.getByRole('button', { name: 'Find open-access copy', exact: true }).click();
  const turn = page.getByTestId('exploration-turn'); await expect(turn).toHaveAttribute('data-status', 'failed'); await expect(turn).toContainText('no other provider was queried'); await expect(turn.getByTestId('activity-unpaywall')).toContainText('Failed'); await expect(turn.getByTestId('activity-crossref')).toContainText('Not queried this turn');
  await expect(page.getByTestId('access-result')).toHaveCount(0); await expect(page.getByTestId('chat-source')).toHaveCount(0); expect(api.accessRequests).toBe(1); expect(api.sent).toHaveLength(1); expect(api.legacy.state.starts).toBe(0);
});
