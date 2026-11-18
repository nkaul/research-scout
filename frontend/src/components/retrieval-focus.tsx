'use client';

import { materialTone as termTone } from '@/lib/material-colors';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { humanStatus, isActive, providerLabel } from '@/lib/api';
import type { ExplorationTurn, ResourceLane, RetrievalState } from '@/lib/conversations';
import Icon from './icon';
import AiQueryPlan from './ai-query-plan';
import SearchRefinement, { retrievalStatus } from './search-refinement';
import styles from './retrieval-focus.module.css';

type Props = {
  turn?: ExplorationTurn;
  draftQuestion?: string;
  actions?: ReactNode;
  restoring?: boolean;
  onRestore?: () => void;
  /** Detailed body inside the single main-search information pane. */
  embedded?: boolean;
  lane?: ResourceLane;
  providerContent?: ReactNode;
};
type TraceTab = 'overview' | 'llm' | 'providers';
const tabs: { id: TraceTab; label: string }[] = [{ id: 'overview', label: 'Query overview' }, { id: 'llm', label: 'LLM input' }, { id: 'providers', label: 'Provider queries' }];
type TermKind = 'topic' | 'keyword' | 'domain';

function TermChip({ value, kind }: { value: string; kind: TermKind }) {
  const label = kind === 'keyword' ? 'Search keyword' : kind === 'domain' ? 'Recorded domain' : 'Planner tag';
  return <span className={`${styles.chip}${kind === 'keyword' ? ` ${styles.keyword}` : ''}`} data-chip-kind={kind} data-chip-tone={termTone(value)} title={`${label}: ${value}`}>{value}</span>;
}

function ProviderBadge({ provider }: { provider: string }) {
  return <span className={styles.providerBadge} data-chip-kind="provider" data-provider={provider}>{providerLabel(provider)}</span>;
}

/** Render the saved value itself. Source/model text is data, never markup. */
function SavedJson({ value, testId }: { value: unknown; testId?: string }) {
  const text = useMemo(() => {
    try { return JSON.stringify(value, null, 2) ?? 'This saved record does not include a request body.'; }
    catch { return 'This saved request body could not be displayed.'; }
  }, [value]);
  return <pre className={styles.json} data-testid={testId}>{text}</pre>;
}

function compacted(turn: ExplorationTurn) {
  return !!turn.history_compacted || !!turn.retrieval?.llm_requests?.some(item => item.body_compacted);
}

function isDirectSearch(turn: ExplorationTurn) {
  return !compacted(turn) && (turn.action === 'discover' ? turn.agentic === false : ['lookup', 'access'].includes(turn.action)) && !turn.retrieval && !turn.saved_result_counts?.llm_requests && turn.usage.model_http_attempts === 0;
}

function semanticExecution(value: string) {
  if (value === 'provider_native') return 'Provider-native semantic search';
  if (value === 'local_candidate_pool') return 'Local semantic reranking';
  return humanStatus(value);
}

function RestoreDetails({ turn, restoring, onRestore }: { turn: ExplorationTurn; restoring: boolean; onRestore?: () => void }) {
  if (!compacted(turn)) return null;
  return <div className={styles.restore} data-testid="query-trace-restore">
    <p>Some request records are collapsed in this saved history. Full saved details can be read without repeating research or model calls.</p>
    {onRestore ? <button type="button" className={styles.restoreButton} disabled={restoring} aria-busy={restoring} onClick={onRestore}><Icon name={restoring ? 'spinner' : 'database'} />{restoring ? 'Opening saved query details…' : 'Open saved query details'}</button> : <p>Full request bodies are not available in this view.</p>}
  </div>;
}

