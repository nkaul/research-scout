import { test, expect, type Page } from '@playwright/test';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';

// One real, valid PDF page: exercising native rendering catches the old sandbox bug.
function pdf() {
  const parts = ['%PDF-1.4\n'];
  const stream = 'BT /F1 18 Tf 36 100 Td (Research Scout PDF preview) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(parts.join(''))); parts.push(`${index + 1} 0 obj\n${object}\nendobj\n`); });
  const xref = Buffer.byteLength(parts.join(''));
  parts.push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.from(parts.join(''));
}

async function setup(page: Page) {
  await installFixtureApi(page);
  const source = { ...FIRST_SOURCE, run_id: 'pdf-native', provider: 'arxiv', source_ref: 'arxiv:2401.12345', record_id: '2401.12345', title: 'PDF preview fixture', url: 'http://arxiv.org/abs/2401.12345v2' };
  const saved = { id: 'pdf-search', title: source.title, status: 'IDLE', revision: 1, cursor: 'pdf:1', created_at: '2026-11-12T12:00:00Z', updated_at: '2026-11-12T12:00:00Z', providers: [], filters: {}, turns: [{ id: 'pdf-turn', message: 'PDF fixture', action: 'discover', routing: 'auto', status: 'SUCCEEDED', created_at: '2026-11-12T12:00:00Z', providers: ['arxiv'], run_ids: [source.run_id], sources: [source], papers: [{ paper_id: source.source_ref, representative: source, providers: ['arxiv'], observations: [source], access: { status: 'not_requested' } }], response: '', warnings: [], usage: { research_attempts: 0, model_http_attempts: 0, model_cost_usd: 0 } }] };
  await page.route('**/api/conversations/pdf-search', route => route.fulfill({ json: saved }));
  await page.route('**/api/research-runs/pdf-native/snapshot', route => route.fulfill({ json: { ...initialSnapshot(), id: source.run_id, provider: 'arxiv', status: 'succeeded', entities: [source] } }));
  return { card: page.getByTestId('search-result-card').first() };
}

test('real PDFs load inline without sandbox blocking and open in a browser tab without a download attribute', async ({ page, context }) => {
  const { card } = await setup(page);
  let fetches = 0;
  const downloads: string[] = [];
  context.on('page', tab => tab.on('download', download => downloads.push(download.suggestedFilename())));
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await context.route('https://arxiv.org/pdf/2401.12345v2', route => { fetches++; return route.fulfill({ contentType: 'application/pdf', headers: { 'Content-Disposition': 'inline; filename="research-preview.pdf"' }, body: pdf() }); });
  await page.goto('/app?search=pdf-search');
  await expect(card.getByRole('button', { name: 'Preview PDF', exact: true })).toBeVisible();
  expect(fetches).toBe(0);
  await card.getByRole('button', { name: 'Preview PDF', exact: true }).click();
  const frame = card.locator('.inline-document-frame');
  await expect(frame).not.toHaveAttribute('sandbox');
  await expect(frame).toHaveAttribute('src', 'https://arxiv.org/pdf/2401.12345v2');
  await expect(card.getByText('Opening PDF…', { exact: true })).toHaveCount(0);
  const link = card.getByRole('link', { name: 'Open PDF in new tab', exact: true });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).not.toHaveAttribute('download');
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://arxiv.org/pdf/2401.12345v2');
  expect(downloads).toEqual([]);
  await popup.close();
});

test('delayed inline PDF keeps a loader and the source actions remain on one line', async ({ page, context }) => {
  const { card } = await setup(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await context.route('https://arxiv.org/pdf/2401.12345v2', async route => { await gate; await route.fulfill({ contentType: 'application/pdf', body: pdf() }); });
  await page.goto('/app?search=pdf-search');
  await card.getByRole('button', { name: 'Preview PDF', exact: true }).click();
  await expect(card.getByText('Opening PDF…', { exact: true })).toBeVisible();
  const centers = await card.locator('.resource-action-bar > button,.resource-action-bar > a').evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return rect.y + rect.height / 2; }));
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
  release();
  await expect(card.getByText('Opening PDF…', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect(card.locator('.inline-document-frame')).toHaveCount(0);
});

