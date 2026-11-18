'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './icon';
import ResearchScoutMark from './research-scout-mark';
import SearchAtom from './search-atom';
import Link from 'next/link';
import CreditMeter from './credit-meter';
import WorkspaceAccount from './workspace-account';
import { useLoadTiming } from '@/lib/load-timing';
import { latestSourceRecords, newerSource } from '@/lib/source-versions';
import Tooltip from './tooltip';
import ConnectedSources from './connected-sources';
import ExplorationChat from './exploration-chat';
import SearchResults from './search-results';
import type { SearchCategory } from '@/lib/search-resources';
import SearchOptions from './search-options';
import ResearchProjects from './research-projects';
import { mergeProjects, projectHasSource, type ProjectQuery, type ResearchProject } from '@/lib/projects';
import { DEFAULT_SEARCH_PREFERENCES, SEARCH_PREFERENCES_KEY, publicationYears, readSearchPreferences, type SearchPreferences } from '@/lib/search-preferences';
import type { ChatSource, Conversation, ConversationSummary, RetrievalConfig, RoutingMode } from '@/lib/conversations';
import SourcePreview, { SourcePreviewLoading, type PreviewTab } from './source-preview';
import { SavedRunCache } from '@/lib/saved-run-cache';
import { ApiError, DISCOVERY_PROVIDERS, humanStatus, isActive, isSuccess, normalStatus, providerLabel, providerReadiness, providerRetrieval, providerRole, request, sourcePath, sourceTitle, type ExportResult, type Provider, type ProviderId, type RunSummary, type Snapshot, type Source } from '@/lib/api';

type View = 'research' | 'saved' | 'notes';
type Connection = 'connecting' | 'connected' | 'reconnecting' | 'saved';
type InspectionScope = { sourceRef: string; conversationId: string | null; searchId?: string | null };
type ProjectQueryContext = { conversation_id?: string; run_id?: string; turn_id?: string };
const FALLBACK_PROVIDERS: Provider[] = [
  { id: 'openalex', label: 'OpenAlex', role: 'primary', status: 'pending' },
  { id: 'semantic_scholar', label: 'Semantic Scholar', role: 'complementary', status: 'unavailable' },
];
const EMPTY_MESSAGE = 'Enter a question to begin a focused search.';
function message(error: unknown) { return error instanceof Error ? error.message : 'Something interrupted this action. Please try again.'; }
function dateLabel(value?: string) {
  if (!value) return 'Observation date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function displayValue(value: unknown): string {
  if (value == null) return 'Not supplied';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  return JSON.stringify(value);
}
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function normalizeSnapshot(snapshot: Snapshot): Snapshot {
  return { ...snapshot, entities: snapshot.entities || [], selections: snapshot.selections || {}, checks: snapshot.checks || {}, operations: snapshot.operations || {}, warnings: snapshot.warnings || [] };
}

