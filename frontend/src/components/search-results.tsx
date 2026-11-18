'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { isActive, normalStatus, request, sourceTitle, type Provider } from '@/lib/api';
import type { ChatSource, Conversation, ConversationSummary, ExplorationTurn } from '@/lib/conversations';
import { groupReviewedSources } from '@/lib/reviewed-sources';
import { searchResourceKind, searchResources, type SearchCategory, type SearchResource } from '@/lib/search-resources';
import Icon from './icon';
import { latestSourceRecords, newerSource, recordIdentity } from '@/lib/source-versions';
import { useLoadTiming, type LoadTiming } from '@/lib/load-timing';
import SearchResultCard from './search-result-card';
import SearchInformation from './search-information';
import { acceptsResourceInformation, type ResourceInformation, type ResourceInformationUpdate } from '@/lib/search-information';
import Tooltip from './tooltip';
import styles from './search-controls.module.css';
import DatasetResults from './dataset-results';
import RepositoryResults from './repository-results';
import { legacyDataset } from '@/lib/datasets';
import { resourceProviderPending, ResourceTabSpinner, type ResourceTabActivity } from './resource-tab-activity';

const normalize = (saved: Conversation): Conversation => ({ ...saved, turns: (saved.turns || []).map(turn => groupReviewedSources({ ...turn, warnings: turn.warnings || [], sources: turn.sources || [], run_ids: turn.run_ids || [] })) });
const latestSearch = (saved: Conversation | null) => saved?.turns.findLast(turn => turn.action === 'discover' || turn.action === 'lookup');
const compacted = (turn: ExplorationTurn) => !!turn.history_compacted || !!turn.retrieval?.llm_requests?.some(item => item.body_compacted);
const historySignature = (turn: ExplorationTurn) => JSON.stringify([turn.status, turn.completed_at, turn.saved_result_counts, turn.usage, turn.providers, turn.run_ids, turn.response, turn.warnings, turn.retrieval?.status, turn.retrieval?.round, turn.timing_spans, turn.modality_limits, turn.resource_jobs]);