function LlmRequests({ turn }: { turn: ExplorationTurn }) {
  const records = turn.retrieval?.llm_requests || [];
  const direct = isDirectSearch(turn);
  const awaiting = turn.retrieval?.status === 'planning' && isActive(turn.status);
  return <div className={styles.sectionStack} data-testid="hybrid-llm-requests">
    <div><h3 className={styles.smallHeading}>Saved question</h3><p className={styles.question}>{turn.message}</p></div>
    {!records.length ? <p className={styles.empty}>{compacted(turn) ? 'LLM request bodies are collapsed in this saved history.' : direct ? 'No LLM request was made for this direct search.' : awaiting ? 'The planning request has not been recorded yet.' : 'No LLM request body is available in this saved record.'}</p> : <>
      <p className={styles.explanation}>Exact saved request bodies, including instructions and input. Each record keeps its planning or review status; a prepared request is not proof of a received response.</p>
      {records.map((record, index) => <article className={styles.requestCard} key={`${record.step}:${index}`} aria-label={`${humanStatus(record.purpose)} LLM request ${index + 1}`}>
        <header className={styles.recordHeading}><h3>{humanStatus(record.purpose)}{record.step && <span> · {record.step}</span>}</h3><span className={styles.recordStatus} data-request-state={record.status}>{humanStatus(record.status)}</span></header>
        {record.model && <p className={styles.recordMeta}>Recorded model: {record.model}</p>}
        {record.body_compacted ? <p className={styles.empty}>This request body is collapsed. Open the saved query details to read its recorded input.</p> : <SavedJson value={record.body} testId="saved-llm-request-body" />}
      </article>)}
    </>}
  </div>;
}

function ProviderQueries({ retrieval }: { retrieval?: RetrievalState | null }) {
  const planned = retrieval?.provider_queries || [];
  const executed = retrieval?.source_requests || [];
  return <div className={styles.sectionStack} data-testid="hybrid-provider-queries">
    <section aria-label="Planned provider queries"><h3 className={styles.smallHeading}>Planned queries</h3><p className={styles.explanation}>The recorded plan is separate from requests actually captured by a provider service.</p>
      {planned.length ? <div className={styles.providerGrid}>{planned.map((record, index) => <article className={styles.providerCard} key={`${record.provider}:${index}`} aria-label={`${providerLabel(record.provider)} planned query`}><h4><ProviderBadge provider={record.provider} /></h4><dl className={styles.queryFields}><div><dt>Lexical query</dt><dd>{record.lexical_query}</dd></div><div><dt>Semantic query</dt><dd>{record.semantic_query}</dd></div></dl>{record.rationale && <p className={styles.recordMeta}>{record.rationale}</p>}</article>)}</div> : <p className={styles.empty}>No per-provider query plan is included in this record.</p>}
    </section>
    <section aria-label="Provider execution records"><h3 className={styles.smallHeading}>Provider execution records</h3><p className={styles.explanation}>Arguments below are the saved <code>executed_arguments</code>, with their recorded status. Saved cache responses remain labeled separately.</p>
      {executed.length ? <div className={styles.sectionStack}>{executed.map((record, index) => <details className={styles.execution} key={`${record.run_id}:${record.round}:${record.branch}:${index}`} data-testid="saved-provider-request"><summary><span><ProviderBadge provider={record.provider} /> · round {record.round} · {humanStatus(record.branch)}</span><Icon name="chevron" /></summary><div className={styles.executionBody}><div className={styles.recordFacts}>
        {record.transport && <span>{record.transport}</span>}{record.tool && <span>Tool: {record.tool}</span>}{record.status && <span>Status: {humanStatus(record.status)}</span>}{record.cache_hit && <span className={styles.cache}>Saved cache response</span>}
        {record.semantic_execution && <span>{semanticExecution(record.semantic_execution)}</span>}
      </div>{record.query_input && <div className={styles.queryInput}><span>Recorded query input</span><p>{record.query_input}</p></div>}<SavedJson value={record.executed_arguments} testId="saved-provider-arguments" />{record.query_policy !== undefined && <details className={styles.policy}><summary>Recorded query policy</summary><SavedJson value={record.query_policy} /></details>}</div></details>)}</div> : <p className={styles.empty}>No provider execution arguments are included in this record. A planned query alone does not prove it was dispatched.</p>}
    </section>
    <p className={styles.explanation}>Unpaywall resolves discovered DOIs for access links; it is not a topic-search endpoint. Provider records remain separately attributable.</p>
  </div>;
}

