/** Read-only visual review of the production UI using a saved local fixture run. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const directory = path.dirname(fileURLToPath(import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(directory, '../../frontend/.browser-cache');
const { chromium } = await import('../../frontend/node_modules/playwright/index.mjs');
const base = 'http://127.0.0.1:3100';
const history = await (await fetch(`${base}/api/research-runs`)).json();
assert.ok(history.runs?.length, 'A saved local fixture run is required.');
const saved = history.runs[0];
const snapshot = await (await fetch(`${base}/api/research-runs/${encodeURIComponent(saved.id)}/snapshot`)).json();
assert.equal(snapshot.runtime?.mode || snapshot.mode, 'fixture', 'Review requires clearly labeled fixture data.');
const browser = await chromium.launch({ channel: 'chromium', args: ['--disable-gpu'] });
const report = { date: '2026-10-30', scope: 'Read-only review of saved fixture data in the production build. No research or metadata-check operations.', checks: [] };
const screenshotDirectory = path.join(directory, 'images');
await fs.mkdir(screenshotDirectory, { recursive: true });

async function inspect(page, state, width) {
  const check = await page.evaluate(() => {
    const visible = el => { const box=el.getBoundingClientRect(), css=getComputedStyle(el); return box.width>2 && box.height>2 && box.right>0 && box.bottom>0 && css.visibility!=='hidden' && css.display!=='none'; };
    const parse = value => { const p=value.match(/^rgba?\(([^)]+)\)$/)?.[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return p?.length>=3 ? [p[0],p[1],p[2],p[3]??1] : null; };
    const over = (fg,bg) => [...fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3])),1];
    const light = rgb => rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    let pairs=0, unmeasured=0; const contrastIssues=[];
    for(const el of [...document.querySelectorAll('body *')].filter(visible)) {
      if(['SCRIPT','STYLE','SVG','PATH','TITLE'].includes(el.tagName)||el.closest(':disabled,[aria-disabled="true"],[aria-hidden="true"],[inert]')||![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
      const css=getComputedStyle(el), foreground=parse(css.color), backgrounds=[];let cursor=el,gradient=false;
      while(cursor){const s=getComputedStyle(cursor);backgrounds.unshift(parse(s.backgroundColor));if(s.backgroundImage!=='none')gradient=true;cursor=cursor.parentElement;}
      if(!foreground||backgrounds.some(c=>!c)||gradient){unmeasured++;continue;}
      const bg=backgrounds.reduce((base,c)=>over(c,base),[255,255,255,1]);
      const fg=over(foreground,bg), l1=light(fg),l2=light(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
      const required=parseFloat(css.fontSize)>=24||(parseFloat(css.fontSize)>=18.666&&Number(css.fontWeight)>=700)?3:4.5;
      pairs++;if(ratio<required)contrastIssues.push({text:el.textContent.trim().slice(0,90),ratio:Number(ratio.toFixed(2)),required});
    }
    const names = [...document.querySelectorAll('button')].filter(visible).filter(el=>!el.textContent.trim()&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')).length;
    const labels = [...document.querySelectorAll('input,select,textarea')].filter(visible).filter(el=>!el.labels?.length&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')).length;
    return {horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth), unnamedButtons:names, unlabeledInputs:labels,pairs,unmeasured,contrastIssues};
  });
  report.checks.push({width,state,...check});
}
try {
  for (const width of [1440,1024,390,320]) {
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
    const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.method()+' '+new URL(r.url()).pathname)});
    await page.goto(`${base}/?run=${encodeURIComponent(saved.id)}`);
    await page.getByTestId('source-row').first().waitFor();
    await page.screenshot({path:path.join(screenshotDirectory,`dub-workspace-${width}.png`),fullPage:true,animations:'disabled'});
    if(width<900)await page.getByTestId('source-row').first().locator('.source-title').click();
    await inspect(page,'overview',width);
    if(width===390)await page.getByRole('dialog').screenshot({path:path.join(screenshotDirectory,'dub-mobile-reader.png')});
    await page.getByRole('tab',{name:'Metadata',exact:true}).click();await inspect(page,'metadata',width);
    await page.getByRole('tab',{name:'Your notes',exact:true}).click();await inspect(page,'notes',width);
    if(width<900)await page.keyboard.press('Escape');
    if(width>=350)await page.getByRole('button',{name:'Open workspace settings',exact:true}).click();
    else{await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();}
    await inspect(page,'settings',width);
    assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(writes.length,0,JSON.stringify(writes));
    await page.close();
  }
} finally { await browser.close(); }
report.passed=report.checks.every(c=>c.horizontalOverflow===0&&c.unnamedButtons===0&&c.unlabeledInputs===0&&c.contrastIssues.length===0);
await fs.writeFile(path.join(directory,'dub-ux-visual-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
