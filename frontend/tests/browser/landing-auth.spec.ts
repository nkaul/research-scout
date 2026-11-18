import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const enabled = process.env.SCOUT_BROWSER_AUTH_INTEGRATION === '1';
const disposable = process.env.SCOUT_AUTH_BROWSER_DISPOSABLE === '1';
const coreUrl = process.env.SCOUT_AUTH_TEST_CORE_URL || '';
const fixtureOwner = { username: 'browser-owner', email: 'browser-owner@example.test', password: 'Only-a-disposable-fixture-2026!' };
test.use({ trace: 'off' });

type AuthConfiguration = {
  enabled: boolean;
  setup_required: boolean;
  google_client_id: string | null;
  csrf_token: string;
  google_nonce: string;
  reset_delivery?: 'local_outbox' | 'smtp';
};

function disposableTarget(value: string, label: string) {
  const url = new URL(value);
  expect(['127.0.0.1', 'localhost'], `${label} must be an isolated loopback fixture`).toContain(url.hostname);
  expect(['3100', '8100', '5180', '8000'], `${label} must not use an existing application port`).not.toContain(url.port);
  expect(url.protocol).toBe('http:');
  return url.origin;
}

async function configuration(request: APIRequestContext) {
  const response = await request.get('/api/auth/config');
  expect(response.ok(), 'Explicit auth validation requires the real auth API').toBe(true);
  expect(response.headers()['cache-control']).toContain('no-store');
  const body = await response.json() as AuthConfiguration;
  expect(body.enabled, 'An auth-off fixture cannot prove backend enforcement').toBe(true);
  expect(typeof body.csrf_token).toBe('string');
  expect(body.csrf_token.length).toBeGreaterThan(20);
  return body;
}

