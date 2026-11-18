import { test, expect, type Page } from '@playwright/test';
import type { ChatSource, Conversation, ExplorationTurn, RetrievalState } from '../../src/lib/conversations';
import { hasResourceQuery } from '../../src/lib/ai-query-plan';
import { FIRST_SOURCE, initialSnapshot, installFixtureApi } from './fixture-api';
import { sharedPlanningFields } from './planning-fixture';
import { openSearchInformation } from './search-controls';

const stamp='2026-11-14T12:00:00Z', question='How can better context improve language-model generation?';
const source:ChatSource={...FIRST_SOURCE,run_id:'shared-ai-paper',title:'Authored context-selection study',relevance:{label:'relevant',reason:'Authored reviewed-source fixture.'}};
function research(clarification=false, legacy=false):ExplorationTurn {
  const fields=sharedPlanningFields();
  const retrieval:RetrievalState={...fields,status:clarification?'clarification_needed':'completed',intent:'Improve context supplied to language models',domain:'Machine learning',lexical_query:'context selection grounded language model generation',semantic_query:'How does better evidence selection improve language-model answers?',keywords:['evidence selection','context quality'],tags:['RAG','Context engineering'],provider_queries:[{provider:'openalex',lexical_query:'PROVIDER_SPECIFIC_QUERY',semantic_query:'PROVIDER_SPECIFIC_SEMANTIC',rationale:'An authored source-specific query.'}],assumptions:['Context means evidence supplied to a language model.'],...(clarification?{needs_clarification:true,clarification_question:'Do you mean context for language models or a statistical context model?',resource_queries:null,context_expansion:{interpreted_question:'Clarify the intended context-model domain',domain_basis:'ambiguous',inferred_context:[],missing_information:[{topic:'Intended domain',question:'Which meaning of context model do you intend?',essential:true}]}}:{})};
  if(legacy){delete retrieval.shared_plan;delete retrieval.resource_queries;delete retrieval.context_expansion;retrieval.policy='scout-agentic-retrieval-v6';}
  return{id:'shared-ai-turn',action:'discover',agentic:true,routing:'auto',message:question,status:'SUCCEEDED',created_at:stamp,completed_at:stamp,providers:['openalex'],run_ids:clarification?[]:['shared-ai-paper'],sources:clarification?[]:[source],warnings:[],response:clarification?retrieval.clarification_question!:'Authored saved research.',usage:{research_attempts:clarification?0:1,model_http_attempts:1,model_cost_usd:0},plan:{routing:'bounded_agentic_retrieval',generation:'disabled'},retrieval};
}
async function install(page:Page,turn=research()){
 const old=await installFixtureApi(page);const parent:Conversation={id:'shared-ai-parent',title:question,status:'IDLE',revision:1,cursor:'shared:1',created_at:stamp,updated_at:stamp,providers:['openalex'],filters:{},turns:[turn]};const writes:{path:string;body:Record<string,unknown>}[]=[];
 await page.route('**/api/config',r=>r.fulfill({json:{generation:{enabled:false},retrieval:{enabled:true,ready:true,status:'ready'}}}));
 await page.route('**/api/conversations',r=>r.fulfill({json:{conversations:[parent]}}));
 await page.route('**/api/conversations/shared-ai-parent',r=>r.fulfill({json:parent}));
 await page.route('**/api/research-runs/shared-ai-paper/snapshot',r=>r.fulfill({json:{...initialSnapshot(),id:'shared-ai-paper',status:'succeeded',entities:[source]}}));
 await page.route('**/api/conversations/shared-ai-parent/turns',r=>{writes.push({path:new URL(r.request().url()).pathname,body:r.request().postDataJSON()});return r.fulfill({status:202,json:{...parent,status:'RUNNING',revision:2,turns:[turn,{...turn,id:'clarification-answer',status:'RUNNING',message:r.request().postDataJSON().message,retrieval:{status:'planning'},sources:[],run_ids:[]}]}})});
 return{writes,old,parent};
}

test('resource eligibility requires a real shared plan, explicit/inferred domain and useful keywords; essential gaps block retrieval',()=>{
 const r=research().retrieval!;expect(hasResourceQuery(r,'datasets')).toBe(true);expect(hasResourceQuery(r,'repos')).toBe(true);
 for(const patch of[{shared_plan:undefined},{context_expansion:undefined},{needs_clarification:true},{resource_queries:null},{context_expansion:{...r.context_expansion!,domain_basis:'ambiguous' as const}},{context_expansion:{...r.context_expansion!,missing_information:[{topic:'Domain',question:'Which domain?',essential:true}]}}])expect(hasResourceQuery({...r,...patch},'datasets')).toBe(false);
 expect(hasResourceQuery({...r,resource_queries:{...r.resource_queries!,repos:{...r.resource_queries!.repos,query_terms:[' ']}}},'repos')).toBe(false);
});

