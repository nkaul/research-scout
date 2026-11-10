import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(directory,'../../../frontend/.browser-cache');
const {chromium}=await import('../../../frontend/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chromium',args:['--disable-gpu']});
const receipt={date:'2026-11-09',scope:'Native diagram and review-viewer QA only, not application acceptance or live provider testing.',diagrams:[],viewer:[]};
try {
  for(const name of ['implemented-architecture','agent-workflow','review-checkpoint']){
    const page=await browser.newPage({viewport:{width:1920,height:1280},reducedMotion:'reduce'});
    await page.goto(pathToFileURL(path.join(directory,name+'.svg')).href);
    await page.evaluate(()=>document.fonts.ready);
    const inspected=await page.evaluate(()=>{
      const svg=document.querySelector('svg');const failures=[];const width=svg.viewBox.baseVal.width,height=svg.viewBox.baseVal.height;
      for(const t of svg.querySelectorAll('text')){const b=t.getBBox();if(b.x<0||b.y<0||b.x+b.width>width||b.y+b.height>height)failures.push({scope:'canvas',text:t.textContent,box:{x:b.x,y:b.y,width:b.width,height:b.height}})}
      for(const g of svg.querySelectorAll('[data-bounds]')){const[x,y,w,h]=g.getAttribute('data-bounds').split(',').map(Number);for(const t of g.querySelectorAll('text')){const b=t.getBBox();if(b.x<x+8||b.x+b.width>x+w-8||b.y<y+5||b.y+b.height>y+h-5)failures.push({scope:'panel',text:t.textContent,box:{x:b.x,y:b.y,width:b.width,height:b.height},panel:[x,y,w,h]})}}
      return{width,height,textElements:svg.querySelectorAll('text').length,failures};
    });
    await page.locator('svg').first().screenshot({path:path.join(directory,name+'.png')});
    receipt.diagrams.push({name,...inspected});await page.close();
  }
  await fs.mkdir(path.join(directory,'previews'),{recursive:true});
  for(const width of [1440,390,320]){
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
    await page.goto(pathToFileURL(path.join(directory,'index.html')).href);
    await page.getByRole('tab',{name:'02 · Agent workflow',exact:true}).click();
    assert.match(await page.locator('#diagram').getAttribute('src'),/agent-workflow/);
    await page.getByRole('tab',{name:'03 · Review checkpoint',exact:true}).click();
    await page.getByRole('button',{name:'100% / scroll',exact:true}).click();
    assert.equal(await page.locator('#zoom').getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'Fit to width',exact:true}).click();
    await page.getByRole('tab',{name:'01 · Architecture',exact:true}).click();
    await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#tab-workflow').getAttribute('aria-selected'),'true');
    await page.getByRole('tab',{name:'01 · Architecture',exact:true}).click();
    const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
    const broken=await page.evaluate(()=>[...document.images].filter(img=>!img.complete||!img.naturalWidth).length);
    await page.screenshot({path:path.join(directory,'previews',`review-viewer-${width}.png`),fullPage:true});
    receipt.viewer.push({width,errors,externalRequests:requests,horizontalOverflow:overflow,brokenImages:broken,tabAndZoomControls:true});await page.close();
  }
}finally{await browser.close()}
receipt.passed=receipt.diagrams.every(d=>!d.failures.length)&&receipt.viewer.every(v=>!v.errors.length&&!v.externalRequests.length&&!v.horizontalOverflow&&!v.brokenImages);
await fs.writeFile(path.join(directory,'visual-review.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));if(!receipt.passed)process.exitCode=1;