async function rejectExternalRequests(page: Page) {
  const external: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      external.push(url.origin + url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  return external;
}

async function signInOwner(page: Page, next = '/app') {
  const config = await configuration(page.request);
  await page.goto('/login?next=' + encodeURIComponent(next));
  if (config.setup_required) {
    await page.locator('input[name=username]').fill(fixtureOwner.username);
    await page.locator('input[name=email]').fill(fixtureOwner.email);
    await page.locator('input[name=password]').fill(fixtureOwner.password);
    await page.locator('input[name=confirm_password]').fill(fixtureOwner.password);
    await page.getByRole('button', { name: 'Create account and continue', exact: true }).click();
  } else {
    await page.locator('input[name=identifier]').fill(fixtureOwner.username);
    await page.locator('input[name=password]').fill(fixtureOwner.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  const expected = new URL(next, page.url());
  await expect(page).toHaveURL(url => url.pathname === expected.pathname && url.searchParams.toString() === expected.searchParams.toString());
  await expect(page.locator('summary[aria-label="Account and sign out"]')).toBeVisible();
}

function fixtureOutbox() {
  const folder = path.resolve(process.env.SCOUT_AUTH_TEST_OUTBOX_DIR || '');
  const prefix = path.resolve(__dirname, '../../../.scout/landing-auth-');
  expect(folder.startsWith(prefix), 'Read only the dedicated disposable landing-auth outbox').toBe(true);
  return folder;
}

async function outboxFiles(folder: string) {
  return new Set(await fs.readdir(folder).catch(error => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  }));
}

async function newResetLink(folder: string, before: Set<string>, frontend: string) {
  const read = async () => {
    for (const file of await outboxFiles(folder)) {
      if (before.has(file) || !file.endsWith('.json')) continue;
      const value = JSON.parse(await fs.readFile(path.join(folder, file), 'utf8'));
      if (value.to !== fixtureOwner.email) continue;
      expect((await fs.stat(path.join(folder, file))).mode & 0o077).toBe(0);
      expect((await fs.stat(folder)).mode & 0o077).toBe(0);
      const url = new URL(value.reset_url);
      expect(url.origin).toBe(new URL(frontend).origin);
      expect(url.pathname).toBe('/reset-password');
      expect((url.searchParams.get('token') || '').length).toBeGreaterThan(30);
      return url;
    }
    return null;
  };
  let found: URL | null = null;
  await expect.poll(async () => { found = await read(); return Boolean(found); }).toBe(true);
  return found!;
}

test.describe('landing and real authentication boundaries', () => {
  test.skip(!enabled, 'Enable only against the dedicated auth-enabled fixture core and Next preview.');

  test.beforeEach(async ({ baseURL }) => {
    expect(disposable, 'Set SCOUT_AUTH_BROWSER_DISPOSABLE=1 only for the dedicated disposable SQLite preview').toBe(true);
    disposableTarget(baseURL || '', 'Frontend');
    disposableTarget(coreUrl, 'Core');
  });

  test('public landing keeps the question as a draft and does not start research', async ({ page, baseURL }) => {
    const external = await rejectExternalRequests(page);
    const researchWrites: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (request.method() !== 'GET' && /^\/api\/(?:research|conversation|dataset|repo|project)/.test(url.pathname)) researchWrites.push(url.pathname);
    });
    // The Unicode example is 1,998 UTF-8 bytes: legal even though URL encoding exceeds 4,096 characters.
    for (const question of ['Authored fixture question about source provenance', '研'.repeat(666)]) {
      await page.goto('/');
      await expect(page.getByRole('textbox', { name: /research question/i })).toBeVisible();
      await page.getByRole('textbox', { name: /research question/i }).fill(question);
      const form = page.getByRole('textbox', { name: /research question/i }).locator('xpath=ancestor::form');
      await form.locator('button[type=submit]').click();
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      const url = new URL(page.url());
      const destination = [...url.searchParams.values()].map(value => new URL(value, url.origin)).find(value => value.pathname === '/app');
      expect(destination?.searchParams.get('q') === question, 'The admitted question must survive the sign-in return URL exactly').toBe(true);
    }
    await page.goto('/');
    const question = page.getByRole('textbox', { name: /research question/i });
    await question.fill('研'.repeat(2000));
    expect(await question.evaluate(node => (node as HTMLTextAreaElement).checkValidity())).toBe(false);
    const submit = page.getByTestId('landing-question-form').locator('button[type=submit]');
    if (await submit.isEnabled()) await submit.click();
    await expect(page).toHaveURL(new URL('/', baseURL!).href);
    expect(await question.inputValue()).toHaveLength(2000);
    expect(researchWrites).toEqual([]);
    expect(external.filter(path => !path.startsWith('https://accounts.google.com/gsi/'))).toEqual([]);
  });

  test('anonymous and forged-cookie access fail at Next SSR and the core API', async ({ page, request }) => {
    await rejectExternalRequests(page);
    await configuration(request);
    for (const path of ['/api/research-runs', '/api/projects', '/api/economics', '/api/admin/economics']) {
      expect((await request.get(path)).status(), `Next ${path}`).toBe(401);
      expect((await request.get(coreUrl + path)).status(), `Core ${path}`).toBe(401);
    }
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    // A frontend that only tests cookie presence would accept this value.
    const sessionCookie = process.env.SCOUT_AUTH_TEST_COOKIE_NAME || 'scout_session';
    await page.context().addCookies([{ name: sessionCookie, value: 'forged-auth-fixture-cookie', url: new URL(page.url()).origin, httpOnly: true }]);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    expect((await page.request.get('/api/research-runs')).status()).toBe(401);
    expect([401, 403]).toContain((await page.request.post(coreUrl + '/mcp/', { data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } })).status());
  });

  test('login mutations reject missing CSRF and hostile origins without creating a session', async ({ request, baseURL }) => {
    const config = await configuration(request);
    const login = { identifier: 'missing-fixture-owner@example.test', password: 'Synthetic-invalid-password-2026!' };
    const missing = await request.post('/api/auth/login', { data: login, headers: { Origin: new URL(baseURL!).origin } });
    expect(missing.status()).toBe(403);
    const hostile = await request.post('/api/auth/login', { data: login, headers: { Origin: 'https://attacker.invalid', 'X-CSRF-Token': config.csrf_token } });
    expect(hostile.status()).toBe(403);
    const session = await request.get('/api/auth/session');
    expect(session.headers()['cache-control']).toContain('no-store');
    expect((await session.json()).authenticated).toBe(false);
  });

  test('owner setup/sign-in preserve a draft and logout revokes the real backend session', async ({ page, playwright, baseURL }) => {
    await rejectExternalRequests(page);
    const writes: string[] = [];
    page.on('request', request => { if (request.method() !== 'GET' && /^\/api\/(?:research-runs|conversations|dataset-searches|repo-searches)(?:\/|$)/.test(new URL(request.url()).pathname)) writes.push(new URL(request.url()).pathname); });
    const draft = 'Authored fixture draft retained through sign-in';
    await signInOwner(page, '/app?q=' + encodeURIComponent(draft));
    await expect(page.getByRole('textbox', { name: 'Research question', exact: true })).toHaveValue(draft);
    expect(writes).toEqual([]);
    const providers = await (await page.request.get('/api/providers')).json();
    expect(providers.providers.length).toBeGreaterThan(0);
    expect(providers.providers.every((provider: { mode: string }) => provider.mode === 'fixture'), 'Auth validation must use fixture providers only').toBe(true);
    const workspaceConfig = await (await page.request.get('/api/config')).json();
    expect(workspaceConfig.generation?.enabled, 'Auth validation must not enable hosted answer generation').toBe(false);
    const cookie = (await page.context().cookies()).find(value => value.name === 'scout_session');
    expect(Boolean(cookie)).toBe(true);
    expect(cookie?.httpOnly).toBe(true);
    expect(['Lax', 'Strict']).toContain(cookie?.sameSite);
    expect(cookie?.path).toBe('/');
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000);
    expect(await page.evaluate(() => document.cookie.includes('scout_session='))).toBe(false);
    expect((await page.request.get('/api/projects')).status()).toBe(200);
    const mutation = await page.request.post('/api/projects', { data: { name: 'Rejected missing CSRF fixture' }, headers: { Origin: new URL(baseURL!).origin } });
    expect(mutation.status()).toBe(403);
    const config = await configuration(page.request);
    const project = await page.request.post('/api/projects', { data: { name: 'Disposable auth validation project' }, headers: { Origin: new URL(baseURL!).origin, 'X-CSRF-Token': config.csrf_token } });
    expect(project.status()).toBe(201);
    expect([401, 403]).toContain((await page.request.post(coreUrl + '/mcp/', { data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } })).status());
    const oldSession = await playwright.request.newContext({ baseURL, storageState: await page.context().storageState() });
    try {
      await page.locator('summary[aria-label="Account and sign out"]').click();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(new URL('/', baseURL!).href);
      expect((await oldSession.get('/api/projects')).status()).toBe(401);
      await page.goto('/app');
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      await signInOwner(page);
      for (const [category, name] of [['papers', /^Papers/], ['videos', /^Videos/], ['data', /^Data/], ['repos', /^Repos/]] as const) {
        await page.goto('/app?category=' + category);
        await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      }
      expect(writes).toEqual([]);
      await page.goto('/account');
      await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
      await expect(page.getByText(fixtureOwner.username, { exact: true })).toBeVisible();
    } finally { await oldSession.dispose(); }
  });

  test('forgot/reset is generic, private, single use and revokes prior sessions', async ({ page, playwright, baseURL }) => {
    test.setTimeout(60_000);
    await rejectExternalRequests(page);
    const folder = fixtureOutbox();
    await signInOwner(page);
    const config = await configuration(page.request);
    expect(config.reset_delivery, 'This fixture must not send real email').toBe('local_outbox');
    const oldSession = await playwright.request.newContext({ baseURL, storageState: await page.context().storageState() });
    const before = await outboxFiles(folder);
    try {
      await page.goto('/forgot-password');
      await page.locator('input[name=identifier]').fill(fixtureOwner.username);
      const forgot = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/auth/forgot-password');
      await page.getByRole('button', { name: 'Send reset instructions', exact: true }).click();
      const known = await (await forgot).json();
      expect(Object.keys(known).sort()).toEqual(['message', 'ok']);
      await expect(page.getByRole('status')).toContainText('If this account exists');
      const anonymousConfig = await configuration(page.request);
      const unknown = await page.request.post('/api/auth/forgot-password', { data: { identifier: 'unregistered-fixture@example.test' }, headers: { Origin: new URL(baseURL!).origin, 'X-CSRF-Token': anonymousConfig.csrf_token } });
      expect(unknown.status()).toBe(200);
      expect(await unknown.json()).toEqual(known);
      const link = await newResetLink(folder, before, baseURL!);
      const token = link.searchParams.get('token')!;
      await page.goto(link.href);
      await expect.poll(() => new URL(page.url()).searchParams.has('token')).toBe(false);
      expect(new URL(page.url()).pathname).toBe('/reset-password');
      const changedPassword = 'A-new-disposable-fixture-password-2026!';
      await page.locator('input[name=password]').fill(changedPassword);
      await page.locator('input[name=confirm_password]').fill(changedPassword);
      await page.getByRole('button', { name: 'Update password', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toBeVisible();
      expect((await oldSession.get('/api/projects')).status()).toBe(401);
      const resetConfig = await configuration(page.request);
      const headers = { Origin: new URL(baseURL!).origin, 'X-CSRF-Token': resetConfig.csrf_token };
      expect((await page.request.post('/api/auth/reset-password', { data: { token, password: fixtureOwner.password }, headers })).status()).toBe(400);
      expect((await page.request.post('/api/auth/login', { data: { identifier: fixtureOwner.username, password: fixtureOwner.password }, headers })).status()).toBe(401);
      expect((await page.request.post('/api/auth/login', { data: { identifier: fixtureOwner.username, password: changedPassword }, headers })).status()).toBe(200);
      expect((await page.request.get('/api/projects')).status()).toBe(200);
      // Restore only this synthetic fixture account so a rerun needs no real credentials.
      const restoreBefore = await outboxFiles(folder);
      const restoreConfig = await configuration(page.request);
      expect((await page.request.post('/api/auth/forgot-password', { data: { identifier: fixtureOwner.username }, headers: { Origin: new URL(baseURL!).origin, 'X-CSRF-Token': restoreConfig.csrf_token } })).status()).toBe(200);
      const restore = await newResetLink(folder, restoreBefore, baseURL!);
      await page.goto(restore.href);
      await page.locator('input[name=password]').fill(fixtureOwner.password);
      await page.locator('input[name=confirm_password]').fill(fixtureOwner.password);
      await page.getByRole('button', { name: 'Update password', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Password updated', exact: true })).toBeVisible();
      await signInOwner(page);
    } finally { await oldSession.dispose(); }
  });

  test('invalid Google credentials and replayed nonce cannot establish a session', async ({ request, baseURL }) => {
    const config = await configuration(request);
    expect(Boolean(config.google_client_id), 'Set a synthetic public client ID on the auth fixture').toBe(true);
    const headers = { Origin: new URL(baseURL!).origin, 'X-CSRF-Token': config.csrf_token };
    const credential = { credential: 'malformed-fixture-id-token', nonce: config.google_nonce };
    expect((await request.post('/api/auth/google', { data: credential, headers })).status()).toBe(401);
    expect((await request.post('/api/auth/google', { data: credential, headers })).status()).toBe(403);
    expect((await (await request.get('/api/auth/session')).json()).authenticated).toBe(false);
  });

  test('sign-in return destinations cannot navigate outside protected local routes', async ({ page, baseURL }) => {
    const external = await rejectExternalRequests(page);
    await signInOwner(page);
    for (const next of ['https://attacker.invalid/collect', '//attacker.invalid/collect', '/\\attacker.invalid/collect', 'javascript:alert(1)', '/%2f%2fattacker.invalid']) {
      await page.goto('/login?next=' + encodeURIComponent(next));
      await expect(page).toHaveURL(new URL('/app', baseURL!).href);
    }
    expect(external.filter(value => !value.startsWith('https://accounts.google.com/gsi/'))).toEqual([]);
  });

  test('public landing and auth forms reflow with operable keyboard navigation', async ({ page }) => {
    test.setTimeout(60_000);
    await rejectExternalRequests(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [1440, 1100, 970, 768, 650, 390, 320]) {
      await page.setViewportSize({ width, height: 1080 });
      for (const route of ['/', '/login', '/forgot-password']) {
        await page.goto(route);
        await expect(page.locator('main')).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      }
    }
    await page.goto('/');
    await expect(page.getByTestId('landing-research-map').locator('article')).toHaveCount(6);
    for (const [name, category] of [['Explore papers', 'papers'], ['Explore videos', 'videos'], ['Explore datasets', 'data'], ['Explore repositories', 'repos']]) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', '/app?category=' + category);
    }
    const menu = page.getByTestId('landing-navigation-toggle');
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('authenticated account menu fits the viewport and restores keyboard focus', async ({ page }) => {
    await rejectExternalRequests(page);
    await signInOwner(page);
    const measurements: { width: number; x: number; right: number; panelWidth: number; headerOverflow: number }[] = [];
    for (const width of [1440, 1100, 970, 768, 650, 390, 320]) {
      await page.setViewportSize({ width, height: 1080 });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const summary = page.locator('summary[aria-label="Account and sign out"]');
      const details = summary.locator('xpath=..');
      const panel = details.locator(':scope > div');
      await expect(summary).toContainText(fixtureOwner.username);
      await expect(page.locator('.topbar .header-actions > :last-child')).toHaveAttribute('data-workspace-account', '');
      const alignment = await summary.evaluate(node => {
        const trigger = node.getBoundingClientRect();
        const header = node.closest('header')!;
        return { right: trigger.right, headerRight: header.getBoundingClientRect().right - parseFloat(getComputedStyle(header).paddingRight), radius: parseFloat(getComputedStyle(node).borderTopRightRadius), height: trigger.height };
      });
      expect(Math.abs(alignment.right - alignment.headerRight)).toBeLessThanOrEqual(1);
      expect(alignment.radius).toBeGreaterThanOrEqual(alignment.height / 2);
      await summary.click();
      await expect(panel).toBeVisible();
      const box = (await panel.boundingBox())!;
      measurements.push({ width, x: box.x, right: box.x + box.width, panelWidth: box.width, headerOverflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) });
      if ([1440, 390, 320].includes(width)) {
        const screenshot = path.resolve(__dirname, `../../../docs/validation/account-pill-2026-11-15-${width}.png`);
        await page.screenshot({ path: screenshot, animations: 'disabled' });
        await test.info().attach(`account-menu-${width}`, { path: screenshot, contentType: 'image/png' });
      }
      await panel.getByRole('button', { name: 'Sign out', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(panel).not.toBeVisible();
      await expect(summary).toBeFocused();
    }
    await test.info().attach('account-menu-geometry', { body: JSON.stringify(measurements), contentType: 'application/json' });
    expect(measurements.filter(row => row.x < 0 || row.right > row.width + 1 || row.headerOverflow > 0)).toEqual([]);
  });
});
