'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ApiError, isActive, request } from '@/lib/api';
import type { ExplorationTurn } from '@/lib/conversations';
import { repositoryRecords, repositoryUrl, repositoryRecordPath, readmeSourceUrl, readmeStatus, readmeMessage, type RepositoryProvider, type RepositoryRecord, type RepositorySearch, type RepositorySearchSummary, type RepositoryReadmeArtifact } from '@/lib/repositories';
import Icon from './icon';
import { hasResourceQuery, isDirectResourceTurn } from '@/lib/ai-query-plan';
import { materialTone } from '@/lib/material-colors';
import Tooltip from './tooltip';
import ReadableContent from './readable-content';
import RepositoryNotes, { emptyNoteDraft, type RepositoryNoteDraft } from './repo-notes';
import type { ResourceInformationUpdate } from '@/lib/search-information';
import styles from './repo-results.module.css';
import type { ResourceTabActivity } from './resource-tab-activity';

export default function RepositoryResults({ conversationId, turn, filter, onFilterChange, onCountChange, onActivityChange, onInformationChange }: {
  conversationId: string | null;
  turn?: ExplorationTurn;
  filter: string;
  onFilterChange: (value: string) => void;
  onCountChange: (count: number, scope: { conversationId: string | null; turnId: string | null }) => void;
  onActivityChange?: (activity: ResourceTabActivity) => void;
  onInformationChange?: (information: ResourceInformationUpdate) => void;
}) {
  const turnId = turn?.id;
  const central = turn?.modality_limits != null;
  const job = turn?.resource_jobs?.repos;
  const linkedSearchId = job?.search_id || null;
  const scope = `${conversationId || ''}:${turnId || ''}`;
  const root = useRef<HTMLElement | null>(null);
  const epoch = useRef(0), mounted = useRef(false), latest = useRef<RepositorySearch | null>(null), sending = useRef(false);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const onCount = useRef(onCountChange); onCount.current = onCountChange;
  const onActivity = useRef(onActivityChange); onActivity.current = onActivityChange;
  const onInformation = useRef(onInformationChange); onInformation.current = onInformationChange;
  const [saved, setSaved] = useState<RepositorySearch | null>(null);
  const [providers, setProviders] = useState<RepositoryProvider[]>([]);
  const [loading, setLoading] = useState(!!conversationId && !!turnId && (!central || !!linkedSearchId)), [starting, setStarting] = useState(false), [stopping, setStopping] = useState(false);
  const [error, setError] = useState(''), [connection, setConnection] = useState('saved'), [streamVersion, setStreamVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null), [readerTab, setReaderTab] = useState<ReaderTab>('overview');
  const [wide, setWide] = useState(false);
  const [showUnassessed, setShowUnassessed] = useState(false);
  const [limit, setLimit] = useState(10), [topicFilter, setTopicFilter] = useState('');
  const [artifacts, setArtifacts] = useState<Record<string, ArtifactState>>({});
  const artifactRequests = useRef(new Set<string>());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, RepositoryNoteDraft>>({});
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = saved?.context.conversation_id === conversationId && saved.context.turn_id === turnId && (!central || !linkedSearchId || saved.id === linkedSearchId) ? saved : null;
  const running = !!current && isActive(current.status) || central && !!job && isActive(job.status);
  const records = useMemo(() => repositoryRecords(current?.records || []), [current?.records]);
  const needle = filter.trim().toLowerCase();
  const matches = records.filter(record => record.match.status === 'candidate');
  const unassessed = records.length - matches.length;
  const visible = (showUnassessed ? records : matches).filter(record => (!topicFilter || record.topics.some(topic => topic.toLowerCase() === topicFilter.toLowerCase())) && `${record.full_name} ${record.description || ''} ${record.topics.join(' ')} ${record.language || ''} ${record.readme.evidence.map(item => item.text).join(' ')}`.toLowerCase().includes(needle));
  const commonTopics = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach(record => new Set(record.topics).forEach(topic => counts.set(topic, (counts.get(topic) || 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([topic]) => topic);
  }, [records]);
  const active = visible.find(record => record.repo_id === selected) || (selected === null && wide ? visible[0] : undefined);
  const refined = !!turn?.agentic && turn.action === 'discover' && ['retrieving', 'reviewing', 'refining', 'completed'].includes(turn.retrieval?.status || '') && !!turn.retrieval?.intent && (turn.retrieval.lexical_query?.trim().length || 0) >= 3;
  const resourceReady = hasResourceQuery(turn?.retrieval, 'repos');
  const direct = isDirectResourceTurn(turn);
  const directTooLong = direct && (turn?.message.length || 0) > 400;
  const canFind = !central && !!conversationId && !!turnId && (direct && !directTooLong || refined && resourceReady) && !loading && !starting && !running;
  const centralEmptyTitle = turn?.modality_limits?.repos === 0 ? 'Repos were turned off' : job && ['FAILED', 'BLOCKED', 'INTERRUPTED', 'CANCELLED'].includes(job.status.toUpperCase()) ? 'Repository search needs attention' : 'No repositories in this search';
  const centralReason = job?.reason || job?.error?.message || (turn?.modality_limits?.repos === 0 ? 'Enable Repos in Limits and start a new main Search.' : 'Review the saved main-search outcome and GitHub coverage. Opening this tab reads saved state and does not launch another retrieval.');
  const notesPaused = Object.entries(noteDrafts).some(([key, draft]) => key.startsWith(`${scope}:`) && (draft.editing || draft.text !== draft.savedText));
  const changeNoteDraft = useCallback((key: string, patch: Partial<RepositoryNoteDraft>) => setNoteDrafts(previous => ({ ...previous, [key]: { ...emptyNoteDraft(), ...previous[key], ...patch } })), []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 901px)'); const update = () => setWide(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    try { const value = Number(localStorage.getItem('research-scout:repo-limit:v1')); if (Number.isInteger(value) && value >= 1 && value <= 20) setLimit(value); } catch { /* The visible value remains usable. */ }
  }, []);
  useEffect(() => { onCount.current(records.length, { conversationId, turnId: turnId || null }); }, [records.length, conversationId, turnId, loading]);
  useEffect(() => { onActivity.current?.({ conversationId, turnId: turnId || null, reading: loading, working: starting || running }); }, [conversationId, turnId, loading, starting, running]);
  useEffect(() => () => { onActivity.current?.({ conversationId, turnId: turnId || null, reading: false, working: false }); }, [conversationId, turnId]);
  useEffect(() => { onInformation.current?.({ lane: 'repos', conversationId, turnId: turnId || null, searchId: current?.id || linkedSearchId, revision: current?.revision ?? null, snapshot: current, reading: loading, working: starting || running, error, connection }); }, [conversationId, turnId, linkedSearchId, current, loading, starting, running, error, connection]);
  useEffect(() => () => { onInformation.current?.({ lane: 'repos', conversationId, turnId: turnId || null, searchId: linkedSearchId, revision: null, snapshot: null, reading: false, working: false, error: '', connection: 'saved' }); }, [conversationId, turnId, linkedSearchId]);

  const accept = useCallback((incoming: RepositorySearch) => {
    if (!mounted.current || incoming.context?.conversation_id !== conversationId || incoming.context?.turn_id !== turnId) return;
    if (latest.current?.id === incoming.id && latest.current.revision > incoming.revision) return;
    latest.current = incoming; setSaved(incoming);
  }, [conversationId, turnId]);

  const restore = useCallback(async (ticket: number) => {
    if (!conversationId || !turnId) return;
    if (central) {
      if (!linkedSearchId) return;
      const snapshot = await request<RepositorySearch>(`/repo-searches/${encodeURIComponent(linkedSearchId)}`);
      if (snapshot.context?.conversation_id !== conversationId || snapshot.context.turn_id !== turnId) throw new Error('The linked repository search belongs to a different saved question.');
      if (mounted.current && ticket === epoch.current) accept(snapshot);
      return;
    }
    const result = await request<{ searches?: RepositorySearchSummary[]; repo_searches?: RepositorySearchSummary[] }>(`/repo-searches?conversation_id=${encodeURIComponent(conversationId)}&turn_id=${encodeURIComponent(turnId)}`);
    if (!mounted.current || ticket !== epoch.current) return;
    const summaries = (result.searches || result.repo_searches || []).filter(item => item.context.conversation_id === conversationId && item.context.turn_id === turnId);
    const target = summaries.sort((a, b) => Number(isActive(b.status)) - Number(isActive(a.status)) || b.created_at.localeCompare(a.created_at))[0];
    if (!target) return;
    const snapshot = await request<RepositorySearch>(`/repo-searches/${encodeURIComponent(target.id)}`);
    if (mounted.current && ticket === epoch.current) accept(snapshot);
  }, [conversationId, turnId, accept, central, linkedSearchId]);

  useEffect(() => {
    mounted.current = true; const ticket = ++epoch.current;
    latest.current = null; setSaved(null); setSelected(null); setReaderTab('overview'); setShowUnassessed(false); setTopicFilter(''); setError(''); setStarting(false); setStopping(false); sending.current = false; pending.current = null;
    const shouldRead = !!conversationId && !!turnId && (!central || !!linkedSearchId);
    setLoading(shouldRead);
    if (shouldRead) void Promise.allSettled([
      restore(ticket),
      request<{ providers: RepositoryProvider[] }>('/repo-providers').then(result => { if (mounted.current && ticket === epoch.current) setProviders(result.providers); }),
    ]).then(results => { const failed = results.find(result => result.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason; }).catch(failure => { if (mounted.current && ticket === epoch.current) setError(`Saved repo results could not be opened. ${failure instanceof Error ? failure.message : 'Try opening them again.'}`); }).finally(() => { if (mounted.current && ticket === epoch.current) setLoading(false); });
    return () => { mounted.current = false; epoch.current++; clearTimeout(hoverTimer.current); };
  }, [scope, conversationId, turnId, restore]);

  useEffect(() => {
    if (!current?.id || !running) return;
    const id = current.id, ticket = epoch.current;
    let disposed = false, poll: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => { const snapshot = await request<RepositorySearch>(`/repo-searches/${encodeURIComponent(id)}`); if (!disposed && ticket === epoch.current && latest.current?.id === id) accept(snapshot); };
    const reconnect = () => { setConnection('reconnecting'); if (!poll) poll = setInterval(() => void refresh().catch(() => undefined), 3000); };
    const stream = new EventSource(`/api/repo-searches/${encodeURIComponent(id)}/events${current.cursor ? `?cursor=${encodeURIComponent(current.cursor)}` : ''}`);
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
      const result = await request<RepositorySearch>('/repo-searches', { method: 'POST', body: JSON.stringify({ conversation_id: conversationId, turn_id: turnId, limit, idempotency_key: pending.current.key }) });
      if (!mounted.current || ticket !== epoch.current) return;
      if (result.context?.conversation_id !== conversationId || result.context?.turn_id !== turnId) throw new Error('The returned repo search belongs to a different saved question.');
      pending.current = null; setSelected(null); accept(result);
    } catch (failure) {
      if (mounted.current && ticket === epoch.current) setError(!(failure instanceof ApiError) || failure.status >= 500 ? `The response was interrupted; GitHub work may already be running. Open saved repos before retrying. ${failure instanceof Error ? failure.message : ''}` : failure.message);
    } finally { if (mounted.current && ticket === epoch.current) { sending.current = false; setStarting(false); } }
  }
  async function cancel() {
    if (!current || !running || stopping) return;
    const id = current.id, ticket = epoch.current; setStopping(true); setError('');
    try { const result = await request<RepositorySearch>(`/repo-searches/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }); if (mounted.current && ticket === epoch.current && latest.current?.id === id) accept(result); }
    catch (failure) { if (mounted.current && ticket === epoch.current) setError(failure instanceof Error ? failure.message : 'The repo search could not be stopped.'); }
    finally { if (mounted.current && ticket === epoch.current) setStopping(false); }
  }
  function closeReader() {
    clearTimeout(hoverTimer.current);
    root.current?.querySelector<HTMLElement>('[data-testid="repo-card"][data-selected="true"]')?.focus();
    setSelected('__closed__');
  }
  function hover(record: RepositoryRecord) {
    clearTimeout(hoverTimer.current);
    if (wide && !notesPaused && window.matchMedia('(hover: hover) and (pointer: fine)').matches) hoverTimer.current = setTimeout(() => setSelected(record.repo_id), 120);
  }
  function artifactKey(record: RepositoryRecord) { return `${current?.id}:${record.record_id}:${record.evidence_version}`; }
  async function loadOriginal(record: RepositoryRecord) {
    if (!current) return;
    const key = artifactKey(record);
    if (artifactRequests.current.has(key) || artifacts[key]?.data) return;
    artifactRequests.current.add(key);
    setArtifacts(previous => ({ ...previous, [key]: { loading: true, error: '' } }));
    try {
      const data = await request<RepositoryReadmeArtifact>(`${repositoryRecordPath(current.id, record.record_id)}/readme?evidence_version=${encodeURIComponent(record.evidence_version)}`);
      if (data.record_id !== record.record_id || data.evidence_version !== record.evidence_version || data.source_sha !== record.readme.sha) throw new Error('Saved README text does not match this repository observation.');
      if (mounted.current) setArtifacts(previous => ({ ...previous, [key]: { data, loading: false, error: '' } }));
    } catch (failure) {
      if (mounted.current) setArtifacts(previous => ({ ...previous, [key]: { loading: false, error: failure instanceof ApiError && failure.status === 404 ? 'Original text was not retained for this saved observation. Saved excerpts remain available.' : failure instanceof Error ? failure.message : 'Saved README text could not be opened.' } }));
    } finally { artifactRequests.current.delete(key); }
  }
  function move(event: React.KeyboardEvent<HTMLElement>, index: number) {
    if (event.target !== event.currentTarget || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const cards = Array.from(event.currentTarget.parentElement?.parentElement?.querySelectorAll<HTMLElement>('[data-testid="repo-card"]') || []);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))); cards[next]?.focus();
  }

  return <section ref={root} className={styles.workspace} aria-label="Repository discovery" data-testid="repo-results" data-status={current?.status || job?.status || 'idle'} onKeyDown={event => { if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); closeReader(); } }}>
    {!central && <div className={styles.controls}><strong><Icon name="repo" />GitHub repositories</strong><div className={styles.actions}><label>Repos to fetch<select aria-label="Repositories to fetch" value={limit} disabled={starting || running} onChange={event => { const value = Number(event.target.value); setLimit(value); try { localStorage.setItem('research-scout:repo-limit:v1', String(value)); } catch { /* Use the visible choice. */ } }}>{Array.from({ length: 20 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label><button className="button primary" type="button" disabled={!canFind} onClick={() => void find()}><Icon name={starting ? 'spinner' : 'search'} />{starting ? 'Starting…' : current ? 'Refresh repos' : 'Find matching repos'}</button>{running && current && <button className="button" type="button" disabled={stopping} onClick={() => void cancel()}><Icon name="stop" />{stopping ? 'Stopping…' : 'Stop repo search'}</button>}</div></div>}
    {!onInformationChange && directTooLong && <p className={styles.context}>This saved direct question exceeds the 400-character Repos query limit. Shorten it and start a new search.</p>}
    {!onInformationChange && refined && !resourceReady && !current && <p className={styles.context} data-testid="repos-ai-plan-required">This saved query has no usable AI repository plan. Review Search information or run this question again to create a plan.</p>}
    {error && <div className={styles.recovery}>{!onInformationChange && <p role="alert">{error}</p>}<button type="button" className="text-button" onClick={() => { const ticket = epoch.current; setLoading(true); void restore(ticket).catch(failure => { if (mounted.current && ticket === epoch.current) setError(failure instanceof Error ? failure.message : 'Saved repositories unavailable.'); }).finally(() => { if (mounted.current && ticket === epoch.current) setLoading(false); }); }}>Open saved repos</button></div>}
    {!onInformationChange && records.length > 0 && <label className={styles.filter}><Icon name="search" /><input type="search" value={filter} maxLength={1000} aria-label="Find in available repositories" placeholder="Filter repos, topics and README evidence" onChange={event => onFilterChange(event.target.value)} /></label>}
    {commonTopics.length > 0 && <div className={styles.facets}><span>GitHub topics</span><TopicChips topics={commonTopics} selected={topicFilter} onSelect={topic => setTopicFilter(value => value === topic ? '' : topic)} label="Filter by GitHub topic" />{topicFilter && <button type="button" className="text-button" onClick={() => setTopicFilter('')}>Clear topic: {topicFilter}</button>}</div>}
    {!!unassessed && <button type="button" className={styles.unassessed} aria-expanded={showUnassessed} onClick={() => setShowUnassessed(value => !value)}>{showUnassessed ? 'Hide' : 'Show'} other fetched repos ({unassessed}) · relevance not established</button>}
    <div className={[styles.body, active && styles.withReader].filter(Boolean).join(' ')}><div><ol className={styles.list}>{visible.map((record, index) => <li key={record.repo_id}><article className={styles.card} tabIndex={0} data-testid="repo-card" data-selected={active?.repo_id === record.repo_id} onMouseEnter={() => hover(record)} onMouseLeave={() => clearTimeout(hoverTimer.current)} onFocus={event => { if (wide && !notesPaused && event.target === event.currentTarget) setSelected(record.repo_id); }} onKeyDown={event => move(event, index)}>
      <div className={styles.title}><button type="button" onClick={() => setSelected(record.repo_id)}>{record.full_name}</button><span className={styles.chip} data-provider="github">GitHub</span>{record.language && <span className={styles.task} data-chip-tone={materialTone(record.language)}>{record.language}</span>}{record.archived && <span className={styles.access}>Archived</span>}{record.fork && <span className={styles.chip}>Fork</span>}{record.mode === 'fixture' && <span className={styles.fixture}>Fixture</span>}</div>
      <div className={styles.topicRow}><TopicChips topics={record.topics} selected={topicFilter} onSelect={topic => setTopicFilter(value => value === topic ? '' : topic)} label={'GitHub topics for ' + record.full_name} /><span className={styles.license}>{record.license || 'License not supplied'}</span></div>
      <RepositoryContent record={record} scope={scope} compact artifact={artifacts[artifactKey(record)]} onOriginal={() => void loadOriginal(record)} />
      <div className={styles.stats}><Tooltip content="Stars are popularity metadata, not a relevance signal"><span><Icon name="star" />{record.stars.toLocaleString()} stars</span></Tooltip><span>{record.forks.toLocaleString()} forks</span><span>{readmeStatus(record)}</span></div>
      <p className={styles.match}><strong>{record.match.status === 'candidate' ? 'Candidate match' : 'Relevance not established'}</strong> · {record.match.reason}</p>
      <div className={styles.cardActions}><Tooltip content="View README, match reasons, metadata and notes"><button type="button" className="resource-icon-button" aria-label="View repository details" onClick={() => setSelected(record.repo_id)}><Icon name="eye" /></button></Tooltip>{repositoryUrl(record.url) && <Tooltip content="Open the public repository on GitHub"><a className="resource-icon-button" aria-label="Open repository on GitHub" href={repositoryUrl(record.url)} target="_blank" rel="noopener noreferrer"><Icon name="external" /></a></Tooltip>}{readmeSourceUrl(record.readme.source_url) && <Tooltip content="Open the immutable README blob returned by GitHub"><a className="resource-icon-button" aria-label="Open README blob" href={readmeSourceUrl(record.readme.source_url)} target="_blank" rel="noopener noreferrer"><Icon name="file" /></a></Tooltip>}<span>{record.pushed_at ? 'Last push ' + record.pushed_at.slice(0, 10) : 'Push date not supplied'}</span></div>
    </article></li>)}</ol>
    {(loading || starting || running) && <div className={styles.skeletons} data-testid="repo-skeleton" aria-label="Loading repository evidence" aria-busy="true">{Array.from({ length: records.length ? 1 : 3 }, (_, index) => <div key={index}><span /><span /><span /></div>)}</div>}
    {!visible.length && !loading && !starting && !running && <div className={styles.empty} data-testid="repo-empty"><Icon name="repo" /><h3>{needle || topicFilter ? 'No repos match this filter' : current ? 'No candidate match established' : central ? centralEmptyTitle : 'Find code for this research question'}</h3><p>{needle || topicFilter ? 'Clear the local filter or GitHub topic to view available repositories.' : current ? 'Other fetched repositories remain available above. Relevance was not established by the available local evidence.' : central ? centralReason : 'Find public GitHub repositories using the saved question, then review README evidence and metadata.'}</p>{(needle || topicFilter) && <button type="button" className="text-button" onClick={() => { onFilterChange(''); setTopicFilter(''); }}>Clear repo filters</button>}</div>}
    </div>
    {active && current && <RepositoryReader record={active} searchId={current.id} scope={scope} tab={readerTab} onTab={setReaderTab} onClose={closeReader} artifact={artifacts[artifactKey(active)]} onOriginal={() => void loadOriginal(active)} topicFilter={topicFilter} onTopic={topic => setTopicFilter(value => value === topic ? '' : topic)} noteDraft={noteDrafts[scope + ':' + active.record_id] || emptyNoteDraft()} onNoteDraft={patch => changeNoteDraft(scope + ':' + active.record_id, patch)} />}</div>
  </section>;
}

type ReaderTab = 'overview' | 'metadata' | 'notes';
type ArtifactState = { loading: boolean; error: string; data?: RepositoryReadmeArtifact };

function TopicChips({ topics, selected, onSelect, label, all = false }: { topics: string[]; selected: string; onSelect: (topic: string) => void; label: string; all?: boolean }) {
  const unique = [...new Set(topics.filter(Boolean))];
  const shown = all ? unique : unique.slice(0, 4), overflow = all ? [] : unique.slice(4);
  const chip = (topic: string) => <button type="button" className={styles.task} data-chip-tone={materialTone(topic)} key={topic} title={topic} aria-pressed={selected === topic} onClick={() => onSelect(topic)}>{topic}</button>;
  return <div className={all ? styles.allTopics : styles.topicChips} aria-label={label}>{shown.map(chip)}{overflow.length > 0 && <details className={styles.topicOverflow}><summary aria-label={'Show ' + overflow.length + ' more GitHub topics'}>+{overflow.length}</summary><div>{overflow.map(chip)}</div></details>}</div>;
}

function RepositoryContent({ record, scope, compact = false, artifact, onOriginal }: { record: RepositoryRecord; scope: string; compact?: boolean; artifact?: ArtifactState; onOriginal: () => void }) {
  const excerpts = record.readme.evidence.map(item => '## ' + item.section + '\n' + item.text).join('\n\n');
  const original = record.readme.artifact_available === true;
  const notice = (artifact?.data?.transformed ? 'Saved README text was sanitized; some source content was removed or redacted.' : original ? 'Key points select source text. Original opens the saved README observation.' : 'Selected excerpts from the saved README; the complete original was not retained.') + (artifact?.data?.complete === false ? ' Saved text does not establish complete source coverage.' : '');
  return <div className={styles.content}>
    {excerpts || original ? <><ReadableContent text={excerpts} label={original ? 'README' : 'excerpts'} sourceKey={[scope, record.repo_id, record.evidence_version].join(':')} previewPoints={compact ? 2 : 4} compact={compact} sourceNotice={notice} originalLabel={original ? 'Original saved README' : 'Saved excerpts'} {...(original ? { originalText: artifact?.data?.text, onOriginal, originalLoading: artifact?.loading, originalError: artifact?.error } : {})} />{!compact && !!record.readme.evidence.length && <details className={styles.provenance}><summary>README source sections and lines</summary>{record.readme.evidence.map(item => <p key={item.id}><strong>{item.section}</strong> · {item.id}{readmeSourceUrl(item.source_url) && <> · <a href={readmeSourceUrl(item.source_url)} target="_blank" rel="noopener noreferrer">README blob · lines {item.start_line}–{item.end_line}<Icon name="external" /></a></>}</p>)}</details>}</> : <><p className={styles.availability}>{readmeStatus(record)}. {readmeMessage(record)}</p><span className={styles.contentLabel}>Repository description</span><ReadableContent text={record.description} label="description" sourceKey={[scope, record.repo_id, record.metadata_version].join(':')} previewPoints={compact ? 2 : 4} compact={compact} sourceNotice="Description supplied by the repository; README content is unavailable in this saved record." /></>}
    {!compact && record.readme.truncated && <p className={styles.availability}>README evidence was bounded or truncated. Review the saved original, when retained, or GitHub for full context.</p>}
  </div>;
}

function RepositoryReader({ record, searchId, scope, tab, onTab, onClose, artifact, onOriginal, topicFilter, onTopic, noteDraft, onNoteDraft }: { record: RepositoryRecord; searchId: string; scope: string; tab: ReaderTab; onTab: (tab: ReaderTab) => void; onClose: () => void; artifact?: ArtifactState; onOriginal: () => void; topicFilter: string; onTopic: (topic: string) => void; noteDraft: RepositoryNoteDraft; onNoteDraft: (patch: Partial<RepositoryNoteDraft>) => void }) {
  const id = useId(), body = useRef<HTMLDivElement | null>(null);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [record.repo_id, tab]);
  const tabs = ['overview', 'metadata', 'notes'] as const;
  return <aside className={styles.reader} aria-label="Repository details" data-testid="repo-reader">
    <header><span className={styles.chip} data-provider="github">GitHub</span><Tooltip content="Close repository details"><button type="button" className="resource-icon-button" aria-label="Close repository details" onClick={onClose}><Icon name="close" /></button></Tooltip><strong>{record.full_name}</strong></header>
    <div className={styles.readerTabs} role="tablist" aria-label="Repository detail sections" onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const index = tabs.indexOf(tab); const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[2] : tabs[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]; onTab(next); event.currentTarget.querySelector<HTMLButtonElement>('[data-section="' + next + '"]')?.focus(); }}>{tabs.map(item => <button key={item} type="button" role="tab" id={id + '-' + item} data-section={item} aria-selected={tab === item} aria-controls={id + '-panel'} tabIndex={tab === item ? 0 : -1} onClick={() => onTab(item)}>{item === 'overview' ? 'Overview' : item === 'metadata' ? 'Metadata' : 'Notes'}</button>)}</div>
    <div ref={body} className={styles.readerBody} role="tabpanel" id={id + '-panel'} aria-labelledby={id + '-' + tab} tabIndex={0}>
      {tab === 'overview' && <><RepositoryContent record={record} scope={scope} artifact={artifact} onOriginal={onOriginal} /><h3>Why this repository</h3><p>{record.match.reason}</p><span className={styles.contentLabel}>Matched query terms</span><div className={styles.tags}>{record.match.matched_terms.map(term => <span className={styles.task} data-chip-tone={materialTone(term)} key={term}>{term}</span>)}</div><p className={styles.score}>Local sparse score {Number.isFinite(record.match.score) ? record.match.score.toFixed(2) : 'unavailable'} · not a confidence percentage · no new model review</p>{record.readme.status === 'available' && <p className={styles.score}>{record.readme.repository_id_revalidated ? 'Public repository ID rechecked after README acquisition.' : 'This saved README does not establish a public repository ID recheck.'}</p>}{!!record.match.missing_constraints.length && <><h3>Still to verify</h3><ul>{record.match.missing_constraints.map((value, index) => <li key={index}>{value}</li>)}</ul></>}{repositoryUrl(record.readme.web_url) && <p><a href={repositoryUrl(record.readme.web_url)} target="_blank" rel="noopener noreferrer">Current README on GitHub<Icon name="external" /></a><small>The current branch may differ from the saved blob.</small></p>}<h3>License</h3><p>{record.license || 'Not supplied; verify before reuse.'}</p></>}
      {tab === 'metadata' && <><h3>All GitHub topics</h3>{record.topics.length ? <TopicChips topics={record.topics} selected={topicFilter} onSelect={onTopic} label="All GitHub topics" all /> : <p>No GitHub topics supplied.</p>}<dl className={styles.metadata}>{[['Repository', record.full_name], ['GitHub ID', record.record_id], ['Default branch', record.default_branch], ['Language', record.language], ['Stars', String(record.stars)], ['Forks', String(record.forks)], ['Open issues', String(record.open_issues)], ['License', record.license], ['Archived', record.archived ? 'Yes' : 'No'], ['Fork', record.fork ? 'Yes' : 'No'], ['Updated', record.updated_at], ['Last push', record.pushed_at], ['README status', readmeStatus(record)], ['README path', record.readme.path], ['README blob SHA', record.readme.sha], ['Public repository ID recheck', record.readme.repository_id_revalidated ? 'Confirmed after README acquisition' : 'Not established'], ['Identity check observed', record.readme.identity_checked_at], ['Evidence version', record.evidence_version], ['Metadata version', record.metadata_version], ['Ranking method', record.match.method], ['Observed', record.observed_at]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not supplied'}</dd></div>)}</dl></>}
      <RepositoryNotes active={tab === 'notes'} searchId={searchId} record={record} draft={noteDraft} onDraft={onNoteDraft} />
    </div>
    {repositoryUrl(record.url) && <footer className={styles.readerFooter}><a className="button small" href={repositoryUrl(record.url)} target="_blank" rel="noopener noreferrer">Open repository<Icon name="external" /></a></footer>}
  </aside>;
}
