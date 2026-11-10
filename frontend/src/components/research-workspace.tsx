'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './icon';
import ConnectedSources from './connected-sources';
import ExplorationChat from './exploration-chat';
import type { ChatSource, Conversation, RetrievalConfig, RoutingMode } from '@/lib/conversations';
import SourcePreview, { type PreviewTab } from './source-preview';
import { ApiError, DISCOVERY_PROVIDERS, humanStatus, isActive, isSuccess, normalStatus, providerLabel, providerReadiness, providerRetrieval, providerRole, request, sourcePath, sourceTitle, type ExportResult, type Provider, type ProviderId, type RunSummary, type Snapshot, type Source } from '@/lib/api';

type View = 'research' | 'saved' | 'notes';
type Connection = 'connecting' | 'connected' | 'reconnecting' | 'saved';
type InspectionScope = { sourceRef: string; conversationId: string | null };
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
  const [providers, setProviders] = useState<Provider[]>(FALLBACK_PROVIDERS);
  const [providersReady, setProvidersReady] = useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const activeRun = useRef<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const questionBytes = new TextEncoder().encode(question).length;
  const questionTooLong = questionBytes > 2000;
  const [routing, setRouting] = useState<RoutingMode>('auto');
  const [provider, setProvider] = useState<ProviderId>('openalex');
  const [yearFrom, setYearFrom] = useState('2020');
  const [yearTo, setYearTo] = useState('');
  const [orderedRefs, setOrderedRefs] = useState<string[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [inspectionScope, setInspectionScope] = useState<InspectionScope | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [starting, setStarting] = useState(false);
  const [retrievalConfig, setRetrievalConfig] = useState<RetrievalConfig>({ enabled: false, ready: false, status: 'loading' });
  const [refineSearch, setRefineSearch] = useState(false);
  const refinementEdited = useRef(false);
  const startLock = useRef(false);
  const pendingReviewed = useRef<{ signature: string; key: string; conversationId?: string; revision?: number } | null>(null);
  const [pendingReviewedId, setPendingReviewedId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [connection, setConnection] = useState<Connection>('saved');
  const [streamGeneration, setStreamGeneration] = useState(0);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState(EMPTY_MESSAGE);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [rankingApplied, setRankingApplied] = useState(false);
  const searchRef = useRef<HTMLTextAreaElement>(null);
  const inspectorRef = useRef<HTMLDialogElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const providersRef = useRef<HTMLDialogElement>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('overview');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [showExcerpts, setShowExcerpts] = useState(false);
  const [resultFilter, setResultFilter] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);

  const applySnapshot = useCallback((incoming: Snapshot) => {
    if (activeRun.current !== incoming.id) return;
    const next = normalizeSnapshot(incoming);
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
    const next = await request<Snapshot>(`/research-runs/${encodeURIComponent(id)}/snapshot`);
    applySnapshot(next); return next;
  }, [applySnapshot]);

  const openRun = useCallback(async (id: string, scope: InspectionScope | null = null) => {
    setOpening(true); setError('');
    try {
      const saved = normalizeSnapshot(await request<Snapshot>(`/research-runs/${encodeURIComponent(id)}/snapshot`));
      setWorkspaceMode('discover'); setRouting('manual');
      activeRun.current = id; setOrderedRefs([]); setRankingApplied(false); setInspectionScope(scope); setSelectedRef(scope?.sourceRef ?? null); setPreviewTab('overview'); setResultFilter(''); setView('research');
      if (scope?.conversationId) setConversationId(scope.conversationId);
      applySnapshot(saved); setRunId(id); setStreamGeneration(value => value + 1);
      setQuestion(saved.question); setProvider(saved.provider);
      setYearFrom(saved.filters?.year_from == null ? '' : String(saved.filters.year_from));
      setYearTo(saved.filters?.year_to == null ? '' : String(saved.filters.year_to));
      setMenuOpen(false);
      const params = new URLSearchParams({ run: id });
      if (scope) { params.set('source', scope.sourceRef); if (scope.conversationId) params.set('from_conversation', scope.conversationId); }
      window.history.replaceState(null, '', `?${params.toString()}`);
      try { localStorage.setItem('research-scout:last-run', id); } catch { /* A saved run remains on the backend. */ }
      return true;
    } catch (failure) { setError(`This saved research could not be opened. ${message(failure)}`); return false; }
    finally { setOpening(false); }
  }, [applySnapshot]);

  useEffect(() => {
    let mounted = true;
    void Promise.allSettled([request<{ providers: Provider[] }>('/providers'), request<{ runs: RunSummary[] }>('/research-runs'), request<{ retrieval?: RetrievalConfig }>('/config')]).then(results => {
      if (!mounted) return;
      const [providerResult, runResult, configResult] = results;
      if (providerResult.status === 'fulfilled') { setProviders(providerResult.value.providers); setProvidersReady(true); }
      else setError(`The research service is unavailable. ${message(providerResult.reason)}`);
      if (runResult.status === 'fulfilled') setRuns(runResult.value.runs);
      else if (providerResult.status === 'fulfilled') setError(`Saved research is temporarily unavailable. ${message(runResult.reason)}`);
      setRetrievalConfig(configResult.status === 'fulfilled' ? configResult.value.retrieval || { enabled: false, ready: false, status: 'disabled' } : { enabled: false, ready: false, status: 'unavailable' });
    });
    const params = new URLSearchParams(window.location.search);
    const savedConversation = params.get('conversation');
    if (savedConversation) { setConversationId(savedConversation); setWorkspaceMode('explore'); }
    let id = params.get('run');
    if (savedConversation) return () => { mounted = false; };
    if (!id) { try { id = localStorage.getItem('research-scout:last-run'); } catch { /* URL and backend history still work. */ } }
    if (id) void openRun(id, params.has('source') ? { sourceRef: params.get('source') || '', conversationId: params.get('from_conversation') } : null);
    return () => { mounted = false; };
  }, [openRun]);

  const refinementReady = retrievalConfig.enabled && retrievalConfig.ready;
  const exactDoiQuestion = /^(?:https?:\/\/doi\.org\/|doi:\s*)?10\.\d{4,9}\/\S+$/i.test(question.trim());
  const reviewedSearch = refineSearch && refinementReady && !exactDoiQuestion;
  useEffect(() => {
    if (!refinementReady) setRefineSearch(false);
    else if (!refinementEdited.current && providersReady) setRefineSearch(routing === 'auto' ? providers.some(item => DISCOVERY_PROVIDERS.includes(item.id as ProviderId) && item.mode === 'live' && item.access_configured !== false) : providers.find(item => item.id === provider)?.mode === 'live');
  }, [refinementReady, providersReady, providers, provider, routing]);

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
    if (isMobile && mobilePreviewOpen && selectedRef && dialog && !dialog.open) dialog.showModal();
    if ((!isMobile || !mobilePreviewOpen || !selectedRef) && dialog?.open) dialog.close();
  }, [selectedRef, isMobile, mobilePreviewOpen]);

  useEffect(() => {
    if (isMobile || !selectedRef) return;
    const returnToSource = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) closeInspector();
    };
    window.addEventListener('keydown', returnToSource);
    return () => window.removeEventListener('keydown', returnToSource);
  }, [isMobile, selectedRef]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const sourceByRef = useMemo(() => new Map(snapshot?.entities.map(entity => [entity.source_ref, entity]) || []), [snapshot?.entities]);
  const includedCount = Object.values(snapshot?.selections || {}).filter(selection => selection.state === 'included').length;
  const rawRows = orderedRefs.map(ref => sourceByRef.get(ref)).filter((source): source is Source => !!source && (source.eligible !== false || snapshot?.selections[source.source_ref]?.state === 'included'));
  const pinnedSource = inspectionScope ? sourceByRef.get(inspectionScope.sourceRef) : undefined;
  const allRows = inspectionScope ? (pinnedSource ? [pinnedSource] : []) : rawRows;
  const viewRows = view === 'saved' ? allRows.filter(source => snapshot?.selections[source.source_ref]?.state === 'included') : view === 'notes' ? allRows.filter(source => snapshot?.selections[source.source_ref]?.reason?.trim()) : allRows;
  const rows = inspectionScope ? allRows : viewRows.filter(source => `${sourceTitle(source)} ${source.authors?.join(' ') || ''} ${source.year || ''}`.toLowerCase().includes(resultFilter.toLowerCase().trim()));
  const currentSource = inspectionScope ? pinnedSource : (selectedRef ? sourceByRef.get(selectedRef) : undefined) || (!isMobile ? rows[0] : undefined);
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
    event.preventDefault(); setError('');
    if (startLock.current) return;
    if (!question.trim()) { searchRef.current?.focus(); return; }
    if (questionTooLong) { searchRef.current?.focus(); return; }
    const from = yearFrom ? Number(yearFrom) : null, to = yearTo ? Number(yearTo) : null;
    if ([from, to].some(year => year != null && (!Number.isInteger(year) || year < 1500 || year > 2200))) {
      setError('Choose whole publication years between 1500 and 2200.'); return;
    }
    if (from && to && from > to) { setError('The start year must be earlier than or equal to the end year.'); return; }
    startLock.current = true; setStarting(true);
    let reviewedDispatch = false;
    try {
      if (routing === 'auto' || reviewedSearch) {
        const filters = { year_from: from, year_to: to };
        const signature = JSON.stringify({ question, routing, ...(routing === 'manual' ? { provider } : {}), filters, agentic: reviewedSearch });
        if (pendingReviewed.current?.signature !== signature) pendingReviewed.current = { signature, key: crypto.randomUUID() };
        const pending = pendingReviewed.current;
        if (!pending.conversationId) {
          const created = await request<Conversation>('/conversations', { method: 'POST', body: JSON.stringify({ routing, ...(routing === 'manual' ? { providers: [provider] } : {}), filters }) });
          pending.conversationId = created.id; pending.revision = created.revision; setPendingReviewedId(created.id);
        }
        reviewedDispatch = true;
        const accepted = await request<Conversation>(`/conversations/${encodeURIComponent(pending.conversationId)}/turns`, { method: 'POST', body: JSON.stringify({ message: question, action: 'discover', routing, ...(routing === 'manual' ? { providers: [provider] } : {}), filters, agentic: reviewedSearch, idempotency_key: pending.key, expected_revision: pending.revision }) });
        pendingReviewed.current = null; setPendingReviewedId(null);
        openReviewedConversation(accepted.id);
        return;
      }
      const result = await request<{ id: string; snapshot?: Snapshot }>('/research-runs', { method: 'POST', body: JSON.stringify({ question, provider, filters: { year_from: from, year_to: to }, idempotency_key: crypto.randomUUID() }) });
      activeRun.current = result.id; setOrderedRefs([]); setRankingApplied(false); setInspectionScope(null); setSelectedRef(null); setPreviewTab('overview'); setResultFilter(''); setView('research');
      const next = result.snapshot || await request<Snapshot>(`/research-runs/${encodeURIComponent(result.id)}/snapshot`);
      applySnapshot(next); setRunId(result.id); setStreamGeneration(value => value + 1);
      window.history.replaceState(null, '', `?run=${encodeURIComponent(result.id)}`);
      try { localStorage.setItem('research-scout:last-run', result.id); } catch { /* Backend state is authoritative. */ }
    } catch (failure) { setError(reviewedDispatch && (!(failure instanceof ApiError) || failure.status >= 500) ? `The reviewed-search response was interrupted; the request may already be running. Open its saved exploration before sending another request. ${message(failure)}` : message(failure)); }
    finally { startLock.current = false; setStarting(false); }
  }

  function openReviewedConversation(id: string) {
    setConversationId(id); setWorkspaceMode('explore'); setView('research'); setError(''); setMenuOpen(false);
    window.history.replaceState(null, '', `?conversation=${encodeURIComponent(id)}`);
  }

  async function mutate(key: string, path: string, body: unknown, method = 'POST') {
    const id = activeRun.current;
    if (!id) return false;
    setBusy(previous => ({ ...previous, [key]: true })); setError('');
    try {
      await request(path, { method, body: JSON.stringify(body) });
      await refreshSnapshot(id);
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        await refreshSnapshot(id).catch(() => undefined);
        setError('This research changed while you were editing. Your reason is still here. Review the latest state and apply your decision again.');
      } else setError(message(failure));
      return false;
    } finally { setBusy(previous => ({ ...previous, [key]: false })); }
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
    returnFocus.current = invoker;
    setSelectedRef(source.source_ref); setPreviewTab(view === 'notes' ? 'notes' : 'overview');
    setMobilePreviewOpen(isMobile);
    if (window.matchMedia('(min-width: 900px) and (max-width: 1150px)').matches) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.embedded-inspector')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    }
  }
  function closeInspector() {
    if (inspectorRef.current?.open) inspectorRef.current.close();
    setMobilePreviewOpen(false);
    if (isMobile) setSelectedRef(null);
    requestAnimationFrame(() => { if (returnFocus.current?.isConnected) returnFocus.current.focus(); });
  }
  function newResearch() {
    setWorkspaceMode('discover');
    activeRun.current = null; snapshotRef.current = null; setRunId(null); setSnapshot(null); setOrderedRefs([]); setSelectedRef(null); setInspectionScope(null);
    setView('research'); setPreviewTab('overview'); setResultFilter(''); setQuestion(''); setProvider('openalex'); setRouting('auto'); setError(''); setMenuOpen(false); setConnection('saved');
    window.history.replaceState(null, '', window.location.pathname);
    try { localStorage.removeItem('research-scout:last-run'); } catch { /* Optional navigation preference. */ }
    requestAnimationFrame(() => { searchRef.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  }
  function applyRanking() {
    setOrderedRefs(previous => [...previous].sort((a, b) => (sourceByRef.get(b)?.rank_score ?? 0) - (sourceByRef.get(a)?.rank_score ?? 0) || a.localeCompare(b)));
    setRankingApplied(true); setNotice('Saved ranking applied. Your shortlist is unchanged.');
  }

  async function openChatSource(source: ChatSource) {
    const opened = await openRun(source.run_id, { sourceRef: source.source_ref, conversationId });
    if (!opened) throw new Error('The saved source could not be opened.');
    setMobilePreviewOpen(isMobile);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.workbench')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
  }

  function selectWorkspaceMode(next: 'discover' | 'explore') {
    setWorkspaceMode(next);
    const url = new URL(window.location.href);
    url.searchParams.delete('run'); url.searchParams.delete('conversation'); url.searchParams.delete('source'); url.searchParams.delete('from_conversation');
    if (next === 'explore' && conversationId) url.searchParams.set('conversation', conversationId);
    else if (next === 'discover' && runId) { url.searchParams.set('run', runId); if (inspectionScope) { url.searchParams.set('source', inspectionScope.sourceRef); if (inspectionScope.conversationId) url.searchParams.set('from_conversation', inspectionScope.conversationId); } }
    window.history.replaceState(null, '', url.pathname + url.search);
  }

  function viewRawCandidates() {
    setInspectionScope(null); setSelectedRef(null); setResultFilter(''); setView('research');
    if (runId) window.history.replaceState(null, '', `?run=${encodeURIComponent(runId)}`);
  }

  const viewLabel = view === 'saved' ? 'Saved shortlist' : view === 'notes' ? 'Research notes' : 'Discover';
  const scopeLabel = yearFrom || yearTo ? `${yearFrom || 'Any year'}–${yearTo || 'present'}` : 'Any year';
  const noteCount = allRows.filter(source => snapshot?.selections[source.source_ref]?.reason?.trim()).length;
  const preview = currentSource && snapshot ? <SourcePreview
    source={currentSource} snapshot={snapshot} tab={previewTab} onTabChange={setPreviewTab}
    reason={reason} onReasonChange={value => setReasonDrafts(previous => ({ ...previous, [draftKey]: value }))}
    onSelect={(state, citation) => void selectSource(currentSource, state, reason, citation)}
    onDetails={() => void mutate(`details:${currentSource.source_ref}`, `${sourcePath(snapshot.id, currentSource.source_ref)}/details`, {})}
    onCheck={() => void mutate(`check:${currentSource.source_ref}`, `${sourcePath(snapshot.id, currentSource.source_ref)}/metadata-checks`, {})}
    busy={busy} error={error} isFixture={!!isFixture} onClose={isMobile ? closeInspector : undefined}
  /> : null;

  function changeView(next: View) {
    setWorkspaceMode('discover');
    setView(next); setMenuOpen(false); setSelectedRef(null); setResultFilter('');
    setPreviewTab(next === 'notes' ? 'notes' : 'overview');
  }
  function showSettings() { setMenuOpen(false); settingsRef.current?.showModal(); }
  function showProviders() { setMenuOpen(false); providersRef.current?.showModal(); }

  return <div className={`app-shell${density === 'compact' ? ' compact' : ''}`}>
    <a className="skip-link" href="#workspace">Skip to research workspace</a>
    <button className={`nav-scrim${menuOpen ? ' visible' : ''}`} aria-label="Close navigation" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} />
    <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Workspace navigation" inert={isMobile && !menuOpen ? true : undefined}>
      <div className="brand-row"><button className="brand" onClick={newResearch} aria-label="Research Scout home"><span className="brand-mark"><Icon name="compass" /></span><span>research scout</span></button><button className="icon-button close-navigation" aria-label="Close workspace navigation" onClick={() => setMenuOpen(false)}><Icon name="close" /></button></div>
      <button className="workspace-switcher" onClick={showSettings}><span className="workspace-avatar">RS</span><span>Your workspace</span><Icon name="chevron" /></button>
      <p className="nav-label">WORKSPACE</p>
      <nav className="primary-nav" aria-label="Research views">
        <button className={`nav-item${view === 'research' ? ' active' : ''}`} aria-current={view === 'research' ? 'page' : undefined} onClick={() => changeView('research')}><Icon name="search" />Discover</button>
        <button className={`nav-item${view === 'saved' ? ' active' : ''}`} aria-current={view === 'saved' ? 'page' : undefined} onClick={() => changeView('saved')}><Icon name="bookmark" />Saved shortlist<span className="nav-count">{includedCount}</span></button>
        <button className={`nav-item${view === 'notes' ? ' active' : ''}`} aria-current={view === 'notes' ? 'page' : undefined} onClick={() => changeView('notes')}><Icon name="file" />Research notes<span className="nav-count">{noteCount}</span></button>
      </nav>
      <div className="recent-research"><p className="nav-label">RECENT SEARCHES</p>{runs.length ? runs.slice(0, 6).map(run => <button className={`recent-run${run.id === runId ? ' current' : ''}`} key={run.id} onClick={() => void openRun(run.id)} title={run.question}><span className={`run-dot${isActive(run.status) ? ' active' : ''}`} /><span>{run.question}</span></button>) : <p className="quiet-text recent-empty">Your searches will appear here.</p>}</div>
      <div className="sidebar-bottom"><nav className="primary-nav" aria-label="Workspace controls"><button className="nav-item" onClick={showProviders}><Icon name="layers" />Providers<span className="nav-count">{providersReady ? providers.length : '—'}</span></button><button className="nav-item" onClick={showSettings}><Icon name="sliders" />Settings</button></nav><div className="connection-card"><strong><span className={`status-dot${providersReady ? ' ready' : ''}`} />{providersReady ? 'Local workspace' : 'Connecting to service'}</strong><p>{isFixture ? 'Fixture records · test examples only.' : 'Your research and decisions stay in this workspace.'}</p></div><div className="workspace-profile"><span className="local-avatar"><Icon name="compass" /></span><div><strong>Your research</strong><span>Human-reviewed shortlist</span></div></div></div>
    </aside>
    <div className="main-shell" inert={isMobile && menuOpen ? true : undefined}>
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Icon name="menu" /></button><span>Workspace</span><span className="breadcrumb-slash" aria-hidden="true">/</span><strong>{viewLabel}</strong></div><div className="header-actions"><span className={`environment-label${isFixture ? ' fixture' : ''}`}><i />{isFixture ? 'Fixture data' : mode?.toLowerCase() === 'live' ? 'Live provider data' : 'Local workspace'}</span><button className="icon-button settings-button" aria-label="Open workspace settings" onClick={showSettings}><Icon name="sliders" /></button>{snapshot && includedCount > 0 ? <details className="export-disclosure"><summary className="button small"><Icon name="download" />Export<Icon name="chevron" /></summary><div className="export-popover"><p>Saved revision {snapshot.revision}</p><button disabled={exporting} onClick={() => void exportSelection('bibliography')}><Icon name="file" />Bibliography (.md)</button><button disabled={exporting} onClick={() => void exportSelection('manifest')}><Icon name="layers" />Query manifest (.json)</button><span>Saved fields · no new research calls</span></div></details> : <button className="button small" disabled><Icon name="download" />Export</button>}</div></header>
      <main id="workspace" tabIndex={-1}>
        <section className="page-heading" aria-labelledby="page-heading"><div><p className="eyebrow"><Icon name={view === 'research' ? 'search' : view === 'saved' ? 'bookmark' : 'file'} />{view === 'research' ? 'Discovery workspace' : 'Your research workspace'}</p><h1 id="page-heading">{view === 'research' ? workspaceMode === 'explore' ? 'Explore research' : 'Discover research' : viewLabel}</h1><p className="page-intro">{view === 'saved' ? 'The sources you chose, with your decisions intact.' : view === 'notes' ? 'Your reasons, saved with each source decision.' : 'A clear path from question to evidence.'}</p></div><button className="button new-research" onClick={newResearch}><Icon name="plus" />New research<span className="keyboard-hint">N</span></button></section>
        <nav className="mobile-views" aria-label="Quick research views"><button className={view === 'research' ? 'active' : ''} aria-current={view === 'research' ? 'page' : undefined} onClick={() => changeView('research')}>Discover</button><button className={view === 'saved' ? 'active' : ''} aria-current={view === 'saved' ? 'page' : undefined} onClick={() => changeView('saved')}>Shortlist <span>{includedCount}</span></button><button className={view === 'notes' ? 'active' : ''} aria-current={view === 'notes' ? 'page' : undefined} onClick={() => changeView('notes')}>Notes</button></nav>
        {view === 'research' && <div className="workspace-mode-switch" role="group" aria-label="Research mode"><button aria-pressed={workspaceMode === 'discover'} onClick={() => selectWorkspaceMode('discover')}><Icon name="search" />Search workspace</button><button aria-pressed={workspaceMode === 'explore'} onClick={() => selectWorkspaceMode('explore')}><Icon name="compass" />Exploration chat</button></div>}
        {view === 'research' && workspaceMode === 'explore' ? <ExplorationChat providers={providers} providersReady={providersReady} initialId={conversationId} onIdChange={setConversationId} onOpenSource={openChatSource} /> : <>
        {view === 'research' && <form onSubmit={event => void startResearch(event)} className="research-form">
          <label className="query-label" htmlFor="research-question"><Icon name="search" />Your research question</label>
          <div className="question-composer"><textarea ref={searchRef} id="research-question" rows={2} value={question} aria-label="Research question" aria-invalid={questionTooLong} aria-describedby={`question-limit scope-hint${questionTooLong ? ' question-limit-error' : ''}`} onChange={event => setQuestion(event.target.value)} placeholder="What would you like to understand?" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" className="button primary search-button" disabled={starting || !providersReady || providerUnavailable || !question.trim() || questionTooLong}>{starting ? <span className="spinner" /> : null}<span>{starting ? 'Starting' : 'Search'}</span><Icon name="arrow" /></button></div>
          <div className="scope-toolbar"><div className="scope-chips">{routing === 'manual' ? <label className="provider-field"><span className="provider-mark" aria-hidden="true">{providerLabel(provider).charAt(0).toUpperCase()}</span><select aria-label="Discovery provider" value={provider} onChange={event => setProvider(event.target.value as ProviderId)}>{DISCOVERY_PROVIDERS.map(id => { const item = providers.find(p => p.id === id); const unavailable = !item || item.access_configured === false || ['unavailable', 'disabled', 'unconfigured', 'blocked', 'not_configured', 'needs_access', 'configuration_error'].includes(normalStatus(item.status)); return <option key={id} value={id} disabled={unavailable}>{providerLabel(id)}{unavailable ? ' (unavailable)' : ''}</option>; })}</select></label> : <span className="automatic-scope-label">Search connected sources</span>}<button type="button" className="scope-chip" onClick={showSettings}><Icon name="layers" />{routing === 'auto' ? 'Automatic source routing' : provider === 'openalex' ? 'Hybrid search' : 'Lexical + local rerank'}<Icon name="chevron" /></button><button type="button" className="scope-chip" onClick={showSettings} aria-label="Edit publication years"><Icon name="clock" />{scopeLabel}<Icon name="chevron" /></button></div><span className="query-count" id="question-limit">{questionBytes.toLocaleString()} / 2,000 UTF-8 bytes</span></div>
          <label className="manual-routing-toggle workspace-manual-toggle"><input type="checkbox" aria-label="Choose sources manually" checked={routing === 'manual'} disabled={starting} onChange={event => setRouting(event.target.checked ? 'manual' : 'auto')} /><span>Choose sources manually</span></label>
          {routing === 'auto' && <ConnectedSources providers={providers} />}
          {!exactDoiQuestion && <div className="search-refinement-control"><label><input type="checkbox" aria-label="Refine search with AI" aria-describedby="workspace-refinement-help" checked={refineSearch} disabled={!refinementReady || starting} onChange={event => { refinementEdited.current = true; setRefineSearch(event.target.checked); }} /><span><strong>Refine search with AI</strong><span id="workspace-refinement-help">{refinementReady ? 'Clarifies this question and checks relevance. Reviewed results open in Exploration chat.' : retrievalConfig.blocked_reason || 'AI refinement is unavailable. Direct provider search remains available.'}</span></span></label></div>}
          <p className="scope-hint" id="scope-hint">{routing === 'auto' ? 'Automatically searches appropriate connected sources. Papers and open-access checks appear in Exploration chat.' : reviewedSearch ? 'AI-refined discovery · this question, provider and publication filters open as a reviewed exploration.' : provider === 'openalex' ? 'Direct provider search · native lexical + semantic discovery.' : 'Direct provider search · lexical retrieval with a bounded local rerank when configured.'} Scope changes apply to your next search.</p>
          {questionTooLong && <p id="question-limit-error" className="query-limit-error" role="alert">Shorten your question to 2,000 UTF-8 bytes or fewer before searching. Some characters use more than one byte. Your text has been kept for editing.</p>}
        </form>}
        {!snapshot && view === 'research' && <div className="suggestions"><span>Try a question</span>{['Institutional AI readiness in higher education', 'Retrieval augmented generation evaluation'].map(example => <button key={example} onClick={() => { setQuestion(example); searchRef.current?.focus(); }}>{example}<Icon name="arrow" /></button>)}</div>}
        {error && <div className="feedback error-feedback" role="alert"><Icon name="alert" /><div><strong>This action needs attention</strong><p>{error}</p>{pendingReviewedId && <button className="text-button" type="button" onClick={() => openReviewedConversation(pendingReviewedId)}>Open saved exploration<Icon name="arrow" /></button>}</div><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" /></button></div>}
        {opening && <div className="inline-loading" role="status"><span className="spinner" />Opening saved research…</div>}
        {snapshot && isFixture && <p className="fixture-note"><Icon name="file" /><span><strong>Fixture workspace.</strong> These records and outcomes are test examples, not live research findings.</span></p>}
        <div className="activity-line">
          {snapshot ? <section className="run-progress" aria-label="Research progress" data-testid="run-progress" data-status={normalStatus(snapshot.status)}><div className="progress-heading"><span className={`status-dot${running ? ' pulse' : ' ready'}`} /><strong>{allRows.length} {allRows.length === 1 ? 'source' : 'sources'} available</strong><span>{running ? '· Research in progress' : `· ${humanStatus(snapshot.status) === 'Succeeded' ? 'Discovery complete' : humanStatus(snapshot.status)}`}</span></div><div className="branch-statuses">{branches.map(branch => <span className={`branch-status ${normalStatus(snapshot.operations[branch]?.status)}`} key={branch}>{isSuccess(snapshot.operations[branch]?.status) ? <Icon name="check" /> : <Icon name={isActive(snapshot.operations[branch]?.status) ? 'clock' : 'alert'} />}{branch === 'lexical' ? 'Lexical' : 'Semantic'}: {humanStatus(snapshot.operations[branch]?.status)}</span>)}<span className={`connection-status${connection === 'reconnecting' ? ' stale' : ''}`}>{connection === 'reconnecting' ? 'Reconnecting · updates may be stale' : connection === 'connecting' ? 'Connecting to updates' : 'Saved state synced'}</span>{running && <button className="text-button cancel-button" disabled={busy.cancel} onClick={() => void mutate('cancel', `/research-runs/${encodeURIComponent(snapshot.id)}/cancel`, {})}><Icon name="stop" />Cancel</button>}</div></section> : <p className="quiet-text">Choose a question to begin. Sources appear as they arrive.</p>}
          <div className="density-switch" role="group" aria-label="Source density controls"><button aria-label="Comfortable source density" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><Icon name="layers" /></button><button aria-label="Compact source density" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><Icon name="menu" /></button></div>
        </div>
        {snapshot && connection === 'reconnecting' && <p className="reconnect-note"><Icon name="refresh" />Your sources and decisions remain available. Recovery reads saved state{lastSynced ? `; last synced ${new Date(lastSynced).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}.</p>}
        {snapshot?.plan?.source_review_scope && <div className="coverage-notice"><Icon name="alert" /><p>Raw provider candidates. AI relevance decisions and the reviewed results are saved in the exploration conversation.</p></div>}
        {inspectionScope && <div className="source-inspection-scope" data-testid="source-inspection-scope"><div><strong>Single-source inspection</strong><p>This reader shows the exact saved record you chose. Other raw provider candidates remain outside this view.</p></div><div>{inspectionScope.conversationId && <button className="button small" onClick={() => openReviewedConversation(inspectionScope.conversationId!)}>Back to reviewed results</button>}<button className="button small" onClick={viewRawCandidates}>View all raw provider candidates</button></div></div>}
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
        <footer className="workspace-footer"><span>{snapshot ? `${providerLabel(snapshot.provider)} · ${includedCount} of 3 included` : routing === 'auto' ? 'One question. Connected sources. Your judgment.' : 'One question. One provider. Your judgment.'}</span><span>Metadata &amp; abstracts · human-reviewed shortlist</span></footer>
        </>}
      </main>
    </div>
    <dialog className="source-inspector mobile-inspector" ref={inspectorRef} aria-labelledby="inspector-heading" onClose={closeInspector} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeInspector(); } }}>{isMobile && preview}</dialog>
    <dialog className="settings-dialog" ref={settingsRef} aria-labelledby="settings-heading"><div className="dialog-heading"><h2 id="settings-heading">Workspace settings</h2><button className="icon-button" aria-label="Close settings" onClick={() => settingsRef.current?.close()}><Icon name="close" /></button></div><div className="dialog-body"><p className="section-explanation">Prepare your next search and choose how you review the results.</p><h3>Search scope</h3><div className="settings-years"><label htmlFor="year-from">Publication year from<input id="year-from" aria-label="Publication year from" inputMode="numeric" type="number" min="1500" max="2200" value={yearFrom} onChange={event => setYearFrom(event.target.value)} placeholder="Any" /></label><label htmlFor="year-to">Publication year to<input id="year-to" aria-label="Publication year to" inputMode="numeric" type="number" min="1500" max="2200" value={yearTo} onChange={event => setYearTo(event.target.value)} placeholder="Present" /></label></div><div className="strategy-setting"><Icon name="layers" /><div><strong>{providerRetrieval(selectedProvider)}</strong><p>{provider === 'openalex' ? 'Native lexical and semantic searches within OpenAlex, with consistent supported filters.' : 'Lexical search within the selected provider. A configured local encoder can rerank its bounded candidate pool; this does not add native semantic discovery.'}</p></div></div><p className="action-note">Provider and year edits apply when you explicitly start a new search. Existing results retain their original scope.</p><h3>Reading preferences</h3><label className="setting-row" htmlFor="source-density"><span>Source density<small>Choose your scanning rhythm.</small></span><select id="source-density" aria-label="Source density" value={density} onChange={event => setDensity(event.target.value as 'comfortable' | 'compact')}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><label className="setting-row" htmlFor="show-excerpts"><span>Source excerpts<small>Show abstract previews in the source list.</small></span><input type="checkbox" id="show-excerpts" aria-label="Source excerpts" checked={showExcerpts} onChange={event => setShowExcerpts(event.target.checked)} /></label><p className="action-note">Display preferences apply to this open workspace. They make no research or model calls.</p></div><div className="dialog-footer"><button className="button primary" onClick={() => settingsRef.current?.close()}>Done</button></div></dialog>
    <dialog className="settings-dialog" ref={providersRef} aria-labelledby="providers-heading"><div className="dialog-heading"><h2 id="providers-heading">Research providers</h2><button className="icon-button" aria-label="Close providers" onClick={() => providersRef.current?.close()}><Icon name="close" /></button></div><div className="dialog-body"><p className="section-explanation">Automatic routing chooses appropriate connected resources and includes DOI open-access checks. Advanced manual selection supports up to two discovery providers. Each provider observation stays separately attributable.</p>{providers.map(item => <div className="provider-status" key={item.id}><div><strong>{providerLabel(item.id)}</strong><span>{providerRole(item.id)}</span></div><div className="provider-status-summary"><strong>{providerReadiness(item)}</strong><span>{item.mode?.toLowerCase().includes('fixture') ? 'Fixture data' : item.mode || 'Configuration pending'}</span></div>{(item.blocked_reason || item.last_error || !!item.verified_capabilities?.length) && <p className="provider-proof">{item.blocked_reason && <span>{item.blocked_reason}</span>}{item.last_error && <span>Last request: {item.last_error === 'UPSTREAM_RATE_LIMIT' ? 'rate-limited. Wait before retrying.' : humanStatus(item.last_error)}</span>}{!!item.verified_capabilities?.length && <span>Verified operations: {item.verified_capabilities.map(capability => humanStatus(capability === 'keyword' ? 'lexical' : capability)).join(', ')}</span>}</p>}</div>)}{!providersReady && <p className="action-note">Provider configuration could not be loaded yet. Availability is not confirmed.</p>}<p className="action-note">These statuses come from the application service. Access configuration remains in the existing local backend setup.</p></div><div className="dialog-footer"><button className="button primary" onClick={() => providersRef.current?.close()}>Done</button></div></dialog>
    {notice && <div className="toast" role="status"><Icon name="check" />{notice}</div>}
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
  </div>;
}
