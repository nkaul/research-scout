/** Local prototype QA. Requires the existing Research Scout Playwright install. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const directory = path.dirname(fileURLToPath(import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(directory, '../../../frontend/.browser-cache');
const { chromium } = await import('../../../frontend/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chromium', args: ['--disable-gpu'] });
const receipt = { date: '2026-10-28', scope: 'Authored HTML prototypes only; not production acceptance or complete accessibility conformance.', checks: [] };
const requested = process.argv.slice(2);
await fs.mkdir(path.join(directory, 'previews'), { recursive: true });

async function getDemoDownload(page, selector, expectedNote) {
  const ready = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await ready;
  const text = await fs.readFile(await download.path(), 'utf8');
  assert.match(text, /fictional|illustrative/i);
  assert.ok(text.includes(expectedNote), 'Export lost the human reading note');
  return download.suggestedFilename();
}

async function exerciseDemo(page, name) {
  const note = 'My own note: inspect the methods before keeping this source.';
  if (name === 'prototype-04') {
    await page.locator('[data-source="02"]').click();
    assert.match(await page.locator('#reading-title').innerText(), /Context allocation/);
    await page.locator('#reading-note').fill(note);
    if (await page.locator('#bookmark-top').getAttribute('aria-pressed') !== 'true') await page.locator('#bookmark-top').click();
    assert.equal(await page.locator('#bookmark-top').getAttribute('aria-pressed'), 'true');
    if (await page.locator('#replay').isVisible()) await page.locator('#replay').click();
    else await page.locator('#search-form button[type="submit"]').click();
    assert.equal(await page.locator('.source-row').count(), 1);
    assert.match(await page.locator('#semantic-state').innerText(), /running/i);
    const earlyNote = 'An early note while additional sources arrive.';
    await page.locator('#reading-note').fill(earlyNote);
    await page.waitForFunction(() => document.querySelectorAll('.source-row').length >= 2);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reading-note');
    assert.equal(await page.locator('#reading-note').inputValue(), earlyNote);
    await page.waitForFunction(() => document.querySelectorAll('.source-row').length === 3);
    await page.locator('[data-source="02"]').click();
    assert.equal(await page.locator('#reading-note').inputValue(), note);
    await page.locator('[data-panel="metadata"]').click();
    assert.match(await page.locator('#metadata').innerText(), /OpenAlex/);
    await page.locator('[data-panel="overview"]').click();
    const file = await getDemoDownload(page, '#export', note);
    return { passed: true, inlineReader: true, earlySourceUsable: true, humanNoteAndSelectionRetained: true, noteFocusStableOnArrival: true, sourceDetails: true, syntheticExport: file };
  }
  if (name === 'prototype-05') {
    await page.locator('#replay').click();
    assert.equal(await page.locator('.source-button').count(), 2);
    assert.match(await page.locator('#semantic-status').innerText(), /arriving|running/i);
    await page.locator('#note-tab').click();
    await page.locator('#note').fill(note);
    if (await page.locator('#save').getAttribute('aria-pressed') !== 'true') await page.locator('#save').click();
    const first = page.locator('.source-button').first();
    const label = await first.getAttribute('aria-label');
    await first.focus();
    await page.waitForFunction(() => document.querySelectorAll('.source-button').length === 4);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), label);
    await page.locator('#note-tab').click();
    assert.equal(await page.locator('#note').inputValue(), note);
    await page.locator('.source-button').nth(3).click();
    assert.match(await page.locator('#content-note').innerText(), /metadata only/i);
    await page.locator('.source-button').first().click();
    await page.locator('#note-tab').click();
    assert.equal(await page.locator('#note').inputValue(), note);
    const file = await getDemoDownload(page, '#export', note);
    return { passed: true, inlineReader: true, earlySourceUsable: true, humanNoteAndSelectionRetained: true, sourceFocusStableOnArrival: true, metadataOnlyDisclosed: true, syntheticExport: file };
  }
  if (name === 'prototype-06') {
    await page.locator('.replay').click();
    await page.waitForFunction(() => document.querySelectorAll('#source-grid .source').length === 1);
    const first = page.locator('#source-grid .source').first();
    const checkbox = first.locator('[data-include]');
    const id = await checkbox.getAttribute('data-include');
    if (await checkbox.isChecked()) await checkbox.uncheck();
    await checkbox.focus();
    await page.waitForFunction(() => document.querySelectorAll('#source-grid .source').length >= 2);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.include), id);
    await first.locator('[data-inspect]').first().click();
    assert.equal(await page.locator('#inspector').isVisible(), true);
    assert.equal(await page.locator('#registry-check').isDisabled(), true);
    await page.locator('#inclusion-reason').fill(note);
    await page.locator('#inspector-save').click();
    assert.equal(await page.locator('#registry-check').isEnabled(), true);
    await page.locator('#registry-check').click();
    assert.equal(await page.locator('#registry-result').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(sourceId => document.activeElement.dataset.inspect === sourceId, id);
    await page.waitForFunction(() => document.querySelectorAll('#source-grid .source').length === 3);
    await page.locator('[data-layout="list"]').click();
    assert.equal(await page.locator('#source-grid').evaluate(el => el.classList.contains('list')), true);
    await page.locator('[data-layout="board"]').click();
    const file = await getDemoDownload(page, '#export-demo', note);
    return { passed: true, spatialSourceView: true, earlySourceUsable: true, sourceFocusStableOnArrival: true, humanNoteAndSelectionRetained: true, explicitRegistrySimulation: true, inspectorEscapeAndFocusReturn: true, boardAndListViews: true, syntheticExport: file };
  }
  throw new Error(`Unknown prototype: ${name}`);
}

try {
  for (const name of (requested.length ? requested : ['prototype-04', 'prototype-05', 'prototype-06', 'index'])) {
    for (const [size, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844], ['narrow', 320, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = [];
      const externalRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (/^https?:/.test(request.url())) externalRequests.push(request.url());
      });
      page.setDefaultTimeout(7000);
      await page.goto(pathToFileURL(path.join(directory, `${name}.html`)).href);
      await page.waitForTimeout(200);
      const inspection = await page.evaluate(() => {
        const visible = element => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return box.width > 2 && box.height > 2 && box.bottom > 0 && box.right > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const unnamedButtons = [...document.querySelectorAll('button')].filter(visible).filter(button => !(
          button.getAttribute('aria-label') || button.getAttribute('aria-labelledby') || button.textContent.trim()
        )).length;
        const inputsWithoutLabels = [...document.querySelectorAll('input:not([type=hidden]),textarea,select')].filter(visible).filter(input => !(
          input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || input.labels?.length
        )).length;
        const textSamples = [...document.querySelectorAll('body *')].filter(visible).filter(element =>
          !['SCRIPT', 'STYLE', 'SVG', 'PATH', 'TITLE'].includes(element.tagName) &&
          !element.closest(':disabled,[aria-disabled="true"]') &&
          !element.closest('[aria-hidden="true"]') &&
          [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
        ).map(element => {
          const style = getComputedStyle(element);
          const backgrounds = [];
          let cursor = element;
          while (cursor) {
            const current = getComputedStyle(cursor);
            backgrounds.push({ color: current.backgroundColor, image: current.backgroundImage });
            cursor = cursor.parentElement;
          }
          return { text: element.textContent.trim().slice(0, 110), color: style.color, size: style.fontSize, weight: style.fontWeight, backgrounds };
        });
        return {
          title: document.title,
          language: document.documentElement.lang,
          h1Count: document.querySelectorAll('h1').length,
          horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          unnamedButtons,
          inputsWithoutLabels,
          brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).length,
          duplicateIds: [...new Set([...document.querySelectorAll('[id]')].map(element => element.id))].filter(id => document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length > 1),
          textSamples,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          animatedElementsInReducedMotion: [...document.querySelectorAll('body *')].filter(visible).filter(element => {
            const style = getComputedStyle(element);
            return style.animationName !== 'none' && style.animationDuration.split(',').some(value => Number.parseFloat(value) > 0);
          }).length,
        };
      });
      // Check actual rendered text against composited solid backgrounds; gradients
      // are disclosed as unmeasured rather than reported as passing.
      const parse = value => {
        const parts = value.match(/^rgba?\(([^)]+)\)$/)?.[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
        return parts?.length >= 3 ? [parts[0], parts[1], parts[2], parts[3] ?? 1] : null;
      };
      const over = (foreground, background) => [...foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3])), 1];
      const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const contrastIssues = [];
      let sampledTextPairs = 0;
      let unmeasuredTextPairs = 0;
      for (const sample of inspection.textSamples) {
        const foreground = parse(sample.color);
        const colors = sample.backgrounds.map(item => parse(item.color));
        if (!foreground || colors.some(color => !color) || sample.backgrounds.some(item => item.image !== 'none')) { unmeasuredTextPairs++; continue; }
        const background = colors.reverse().reduce((base, color) => over(color, base), [255, 255, 255, 1]);
        const actual = over(foreground, background);
        const l1 = luminance(actual), l2 = luminance(background);
        const ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
        const fontSize = Number.parseFloat(sample.size);
        const required = fontSize >= 24 || (fontSize >= 18.666 && Number(sample.weight) >= 700) ? 3 : 4.5;
        sampledTextPairs++;
        if (ratio < required) contrastIssues.push({ text: sample.text, color: sample.color, background: background.slice(0, 3).map(Math.round), ratio: Number(ratio.toFixed(2)), required });
      }
      delete inspection.textSamples;
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const active = document.activeElement;
        const style = getComputedStyle(active);
        return { tag: active.tagName, label: active.getAttribute('aria-label') || active.textContent.trim().slice(0, 70), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
      });
      await page.mouse.click(width - 5, height - 5);
      await page.screenshot({ path: path.join(directory, 'previews', `${name === 'index' ? 'index-round-2' : name}-${size}.png`), fullPage: true });
      let interaction = null;
      if (name !== 'index' && size !== 'narrow') {
        try { interaction = await exerciseDemo(page, name); }
        catch (error) { interaction = { passed: false, error: error.message }; }
      }
      receipt.checks.push({ prototype: name, viewport: { name: size, width, height }, errors, externalRequests, ...inspection, focus, sampledTextPairs, unmeasuredTextPairs, contrastIssues, interaction });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

receipt.passed = receipt.checks.every(check => check.errors.length === 0 && check.externalRequests.length === 0 && check.language === 'en' && check.h1Count === 1 && check.horizontalOverflow === 0 && check.unnamedButtons === 0 && check.inputsWithoutLabels === 0 && check.brokenImages === 0 && check.duplicateIds.length === 0 && check.animatedElementsInReducedMotion === 0 && check.contrastIssues.length === 0 && check.interaction?.passed !== false);
await fs.writeFile(path.join(directory, 'round-2-checks.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ passed: receipt.passed, checks: receipt.checks.map(({ prototype, viewport, errors, horizontalOverflow, unnamedButtons, inputsWithoutLabels, sampledTextPairs, unmeasuredTextPairs, contrastIssues, interaction }) => ({ prototype, viewport: viewport.name, errors, horizontalOverflow, unnamedButtons, inputsWithoutLabels, sampledTextPairs, unmeasuredTextPairs, contrastIssues, interaction })) }, null, 2));
if (!receipt.passed) process.exitCode = 1;