function Overview({ turn, lane }: { turn: ExplorationTurn; lane?: ResourceLane }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const retrieval = turn.retrieval;
  return <div className={styles.sectionStack}>
    <div className={styles.overviewGrid}><section><h3 className={styles.smallHeading}>{lane && isDirectSearch(turn) ? `Original question and saved direct ${{ papers: 'Papers', videos: 'Videos', datasets: 'Data', repos: 'Repos' }[lane]} query` : 'Your original question'}</h3><p className={styles.question} data-testid="trace-original-question">{turn.message}</p></section><section className={styles.rewrite}><h3 className={styles.smallHeading}>{retrieval?.lexical_query ? 'Recorded retrieval query' : isDirectSearch(turn) ? 'Direct search' : 'Recorded plan'}</h3>{retrieval?.lexical_query ? <p className={styles.question} data-testid="trace-retrieval-query">{retrieval.lexical_query}</p> : <p className={styles.explanation}>{isDirectSearch(turn) ? 'Your original question was used for direct discovery. Inspect provider execution records for any saved adapter arguments.' : retrieval?.provider_queries?.length ? 'This plan records a separate query for each provider. Open Provider queries to inspect them.' : isActive(turn.status) ? 'The query plan is not available yet. Sources can appear while the search continues.' : 'A rewritten query is not included in this saved record.'}</p>}</section></div>
    {retrieval?.semantic_query && <section><h3 className={styles.smallHeading}>Recorded semantic query</h3><p className={styles.queryText}>{retrieval.semantic_query}</p></section>}
    {(retrieval?.intent || retrieval?.domain) && <section><div className={styles.intentHeadingRow}><h3 className={`${styles.smallHeading} ${styles.intentHeading}`}>{retrieval.intent ? 'Interpreted intent' : 'Recorded domain'}</h3>{retrieval.domain && <TermChip value={retrieval.domain} kind="domain" />}</div>{retrieval.intent && <p className={styles.queryText}>{retrieval.intent}</p>}</section>}
    {!!retrieval?.tags?.length && <div className={styles.terms} aria-label="Planner tags"><span>Planner tags</span>{retrieval.tags.map((tag, index) => <TermChip value={tag} kind="topic" key={`${tag}:${index}`} />)}</div>}
    {!!retrieval?.keywords?.length && <div className={styles.terms} aria-label="Extracted search keywords"><span>Keywords</span>{retrieval.keywords.map((keyword, index) => <TermChip value={keyword} kind="keyword" key={`${keyword}:${index}`} />)}</div>}
    {retrieval && <AiQueryPlan retrieval={lane ? { ...retrieval, resource_queries: retrieval.resource_queries ? Object.fromEntries(Object.entries(retrieval.resource_queries).filter(([key]) => key === lane)) as RetrievalState['resource_queries'] : retrieval.resource_queries } : retrieval} />}
    {retrieval && <details className={styles.review} onToggle={event => setReviewOpen(event.currentTarget.open)}><summary>Relevance review and full saved plan<Icon name="chevron" /></summary>{reviewOpen && (compacted(turn) ? <div className={styles.sectionStack}><p className={styles.explanation}>Open the saved query details above to inspect the full plan and relevance review. Collapsed request placeholders are not complete prompt bodies.</p>{retrieval.warnings?.map((warning, index) => <p className={styles.explanation} key={index}>{warning}</p>)}</div> : <SearchRefinement retrieval={retrieval} />)}</details>}
  </div>;
}

