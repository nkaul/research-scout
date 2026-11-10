/** Local prototype QA. Requires the existing Research Scout Playwright install. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const directory = path.dirname(fileURLToPath(import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(directory, '../../../frontend/.browser-cache');
const { chromium } = await import('../../../frontend/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chromium', args: ['--disable-gpu'] });
const receipt = { date: '2026-10-29', scope: 'Authored HTML prototypes only; not production acceptance or complete accessibility conformance.', checks: [] };
const requested = process.argv.slice(2);
await fs.mkdir(path.join(directory, 'previews'), { recursive: true });

async function exerciseDemo(page, name) {
  const note = 'My reading note: inspect methods before including this source.';
  const captureReader = () => page.screenshot({path: path.join(directory, 'previews', `${name}-${page.viewportSize().width}-reader.png`), fullPage: true});
  const download = async selector => {
    const [item] = await Promise.all([
      page.waitForEvent('download'),
      page.locator(selector).click()
    ]);
    const body = await fs.readFile(await item.path(), 'utf8');
    assert.match(body, /fictional|illustrative/i);
    assert.ok(body.includes(note), 'Export lost the human note');
    return item.suggestedFilename();
  };
  if (name === 'linear-trial') {
    await page.locator('#replay').click();
    assert.equal(await page.locator('[data-source]').count(), 3);
    await page.locator('[data-source="1"]').click();
    const title = await page.locator('#reader-title').innerText();
    if (await page.locator('#shortlist-toggle').getAttribute('aria-pressed') !== 'true') await page.locator('#shortlist-toggle').click();
    await page.locator('#add-note').click();
    await page.locator('#source-note').fill(note);
    await page.waitForFunction(() => document.querySelectorAll('[data-source]').length === 8);
    assert.equal(await page.locator('#source-note').inputValue(), note);
    assert.equal(await page.locator('#reader-title').innerText(), title);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'source-note');
    assert.equal(await page.locator('#shortlist-toggle').getAttribute('aria-pressed'), 'true');
    await captureReader();
    if (await page.locator('#close-reader').isVisible()) await page.locator('#close-reader').click();
    await page.locator('#source-search').fill('zzznomatch');
    assert.equal(await page.locator('[data-source]').count(), 0);
    await page.locator('#source-search').fill('');
    assert.equal(await page.locator('[data-source]').count(), 8);
    await page.locator('#view-settings').click();
    assert.equal(await page.locator('#settings-dialog').isVisible(), true);
    await page.locator('#density').selectOption('compact');
    await page.locator('#done-settings').click();
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('compact')), true);
    let exported = null;
    if (await page.locator('#export-top').isVisible()) exported = await download('#export-top');
    return {passed:true, earlySourceUsable:true, progressiveArrival:true, noteAndSelectionRetained:true, noteFocusStable:true, reader:true, searchFilter:true, preferences:true, syntheticExport:exported};
  }
  if (name === 'cal-trial') {
    await page.locator('#run-search').click();
    await page.waitForFunction(() => document.querySelectorAll('#result-list [data-preview]').length === 2);
    await page.locator('#result-list [data-preview="RS-DEMO-002"]').click();
    assert.equal(await page.locator('#source-dialog').isVisible(), true);
    if (!(await page.locator('#dialog-save').innerText()).includes('Remove')) await page.locator('#dialog-save').click();
    await page.locator('#source-note').fill(note);
    await page.waitForFunction(() => document.querySelectorAll('#result-list [data-preview]').length === 6);
    assert.equal(await page.locator('#source-note').inputValue(), note);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'source-note');
    await captureReader();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#source-dialog').open);
    await page.locator('#result-list [data-preview="RS-DEMO-002"]').click();
    assert.equal(await page.locator('#source-note').inputValue(), note);
    await page.keyboard.press('Escape');
    await page.locator('#view-open').click();
    await page.locator('#density').selectOption('compact');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('compact')), true);
    await page.locator('#oa-filter').check();
    const filtered = await page.locator('#result-list [data-preview]').count();
    assert.ok(filtered > 0 && filtered < 6);
    await page.locator('#oa-filter').uncheck();
    await page.locator('#tab-shortlist').click();
    assert.ok(await page.locator('#result-list [data-preview]').count() <= 3);
    assert.equal(await page.locator('#result-list [data-preview="RS-DEMO-002"]').count(), 1);
    let exported = null;
    if (await page.locator('#export-open').isVisible()) exported = await download('#export-open');
    else {
      await page.locator('#menu-open').click();
      exported = await download('[data-mobile="export"]');
    }
    return {passed:true, earlySourceUsable:true, progressiveArrival:true, noteAndSelectionRetained:true, noteFocusStable:true, readerDialog:true, accessFilter:true, preferences:true, shortlistView:true, syntheticExport:exported};
  }
  if (name === 'dub-trial') {
    await page.locator('#run-search').click();
    assert.equal(await page.locator('[data-source]').count(), 2);
    await page.locator('[data-source="SC-101"]').click();
    if (await page.locator('#save-source').getAttribute('aria-pressed') !== 'true') await page.locator('#save-source').click();
    await page.locator('[data-tab="notes"]').click();
    await page.locator('#source-note').fill(note);
    await page.locator('#save-note').click();
    await page.locator('#source-note').focus();
    await page.waitForFunction(() => document.querySelectorAll('[data-source]').length === 6);
    assert.equal(await page.locator('#source-note').inputValue(), note);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'source-note');
    assert.equal(await page.locator('#save-source').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-tab="metadata"]').click();
    assert.match(await page.locator('#detail-panel').innerText(), /OpenAlex/);
    await page.locator('[data-tab="overview"]').click();
    await captureReader();
    await page.locator('#oa-filter').click();
    const filtered = await page.locator('[data-source]').count();
    assert.ok(filtered > 0 && filtered < 6);
    await page.locator('#oa-filter').click();
    await page.locator('#top-settings').click();
    await page.locator('#setting-compact').check();
    await page.locator('#apply-settings').click();
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('compact')), true);
    const exported = await download('#top-export');
    return {passed:true, earlySourceUsable:true, progressiveArrival:true, noteAndSelectionRetained:true, noteFocusStable:true, readerTabs:true, accessFilter:true, preferences:true, syntheticExport:exported};
  }
  throw new Error(`Unknown trial: ${name}`);
}

try {
  for (const name of (requested.length ? requested : ['linear-trial', 'cal-trial', 'dub-trial', 'index'])) {
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
      await page.screenshot({ path: path.join(directory, 'previews', `${name}-${size}.png`), fullPage: true });
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
await fs.writeFile(path.join(directory, 'trial-checks.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ passed: receipt.passed, checks: receipt.checks.map(({ prototype, viewport, errors, horizontalOverflow, unnamedButtons, inputsWithoutLabels, sampledTextPairs, unmeasuredTextPairs, contrastIssues, interaction }) => ({ prototype, viewport: viewport.name, errors, horizontalOverflow, unnamedButtons, inputsWithoutLabels, sampledTextPairs, unmeasuredTextPairs, contrastIssues, interaction })) }, null, 2));
if (!receipt.passed) process.exitCode = 1;