export default function ResearchWorkspace() {
  const [view, setView] = useState<View>('research');
  const [workspaceMode, setWorkspaceMode] = useState<'discover' | 'explore'>('discover');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [searchConversationId, setSearchConversationId] = useState<string | null>(null);
  const [searchTurnId, setSearchTurnId] = useState<string | null>(null);
  const preferredSearchTurn = useRef<string | null>(null);
  const [searchRunning, setSearchRunning] = useState(false);
  const [informationToolbarHost, setInformationToolbarHost] = useState<HTMLDivElement | null>(null);
  const [informationDetailsHost, setInformationDetailsHost] = useState<HTMLDivElement | null>(null);
  const liveSearchStarts = useRef(new Map<string, { turnId: string; startedAt: number; elapsedMs?: number }>());
  const rememberFirstEvidence = useCallback((id: string, turnId: string, elapsedMs: number) => {
    const started = liveSearchStarts.current.get(id);
    if (started?.turnId === turnId && started.elapsedMs === undefined) started.elapsedMs = elapsedMs;
  }, []);
  const [providers, setProviders] = useState<Provider[]>(FALLBACK_PROVIDERS);
  const [providersReady, setProvidersReady] = useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [searchHistory, setSearchHistory] = useState<ConversationSummary[]>([]);
  const bootstrapReads = useRef<{
    providers?: Promise<{ providers: Provider[] }>;
    runs?: Promise<{ runs: RunSummary[] }>;
    config?: Promise<{ retrieval?: RetrievalConfig }>;
    history?: Promise<{ conversations: ConversationSummary[] }>;
  }>({});
  const [searchFilters, setSearchFilters] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeConceptId, setActiveConceptId] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projectsError, setProjectsError] = useState('');
  const [pendingProjectResource, setPendingProjectResource] = useState<ChatSource | null>(null);
  const [pendingProjectQuery, setPendingProjectQuery] = useState<ProjectQueryContext | null>(null);
  const latestSearchTurn = useRef<{ conversationId: string; turnId: string } | null>(null);
  const [projectSourcePin, setProjectSourcePin] = useState<{ runId: string; source: Source } | null>(null);
  const [savingResourceKey, setSavingResourceKey] = useState<string | null>(null);
  const activeProject = projects.find(item => item.id === activeProjectId);
  const metadataClock = useLoadTiming(), detailClock = useLoadTiming();
  const sourceOpenSequence = useRef(0);
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('paper');
  const [pendingPreview, setPendingPreview] = useState<{ sequence: number; kind: 'paper' | 'video'; searchId: string } | null>(null);
  const [videoPlaybackRequest, setVideoPlaybackRequest] = useState<{ runId: string; sourceRef: string; sequence: number } | null>(null);
  const submissionSequence = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const savedRunCache = useRef(new SavedRunCache());
  const activeRun = useRef<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const questionEdited = useRef(false);
  const questionBytes = new TextEncoder().encode(question).length;
  const questionTooLong = questionBytes > 2000;
  const [routing, setRouting] = useState<RoutingMode>('auto');
  const [provider, setProvider] = useState<ProviderId>('openalex');
  const [searchPreferences, setSearchPreferences] = useState<SearchPreferences>(DEFAULT_SEARCH_PREFERENCES);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const auxiliaryEnabled = searchPreferences.modalityLimits.datasets > 0 || searchPreferences.modalityLimits.repos > 0;
  const literatureEnabled = searchPreferences.modalityLimits.papers > 0 || searchPreferences.modalityLimits.videos > 0;
  const allModalitiesOff = Object.values(searchPreferences.modalityLimits).every(limit => limit === 0);
  const { from: yearFrom, to: yearTo } = publicationYears(searchPreferences);
  function updateSearchPreferences(next: SearchPreferences) {
    setSearchPreferences(next);
    try { localStorage.setItem(SEARCH_PREFERENCES_KEY, JSON.stringify(next)); } catch { /* Current choices still work when storage is unavailable. */ }
  }
  function setYearFrom(value: string) { updateSearchPreferences({ ...searchPreferences, datePreset: 'custom', customFrom: value, customTo: yearTo }); }
  function setYearTo(value: string) { updateSearchPreferences({ ...searchPreferences, datePreset: 'custom', customFrom: yearFrom, customTo: value }); }
  const [orderedRefs, setOrderedRefs] = useState<string[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [inspectionScope, setInspectionScope] = useState<InspectionScope | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [starting, setStarting] = useState(false);
  const [retrievalConfig, setRetrievalConfig] = useState<RetrievalConfig>({ enabled: false, ready: false, status: 'loading' });
  const startLock = useRef(false);
  function abandonPendingSearch() {
    submissionSequence.current++;
    startLock.current = false; setStarting(false);
  }
  const pendingReviewed = useRef<{ signature: string; key: string; conversationId?: string; revision?: number } | null>(null);
  const [pendingReviewedId, setPendingReviewedId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [connection, setConnection] = useState<Connection>('saved');
  const [streamGeneration, setStreamGeneration] = useState(0);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [readerError, setReaderError] = useState<{ key: string; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState(EMPTY_MESSAGE);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [rankingApplied, setRankingApplied] = useState(false);
  const searchRef = useRef<HTMLTextAreaElement>(null);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const inspectorRef = useRef<HTMLDialogElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const providersRef = useRef<HTMLDialogElement>(null);
  const searchSettingsRef = useRef<HTMLDetailsElement>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('overview');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [showExcerpts, setShowExcerpts] = useState(false);
  const [resultFilter, setResultFilter] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);
  const passivePreview = useRef(false);

  function updateProject(project: ResearchProject) {
    setProjects(previous => mergeProjects(previous, [project]));
  }
  function selectProject(id: string) {
    setActiveProjectId(id || null); setActiveConceptId('');
    try { if (id) localStorage.setItem('research-scout:active-project', id); else localStorage.removeItem('research-scout:active-project'); } catch { /* Project contents stay on the backend. */ }
  }
  async function refreshProjects() {
    try { const result = await request<{ projects: ResearchProject[] }>('/projects'); setProjects(previous => mergeProjects(previous, result.projects)); setProjectsError(''); }
    catch (failure) { setProjectsError(`Projects could not be loaded. ${message(failure)}`); }
  }
  useEffect(() => {
    let current = true;
    void request<{ projects: ResearchProject[] }>('/projects').then(result => {
      if (!current) return;
      setProjects(previous => mergeProjects(previous, result.projects));
      try { const previous = localStorage.getItem('research-scout:active-project'); if (result.projects.some(item => item.id === previous)) setActiveProjectId(previous); } catch { /* Current project selection still works. */ }
    }).catch(failure => { if (current) setProjectsError(`Projects could not be loaded. ${message(failure)}`); });
    return () => { current = false; };
  }, []);

  async function attachProjectQuery(projectId: string, context: { conversation_id?: string; run_id?: string; turn_id?: string }, conceptIds: string[] = []) {
    const project = await request<ResearchProject>(`/projects/${encodeURIComponent(projectId)}/queries`, { method: 'POST', body: JSON.stringify({ ...context, concept_ids: conceptIds }) });
    updateProject(project);
  }
  async function saveProjectSource(source: ChatSource, projectId: string, conceptIds: string[] = []) {
    const key = `${source.run_id}:${source.source_ref}`;
    setSavingResourceKey(key);
    try {
      const project = await request<ResearchProject>(`/projects/${encodeURIComponent(projectId)}/resources`, { method: 'POST', body: JSON.stringify({ run_id: source.run_id, source_ref: source.source_ref, version: source.version, concept_ids: conceptIds }) });
      updateProject(project); setNotice(`Saved to ${project.name}${conceptIds.length ? ` · ${project.concepts.find(item => item.id === conceptIds[0])?.name || 'concept'}` : ''}`); setPendingProjectResource(null);
    } finally { setSavingResourceKey(previous => previous === key ? null : previous); }
  }
  function saveResource(source: ChatSource) {
    if (!activeProject) { setPendingProjectResource(source); setPendingProjectQuery(null); setProjectsOpen(true); return; }
    void saveProjectSource(source, activeProject.id, activeConceptId ? [activeConceptId] : []).catch(failure => setError(`This resource was not saved to the project. ${message(failure)}`));
  }
  function currentQueryContext(): ProjectQueryContext | null {
    if (workspaceMode === 'explore') return conversationId ? { conversation_id: conversationId } : null;
    return searchConversationId ? { conversation_id: searchConversationId, ...(latestSearchTurn.current?.conversationId === searchConversationId ? { turn_id: latestSearchTurn.current.turnId } : {}) } : runId ? { run_id: runId } : null;
  }
  async function addCurrentQuery(projectId: string, conceptIds: string[] = [], context = currentQueryContext()) {
    if (!context) throw new Error('Run or open a saved query first.');
    await attachProjectQuery(projectId, context, conceptIds);
    setPendingProjectQuery(null); setNotice('Research query added to project.');
  }
  function saveCurrentQuery() {
    if (!activeProject) { setPendingProjectQuery(currentQueryContext()); setPendingProjectResource(null); setProjectsOpen(true); return; }
    void addCurrentQuery(activeProject.id, activeConceptId ? [activeConceptId] : []).catch(failure => setError(`The query was not added to the project. ${message(failure)}`));
  }
  function openProjectQuery(query: ProjectQuery) {
    setProjectsOpen(false);
    if (query.conversation_id) {
      questionEdited.current = false; setQuestion(query.question || query.title);
      openSearchResults(query.conversation_id, false, query.turn_id || null);
    }
    else if (query.run_id) { setSearchConversationId(null); void openRun(query.run_id); }
  }
  function openProjectSource(source: ChatSource) {
    setProjectsOpen(false);
    if (searchConversationId) void openSearchSource(source, { pinned: source }).then(() => setNotice(`Reading saved project observation · version ${source.version}`)).catch(failure => setError(message(failure)));
    else { setSearchConversationId(null); void openRun(source.run_id, { sourceRef: source.source_ref, conversationId: null }).then(opened => { if (opened) { setProjectSourcePin({ runId: source.run_id, source }); setNotice(`Reading saved project observation · version ${source.version}`); } }); }
  }

  const applySnapshot = useCallback((incoming: Snapshot) => {
    const saved = savedRunCache.current.remember(normalizeSnapshot(incoming));
    if (activeRun.current !== incoming.id) return;
    if (snapshotRef.current?.id === incoming.id && snapshotRef.current.revision > saved.revision) return;
    const next = saved;
    snapshotRef.current = next; setSnapshot(next);
    setLastSynced(new Date().toISOString());
    setOrderedRefs(previous => {
      const known = new Set(previous);
      return [...previous, ...next.entities.filter(entity => {
        if (known.has(entity.source_ref) || entity.eligible === false && next.selections[entity.source_ref]?.state !== 'included') return false;
        known.add(entity.source_ref); return true;
      }).map(entity => entity.source_ref)];
    });
    setRuns(previous => [{ id: next.id, question: next.question, provider: next.provider, status: next.status, created_at: next.created_at }, ...previous.filter(run => run.id !== next.id)].slice(0, 12));
  }, []);

  const refreshSnapshot = useCallback(async (id: string) => {
    const next = await savedRunCache.current.load(id, () => request<Snapshot>(`/research-runs/${encodeURIComponent(id)}/snapshot`), true);
    applySnapshot(next); return next;
  }, [applySnapshot]);

  useEffect(() => {
    const updated = (event: Event) => {
      const detail = (event as CustomEvent<{ runId?: string; snapshot?: Snapshot }>).detail;
      if (!detail?.runId) return;
      const cached = savedRunCache.current.peek(detail.runId);
      savedRunCache.current.invalidate(detail.runId);
      const next = detail.snapshot;
      if (next?.id === detail.runId && Array.isArray(next.entities) && Number.isInteger(next.revision)) {
        const current = snapshotRef.current?.id === detail.runId ? snapshotRef.current : undefined;
        // A slower mutation response can arrive after a newer stream state.
        applySnapshot([next, cached, current].filter((item): item is Snapshot => !!item).sort((a, b) => b.revision - a.revision)[0]);
      }
    };
    window.addEventListener('scout:saved-run-updated', updated);
    return () => window.removeEventListener('scout:saved-run-updated', updated);
  }, [applySnapshot]);

  const openRun = useCallback(async (id: string, scope: InspectionScope | null = null) => {
    abandonPendingSearch();
    const sequence = ++sourceOpenSequence.current;
    setOpening(true); setError('');
    try {
      const saved = normalizeSnapshot(await savedRunCache.current.load(id, () => request<Snapshot>(`/research-runs/${encodeURIComponent(id)}/snapshot`)));
      if (sequence !== sourceOpenSequence.current) return null;
      setProjectSourcePin(null);
      setWorkspaceMode('discover'); if (!scope) setRouting('manual');
      if (searchSettingsRef.current) searchSettingsRef.current.open = false;
      setSearchConversationId(previous => scope?.searchId || (scope?.conversationId ? previous : null)); setSearchRunning(false);
      activeRun.current = id; setOrderedRefs([]); setRankingApplied(false); setInspectionScope(scope); setSelectedRef(scope?.sourceRef ?? null); setPreviewTab('overview'); setResultFilter(''); setView('research');
      if (scope?.conversationId) setConversationId(scope.conversationId);
      applySnapshot(saved); setRunId(id); setStreamGeneration(value => value + 1);
      if (!scope) { setQuestion(saved.question); setProvider(saved.provider); }
      setMenuOpen(false);
      const params = new URLSearchParams({ run: id });
      if (scope) { params.set('source', scope.sourceRef); if (scope.conversationId) params.set('from_conversation', scope.conversationId); if (scope.searchId) params.set('from_search', scope.searchId); }
      window.history.replaceState(null, '', `?${params.toString()}`);
      try { localStorage.setItem('research-scout:last-run', id); } catch { /* A saved run remains on the backend. */ }
      return true;
    } catch (failure) {
      if (sequence !== sourceOpenSequence.current) return null;
      setError(`This saved research could not be opened. ${message(failure)}`); return false;
    }
    finally { if (sequence === sourceOpenSequence.current) setOpening(false); }
  }, [applySnapshot]);

  useEffect(() => {
    let mounted = true, sequence = 0;
    const refresh = (initial = false) => {
      const ticket = ++sequence;
      const read = initial ? (bootstrapReads.current.config ??= request<{ retrieval?: RetrievalConfig }>('/config')) : request<{ retrieval?: RetrievalConfig }>('/config');
      void read.then(result => {
        if (mounted && ticket === sequence) setRetrievalConfig(result.retrieval || { enabled: false, ready: false, status: 'disabled' });
      }).catch(() => { if (mounted && ticket === sequence) setRetrievalConfig({ enabled: false, ready: false, status: 'unavailable' }); });
    };
    refresh(true);
    const changed = () => refresh();
    window.addEventListener('scout:economics-balance-changed', changed);
    return () => { mounted = false; window.removeEventListener('scout:economics-balance-changed', changed); };
  }, []);

  useEffect(() => {
    let mounted = true;
    // Keep independent startup reads shared when React reconnects effects.
    // Each effect still has its own mounted fence and can apply the result.
    void (bootstrapReads.current.providers ??= request<{ providers: Provider[] }>('/providers')).then(result => {
      if (mounted) { setProviders(result.providers); setProvidersReady(true); }
    }).catch(failure => { if (mounted) setError(`The research service is unavailable. ${message(failure)}`); });
    void (bootstrapReads.current.runs ??= request<{ runs: RunSummary[] }>('/research-runs?summary=true&limit=12')).then(result => {
      if (mounted) setRuns(previous => {
        const merged = new Map(result.runs.map(item => [item.id, item]));
        for (const item of previous) merged.set(item.id, item);
        return [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12);
      });
    }).catch(failure => { if (mounted) setError(`Saved research is temporarily unavailable. ${message(failure)}`); });
    void (bootstrapReads.current.history ??= request<{ conversations: ConversationSummary[] }>('/conversations')).then(result => {
      if (mounted) setSearchHistory(previous => {
        const merged = new Map(result.conversations.map(item => [item.id, item]));
        for (const item of previous) {
          const loaded = merged.get(item.id);
          if (!loaded || item.updated_at >= loaded.updated_at) merged.set(item.id, item);
        }
        return [...merged.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      });
    }).catch(() => undefined);
    setSearchPreferences(readSearchPreferences()); setPreferencesReady(true);
    const params = new URLSearchParams(window.location.search);
    const savedSearch = params.get('search');
    const savedConversation = params.get('conversation');
    const landingDraft = params.get('q');
    if (landingDraft && !savedSearch && !savedConversation && !params.get('run')) {
      setQuestion(landingDraft.slice(0, 4000));
      setWorkspaceMode('discover');
      return () => { mounted = false; };
    }
    if (savedSearch) { preferredSearchTurn.current = params.get('turn'); setSearchTurnId(preferredSearchTurn.current); setSearchConversationId(savedSearch); setConversationId(savedSearch); setWorkspaceMode('discover'); return () => { mounted = false; }; }
    if (savedConversation) { setConversationId(savedConversation); setWorkspaceMode('explore'); }
    let id = params.get('run');
    if (savedConversation) return () => { mounted = false; };
    if (!id) { try { const previousSearch = localStorage.getItem('research-scout:last-search'); if (previousSearch) { setSearchConversationId(previousSearch); setConversationId(previousSearch); return () => { mounted = false; }; } id = localStorage.getItem('research-scout:last-run'); } catch { /* URL and backend history still work. */ } }
    if (id) void openRun(id, params.has('source') ? { sourceRef: params.get('source') || '', conversationId: params.get('from_conversation'), searchId: params.get('from_search') } : null);
    return () => { mounted = false; };
  }, [openRun]);

  const refinementReady = retrievalConfig.enabled && retrievalConfig.ready;
  const exactDoiQuestion = /^(?:https?:\/\/doi\.org\/|doi:\s*)?10\.\d{4,9}\/\S+$/i.test(question.trim());
  const refinementReason = retrievalConfig.blocked_reason || (retrievalConfig.status === 'loading'
    ? 'Checking AI query-refinement availability.'
    : retrievalConfig.status === 'unavailable'
      ? 'AI query-refinement availability could not be loaded. Refresh the page to check again.'
      : 'AI query refinement is unavailable. Turn off AI refinement to search directly.');

  useEffect(() => {
    if (!runId) return;
    let disposed = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let needsResubscribe = false;
    const recoverSavedState = () => {
      if (poll) return;
      poll = setInterval(() => {
        void refreshSnapshot(runId).then(() => {
          if (!disposed && needsResubscribe) setStreamGeneration(value => value + 1);
        }).catch(() => undefined);
      }, 3000);
    };
    const cursor = snapshotRef.current?.cursor;
    const stream = new EventSource(`/api/research-runs/${encodeURIComponent(runId)}/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    setConnection('connecting');
    stream.onopen = () => { if (!disposed) { setConnection('connected'); if (poll) clearInterval(poll); poll = undefined; } };
    stream.addEventListener('state', event => {
      if (disposed) return;
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as { snapshot: Snapshot };
        if (payload.snapshot) { applySnapshot(payload.snapshot); setConnection('connected'); }
      } catch { setConnection('reconnecting'); }
    });
    stream.addEventListener('resync.required', () => {
      needsResubscribe = true; stream.close();
      if (!disposed) void refreshSnapshot(runId).then(() => {
        if (!disposed) setStreamGeneration(value => value + 1);
      }).catch(() => { setConnection('reconnecting'); recoverSavedState(); });
    });
    stream.onerror = () => {
      if (disposed) return;
      setConnection('reconnecting');
      // Read-only recovery never starts another run or repeats provider/model work.
      recoverSavedState();
    };
    return () => { disposed = true; stream.close(); if (poll) clearInterval(poll); };
  }, [runId, streamGeneration, applySnapshot, refreshSnapshot]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const update = () => setIsMobile(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobile || !menuOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    const controls = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]') || []);
    controls()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    sidebar?.addEventListener('keydown', trap);
    return () => { sidebar?.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); };
  }, [isMobile, menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]');
      if (!document.querySelector('dialog[open]') && ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' || event.key === '/' && !typing)) {
        event.preventDefault(); setView('research'); searchRef.current?.focus();
      }
      if (event.key === 'Escape') setMenuOpen(false);
      if (!typing && !document.querySelector('dialog[open]') && event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); newResearch(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const dialog = inspectorRef.current;
    const shouldOpen = selectedRef && !inspectionScope?.searchId && isMobile && mobilePreviewOpen;
    if (shouldOpen && dialog && !dialog.open) dialog.showModal();
    if (!shouldOpen && dialog?.open) dialog.close();
  }, [selectedRef, isMobile, mobilePreviewOpen, inspectionScope]);

  useEffect(() => {
    if (!inspectionScope?.searchId || !selectedRef) return;
    if (passivePreview.current) return;
    const panel = document.querySelector<HTMLElement>('.search-source-panel');
    panel?.querySelector<HTMLElement>('[aria-label="Close source details"]')?.focus({ preventScroll: true });
    if (isMobile) panel?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [inspectionScope?.searchId, selectedRef, isMobile]);

  useEffect(() => {
    if (!selectedRef || isMobile && !inspectionScope?.searchId) return;
    const returnToSource = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); closeInspector(); }
    };
    window.addEventListener('keydown', returnToSource);
    return () => window.removeEventListener('keydown', returnToSource);
  }, [isMobile, selectedRef, inspectionScope?.searchId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const sourceByRef = useMemo(() => new Map(latestSourceRecords(snapshot?.entities || []).map(entity => [entity.source_ref, entity])), [snapshot?.entities]);
  const includedCount = Object.values(snapshot?.selections || {}).filter(selection => selection.state === 'included').length;
  const rawRows = orderedRefs.map(ref => sourceByRef.get(ref)).filter((source): source is Source => !!source && (source.eligible !== false || snapshot?.selections[source.source_ref]?.state === 'included'));
  const pinnedSource = inspectionScope ? sourceByRef.get(inspectionScope.sourceRef) : undefined;
  const allRows = inspectionScope ? (pinnedSource ? [pinnedSource] : []) : rawRows;
  const viewRows = view === 'saved' ? allRows.filter(source => snapshot?.selections[source.source_ref]?.state === 'included') : view === 'notes' ? allRows.filter(source => snapshot?.selections[source.source_ref]?.reason?.trim()) : allRows;
  const rows = inspectionScope ? allRows : viewRows.filter(source => `${sourceTitle(source)} ${source.authors?.join(' ') || ''} ${source.year || ''}`.toLowerCase().includes(resultFilter.toLowerCase().trim()));
  const currentRecord = inspectionScope ? pinnedSource : (selectedRef ? sourceByRef.get(selectedRef) : undefined) || (!isMobile ? rows[0] : undefined);
  const currentSource = projectSourcePin && projectSourcePin.runId === snapshot?.id && projectSourcePin.source.source_ref === currentRecord?.source_ref ? projectSourcePin.source : currentRecord;
  // Pin the first desktop preview without moving focus. Later arrivals or eligibility
  // changes must not replace a record whose notes the user is already editing.
  const firstVisibleRef = rows[0]?.source_ref;
  useEffect(() => {
    if (!isMobile && !selectedRef && firstVisibleRef) setSelectedRef(firstVisibleRef);
  }, [isMobile, selectedRef, firstVisibleRef]);
  const running = !!snapshot && isActive(snapshot.status);
  const mode = snapshot?.runtime?.mode || snapshot?.mode || providers.find(item => item.id === provider)?.mode;
  const isFixture = mode?.toLowerCase().includes('fixture');
  const branches = ['lexical', 'semantic'] as const;
  const branchesFinished = !!snapshot && branches.every(branch => snapshot.operations[branch] && !isActive(snapshot.operations[branch].status));
  const completeHybrid = !!snapshot && branches.every(branch => isSuccess(snapshot.operations[branch]?.status));
  const selectedProvider = providers.find(item => item.id === provider);
  const manualProviderUnavailable = ['unavailable', 'disabled', 'unconfigured', 'blocked', 'not_configured', 'needs_access', 'configuration_error'].includes(normalStatus(selectedProvider?.status));
  const providerUnavailable = routing === 'manual' ? manualProviderUnavailable : !providers.some(item => DISCOVERY_PROVIDERS.includes(item.id as ProviderId) && item.access_configured !== false && !['unavailable', 'disabled', 'unconfigured', 'blocked', 'not_configured', 'needs_access', 'configuration_error'].includes(normalStatus(item.status)));
  const draftKey = currentSource && snapshot ? `${snapshot.id}:${currentSource.source_ref}` : '';
  const reason = reasonDrafts[draftKey] ?? (currentSource ? snapshot?.selections[currentSource.source_ref]?.reason : '') ?? '';

  const progressSignature = snapshot ? `${snapshot.id}|${allRows.length}|${snapshot.status}|${branches.map(branch => snapshot.operations[branch]?.status).join('|')}` : '';
  useEffect(() => {
    if (!snapshot) return;
    const timer = setTimeout(() => setAnnouncement(`${allRows.length} ${allRows.length === 1 ? 'source' : 'sources'} available. ${branches.map(branch => `${branch} ${humanStatus(snapshot.operations[branch]?.status)}`).join('. ')}. ${running ? 'You can inspect and save sources while research continues.' : `Research ${humanStatus(snapshot.status)}.`}`), 800);
    return () => clearTimeout(timer);
  // Coalesce source/status updates; individual field changes do not announce the list again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressSignature]);

  async function startResearch(event: React.FormEvent) {
    event.preventDefault(); setError(''); setReaderError(null);
    if (startLock.current || searchRunning) return;
    if (!question.trim()) { searchRef.current?.focus(); return; }
    if (questionTooLong) { searchRef.current?.focus(); return; }
    const topicSearch = !exactDoiQuestion;
    if (topicSearch && allModalitiesOff) { setError('Enable at least one result type in Limits before searching.'); return; }
    if (topicSearch && searchPreferences.aiRefinement && !refinementReady) { setError(`AI refinement is unavailable. ${refinementReason} Turn off AI refinement to search directly.`); return; }
    const effectiveYears = publicationYears(searchPreferences);
    const from = effectiveYears.from ? Number(effectiveYears.from) : null, to = effectiveYears.to ? Number(effectiveYears.to) : null;
    if (topicSearch && !auxiliaryEnabled && routing === 'auto' && !searchPreferences.sources.length) { setError('Select at least one discovery source, or enable Data or Repos in Limits.'); return; }
    if (topicSearch && literatureEnabled && [from, to].some(year => year != null && (!Number.isInteger(year) || year < 1500 || year > 2200))) {
      setError('Choose whole publication years between 1500 and 2200.'); return;
    }
    if (topicSearch && literatureEnabled && from && to && from > to) { setError('The start year must be earlier than or equal to the end year.'); return; }
    sourceOpenSequence.current++;
    setOpening(false);
    const submission = ++submissionSequence.current;
    const searchStartedAt = performance.now();
    const queryProject = activeProjectId, queryConcepts = activeConceptId ? [activeConceptId] : [];
    startLock.current = true; setStarting(true);
    if (searchSettingsRef.current) searchSettingsRef.current.open = false;
    searchFormRef.current?.querySelectorAll<HTMLDetailsElement>('.source-picker[open]').forEach(picker => { picker.open = false; });
    let reviewedDispatch = false;
    try {
      const filters = topicSearch && literatureEnabled ? { year_from: from, year_to: to } : {};
      const sourceScope = topicSearch && routing === 'auto' ? { source_scope: literatureEnabled ? searchPreferences.sources : [] } : {};
      const manualProviders = topicSearch && routing === 'manual' ? { providers: [provider] } : {};
      const action = topicSearch ? 'discover' : 'lookup';
      const signature = JSON.stringify({ question, action, video_count: searchPreferences.videoCount, routing, ...sourceScope, ...manualProviders, filters, ...(topicSearch ? { agentic: searchPreferences.aiRefinement, modality_limits: searchPreferences.modalityLimits } : {}) });
      if (pendingReviewed.current?.signature !== signature) pendingReviewed.current = { signature, key: crypto.randomUUID() };
      const pending = pendingReviewed.current;
      if (!pending.conversationId) {
        const created = await request<Conversation>('/conversations', { method: 'POST', body: JSON.stringify({ routing, video_count: searchPreferences.videoCount, ...(literatureEnabled && searchPreferences.sources.length ? sourceScope : {}), ...manualProviders, filters }) });
        if (submission !== submissionSequence.current) return;
        pending.conversationId = created.id; pending.revision = created.revision; setPendingReviewedId(created.id);
      }
      reviewedDispatch = true;
      const accepted = await request<Conversation>(`/conversations/${encodeURIComponent(pending.conversationId)}/turns`, { method: 'POST', body: JSON.stringify({ message: question, action, video_count: searchPreferences.videoCount, routing, ...sourceScope, ...manualProviders, filters, ...(topicSearch ? { agentic: searchPreferences.aiRefinement, modality_limits: searchPreferences.modalityLimits } : {}), idempotency_key: pending.key, expected_revision: pending.revision }) });
      if (queryProject) void attachProjectQuery(queryProject, { conversation_id: accepted.id, ...(accepted.turns.at(-1)?.id ? { turn_id: accepted.turns.at(-1)!.id } : {}) }, queryConcepts).catch(failure => setProjectsError(`Search was saved, but its project link could not be added. ${message(failure)}`));
      setSearchHistory(previous => [{ id: accepted.id, title: accepted.title, updated_at: accepted.updated_at, status: accepted.status }, ...previous.filter(item => item.id !== accepted.id)]);
      if (submission !== submissionSequence.current) return;
      pendingReviewed.current = null; setPendingReviewedId(null);
      const acceptedTurn = accepted.turns.at(-1);
      if (acceptedTurn) {
        liveSearchStarts.current.set(accepted.id, { turnId: acceptedTurn.id, startedAt: searchStartedAt });
        while (liveSearchStarts.current.size > 20) liveSearchStarts.current.delete(liveSearchStarts.current.keys().next().value!);
      }
      openSearchResults(accepted.id);
    } catch (failure) {
      if (submission !== submissionSequence.current) return;
      setError(reviewedDispatch && (!(failure instanceof ApiError) || failure.status >= 500) ? `The ${topicSearch ? 'reviewed-search' : 'DOI-lookup'} response was interrupted; the request may already be running. Open its saved search results before sending another request. ${message(failure)}` : message(failure));
    }
    finally { if (submission === submissionSequence.current) { startLock.current = false; setStarting(false); } }
  }

  const applySearchMetadata = useCallback((saved: Conversation) => {
    setSearchHistory(previous => [{ id: saved.id, title: saved.title, updated_at: saved.updated_at, status: saved.status }, ...previous.filter(item => item.id !== saved.id)]);
    const turn = preferredSearchTurn.current ? saved.turns.find(item => item.id === preferredSearchTurn.current) : saved.turns.findLast(item => item.action === 'discover' || item.action === 'lookup');
    if (turn) latestSearchTurn.current = { conversationId: saved.id, turnId: turn.id };
    if (turn && !questionEdited.current) setQuestion(turn.message);
    // Reading old results must not replace the user's next-search defaults.
    if (pendingReviewed.current?.conversationId === saved.id && saved.turns.length) { pendingReviewed.current = null; setPendingReviewedId(null); }
  }, []);

  function openSearchResults(id: string, preserveReader = false, turnId?: string | null) {
    const selectedTurn = turnId !== undefined ? turnId : preserveReader && id === searchConversationId ? preferredSearchTurn.current : null;
    preferredSearchTurn.current = selectedTurn; setSearchTurnId(selectedTurn);
    if (selectedTurn) latestSearchTurn.current = { conversationId: id, turnId: selectedTurn };
    if (!preserveReader) setProjectSourcePin(null);
    abandonPendingSearch();
    sourceOpenSequence.current++;
    setOpening(false);
    if (id !== searchConversationId) questionEdited.current = false;
    if (searchSettingsRef.current) searchSettingsRef.current.open = false;
    setSearchConversationId(id); setConversationId(id); if (id !== searchConversationId) setSearchRunning(true);
    setWorkspaceMode('discover'); setView('research'); setError(''); setMenuOpen(false); setInspectionScope(null);
    setRunId(null);
    if (!preserveReader) { activeRun.current = null; snapshotRef.current = null; setSnapshot(null); setOrderedRefs([]); setSelectedRef(null); }
    window.history.replaceState(null, '', `?search=${encodeURIComponent(id)}${selectedTurn ? `&turn=${encodeURIComponent(selectedTurn)}` : ''}`);
    try { localStorage.setItem('research-scout:last-search', id); } catch { /* Saved reads remain available by URL. */ }
  }

  function openReviewedConversation(id: string) {
    abandonPendingSearch();
    sourceOpenSequence.current++;
    setOpening(false); setInspectionScope(null); setMobilePreviewOpen(false); setSelectedRef(null);
    setConversationId(id); setWorkspaceMode('explore'); setView('research'); setError(''); setMenuOpen(false);
    window.history.replaceState(null, '', `?conversation=${encodeURIComponent(id)}`);
  }

  async function mutate(key: string, path: string, body: unknown, method = 'POST') {
    const id = activeRun.current;
    if (!id) return false;
    setBusy(previous => ({ ...previous, [key]: true })); setError(''); setReaderError(null);
    const sourceRef = /^(selection|details|transcript|check):/.test(key) ? key.slice(key.indexOf(':') + 1) : null;
    const detailTicket = sourceRef && /^(details|transcript|check):/.test(key) ? detailClock.start(`${id}:${sourceRef}`, key.startsWith('transcript:') ? 'Captions' : key.startsWith('details:') ? 'Details' : 'DOI check') : null;
    let detailFailed = false;
    const reportFailure = (text: string) => { detailFailed = true; setError(text); if (sourceRef) setReaderError({ key: `${id}:${sourceRef}`, message: text }); };
    savedRunCache.current.invalidate(id);
    try {
      await request(path, { method, body: JSON.stringify(body) });
      await refreshSnapshot(id);
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409 && key.startsWith('selection:')) {
        await refreshSnapshot(id).catch(() => undefined);
        reportFailure('This research changed while you were editing. Your reason is still here. Review the latest state and apply your decision again.');
      } else reportFailure(message(failure));
      return false;
    } finally { if (detailTicket) detailClock.finish(detailTicket, detailFailed); setBusy(previous => ({ ...previous, [key]: false })); }
  }

  async function selectSource(source: Source, state: 'included' | 'excluded', nextReason?: string, citationSource?: 'discovery' | 'registry') {
    const current = snapshotRef.current;
    if (!current) return;
    const key = `${current.id}:${source.source_ref}`;
    const success = await mutate(`selection:${source.source_ref}`, `/research-runs/${encodeURIComponent(current.id)}/selections/${encodeURIComponent(source.source_ref)}`, { state, reason: nextReason ?? reasonDrafts[key] ?? current.selections[source.source_ref]?.reason ?? '', expected_revision: current.revision, citation_source: citationSource ?? current.selections[source.source_ref]?.citation_source ?? 'discovery' }, 'PUT');
    if (success) setNotice(state === 'included' ? 'Included in your saved shortlist.' : 'Source excluded. Your decision is saved.');
  }

  async function exportSelection(format: 'bibliography' | 'manifest') {
    if (!runId) return;
    setExporting(true); setError('');
    try {
      const result = await request<ExportResult>(`/research-runs/${encodeURIComponent(runId)}/exports`, { method: 'POST', body: '{}' });
      if (format === 'bibliography') download(result.bibliography, 'bibliography.md', 'text/markdown;charset=utf-8');
      else download(JSON.stringify(result.manifest, null, 2), 'manifest.json', 'application/json');
      setNotice(`Exported saved revision ${result.revision}.`);
    } catch (failure) { setError(message(failure)); }
    finally { setExporting(false); }
  }

  function inspect(source: Source, invoker: HTMLElement) {
    returnFocus.current = invoker; setReaderError(null);
    setSelectedRef(source.source_ref); setPreviewTab(view === 'notes' ? 'notes' : 'overview');
    setMobilePreviewOpen(isMobile);
    if (window.matchMedia('(min-width: 900px) and (max-width: 1150px)').matches) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.embedded-inspector')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    }
  }
  function closeInspector() {
    if (inspectorRef.current?.open) inspectorRef.current.close();
    sourceOpenSequence.current++;
    setVideoPlaybackRequest(null);
    setOpening(false);
    setMobilePreviewOpen(false);
    if (inspectionScope?.searchId) {
      setInspectionScope(null); setSelectedRef(null);
      window.history.replaceState(null, '', `?search=${encodeURIComponent(inspectionScope.searchId)}${preferredSearchTurn.current ? `&turn=${encodeURIComponent(preferredSearchTurn.current)}` : ''}`);
    } else if (isMobile) setSelectedRef(null);
    requestAnimationFrame(() => { if (returnFocus.current?.isConnected) returnFocus.current.focus(); });
  }
  function newResearch() {
    preferredSearchTurn.current = null; setSearchTurnId(null); latestSearchTurn.current = null;
    setProjectSourcePin(null);
    abandonPendingSearch();
    sourceOpenSequence.current++;
    setOpening(false);
    questionEdited.current = false;
    setWorkspaceMode('discover'); setSearchConversationId(null); setConversationId(null); setSearchRunning(false);
    pendingReviewed.current = null; setPendingReviewedId(null);
    activeRun.current = null; snapshotRef.current = null; setRunId(null); setSnapshot(null); setOrderedRefs([]); setSelectedRef(null); setInspectionScope(null);
    setView('research'); setPreviewTab('overview'); setResultFilter(''); setQuestion(''); setProvider('openalex'); setRouting('auto'); setError(''); setMenuOpen(false); setConnection('saved');
    window.history.replaceState(null, '', window.location.pathname);
    try { localStorage.removeItem('research-scout:last-run'); localStorage.removeItem('research-scout:last-search'); } catch { /* Optional navigation preference. */ }
    requestAnimationFrame(() => { searchRef.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  }
  function applyRanking() {
    setOrderedRefs(previous => [...previous].sort((a, b) => (sourceByRef.get(b)?.rank_score ?? 0) - (sourceByRef.get(a)?.rank_score ?? 0) || a.localeCompare(b)));
    setRankingApplied(true); setNotice('Saved ranking applied. Your shortlist is unchanged.');
  }

  async function openChatSource(source: ChatSource) {
    const opened = await openRun(source.run_id, { sourceRef: source.source_ref, conversationId });
    if (opened === null) return;
    if (!opened) throw new Error('The saved source could not be opened.');
    setMobilePreviewOpen(isMobile);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.workbench')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
  }

  async function openSearchSource(source: ChatSource, options?: { passive?: boolean; pinned?: Source; intent?: 'play-video' }) {
    const id = searchConversationId;
    if (!id) return;
    if (options?.passive && document.activeElement?.closest('.search-source-panel input,.search-source-panel textarea,.search-source-panel [contenteditable="true"]')) return;
    const sequence = ++sourceOpenSequence.current;
    // Playback is a fresh, explicit thumbnail intent, separate from saved
    // metadata selection. Never replay an earlier request on passive return.
    setVideoPlaybackRequest(null);
    const loadTicket = metadataClock.start(`${source.run_id}:${source.source_ref}`, 'Metadata');
    let loadFailed = false;
    passivePreview.current = !!options?.passive;
    if (!options?.passive) returnFocus.current = document.activeElement as HTMLElement | null;
    setPendingPreview({ sequence, kind: source.provider === 'youtube' || source.resource_type === 'video' ? 'video' : 'paper', searchId: id });
    try {
    const cached = savedRunCache.current.peek(source.run_id);
    const read = () => request<Snapshot>(`/research-runs/${encodeURIComponent(source.run_id)}/snapshot`);
    let saved = normalizeSnapshot(await savedRunCache.current.load(source.run_id, read));
    // Progressive conversation updates can contain a source that arrived
    // after this run's most recent cached snapshot. Read saved state once.
    if (cached && (!saved.entities.some(item => item.source_ref === source.source_ref) || saved.entities.some(item => item.source_ref === source.source_ref && String(item.version) !== String(source.version) && newerSource(item, source) === source))) saved = normalizeSnapshot(await savedRunCache.current.load(source.run_id, read, true));
    if (sequence !== sourceOpenSequence.current) return;
    if (!saved.entities.some(item => item.source_ref === source.source_ref)) throw new Error('The exact saved source is unavailable.');
    setReaderError(null);
    setProjectSourcePin(options?.pinned ? { runId: source.run_id, source: options.pinned } : null);
    activeRun.current = source.run_id; setOrderedRefs([]);
    setInspectionScope({ sourceRef: source.source_ref, conversationId: id, searchId: id });
    setSelectedRef(source.source_ref); if (!options?.passive) setPreviewTab('overview'); setError('');
    if (!options?.passive && options?.intent === 'play-video' && source.provider === 'youtube') setVideoPlaybackRequest({ runId: source.run_id, sourceRef: source.source_ref, sequence });
    applySnapshot(saved); setRunId(source.run_id);
    setMenuOpen(false); setMobilePreviewOpen(true);
    // Keep the composer, category, filter, URL and result component mounted.
    } catch (failure) { loadFailed = true; throw failure; } finally { metadataClock.finish(loadTicket, loadFailed); if (sequence === sourceOpenSequence.current) setPendingPreview(null); }
  }

  function selectWorkspaceMode(next: 'discover' | 'explore') {
    abandonPendingSearch();
    sourceOpenSequence.current++;
    setOpening(false);
    if (next === 'discover' && searchConversationId) { openSearchResults(searchConversationId, true); return; }
    if (next === 'discover' && conversationId && (workspaceMode === 'explore' || inspectionScope?.conversationId)) { openSearchResults(conversationId); return; }
    if (next === 'explore' && searchConversationId) setConversationId(searchConversationId);
    setWorkspaceMode(next);
    const url = new URL(window.location.href);
    url.searchParams.delete('run'); url.searchParams.delete('conversation'); url.searchParams.delete('search'); url.searchParams.delete('source'); url.searchParams.delete('from_conversation'); url.searchParams.delete('from_search');
    if (next === 'explore' && (searchConversationId || conversationId)) url.searchParams.set('conversation', searchConversationId || conversationId!);
    else if (next === 'discover' && runId) { url.searchParams.set('run', runId); if (inspectionScope) { url.searchParams.set('source', inspectionScope.sourceRef); if (inspectionScope.conversationId) url.searchParams.set('from_conversation', inspectionScope.conversationId); if (inspectionScope.searchId) url.searchParams.set('from_search', inspectionScope.searchId); } }
    window.history.replaceState(null, '', url.pathname + url.search);
  }

  function viewRawCandidates() {
    setProjectSourcePin(null);
    abandonPendingSearch(); sourceOpenSequence.current++; setOpening(false);
    setSearchConversationId(null); setSearchRunning(false); setInspectionScope(null); setSelectedRef(null); setResultFilter(''); setView('research');
    if (runId) window.history.replaceState(null, '', `?run=${encodeURIComponent(runId)}`);
  }

  const viewLabel = view === 'saved' ? 'Saved shortlist' : view === 'notes' ? 'Research notes' : 'Discover';
  const scopeLabel = yearFrom || yearTo ? `${yearFrom || 'Any year'}–${yearTo || 'present'}` : 'Any year';
  const noteCount = allRows.filter(source => snapshot?.selections[source.source_ref]?.reason?.trim()).length;
  const loadingPreview = pendingPreview?.sequence === sourceOpenSequence.current ? pendingPreview : null;
  const preview = currentSource && snapshot ? <SourcePreview
    source={currentSource} snapshot={snapshot} tab={previewTab} onTabChange={setPreviewTab}
    reason={reason} onReasonChange={value => setReasonDrafts(previous => ({ ...previous, [draftKey]: value }))}
    onSelect={(state, citation) => void selectSource(currentSource, state, reason, citation)}
    onDetails={() => { setProjectSourcePin(null); void mutate(`details:${currentSource.source_ref}`, `${sourcePath(snapshot.id, currentSource.source_ref)}/details`, {}); }}
    onTranscript={() => { setProjectSourcePin(null); void mutate(`transcript:${currentSource.source_ref}`, `${sourcePath(snapshot.id, currentSource.source_ref)}/transcript`, {}); }}
    onCheck={() => void mutate(`check:${currentSource.source_ref}`, `${sourcePath(snapshot.id, currentSource.source_ref)}/metadata-checks`, {})}
    busy={busy} error={readerError?.key === `${snapshot.id}:${currentSource.source_ref}` ? readerError.message : ''} isFixture={!!isFixture} onClose={isMobile || !!inspectionScope?.searchId ? closeInspector : undefined}
    compact={!!inspectionScope?.searchId} pending={!!loadingPreview}
    playbackRequest={videoPlaybackRequest?.runId === snapshot.id && videoPlaybackRequest.sourceRef === currentSource.source_ref && videoPlaybackRequest.sequence === sourceOpenSequence.current ? videoPlaybackRequest.sequence : undefined}
    loadTiming={metadataClock.timing?.key === `${snapshot.id}:${currentSource.source_ref}` ? metadataClock.timing : null}
    operationTiming={detailClock.timing?.key === `${snapshot.id}:${currentSource.source_ref}` ? detailClock.timing : null}
    {...(inspectionScope?.searchId ? { onSaveToProject: () => saveResource({ ...currentSource, run_id: snapshot.id }), projectSaved: projectHasSource(activeProject, { ...currentSource, run_id: snapshot.id }, activeConceptId), projectName: activeProject?.name || null } : {})}
  /> : null;
  const availableSearchReader = !!loadingPreview || !!(inspectionScope?.searchId && preview) || !!searchConversationId && !isMobile;
  const showSearchReader = searchCategory !== 'data' && searchCategory !== 'repo' && availableSearchReader;

  function changeView(next: View) {
    abandonPendingSearch();
    sourceOpenSequence.current++;
    setOpening(false);
    setWorkspaceMode('discover');
    setView(next); setMenuOpen(false); setSelectedRef(null); setInspectionScope(null); setResultFilter('');
    setPreviewTab(next === 'notes' ? 'notes' : 'overview');
  }
  function showSettings() { sourceOpenSequence.current++; setOpening(false); setMenuOpen(false); settingsRef.current?.showModal(); }
  function showProviders() { sourceOpenSequence.current++; setOpening(false); setMenuOpen(false); providersRef.current?.showModal(); }

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const settings = searchSettingsRef.current;
      if (settings?.open && event.target instanceof Node && !settings.contains(event.target)) settings.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      const settings = searchSettingsRef.current;
      if (event.key === 'Escape' && settings?.open) { settings.open = false; settings.querySelector('summary')?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);

  const projectControls = <div className="project-context-bar workspace-project-controls" aria-label="Research project context"><Icon name="folder" /><select aria-label="Active research project" value={activeProjectId || ''} onChange={event => selectProject(event.target.value)}><option value="">Independent research</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{activeProject && !!activeProject.concepts.length && <select aria-label="Active project concept" value={activeConceptId} onChange={event => setActiveConceptId(event.target.value)}><option value="">All concepts</option>{activeProject.concepts.map(concept => <option key={concept.id} value={concept.id}>{concept.name}</option>)}</select>}<Tooltip content={"Create or manage research projects and concepts"}><button type="button" className="icon-button" aria-label="Manage research projects" title="Create or manage projects and concepts" onClick={() => setProjectsOpen(true)}><Icon name="folderPlus" /></button></Tooltip><Tooltip content={"Save this research query to a project"}><button type="button" className="icon-button" aria-label="Add current query to project" title="Add current saved query to a project" disabled={!currentQueryContext()} onClick={saveCurrentQuery}><Icon name="bookmark" /></button></Tooltip>{activeProject && <span className="project-context-note">New queries save here</span>}{activeProject && projectsError && <button type="button" className="text-button project-context-error" onClick={() => setProjectsOpen(true)}>Project link needs attention</button>}</div>;

  const mainSearchWorkspace = view === 'research' && workspaceMode === 'discover' && (!inspectionScope || !!inspectionScope.searchId) && (!!searchConversationId || !snapshot);
  const refinementControls = exactDoiQuestion && (starting || !searchConversationId) ? <span className="hybrid-exact-doi">Exact DOI lookup</span> : null;
  const readerTiming = pendingPreview?.searchId === searchConversationId && pendingPreview.sequence === sourceOpenSequence.current
    ? metadataClock.timing
    : inspectionScope?.searchId === searchConversationId && snapshot && selectedRef && metadataClock.timing?.key === `${snapshot.id}:${selectedRef}` ? metadataClock.timing : null;

  return <div className={`app-shell hybrid-workspace${density === 'compact' ? ' compact' : ''}`}>
    <a className="skip-link" href="#workspace">Skip to research workspace</a>
    <button className={`nav-scrim${menuOpen ? ' visible' : ''}`} aria-label="Close navigation" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} />
    <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Workspace navigation" inert={isMobile && !menuOpen ? true : undefined}>
      <div className="brand-row"><button className="brand" onClick={newResearch} aria-label="Research Scout home"><span className="brand-mark navigation-brand"><ResearchScoutMark /></span><span>Research Scout</span></button><button className="icon-button close-navigation" aria-label="Close workspace navigation" onClick={() => setMenuOpen(false)}><Icon name="close" /></button></div>
      <p className="brand-tagline">A little curiosity goes a long way</p>
      <button className="workspace-switcher" onClick={showSettings}><span className="workspace-avatar">RS</span><span>Your workspace</span><Icon name="chevron" /></button>
      <p className="nav-label">WORKSPACE</p>
      <nav className="primary-nav" aria-label="Research views">
        <button className={`nav-item${view === 'research' ? ' active' : ''}`} aria-current={view === 'research' ? 'page' : undefined} onClick={() => changeView('research')}><Icon name="search" />Discover</button>
        <button className="nav-item" onClick={() => { setProjectsOpen(true); setMenuOpen(false); }}><Icon name="layers" />Research projects<span className="nav-count">{projects.length}</span></button>
        <button className={`nav-item${view === 'saved' ? ' active' : ''}`} aria-current={view === 'saved' ? 'page' : undefined} onClick={() => changeView('saved')}><Icon name="bookmark" />Saved shortlist<span className="nav-count">{includedCount}</span></button>
        <button className={`nav-item${view === 'notes' ? ' active' : ''}`} aria-current={view === 'notes' ? 'page' : undefined} onClick={() => changeView('notes')}><Icon name="file" />Research notes<span className="nav-count">{noteCount}</span></button>
      </nav>
      <div className="recent-research"><p className="nav-label">RECENT SEARCHES</p>{searchHistory.length ? searchHistory.slice(0, 6).map(item => <button className={`recent-run${item.id === searchConversationId ? ' current' : ''}`} key={item.id} onClick={() => openSearchResults(item.id)} title={item.title}><span className="run-dot" /><span>{item.title || 'Untitled search'}</span></button>) : runs.length ? runs.slice(0, 6).map(run => <button className={`recent-run${run.id === runId ? ' current' : ''}`} key={run.id} onClick={() => void openRun(run.id)} title={run.question}><span className={`run-dot${isActive(run.status) ? ' active' : ''}`} /><span>{run.question}</span></button>) : <p className="quiet-text recent-empty">Your searches will appear here.</p>}</div>
      <div className="sidebar-bottom"><nav className="primary-nav" aria-label="Workspace controls"><button className="nav-item" onClick={showProviders}><Icon name="layers" />Providers<span className="nav-count">{providersReady ? providers.length : '—'}</span></button><button className="nav-item" onClick={showSettings}><Icon name="sliders" />Settings</button><Link className="nav-item" href="/admin"><Icon name="database" />Admin · tokenomics</Link></nav><div className="connection-card"><strong><span className={`status-dot${providersReady ? ' ready' : ''}`} />{providersReady ? 'Local workspace' : 'Connecting to service'}</strong><p>{isFixture ? 'Fixture records · test examples only.' : 'Your research and decisions stay in this workspace.'}</p></div><div className="workspace-profile"><span className="local-avatar"><Icon name="compass" /></span><div><strong>Your research</strong><span>Human-reviewed shortlist</span></div></div></div>
    </aside>
    <div className="main-shell" inert={isMobile && menuOpen ? true : undefined}>
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Icon name="menu" /></button><span>Workspace</span><span className="breadcrumb-slash" aria-hidden="true">/</span><strong>{viewLabel}</strong></div><div className="header-actions"><CreditMeter /><span className={`environment-label${isFixture ? ' fixture' : ''}`} title={isFixture ? 'Fixture data' : mode?.toLowerCase() === 'live' ? 'Live provider data' : 'Local workspace'}><i />{isFixture ? 'Fixture data' : mode?.toLowerCase() === 'live' ? 'Live provider data' : 'Local workspace'}</span><Tooltip content={"Change search scope and reading preferences"}><button className="icon-button settings-button" aria-label="Open workspace settings" onClick={showSettings}><Icon name="sliders" /></button></Tooltip>{snapshot && includedCount > 0 ? <details className="export-disclosure"><summary className="button small"><Icon name="download" />Export<Icon name="chevron" /></summary><div className="export-popover"><p>Saved revision {snapshot.revision}</p><button disabled={exporting} onClick={() => void exportSelection('bibliography')}><Icon name="file" />Bibliography (.md)</button><button disabled={exporting} onClick={() => void exportSelection('manifest')}><Icon name="layers" />Query manifest (.json)</button><span>Saved fields · no new research calls</span></div></details> : <button className="button small" disabled><Icon name="download" />Export</button>}<WorkspaceAccount /></div></header>
      <main id="workspace" className={view === 'research' ? 'compact-discovery' : undefined} tabIndex={-1}>
        <div className="workspace-heading-row"><section className="page-heading" aria-labelledby="page-heading"><div><h1 id="page-heading">{view === 'research' ? workspaceMode === 'explore' ? 'Explore Research' : 'Discover Research' : viewLabel}</h1><p className={view === 'research' ? 'page-intro scout-tagline' : 'page-intro'}>{view === 'saved' ? 'The sources you chose, with your decisions intact.' : view === 'notes' ? 'Your reasons, saved with each source decision.' : 'A little curiosity goes a long way'}</p></div></section><div className="workspace-heading-actions" role="group" aria-label="Workspace actions">{view === 'research' && projectControls}<button className="button new-research" onClick={newResearch}><Icon name="plus" />New research<span className="keyboard-hint" aria-hidden="true">N</span></button>{view === 'research' && <div className="workspace-mode-switch" role="group" aria-label="Research mode"><button aria-pressed={workspaceMode === 'discover'} onClick={() => selectWorkspaceMode('discover')}><Icon name="search" />Search workspace</button><button aria-pressed={workspaceMode === 'explore'} onClick={() => selectWorkspaceMode('explore')}><Icon name="message" />Exploration chat</button></div>}</div></div>
        <nav className="mobile-views" aria-label="Quick research views"><button className={view === 'research' ? 'active' : ''} aria-current={view === 'research' ? 'page' : undefined} onClick={() => changeView('research')}>Discover</button><button className={view === 'saved' ? 'active' : ''} aria-current={view === 'saved' ? 'page' : undefined} onClick={() => changeView('saved')}>Shortlist <span>{includedCount}</span></button><button className={view === 'notes' ? 'active' : ''} aria-current={view === 'notes' ? 'page' : undefined} onClick={() => changeView('notes')}>Notes</button></nav>

        {view === 'research' && workspaceMode === 'explore' ? <ExplorationChat aiRefinement={searchPreferences.aiRefinement} onAiRefinementChange={aiRefinement => updateSearchPreferences({ ...searchPreferences, aiRefinement })} modalityLimits={searchPreferences.modalityLimits} onModalityLimitsChange={modalityLimits => updateSearchPreferences({ ...searchPreferences, modalityLimits, videoCount: modalityLimits.videos || searchPreferences.videoCount })} providers={providers} providersReady={providersReady} initialId={conversationId} onIdChange={setConversationId} onOpenSource={openChatSource} /> : <>
        {view === 'research' && <form noValidate ref={searchFormRef} onSubmit={event => void startResearch(event)} className="research-form hybrid-search-form">
          <div className={`search-query-window${starting || searchRunning || !searchConversationId && running ? ' searching' : ''}`}>
          <div className="query-label-row"><label className="query-label" htmlFor="research-question"><Icon name="search" />Your research question</label></div>
          {(starting || searchRunning || !searchConversationId && running) && <span className="scout-search-activity" role={mainSearchWorkspace ? undefined : "status"} aria-hidden={mainSearchWorkspace || undefined} data-testid="search-activity"><SearchAtom fill /><span className="sr-only">{starting ? 'Starting search…' : 'Finding sources…'}</span></span>}
          <div className="question-composer"><textarea ref={searchRef} id="research-question" rows={2} disabled={!preferencesReady || starting || !providersReady && !auxiliaryEnabled} value={question} aria-label="Research question" aria-invalid={questionTooLong} aria-describedby={`question-limit scope-hint${!exactDoiQuestion ? ' workspace-refinement-status' : ''}${questionTooLong ? ' question-limit-error' : ''}`} onChange={event => { questionEdited.current = true; setQuestion(event.target.value); }} placeholder="What would you like to understand?" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" className="button primary search-button" disabled={starting || searchRunning || !preferencesReady || !exactDoiQuestion && (allModalitiesOff || searchPreferences.aiRefinement && !refinementReady || !auxiliaryEnabled && (!providersReady || providerUnavailable || routing === 'auto' && !searchPreferences.sources.length)) || !question.trim() || questionTooLong}>{starting ? <span className="spinner" /> : null}<span>{starting ? 'Starting' : 'Search'}</span><Icon name="arrow" /></button></div>
          </div>
          {!mainSearchWorkspace && <div className="hybrid-query-focus hybrid-legacy-focus">{refinementControls}</div>}
          {!exactDoiQuestion && <p id="workspace-refinement-status" className={`scope-hint${searchPreferences.aiRefinement && !refinementReady ? ' query-limit-error' : ''}`} role={searchPreferences.aiRefinement && !refinementReady ? 'status' : undefined} data-testid="mandatory-refinement-status">{allModalitiesOff ? 'Enable at least one result type in Limits before searching.' : !searchPreferences.aiRefinement ? 'Direct query · no model planning or AI relevance review. Your question goes to the selected sources.' : refinementReady ? 'AI refines this question before provider search, then reviews and reranks retrieved evidence before showing primary results.' : `AI refinement is unavailable. ${refinementReason} Turn off AI refinement to search directly.`}</p>}
          <div className="hybrid-search-settings">
          <div className="hybrid-source-controls"><SearchOptions compact value={searchPreferences} providers={providers} onChange={updateSearchPreferences} onApplyRange={question.trim() ? () => searchFormRef.current?.requestSubmit() : undefined} disabled={starting || searchRunning || !providersReady || !preferencesReady} refinementDisabled={starting || searchRunning || !preferencesReady} manualProvider={routing === 'manual' ? provider : undefined} onManualProviderChange={setProvider} /></div>
          {mainSearchWorkspace && <div className="search-information-toolbar-host" data-testid="search-information-toolbar-host" ref={setInformationToolbarHost} />}
          <details className="search-settings search-connections hybrid-advanced-settings" data-testid="search-settings" ref={searchSettingsRef} onToggle={event => event.currentTarget.querySelector('summary')?.setAttribute('aria-expanded', String(event.currentTarget.open))}><Tooltip content="Search settings and provider connections"><summary role="button" tabIndex={0} aria-haspopup="dialog" aria-expanded="false" aria-label="Search settings"><Icon name="sliders" /><span className="sr-only">Search settings</span></summary></Tooltip><div className="search-settings-panel"><h3>Search settings</h3>
          <div className="scope-toolbar"><div className="scope-chips">{routing === 'manual' ? <label className="provider-field"><span className="provider-mark" aria-hidden="true">{providerLabel(provider).charAt(0).toUpperCase()}</span><select aria-label="Discovery provider" value={provider} onChange={event => setProvider(event.target.value as ProviderId)}>{DISCOVERY_PROVIDERS.map(id => { const item = providers.find(p => p.id === id); const unavailable = !item || item.access_configured === false || ['unavailable', 'disabled', 'unconfigured', 'blocked', 'not_configured', 'needs_access', 'configuration_error'].includes(normalStatus(item.status)); return <option key={id} value={id} disabled={unavailable}>{providerLabel(id)}{unavailable ? ' (unavailable)' : ''}</option>; })}</select></label> : <span className="automatic-scope-label">Search connected sources</span>}<button type="button" className="scope-chip" onClick={showSettings}><Icon name="layers" />{routing === 'auto' ? 'Automatic source routing' : provider === 'openalex' ? 'Hybrid search' : 'Lexical + local rerank'}<Icon name="chevron" /></button><Tooltip content={"Choose the publication years for the next search"}><button type="button" className="scope-chip" onClick={showSettings} aria-label="Edit publication years"><Icon name="calendar" />{scopeLabel}<Icon name="chevron" /></button></Tooltip></div><span className="query-count" id="question-limit">{questionBytes.toLocaleString()} / 2,000 UTF-8 bytes</span></div>
          <label className="manual-routing-toggle workspace-manual-toggle"><input type="checkbox" aria-label="Choose sources manually" checked={routing === 'manual'} disabled={starting} onChange={event => setRouting(event.target.checked ? 'manual' : 'auto')} /><span>Choose sources manually</span></label>
          {routing === 'auto' && <ConnectedSources providers={providers} />}
          <p className="scope-hint" id="scope-hint">{exactDoiQuestion ? 'Exact DOI registry lookup does not use AI topic planning.' : !searchPreferences.aiRefinement ? 'Direct discovery uses your question without model planning or AI relevance review. Provider queries and local ranking remain visible.' : routing === 'auto' ? 'AI plans queries for your selected connected sources and reviews retrieved evidence. Papers and videos appear in separate tabs; open-access checks stay with papers.' : 'AI-refined discovery · this question, provider and publication filters produce reviewed results below.'} Scope changes apply to your next search.</p>
          </div></details>
          </div>
          {questionTooLong && <p id="question-limit-error" className="query-limit-error" role="alert">Shorten your question to 2,000 UTF-8 bytes or fewer before searching. Some characters use more than one byte. Your text has been kept for editing.</p>}
        </form>}
        {mainSearchWorkspace && <div className="search-information-details-host" data-testid="search-information-details-host" ref={setInformationDetailsHost} />}
        {!snapshot && !searchConversationId && view === 'research' && <div className="suggestions"><span>Try a question</span>{['Institutional AI readiness in higher education', 'Retrieval augmented generation evaluation'].map(example => <button key={example} onClick={() => { questionEdited.current = true; setQuestion(example); searchRef.current?.focus(); }}>{example}<Icon name="arrow" /></button>)}</div>}
        {error && <div className="feedback error-feedback" role="alert"><Icon name="alert" /><div><strong>This action needs attention</strong><p>{error}</p>{pendingReviewedId && <button className="text-button" type="button" onClick={() => openSearchResults(pendingReviewedId)}>Open saved results<Icon name="arrow" /></button>}</div><Tooltip content={"Dismiss this notification"}><button className="icon-button" aria-label="Dismiss error" onClick={() => { setError(''); setReaderError(null); }}><Icon name="close" /></button></Tooltip></div>}
        {opening && <div className="inline-loading" role="status"><span className="spinner" />Opening saved research…</div>}
        {view === 'research' && (!inspectionScope || !!inspectionScope.searchId) && (searchConversationId || !snapshot) && <div className={`main-search-body${showSearchReader ? ' has-source-panel' : ''}`}><div className="search-results-column"><SearchResults informationToolbarHost={informationToolbarHost} informationDetailsHost={informationDetailsHost} onCategoryChange={setSearchCategory} preserveSourceVersion={!!projectSourcePin} historyEntries={searchHistory} id={searchConversationId} preferredTurnId={searchTurnId} pending={starting} providers={providers} filter={searchConversationId ? searchFilters[searchConversationId] || '' : ''} onFilterChange={value => { if (searchConversationId) setSearchFilters(previous => ({ ...previous, [searchConversationId]: value })); }} traceActions={refinementControls} draftQuestion={question} readerTiming={readerTiming} liveSearchStart={searchConversationId ? liveSearchStarts.current.get(searchConversationId) : undefined} onFirstEvidenceMeasured={rememberFirstEvidence} onChooseSearch={id => openSearchResults(id)} onOpenSource={openSearchSource} activeSourceKey={inspectionScope?.searchId && snapshot && selectedRef ? `${snapshot.id}:${selectedRef}` : undefined} onSaveResource={saveResource} isResourceSaved={source => projectHasSource(activeProject, source, activeConceptId)} savingResourceKey={savingResourceKey} onOpenChat={openReviewedConversation} onLoaded={applySearchMetadata} onRunningChange={setSearchRunning} /></div>{availableSearchReader && <aside hidden={searchCategory === 'data' || searchCategory === 'repo'} style={searchCategory === 'data' || searchCategory === 'repo' ? { display: 'none' } : undefined} className={`source-inspector search-source-panel${loadingPreview ? ' is-loading' : ''}`} aria-label={inspectionScope?.searchId || loadingPreview ? 'Source details' : 'Reading space'} aria-busy={!!loadingPreview}>{inspectionScope?.searchId && preview}{!loadingPreview && !inspectionScope?.searchId && <div className="preview-empty compact-reader-empty"><Icon name="file" /><p>Move to a result to read its content.</p></div>}{loadingPreview && <SourcePreviewLoading timing={metadataClock.timing} kind={loadingPreview.kind} onClose={closeInspector} overlay={!!(inspectionScope?.searchId && preview)} />}</aside>}</div>}
        {(view !== 'research' || !!inspectionScope && !inspectionScope.searchId || !searchConversationId && !!snapshot) && <>
        {snapshot && isFixture && <p className="fixture-note"><Icon name="file" /><span><strong>Fixture workspace.</strong> These records and outcomes are test examples, not live research findings.</span></p>}
        <div className="activity-line">
          {snapshot ? <section className="run-progress" aria-label="Research progress" data-testid="run-progress" data-status={normalStatus(snapshot.status)}><div className="progress-heading"><span className={`status-dot${running ? ' pulse' : ' ready'}`} /><strong>{allRows.length} {allRows.length === 1 ? 'source' : 'sources'} available</strong><span>{running ? '· Research in progress' : `· ${humanStatus(snapshot.status) === 'Succeeded' ? 'Discovery complete' : humanStatus(snapshot.status)}`}</span></div><div className="branch-statuses">{branches.map(branch => <span className={`branch-status ${normalStatus(snapshot.operations[branch]?.status)}`} key={branch}>{isSuccess(snapshot.operations[branch]?.status) ? <Icon name="check" /> : <Icon name={isActive(snapshot.operations[branch]?.status) ? 'clock' : 'alert'} />}{branch === 'lexical' ? 'Lexical' : 'Semantic'}: {humanStatus(snapshot.operations[branch]?.status)}</span>)}<span className={`connection-status${connection === 'reconnecting' ? ' stale' : ''}`}>{connection === 'reconnecting' ? 'Reconnecting · updates may be stale' : connection === 'connecting' ? 'Connecting to updates' : 'Saved state synced'}</span>{running && <button className="text-button cancel-button" disabled={busy.cancel} onClick={() => void mutate('cancel', `/research-runs/${encodeURIComponent(snapshot.id)}/cancel`, {})}><Icon name="stop" />Cancel</button>}</div></section> : <p className="quiet-text">Choose a question to begin. Sources appear as they arrive.</p>}
          <div className="density-switch" role="group" aria-label="Source density controls"><Tooltip content={"Use comfortable source spacing"}><button aria-label="Comfortable source density" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><Icon name="layers" /></button></Tooltip><Tooltip content={"Fit more sources in the available space"}><button aria-label="Compact source density" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><Icon name="menu" /></button></Tooltip></div>
        </div>
        {snapshot && connection === 'reconnecting' && <p className="reconnect-note"><Icon name="refresh" />Your sources and decisions remain available. Recovery reads saved state{lastSynced ? `; last synced ${new Date(lastSynced).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}.</p>}
        {snapshot?.plan?.source_review_scope && <div className="coverage-notice"><Icon name="alert" /><p>Raw provider candidates. AI relevance decisions and the reviewed results are saved in the exploration conversation.</p></div>}
        {inspectionScope && <div className="source-inspection-scope" data-testid="source-inspection-scope"><div><strong>Single-source inspection</strong><p>This reader shows the exact saved record you chose. Other raw provider candidates remain outside this view.</p></div><div>{inspectionScope.searchId ? <button className="button small" onClick={() => openSearchResults(inspectionScope.searchId!, true)}>Back to search results</button> : inspectionScope.conversationId && <button className="button small" onClick={() => openReviewedConversation(inspectionScope.conversationId!)}>Back to reviewed results</button>}<button className="button small" onClick={viewRawCandidates}>View all raw provider candidates</button></div></div>}
        {!!snapshot?.warnings.length && <div className="coverage-notice"><Icon name="alert" /><div>{snapshot.warnings.map((warning, index) => <p key={`${index}:${warning}`}>{warning}</p>)}</div></div>}
        <section className="workbench" aria-label="Research sources">
          <div className="results-toolbar"><div className="results-tab"><strong>{inspectionScope ? 'Selected source' : view === 'saved' ? 'Saved papers' : view === 'notes' ? 'Sources with notes' : 'Sources'}</strong><span>{rows.length}</span></div><div className="results-controls">{snapshot && !inspectionScope && <label className="result-search"><Icon name="search" /><input type="search" aria-label="Find in results" placeholder="Find in results" value={resultFilter} onChange={event => setResultFilter(event.target.value)} /></label>}{branchesFinished && allRows.length > 1 && <button className="button small ranking-button" disabled={rankingApplied} onClick={applyRanking}><Icon name="sliders" />{rankingApplied ? 'Ranking applied' : `${completeHybrid ? 'Final' : 'Partial'} ranking available`}</button>}</div></div>
          <div className="result-grid">
            <div className="result-index"><div className="column-labels"><span>Source</span><span>{snapshot ? providerLabel(snapshot.provider) : 'Discovery'}</span></div>
              {rows.length && snapshot ? <div className="source-list" aria-label={view === 'saved' ? 'Saved sources' : 'Research sources'}>{rows.map(source => {
                const selection = snapshot.selections[source.source_ref]; const included = selection?.state === 'included'; const check = snapshot.checks[source.source_ref];
                const contributions = Object.keys(source.branch_ranks || {}).filter(branch => ['lexical', 'semantic'].includes(branch));
                return <article className={`source-row${included ? ' included' : ''}${selection?.state === 'excluded' ? ' excluded' : ''}${currentSource?.source_ref === source.source_ref ? ' selected' : ''}`} key={source.source_ref} data-testid="source-row" data-source-ref={source.source_ref}>
                  <span className="source-type"><Icon name="file" /></span><div className="source-content"><button className="source-title" aria-current={currentSource?.source_ref === source.source_ref ? 'true' : undefined} onClick={event => inspect(source, event.currentTarget)}>{sourceTitle(source)}</button><p className="source-byline">{source.authors?.length ? source.authors.slice(0, 2).join(', ') + (source.authors.length > 2 ? ' et al.' : '') : 'Authors not supplied'}<span aria-hidden="true"> · </span>{source.year || 'Year not supplied'}</p>{showExcerpts && <p className="source-excerpt">{source.abstract || source.description || 'No abstract supplied. Inspect the available bibliographic record.'}</p>}<div className="source-meta"><span className={`content-label${source.abstract ? '' : ' limited'}`}>{source.abstract ? 'Abstract available' : source.description ? 'Description available' : 'Metadata only'}</span><span>{contributions.length ? contributions.map(branch => branch === 'lexical' ? 'Lexical' : 'Semantic').join(' + ') : 'Provider supplied'}</span>{selection?.state === 'excluded' && <span className="decision-label">Excluded</span>}{check && <span className="verification-label"><Icon name="shield" />{humanStatus(check.status)}</span>}</div>{source.eligible === false && <p className="selected-filter-warning"><Icon name="alert" />{source.filter_warnings?.join(' ') || 'This saved source no longer passes eligibility checks. Your decision is retained.'}</p>}{selection?.reason && view !== 'research' && <p className="saved-reason"><Icon name="file" />{selection.reason}</p>}</div>
                  <button className={`icon-button save-source${included ? ' saved' : ''}`} aria-label={`${included ? 'Exclude' : 'Include'} ${sourceTitle(source)}`} aria-pressed={included} disabled={busy[`selection:${source.source_ref}`] || !included && includedCount >= 3} title={included ? 'Included · click to exclude' : includedCount >= 3 ? 'Your three-paper shortlist is full' : 'Include in shortlist'} onClick={() => void selectSource(source, included ? 'excluded' : 'included')}><Icon name={busy[`selection:${source.source_ref}`] ? 'clock' : 'bookmark'} /></button>
                </article>;
              })}</div> : <div className="empty-state"><span className="empty-symbol"><Icon name={view === 'saved' ? 'bookmark' : view === 'notes' ? 'file' : 'search'} /></span><h2>{inspectionScope ? 'This saved source is unavailable.' : resultFilter ? 'No sources match this filter.' : !snapshot ? 'Start with a question.' : view === 'saved' ? 'Your shortlist starts here.' : view === 'notes' ? 'A place for your research notes.' : running ? 'Finding your first sources…' : normalStatus(snapshot.status) === 'empty' ? 'No matches in this search.' : 'No usable sources are available yet.'}</h2><p>{inspectionScope ? 'The exact requested source is not present in this saved run. Return to reviewed results or explicitly open all raw candidates.' : resultFilter ? 'Try a different title or author. Your saved decisions are unchanged.' : view === 'saved' ? 'Include up to three sources from Discover to keep them here.' : view === 'notes' ? 'Save a reason with a source decision to find it here.' : running ? 'Review the first available records while discovery continues.' : snapshot ? 'Review the search scope and outcome, or start a separate search.' : 'Search one provider, inspect the records, and keep the sources worth a closer look.'}</p>{view !== 'research' && <button className="button" onClick={() => changeView('research')}>Explore sources<Icon name="arrow" /></button>}</div>}
              <div className="index-footer"><span className="status-dot" /><span>{snapshot && running && !branchesFinished ? 'Provisional order · more results may arrive' : snapshot ? 'Bounded discovery · coverage is not exhaustive' : 'Your sources will appear here'}</span></div>
            </div>
            {!isMobile && <section className="source-inspector embedded-inspector" aria-label="Source preview">{preview || <div className="preview-empty"><span className="empty-symbol"><Icon name="file" /></span><h2>Your reading space</h2><p>A source preview appears here as soon as a record is available.</p><span>Overview · Metadata · Your notes</span></div>}</section>}
          </div>
        </section>
        {snapshot?.summary && <section className="model-note"><p className="eyebrow">DISCOVERY SCOPE NOTE · REVIEW AGAINST THE SOURCES</p><p>{snapshot.summary}</p></section>}
        {allRows.length > 0 && running && !snapshot?.summary && <p className="pending-summary"><Icon name="clock" />The discovery scope note may still be pending. Your sources are ready to review.</p>}
        {snapshot && <details className="research-details"><summary><Icon name="sliders" />Search scope and provenance<Icon name="chevron" /></summary><div className="scope-details"><dl><div><dt>Discovery provider</dt><dd>{providerLabel(snapshot.provider)} · Hybrid</dd></div><div><dt>Research question</dt><dd>{snapshot.question}</dd></div><div><dt>Created</dt><dd>{dateLabel(snapshot.created_at)}</dd></div><div><dt>Saved revision</dt><dd>{snapshot.revision}</dd></div><div><dt>Requested filters</dt><dd>{Object.entries(snapshot.filters || {}).filter(([, value]) => value != null).map(([key, value]) => `${key.replace(/_/g, ' ')}: ${displayValue(value)}`).join(' · ') || 'No date/type constraints'}</dd></div></dl><p>Results come from one selected provider. Lexical and semantic contributions combine within that provider; a repeated identity appears once. Registry checks remain separate observations.</p>{branches.map(branch => { const operation = snapshot.operations[branch]; return operation && <div className="operation-detail" key={branch}><strong>{branch === 'lexical' ? 'Lexical branch' : 'Semantic branch'} · {humanStatus(operation.status)}</strong>{!!operation.query && <p>Executed query: {displayValue(operation.query)}</p>}{!!operation.effective_filters && <p>Effective filters: {displayValue(operation.effective_filters)}</p>}{!!operation.error && <p>{displayValue(operation.error)}</p>}</div>; })}<p>Reopening, saving and exporting use saved state. Detail lookups and DOI checks are explicit operations. Question wording guides relevance; structured year/type filters define enforced constraints. An abstract or source link does not establish full-text review.</p></div></details>}
        </>}
        <footer className="workspace-footer"><span>{snapshot ? `${providerLabel(snapshot.provider)} · ${includedCount} of 3 included` : routing === 'auto' ? 'One question. Connected sources. Your judgment.' : 'One question. One provider. Your judgment.'}</span><span>Metadata &amp; abstracts · human-reviewed shortlist</span></footer>
        </>}
      </main>
    </div>
    <dialog className="source-inspector mobile-inspector" ref={inspectorRef} aria-labelledby="inspector-heading" onClose={closeInspector} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeInspector(); } }}>{isMobile && !inspectionScope?.searchId && preview}</dialog>
    <dialog className="settings-dialog" ref={settingsRef} aria-labelledby="settings-heading"><div className="dialog-heading"><h2 id="settings-heading">Workspace settings</h2><Tooltip content={"Close workspace settings"}><button className="icon-button" aria-label="Close settings" onClick={() => settingsRef.current?.close()}><Icon name="close" /></button></Tooltip></div><div className="dialog-body"><p className="section-explanation">Prepare your next search and choose how you review the results.</p><h3>Search scope</h3><div className="settings-years"><label htmlFor="year-from">Publication year from<input id="year-from" aria-label="Publication year from" inputMode="numeric" type="number" min="1500" max="2200" value={yearFrom} onChange={event => setYearFrom(event.target.value)} placeholder="Any" /></label><label htmlFor="year-to">Publication year to<input id="year-to" aria-label="Publication year to" inputMode="numeric" type="number" min="1500" max="2200" value={yearTo} onChange={event => setYearTo(event.target.value)} placeholder="Present" /></label></div><div className="strategy-setting"><Icon name="layers" /><div><strong>{providerRetrieval(selectedProvider)}</strong><p>{provider === 'openalex' ? 'Native lexical and semantic searches within OpenAlex, with consistent supported filters.' : 'Lexical search within the selected provider. A configured local encoder can rerank its bounded candidate pool; this does not add native semantic discovery.'}</p></div></div><p className="action-note">Provider and year edits apply when you explicitly start a new search. Existing results retain their original scope.</p><h3>Reading preferences</h3><label className="setting-row" htmlFor="source-density"><span>Source density<small>Choose your scanning rhythm.</small></span><select id="source-density" aria-label="Source density" value={density} onChange={event => setDensity(event.target.value as 'comfortable' | 'compact')}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><label className="setting-row" htmlFor="show-excerpts"><span>Source excerpts<small>Show abstract previews in the source list.</small></span><input type="checkbox" id="show-excerpts" aria-label="Source excerpts" checked={showExcerpts} onChange={event => setShowExcerpts(event.target.checked)} /></label><p className="action-note">Display preferences apply to this open workspace. They make no research or model calls.</p></div><div className="dialog-footer"><button className="button primary" onClick={() => settingsRef.current?.close()}>Done</button></div></dialog>
    <dialog className="settings-dialog" ref={providersRef} aria-labelledby="providers-heading"><div className="dialog-heading"><h2 id="providers-heading">Research providers</h2><Tooltip content={"Close provider information"}><button className="icon-button" aria-label="Close providers" onClick={() => providersRef.current?.close()}><Icon name="close" /></button></Tooltip></div><div className="dialog-body"><p className="section-explanation">Automatic routing chooses appropriate connected resources and includes DOI open-access checks. Advanced manual selection supports up to two discovery providers. Each provider observation stays separately attributable.</p>{providers.map(item => <div className="provider-status" key={item.id}><div><strong>{providerLabel(item.id)}</strong><span>{providerRole(item.id)}</span></div><div className="provider-status-summary"><strong>{providerReadiness(item)}</strong><span>{item.mode?.toLowerCase().includes('fixture') ? 'Fixture data' : item.mode || 'Configuration pending'}</span></div>{(item.blocked_reason || item.last_error || !!item.verified_capabilities?.length) && <p className="provider-proof">{item.blocked_reason && <span>{item.blocked_reason}</span>}{item.last_error && <span>Last request: {item.last_error === 'UPSTREAM_RATE_LIMIT' ? 'rate-limited. Wait before retrying.' : humanStatus(item.last_error)}</span>}{!!item.verified_capabilities?.length && <span>Verified operations: {item.verified_capabilities.map(capability => humanStatus(capability === 'keyword' ? 'lexical' : capability)).join(', ')}</span>}</p>}</div>)}{!providersReady && <p className="action-note">Provider configuration could not be loaded yet. Availability is not confirmed.</p>}<p className="action-note">These statuses come from the application service. Access configuration remains in the existing local backend setup.</p></div><div className="dialog-footer"><button className="button primary" onClick={() => providersRef.current?.close()}>Done</button></div></dialog>
    <ResearchProjects open={projectsOpen} projects={projects} activeId={activeProjectId} error={projectsError} pendingSource={pendingProjectResource} pendingQuery={!!pendingProjectQuery} onClose={() => { setProjectsOpen(false); setPendingProjectResource(null); setPendingProjectQuery(null); }} onSelect={selectProject} onChange={updateProject} onRefresh={() => void refreshProjects()} onSaveSource={async (id, concepts) => { if (pendingProjectResource) { if (activeProjectId !== id) selectProject(id); await saveProjectSource(pendingProjectResource, id, concepts); } }} onSaveQuery={async (id, concepts) => { if (pendingProjectQuery) { if (activeProjectId !== id) selectProject(id); await addCurrentQuery(id, concepts, pendingProjectQuery); } }} onOpenQuery={openProjectQuery} onOpenSource={openProjectSource} />
    {notice && <div className="toast" role="status"><Icon name="check" />{notice}</div>}
    {!mainSearchWorkspace && <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>}
  </div>;
}