export default function SearchResults({ id, providers, controls, pending = false, filter, historyEntries, preferredTurnId, activeSourceKey, preserveSourceVersion = false, onSaveResource, isResourceSaved, savingResourceKey, onFilterChange, onChooseSearch, onOpenSource, onOpenChat, onLoaded, onRunningChange, informationToolbarHost, informationDetailsHost, traceTarget, performanceTarget, traceActions, draftQuestion, readerTiming, liveSearchStart, onFirstEvidenceMeasured, onCategoryChange }: {
  id: string | null;
  providers: Provider[];
  controls?: ReactNode;
  pending?: boolean;
  filter: string;
  historyEntries?: ConversationSummary[];
  preferredTurnId?: string | null;
  activeSourceKey?: string | null;
  preserveSourceVersion?: boolean;
  onSaveResource?: (source: ChatSource) => void;
  isResourceSaved?: (source: ChatSource) => boolean;
  savingResourceKey?: string | null;
  onFilterChange: (value: string) => void;
  onChooseSearch: (id: string) => void;
  onOpenSource: (source: ChatSource, options?: { passive?: boolean; intent?: 'play-video' }) => Promise<void>;
  onOpenChat: (id: string) => void;
  onLoaded: (saved: Conversation) => void;
  onRunningChange: (running: boolean) => void;
  informationToolbarHost?: HTMLElement | null;
  informationDetailsHost?: HTMLElement | null;
  traceTarget?: HTMLElement | null;
  performanceTarget?: HTMLElement | null;
  traceActions?: ReactNode;
  draftQuestion?: string;
  readerTiming?: LoadTiming | null;
  liveSearchStart?: { turnId: string; startedAt: number; elapsedMs?: number };
  onFirstEvidenceMeasured?: (searchId: string, turnId: string, elapsedMs: number) => void;
  onCategoryChange?: (category: SearchCategory) => void;
}) {
  const [saved, setSaved] = useState<Conversation | null>(null);
  const current = useRef<Conversation | null>(null);
  const requested = useRef(id);
  const mounted = useRef(true);
  const operationEpoch = useRef(0);
  const inspectSequence = useRef(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastInspect = useRef<{ key: string; pending: boolean } | null>(null);
  const inspectedSource = useRef<ChatSource | null>(null);
  const autoPreviewed = useRef(new Set<string>());
  const restored = useRef(new Map<string, { turn: ExplorationTurn; signature: string }>());
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [category, setCategory] = useState<SearchCategory>('paper');
  const [datasetCount, setDatasetCount] = useState<number | null>(null);
  const [repoCount, setRepoCount] = useState<number | null>(null);
  const [visitedResources, setVisitedResources] = useState<{ scope: string; data: boolean; repo: boolean }>({ scope: '', data: false, repo: false });
  const [resourceActivity, setResourceActivity] = useState<{ scope: string; data?: Pick<ResourceTabActivity, 'reading' | 'working'>; repo?: Pick<ResourceTabActivity, 'reading' | 'working'> }>({ scope: '' });
  const [resourceInformation, setResourceInformation] = useState<{ scope: string; values: ResourceInformation }>({ scope: '', values: {} });
  const { timing: savedTiming, start: startSavedTime, finish: finishSavedTime, clear: clearSavedTime } = useLoadTiming();
  const [tabReady, setTabReady] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState('');
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [connection, setConnection] = useState('saved');
  const [streamVersion, setStreamVersion] = useState(0);
  const [localActiveKey, setLocalActiveKey] = useState<string | null>(null);
  const [abstractsExpanded, setAbstractsExpanded] = useState(false);
  const [observedFirstEvidence, setObservedFirstEvidence] = useState<{ searchId: string; key: string; elapsedMs: number } | null>(null);
  const activeKey = activeSourceKey !== undefined ? activeSourceKey : localActiveKey;
  const visibleSaved = saved?.id === id ? saved : null;
  const openingSearch = loading || !!id && !visibleSaved && !error;
  const turn = preferredTurnId ? visibleSaved?.turns.find(item => item.id === preferredTurnId && ['discover', 'lookup'].includes(item.action)) : latestSearch(visibleSaved);
  const requestedTurnMissing = !!preferredTurnId && !!visibleSaved && !turn;
  const running = !!turn && isActive(turn.status);
  const conversationBusy = visibleSaved?.status === 'RUNNING';
  const resources = searchResources(turn);
  const hasEvidence = resources.length > 0 || (turn?.resource_jobs?.datasets?.record_count || 0) > 0 || (turn?.resource_jobs?.repos?.record_count || 0) > 0;
  const firstEvidenceTiming = observedFirstEvidence?.searchId === id && observedFirstEvidence.key === turn?.id ? observedFirstEvidence : null;
  const needle = filter.toLowerCase().trim();
  const matchesFilter = (source: ChatSource) => `${sourceTitle(source)} ${source.authors?.join(' ') || ''} ${source.abstract || ''} ${source.description || ''}`.toLowerCase().includes(needle);
  const lane = resources.filter(item => item.kind === category);
  const visible = lane.filter(item => matchesFilter(item.source));
  const related = (turn?.related_sources || []).map(source => ({ key: `${source.run_id}:${source.source_ref}`, source, kind: searchResourceKind(source) })).filter(item => item.kind === category && matchesFilter(item.source));
  const historicalDatasets = resources.filter(item => item.kind === 'data').map(item => legacyDataset(item.source));
  const central = turn?.modality_limits != null;
  const jobs = turn?.resource_jobs;
  const compactResults = !!turn && compacted(turn);
  const paperCount = resources.filter(item => item.kind === 'paper').length, videoCount = resources.filter(item => item.kind === 'video').length;
  const counts = { paper: compactResults && !paperCount ? jobs?.papers?.record_count ?? '—' : paperCount, video: compactResults && !videoCount ? jobs?.videos?.record_count ?? '—' : videoCount, data: jobs?.datasets ? Math.max(jobs.datasets.record_count, datasetCount ?? historicalDatasets.length) : datasetCount ?? (historicalDatasets.length || '—'), repo: jobs?.repos ? Math.max(jobs.repos.record_count, repoCount ?? 0) : repoCount ?? '—' };
  const activeItem = (item: SearchResource) => [item.source, ...(item.versions || item.paper?.observations || [])].some(source => activeKey === `${source.run_id}:${source.source_ref}`);
  const resourceScope = `${id || ''}:${pending || openingSearch ? '' : turn?.id || ''}`;
  const currentResourceScope = useRef(resourceScope); currentResourceScope.current = resourceScope;
  const informationContext = useRef<{ id: string | null; turn?: ExplorationTurn }>({ id, turn });
  informationContext.current = { id, turn: pending || openingSearch ? undefined : turn };
  const currentInformation: ResourceInformation = {};
  if (resourceInformation.scope === resourceScope && !pending && !openingSearch) {
    for (const item of Object.values(resourceInformation.values)) if (item && acceptsResourceInformation(item, id, turn)) currentInformation[item.lane] = item;
  }
  const renderData = central || category === 'data' || visitedResources.scope === resourceScope && visitedResources.data;
  const renderRepos = central || category === 'repo' || visitedResources.scope === resourceScope && visitedResources.repo;
  const ownActivity = resourceActivity.scope === resourceScope ? resourceActivity : undefined;
  const sharedReading = pending || openingSearch;
  const tabActivity = {
    paper: { reading: sharedReading || restoring, working: jobs?.papers ? isActive(jobs.papers.status) : resourceProviderPending(turn, 'paper') },
    video: { reading: sharedReading || restoring, working: jobs?.videos ? isActive(jobs.videos.status) : resourceProviderPending(turn, 'video') },
    data: { reading: sharedReading || !!ownActivity?.data?.reading, working: !!ownActivity?.data?.working || !!jobs?.datasets && isActive(jobs.datasets.status) },
    repo: { reading: sharedReading || !!ownActivity?.repo?.reading, working: !!ownActivity?.repo?.working || !!jobs?.repos && isActive(jobs.repos.status) },
  };
  const showSkeleton = tabActivity[category].reading || tabActivity[category].working;
  const operationIsCurrent = (epoch: number, searchId: string | null) => mounted.current && requested.current === searchId && operationEpoch.current === epoch;
  const reportResourceActivity = useCallback((lane: 'data' | 'repo', activity: ResourceTabActivity) => {
    const scope = `${activity.conversationId || ''}:${activity.turnId || ''}`;
    if (!mounted.current || currentResourceScope.current !== scope) return;
    setResourceActivity(previous => {
      const current = previous.scope === scope ? previous : { scope };
      if (current[lane]?.reading === activity.reading && current[lane]?.working === activity.working) return previous;
      return { ...current, [lane]: { reading: activity.reading, working: activity.working } };
    });
  }, []);
  const onDatasetActivity = useCallback((activity: ResourceTabActivity) => reportResourceActivity('data', activity), [reportResourceActivity]);
  const onRepoActivity = useCallback((activity: ResourceTabActivity) => reportResourceActivity('repo', activity), [reportResourceActivity]);
  const onResourceInformation = useCallback((incoming: ResourceInformationUpdate) => {
    const context = informationContext.current;
    if (!mounted.current || !acceptsResourceInformation(incoming, context.id, context.turn)) return;
    const scope = `${context.id}:${context.turn!.id}`;
    setResourceInformation(previous => {
      const values = previous.scope === scope ? previous.values : {};
      if (!acceptsResourceInformation(incoming, context.id, context.turn, values[incoming.lane])) return previous;
      return { scope, values: { ...values, [incoming.lane]: incoming } };
    });
  }, []);
  const onDatasetCount = useCallback((count: number, scope: { conversationId: string | null; turnId: string | null }) => { if (scope.conversationId && scope.turnId && mounted.current && currentResourceScope.current === `${scope.conversationId}:${scope.turnId}`) setDatasetCount(count); }, []);
  const onRepoCount = useCallback((count: number, scope: { conversationId: string | null; turnId: string | null }) => { if (scope.conversationId && scope.turnId && mounted.current && currentResourceScope.current === `${scope.conversationId}:${scope.turnId}`) setRepoCount(count); }, []);

  useEffect(() => {
    setVisitedResources(previous => {
      const next = previous.scope === resourceScope ? previous : { scope: resourceScope, data: false, repo: false };
      if (category !== 'data' && category !== 'repo' || next[category]) return next === previous ? previous : next;
      return { ...next, [category]: true };
    });
  }, [resourceScope, category]);

  useEffect(() => {
    // Only a Search admitted in this browser can establish first-evidence
    // latency. Opening an older saved search must not invent that timestamp.
    if (!id || !turn || !hasEvidence || liveSearchStart?.turnId !== turn.id || requested.current !== id) return;
    const elapsedMs = liveSearchStart.elapsedMs ?? Math.max(0, performance.now() - liveSearchStart.startedAt);
    setObservedFirstEvidence(previous => previous?.searchId === id && previous.key === turn.id && previous.elapsedMs === elapsedMs ? previous : { searchId: id, key: turn.id, elapsedMs });
    if (liveSearchStart.elapsedMs === undefined) onFirstEvidenceMeasured?.(id, turn.id, elapsedMs);
  }, [id, turn?.id, hasEvidence, liveSearchStart?.turnId, liveSearchStart?.startedAt, liveSearchStart?.elapsedMs, onFirstEvidenceMeasured]);

  const accept = useCallback((incoming: Conversation) => {
    if (!mounted.current || requested.current !== incoming.id) return;
    const next = normalize({ ...incoming, turns: (incoming.turns || []).map(item => {
      const cached = restored.current.get(`${incoming.id}:${item.id}`);
      // Expanded saved history must never replace a newer running/terminal
      // stream state. Only reuse an unchanged completed snapshot.
      return compacted(item) && !isActive(item.status) && cached?.signature === historySignature(item) ? cached.turn : item;
    }) });
    if (current.current?.id === next.id && current.current.revision > next.revision) return;
    current.current = next; setSaved(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const requestedTab = new URLSearchParams(window.location.search).get('category');
    const entryTabs: Record<string, SearchCategory> = { papers: 'paper', videos: 'video', data: 'data', repos: 'repo' };
    if (requestedTab && entryTabs[requestedTab]) setCategory(entryTabs[requestedTab]);
    else try { const last = localStorage.getItem('research-scout:result-tab'); if (last === 'paper' || last === 'video' || last === 'data' || last === 'repo') setCategory(last); } catch { /* Browsing still works without storage. */ }
    setTabReady(true);
    if (historyEntries === undefined) void request<{ conversations: ConversationSummary[] }>('/conversations').then(result => { if (mounted.current) setHistory(previous => {
      const merged = new Map(previous.map(item => [item.id, item]));
      for (const item of result.conversations || []) if (!merged.has(item.id) || item.updated_at >= merged.get(item.id)!.updated_at) merged.set(item.id, item);
      return [...merged.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }); }).catch(() => undefined);
    return () => { mounted.current = false; operationEpoch.current++; inspectSequence.current++; clearTimeout(hoverTimer.current); };
  }, []);

  useEffect(() => {
    if (!historyEntries) return;
    setHistory(previous => {
      const merged = new Map(previous.map(item => [item.id, item]));
      for (const item of historyEntries) if (!merged.has(item.id) || item.updated_at >= merged.get(item.id)!.updated_at) merged.set(item.id, item);
      return [...merged.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    });
  }, [historyEntries]);

  useEffect(() => { if (tabReady) try { localStorage.setItem('research-scout:result-tab', category); } catch { /* Current tab still works. */ } }, [category, tabReady]);
  useEffect(() => { onCategoryChange?.(category); }, [category, onCategoryChange]);
  useEffect(() => { setDatasetCount(null); setRepoCount(null); }, [id, turn?.id]);

  useEffect(() => {
    operationEpoch.current++;
    requested.current = id; current.current = null; setSaved(null); setError(''); setLoading(!!id);
    setInspecting(null); setRestoring(false); setStopping(false); setConnection('saved');
    setLocalActiveKey(null); lastInspect.current = null;
    let active = true, failed = false;
    const ticket = id ? startSavedTime(id, 'Saved results') : null;
    if (!id) clearSavedTime();
    if (id) void request<Conversation>(`/conversations/${encodeURIComponent(id)}`).then(result => {
      if (!active || requested.current !== id) return;
      accept(result); onLoaded(normalize(result));
      setHistory(previous => [{ id: result.id, title: result.title, updated_at: result.updated_at, status: result.status }, ...previous.filter(item => item.id !== result.id)]);
    }).catch(failure => { if (active) { failed = true; setError(`Saved search could not be opened. ${failure instanceof Error ? failure.message : 'Please try opening it again.'}`); } }).finally(() => { if (active) { setLoading(false); if (ticket) finishSavedTime(ticket, failed); } });
    return () => { active = false; };
  }, [id, accept, onLoaded, startSavedTime, finishSavedTime, clearSavedTime]);

  useEffect(() => { clearTimeout(hoverTimer.current); }, [id, category, filter]);
  useEffect(() => {
    operationEpoch.current++; inspectSequence.current++; clearTimeout(hoverTimer.current);
    lastInspect.current = null; setLocalActiveKey(null); setInspecting(null); setRestoring(false); setStopping(false); setError('');
  }, [preferredTurnId]);

  useEffect(() => { onRunningChange(openingSearch || running || conversationBusy); return () => onRunningChange(false); }, [openingSearch, running, conversationBusy, onRunningChange]);

  const savedId = visibleSaved?.id;
  useEffect(() => {
    if (!savedId) return;
    let disposed = false, poll: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => { const result = await request<Conversation>(`/conversations/${encodeURIComponent(savedId)}`); if (!disposed) accept(result); };
    const recover = () => { if (!poll) poll = setInterval(() => void refresh().catch(() => undefined), 3000); };
    const cursor = current.current?.cursor;
    const stream = new EventSource(`/api/conversations/${encodeURIComponent(savedId)}/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    setConnection('connecting');
    stream.onopen = () => { if (!disposed) { setConnection('connected'); if (poll) clearInterval(poll); poll = undefined; } };
    stream.addEventListener('state', event => {
      if (disposed) return;
      try { const next = JSON.parse((event as MessageEvent<string>).data).snapshot as Conversation; if (next) { accept(next); setConnection('connected'); } }
      catch { setConnection('reconnecting'); }
    });
    stream.addEventListener('resync.required', () => {
      stream.close(); setConnection('reconnecting');
      void refresh().then(() => { if (!disposed) setStreamVersion(value => value + 1); }).catch(() => { if (!disposed) recover(); });
    });
    stream.onerror = () => { if (!disposed) { setConnection('reconnecting'); recover(); } };
    return () => { disposed = true; stream.close(); if (poll) clearInterval(poll); };
  }, [savedId, streamVersion, accept]);

  const previewContext = id && turn ? `${id}:${turn.id}:${category}` : '';
  function markPreviewContext() {
    if (!previewContext) return;
    autoPreviewed.current.add(previewContext);
    while (autoPreviewed.current.size > 24) autoPreviewed.current.delete(autoPreviewed.current.values().next().value!);
  }
  async function inspect(source: ChatSource, passive = false, intent?: 'play-video') {
    if (!source.run_id) return;
    markPreviewContext();
    const key = `${source.run_id}:${source.source_ref}`;
    // Returning to the displayed row is new intent when a different row is
    // still loading. Dispatch it so the parent's read fence supersedes that read.
    if (passive && (lastInspect.current?.pending ? lastInspect.current.key === key && inspectedSource.current?.version === source.version : activeKey === key && inspectedSource.current?.version === source.version)) return;
    inspectedSource.current = source;
    clearTimeout(hoverTimer.current);
    const epoch = operationEpoch.current, searchId = id, sequence = ++inspectSequence.current;
    lastInspect.current = { key, pending: true }; setLocalActiveKey(key);
    setInspecting(key); setError('');
    try { await onOpenSource(source, { passive, intent }); } catch (failure) { if (sequence === inspectSequence.current && operationIsCurrent(epoch, searchId)) setError(failure instanceof Error ? failure.message : 'This saved source could not be opened.'); }
    finally { if (sequence === inspectSequence.current && operationIsCurrent(epoch, searchId)) { lastInspect.current = { key, pending: false }; setInspecting(null); } }
  }
  function hover(source: ChatSource) {
    clearTimeout(hoverTimer.current);
    if (window.matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)').matches) hoverTimer.current = setTimeout(() => void inspect(source, true), 160);
  }
  // Open one saved record by default on desktop without taking keyboard focus.
  // Mark before dispatch so stream updates, close and effect replay cannot reopen it.
  const firstVisible = visible[0]?.source;
  useEffect(() => {
    if (category === 'data' || category === 'repo' || !tabReady || openingSearch || !previewContext || !firstVisible?.run_id || autoPreviewed.current.has(previewContext)) return;
    if (!window.matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)').matches) return;
    markPreviewContext();
    if (!visible.some(item => activeItem(item))) void inspect(firstVisible, true);
  }, [tabReady, openingSearch, previewContext, firstVisible?.run_id, firstVisible?.source_ref]);

  useEffect(() => {
    if (!activeSourceKey || preserveSourceVersion || !inspectedSource.current) return;
    const previous = inspectedSource.current;
    const item = resources.find(resource => activeItem(resource));
    if (!item) return;
    const candidates = latestSourceRecords((item.versions || item.paper?.observations || [item.source]).filter(source => recordIdentity(source) === recordIdentity(previous)));
    const next = candidates.find(source => newerSource(previous, source) === source && (source.run_id !== previous.run_id || source.version !== previous.version));
    if (next) void inspect(next, true);
  }, [resources, activeSourceKey, preserveSourceVersion]);

  async function openFullTurn() {
    if (!id || !turn || restoring) return;
    const epoch = operationEpoch.current, searchId = id;
    const restoreRevision = current.current?.revision, restoreSignature = historySignature(turn);
    const restoreIsCurrent = () => {
      if (!operationIsCurrent(epoch, searchId)) return false;
      const latest = current.current, latestTurn = latest?.turns.find(item => item.id === turn.id);
      return latest?.id === searchId && latest.revision === restoreRevision && !!latestTurn && historySignature(latestTurn) === restoreSignature;
    };
    setRestoring(true); setError('');
    try {
      const result = await request<ExplorationTurn>(`/conversations/${encodeURIComponent(id)}/turns/${encodeURIComponent(turn.id)}`);
      // A saved full-body read must not overwrite state received from a newer
      // stream revision while it was pending, even within the same search.
      if (!restoreIsCurrent() || result.id !== turn.id) return;
      restored.current.set(`${id}:${turn.id}`, { turn: result, signature: restoreSignature });
      const next = current.current; if (next) accept({ ...next, turns: next.turns.map(item => item.id === result.id ? result : item) });
    } catch (failure) { if (restoreIsCurrent()) setError(failure instanceof Error ? failure.message : 'Saved results could not be opened.'); }
    finally { if (operationIsCurrent(epoch, searchId)) setRestoring(false); }
  }
  async function cancel() {
    if (!id || !turn || !isActive(turn.status) || stopping) return;
    const epoch = operationEpoch.current, searchId = id;
    setStopping(true); setError('');
    try { const result = await request<Conversation>(`/conversations/${encodeURIComponent(id)}/turns/${encodeURIComponent(turn.id)}/cancel`, { method: 'POST', body: '{}' }); if (operationIsCurrent(epoch, searchId)) accept(result); }
    catch (failure) { if (operationIsCurrent(epoch, searchId)) setError(failure instanceof Error ? failure.message : 'Search could not be stopped.'); }
    finally { if (operationIsCurrent(epoch, searchId)) setStopping(false); }
  }

  const youtube = providers.find(item => item.id === 'youtube');
  const videoPlan = turn?.source_plan?.find(item => item.provider === 'youtube');
  const noVideosReason = videoPlan?.status === 'skipped' ? videoPlan.reason : turn && !turn.providers.includes('youtube') ? 'YouTube was not included in this saved search. Select YouTube in Sources and press Search to retrieve videos.' : youtube?.access_configured === false ? youtube.blocked_reason || 'Add the YouTube API key in local configuration before a new video search.' : !youtube ? 'YouTube connection status has not been confirmed. Saved records remain available; review provider status before starting a new search.' : running ? 'Video records will appear as the selected provider returns them.' : 'No videos were returned in this saved search. Provider outcomes remain available below.';
  const filteredEmpty = !!needle && lane.length > 0;
  const emptyHeading = openingSearch ? 'Opening your search' : requestedTurnMissing ? 'This saved query is unavailable' : filteredEmpty ? `No matching ${category === 'video' ? 'videos' : 'papers'} for this filter` : running ? 'Search is in progress' : category === 'video' ? youtube?.access_configured === false ? 'Video search needs a YouTube connection' : 'No videos in the available results' : turn ? 'No records in this view' : visibleSaved?.turns.length ? 'This saved conversation has no search results' : 'Start with a research question';
  const emptyMessage = openingSearch ? 'Reading saved results without repeating the search.' : requestedTurnMissing ? 'The requested query is not a discovery or lookup in this saved session. Choose another saved query; no later query has been substituted.' : filteredEmpty ? `${lane.length} ${category === 'video' ? 'videos are' : 'paper records are'} available in this tab. Clear the local filter to show them.` : category === 'video' ? noVideosReason : visibleSaved?.turns.length && !turn ? 'Open Exploration chat to view this saved action, or start a new question above.' : turn ? 'Review source outcomes, date range and selected sources, or try a more specific question. Uncertain records remain separate below.' : 'Use the search box above. Papers and videos will appear here without switching to chat.';
  const currentJob = category === 'paper' ? jobs?.papers : category === 'video' ? jobs?.videos : undefined;
  const jobEmptyHeading = currentJob?.status === 'DISABLED' ? `${category === 'video' ? 'Videos' : 'Papers'} were turned off` : currentJob && ['FAILED', 'BLOCKED'].includes(currentJob.status.toUpperCase()) ? `${category === 'video' ? 'Video' : 'Paper'} search needs attention` : undefined;
  const jobEmptyMessage = currentJob?.reason || currentJob?.error?.message;


  return <section className="workspace-search-results" data-testid="search-results" data-status={normalStatus(turn?.status || 'empty')} data-connection={connection} aria-label="Search results">
    {!pending && !openingSearch && turn?.retrieval?.status === 'clarification_needed' && <section className="ai-clarification-notice" aria-label="Research clarification" data-testid="search-clarification"><div><strong><Icon name="message" />Clarification needed before retrieval</strong><p>{turn.retrieval.clarification_question || turn.response || 'Please clarify the intended domain and outcome before searching.'}</p></div>{id && <button type="button" className="button small" onClick={() => onOpenChat(id)}>Answer in Exploration<Icon name="arrow" /></button>}</section>}
    <div className="search-resource-tabs" role="tablist" aria-label="Search result types" onKeyDown={event => {
      if (!tabReady || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      event.preventDefault(); const button = tabs[next]; if (button) { setCategory(button.dataset.category as SearchCategory); button.focus(); }
    }}>{([{ id: 'paper', label: 'Papers', icon: 'file' }, { id: 'video', label: 'Videos', icon: 'video' }, { id: 'data', label: 'Data', icon: 'database' }, { id: 'repo', label: 'Repos', icon: 'repo' }] as const).map(item => { const busy = tabActivity[item.id].reading || tabActivity[item.id].working; return <button type="button" key={item.id} role="tab" disabled={!tabReady} data-category={item.id} aria-busy={busy} tabIndex={category === item.id ? 0 : -1} id={`search-tab-${item.id}`} aria-controls={item.id === 'data' || item.id === 'repo' ? `search-resource-panel-${item.id}` : 'search-resource-panel'} aria-selected={category === item.id} onClick={() => setCategory(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{busy && <ResourceTabSpinner lane={item.id} />}<span>{counts[item.id]}</span></button>; })}</div>
    <SearchInformation toolbarHost={informationToolbarHost} detailHost={informationDetailsHost} key={resourceScope} turn={pending || openingSearch ? undefined : turn} category={category} resources={pending || openingSearch ? [] : resources} information={currentInformation} counts={pending || openingSearch ? { paper: '—', video: '—', data: '—', repo: '—' } : counts} pending={pending} opening={openingSearch} reading={tabActivity[category].reading} working={tabActivity[category].working} activityMessages={([{ id: 'paper', label: 'Papers' }, { id: 'video', label: 'Videos' }, { id: 'data', label: 'Data' }, { id: 'repo', label: 'Repos' }] as const).flatMap(item => tabActivity[item.id].reading ? [`${item.label}: ${pending ? 'starting search' : 'loading saved results'}`] : tabActivity[item.id].working ? [`${item.label}: retrieving results`] : [])} connection={connection} stopping={stopping} onCancel={() => void cancel()} filter={pending || openingSearch ? '' : filter} onFilterChange={onFilterChange} savedTiming={savedTiming?.key === id ? savedTiming : null} readerTiming={pending || openingSearch ? null : readerTiming} firstEvidenceTiming={pending || openingSearch ? null : firstEvidenceTiming} draftQuestion={draftQuestion} restoring={restoring} onRestore={() => void openFullTurn()} actions={traceActions} />
    {error && <p role="alert" className="feedback error-feedback">{error}</p>}
    {!pending && !openingSearch && turn && compacted(turn) && <div className="search-category-empty"><p>Some saved details are collapsed in this long history. Open them from saved state without repeating research or model calls.</p><button className="button small" disabled={restoring} onClick={() => void openFullTurn()}>{restoring ? 'Opening saved results…' : 'Open saved results'}</button></div>}
    {conversationBusy && !running && <p className={styles.filterStatus}>Another action is running in this conversation. These saved results remain available; open Exploration chat to manage it.</p>}
    {renderRepos && <div id="search-resource-panel-repo" role="tabpanel" aria-labelledby="search-tab-repo" hidden={category !== 'repo'} inert={category !== 'repo'}><RepositoryResults key={`${id}:${turn?.id || ''}`} conversationId={id} turn={pending || openingSearch ? undefined : turn} filter={filter} onFilterChange={onFilterChange} onCountChange={onRepoCount} onActivityChange={onRepoActivity} onInformationChange={onResourceInformation} /></div>}
    {renderData && <div id="search-resource-panel-data" role="tabpanel" aria-labelledby="search-tab-data" hidden={category !== 'data'} inert={category !== 'data'}><DatasetResults key={`${id}:${turn?.id || ''}`} conversationId={id} turn={pending || openingSearch ? undefined : turn} historical={pending || openingSearch ? [] : historicalDatasets} filter={filter} onFilterChange={onFilterChange} onCountChange={onDatasetCount} onActivityChange={onDatasetActivity} onInformationChange={onResourceInformation} /></div>}
    {category !== 'repo' && category !== 'data' && <>
    <div className={styles.panel} data-testid="search-control-panel" aria-label="Search controls and coverage">
      <div className={styles.controlLayout}>
        {controls}
        <div className={styles.displayTools}>
          {!!resources.length && <><Tooltip content={`Expand or collapse returned ${category === 'video' ? 'descriptions' : 'abstracts'}; no bulk lookups`}><button type="button" className="resource-icon-button" aria-label={`${abstractsExpanded ? 'Collapse' : 'Expand'} ${category === 'video' ? 'descriptions' : 'abstracts'}`} aria-pressed={abstractsExpanded} onClick={() => setAbstractsExpanded(value => !value)}><Icon name="text" /><span>{abstractsExpanded ? 'Less text' : category === 'video' ? 'Descriptions' : 'Abstracts'}</span></button></Tooltip></>}
          {id && <Tooltip content="Continue this research query in Exploration chat"><button className="resource-icon-button search-open-chat" type="button" aria-label="Open in Exploration chat" onClick={() => onOpenChat(id)}><Icon name="message" /><span>Explore</span></button></Tooltip>}
        </div>
      </div>
    </div>
    <div id="search-resource-panel" role="tabpanel" aria-labelledby={`search-tab-${category}`}>
      {visible.length ? <ul className="search-resource-list">{visible.map(item => <SearchResultCard key={item.key} item={item} active={activeItem(item)} inspecting={inspecting} inspect={inspect} hover={hover} cancelHover={() => clearTimeout(hoverTimer.current)} abstractsExpanded={abstractsExpanded} onSave={onSaveResource} saved={isResourceSaved?.(item.source) || false} saving={savingResourceKey === `${item.source.run_id}:${item.source.source_ref}`} />)}</ul> : !showSkeleton || filteredEmpty ? <div className="search-category-empty" data-testid={`search-empty-${category}`}><h3>{filteredEmpty ? emptyHeading : jobEmptyHeading || emptyHeading}</h3><p>{filteredEmpty ? emptyMessage : jobEmptyMessage || emptyMessage}</p></div> : null}
      {showSkeleton && <><p className="search-loading-status">{pending ? 'Starting your search…' : openingSearch ? 'Opening saved results…' : `Loading more ${category === 'video' ? 'videos' : 'papers'}…`}{!openingSearch && ' Available results stay ready to explore.'}</p><SearchSkeleton category={category} count={visible.length ? 2 : 3} /></>}
    </div>
    {!!related.length && <details className="search-related-results"><summary>Related or uncertain records ({related.length})<Icon name="chevron" /></summary><p>These records are excluded from the primary result count and answer evidence.</p><ul className="search-resource-list">{related.map(item => <SearchResultCard key={item.key} item={item} active={activeItem(item)} inspecting={inspecting} inspect={inspect} hover={hover} cancelHover={() => clearTimeout(hoverTimer.current)} abstractsExpanded={abstractsExpanded} onSave={onSaveResource} saved={isResourceSaved?.(item.source) || false} saving={savingResourceKey === `${item.source.run_id}:${item.source.source_ref}`} related />)}</ul></details>}
    </>}

    {!!history.length && <details className="search-results-details"><summary>Saved searches<Icon name="chevron" /></summary><label className="search-results-history">Choose saved results<select aria-label="Saved searches" value={id || ''} onChange={event => { if (event.target.value) onChooseSearch(event.target.value); }}><option value="">Choose saved results</option>{history.map(item => <option key={item.id} value={item.id}>{item.title || 'Untitled search'}</option>)}</select></label></details>}
  </section>;
}

function SearchSkeleton({ category, count }: { category: SearchCategory; count: number }) {
  return <div className="search-skeleton-list" data-testid="search-results-skeleton" data-category={category} aria-hidden="true">{Array.from({ length: count }, (_, index) => <div key={index} className={`search-skeleton-card${category === 'video' ? ' video' : ''}`}>
    {category === 'video' && <span className="search-skeleton-thumb" />}
    <div><span className="search-skeleton-line short" /><span className="search-skeleton-line title" /><span className="search-skeleton-line" /><span className="search-skeleton-line" /><span className="search-skeleton-line short" /></div>
  </div>)}</div>;
}
