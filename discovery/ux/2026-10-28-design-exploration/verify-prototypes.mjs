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

async function exerciseDemo(page) {
  await page.locator('[data-action="reset"]:visible').first().click();
  await page.waitForFunction(() => document.querySelectorAll('#sources .source').length === 1);
  const source = page.locator('#sources .source').first();
  const id = await source.getAttribute('data-source-id');
  const save = source.locator('[data-save]');
  if (await save.getAttribute('aria-pressed') === 'true') await save.click();
  assert.equal(await save.getAttribute('aria-pressed'), 'false');
  await save.focus();
  await page.waitForFunction(() => document.querySelectorAll('#sources .source').length >= 2);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.save), id, 'A late row moved keyboard focus');
  assert.match(await page.locator('#semantic-status').innerText(), /running|matching|progress|searching|pending/i);
  await source.locator('[data-inspect]').first().click();
  assert.equal(await page.locator('#inspector').isVisible(), true);
  const check = page.locator('#inspector [data-action="check"]');
  assert.equal(await check.isDisabled(), true, 'DOI simulation must require human inclusion');
  const reason = 'Keep this synthetic source for the governance comparison.';
  await page.locator('#source-reason').fill(reason);
  await page.locator('[data-dialog-save]').click();
  assert.equal(await check.isEnabled(), true);
  await check.click();
  assert.equal(await page.locator('#registry-result').isVisible(), true);
  assert.match(await page.locator('#registry-result').innerText(), /simulat|separate/i);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#inspector').isVisible(), false);
  await page.waitForFunction(sourceId => document.activeElement.dataset.inspect === sourceId, id, { timeout: 2000 });
  assert.equal(await page.evaluate(() => document.activeElement.dataset.inspect), id, 'Inspector did not restore its opener');
  await page.waitForFunction(() => document.querySelectorAll('#sources .source').length === 3);
  const downloadReady = page.waitForEvent('download');
  await page.locator('[data-action="export"]:visible').first().click();
  const download = await downloadReady;
  const downloaded = await fs.readFile(await download.path(), 'utf8');
  assert.match(downloaded, /Fictional records/);
  assert.ok(downloaded.includes(reason), 'Demo export lost the human reason');
  await source.locator('[data-inspect]').first().click();
  assert.equal(await page.locator('#source-reason').inputValue(), reason);
  await page.keyboard.press('Escape');
  return { passed: true, earlySourceUsable: true, keyboardFocusStableOnArrival: true, inspectorEscapeAndFocusReturn: true, inclusionRequiredForRegistrySimulation: true, humanReasonPreserved: true, syntheticExport: download.suggestedFilename() };
}

try {
  for (const name of (requested.length ? requested : ['prototype-01', 'prototype-02', 'prototype-03', 'index'])) {
    for (const [size, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844], ['narrow', 320, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = [];
      const externalRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (/^https?:/.test(request.url())) externalRequests.push(request.url());
      });
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
      await page.screenshot({ path: path.join(directory, 'previews', `${name}-${size}.png`), fullPage: true });
      let interaction = null;
      if (name !== 'index' && size !== 'narrow') {
        try { interaction = await exerciseDemo(page); }
        catch (error) { interaction = { passed: false, error: error.message }; }
      }
      receipt.checks.push({ prototype: name, viewport: { name: size, width, height }, errors, externalRequests, ...inspection, focus, sampledTextPairs, unmeasuredTextPairs, contrastIssues, interaction });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

receipt.passed = receipt.checks.every(check => check.errors.length === 0 && check.externalRequests.length === 0 && check.language === 'en' && check.h1Count === 1 && check.horizontalOverflow === 0 && check.unnamedButtons === 0 && check.inputsWithoutLabels === 0 && check.brokenImages === 0 && check.animatedElementsInReducedMotion === 0 && check.contrastIssues.length === 0 && check.interaction?.passed !== false);
await fs.writeFile(path.join(directory, 'prototype-checks.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ passed: receipt.passed, checks: receipt.checks.map(({ prototype, viewport, errors, horizontalOverflow, unnamedButtons, inputsWithoutLabels, sampledTextPairs, unmeasuredTextPairs, contrastIssues, interaction }) => ({ prototype, viewport: viewport.name, errors, horizontalOverflow, unnamedButtons, inputsWithoutLabels, sampledTextPairs, unmeasuredTextPairs, contrastIssues, interaction })) }, null, 2));
if (!receipt.passed) process.exitCode = 1;