/** Saved query transparency only; opening it never dispatches a model/provider call. */
export default function RetrievalFocus({ turn, draftQuestion, actions, restoring = false, onRestore, embedded = false, lane, providerContent }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TraceTab>('overview');
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const retrieval = turn?.retrieval;
  const topics = retrieval?.tags?.length ? retrieval.tags : retrieval?.domain ? [retrieval.domain] : [];
  const direct = !!turn && isDirectSearch(turn);
  const changedDraft = !!turn && draftQuestion !== undefined && draftQuestion !== turn.message;
  const query = retrieval?.lexical_query;
  const label = retrieval ? retrievalStatus(retrieval.status) : direct ? turn.action === 'lookup' ? 'DOI lookup' : 'Direct search' : turn ? 'Saved query' : 'Ready to search';
  useEffect(() => { setOpen(false); setActiveTab('overview'); }, [turn?.id]);

  const traceBody = turn && <div className={styles.panel} aria-label="Saved query trace"><header className={styles.panelHeading}><h2>From question to source query</h2><span>{label}{retrieval?.round ? ` · round ${retrieval.round}${retrieval.max_rounds ? ` of ${retrieval.max_rounds}` : ''}` : ''}</span></header>
    <div className={styles.tablist} role="tablist" aria-label="Query trace sections" onKeyDown={event => {
      const current = tabs.findIndex(tab => tab.id === activeTab);
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      setActiveTab(tabs[next].id); tabButtons.current[next]?.focus();
    }}>{tabs.map((tab, index) => <button key={tab.id} ref={node => { tabButtons.current[index] = node; }} type="button" id={`${id}-tab-${tab.id}`} role="tab" aria-selected={activeTab === tab.id} aria-controls={`${id}-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</div>
    <div className={styles.traceBody}>
      <RestoreDetails turn={turn} restoring={restoring} onRestore={onRestore} />
      <div role="tabpanel" id={`${id}-panel-overview`} aria-labelledby={`${id}-tab-overview`} hidden={activeTab !== 'overview'}>{(embedded || open) && activeTab === 'overview' && <Overview key={turn.id} turn={turn} lane={lane} />}</div>
      <div role="tabpanel" id={`${id}-panel-llm`} aria-labelledby={`${id}-tab-llm`} hidden={activeTab !== 'llm'}>{(embedded || open) && activeTab === 'llm' && <LlmRequests turn={turn} />}</div>
      <div role="tabpanel" id={`${id}-panel-providers`} aria-labelledby={`${id}-tab-providers`} hidden={activeTab !== 'providers'}>{(embedded || open) && activeTab === 'providers' && (providerContent || <ProviderQueries retrieval={lane ? { ...retrieval, status: retrieval?.status || '', provider_queries: retrieval?.provider_queries?.filter(item => lane === 'videos' ? item.provider === 'youtube' : item.provider !== 'youtube'), source_requests: retrieval?.source_requests?.filter(item => lane === 'videos' ? item.provider === 'youtube' : item.provider !== 'youtube') } : retrieval} />)}</div>
    </div>
  </div>;

  if (embedded) return <section className={styles.root} aria-label="Saved query trace" data-testid="search-query-review">{traceBody || <p className={styles.startHint}>Query details appear after a search is accepted.</p>}{changedDraft && <p className={styles.draftNotice} data-testid="query-trace-draft-notice">Your draft has changed. This trace still belongs to the saved question; Search starts a new query.</p>}</section>;

  return <section className={styles.root} aria-label="Retrieval focus and query trace" data-testid="retrieval-focus">
    <div className={styles.focusRow}><span className={styles.focusLabel}><Icon name="sliders" />Retrieval focus</span><div className={styles.topics}>
      {topics.length ? <>{topics.slice(0, 3).map((tag, index) => <TermChip value={tag} kind={retrieval?.tags?.length ? 'topic' : 'domain'} key={`${tag}:${index}`} />)}{topics.length > 3 && <button type="button" className={styles.moreTags} aria-label={`Show all ${topics.length} planner tags`} onClick={() => { setActiveTab('overview'); setOpen(true); }}>+{topics.length - 3}</button>}</> : <span className={styles.context}>{label}</span>}
    </div>{actions && <div className={styles.actions}>{actions}</div>}</div>
    {!turn && <p className={styles.startHint}>Query details appear after a search is accepted.</p>}
    {turn && <details className={styles.disclosure} open={open} onToggle={event => setOpen(event.currentTarget.open)} data-testid="search-query-review"><summary className={styles.summary} aria-label="Query trace" title={direct ? 'View the saved direct question and recorded provider activity. No model planning was used.' : 'View the saved intent, resource plans, keywords, missing information and exact requests'}><span className={styles.querySummary}><span className={styles.summaryLabel}>{query ? 'Retrieval query' : 'Saved question'}</span><span className={styles.summaryQuery} title={query || turn.message}>{query || turn.message}</span></span><span className={styles.traceToggle}><Icon name="layers" /><span className={styles.desktopTraceLabel}>{direct ? 'Direct query trace' : 'AI plan & query trace'}</span><span className={styles.mobileTraceLabel}>{direct ? 'Query trace' : 'AI plan'}</span><Icon name="chevron" /></span></summary>
      {traceBody}
    </details>}
    {changedDraft && <p className={styles.draftNotice} data-testid="query-trace-draft-notice">Your draft has changed. This trace still belongs to the saved question; Search starts a new query.</p>}
  </section>;
}
