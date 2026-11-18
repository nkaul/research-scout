'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ApiError, humanStatus, isActive, request } from '@/lib/api';
import type { ExplorationTurn } from '@/lib/conversations';
import { datasetProviderLabel, datasetRecords, datasetUrl, type DatasetProvider, type DatasetRecord, type DatasetSearch, type DatasetSearchSummary } from '@/lib/datasets';
import { formatLoadTime } from '@/lib/load-timing';
import Icon from './icon';
import { hasResourceQuery, isDirectResourceTurn } from '@/lib/ai-query-plan';
import { ResourceQueryPreview } from './ai-query-plan';
import { materialTone } from '@/lib/material-colors';
import Tooltip from './tooltip';
import SearchTimeline from './search-timeline';
import styles from './dataset-results.module.css';
import type { ResourceTabActivity } from './resource-tab-activity';
import type { ResourceInformationUpdate } from '@/lib/search-information';
import ReadableContent from './readable-content';

export default function DatasetResults({ conversationId, turn, historical, filter, onFilterChange, onCountChange, onActivityChange, onInformationChange }: {
  conversationId: string | null;
  turn?: ExplorationTurn;
  historical: DatasetRecord[];
  filter: string;
  onFilterChange: (value: string) => void;
  onCountChange: (count: number, scope: { conversationId: string | null; turnId: string | null }) => void;
  onActivityChange?: (activity: ResourceTabActivity) => void;
  onInformationChange?: (information: ResourceInformationUpdate) => void;
}) {
  const turnId = turn?.id;
  const central = turn?.modality_limits != null;
  const job = turn?.resource_jobs?.datasets;
  const linkedSearchId = job?.search_id || null;
  const scope = `${conversationId || ''}:${turnId || ''}`;
  const lifecycle = `${scope}:${central ? linkedSearchId || 'unlinked' : 'legacy'}`;
  const root = useRef<HTMLElement | null>(null);
  const epoch = useRef(0), mounted = useRef(false), latest = useRef<DatasetSearch | null>(null), sending = useRef(false);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const onCount = useRef(onCountChange); onCount.current = onCountChange;
  const onActivity = useRef(onActivityChange); onActivity.current = onActivityChange;
  const onInformation = useRef(onInformationChange); onInformation.current = onInformationChange;
  const sharedInformation = !!onInformationChange;
  const [saved, setSaved] = useState<DatasetSearch | null>(null);
  const [providers, setProviders] = useState<DatasetProvider[]>([]);
  const [loading, setLoading] = useState(!!conversationId && !!turnId && (!central || !!linkedSearchId)), [starting, setStarting] = useState(false), [stopping, setStopping] = useState(false);
  const [error, setError] = useState(''), [connection, setConnection] = useState('saved'), [streamVersion, setStreamVersion] = useState(0);
  const [stateLifecycle, setStateLifecycle] = useState(lifecycle);
  const scopedError = stateLifecycle === lifecycle ? error : '';
  const [selected, setSelected] = useState<string | null>(null), [readerTab, setReaderTab] = useState<'overview' | 'metadata'>('overview');
  const [wide, setWide] = useState(false);
  const [showUnassessed, setShowUnassessed] = useState(false);
  const [limit, setLimit] = useState(10), [clock, setClock] = useState<number | undefined>();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = saved?.context.conversation_id === conversationId && saved.context.turn_id === turnId && (!central || !!linkedSearchId && saved.id === linkedSearchId) ? saved : null;
  const running = !!current && isActive(current.status) || central && !!job && isActive(job.status);
  const records = useMemo(() => datasetRecords(current?.records || [], historical), [current?.records, historical]);
  const needle = filter.trim().toLowerCase();
  const candidateCount = records.filter(record => record.match.status === 'candidate').length;
  const matches = records.filter(record => record.historical || record.match.status === 'candidate');
  const unassessed = records.length - matches.length;
  const visible = (showUnassessed ? records : matches).filter(record => `${record.title || ''} ${record.description || ''} ${record.tags.join(' ')} ${record.tasks.join(' ')} ${record.authors.join(' ')} ${record.publisher || ''} ${record.doi || ''}`.toLowerCase().includes(needle));
  const active = visible.find(record => record.dataset_id === selected) || (selected === null && wide ? visible[0] : undefined);
  const refined = !!turn?.agentic && turn.action === 'discover' && ['retrieving', 'reviewing', 'refining', 'completed'].includes(turn.retrieval?.status || '') && !!turn.retrieval?.intent && (turn.retrieval.lexical_query?.trim().length || 0) >= 3;
  const resourceReady = hasResourceQuery(turn?.retrieval, 'datasets');
  const direct = isDirectResourceTurn(turn);
  const directTooLong = direct && (turn?.message.length || 0) > 400;
  const canFind = !central && !!conversationId && !!turnId && (direct && !directTooLong || refined && resourceReady) && !loading && !starting && !running;
  const context = current?.context;
  const centralEmptyTitle = turn?.modality_limits?.datasets === 0 ? 'Data was turned off' : job && ['FAILED', 'BLOCKED', 'INTERRUPTED', 'CANCELLED'].includes(job.status.toUpperCase()) ? 'Data search needs attention' : 'No catalog records in this search';
  const centralReason = job?.reason || job?.error?.message || (turn?.modality_limits?.datasets === 0 ? 'Enable Data in Limits and start a new main Search.' : 'Review the saved main-search outcome and catalog coverage. Opening this tab reads saved state and does not launch another retrieval.');
  const duration = current ? Date.parse(current.completed_at || '') - Date.parse(current.created_at) : NaN;
  const elapsed = running && clock ? clock - Date.parse(current?.created_at || turn?.created_at || '') : duration;

  useEffect(() => {
    const media = window.matchMedia('(min-width: 901px)'); const update = () => setWide(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    try { const value = Number(localStorage.getItem('research-scout:dataset-limit:v1')); if (Number.isInteger(value) && value >= 1 && value <= 20) setLimit(value); } catch { /* The visible value remains usable. */ }
  }, []);
  useEffect(() => { onCount.current(records.length, { conversationId, turnId: turnId || null }); }, [records.length, conversationId, turnId, loading]);
  useEffect(() => { onActivity.current?.({ conversationId, turnId: turnId || null, reading: loading, working: starting || running }); }, [conversationId, turnId, loading, starting, running]);
  useEffect(() => () => { onActivity.current?.({ conversationId, turnId: turnId || null, reading: false, working: false }); }, [conversationId, turnId]);
  useEffect(() => {
    const ready = stateLifecycle === lifecycle;
    onInformation.current?.({ lane: 'datasets', conversationId, turnId: turnId || null, searchId: current?.id || linkedSearchId, revision: current?.revision ?? null, snapshot: current, reading: ready ? loading : !!conversationId && !!turnId && (!central || !!linkedSearchId), working: ready ? starting || running : central && !!job && isActive(job.status), error: scopedError, connection: ready ? connection : 'saved' });
  }, [conversationId, turnId, current, linkedSearchId, loading, starting, running, scopedError, connection, stateLifecycle, lifecycle, central, job]);
  useEffect(() => () => {
    onInformation.current?.({ lane: 'datasets', conversationId, turnId: turnId || null, searchId: null, revision: null, snapshot: null, reading: false, working: false, error: '', connection: 'saved' });
  }, [conversationId, turnId]);
  useEffect(() => {
    if (!running || sharedInformation) return;
    setClock(Date.now()); const timer = setInterval(() => setClock(Date.now()), 250); return () => clearInterval(timer);
  }, [running, current?.id, sharedInformation]);

  const accept = useCallback((incoming: DatasetSearch) => {
    if (!mounted.current || incoming.context?.conversation_id !== conversationId || incoming.context?.turn_id !== turnId) return;
    if (latest.current?.id === incoming.id && latest.current.revision > incoming.revision) return;
    latest.current = incoming; setSaved(incoming);
  }, [conversationId, turnId]);

  const restore = useCallback(async (ticket: number) => {
    if (!conversationId || !turnId) return;
    if (central) {
      if (!linkedSearchId) return;
      const snapshot = await request<DatasetSearch>(`/dataset-searches/${encodeURIComponent(linkedSearchId)}`);
      if (snapshot.context?.conversation_id !== conversationId || snapshot.context.turn_id !== turnId) throw new Error('The linked dataset search belongs to a different saved question.');
      if (mounted.current && ticket === epoch.current) accept(snapshot);
      return;
    }
    const result = await request<{ searches?: DatasetSearchSummary[]; dataset_searches?: DatasetSearchSummary[] }>(`/dataset-searches?conversation_id=${encodeURIComponent(conversationId)}&turn_id=${encodeURIComponent(turnId)}`);
    if (!mounted.current || ticket !== epoch.current) return;
    const summaries = (result.searches || result.dataset_searches || []).filter(item => item.context.conversation_id === conversationId && item.context.turn_id === turnId);
    const target = summaries.sort((a, b) => Number(isActive(b.status)) - Number(isActive(a.status)) || b.created_at.localeCompare(a.created_at))[0];
    if (!target) return;
    const snapshot = await request<DatasetSearch>(`/dataset-searches/${encodeURIComponent(target.id)}`);
    if (mounted.current && ticket === epoch.current) accept(snapshot);
  }, [conversationId, turnId, accept, central, linkedSearchId]);

  useEffect(() => {
    mounted.current = true; const ticket = ++epoch.current;
    latest.current = null; setStateLifecycle(lifecycle); setSaved(null); setSelected(null); setReaderTab('overview'); setShowUnassessed(false); setError(''); setConnection('saved'); setStarting(false); setStopping(false); sending.current = false; pending.current = null;
    const shouldRead = !!conversationId && !!turnId && (!central || !!linkedSearchId);
    setLoading(shouldRead);
    if (shouldRead) void Promise.allSettled([
      restore(ticket),
      request<{ providers: DatasetProvider[] }>('/dataset-providers').then(result => { if (mounted.current && ticket === epoch.current) setProviders(result.providers); }),
    ]).then(results => { const failed = results.find(result => result.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason; }).catch(failure => { if (mounted.current && ticket === epoch.current) setError(`Saved dataset results could not be opened. ${failure instanceof Error ? failure.message : 'Try opening them again.'}`); }).finally(() => { if (mounted.current && ticket === epoch.current) setLoading(false); });
    return () => { mounted.current = false; epoch.current++; clearTimeout(hoverTimer.current); };
  }, [scope, conversationId, turnId, restore, lifecycle]);

  useEffect(() => {
    if (!current?.id || !running) return;
    const id = current.id, ticket = epoch.current;
    let disposed = false, poll: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => { const snapshot = await request<DatasetSearch>(`/dataset-searches/${encodeURIComponent(id)}`); if (!disposed && ticket === epoch.current && latest.current?.id === id) accept(snapshot); };
    const reconnect = () => { setConnection('reconnecting'); if (!poll) poll = setInterval(() => void refresh().catch(() => undefined), 3000); };
    const stream = new EventSource(`/api/dataset-searches/${encodeURIComponent(id)}/events${current.cursor ? `?cursor=${encodeURIComponent(current.cursor)}` : ''}`);
    setConnection('connecting');
    stream.onopen = () => { if (!disposed) { setConnection('connected'); if (poll) clearInterval(poll); poll = undefined; } };
    stream.addEventListener('state', event => {
      if (disposed || ticket !== epoch.current || latest.current?.id !== id) return;
      try { const message = JSON.parse((event as MessageEvent<string>).data); const snapshot = message.snapshot || message; if (snapshot.id === id) { accept(snapshot); setConnection('connected'); } } catch { reconnect(); }
    });
    stream.addEventListener('resync.required', () => { stream.close(); reconnect(); void refresh().then(() => { if (!disposed) setStreamVersion(value => value + 1); }).catch(() => undefined); });
    stream.onerror = () => { if (!disposed) reconnect(); };
    return () => { disposed = true; stream.close(); if (poll) clearInterval(poll); };
  }, [current?.id, running, streamVersion, accept]);

  async function find() {
    if (!canFind || sending.current) return;
    const ticket = epoch.current;
    const signature = JSON.stringify({ conversation_id: conversationId, turn_id: turnId, limit });
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    sending.current = true; setStarting(true); setError('');
    try {
      const result = await request<DatasetSearch>('/dataset-searches', { method: 'POST', body: JSON.stringify({ conversation_id: conversationId, turn_id: turnId, limit, idempotency_key: pending.current.key }) });
      if (!mounted.current || ticket !== epoch.current) return;
      if (result.context?.conversation_id !== conversationId || result.context?.turn_id !== turnId) throw new Error('The returned dataset search belongs to a different saved question.');
      pending.current = null; setSelected(null); accept(result);
    } catch (failure) {
      if (mounted.current && ticket === epoch.current) setError(!(failure instanceof ApiError) || failure.status >= 500 ? `The response was interrupted; catalog work may already be running. Open saved datasets before retrying. ${failure instanceof Error ? failure.message : ''}` : failure.message);
    } finally { if (mounted.current && ticket === epoch.current) { sending.current = false; setStarting(false); } }
  }
  async function cancel() {
    if (!current || !running || stopping) return;
    const id = current.id, ticket = epoch.current; setStopping(true); setError('');
    try { const result = await request<DatasetSearch>(`/dataset-searches/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }); if (mounted.current && ticket === epoch.current && latest.current?.id === id) accept(result); }
    catch (failure) { if (mounted.current && ticket === epoch.current) setError(failure instanceof Error ? failure.message : 'The dataset search could not be stopped.'); }
    finally { if (mounted.current && ticket === epoch.current) setStopping(false); }
  }
  function closeReader() {
    clearTimeout(hoverTimer.current);
    root.current?.querySelector<HTMLElement>('[data-testid="dataset-card"][data-selected="true"]')?.focus();
    setSelected('__closed__');
  }
  function hover(record: DatasetRecord) {
    clearTimeout(hoverTimer.current);
    if (wide && window.matchMedia('(hover: hover) and (pointer: fine)').matches) hoverTimer.current = setTimeout(() => setSelected(record.dataset_id), 120);
  }
  function move(event: React.KeyboardEvent<HTMLElement>, index: number) {
    if (event.target !== event.currentTarget || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const cards = Array.from(event.currentTarget.parentElement?.parentElement?.querySelectorAll<HTMLElement>('[data-testid="dataset-card"]') || []);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))); cards[next]?.focus();
  }

  return <section ref={root} onKeyDown={event => { if (event.key === 'Escape' && active) { event.stopPropagation(); closeReader(); } }} className={styles.workspace} data-testid="dataset-results" data-status={current?.status || job?.status || 'empty'} aria-label="Dataset discovery">
    {!sharedInformation && <>
    <div className={styles.controls}>
      <div><strong><Icon name="database" />Data catalogs</strong><div className={styles.catalogs}>{(['hugging_face', 'datacite'] as const).map(provider => <span key={provider} className={styles.chip} data-provider={provider} title={providers.find(item => item.id === provider)?.blocked_reason || 'Metadata catalog; file access and licensing vary by dataset.'}>{datasetProviderLabel(provider)}</span>)}</div></div>
      <div className={styles.actions}>{central ? <span className={styles.chip}>Main Search · {turn?.modality_limits?.datasets === 0 ? 'Data off' : `up to ${job?.limit ?? turn?.modality_limits?.datasets} per catalog`}</span> : <><label>Per catalog<select aria-label="Datasets per catalog" value={limit} disabled={starting || running} onChange={event => { const value = Number(event.target.value); setLimit(value); try { localStorage.setItem('research-scout:dataset-limit:v1', String(value)); } catch { /* Use the visible selection. */ } }}>{Array.from({ length: 20 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label><button className="button primary" type="button" disabled={!canFind} onClick={() => void find()}><Icon name={starting ? 'spinner' : 'search'} />{starting ? 'Starting…' : current ? 'Refresh datasets' : 'Find matching datasets'}</button></>}{running && current && <button className="button" type="button" disabled={stopping} onClick={() => void cancel()}><Icon name="stop" />{stopping ? 'Stopping…' : 'Stop dataset search'}</button>}</div>
    </div>
    <p className={styles.context} data-testid="dataset-context">{context ? <><strong>{context.query_mode === 'direct' ? 'Saved direct question:' : 'Matching saved intent:'}</strong> {context.intent}<span>{[context.domain, ...context.keywords].filter((term): term is string => Boolean(term)).slice(0, 8).map(term => <span className={styles.chip} data-chip-tone={materialTone(term)} key={term}>{term}</span>)}</span>{context.query_mode === 'direct' && <span>Direct query · no model planning or AI relevance review. Literal terms support local matching only.</span>}</> : direct ? 'Uses this saved question directly, with no model planning or AI relevance review. Dataset coverage and version dates are separate from publication filters.' : refined ? <>Uses this saved question’s AI-refined intent and keywords. Dataset coverage and version dates are separate from literature publication filters.</> : turn?.agentic && isActive(turn.status) ? 'Waiting for this question’s saved AI query plan. Dataset lookup becomes available after planning.' : 'Start a topic search with AI refinement on or off to find matching datasets. Existing dataset records remain readable here.'}</p>
    <ResourceQueryPreview query={current ? current.context.resource_query : turn?.retrieval?.resource_queries?.datasets} directQuery={current ? current.context.query_mode === 'direct' ? current.context.query : undefined : direct ? turn?.message : undefined} lane="datasets" saved={!!current} />
    {central && <p className={styles.context} role="status" data-testid="dataset-main-search-status">{job?.reason || job?.error?.message || (turn?.modality_limits?.datasets === 0 ? 'Data was turned off for this saved search. Enable it in Limits and start a new main Search.' : job?.phase === 'waiting_for_plan' ? 'Waiting for the main search query plan. Catalog retrieval starts automatically when its plan is ready.' : job ? `Main Search: ${humanStatus(job.status)} · ${job.record_count} catalog records${job.candidate_count != null ? ` · ${job.candidate_count} candidate matches` : ''}.` : 'This saved main search has not recorded a Data job yet. Opening this tab does not start a new request.')}</p>}
    {directTooLong && <p className={styles.context} role="status">This saved direct question exceeds the 400-character Data query limit. Shorten it and start a new search; the query will not be silently truncated.</p>}
    {refined && !resourceReady && <p className={styles.context} role="status" data-testid="datasets-ai-plan-required">This saved query has no usable AI dataset plan. Open saved query details in Query trace if they are collapsed, or run this question again in Search to create an AI-refined plan. Saved results remain readable.</p>}
    <div className={styles.status} role="status" aria-live="polite">{loading ? <><Icon name="spinner" />Opening saved datasets…</> : starting ? <><Icon name="spinner" />Starting catalog retrieval…</> : running ? <><Icon name="spinner" />Finding datasets · {candidateCount} metadata matches</> : current ? <><Icon name={current.status.toLowerCase() === 'partial' ? 'alert' : 'check'} />{humanStatus(current.status)} · {candidateCount} metadata matches · {records.length} catalog records</> : `${records.length} saved dataset ${records.length === 1 ? 'record' : 'records'}`}{Number.isFinite(elapsed) && elapsed >= 0 && <span>{formatLoadTime(elapsed)}{running ? ' elapsed' : ''}</span>}{connection === 'reconnecting' && <span>Reconnecting to saved updates</span>}</div>
    </>}
    {sharedInformation && !central && <div className={styles.legacyActions}><label>Per catalog<select aria-label="Datasets per catalog" value={limit} disabled={starting || running} onChange={event => { const value = Number(event.target.value); setLimit(value); try { localStorage.setItem('research-scout:dataset-limit:v1', String(value)); } catch { /* Use the visible selection. */ } }}>{Array.from({ length: 20 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label><button className="button small" type="button" disabled={!canFind} onClick={() => void find()}><Icon name={starting ? 'spinner' : 'search'} />{starting ? 'Starting…' : current ? 'Refresh datasets' : 'Find matching datasets'}</button>{running && current && <button className="button small" type="button" disabled={stopping} onClick={() => void cancel()}><Icon name="stop" />{stopping ? 'Stopping…' : 'Stop dataset search'}</button>}</div>}
    {!!unassessed && <button type="button" className={styles.unassessed} aria-pressed={showUnassessed} onClick={() => setShowUnassessed(value => !value)}>{showUnassessed ? 'Hide' : 'Show'} unassessed catalog records ({unassessed})</button>}
    {scopedError && <div className={sharedInformation ? styles.recovery : styles.error} role={sharedInformation ? undefined : 'alert'}>{!sharedInformation && <p>{scopedError}</p>}<button type="button" className="text-button" onClick={() => { const ticket = epoch.current; setLoading(true); setError(''); void restore(ticket).catch(failure => { if (mounted.current && ticket === epoch.current) setError(failure instanceof Error ? failure.message : 'Saved datasets unavailable.'); }).finally(() => { if (mounted.current && ticket === epoch.current) setLoading(false); }); }}>Open saved datasets</button></div>}
    {!sharedInformation && <>
      {!!current?.warnings?.length && <details className={styles.notice}><summary>Catalog coverage notes ({current.warnings.length})</summary><ul>{current.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      {current && (!!current.timing_spans?.length || !!current.provider_activity?.length) && <details className={styles.notice}><summary>Catalog activity and timing</summary><SearchTimeline turn={current} now={clock} catalogRequests={current.provider_activity} />{current.provider_activity.map((activity, index) => <details key={`${activity.provider}:${index}`}><summary>{datasetProviderLabel(activity.provider)} · {humanStatus(activity.status)}{activity.attempts !== undefined ? ` · ${activity.attempts} attempts` : ''}</summary>{activity.query && <p data-testid="dataset-executed-query">{activity.query}</p>}{activity.executed_arguments !== undefined && <pre>{JSON.stringify(activity.executed_arguments, null, 2)}</pre>}{(activity.error || activity.message) && <p>{activity.error || activity.message}</p>}</details>)}</details>}
      {!!records.length && <label className={styles.filter}><Icon name="search" /><input type="search" value={filter} maxLength={1000} aria-label="Find in available datasets" placeholder="Filter datasets, tasks, tags and publishers" onChange={event => onFilterChange(event.target.value)} /></label>}
      {!!needle && <p className={styles.context}>Showing {visible.length} of {records.length} catalog records with this local filter. <button type="button" className="text-button" onClick={() => onFilterChange('')}>Clear dataset filter</button></p>}
    </>}
    <div className={`${styles.body}${active ? ` ${styles.withReader}` : ''}`}>
      <div><ul className={styles.list}>{visible.map((record, index) => <li key={`${scope}:${record.dataset_id}`}><article tabIndex={0} className={styles.card} data-testid="dataset-card" data-selected={active?.dataset_id === record.dataset_id} onMouseEnter={() => hover(record)} onMouseLeave={() => clearTimeout(hoverTimer.current)} onFocusCapture={event => { clearTimeout(hoverTimer.current); if (wide || event.target === event.currentTarget) setSelected(record.dataset_id); }} onKeyDown={event => move(event, index)} aria-label={record.title || record.record_id}>
        <div className={styles.title}><button type="button" onClick={() => setSelected(record.dataset_id)}>{record.title || record.record_id}</button><span className={styles.chip} data-provider={record.provider}>{datasetProviderLabel(record.provider)}</span><span className={styles.chip}>Dataset</span>{record.year !== null && <span className={styles.chip}>{record.year}</span>}{record.mode === 'fixture' && <span className={styles.fixture}>Fixture</span>}</div>
        <p className={styles.byline}>{[record.publisher, record.authors.slice(0, 3).join(', '), record.catalog_owner ? `Catalog owner: ${record.catalog_owner}` : ''].filter(Boolean).join(' · ') || 'Publisher and creators not supplied'}</p>
        <ReadableContent text={record.description} label="description" sourceKey={`${scope}:${record.dataset_id}:card`} previewPoints={2} compact sourceNotice={descriptionNotice(record)} />
        <div className={styles.tags}>{record.tasks.slice(0, 4).map(task => <span className={styles.task} data-chip-tone={materialTone(task)} key={task}>{task}</span>)}{record.license && <span className={styles.license}>{record.license}</span>}<span className={styles.access} data-access={record.access.status}>{record.access.status === 'public' ? 'Public catalog record' : `${humanStatus(record.access.status)} access`}</span></div>
        <p className={styles.match}><strong>{record.match.status === 'candidate' ? 'Metadata match' : 'Fit unassessed'}</strong> · {record.match.reason}</p>
        <div className={styles.cardActions}><Tooltip content="View this dataset's catalog metadata and applicability details"><button type="button" className="resource-icon-button" aria-label="View dataset metadata" onClick={() => setSelected(record.dataset_id)}><Icon name="eye" /></button></Tooltip>{datasetUrl(record.url) && <Tooltip content="Open the original dataset catalog; file access and terms may differ"><a className="resource-icon-button" aria-label="Open dataset source" href={datasetUrl(record.url)} target="_blank" rel="noopener noreferrer"><Icon name="external" /></a></Tooltip>}{record.doi && datasetUrl(`https://doi.org/${record.doi}`) && <Tooltip content="Open the registered dataset DOI"><a className="resource-icon-button" aria-label="Open dataset DOI" href={`https://doi.org/${encodeURI(record.doi)}`} target="_blank" rel="noopener noreferrer"><Icon name="link" /></a></Tooltip>}<span>{record.version ? `Version ${record.version}` : 'Version not supplied'}</span></div>
      </article></li>)}</ul>
      {(loading || starting || running) && <div className={styles.skeletons} data-testid="dataset-skeleton" aria-hidden="true">{[0, 1].map(item => <div key={item}><span /><span /><span /></div>)}</div>}
      {!visible.length && !loading && !starting && !running && <div className={styles.empty} data-testid="dataset-empty"><Icon name="database" /><h3>{needle ? 'No datasets match this filter' : current ? 'No candidate match established' : central ? centralEmptyTitle : 'Find data for this research question'}</h3><p>{needle ? 'Clear the local filter to view available records.' : current ? 'Review catalog coverage and the saved retrieval focus. You can inspect unassessed catalog records separately; topical matches still need suitability review.' : central ? centralReason : 'Search dataset catalogs using the saved research intent. Review the original source, license, task, version and access conditions before using a dataset.'}</p></div>}
      </div>
      {active && <DatasetReader record={active} scope={scope} tab={readerTab} onTab={setReaderTab} onClose={closeReader} />}
    </div>
    {!sharedInformation && <p className={styles.footnote}>Catalog metadata and topical fit are discovery aids. Files, schemas, population coverage and analytical suitability have not been profiled. Registered relationships are shown separately from inferred topic matches.</p>}
  </section>;
}

function descriptionNotice(record: DatasetRecord) {
  return record.description_truncated ? `Saved catalog excerpt. ${record.description_truncation_reason || 'The catalog description exceeded the saved metadata limit.'} Open the original dataset for more source context.` : undefined;
}

function DatasetReader({ record, scope, tab, onTab, onClose }: { record: DatasetRecord; scope: string; tab: 'overview' | 'metadata'; onTab: (tab: 'overview' | 'metadata') => void; onClose: () => void }) {
  const tabId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.scrollTo({ top: 0 }); }, [scope, record.dataset_id, tab]);
  return <aside className={styles.reader} aria-label="Dataset details" data-testid="dataset-reader"><header><span className={styles.chip} data-provider={record.provider}>{datasetProviderLabel(record.provider)}</span><Tooltip content="Close dataset details"><button type="button" className="resource-icon-button" aria-label="Close dataset details" onClick={onClose}><Icon name="close" /></button></Tooltip><strong title={record.title || record.record_id}>{record.title || record.record_id}</strong></header><div role="tablist" aria-label="Dataset detail views" className={styles.readerTabs} onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'metadata' : tab === 'overview' ? 'metadata' : 'overview'; onTab(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus(); }}>{(['overview', 'metadata'] as const).map(view => <button type="button" key={view} role="tab" data-view={view} id={`${tabId}-${view}`} aria-controls={`${tabId}-panel`} tabIndex={tab === view ? 0 : -1} aria-selected={tab === view} onClick={() => onTab(view)}>{view === 'overview' ? 'Overview' : 'Metadata'}</button>)}</div><div ref={panel} className={styles.readerBody} tabIndex={0} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`} aria-label={tab === 'overview' ? 'Dataset overview' : 'Dataset metadata'}>
    {tab === 'overview' ? <><h3>Description</h3><ReadableContent text={record.description} label="description" sourceKey={`${scope}:${record.dataset_id}:reader`} previewPoints={4} sourceNotice={descriptionNotice(record)} /><h3>Applicability</h3><p>{record.match.reason}</p>{!!record.match.matched_terms.length && <><h3>Matched terms</h3><div className={styles.tags}>{record.match.matched_terms.map(term => <span className={styles.task} data-chip-tone={materialTone(term)} key={term}>{term}</span>)}</div></>}{!!record.match.missing_constraints.length && <><h3>Still to verify</h3><ul>{record.match.missing_constraints.map((constraint, index) => <li key={index}>{constraint}</li>)}</ul></>}<h3>Access and reuse</h3><p>{humanStatus(record.access.status)} · {record.access.private ? 'Private resource' : record.access.gated ? 'Access approval may be required' : 'Check the original host for file access'}</p><p>License: {record.license || 'Not supplied; verify before reuse'}</p><h3>Creators and publisher</h3><p>{record.authors.join(', ') || 'Creators not supplied'}</p>{record.publisher && <p>{record.publisher}</p>}{record.catalog_owner && <p>Catalog owner: {record.catalog_owner}</p>}</> : <><dl className={styles.metadata}>{[['Catalog', datasetProviderLabel(record.provider)], ['Record ID', record.record_id], ['Catalog owner', record.catalog_owner], ['Dataset DOI', record.doi], ['Dataset version / revision', record.version], [record.year_basis === 'catalog_created' ? 'Catalog creation year' : record.year_basis === 'publication' ? 'Publication year' : 'Year reported', record.year === null ? null : String(record.year)], ['Tasks', record.tasks.join(', ')], ['Formats', record.formats.join(', ')], ['Catalog tags', record.tags.join(', ')], ['Languages', record.languages?.join(', ')], ['Declared sizes', record.sizes?.join(', ') || record.size_categories?.join(', ')], ['Reported resource dates', record.resource_dates?.map(item => JSON.stringify(item)).join('; ')], ['Declared coverage dates', record.coverage_dates?.map(item => JSON.stringify(item)).join('; ')], ['Declared geography', record.geography?.map(item => JSON.stringify(item)).join('; ')], ['Observed', record.observed_at]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not supplied'}</dd></div>)}</dl><h3>Registered relationships</h3>{record.relationships.length ? <ul>{record.relationships.map((relation, index) => <li key={index}><strong>{relation.type}</strong> · {relation.identifier}<small>Registered by the source; direction retained.</small></li>)}</ul> : <p>No registered relationships supplied. Topic similarity does not establish a paper–dataset relationship.</p>}</>}
    {datasetUrl(record.url) && <a className="button small" href={datasetUrl(record.url)} target="_blank" rel="noopener noreferrer">Open original dataset<Icon name="external" /></a>}
  </div></aside>;
}
