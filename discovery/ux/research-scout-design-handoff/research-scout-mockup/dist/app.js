'use strict';
const iconPaths={
  plus:'<path d="M12 5v14M5 12h14"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  bookmark:'<path d="M6 4h12v17l-6-4-6 4Z"/>',
  columns:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  spark:'<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/>',
  'arrow-up-right':'<path d="M7 17 17 7M7 7h10v10"/>',
  'arrow-right':'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  'arrow-left':'<path d="M19 12H5m5-5-5 5 5 5"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10H3Z"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  command:'<path d="M9 9H6a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3V6a3 3 0 1 1 3 3Z"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  x:'<path d="m6 6 12 12M6 18 18 6"/>',
  chevron:'<path d="m8 10 4 4 4-4"/>',
  sliders:'<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
  play:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  unlock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0M12 14v3"/>',
  align:'<path d="M5 5h14M5 10h14M5 15h14M5 20h8"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  quote:'<path d="M5 13h5v7H3v-7c0-5 2-8 6-9M16 13h5v7h-7v-7c0-5 2-8 6-9"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(iconPaths[name]||iconPaths.file)+'</svg>';}
function setIcons(root=document){root.querySelectorAll('[data-icon]').forEach(function(el){el.innerHTML=icon(el.dataset.icon);});}
function esc(value){return String(value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
const examples=[
  {id:'p1',type:'papers',title:'Institutional readiness for responsible AI in higher education',authors:'L. Martin, S. Chen & A. Patel',year:2025,venue:'Higher education · Policy research',method:'Framework',access:'Full text',citations:42,topic:'education',summary:'A practical framework connecting institutional strategy, faculty capability, and accountable AI governance.',definition:'Readiness is a shared institutional capacity: a clear strategy, capable people, and accountable structures for using AI.',basis:'A conceptual framework connecting organizational policy with implementation practice.',finding:'Technology access alone is insufficient; institutional ownership and faculty development need to advance together.',limitation:'The framework illustrates institutional dimensions; it does not establish a validated readiness score.',passage:'Institutional readiness depends on the alignment of governance, professional capability, and practical support. A policy becomes useful when people can apply it in their everyday decisions.',locator:'p. 8 · Institutional capacity'},
  {id:'p2',type:'papers',title:'From principles to practice: governing generative AI at universities',authors:'M. Rivera, J. Park & E. Thompson',year:2024,venue:'Governance & education · Comparative review',method:'Review',access:'Full text',citations:86,topic:'education',summary:'A comparison of university policy approaches, with a focus on transparent decisions and algorithmic accountability.',definition:'Readiness is the ability to translate institutional principles into clear roles, review processes, and operational guidance.',basis:'Illustrative comparison of policy frameworks and institutional responsibilities.',finding:'Policies are easier to apply when ownership, escalation paths, and review cycles are explicit.',limitation:'Policy documents describe intended practice and may not reflect implementation.',passage:'Accountability requires more than a statement of principles. Institutions need named responsibilities, a way to review consequential decisions, and guidance that can evolve with practice.',locator:'p. 12 · Operational accountability'},
  {id:'p3',type:'papers',title:'Faculty AI readiness: confidence, capability, and institutional support',authors:'R. Williams & N. Okafor',year:2025,venue:'Teaching practice · Faculty development',method:'Empirical study',access:'Full text',citations:23,topic:'education',summary:'Examines how faculty confidence relates to professional learning, practical guidance, and access to support.',definition:'Readiness combines AI literacy, the confidence to judge appropriate use, and access to relevant institutional support.',basis:'Illustrative faculty survey and interviews about practical adoption.',finding:'Confidence and critical understanding can differ; support should address both.',limitation:'Findings from one institutional context should not be generalized to every university.',passage:'Faculty confidence is not interchangeable with critical AI literacy. Professional learning needs to support informed judgments about use, while institutional services make those judgments practical.',locator:'p. 6 · Faculty capability'},
  {id:'p4',type:'papers',title:'Algorithmic accountability in the academic institution',authors:'D. Kim, H. Lewis & P. Ahmed',year:2023,venue:'AI & society · Institutional policy',method:'Framework',access:'Abstract only',citations:114,topic:'education',summary:'Positions review, transparency, and meaningful oversight as foundations for responsible institutional AI use.',definition:'The available abstract describes readiness in terms of organizational accountability and oversight.',basis:'Abstract only; the full methods were not read in this concept.',finding:'The abstract emphasizes transparency and institutional responsibility.',limitation:'Full-text methods and results are unavailable in this sample.',passage:'The abstract positions institutional accountability as a foundation for responsible AI adoption.',locator:'Abstract · Sample extract'},
  {id:'p5',type:'papers',title:'Building AI literacy into the university curriculum',authors:'S. Evans, C. Bennett & F. Santos',year:2024,venue:'Curriculum studies · Learning design',method:'Review',access:'Full text',citations:57,topic:'education',summary:'Explores critical AI literacy across disciplines and the organizational conditions needed to support it.',definition:'Readiness includes the capacity to critically understand, use, and question AI in a disciplinary context.',basis:'Illustrative synthesis of curriculum and professional-learning approaches.',finding:'Shared principles need adaptation to disciplinary practices and learning objectives.',limitation:'Curriculum examples are context-dependent and require local evaluation.',passage:'AI literacy is not only a technical competence. It includes the ability to recognize limitations, question outputs, and make context-sensitive decisions.',locator:'p. 4 · Critical AI literacy'},
  {id:'p6',type:'papers',title:'What makes an AI policy actionable?',authors:'A. Foster & T. Nguyen',year:2026,venue:'University policy · Practice paper',method:'Framework',access:'Full text',citations:8,topic:'education',summary:'Connects concise policy language with everyday teaching decisions, examples, and regular institutional review.',definition:'Operational readiness means people can understand what to do, where to seek help, and how to review a decision.',basis:'Illustrative practice framework and policy examples.',finding:'Concrete examples and visible support paths improve the usefulness of policy.',limitation:'The sample is a practice-oriented framework, not an effectiveness trial.',passage:'A useful policy makes the next decision easier. It connects principles to examples, provides an accessible support route, and names when guidance will be revisited.',locator:'p. 9 · Policy in practice'},
  {id:'p7',type:'papers',title:'Student perspectives on responsible AI in learning',authors:'N. Brooks, I. García & A. Shah',year:2024,venue:'Student experience · Qualitative research',method:'Empirical study',access:'Abstract only',citations:31,topic:'education',summary:'Looks at student expectations around clarity, fairness, and participation in university AI decisions.',definition:'The available abstract foregrounds clear expectations and student participation.',basis:'Abstract only; detailed sample and methods are unavailable.',finding:'The abstract highlights clarity and fairness as student concerns.',limitation:'No full-text claims can be made from this sample.',passage:'The abstract highlights the importance of clear expectations around responsible AI use.',locator:'Abstract · Sample extract'},
  {id:'p8',type:'papers',title:'Institutional AI adoption: a readiness and responsibility lens',authors:'E. Walker & J. Zhao',year:2022,venue:'Organizational change · Review',method:'Review',access:'Full text',citations:163,topic:'education',summary:'Brings change management and responsible innovation together to examine university AI adoption.',definition:'Readiness connects organizational capacity with a responsibility to anticipate impacts.',basis:'Illustrative review of organizational change and responsible innovation.',finding:'Adoption decisions should consider institutional capacity and affected communities together.',limitation:'Conceptual relationships need empirical testing in specific settings.',passage:'Institutional capacity and responsibility develop together. Adoption should consider what the organization can sustain and whose interests are affected.',locator:'p. 15 · Responsible adoption'},
  {id:'w1',type:'web',title:'A practical guide to university AI governance',authors:'University policy observatory',year:2026,venue:'Web resource · Updated October 2026',method:'Guide',access:'Page read',topic:'education',summary:'A concise implementation guide covering policy ownership, review cycles, and faculty support.',definition:'A practical readiness checklist combines governance, learning, and ongoing evaluation.',basis:'Illustrative web guide.',finding:'Assign responsibilities and revisit guidance as practice changes.',limitation:'This sample guide is not a peer-reviewed study.',passage:'Start with clear ownership, support people through practical examples, and make review a routine part of governance.',locator:'Section 3 · Putting policy to work'},
  {id:'w2',type:'web',title:'The campus AI readiness checklist',authors:'Center for digital education',year:2025,venue:'Web resource · Institutional toolkit',method:'Toolkit',access:'Page read',topic:'education',summary:'A starting point for discussing capability, access, governance, and support across a campus.',definition:'A checklist for discussing institutional capacity and local needs.',basis:'Illustrative institutional toolkit.',finding:'A readiness conversation should involve teaching, support, leadership, and students.',limitation:'A checklist is not a validated assessment instrument.',passage:'Use the checklist as a conversation starter, adapting it to the institution and the people who will use it.',locator:'Readiness checklist · Introduction'},
  {id:'w3',type:'web',title:'Faculty development for critical AI literacy',authors:'Teaching and learning exchange',year:2024,venue:'Web resource · Professional learning',method:'Guide',access:'Metadata only',topic:'education',summary:'A professional-learning resource listed for further review. Page content has not been read.',definition:'Not stated in available content.',basis:'Metadata only.',finding:'No content-backed finding available.',limitation:'Only the title and description are available.',passage:'',locator:''},
  {id:'v1',type:'videos',title:'Beyond the policy: making responsible AI work on campus',authors:'Higher education conversations',year:2025,venue:'Video · 18:24',duration:'18:24',method:'Discussion',access:'Transcript available',topic:'education',summary:'A discussion of how universities can connect policy principles with practical faculty and student support.',definition:'Readiness means support, accountability, and the ability to make informed daily decisions.',basis:'Illustrative discussion with an imported sample transcript.',finding:'Policy and professional learning need to be connected.',limitation:'A discussion provides perspectives rather than a controlled study.',passage:'The question is not only whether a policy exists. It is whether a teacher knows how to use it, where to ask for help, and how to raise a concern.',locator:'04:32–05:01 · From policy to practice'},
  {id:'v2',type:'videos',title:'Teaching AI literacy across disciplines',authors:'The learning studio',year:2024,venue:'Video · 26:10',duration:'26:10',method:'Lecture',access:'Metadata only',topic:'education',summary:'A lecture exploring AI literacy in different disciplines. Transcript content is unavailable in this concept.',definition:'Not stated in available content.',basis:'Video metadata only.',finding:'No transcript-backed finding available.',limitation:'The video has not been analyzed.',passage:'',locator:''},
  {id:'v3',type:'videos',title:'Five questions for your university AI strategy',authors:'Campus futures',year:2026,venue:'Video · 12:08',duration:'12:08',method:'Interview',access:'Transcript available',topic:'education',summary:'An interview about institutional priorities, governance ownership, and evaluating readiness.',definition:'Readiness involves a shared strategy and a way to evaluate the institution’s progress.',basis:'Illustrative interview and sample transcript.',finding:'Shared ownership helps align strategy and practice.',limitation:'Interview perspectives require corroboration.',passage:'Begin by asking what the institution wants to achieve, who is responsible, and what evidence would show that the approach is working.',locator:'02:18–02:44 · A shared direction'},
  {id:'m1',type:'papers',title:'Student wellbeing and digital early-support systems',authors:'C. Adams & R. Wilson',year:2025,venue:'Student wellbeing · Review',method:'Review',access:'Full text',citations:18,topic:'wellbeing',summary:'Examines the role of digital support, transparency, and human review in student wellbeing services.',definition:'Readiness includes appropriate support pathways, informed use, and human oversight.',basis:'Illustrative review for interface testing.',finding:'Automated signals need appropriate human interpretation and support.',limitation:'This fictional sample does not establish clinical effectiveness.',passage:'A signal is a starting point for appropriate support, not a diagnosis. Human review and a clear support pathway remain central.',locator:'p. 7 · Support pathways'}
];
let saved;try{saved=JSON.parse(localStorage.getItem('scout-demo-saved'));}catch(e){}
const validIds=new Set(examples.map(function(s){return s.id;}));
const state={view:'discover',type:'papers',topic:'education',query:'',saved:new Set(Array.isArray(saved)?saved.filter(function(id){return validIds.has(id);}):['p1','p2','p3']),selected:new Set(),year:'all',method:'all',oa:false,sort:'relevance',inspector:null,inspectorTab:'overview',briefReady:false};
const $=function(id){return document.getElementById(id);};
let toastTimer,searchTimer,returnFocus;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(function(){$('toast').classList.remove('visible');},2600);}
function persist(){try{localStorage.setItem('scout-demo-saved',JSON.stringify(Array.from(state.saved)));}catch(e){}$('library-count').textContent=state.saved.size;}
function source(id){return examples.find(function(s){return s.id===id;});}
function isAvailable(s){return ['Full text','Page read','Transcript available'].includes(s.access);}
function typeIcon(s){return s.type==='web'?'globe':s.type==='videos'?'play':'file';}
function typeLabel(s){return s.type==='papers'?'Paper':s.type==='web'?'Web source':'Video';}
function accessMarkup(s){return '<span class="access-label'+(isAvailable(s)?'':' limited')+'">'+icon(isAvailable(s)?'unlock':'align')+esc(s.access)+'</span>';}
function getResults(type){
  let rows=examples.filter(function(s){return s.type===(type||state.type);});
  if(state.view==='library')rows=rows.filter(function(s){return state.saved.has(s.id);});
  else rows=rows.filter(function(s){return s.topic===state.topic;});
  if(state.query&&state.view==='discover'){
    const terms=state.query.toLowerCase().split(/\W+/).filter(function(w){return w.length>3&&!['what','would','like','understand','higher','education','institutional','universities','preparing','responsible'].includes(w);});
    if(terms.length)rows=rows.filter(function(s){const t=(s.title+' '+s.summary+' '+s.authors+' '+s.method).toLowerCase();return terms.some(function(w){return t.includes(w);});});
  }
  if(state.year!=='all')rows=rows.filter(function(s){return s.year>=Number(state.year);});
  if(state.method!=='all')rows=rows.filter(function(s){return s.method===state.method;});
  if(state.oa)rows=rows.filter(isAvailable);
  if(state.sort==='newest')rows.sort(function(a,b){return b.year-a.year;});
  if(state.sort==='citations')rows.sort(function(a,b){return (b.citations||0)-(a.citations||0);});
  return rows;
}
function viewHeading(eyebrow,title,description,action){return '<div class="section-header"><div class="section-heading-row"><div><div class="eyebrow">'+esc(eyebrow)+'</div><h1>'+esc(title)+'<span>.</span></h1><p>'+esc(description)+'</p></div>'+(action||'')+'</div></div>';}
function tabToolbar(){
  const tabs=[['papers','Papers','file'],['web','Web','globe'],['videos','Videos','play']].map(function(t){return '<button class="source-tab'+(state.type===t[0]?' active':'')+'" role="tab" aria-selected="'+(state.type===t[0])+'" data-type="'+t[0]+'">'+icon(t[2])+t[1]+'<span class="tab-count">'+getResults(t[0]).length+'</span></button>';}).join('');
  return '<div class="view-toolbar"><div class="source-tabs" role="tablist" aria-label="Source type">'+tabs+'</div><div class="view-actions"><button class="text-action" data-action="filters">'+icon('sliders')+'Filters'+((state.year!=='all'||state.method!=='all'||state.oa)?' ·':'')+'</button><button class="text-action" data-action="export">'+icon('download')+'Export</button></div></div><div class="filter-toolbar"><button class="filter-chip" data-action="filters">'+icon('calendar')+(state.year==='all'?'Any year':state.year+'–2026')+icon('chevron')+'</button><button class="access-toggle" data-action="toggle-access" aria-pressed="'+state.oa+'"><span class="switch" aria-hidden="true"></span>'+(state.type==='papers'?'Full text':state.type==='videos'?'Has transcript':'Page read')+'</button><div class="toolbar-spacer"></div><label class="sr-only" for="sort-results">Sort sources</label><select class="sort-control" id="sort-results"><option value="relevance"'+(state.sort==='relevance'?' selected':'')+'>Most relevant</option><option value="newest"'+(state.sort==='newest'?' selected':'')+'>Newest first</option>'+(state.type==='papers'?'<option value="citations"'+(state.sort==='citations'?' selected':'')+'>Most cited</option>':'')+'</select></div>';
}
function makeRow(s){
  const article=document.createElement('article');article.className='source-row'+(state.selected.has(s.id)?' is-selected':'');article.dataset.source=s.id;
  const saved=state.saved.has(s.id);
  article.innerHTML='<div class="row-type '+(s.type==='web'?'web':s.type==='videos'?'video':'')+'">'+icon(typeIcon(s))+'</div><div class="row-content"><div class="row-heading"><button class="paper-title" data-open="'+s.id+'">'+esc(s.title)+'</button><span class="row-year">'+s.year+'</span></div><div class="paper-byline">'+esc(s.authors)+' <span aria-hidden="true">·</span> '+esc(s.venue)+'</div><p class="paper-summary">'+esc(s.summary)+'</p><div class="row-bottom">'+accessMarkup(s)+'<span class="mini-separator"></span><span class="method-label">'+esc(s.method)+'</span>'+(s.citations?'<span class="mini-separator"></span><span class="citations-label">'+s.citations+' citations</span>':'')+'</div></div><div class="row-actions"><button class="save-button'+(saved?' saved':'')+'" data-save="'+s.id+'" aria-label="'+(saved?'Remove from library: ':'Save to library: ')+esc(s.title)+'" aria-pressed="'+saved+'" title="'+(saved?'Saved to library':'Save to library')+'">'+icon('bookmark')+'</button>'+(state.view==='library'?'<label class="select-wrap"><input type="checkbox" data-select="'+s.id+'" aria-label="Select for comparison: '+esc(s.title)+'"'+(state.selected.has(s.id)?' checked':'')+'></label>':'')+'</div>';
  article.addEventListener('click',function(e){if(!e.target.closest('button,input,label'))openInspector(s.id);});
  return article;
}
function render(){
  document.body.dataset.view=state.view;
  document.querySelectorAll('[data-view]').forEach(function(b){b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-current',b.dataset.view===state.view?'page':'false');});
  document.querySelectorAll('[data-topic]').forEach(function(b){b.classList.toggle('active',b.dataset.topic===state.topic);});
  $('breadcrumb-title').textContent=state.topic==='wellbeing'?'Student wellbeing':'AI in higher education';
  $('discovery-header').hidden=state.view!=='discover';persist();
  const content=$('workspace-content');content.innerHTML='';
  if(state.view==='evidence'){renderEvidence(content);renderSelection();return;}
  if(state.view==='brief'){renderBrief(content);renderSelection();return;}
  if(state.view==='library')content.innerHTML=viewHeading('A FEW GOOD SOURCES','Your growing library','A place for the ideas worth keeping. Select two or three sources to compare their evidence.','<button class="button" data-action="export">'+icon('download')+'Export sources</button>');
  content.innerHTML+=tabToolbar();
  const rows=getResults();
  content.innerHTML+='<div class="results-meta"><span><strong>'+rows.length+' '+(state.type==='papers'?'papers':state.type==='web'?'web sources':'videos')+'</strong>'+(state.view==='library'?' in your library':' to explore')+'</span><span class="status-dots"><i></i>Sample workspace</span></div>';
  if(!rows.length){
    content.innerHTML+='<div class="empty-state"><div class="empty-icon">'+icon(state.view==='library'?'bookmark':'search')+'</div><h2>'+(state.view==='library'?'A place for your next discovery.':'A little more room to explore.')+'</h2><p>'+(state.view==='library'?'Save a source in Discover and it will be waiting here.':'No sample sources match these filters. Try a broader question or clear your filters.')+'</p><button class="button primary" data-action="'+(state.view==='library'?'discover':'clear-filters')+'">'+(state.view==='library'?'Find sources':'Clear search & filters')+icon('arrow-right')+'</button></div>';
  }else{
    const list=document.createElement('div');list.className='source-list';rows.forEach(function(s){list.appendChild(makeRow(s));});content.appendChild(list);
    const end=document.createElement('div');end.className='results-end';end.innerHTML=icon('check')+'You’re all caught up with this sample.';content.appendChild(end);
  }
  renderSelection();
}
function renderSelection(){
  const bar=$('selection-bar');bar.hidden=!(state.view==='library'&&state.selected.size);
  if(bar.hidden)return;
  bar.innerHTML='<span><span class="selection-count">'+state.selected.size+'</span> selected</span><button class="text-action" data-action="clear-selection">Clear</button><button class="button primary" data-action="compare"'+(state.selected.size<2?' disabled':'')+'>'+icon('columns')+'Compare evidence</button>';
}
function renderEvidence(container){
  const items=Array.from(state.selected).map(source).filter(Boolean).slice(0,3);
  container.innerHTML=viewHeading('PUT THE IDEAS SIDE BY SIDE','Look a little closer','Definitions, methods, and limitations — with the passages that keep the comparison grounded.','<button class="button" data-action="library">'+icon('bookmark')+'Choose sources</button>');
  if(items.length<2){container.innerHTML+='<div class="empty-state"><div class="empty-icon">'+icon('columns')+'</div><h2>Two perspectives are a good start.</h2><p>Select two or three sources in your library to compare what they say, how they reached it, and what remains uncertain.</p><button class="button primary" data-action="library">Choose from your library'+icon('arrow-right')+'</button></div>';return;}
  container.innerHTML+='<div class="compare-intro"><span>'+items.length+' selected sources <span aria-hidden="true">·</span> Definitions across selected sources</span><button class="text-action" data-action="export">'+icon('download')+'Export comparison</button></div><div class="evidence-grid">'+items.map(function(s,i){return '<article class="compare-card"><div class="source-index"><span>0'+(i+1)+'</span>'+accessMarkup(s)+'</div><h2>'+esc(s.title)+'</h2><p class="compare-authors">'+esc(s.authors)+' · '+s.year+'</p><h3 class="comparison-label">THE DEFINITION</h3><p class="compare-copy">'+esc(s.definition)+'</p><h3 class="comparison-label">BASIS OF EVIDENCE</h3><p class="compare-copy">'+esc(s.basis)+'</p><h3 class="comparison-label">A LIMIT TO KEEP IN MIND</h3><p class="compare-copy">'+esc(s.limitation)+'</p>'+(s.passage?'<button class="passage-link" data-passage="'+s.id+'">'+icon('quote')+'View supporting passage'+icon('arrow-up-right')+'</button>':'<p class="sample-note">No content evidence available.</p>')+'</article>';}).join('')+'</div><div class="comparison-insight"><span>'+icon('columns')+'</span><div><h3>Different lenses, a shared question.</h3><p>This sample comparison shows how governance, institutional capacity, and faculty capability can describe different parts of readiness. Check the original passages before carrying an interpretation into your brief.</p></div></div><div class="sample-note">Illustrative comparison for UX evaluation. These are sample records and passages, not verified research findings.</div>';
}
function renderBrief(container){
  container.innerHTML=viewHeading('CONNECT THE DOTS','Your research brief','A focused place to bring your sources together. Keep the evidence one click away.','<button class="button" data-action="export">'+icon('download')+'Export Markdown</button>');
  const ids=Array.from(state.selected.size>=2?state.selected:state.saved).slice(0,3),items=ids.map(source).filter(Boolean);
  const region=document.createElement('div');region.className='brief-layout';
  if(!state.briefReady){region.innerHTML='<div class="brief-state"><div class="brief-source-stack"><span>'+icon('file')+'</span><span>'+icon('file')+'</span><span>'+icon('file')+'</span></div><h2>A clearer picture is taking shape.</h2><p>Bring '+items.length+' saved '+(items.length===1?'source':'sources')+' into an illustrative brief. Review the claims, follow the passages, and make it your own.</p><button class="button primary" data-action="build-brief"'+(!items.length?' disabled':'')+'>'+icon('align')+'Build sample brief</button><div class="sample-note" style="margin-top:25px">Local UX demonstration. This creates a prewritten sample, without calling an AI or research service.</div></div>';}
  else{
    const citation=function(i){return items[i]?'<button class="inline-citation" data-passage="'+items[i].id+'" aria-label="View source '+(i+1)+'">'+(i+1)+'</button>':'';};
    region.innerHTML='<article class="brief-cover"><div class="brief-eyebrow">RESEARCH NOTE · ILLUSTRATIVE PREVIEW</div><h2>What does it mean for a university to be ready for AI?</h2><div class="brief-meta"><span>'+items.length+' sample sources</span><span>Draft for review</span></div><h3>A working definition</h3><p>Institutional AI readiness can be explored through the relationship between shared governance, practical support, and the capabilities of the people who use it. The selected sample sources offer complementary ways to frame the question. '+citation(0)+'</p><h3>What each source contributes</h3><ul>'+items.map(function(s,i){return '<li>'+esc(s.definition)+' '+citation(i)+'</li>';}).join('')+'</ul><h3>What remains uncertain</h3><p>Conceptual agreement does not establish that an institution is ready in practice. A real review would need to assess study quality, context, implementation, and the limits of the available evidence.</p><h3>Sources in this note</h3>'+items.map(function(s,i){return '<p><button class="passage-link" data-passage="'+s.id+'">['+(i+1)+'] '+esc(s.authors)+' ('+s.year+'). '+esc(s.title)+'.'+icon('arrow-up-right')+'</button></p>';}).join('')+'<div class="brief-footer">All content is illustrative. This preview demonstrates a source-linked brief; it does not report verified academic findings.</div></article>';
  }
  container.appendChild(region);
}
function navigate(view){closeInspector(false);state.view=view;document.body.classList.remove('nav-open');render();window.scrollTo({top:0,behavior:'instant'});}
function saveSource(id){if(state.saved.has(id)){state.saved.delete(id);state.selected.delete(id);toast('Removed from your library');}else{state.saved.add(id);toast('Saved to your library');}state.briefReady=false;render();if(state.inspector===id)renderInspector();}
function openInspector(id,tab){
  if(!source(id))return;returnFocus=document.activeElement;state.inspector=id;state.inspectorTab=tab||'overview';$('source-inspector').hidden=false;document.body.classList.add('has-inspector');
  $('inspector-scrim').hidden=window.innerWidth>1250;renderInspector();$('source-inspector').scrollTop=0;
  if(window.innerWidth<=1250){$('source-inspector').setAttribute('role','dialog');$('source-inspector').setAttribute('aria-modal','true');$('source-inspector').querySelector('[data-action="close-inspector"]').focus();}else{$('source-inspector').removeAttribute('role');$('source-inspector').removeAttribute('aria-modal');}
}
function closeInspector(restore=true){state.inspector=null;$('source-inspector').hidden=true;$('inspector-scrim').hidden=true;document.body.classList.remove('has-inspector');if(restore&&returnFocus&&document.contains(returnFocus))returnFocus.focus();}
function renderInspector(){
  const s=source(state.inspector);if(!s)return;
  const saved=state.saved.has(s.id),evidence=state.inspectorTab==='evidence';
  let body='';
  if(!evidence){body='<section class="detail-section"><h3>WHAT THIS SOURCE ADDS</h3><p>'+esc(s.summary)+'</p></section><dl class="detail-meta"><div><dt>Published</dt><dd>'+s.year+'</dd></div><div><dt>Study type</dt><dd>'+esc(s.method)+'</dd></div><div><dt>Content access</dt><dd>'+esc(s.access)+'</dd></div><div><dt>Version</dt><dd>Sample record</dd></div></dl><section class="detail-section"><h3>AT A GLANCE</h3><p>'+esc(s.definition)+'</p></section><section class="detail-section"><h3>A LIMIT TO KEEP IN MIND</h3><p>'+esc(s.limitation)+'</p></section><section class="detail-section"><details><summary>About this sample record</summary><p>Illustrative title, authors, metadata, and text created for UX evaluation. No DOI, verified publication, or live retrieval is implied.</p></details></section>';}
  else if(!s.passage){body='<section class="detail-section"><h3>CONTENT NOT AVAILABLE</h3><p>We have metadata for this source, but no readable page or transcript. There is no supporting passage to inspect.</p></section>';}
  else{body='<section class="detail-section"><h3>'+(s.access==='Abstract only'?'AVAILABLE ABSTRACT':'SUPPORTING PASSAGE')+'</h3><div class="evidence-card"><blockquote>'+esc(s.passage)+'</blockquote><footer><span>'+esc(s.locator)+'</span><button data-copy-passage="'+s.id+'">'+icon('copy')+'Copy</button></footer></div><p style="font-size:11px">This is illustrative source text for interface evaluation. A production reader will open the original asset at this locator.</p></section><section class="detail-section"><h3>WHY IT MATTERS</h3><p>'+esc(s.finding)+'</p></section>';}
  $('source-inspector').innerHTML='<div class="inspector-top"><span>'+icon(typeIcon(s))+'Source preview</span><button class="icon-button" data-action="close-inspector" aria-label="Close source details">'+icon('x')+'</button></div><div class="inspector-body"><div class="source-kind">'+typeLabel(s)+' · '+s.year+'</div><h2>'+esc(s.title)+'</h2><p class="inspector-byline">'+esc(s.authors)+'<br>'+esc(s.venue)+'</p><div class="inspector-buttons"><button class="button'+(saved?'':' primary')+'" data-save="'+s.id+'">'+icon(saved?'check':'bookmark')+(saved?'Saved to library':'Save source')+'</button><button class="button" data-copy-citation="'+s.id+'">'+icon('copy')+'Copy citation</button></div><div class="inspector-tabs" role="tablist" aria-label="Source detail"><button class="inspector-tab'+(!evidence?' active':'')+'" data-inspector-tab="overview" role="tab" aria-selected="'+!evidence+'">Overview</button><button class="inspector-tab'+(evidence?' active':'')+'" data-inspector-tab="evidence" role="tab" aria-selected="'+evidence+'">Evidence</button></div>'+body+'<div class="sample-note">Sample content · '+esc(s.access)+'. Source provenance and access are always visible.</div></div>';
}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('Copied to clipboard');}catch(e){const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();toast('Copied to clipboard');}}
function download(text,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},500);}
function exportContent(){
  const items=(state.view==='evidence'?Array.from(state.selected):Array.from(state.saved)).map(source).filter(Boolean);
  if(!items.length){toast('Save a source to export your research.');return;}
  let text='# Research Scout — illustrative '+(state.view==='evidence'?'comparison':state.view==='brief'?'research brief':'source library')+'\n\nThis file contains sample content from a UX prototype. It is not verified research.\n\n';
  items.forEach(function(s,i){text+='## '+(i+1)+'. '+s.title+'\n\n'+s.authors+' ('+s.year+').\n\nAccess: '+s.access+'\n\n'+(state.view==='evidence'||state.view==='brief'?'Definition: '+s.definition+'\n\nBasis: '+s.basis+'\n\nLimit: '+s.limitation+'\n\n':'')+(s.passage?'> '+s.passage+'\n\nSample locator: '+s.locator+'\n\n':'');});
  download(text,'research-scout-'+state.view+'-sample.md');toast('Markdown exported');
}
function showDialog(id){closeInspector(false);$(id).showModal();document.body.classList.remove('nav-open');}
function resetFilters(){state.year='all';state.method='all';state.oa=false;}
function submitSearch(query){
  state.query=query;state.view='discover';if(/mental|wellbeing|counsel/i.test(query))state.topic='wellbeing';else state.topic='education';
  closeInspector(false);render();$('workspace-content').innerHTML='<div class="loading-state" role="status"><span class="spinner"></span>Looking through the sample sources…</div>';
  clearTimeout(searchTimer);searchTimer=setTimeout(function(){render();},380);
}
document.addEventListener('click',function(e){
  const target=e.target.closest('button,a');if(!target)return;
  if(target.classList.contains('brand')){e.preventDefault();navigate('discover');return;}
  if(target.dataset.view){navigate(target.dataset.view);return;}
  if(target.dataset.type){state.type=target.dataset.type;render();document.querySelector('[data-type="'+state.type+'"]').focus();return;}
  if(target.dataset.save){saveSource(target.dataset.save);return;}
  if(target.dataset.open){openInspector(target.dataset.open);return;}
  if(target.dataset.passage){openInspector(target.dataset.passage,'evidence');return;}
  if(target.dataset.inspectorTab){state.inspectorTab=target.dataset.inspectorTab;renderInspector();return;}
  if(target.dataset.copyCitation){const s=source(target.dataset.copyCitation);copyText('[ILLUSTRATIVE SAMPLE] '+s.authors+' ('+s.year+'). '+s.title+'.');return;}
  if(target.dataset.copyPassage){const s=source(target.dataset.copyPassage);copyText('[ILLUSTRATIVE SAMPLE] '+s.passage+' — '+s.locator);return;}
  if(target.dataset.query){$('research-query').value=target.dataset.query;submitSearch(target.dataset.query);return;}
  if(target.dataset.topic){state.topic=target.dataset.topic;state.query='';state.type='papers';resetFilters();$('research-query').value=state.topic==='education'?'Institutional AI readiness in higher education':'Student wellbeing and AI support';navigate('discover');return;}
  if(target.hasAttribute('data-close-dialog')){target.closest('dialog').close();return;}
  const action=target.dataset.action;
  if(action==='close-inspector'){closeInspector();return;}
  if(['discover','library','evidence','brief'].includes(action)){navigate(action);return;}
  if(action==='filters'){$('year-filter').value=state.year;$('method-filter').value=state.method;$('filter-oa').checked=state.oa;showDialog('filters-dialog');return;}
  if(action==='toggle-access'){state.oa=!state.oa;render();return;}
  if(action==='clear-filters'){resetFilters();state.query='';$('research-query').value='';render();return;}
  if(action==='clear-selection'){state.selected.clear();render();return;}
  if(action==='compare'){if(state.selected.size>=2)navigate('evidence');return;}
  if(action==='export'){exportContent();return;}
  if(action==='build-brief'){
    target.disabled=true;target.innerHTML='<span class="spinner"></span>Preparing sample…';
    setTimeout(function(){state.briefReady=true;render();},650);return;
  }
  if(target.dataset.command){$('command-dialog').close();const cmd=target.dataset.command;if(cmd==='export')exportContent();else navigate(cmd);return;}
});
document.addEventListener('change',function(e){
  if(e.target.dataset.select){const id=e.target.dataset.select;if(e.target.checked){if(state.selected.size>=3){e.target.checked=false;toast('Compare up to three sources at a time.');return;}state.selected.add(id);}else state.selected.delete(id);state.briefReady=false;render();const checkbox=document.querySelector('[data-select="'+id+'"]');if(checkbox)checkbox.focus();return;}
  if(e.target.id==='sort-results'){state.sort=e.target.value;render();}
});
$('search-form').addEventListener('submit',function(e){e.preventDefault();submitSearch($('research-query').value.trim());});
$('new-exploration').addEventListener('click',function(){showDialog('exploration-dialog');});
$('add-exploration').addEventListener('click',function(){showDialog('exploration-dialog');});
$('exploration-form').addEventListener('submit',function(e){e.preventDefault();const q=$('new-question').value.trim();if(!q)return;$('exploration-dialog').close();$('research-query').value=q;resetFilters();submitSearch(q);$('new-question').value='';});
$('filters-form').addEventListener('submit',function(e){e.preventDefault();state.year=$('year-filter').value;state.method=$('method-filter').value;state.oa=$('filter-oa').checked;$('filters-dialog').close();render();});
$('reset-filters').addEventListener('click',function(){resetFilters();$('year-filter').value='all';$('method-filter').value='all';$('filter-oa').checked=false;});
$('mobile-menu').addEventListener('click',function(){document.body.classList.toggle('nav-open');});
$('inspector-scrim').addEventListener('click',function(){closeInspector();});
['guide-button','preview-info','sample-info'].forEach(function(id){$(id).addEventListener('click',function(){showDialog('info-dialog');});});
function commandMenu(){$('command-list').innerHTML=[['discover','Find a new source','compass','1'],['library','Open your library','bookmark','2'],['evidence','Compare selected sources','columns','3'],['brief','Open research brief','file','4'],['export','Export your research','download','']].map(function(c){return '<button class="command-option" data-command="'+c[0]+'">'+icon(c[2])+c[1]+'<span>'+c[3]+'</span></button>';}).join('');showDialog('command-dialog');}
$('command-button').addEventListener('click',commandMenu);
document.addEventListener('keydown',function(e){
  const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  const tab=document.activeElement.closest('[role="tab"]');
  if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
    e.preventDefault();const list=Array.from(tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));let index=list.indexOf(tab);index=e.key==='Home'?0:e.key==='End'?list.length-1:(index+(e.key==='ArrowRight'?1:-1)+list.length)%list.length;list[index].click();const next=document.querySelector(list[index].dataset.type?'[data-type="'+list[index].dataset.type+'"]':'[data-inspector-tab="'+list[index].dataset.inspectorTab+'"]');if(next)next.focus();return;
  }
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(state.view!=='discover')navigate('discover');$('research-query').focus();$('research-query').select();return;}
  if(e.key==='Escape'){closeInspector();document.body.classList.remove('nav-open');return;}
  if(!typing&&!document.querySelector('dialog[open]')&&e.key==='/'){e.preventDefault();if(state.view!=='discover')navigate('discover');$('research-query').focus();return;}
  if(!typing&&!document.querySelector('dialog[open]')&&e.key.toLowerCase()==='n'){e.preventDefault();showDialog('exploration-dialog');}
  if(e.key==='Tab'&&state.inspector&&window.innerWidth<=1250){
    const focusable=Array.from($('source-inspector').querySelectorAll('button,a[href],input,summary,[tabindex="0"]'));const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
document.querySelectorAll('dialog').forEach(function(dialog){dialog.addEventListener('click',function(e){if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});});
window.addEventListener('resize',function(){if(state.inspector){$('inspector-scrim').hidden=window.innerWidth>1250;if(window.innerWidth>1250){$('source-inspector').removeAttribute('role');$('source-inspector').removeAttribute('aria-modal');}else{$('source-inspector').setAttribute('role','dialog');$('source-inspector').setAttribute('aria-modal','true');}}});
setIcons();render();
