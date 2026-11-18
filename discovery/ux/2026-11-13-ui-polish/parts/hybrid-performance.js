/* Standalone design preview: all records, stages and durations below are illustrative. */
(() => {
  const host = document.getElementById('hybrid-performance-host');
  if (!host) return;
  const byId = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const labels = { openalex: 'OpenAlex', crossref: 'Crossref', arxiv: 'arXiv', youtube: 'YouTube', semantic_scholar: 'Semantic Scholar', openaire: 'OpenAIRE', europe_pmc: 'Europe PMC' };
  const normalize = value => Object.keys(labels).find(key => key === value || labels[key].toLowerCase() === String(value).toLowerCase()) || value;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const format = ms => ms == null ? '—' : ms < 1 ? '<1 ms' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.floor(ms / 60000)} min ${Math.round(ms % 60000 / 1000)} s`;
  const style = document.createElement('style');
  style.textContent = `
    #hybrid-performance-host{border-top:1px solid #e2e8f0;background:#f7fafc;border-radius:0 0 11px 11px;color:#40556e;font-size:12px;overflow:hidden}
    #hybrid-performance-host .perf-main{display:flex;align-items:center;gap:12px;min-height:46px;padding:8px 14px;flex-wrap:wrap}
    #hybrid-performance-host .perf-status{display:flex;align-items:center;gap:6px;min-width:137px;color:#166c4d;font-size:12px;white-space:nowrap}
    #hybrid-performance-host .perf-status[data-state=running]{color:#1565c0}
    #hybrid-performance-host .perf-status[data-state=partial]{color:#8b5100}
    #hybrid-performance-host .perf-dot{height:7px;width:7px;border-radius:50%;background:currentColor;flex:none}
    #hybrid-performance-host .perf-metrics{display:flex;align-items:center;gap:17px;flex:1;flex-wrap:wrap}
    #hybrid-performance-host .perf-metric{display:flex;gap:5px;align-items:center;white-space:nowrap;color:#64748b;font-size:12px}
    #hybrid-performance-host .perf-metric strong{font-weight:600;color:#334b68;font-variant-numeric:tabular-nums}
    #hybrid-performance-host .perf-metric svg{width:13px;height:13px}
    #hybrid-performance-host .perf-sample{font-size:11px;white-space:nowrap;color:#64748b}
    #hybrid-performance-host .perf-action{font:inherit;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:4px 7px;border-radius:5px;color:#315d9b;background:transparent;border:0;cursor:pointer;white-space:nowrap}
    #hybrid-performance-host .perf-action:hover{background:#e8f0fc}
    #hybrid-performance-host .perf-action svg{width:14px;height:14px}
    #hybrid-performance-host .perf-stop{color:#96520d;background:#fff1dc;padding:4px 9px}
    #hybrid-performance-host [hidden]{display:none!important}
    #hybrid-performance-host .perf-progress{height:3px;background:#e6edf5;overflow:hidden}
    #hybrid-performance-host .perf-progress>span{display:block;height:100%;background:#1976d2;transition:width .35s}
    #hybrid-performance-host .perf-progress[data-partial=true]>span{background:#d98515}
    #hybrid-performance-host .perf-sources{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:7px 14px 9px;background:#fbfcfe;border-top:1px solid #edf1f6}
    #hybrid-performance-host .perf-sources-label{font-size:12px;color:#5e7189;margin-right:3px}
    #hybrid-performance-host .perf-source{font-size:11px;display:inline-flex;align-items:center;gap:5px;min-height:25px;border-radius:5px;background:#edf2f8;color:#4f627a;padding:3px 7px}
    #hybrid-performance-host .perf-source i{width:5px;height:5px;border-radius:50%;background:currentColor}
    #hybrid-performance-host .perf-source[data-status=done]{background:#e8f4ee;color:#176248}
    #hybrid-performance-host .perf-source[data-status=searching]{background:#e8f0fe;color:#1557a0}
    #hybrid-performance-host .perf-source[data-status=stopped]{background:#fff1db;color:#80500d}
    #hybrid-performance-host .perf-detail{padding:15px 17px 17px;border-top:1px solid #e1e8f1;background:#fff}
    #hybrid-performance-host .perf-detail-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    #hybrid-performance-host .perf-detail h3{font-size:13px;font-weight:650;letter-spacing:-.1px;margin:0;color:#2d415b}
    #hybrid-performance-host .perf-detail p{margin:0;color:#62758e;font-size:12px;line-height:1.55}
    #hybrid-performance-host .perf-timeline{display:grid;gap:8px;margin:13px 0 11px;max-width:850px}
    #hybrid-performance-host .perf-span{display:grid;grid-template-columns:122px minmax(100px,1fr) 62px;align-items:center;gap:10px;font-size:12px;line-height:1.2;color:#53667e}
    #hybrid-performance-host .perf-track{height:7px;position:relative;border-radius:3px;background:#f0f3f7;overflow:hidden}
    #hybrid-performance-host .perf-track span{position:absolute;top:0;bottom:0;background:#a5bddf;border-radius:3px}
    #hybrid-performance-host .perf-span[data-source=openalex] .perf-track span{background:#6c9bdf}
    #hybrid-performance-host .perf-span[data-source=crossref] .perf-track span{background:#a58acb}
    #hybrid-performance-host .perf-span[data-source=arxiv] .perf-track span{background:#e7a062}
    #hybrid-performance-host .perf-span[data-source=youtube] .perf-track span{background:#da8c91}
    #hybrid-performance-host .perf-span[data-source=access] .perf-track span{background:#62a98e}
    #hybrid-performance-host .perf-span output{font-size:11px;text-align:right;font-variant-numeric:tabular-nums;color:#50647e}
    .perf-inline-skeleton{display:grid;gap:10px;margin-top:10px}
    .perf-inline-skeleton .skeleton-card{padding:18px;border-color:#e2e8f1;background:#fbfcfe}
    .perf-inline-skeleton .skeleton-line{height:9px;margin-bottom:9px}
    .perf-empty{padding:25px 18px;color:#65748a;font-size:13px;background:#fff;border:1px dashed #d7e1ed;border-radius:9px}
    .perf-reader-pending .reader-body{position:relative;min-height:300px}
    .perf-reader-pending .reader-body>*{visibility:hidden}
    .perf-reader-pending .reader-body:after{content:attr(data-perf-wait);position:absolute;top:30px;left:19px;right:19px;font-size:13px;line-height:1.6;color:#65758b;background:linear-gradient(#e9eef5,#e9eef5) 0 55px/90% 9px no-repeat,linear-gradient(#edf1f6,#edf1f6) 0 77px/75% 9px no-repeat;padding-bottom:90px}
    .perf-access-pending{background:#fff3df!important;color:#89530b!important}
    @media(max-width:1150px){#hybrid-performance-host .perf-metrics{gap:10px}#hybrid-performance-host .perf-main{gap:8px}#hybrid-performance-host .perf-sample{display:none}}
    @media(max-width:720px){#hybrid-performance-host .perf-main{padding:9px 12px;gap:7px}#hybrid-performance-host .perf-status{min-width:0;margin-right:auto}#hybrid-performance-host .perf-metrics{order:2;flex-basis:100%;display:grid;grid-template-columns:1fr 1fr;gap:5px 12px}#hybrid-performance-host .perf-action{min-height:34px}#hybrid-performance-host .perf-span{grid-template-columns:88px minmax(80px,1fr) 55px;gap:7px}#hybrid-performance-host .perf-detail{padding:13px 12px}#hybrid-performance-host .perf-detail-head{align-items:flex-start;flex-direction:column;gap:4px}#hybrid-performance-host .perf-source{min-height:27px}}
    @media(prefers-reduced-motion:reduce){#hybrid-performance-host .perf-progress>span,.perf-inline-skeleton .skeleton-line{animation:none!important;transition:none!important}}
  `;
  document.head.append(style);
  host.innerHTML = `<div class="perf-main"><span class="perf-status" id="perf-status" data-state="complete"><i class="perf-dot" aria-hidden="true"></i><strong id="perf-status-text" role="status" aria-live="polite">Search complete</strong></span><div class="perf-metrics" aria-label="Illustrative performance timings"><span class="perf-metric" title="Time until the first source appeared; illustrative"><span>First evidence</span><strong id="perf-first">420 ms</strong></span><span class="perf-metric" title="Original search duration; separate from opening saved results"><span>Retrieval</span><strong id="perf-total" aria-live="off">2.43 s</strong></span><span class="perf-metric" title="Time to open saved results in this workspace; illustrative"><span>Saved view</span><strong>86 ms</strong></span><span class="perf-metric" title="Selected source details in this browser; illustrative"><span>Reader</span><strong id="perf-reader" aria-live="off">124 ms</strong></span></div><span class="perf-sample">Sample timings</span><button type="button" class="perf-action" id="perf-details-toggle" aria-expanded="false" aria-controls="perf-details">${icon('clock')}Timing details${icon('chevron')}</button><button type="button" class="perf-action perf-stop" id="perf-stop" hidden><svg class="i" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" stroke="none"/></svg>Stop</button></div><div class="perf-progress" id="perf-progress" hidden aria-hidden="true"><span id="perf-progress-fill" style="width:100%"></span></div><div class="perf-sources" id="perf-sources" hidden></div><section class="perf-detail" id="perf-details" aria-label="Illustrative request timings" hidden><div class="perf-detail-head"><h3>How this search progressed</h3><p>Illustrative durations · parallel provider spans are not added together.</p></div><div class="perf-timeline" id="perf-timeline"></div><p>Retrieval describes the original search. Saved view and Reader describe opening stored information. Provider completion is separate from relevance review and DOI access checks.</p></section>`;
  const allRecords = [...papers, ...videos];
  let ticket = 0, timers = [], tick, readerTimer, readerTicket = 0;
  let state = { mode: 'complete', running: false, frozen: false, scoped: false, aiEnabled: true, sources: ['openalex','crossref','arxiv','youtube'], statuses: {}, allowed: new Set(allRecords.map(record => record.id)), visible: new Set(allRecords.map(record => record.id)), elapsed: 2430, first: 420, reader: 124, started: 0, phase: 'complete', access: true };
  const baseRender = renderResults;
  const baseSelect = select;
  const checkedSources = () => [...document.querySelectorAll('[data-source]:checked')].map(input => normalize(input.value && input.value !== 'on' ? input.value : input.closest('label').textContent.trim()));
  function filters() {
    // Custom selection survives closing/applying its editor disclosure.
    const custom = byId('date-range')?.value === '4' || byId('custom-toggle')?.getAttribute('aria-pressed') === 'true';
    const years = [1,2,3,5][Number(byId('date-range')?.value)] || 3;
    return { year_from: custom ? Number(byId('year-from').value) || null : 2027 - years, year_to: custom ? Number(byId('year-to').value) || null : 2026 };
  }
  function allowedFor(sources, bounds) {
    const count = Math.min(20, Math.max(1, Number(byId('video-count')?.value) || 10));
    const videoIds = new Set(videos.slice(0, count).map(record => record.id));
    return new Set(allRecords.filter(record => sources.includes(normalize(record.provider)) && (!bounds.year_from || record.year >= bounds.year_from) && (!bounds.year_to || record.year <= bounds.year_to) && (record.provider !== 'YouTube' || videoIds.has(record.id))).map(record => record.id));
  }
  const elapsed = () => state.frozen || !state.running ? state.elapsed : Math.max(0, performance.now() - state.started);
  function clearWork() { ticket++; for (const timer of timers) clearTimeout(timer); timers = []; clearInterval(tick); tick = undefined; }
  function later(delay, callback) { const current = ticket; timers.push(setTimeout(() => { if (current === ticket) callback(); }, delay)); }
  function markReader(waiting, text = 'Source details appear as evidence arrives.') {
    const reader = byId('reader');
    if (!reader) return;
    reader.classList.toggle('perf-reader-pending', waiting);
    reader.setAttribute('aria-busy', String(waiting && state.running));
    const body = reader.querySelector('.reader-body');
    if (body) body.dataset.perfWait = text;
  }
  function updateSources() {
    const completed = state.sources.filter(source => state.statuses[source] === 'done').length;
    const show = state.running || state.mode === 'partial' || !byId('perf-details').hidden;
    byId('perf-sources').hidden = !show;
    byId('perf-sources').innerHTML = `<span class="perf-sources-label">${completed} / ${state.sources.length} sources returned</span>${state.sources.map(source => `<span class="perf-source" data-status="${state.statuses[source] || 'done'}"><i aria-hidden="true"></i>${escape(labels[source] || source)}<span>${state.statuses[source] === 'done' ? '✓' : state.statuses[source] === 'searching' ? 'searching' : state.statuses[source] === 'stopped' ? 'stopped' : 'queued'}</span></span>`).join('')}${state.phase === 'reviewing' ? `<span class="perf-source" data-status="searching"><i></i>${state.aiEnabled ? 'Relevance review' : 'Local ranking'}</span>` : state.phase === 'access' ? '<span class="perf-source" data-status="searching"><i></i>Unpaywall · DOI access</span>' : ''}`;
  }
  function timeline() {
    const total = Math.max(state.elapsed || 2430, 1), start = 320;
    const rows = [{ label: state.aiEnabled ? 'Query planning' : 'Scope preparation', source: 'planning', left: 0, end: 320 }];
    state.sources.forEach((source, index) => rows.push({ label: labels[source] || source, source, left: start, end: Math.min(total * .76, 420 + index * (total * .66 / Math.max(1, state.sources.length - 1))) }));
    rows.push({ label: state.aiEnabled ? 'Relevance review' : 'Local ranking', source: 'review', left: total * .76, end: total * .90 });
    rows.push({ label: 'DOI access', source: 'access', left: total * .86, end: total });
    byId('perf-timeline').innerHTML = rows.map(row => `<div class="perf-span" data-source="${row.source}"><span>${escape(row.label)}</span><div class="perf-track" aria-hidden="true"><span style="left:${Math.min(100,row.left/total*100)}%;width:${Math.max(1,(row.end-row.left)/total*100)}%"></span></div><output>${format(Math.max(0,row.end-row.left))}</output></div>`).join('');
  }
  function updateBar() {
    const label = state.phase === 'planning' ? state.aiEnabled ? 'Planning query' : 'Preparing scope' : state.phase === 'reviewing' ? state.aiEnabled ? 'Reviewing relevance' : 'Organizing results' : state.phase === 'access' ? 'Checking DOI access' : state.running ? 'Retrieving evidence' : state.mode === 'partial' ? 'Partial results' : state.mode === 'empty' ? 'Ready to search' : 'Search complete';
    const status = state.running ? 'running' : state.mode === 'partial' ? 'partial' : 'complete';
    byId('perf-status').dataset.state = status;
    if (byId('perf-status-text').textContent !== label) byId('perf-status-text').textContent = label;
    byId('perf-first').textContent = format(state.first);
    byId('perf-total').textContent = state.mode === 'empty' ? '—' : format(elapsed());
    byId('perf-reader').textContent = state.reader == null ? 'Loading…' : format(state.reader);
    byId('perf-stop').hidden = !state.running;
    byId('perf-progress').hidden = !state.running && state.mode !== 'partial';
    byId('perf-progress').dataset.partial = String(state.mode === 'partial');
    const done = state.sources.filter(source => state.statuses[source] === 'done').length;
    byId('perf-progress-fill').style.width = `${state.phase === 'planning' ? 8 : state.phase === 'reviewing' ? 83 : state.phase === 'access' ? 93 : state.running || state.mode === 'partial' ? 15 + 65 * done / Math.max(1,state.sources.length) : 100}%`;
    const search = byId('search-form')?.querySelector('[type=submit]');
    if (search) { search.disabled = state.running; search.setAttribute('aria-busy', String(state.running)); }
    document.body.classList.toggle('loading', state.running);
    window.hybridTrace?.setBusy(state.running && state.phase === 'planning');
  }
  function updateReaderAccess() {
    const access = byId('reader')?.querySelector('.reader-access');
    if (!access) return;
    access.classList.toggle('perf-access-pending', !state.access);
    const label = access.querySelector('span');
    if (label) label.innerHTML = icon(state.access ? 'unlock' : 'clock') + (state.access ? 'Open-access location available' : 'DOI access pending');
  }
  function renderScope() {
    baseRender();
    for (const type of ['paper','video']) {
      const list = byId(type === 'paper' ? 'papers-list' : 'videos-list');
      if (!list) continue;
      let visibleCount = 0, observations = 0;
      for (const row of list.querySelectorAll('[data-result]')) {
        const id = Number(row.dataset.result), record = allRecords.find(item => item.id === id);
        row.hidden = !state.visible.has(id);
        if (row.hidden) continue;
        visibleCount++;
        const actualProviders = record.providers.filter(provider => !state.scoped || state.sources.includes(normalize(provider)) && state.statuses[normalize(provider)] === 'done');
        observations += Math.max(1, actualProviders.length);
        if (state.scoped) {
          row.querySelectorAll('.provider-chip').forEach(chip => { if (Object.values(labels).includes(chip.textContent.trim())) chip.hidden = !actualProviders.includes(chip.textContent.trim()); });
          const countButton = row.querySelector('[data-action=records]');
          if (countButton) { countButton.innerHTML = icon('database') + Math.max(1,actualProviders.length); countButton.setAttribute('aria-label',`View ${Math.max(1,actualProviders.length)} available provider observations`); }
          const provenance = byId('provenance-'+id);
          if (provenance) provenance.textContent = `${actualProviders.join(' · ')} · ${Math.max(1,actualProviders.length)} available provider record${actualProviders.length === 1 ? '' : 's'}. Exact DOI grouping retains the original provider observations.`;
        }
        const access = row.querySelector('.access');
        if (access && !state.access) { access.classList.add('perf-access-pending'); access.innerHTML = icon('clock') + 'Access pending'; }
      }
      document.querySelector(`[data-kind="${type}"] .count-badge`).textContent = visibleCount;
      const filterText = byId('filter').value.toLowerCase();
      const pending = allRecords.filter(record => (type === 'video') === (record.provider === 'YouTube') && state.allowed.has(record.id) && !state.visible.has(record.id) && (record.title+' '+record.abstract+' '+record.authors).toLowerCase().includes(filterText)).length;
      if (state.running && pending) {
        list.querySelector('.no-results')?.remove();
        const skeleton = document.createElement('div'); skeleton.className = 'perf-inline-skeleton'; skeleton.setAttribute('aria-label',`${pending} ${type === 'paper' ? 'paper' : 'video'} results still loading`); skeleton.setAttribute('aria-busy','true');
        skeleton.innerHTML = Array(Math.min(2,pending)).fill('<div class="skeleton-card" aria-hidden="true"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>').join(''); list.append(skeleton);
      } else if (!visibleCount) {
        list.querySelector('.no-results')?.remove();
        const empty = document.createElement('p'); empty.className='perf-empty'; empty.textContent = state.mode === 'empty' ? 'Start with a research question. Papers and videos will appear here as they become available.' : state.mode === 'partial' ? 'No sample sources arrived in this tab before retrieval stopped.' : 'No illustrative sources match this scope and local filter.'; list.append(empty);
      }
      if (type === kind && byId('discovery-status')) byId('discovery-status').textContent = `${visibleCount} ${type === 'paper' ? visibleCount === 1 ? 'paper' : 'papers' : visibleCount === 1 ? 'video' : 'videos'} · ${observations} provider ${observations === 1 ? 'record' : 'records'}`;
    }
    if (byId('skeleton')) byId('skeleton').hidden = true;
    updateReaderAccess(); updateBar(); updateSources();
  }
  renderResults = renderScope;
  select = function(id, scroll = false) {
    if (state.scoped && !state.visible.has(Number(id))) return;
    const old = selected?.id;
    const result = baseSelect(id, scroll);
    updateReaderAccess();
    if (selected?.id !== old) {
      const current = ++readerTicket; clearTimeout(readerTimer); state.reader = null; updateBar();
      const began = performance.now();
      readerTimer = setTimeout(() => { if (current !== readerTicket) return; state.reader = Math.max(124,performance.now()-began); updateBar(); },124);
    }
    return result;
  };
  function selectAvailable() {
    const candidates = allRecords.filter(record => state.visible.has(record.id));
    if (!candidates.length) { markReader(true, state.running ? 'Waiting for the first available source…' : 'Choose a source when evidence becomes available.'); return; }
    markReader(false);
    if (!state.visible.has(selected.id)) {
      const next = candidates.find(record => (kind === 'video') === (record.provider === 'YouTube')) || candidates[0];
      select(next.id, false);
    }
  }
  function start() {
    const question = byId('query').value.trim(), sources = checkedSources(), bounds = filters();
    if (!question) { toast('Enter a research question to try this preview.'); byId('query').focus(); return false; }
    if (!sources.length || sources.length > 4) { toast('Choose between one and four sources before searching.'); return false; }
    if (bounds.year_from && bounds.year_to && bounds.year_from > bounds.year_to) { toast('The start year must come before the end year.'); return false; }
    clearWork(); clearTimeout(hoverTimer); clearTimeout(readerTimer); readerTicket++;
    state = { ...state, mode:'running', running:true, frozen:false, scoped:true, aiEnabled:byId('ai-refine')?.checked ?? true, sources, statuses:Object.fromEntries(sources.map(source=>[source,'queued'])), allowed:allowedFor(sources,bounds), visible:new Set(), elapsed:0, first:null, reader:null, started:performance.now(), phase:'planning', access:false };
    window.hybridTrace?.commit({ question, sources, filters:bounds, aiEnabled:byId('ai-refine')?.checked ?? true });
    markReader(true); renderResults();
    tick = setInterval(updateBar,120);
    later(320,()=>{state.phase='retrieving'; for(const source of sources)state.statuses[source]='searching';updateBar();updateSources();});
    sources.forEach((source,index)=>later(420 + index * (1960 / Math.max(1,sources.length-1)),()=>{
      state.statuses[source]='done';
      for(const record of allRecords)if(normalize(record.provider)===source && state.allowed.has(record.id))state.visible.add(record.id);
      if(state.first==null && state.visible.size){state.first=performance.now()-state.started;if(state.visible.has(selected.id))state.reader=124;}
      renderResults();selectAvailable();
    }));
    later(2480,()=>{state.phase='reviewing';updateBar();updateSources();});
    later(2850,()=>{state.phase='access';updateBar();updateSources();});
    later(3200,()=>{state.elapsed=performance.now()-state.started;state.running=false;state.mode='complete';state.phase='complete';state.access=true;state.visible=new Set(state.allowed);clearInterval(tick);tick=undefined;if(state.reader==null)state.reader=state.visible.size?124:null;renderResults();selectAvailable();timeline();toast('Illustrative search complete. No provider or model request was made.');});
    return true;
  }
  function stop() {
    if (!state.running) return;
    state.elapsed=elapsed();clearWork();state.running=false;state.frozen=false;state.mode='partial';state.phase='stopped';
    for(const source of state.sources)if(state.statuses[source]!=='done')state.statuses[source]='stopped';
    renderResults();selectAvailable();timeline();toast('Preview stopped. Evidence already available is retained.');
    byId('search-form').querySelector('[type=submit]').focus();
  }
  function reset() {
    clearWork();clearTimeout(readerTimer);readerTicket++;
    state={...state,mode:'complete',running:false,frozen:false,scoped:false,aiEnabled:window.hybridTrace?.getSnapshot()?.aiEnabled ?? true,sources:['openalex','crossref','arxiv','youtube'],statuses:{openalex:'done',crossref:'done',arxiv:'done',youtube:'done'},allowed:new Set(allRecords.map(record=>record.id)),visible:new Set(allRecords.map(record=>record.id)),elapsed:2430,first:420,reader:124,phase:'complete',access:true};
    markReader(false);renderResults();timeline();
  }
  function showDemoState(mode) {
    reset();
    if (mode === 'complete') return;
    state.scoped=true;state.frozen=true;state.elapsed=1180;state.first=420;state.sources=checkedSources();state.statuses=Object.fromEntries(state.sources.map((source,index)=>[source,index<2?'done':mode==='partial'?'stopped':'searching']));state.visible=new Set(allRecords.filter(record=>state.sources.slice(0,2).includes(normalize(record.provider))).map(record=>record.id));state.running=mode==='loading';state.mode=mode==='partial'?'partial':'running';state.phase=mode==='partial'?'stopped':'retrieving';state.access=false;
    renderResults();selectAvailable();timeline();
  }
  byId('search-form').addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();start();},true);
  byId('perf-stop').addEventListener('click',stop);
  byId('perf-details-toggle').addEventListener('click',()=>{const open=byId('perf-details').hidden;byId('perf-details').hidden=!open;byId('perf-details-toggle').setAttribute('aria-expanded',String(open));timeline();updateSources();});
  byId('new-research')?.addEventListener('click',()=>{clearWork();clearTimeout(readerTimer);readerTicket++;state.running=false;state.frozen=false;state.mode='empty';state.phase='empty';state.scoped=true;state.visible=new Set();state.first=null;state.reader=null;state.access=false;renderResults();markReader(true,'Begin a new search to inspect a source.');byId('query').dispatchEvent(new Event('input',{bubbles:true}));});
  window.hybridPerformance = { start, stop, reset, showDemoState, getSnapshot:()=>({mode:state.mode,running:state.running,frozen:state.frozen,elapsed:elapsed(),first:state.first,sources:[...state.sources],visible:[...state.visible],statuses:{...state.statuses}}), openDetails:()=>{byId('perf-details').hidden=false;byId('perf-details-toggle').setAttribute('aria-expanded','true');timeline();updateSources();} };
  reset();
})();
