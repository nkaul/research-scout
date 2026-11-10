/** Native SVG architecture review. Exact labels; no external assets or runtime. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
const ink='#20304b', blue='#3154ac', purple='#7253aa', green='#2b7057', amber='#875b1f', red='#9c4547';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text=(x,y,lines,size=24,color=ink,weight=400)=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}">${[].concat(lines).map((line,i)=>`<tspan x="${x}" dy="${i?size*1.42:0}">${esc(line)}</tspan>`).join('')}</text>`;
const rect=(x,y,w,h,fill='#fff',stroke='#cbd4e4',r=16)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>`;
const arrow=(d,color=blue,dashed=false)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${dashed?'stroke-dasharray="8 8"':''} marker-end="url(#${color===green?'green':color===amber?'amber':color===red?'red':color===purple?'purple':'blue'}-arrow)"/>`;
const exchange=(d,color=blue)=>arrow(d,color).replace('marker-end=',`marker-start="url(#${color===green?'green':'blue'}-arrow)" marker-end=`);
const icon=(name,x,y,size=42,color=blue)=>`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><use href="#${name}"/></svg>`;
const defs=`<defs>${[['blue',blue],['green',green],['amber',amber],['red',red],['purple',purple]].map(([n,c])=>`<marker id="${n}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 10 5 0 10" fill="${c}"/></marker>`).join('')}
<symbol id="browser"><rect x="4" y="7" width="40" height="31" rx="4"/><path d="M4 15h40M10 11h.1M15 11h.1M20 11h.1M19 43h10M24 38v5M10 21h9v12h-9M24 21h13M24 27h13M24 33h9"/></symbol>
<symbol id="robot"><rect x="7" y="12" width="34" height="27" rx="8"/><path d="M24 5v7M21 5h6M2 24h5M41 24h5M15 44v-5M33 44v-5M17 31c4 3 10 3 14 0"/><circle cx="17" cy="22" r="2"/><circle cx="31" cy="22" r="2"/></symbol>
<symbol id="document"><path d="M10 4h19l10 10v30H10zM29 4v11h10M16 22h17M16 29h17M16 36h10"/><path d="M5 10v34h28"/></symbol>
<symbol id="store"><ellipse cx="24" cy="10" rx="17" ry="6"/><path d="M7 10v28c0 8 34 8 34 0V10M7 23c0 8 34 8 34 0M7 35c0 8 34 8 34 0"/></symbol>
<symbol id="plug"><path d="M16 5v11M32 5v11M11 16h26v5c0 9-6 14-13 14s-13-5-13-14zM24 35v9"/></symbol>
<symbol id="person"><circle cx="24" cy="12" r="8"/><path d="M9 43V31c0-8 30-8 30 0v12M17 29v14M31 29v14"/></symbol>
<symbol id="filter"><path d="M5 7h38L29 25v16l-10-5V25z"/></symbol>
<symbol id="clipboard"><rect x="9" y="7" width="30" height="37" rx="4"/><rect x="17" y="3" width="14" height="9" rx="3" fill="white"/><path d="m15 22 3 3 5-6M27 22h6m-18 11 3 3 5-6M27 33h6"/></symbol>
</defs>`;
function svg(title,description,body,height=1280){return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${height}" viewBox="0 0 1920 ${height}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(description)}</desc>${defs}<style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.hand{font-family:'Bradley Hand','Segoe Print',sans-serif}</style><rect width="1920" height="${height}" fill="#fdfdfb"/>${body}</svg>`;}
function header(title,sub){return `<path d="M55 112Q580 101 1130 111T1850 107" stroke="#dbe4ff" stroke-width="18" fill="none" stroke-linecap="round"/>${text(60,76,title,45,blue,650)}${text(60,145,sub,23,'#53627b')}`;}
function pill(x,y,label,color,fill){return `${rect(x,y-24,label.length*12+28,36,fill,color,9)}${text(x+14,y+1,label,20,color,550)}`;}
function card(x,y,w,h,title,lines,{color=blue,fill='#fff',symbol,size=26}={}){return `<g data-bounds="${x},${y},${w},${h}">${rect(x,y,w,h,fill)}${symbol?icon(symbol,x+18,y+18,35,color):''}${text(x+(symbol?65:20),y+43,title,size,color,600)}${text(x+20,y+82,lines,22,ink)}</g>`;}

let a=header('Research Scout — implemented architecture','November 9, 2026 · solid = local request/response path · dashed = implemented live adapter, with qualified evidence');
a+=pill(60,197,'Local fixture infrastructure',green,'#edf7f1')+pill(450,197,'Dated live probe only',amber,'#fff6e5')+pill(780,197,'Live proof pending',red,'#fff0ee')+pill(1095,197,'Frontend not reachable','#5f6c7e','#f0f2f5');
a+=rect(450,235,680,738,'#f7f9ff','#a9bce8',19)+text(480,278,'Application core · Python / FastAPI :8100',26,blue,600);
a+=card(60,280,330,180,'Next.js UI :3100',['Dub-inspired workspace','Built + tested October 30','Not reachable at review'],{color:'#5d697b',symbol:'browser',size:27});
a+=card(60,570,330,230,'Human review',['Include / exclude + reasons','Explicit details / DOI check','Saved-revision exports','No agent decision authority'],{color:purple,symbol:'person',size:27});
a+=card(480,310,270,130,'Application API',['Run admission + lifecycle','Human actions + exports'],{symbol:'clipboard',size:25});
a+=card(790,310,310,225,'Agent runtime',['Deep Agents → LangGraph','Coordinator + specialist','Scripted BaseChatModel','No hosted LLM configured'],{symbol:'robot',color:purple,size:25});
a+=card(790,590,310,145,'Application MCP',['Streamable HTTP /mcp/','Search + saved-read tools'],{symbol:'plug',size:25});
a+=card(480,590,270,145,'Scoped routing',['One discovery provider','DOI check by agency'],{symbol:'filter',size:25});
a+=card(480,815,620,130,'Core validation + saved state',['Discovery: filters / same-provider dedup / RRF(k=60)','Registry: separate observations · JSON / events / revisions'],{symbol:'store',size:26});
a+=arrow('M390 355H478')+text(411,339,'REST',19,blue);
a+=arrow('M750 370H788',purple)+arrow('M945 535V588',purple)+arrow('M790 665H752',blue);
a+=arrow('M615 440V588',purple)+text(487,517,'Human API path',21,purple);
a+=arrow('M615 735V813',blue)+text(633,785,'Validate + persist',21,blue);
a+=arrow('M390 655H435V405H478',purple);
a+=arrow('M480 885H412V500H225V462',green)+text(62,520,'Saved state → SSE → early rows',21,green);
a+=exchange('M750 700H770V770H1162',blue);
a+=`<path d="M1163 328V1000" fill="none" stroke="${blue}" stroke-width="2.5"/>`;
a+=text(1218,232,'Isolated local services',24,blue,600)+text(1579,232,'Remote live paths',24,blue,600);
const rows=[
 {y:260,title:'OpenAlex :8111',body:['Primary discovery','FixtureAdapter active'],remote:'OpenAlex MCP',details:['OAuth + native hybrid','proof pending'],color:red},
 {y:480,title:'Semantic Scholar',body:[':8114 · alternate run','FixtureAdapter active'],remote:'Semantic Scholar API',details:['Last probe: 429 · Oct 26','Encoder proof pending'],color:red},
 {y:700,title:'Crossref :8112',body:['Agency + DOI checks','FixtureAdapter active'],remote:'Crossref REST',details:['Agency + DOI metadata','200 probes · Oct 26'],color:amber},
 {y:920,title:'DataCite :8113',body:['DOI metadata checks','FixtureAdapter active'],remote:'DataCite REST',details:['Exact DOI singleton','200 probe · Oct 26'],color:amber}
];
for(const r of rows){a+=exchange(`M1163 ${r.y+68}H1218`,green);a+=card(1220,r.y,280,151,r.title,r.body,{color:green,size:25});a+=arrow(`M1500 ${r.y+68}H1578`,r.color,true);a+=text(1516,r.y+49,'live',19,r.color);a+=card(1580,r.y,290,151,r.remote,r.details,{color:r.color,fill:r.color===amber?'#fffaf1':'#fff6f4',size:24});}
a+=rect(58,1115,1810,116,'#f2effb','#d8cdec')+icon('filter',80,1140,45,purple)+text(145,1158,'Routes are choices, not four-provider search fan-out.',28,purple,600)+text(145,1199,'Today: all provider health checks are fixtures. Live edges are not newly tested. App JSON—not a LangGraph checkpointer—owns durability.',23,ink);
await fs.writeFile(path.join(directory,'implemented-architecture.svg'),svg('Research Scout implemented architecture','A working local fixture backend routes one provider per discovery run. Local application MCP is verified. External live adapters have separate, limited evidence; the frontend is not reachable at review.',a));

let w=header('What the agent workflow actually does','Two compiled graphs, one bound delegation, one application search — real orchestration with a scripted model');
w+=pill(60,200,'Deep Agents 0.7.32',blue,'#eef3ff')+pill(365,200,'LangChain 1.4.7',blue,'#eef3ff')+pill(660,200,'LangGraph 1.2.17',purple,'#f4efff')+pill(970,200,'No hosted model calls',red,'#fff0ee');
function step(x,y,n,title,lines,symbol,color=blue){return `<g data-bounds="${x},${y},560,350">${rect(x,y,560,350,'#fff','#bdcbe5')}${rect(x+16,y+17,49,49,'#eef2ff',color,20)}${text(x+30,y+51,n,29,color,650)}${icon(symbol,x+488,y+20,45,color)}${text(x+24,y+106,title,30,color,600)}${text(x+24,y+152,lines,24,ink)}</g>`;}
w+=step(60,260,1,'Bind the research task',['Question + one provider + hard filters.','Save scope; admit one execution.','Both branches use the same question.','No LLM query planner is implemented.'],'clipboard');
w+=step(680,260,2,'Coordinator graph',['Generation 1 → delegate_discovery().','One provider-bound handoff.','No arbitrary subagent task tool.','LangGraph executes the compiled graph.'],'robot',purple);
w+=step(1300,260,3,'Discovery specialist',['Generation 2 → search_papers().','Its model-facing tool takes no args.','The closure binds the saved run ID.','Actual MCP ClientSession calls the core.'],'plug',purple);
w+=step(1300,690,4,'Retrieve, validate, publish',['Core → one selected provider service.','Lexical + semantic branches run.','Core filters, deduplicates and fuses ranks.','Saved observations → SSE → early UI.','Rows do not wait for a final summary.'],'filter');
w+=step(680,690,5,'Pack context & validate',['Specialist wrapper packs saved records.','Generation 3 reads compact tool results.','Keep every admitted source ID/version.','Fit optional title / abstract previews.','Reject foreign or invented references.','Return bounded JSON + a scripted note.'],'document');
w+=step(60,690,6,'Return to human review',['Generation 4 → coordinator result.','Core validates and saves final status.','People control shortlist and reasons.','DOI checks / exports use the API.','Registry agreement ≠ scientific validity.'],'person',purple);
w+=arrow('M620 430H678',purple)+arrow('M1240 430H1298',purple)+arrow('M1580 610V688',purple)+arrow('M1300 865H1242',blue)+arrow('M680 865H622',blue);
w+=rect(60,1110,1800,105,'#f4f7fc','#cbd7ec')+text(86,1152,'Harness: 4 scripted generations on the happy path; cap 6 · 1 delegation · 1 application search',27,blue,600)+text(86,1191,'Context limits are fixture UTF-8 byte units, not live tokens. Graph messages are transient; saved app state prevents automatic replay.',23,ink);
await fs.writeFile(path.join(directory,'agent-workflow.svg'),svg('Research Scout agent workflow','Six steps show the coordinator, specialist, application MCP, deterministic retrieval and progressive publication, compact context, validated scripted result and human authority.',w));

let r=header('Review checkpoint — what we can build on','November 9, 2026 · a review baseline, with proposed next steps rather than an implementation commitment');
const columns=[
 {x:60,color:green,fill:'#f1f8f4',title:'Implemented foundation',sub:'Fixture-proven behavior',symbol:'clipboard',items:[
 ['Actual agent framework','Two Deep Agents / LangGraph graphs.','Narrow tools; bounded orchestration.'],
 ['Local protocols and services','Application MCP + four provider processes.','HTTP / NDJSON / persisted SSE path.'],
 ['Human review and durability','Atomic JSON; revisions; independent journals.','Shortlist, registry checks, saved exports.'],
 ['Dub-inspired application UI','Desktop preview, tabs and phone reader.','Built and validated; not reachable at review.'],
 ['Dated validation evidence','Oct 26: 106 Python; 11 synthetic evals.','Oct 30: 9 production-browser journeys.']
 ]},
 {x:680,color:amber,fill:'#fff9ee',title:'Evidence still limited',sub:'Do not equate fixtures with live research',symbol:'document',items:[
 ['OpenAlex official MCP','Adapter and schema-contract code exist.','OAuth / tool / native hybrid proof pending.'],
 ['Crossref + DataCite REST','Specific metadata probes returned 200.','Evidence date: Oct 26; not rechecked today.'],
 ['Semantic Scholar REST','Last details probe: 429 on Oct 26.','Live search and encoder remain unproved.'],
 ['AI reasoning and search quality','Only a scripted BaseChatModel runs.','No live relevance / entailment evaluation.'],
 ['Durable graph continuation','JSON stores application state, not graph steps.','No LangGraph checkpointer is configured.']
 ]},
 {x:1300,color:purple,fill:'#f6f1fc',title:'Next review decisions',sub:'Proposed dependency order',symbol:'filter',items:[
 ['1 · Make modes explicit','Separate provider data mode from model mode.','Current provider-live path can stay scripted.'],
 ['2 · Prove the primary connection','Authorize OpenAlex; inspect actual tool schemas.','Run bounded lexical / semantic / filter cases.'],
 ['3 · Introduce one real model','Choose model, tool profile and cost accounting.','Validate the one-question-to-shortlist journey.'],
 ['4 · Measure, then broaden','Reviewed live questions + registry-check cases.','Optional S2 access / compatible pool reranker.'],
 ['Later · Production and more content','Database, identity and deployment decisions.','Full-text / PDF / web / video remain future.']
 ]}
];
for(const c of columns){r+=rect(c.x,245,560,800,c.fill,'#d1d8e5')+icon(c.symbol,c.x+24,270,48,c.color)+text(c.x+88,301,c.title,30,c.color,600)+text(c.x+25,353,c.sub,22,c.color);for(let i=0;i<c.items.length;i++){const y=407+i*119;r+=`<path d="M${c.x+26} ${y-25}h508" stroke="#dbe0e9" stroke-width="1.3"/>`+text(c.x+26,y,c.items[i][0],25,c.color,600)+text(c.x+26,y+36,c.items[i].slice(1),22,ink);}}
r+=rect(60,1100,1800,125,'#eef2ff','#b8c8eb')+text(88,1145,'Starting point: the local framework and UX exist; live research acceptance is not yet demonstrated.',29,blue,600)+text(88,1189,'First useful live slice: one question → OpenAlex hybrid results → a real model’s bounded output → human shortlist → saved export.',24,ink);
await fs.writeFile(path.join(directory,'review-checkpoint.svg'),svg('Research Scout review checkpoint','Three columns distinguish the fixture-proven implementation, limited external evidence and proposed next decisions. The first useful live slice still needs OpenAlex and real-model proof.',r));
console.log('Wrote three native SVG review diagrams.');
