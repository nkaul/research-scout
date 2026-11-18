(() => {
  const controller=document.createElement('span');controller.className='hybrid-preview-switch';
  controller.innerHTML='<label for="preview-state">Preview</label><select id="preview-state" aria-label="Mockup preview state"><option value="papers">Papers</option><option value="trace">Query trace</option><option value="loading">Retrieving</option><option value="videos">Videos</option><option value="partial">Partial results</option></select>';
  document.querySelector('.top-actions').prepend(controller);
  const pill=document.querySelector('.preview-pill');
  if(pill)pill.innerHTML='<span class="hybrid-preview-label-wide">Updated preview · Illustrative data &amp; timings</span><span class="hybrid-preview-label-short">Sample data</span>';
  document.getElementById('filter').placeholder='Filter results';
  const styles=document.createElement('style');styles.textContent='.hybrid-preview-label-short{display:none}.hybrid-preview-switch{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:#536176}.hybrid-preview-switch select{font:inherit;min-height:32px;max-width:140px;padding:3px 6px;border:1px solid #dbe3ef;border-radius:5px;background:#fff;color:#314661}@media(max-width:600px){.hybrid-preview-label-wide{display:none}.hybrid-preview-label-short{display:inline}.hybrid-preview-switch label{display:none}.hybrid-preview-switch select{max-width:115px}.top-actions{gap:7px}.top-actions>.icon-btn{display:none}}';document.head.append(styles);
  const apply=view=>{
    window.hybridPerformance.reset();
    const toggle=document.getElementById('trace-toggle');if(toggle.getAttribute('aria-expanded')==='true')toggle.click();
    setKind(view==='videos'?'video':'paper');
    setReaderTab('overview');
    if(view==='trace')window.hybridTrace.open('llm');
    if(view==='loading'||view==='partial')window.hybridPerformance.showDemoState(view);
    controller.querySelector('select').value=view;
    const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);
    scrollTo(0,0);
  };
  controller.querySelector('select').addEventListener('change',event=>apply(event.target.value));
  window.hybridPreview={show:apply};
  const requested=new URLSearchParams(location.search).get('view')||'papers';
  apply(['papers','trace','loading','videos','partial'].includes(requested)?requested:'papers');
})();
