/* Standalone Observatory prototype. Authored example records, local interactions only. */
(() => {
  'use strict';
  const resources = {
    papers: [
      {id:'p1',title:'Selecting the right context for grounded language-model generation',providers:['OpenAlex','Crossref'],year:2026,authors:'Maya Chen, Eli Morgan · Example Research Lab',publication:'Journal of Context Systems · authored example',tags:['Context engineering','Evidence selection'],doi:'10.0000/scout-example.001',access:'Open access',points:['Relevant context helps a model connect its response to the evidence required by a task.','Adding more context alone does not establish better generation: relevance, ordering and coverage remain important.','This illustrative study compares compact evidence selection with a larger, unfiltered context window.','Its example evaluation separates answer usefulness, factual support and the cost of assembling context.','The authors describe limits when evidence is incomplete, contradictory or outside the model’s task.'],fit:'Example match: context selection and grounded generation.',kind:'Paper'},
      {id:'p2',title:'Context quality beyond context length: a retrieval evaluation framework',providers:['OpenAlex','arXiv'],year:2025,authors:'Noor Patel, Sam Rivera · Example Institute',publication:'Proceedings of Applied Retrieval · authored example',tags:['Retrieval evaluation','RAG'],doi:'10.0000/scout-example.002',access:'PDF available',points:['This authored example presents a task-focused framework for comparing retrieved context.','It organizes evaluation around evidence coverage, distraction and the relationship between retrieval and answer quality.','A smaller context set can be useful when it retains the information needed by the user’s question.','The proposed comparison records source provenance and the retrieval settings used for each run.'],fit:'Example match: retrieval evaluation for language models.',kind:'Paper'},
      {id:'p3',title:'Ordering evidence in multi-source research assistants',providers:['OpenAlex','Crossref'],year:2025,authors:'Alex Kim, Jordan Wells · Example Research Group',publication:'Research Assistant Methods · authored example',tags:['Multi-agent systems','Source provenance'],doi:'10.0000/scout-example.003',access:'Open access',points:['Research assistants often retrieve evidence from several independently managed providers.','This example discusses how source order, provenance and duplicate records can affect a reading workflow.','It keeps provider observations distinct while presenting one readable resource to the user.','The example includes incomplete provider outcomes and progressive retrieval rather than assuming all sources finish together.'],fit:'Example match: multi-source evidence workflows.',kind:'Paper'}
    ],
    videos: [
      {id:'v1',title:'From retrieved evidence to better context: a practical walkthrough',providers:['YouTube'],year:2026,authors:'The Research Systems Studio · authored example',publication:'Example video · 18 min',tags:['RAG','Context quality'],duration:'18:24',access:'Video preview',points:['A practical demonstration of choosing and arranging context for a research assistant.','The walkthrough separates retrieval, evidence selection and answer evaluation.','Examples show how unrelated passages can distract from a user’s original task.','The final section reviews source coverage and the limits of an incomplete evidence set.'],fit:'Example match: a practical explanation of context engineering.',kind:'Video'},
      {id:'v2',title:'Evaluating RAG systems without losing sight of the question',providers:['YouTube'],year:2025,authors:'Applied Language Models · authored example',publication:'Example video · 26 min',tags:['Evaluation','Evidence coverage'],duration:'26:08',access:'Video preview',points:['This example lesson compares retrieval quality with the usefulness of a final answer.','It demonstrates a small evaluation set organized around realistic research questions.','The speaker explains how to record missing evidence, unsupported claims and latency separately.','Its sample workflow keeps source text available alongside a short explanation.'],fit:'Example match: end-to-end retrieval evaluation.',kind:'Video'}
    ],
    data: [
      {id:'d1',title:'ContextEvidenceBench',providers:['Hugging Face'],year:2026,authors:'Example Research Lab · dataset catalog example',publication:'Version 1.2 · 4,800 example records',tags:['question-answering','retrieval','English'],access:'CC BY 4.0 · example',points:['An illustrative catalog record for question, passage and supporting-evidence pairs.','The schema separates the question, candidate context, evidence annotations and evaluation split.','Example tasks compare evidence selection, ordering and the quality of a grounded response.','The description includes limitations for synthetic examples and incomplete source coverage.','This preview does not download dataset files or establish suitability for a real experiment.'],fit:'Metadata match: retrieval, evidence and language-model evaluation.',kind:'Dataset'},
      {id:'d2',title:'Grounded Research Questions Collection',providers:['DataCite'],year:2025,authors:'Open Methods Group · dataset catalog example',publication:'Version 2.0 · authored metadata',tags:['RAG','source-attribution','evaluation'],access:'Open metadata',points:['A fictional collection designed to illustrate research questions and source-attribution labels.','Each example question is associated with source identifiers and a small set of candidate passages.','The sample catalog notes describe intended uses, annotation scope and reuse conditions.','Task fit must be checked against the original documentation before a real dataset is used.'],fit:'Metadata match: source-grounded question answering.',kind:'Dataset'}
    ],
    repos: [
      {id:'r1',title:'research-lab/context-workbench',providers:['GitHub'],year:2026,authors:'Python · 1.4k stars · 86 forks · authored example',publication:'Updated Nov 2026 · MIT example',tags:['context-engineering','retrieval','evaluation'],access:'README saved',points:['A fictional Python toolkit for comparing evidence selection strategies in a research workflow.','The saved README describes inputs, example configuration and a small evaluation harness.','Source adapters stay separate, and evaluation receipts retain the query and evidence identifiers.','A getting-started example uses authored sample records with local lexical ranking.','The example repository does not establish performance or production readiness.'],fit:'Candidate match: saved README and topics mention context, retrieval and evaluation.',kind:'Repository'},
      {id:'r2',title:'open-research/evidence-recipes',providers:['GitHub'],year:2025,authors:'TypeScript · 820 stars · 42 forks · authored example',publication:'Updated Oct 2026 · Apache-2.0 example',tags:['research-tools','source-provenance','RAG'],access:'README saved',points:['A fictional recipe collection for building readable source-based research workflows.','The README describes provider observations, evidence versions and explicit saved reads.','Recipes include a progressive results view and a small local notes interface.','The project is an illustrative preview record, not a repository fetched from GitHub.'],fit:'Candidate match: source provenance and research workflow recipes.',kind:'Repository'}
    ]
  };
  const names={papers:'Papers',videos:'Videos',data:'Data',repos:'Repos'};
  const singular={papers:'paper',videos:'video',data:'dataset',repos:'repository'};
  const icons={papers:'paper',videos:'video',data:'data',repos:'code'};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const svg=name=>`<svg aria-hidden="true"><use href="#o-${name}"/></svg>`;
  const $=selector=>document.querySelector(selector);
  const all=selector=>Array.from(document.querySelectorAll(selector));
  const noteKey='research-scout-observatory-notes-v1';
  let savedNotes={};
  try{const stored=JSON.parse(localStorage.getItem(noteKey)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))for(const [id,text] of Object.entries(stored))if(typeof text==='string'&&text.length<=8000)savedNotes[id]=text;}catch{/* The prototype remains usable without browser storage. */}
  const state={lane:'papers',selected:matchMedia('(min-width:981px)').matches?'p1':null,readerTab:'overview',original:false,readerExpanded:false,cardExpanded:new Set(),saved:new Set(),filter:'',submitted:$('#research-question').value,ai:true,sources:new Set(['OpenAlex','Crossref','arXiv','YouTube']),appliedSources:new Set(['OpenAlex','Crossref','arXiv','YouTube']),year:2022,appliedYear:2022,limits:{papers:20,videos:10,data:10,repos:10},appliedLimits:{papers:20,videos:10,data:10,repos:10},drafts:{...savedNotes},savedNotes,loading:false,arrived:Infinity,stopped:false,elapsed:0};
  let replayTimer,toastTimer,settingsOwner,previewOwner,lastReadButton;
  const record=id=>Object.values(resources).flat().find(item=>item.id===id);
  const laneFor=id=>Object.keys(resources).find(lane=>resources[lane].some(item=>item.id===id));
  function available(lane){let records=resources[lane];if(lane==='papers'||lane==='videos')records=records.filter(item=>(!state.appliedYear||item.year>=state.appliedYear)&&item.providers.some(provider=>state.appliedSources.has(provider)));return records.slice(0,state.appliedLimits[lane]);}
  function arrived(lane){return available(lane).slice(0,state.arrived);}
  function visible(){const needle=state.filter.trim().toLowerCase();return arrived(state.lane).filter(item=>[item.title,item.authors,...item.providers,...item.tags,...item.points].join(' ').toLowerCase().includes(needle));}
  function announce(text){clearTimeout(toastTimer);$('#announcement').textContent=text;$('#announcement').hidden=false;toastTimer=setTimeout(()=>{$('#announcement').hidden=true;},4000);}
  function closeSettings(restore=true){all('.settings-popover').forEach(panel=>panel.hidden=true);all('[data-settings]').forEach(button=>button.setAttribute('aria-expanded','false'));if(restore&&settingsOwner)settingsOwner.focus({preventScroll:true});}
  function openSettings(button){const panel=document.getElementById(button.dataset.settings);const opening=panel.hidden;closeSettings(false);settingsOwner=button;if(opening){panel.hidden=false;button.setAttribute('aria-expanded','true');panel.querySelector('input,select,button')?.focus({preventScroll:true});}}
  function closeNavigation(restore=false){$('#observatory-nav-links').classList.remove('is-open');$('#mobile-nav-toggle').setAttribute('aria-expanded','false');$('#mobile-nav-toggle').setAttribute('aria-label','Open navigation');if(restore)$('#mobile-nav-toggle').focus({preventScroll:true});}
  function setLane(lane,scroll=false){if(!resources[lane])return;state.lane=lane;state.filter='';$('#resource-filter').value='';state.selected=matchMedia('(min-width:981px)').matches?arrived(lane)[0]?.id||null:null;state.readerTab='overview';state.original=false;state.readerExpanded=false;render();if(scroll)$('#evidence').scrollIntoView({behavior:motionBehavior(),block:'start'});}
  function motionBehavior(){return matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';}
  function readSource(id,tab='overview',move=true){const item=record(id);if(!item)return;state.lane=laneFor(id);state.selected=id;state.readerTab=tab;state.original=false;state.readerExpanded=false;render();if(move)requestAnimationFrame(()=>{$('#evidence-reader').scrollIntoView({behavior:motionBehavior(),block:'center'});$('#reader-title')?.focus({preventScroll:true});});}
  function closeReader(){const id=state.selected;state.selected=null;renderReader();$('#evidence-layout').classList.remove('has-reader');requestAnimationFrame(()=>{const target=lastReadButton&&lastReadButton.isConnected?lastReadButton:document.querySelector(`[data-read="${id}"]`);target?.focus({preventScroll:false});});}
  function renderCards(){
    const entries=visible();
    $('#result-grid').setAttribute('aria-labelledby','tab-'+state.lane);
    $('#result-grid').innerHTML=entries.map(item=>{
      const expanded=state.cardExpanded.has(item.id),points=expanded?item.points:item.points.slice(0,2);
      return `<article class="evidence-card${state.selected===item.id?' is-selected':''}" data-id="${esc(item.id)}"><div class="card-providers">${svg(icons[state.lane])}${item.providers.map(provider=>`<span class="provider-badge">${esc(provider)}</span>`).join('')}<span>${item.year}</span></div><h4>${esc(item.title)}</h4><p class="card-byline">${esc(item.authors)}</p>${state.lane==='data'||state.lane==='repos'?`<div class="card-tags">${item.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>`:''}<ul class="card-points">${points.map(point=>`<li>${esc(point)}</li>`).join('')}</ul><button type="button" class="text-button card-expand" data-card-expand="${item.id}" aria-expanded="${expanded}">Read ${expanded?'less':'more'} ${svg('chevron')}</button><div class="card-footer"><button type="button" class="small-button" data-read="${item.id}" aria-pressed="${state.selected===item.id}">Read source ${svg('arrow')}</button><span class="card-access">${esc(item.access)}</span></div></article>`;
    }).join('')||`<div class="empty-state"><h4>${state.filter?'No examples match this filter':state.appliedLimits[state.lane]===0?names[state.lane]+' is turned off':state.loading?'Waiting for example evidence':'No examples within these settings'}</h4><p>${state.filter?'Clear the local filter to see the available authored records.':'Change the example limits, sources or publication dates, then replay the question.'}</p></div>`;
    const total=arrived(state.lane).length;
    $('#results-caption').textContent=state.filter?`${entries.length} of ${total} authored ${names[state.lane].toLowerCase()}`:`${total} authored ${total===1?singular[state.lane]:names[state.lane].toLowerCase()}`;
    $('#clear-filter').hidden=!state.filter;
    $('#skeleton-grid').hidden=!state.loading;
  }
  function renderReader(){
    const item=record(state.selected),reader=$('#evidence-reader');
    if(!item){reader.hidden=true;reader.innerHTML='';return;}
    reader.hidden=false;
    const draft=state.drafts[item.id]??'',saved=state.savedNotes[item.id]??'';
    const originalLabel=state.lane==='repos'?'Original saved README':state.lane==='data'?'Original description':'Original text';
    const sourceTitle=state.lane==='repos'?'Saved README':state.lane==='videos'?'Description':'Source text';
    let body='';
    if(state.readerTab==='notes')body=`<p class="note-intro">Your observations stay linked to this example source. Notes are stored only in this browser, not in the Research Scout application.</p><label class="source-note-label" for="source-note">Your source note</label><textarea id="source-note" class="source-note" rows="7" maxlength="8000" data-note="${item.id}">${esc(draft)}</textarea><div class="note-actions"><button type="button" class="button" id="save-note" data-note-id="${item.id}">Save note</button><span class="note-state" id="note-state">${draft!==saved?'Unsaved draft':saved?'Saved in this browser':'No saved note yet'}</span></div><div class="reader-fit">Source reference: ${esc(item.id)} · authored example. Changing source views keeps the current draft.</div>`;
    else if(state.readerTab==='metadata')body=`<dl class="metadata-list">${[['Resource',item.kind],['Title',item.title],['Example catalogs',item.providers.join(' + ')],['Year / activity',item.year],['Authors / owner',item.authors],['Publication / version',item.publication],['Topics / tasks',item.tags.join(', ')],['Access / availability',item.access],['Evidence identity',item.id+' · authored-observation-v1'],['Acquisition','None. Authored local preview record.']].map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
    else{
      const points=state.readerExpanded?item.points:item.points.slice(0,3);
      body=`<div class="readable-controls" role="group" aria-label="Source presentation"><button type="button" data-presentation="points" aria-pressed="${!state.original}">Key points</button><button type="button" data-presentation="original" aria-pressed="${state.original}">${originalLabel}</button></div><div class="reader-content"><span class="reader-kicker">${sourceTitle} · authored example</span>${state.original?`<div class="original-source">${points.map(point=>`<p>${esc(point)}</p>`).join('')}</div>`:`<ul>${points.map(point=>`<li>${esc(point)}</li>`).join('')}</ul>`}<button type="button" class="text-button" id="reader-expand" aria-expanded="${state.readerExpanded}">Read ${state.readerExpanded?'less':'more'} ${svg('chevron')}</button></div><p class="reader-byline"><strong>Source context</strong><br>${esc(item.authors)}<br>${esc(item.publication)}</p><div class="reader-fit">${esc(item.fit)}<br>Illustrative fit only. Source quality and task performance have not been verified.</div>`;
    }
    reader.innerHTML=`<header class="reader-head"><div><span class="reader-kicker">${esc(item.providers.join(' + '))} · ${item.year}</span><h4 id="reader-title" tabindex="-1">${esc(item.title)}</h4></div><button type="button" class="icon-button" id="close-reader" aria-label="Close evidence reader">${svg('close')}</button></header><div class="reader-tabs" role="tablist" aria-label="Reader sections">${['overview','metadata','notes'].map(tab=>`<button type="button" role="tab" id="reader-tab-${tab}" data-reader-tab="${tab}" aria-selected="${state.readerTab===tab}" aria-controls="reader-panel" tabindex="${state.readerTab===tab?0:-1}">${tab[0].toUpperCase()+tab.slice(1)}</button>`).join('')}</div><div id="reader-panel" class="reader-body" role="tabpanel" aria-labelledby="reader-tab-${state.readerTab}" tabindex="0">${body}</div><footer class="reader-footer"><button type="button" class="small-button" data-preview="${item.id}">${svg(state.lane==='videos'?'video':'paper')}${state.lane==='videos'?'Video storyboard':state.lane==='repos'?'README preview':'Document preview'}</button><button type="button" class="small-button" data-save-resource="${item.id}" aria-pressed="${state.saved.has(item.id)}">${svg('bookmark')}${state.saved.has(item.id)?'Saved example':'Save example'}</button><span>Local, authored source</span></footer>`;
  }
  function render(){
    all('[data-lane]').forEach(button=>{const selected=button.dataset.lane===state.lane;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
    all('[data-count]').forEach(counter=>counter.textContent=String(arrived(counter.dataset.count).length));
    $('#evidence-layout').classList.toggle('has-reader',!!state.selected);
    renderCards();renderReader();
    $('#stop-replay').hidden=!state.loading;
    $('#replay-label').textContent=state.loading?'Replaying authored examples…':state.stopped?'Replay stopped · received examples retained':state.elapsed?`Local replay · ${(state.elapsed/1000).toFixed(1)} s`:'Example session ready';
  }
  function renderFocus(){const focus=$('#query-context');focus.querySelector('strong').textContent=state.ai?'Illustrative query focus':'Direct question preview';$('#focus-query').textContent=state.ai?'Context engineering, evidence selection and grounded generation.':$('#research-question').value;focus.querySelector('.context-chips').hidden=!state.ai;}
  function replay(){
    if(state.loading)return;
    closeSettings(false);state.submitted=$('#research-question').value.trim();
    if(!state.submitted){$('#research-question').focus();announce('Enter a research question before replaying the examples.');return;}
    state.appliedSources=new Set(state.sources);state.appliedYear=state.year;state.appliedLimits={...state.limits};state.arrived=0;state.loading=true;state.stopped=false;state.elapsed=0;state.selected=null;state.filter='';$('#resource-filter').value='';$('#session-question').textContent=state.submitted;$('#session-context-text').textContent='Your draft question is shown above. The focus terms and all records remain the same authored examples; no query inference or provider lookup is performed.';
    $('#research-form button[type=submit]').disabled=true;$('#research-form button[type=submit]').innerHTML=`Replaying… ${svg('clock')}`;renderFocus();render();$('#evidence').scrollIntoView({behavior:motionBehavior(),block:'start'});
    const started=performance.now();
    replayTimer=setInterval(()=>{state.arrived++;state.elapsed=performance.now()-started;if(state.arrived>=3){clearInterval(replayTimer);state.loading=false;$('#research-form button[type=submit]').disabled=false;$('#research-form button[type=submit]').innerHTML=`Explore question ${svg('arrow')}`;if(matchMedia('(min-width:981px)').matches)state.selected=arrived(state.lane)[0]?.id||null;announce('Local replay complete. The displayed records are authored examples, not retrieved research.');}render();},460);
  }
  function stopReplay(){clearInterval(replayTimer);state.loading=false;state.stopped=true;$('#research-form button[type=submit]').disabled=false;$('#research-form button[type=submit]').innerHTML=`Explore question ${svg('arrow')}`;render();announce('Local replay stopped. Received examples remain visible.');}
  function showPreview(id,owner){const item=record(id);if(!item)return;previewOwner=owner;$('#preview-title').textContent=state.lane==='videos'?'Video storyboard':'Authored source preview';$('#preview-content').innerHTML=state.lane==='videos'?`<div class="video-story">${svg('video')}<div><strong>${esc(item.title)}</strong><p>A local storyboard, not a video player.<br>No media or transcript is requested.</p></div></div><p class="preview-disclaimer">${esc(item.points[0])}</p>`:`<article class="document-story"><span class="reader-kicker">${esc(item.providers.join(' + '))} · authored example</span><h3>${esc(item.title)}</h3>${item.points.map(point=>`<p>${esc(point)}</p>`).join('')}</article><p class="preview-disclaimer">This local reading preview is not an acquired PDF, README or remote document.</p>`;$('#preview-dialog').showModal();}
  function openSessionDetails(){const panel=$('#session-details');panel.hidden=!panel.hidden;$('#session-details-toggle').setAttribute('aria-expanded',String(!panel.hidden));}
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button?.dataset.settings){openSettings(button);return;}
    if(event.target.closest('[data-close-settings]')){closeSettings();return;}
    if(button?.id==='mobile-nav-toggle'){const open=$('#observatory-nav-links').classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation');return;}
    if(event.target.closest('#observatory-nav-links a'))closeNavigation();
    if(button?.dataset.openLane){setLane(button.dataset.openLane,true);return;}
    if(button?.dataset.lane){setLane(button.dataset.lane);return;}
    if(button?.dataset.read){lastReadButton=button;readSource(button.dataset.read);return;}
    if(button?.id==='close-reader'){closeReader();return;}
    if(button?.dataset.cardExpand){const id=button.dataset.cardExpand;state.cardExpanded.has(id)?state.cardExpanded.delete(id):state.cardExpanded.add(id);renderCards();document.querySelector(`[data-card-expand="${id}"]`)?.focus({preventScroll:true});return;}
    if(button?.dataset.readerTab){state.readerTab=button.dataset.readerTab;renderReader();$(`#reader-tab-${state.readerTab}`)?.focus({preventScroll:true});return;}
    if(button?.dataset.presentation){state.original=button.dataset.presentation==='original';state.readerExpanded=false;renderReader();document.querySelector(`[data-presentation="${button.dataset.presentation}"]`)?.focus({preventScroll:true});return;}
    if(button?.id==='reader-expand'){state.readerExpanded=!state.readerExpanded;renderReader();$('#reader-expand')?.focus({preventScroll:true});return;}
    if(button?.id==='save-note'){const id=button.dataset.noteId;state.savedNotes[id]=state.drafts[id]??'';try{localStorage.setItem(noteKey,JSON.stringify(state.savedNotes));$('#note-state').textContent='Saved in this browser';announce('Source note saved in this browser. No application data was changed.');}catch{$('#note-state').textContent='Browser storage unavailable · draft kept for this session';announce('Browser storage is unavailable. Your draft remains in this open preview.');}return;}
    if(button?.dataset.saveResource){const id=button.dataset.saveResource;state.saved.has(id)?state.saved.delete(id):state.saved.add(id);renderReader();document.querySelector(`[data-save-resource="${id}"]`)?.focus({preventScroll:true});announce(state.saved.has(id)?'Example saved for this preview session. The live application is unchanged.':'Example removed from the local preview selection.');return;}
    if(button?.dataset.preview){showPreview(button.dataset.preview,button);return;}
    if(button?.id==='close-preview'){$('#preview-dialog').close();return;}
    if(button?.id==='show-query-focus'){$('#session-details').hidden=false;$('#session-details-toggle').setAttribute('aria-expanded','true');$('#evidence').scrollIntoView({behavior:motionBehavior(),block:'start'});return;}
    if(button?.id==='show-source-notes'){readSource(state.selected||'p1','notes');return;}
    if(button?.id==='session-details-toggle'){openSessionDetails();return;}
    if(button?.id==='ai-toggle'){state.ai=!state.ai;button.setAttribute('aria-checked',String(state.ai));renderFocus();return;}
    if(button?.id==='stop-replay'){stopReplay();return;}
    if(button?.id==='clear-filter'){state.filter='';$('#resource-filter').value='';renderCards();$('#resource-filter').focus();return;}
    if(!event.target.closest('.command-card'))closeSettings(false);
    if(!event.target.closest('.floating-nav'))closeNavigation();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      if($('#preview-dialog').open)return;
      const settings=all('.settings-popover').find(panel=>!panel.hidden);if(settings){event.preventDefault();closeSettings();return;}
      if($('#observatory-nav-links').classList.contains('is-open')){event.preventDefault();closeNavigation(true);return;}
      if(event.target.closest('#evidence-reader')){event.preventDefault();closeReader();return;}
    }
    const tab=event.target.closest('[role=tab]');if(!tab||!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
    event.preventDefault();
    const tabs=Array.from(tab.closest('[role=tablist]').querySelectorAll('[role=tab]')),index=tabs.indexOf(tab);
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
    const target=tabs[next];
    if(target.dataset.lane){setLane(target.dataset.lane);document.querySelector(`[data-lane="${target.dataset.lane}"]`).focus({preventScroll:true});}
    else{state.readerTab=target.dataset.readerTab;renderReader();document.querySelector(`[data-reader-tab="${state.readerTab}"]`).focus({preventScroll:true});}
  });
  $('#research-form').addEventListener('submit',event=>{event.preventDefault();replay();});
  $('#resource-filter').addEventListener('input',event=>{state.filter=event.target.value;renderCards();});
  $('#source-settings').addEventListener('change',event=>{if(event.target.type==='checkbox'){event.target.checked?state.sources.add(event.target.value):state.sources.delete(event.target.value);$('#source-count').textContent=String(state.sources.size);}});
  $('#date-range').addEventListener('change',event=>{state.year=Number(event.target.value);$('#date-label').textContent=event.target.selectedOptions[0].textContent;});
  all('[data-limit]').forEach(input=>input.addEventListener('change',()=>{const value=Number(input.value);state.limits[input.dataset.limit]=Number.isInteger(value)?Math.max(0,Math.min(20,value)):0;input.value=String(state.limits[input.dataset.limit]);}));
  document.addEventListener('input',event=>{if(event.target.matches('[data-note]')){const id=event.target.dataset.note;state.drafts[id]=event.target.value;$('#note-state').textContent=state.drafts[id]===(state.savedNotes[id]??'')?'Saved text unchanged':'Unsaved draft';}});
  $('#project-picker').addEventListener('change',()=>announce('Example project context changed locally. Source notes remain linked to their authored source.'));
  $('#preview-dialog').addEventListener('close',()=>previewOwner?.focus({preventScroll:true}));
  $('#preview-dialog').addEventListener('click',event=>{if(event.target===$('#preview-dialog'))$('#preview-dialog').close();});
  render();renderFocus();
})();
