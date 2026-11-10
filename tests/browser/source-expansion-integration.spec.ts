import { test, expect } from '../../frontend/node_modules/@playwright/test';

test('actual fixture services route all added discovery sources and keep Unpaywall access separate', async ({ page, request }) => {
  test.skip(!process.env.SCOUT_BROWSER_INTEGRATION, 'Requires the explicitly started fixture backend.');
  for (const provider of ['arxiv', 'openaire', 'europe_pmc', 'crossref']) {
    const created = await request.post('/api/conversations', { data: { providers: [provider] } });
    expect(created.status()).toBe(201);
    const conversation = await created.json();
    await page.goto(`/?conversation=${conversation.id}`);
    await page.getByLabel('Exploration message').fill('Authored fixture research with abstracts');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    const turn = page.getByTestId('exploration-turn').last();
    await expect(turn).toHaveAttribute('data-status', /succeeded|partial/);
    await expect(turn.getByTestId('chat-source').first()).toBeVisible();
    await expect(turn.getByTestId('chat-abstract').first()).toBeVisible();
    const before = await (await request.get(`/api/conversations/${conversation.id}`)).json();
    expect(before.turns.at(-1).sources.every((source: { provider: string; mode: string }) => source.provider === provider && source.mode === 'fixture')).toBe(true);
    expect(before.turns.at(-1).usage.model_http_attempts).toBe(0);
    await page.reload();
    await expect(page.getByTestId('chat-source').first()).toBeVisible();
    const after = await (await request.get(`/api/conversations/${conversation.id}`)).json();
    expect(after.turns.at(-1).usage).toEqual(before.turns.at(-1).usage);
  }
  const created = await request.post('/api/conversations', { data: {} });
  const conversation = await created.json();
  await page.goto(`/?conversation=${conversation.id}`);
  await page.getByLabel('Exploration action').selectOption('access');
  await page.getByLabel('Exploration message').fill('10.0000/scout.fixture.crossref.001');
  await page.getByRole('button', { name: 'Find open-access copy', exact: true }).click();
  await expect(page.getByTestId('access-result')).toBeVisible();
  await expect(page.getByTestId('chat-source')).toHaveCount(0);
  const saved = await (await request.get(`/api/conversations/${conversation.id}`)).json();
  expect(saved.turns.at(-1).access.provider).toBe('unpaywall');
  expect(saved.turns.at(-1).access.mode).toBe('fixture');
  expect(saved.turns.at(-1).usage.model_http_attempts).toBe(0);
});