test('AI plan exposes canonical intent, four distinct resource queries and missing information without dispatching work',async({page})=>{
 const api=await install(page);await page.goto('/app?search=shared-ai-parent');await openSearchInformation(page,'Query and focus');const plan=page.getByTestId('shared-ai-query-plan');await expect(plan).toContainText('1 resource plans');await expect(plan).toContainText('Inferred by AI');await expect(plan.getByTestId('ai-missing-information')).toContainText('Optional detail');
 for(const [lane,label] of [['papers','Papers'],['videos','Videos'],['datasets','Data'],['repos','Repos']] as const){await page.getByRole('tab',{name:new RegExp('^'+label)}).click();const row=plan.getByTestId('ai-resource-plan-'+lane);await row.locator('summary').click();await expect(row).toContainText(lane+' retrieval evaluation');await expect(plan.locator('[data-testid^=ai-resource-plan-]')).toHaveCount(1);}
 await page.getByRole('tab',{name:/^Papers/}).click();
 await plan.getByText('Context inferred by AI (1)',{exact:true}).click();await expect(plan).toContainText('Planning assumptions, not verified source evidence.');
 await expect(page.getByTestId('trace-retrieval-query')).toHaveText('context selection grounded language model generation');await expect(page.getByTestId('trace-retrieval-query')).not.toContainText('PROVIDER_SPECIFIC_QUERY');
 await page.getByRole('tab',{name:'Provider queries',exact:true}).click();await expect(page.getByTestId('hybrid-provider-queries')).toContainText('PROVIDER_SPECIFIC_QUERY');expect(api.writes).toEqual([]);expect(api.old.state.starts).toBe(0);
});

test('Data and Repos preview their own planned AI queries and preserve no-fetch-on-open behavior',async({page})=>{
 const api=await install(page);await page.goto('/app?search=shared-ai-parent');await page.getByRole('tab',{name:/^Data/}).click();await expect(page.getByRole('button',{name:'Find matching datasets',exact:true})).toBeEnabled();await openSearchInformation(page,'Query and focus');const data=page.getByTestId('ai-resource-plan-datasets');await data.locator('summary').click();await expect(data).toContainText('datasets retrieval evaluation');await expect(data).not.toContainText('PROVIDER_SPECIFIC_QUERY');
 await page.getByRole('tab',{name:/^Repos/}).click();await expect(page.getByRole('button',{name:'Find matching repos',exact:true})).toBeEnabled();const repo=page.getByTestId('ai-resource-plan-repos');await repo.locator('summary').click();await expect(repo).toContainText('repos retrieval evaluation');expect(api.writes).toEqual([]);expect(api.old.state.starts).toBe(0);
});

test('legacy AI history stays readable but needs a new shared plan before new dataset or repo acquisition',async({page})=>{
 const api=await install(page,research(false,true));await page.goto('/app?search=shared-ai-parent');await expect(page.getByTestId('search-result-card')).toHaveCount(1);await page.getByRole('tab',{name:/^Data/}).click();await expect(page.getByTestId('datasets-ai-plan-required')).toContainText('run this question again in Search');await expect(page.getByRole('button',{name:'Find matching datasets',exact:true})).toBeDisabled();await page.getByRole('tab',{name:/^Repos/}).click();await expect(page.getByTestId('repos-ai-plan-required')).toBeVisible();await expect(page.getByRole('button',{name:'Find matching repos',exact:true})).toBeDisabled();await expect(page.getByTestId('resource-query-preview-repos')).toHaveCount(0);expect(api.writes).toEqual([]);
});

test('main Search shows the actual clarification and continues in the same Exploration conversation on explicit answer',async({page})=>{
 const api=await install(page,research(true));await page.goto('/app?search=shared-ai-parent');const notice=page.getByTestId('search-clarification');await expect(notice).toContainText('Do you mean context for language models or a statistical context model?');await expect(page.getByTestId('search-result-card')).toHaveCount(0);await page.getByRole('tab',{name:/^Data/}).click();await expect(page.getByRole('button',{name:'Find matching datasets',exact:true})).toBeDisabled();expect(api.writes).toEqual([]);
 await notice.getByRole('button',{name:'Answer in Exploration',exact:true}).click();await expect(page).toHaveURL(/conversation=shared-ai-parent/);const input=page.getByRole('textbox',{name:'Exploration message',exact:true});await expect(input).toBeVisible();expect(api.writes).toEqual([]);await input.fill('I mean context supplied to large language models.');await page.getByRole('button',{name:'Explore',exact:true}).click();await expect.poll(()=>api.writes.length).toBe(1);expect(api.writes[0].body).toMatchObject({agentic:true,message:'I mean context supplied to large language models.'});
});