test('Download PDF saves validated PDF bytes from the inline preview and shows its preparation time', async ({ page, context }) => {
  const { card } = await setup(page);
  await context.route('https://arxiv.org/pdf/2401.12345v2', route => route.fulfill({ contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*' }, body: pdf() }));
  await page.goto('/app?search=pdf-search');
  await card.getByRole('button', { name: 'Preview PDF', exact: true }).click();
  const preview = card.getByTestId('inline-document');
  await expect(preview.locator('[data-load-kind="PDF"]')).toHaveAttribute('data-loading', 'false');
  const started = page.waitForEvent('download');
  await preview.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const file = await started;
  expect(file.suggestedFilename()).toBe('PDF preview fixture.pdf');
  const stream = await file.createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(preview.locator('[data-load-kind="Download"]')).toHaveAttribute('data-loading', 'false');
  await expect(card.locator('.inline-document-frame')).toHaveCount(1);
});

test('a blocked direct download explains the new-tab fallback without automatically retrying', async ({ page, context }) => {
  const { card } = await setup(page);
  let attempts = 0;
  await context.route('https://arxiv.org/pdf/2401.12345v2', route => {
    if (route.request().resourceType() === 'fetch') { attempts++; return route.abort(); }
    return route.fulfill({ contentType: 'application/pdf', body: pdf() });
  });
  await page.goto('/app?search=pdf-search');
  await card.getByRole('button', { name: 'Preview PDF', exact: true }).click();
  const preview = card.getByTestId('inline-document');
  await preview.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await expect(preview.getByRole('alert')).toContainText('does not allow a direct browser download');
  await expect(preview.getByRole('alert').getByRole('link', { name: 'Open PDF in new tab' })).toHaveAttribute('target', '_blank');
  await expect(preview.locator('[data-load-kind="Download"]')).toContainText('failed');
  expect(attempts).toBe(1);
});

test('a host login/error page is not saved as a PDF download', async ({ page, context }) => {
  const { card } = await setup(page), files: string[] = [];
  page.on('download', file => files.push(file.suggestedFilename()));
  await context.route('https://arxiv.org/pdf/2401.12345v2', route => route.fulfill(route.request().resourceType() === 'fetch' ? { contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: '<html>Sign in to view this paper</html>' } : { contentType: 'application/pdf', body: pdf() }));
  await page.goto('/app?search=pdf-search');
  await card.getByRole('button', { name: 'Preview PDF', exact: true }).click();
  const preview = card.getByTestId('inline-document');
  await preview.getByRole('button', { name: 'Download PDF', exact: true }).click();
  await expect(preview.getByRole('alert')).toContainText('returned a page instead of a PDF');
  expect(files).toEqual([]);
});

test('closing an inline PDF cancels a pending download without a late file save', async ({ page, context }) => {
  const { card } = await setup(page), files: string[] = [];
  await page.addInitScript(() => {
    const state = window as Window & { observedPdfAborts?: number };
    state.observedPdfAborts = 0;
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes('/pdf/2401.12345v2')) init?.signal?.addEventListener('abort', () => { state.observedPdfAborts!++; }, { once: true });
      return original(input, init);
    };
  });
  let release!: () => void, delivered!: () => void, captured!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const responseDelivered = new Promise<void>(resolve => { delivered = resolve; });
  const requestCaptured = new Promise<void>(resolve => { captured = resolve; });
  page.on('download', file => files.push(file.suggestedFilename()));
  await context.route('https://arxiv.org/pdf/2401.12345v2', async route => {
    if (route.request().resourceType() === 'fetch') { captured(); await gate; }
    await route.fulfill({ contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*' }, body: pdf() }).catch(() => undefined);
    if (route.request().resourceType() === 'fetch') delivered();
  });
  await page.goto('/app?search=pdf-search');
  await card.getByRole('button', { name: 'Preview PDF', exact: true }).click();
  await card.getByTestId('inline-document').getByRole('button', { name: 'Download PDF', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Preparing download…', exact: true })).toBeDisabled();
  await requestCaptured;
  await card.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { observedPdfAborts?: number }).observedPdfAborts)).toBe(1);
  release(); await responseDelivered;
  await expect(card.getByTestId('inline-document')).toHaveCount(0);
  expect(files).toEqual([]);
});
