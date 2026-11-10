'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, DISCOVERY_PROVIDERS, humanStatus, isActive, normalStatus, providerLabel, providerReadiness, providerRetrieval, request, sourceTitle, type Provider, type ProviderId } from '@/lib/api';
import type { AnswerConfig, ChatSource, Conversation, ConversationSummary, ExplorationTurn, RetrievalConfig, RoutingMode } from '@/lib/conversations';
import Icon from './icon';
import ConnectedSources from './connected-sources';
import AnswerText, { sourceAnchor } from './answer-text';
import OpenAccessResult from './open-access-result';
import ChatSourceCard from './chat-source-card';
import { groupReviewedSources, reviewedSummary } from '@/lib/reviewed-sources';
import SearchRefinement, { retrievalStatus } from './search-refinement';

const IDS = DISCOVERY_PROVIDERS;
const RESOURCE_IDS = [...DISCOVERY_PROVIDERS, 'datacite', 'unpaywall', 'openai'];
const unavailable = (provider?: Provider) => !provider || provider.access_configured === false || ['unavailable', 'disabled', 'unconfigured', 'blocked', 'not_configured', 'needs_access', 'configuration_error'].includes(normalStatus(provider.status));
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The service could not complete this action.';
const normalize = (conversation: Conversation): Conversation => ({ ...conversation, turns: (conversation.turns || []).map(turn => ({ ...groupReviewedSources(turn), warnings: turn.warnings || [], run_ids: turn.run_ids || [] })) });
const compacted = (turn: ExplorationTurn) => !!turn.history_compacted || !!turn.retrieval?.llm_requests?.some(item => item.body_compacted);
function citedResponse(turn: ExplorationTurn) {
  return turn.response.split(/(\[S\d+\])/g).map((part, index) => {
    const label = /^\[(S\d+)\]$/.exec(part)?.[1];
    const source = label && turn.sources.find(source => source.citation_label === label);
    return source ? <a key={index} className="answer-citation" href={`#${sourceAnchor(turn.id, label!)}`} aria-label={`${label}: ${providerLabel(source.provider)}, ${sourceTitle(source)}`}>{part}</a> : part;
  });
}
function ResourceActivity({ turn }: { turn: ExplorationTurn }) {
  const activity = turn.activity || turn.provider_activity;
  return <details className="turn-resource-activity" open={turn.action === 'generate' || turn.action === 'lookup' || turn.action === 'access'}><summary>Resource activity<Icon name="chevron" /></summary><div>{RESOURCE_IDS.map(id => {
    const recorded = activity?.filter(item => item.provider === id) || [];
    return <div className="resource-activity-row" key={id} data-testid={`activity-${id}`}><strong>{id === 'openai' ? 'OpenAI · AI tasks' : providerLabel(id)}</strong>{recorded.length ? <ul>{recorded.map((item, index) => <li key={`${item.operation}:${index}`}><span>{item.operation === 'agency' ? 'DOI agency' : item.operation === 'metadata' ? 'DOI metadata' : item.operation === 'hybrid_search' ? 'Hybrid search' : item.operation === 'generation' ? 'Answer stream' : humanStatus(item.operation)}</span><span>{humanStatus(item.status)} · {item.attempts} {item.attempts === 1 ? 'attempt' : 'attempts'}{item.source_count ? ` · ${item.source_count} sources` : ''}</span></li>)}</ul> : <span>{activity ? id === 'openai' ? 'Not used this turn' : 'Not queried this turn' : 'Activity not recorded'}</span>}</div>;
  })}</div><p>Paper searches stay provider-scoped. Crossref also resolves DOI metadata; DataCite supplies registered DOI records. Unpaywall reports access locations, not paper abstracts. AI can refine selected searches and review relevance when enabled. Writing an answer remains a separate Stream answer action.</p></details>;
}

export default function ExplorationChat({ providers, providersReady, initialId, onIdChange, onOpenSource }: {
  providers: Provider[];
  providersReady: boolean;
  initialId: string | null;
  onIdChange: (id: string | null) => void;
  onOpenSource: (source: ChatSource) => Promise<void>;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const current = useRef<Conversation | null>(null);
  const restoredTurns = useRef(new Map<string, ExplorationTurn>());
  const [restoringTurn, setRestoringTurn] = useState<string | null>(null);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [message, setMessage] = useState('');
  const [routing, setRouting] = useState<RoutingMode>('auto');
  const [selected, setSelected] = useState<ProviderId[]>(['openalex']);
  const [action, setAction] = useState<'discover' | 'saved' | 'lookup' | 'generate' | 'access'>('discover');
  const [answerConfig, setAnswerConfig] = useState<AnswerConfig>({ enabled: false, status: 'loading' });
  const [retrievalConfig, setRetrievalConfig] = useState<RetrievalConfig>({ enabled: false, ready: false, status: 'loading' });
  const [agentic, setAgentic] = useState(false);
  const agenticEdited = useRef(false);
  const [yearFrom, setYearFrom] = useState('2020');
  const [yearTo, setYearTo] = useState('');
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'saved' | 'connecting' | 'connected' | 'reconnecting'>('saved');
  const [streamVersion, setStreamVersion] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const requestedId = useRef<string | null>(null);
  const mounted = useRef(true);
  const submitLock = useRef(false);
  const pendingSend = useRef<{ signature: string; key: string } | null>(null);
  const anchoredTurn = useRef<string | null>(null);
  const messageBytes = new TextEncoder().encode(message).length;
  const tooLong = messageBytes > 2000;
  const isDoi = /^(?:https?:\/\/doi\.org\/|doi:\s*)?10\.\d{4,9}\/\S+$/i.test(message.trim());
  const lookup = action === 'lookup' || action === 'discover' && isDoi;
  const activeTurn = conversation?.turns.find(turn => isActive(turn.status));
  const running = conversation?.status === 'RUNNING' || !!activeTurn;
  const hasSources = !!conversation?.turns.some(turn => turn.sources.length);
  const latestEvidence = conversation?.turns.findLast(turn => turn.action !== 'generate' && turn.sources.length);
  const liveEvidence = !!latestEvidence?.sources.length && latestEvidence.sources.every(source => source.mode === 'live' && !source.fictional);
  const previousQuestion = conversation?.turns.findLast(turn => turn.action === 'discover')?.message || latestEvidence?.message;
  const generationPrompt = previousQuestion || 'Explain what the saved sources show. Cite the supplied sources and describe the limits of the available metadata.';
  const effectiveMessage = action === 'generate' && !message.trim() ? generationPrompt : message;
  const generationBlocked = !answerConfig.enabled ? answerConfig.blocked_reason || 'Answer streaming is not enabled in this workspace.' : !hasSources ? 'Find or look up a source first.' : !liveEvidence ? 'Stream an answer after retrieving live sources. Fixture records are for testing.' : '';
  const autoAvailable = providers.some(provider => IDS.includes(provider.id as ProviderId) && !unavailable(provider));
  const selectedUnavailable = selected.some(id => unavailable(providers.find(provider => provider.id === id)));
  const accessProvider = providers.find(provider => provider.id === 'unpaywall');
  const accessBlocked = !providersReady || unavailable(accessProvider);
  const accessReason = accessProvider?.blocked_reason || 'Unpaywall access lookup is unavailable. Configure its contact email before querying.';
  const refinementReady = retrievalConfig.enabled && retrievalConfig.ready;

  useEffect(() => {
    if (!refinementReady) setAgentic(false);
    else if (!agenticEdited.current && providersReady) setAgentic(routing === 'auto' ? providers.some(provider => IDS.includes(provider.id as ProviderId) && !unavailable(provider) && provider.mode === 'live') : selected.length > 0 && selected.every(id => providers.find(provider => provider.id === id)?.mode === 'live'));
  }, [refinementReady, providersReady, providers, selected, routing]);

  const accept = useCallback((incoming: Conversation) => {
    if (requestedId.current !== incoming.id) return;
    const next = normalize({ ...incoming, turns: (incoming.turns || []).map(turn => compacted(turn) ? restoredTurns.current.get(`${incoming.id}:${turn.id}`) || turn : turn) });
    if (current.current?.id === next.id && current.current.revision > next.revision) return;
    current.current = next;
    setConversation(next);
    setHistory(previous => [{ id: next.id, title: next.title, updated_at: next.updated_at, status: next.status }, ...previous.filter(item => item.id !== next.id)]);
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (!/^#turn-[\w-]+$/.test(hash) || anchoredTurn.current === hash) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    anchoredTurn.current = hash;
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  }, [conversation?.id, conversation?.turns.length]);

  const remember = useCallback((id: string | null) => {
    onIdChange(id);
    const url = new URL(window.location.href);
    const hash = id && url.searchParams.get('conversation') === id ? url.hash : '';
    url.searchParams.delete('run');
    if (id) url.searchParams.set('conversation', id); else url.searchParams.delete('conversation');
    window.history.replaceState(null, '', url.pathname + url.search + hash);
  }, [onIdChange]);

  const open = useCallback(async (id: string) => {
    setOpening(true); setError(''); requestedId.current = id;
    try {
      const saved = normalize(await request<Conversation>(`/conversations/${encodeURIComponent(id)}`));
      if (!mounted.current || requestedId.current !== id) return;
      accept(saved); remember(id);
      setRouting(saved.routing || 'manual');
      setSelected(saved.providers?.length ? saved.providers.slice(0, 2) : ['openalex']);
      setYearFrom(saved.filters?.year_from == null ? '' : String(saved.filters.year_from));
      setYearTo(saved.filters?.year_to == null ? '' : String(saved.filters.year_to));
      setStreamVersion(value => value + 1);
    } catch (failure) { if (mounted.current && requestedId.current === id) setError(`This conversation could not be opened. ${errorText(failure)}`); }
    finally { if (mounted.current) setOpening(false); }
  }, [accept, remember]);

  useEffect(() => {
    mounted.current = true;
    void request<{ conversations: ConversationSummary[] }>('/conversations').then(result => { if (mounted.current) setHistory(result.conversations || []); }).catch(failure => { if (mounted.current) setError(`Conversation history is unavailable. ${errorText(failure)}`); });
    void request<{ generation_enabled: boolean; generation: AnswerConfig; retrieval?: RetrievalConfig }>('/config').then(result => { if (mounted.current) { setAnswerConfig({ ...result.generation, enabled: result.generation_enabled && result.generation?.enabled }); setRetrievalConfig(result.retrieval || { enabled: false, ready: false, status: 'disabled' }); } }).catch(() => { if (mounted.current) { setAnswerConfig({ enabled: false, status: 'unavailable', blocked_reason: 'Answer availability could not be loaded. Refresh the page to check again.' }); setRetrievalConfig({ enabled: false, ready: false, status: 'unavailable', blocked_reason: 'Search refinement availability could not be loaded. Direct provider search remains available.' }); } });
    if (initialId) void open(initialId);
    return () => { mounted.current = false; };
    // The initial route is read once. Revisions arrive through the saved-state stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conversationId = conversation?.id;
  useEffect(() => {
    if (!conversationId) return;
    let disposed = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => {
      const saved = await request<Conversation>(`/conversations/${encodeURIComponent(conversationId)}`);
      if (!disposed) accept(saved);
    };
    const cursor = current.current?.cursor;
    const stream = new EventSource(`/api/conversations/${encodeURIComponent(conversationId)}/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    setConnection('connecting');
    stream.onopen = () => { if (disposed) return; setConnection('connected'); if (poll) clearInterval(poll); poll = undefined; };
    stream.addEventListener('state', event => {
      if (disposed) return;
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as { snapshot: Conversation };
        if (data.snapshot) { accept(data.snapshot); setConnection('connected'); }
      } catch { setConnection('reconnecting'); }
    });
    stream.addEventListener('resync.required', () => {
      stream.close(); setConnection('reconnecting');
      void refresh().then(() => { if (!disposed) setStreamVersion(value => value + 1); }).catch(() => { if (!disposed && !poll) poll = setInterval(() => void refresh().then(() => { if (!disposed) setStreamVersion(value => value + 1); }).catch(() => undefined), 3000); });
    });
    stream.onerror = () => {
      if (disposed) return;
      setConnection('reconnecting');
      if (!poll) poll = setInterval(() => void refresh().catch(() => undefined), 3000);
    };
    return () => { disposed = true; stream.close(); if (poll) clearInterval(poll); };
  }, [conversationId, streamVersion, accept]);

  const statusSignature = conversation?.turns.map(turn => `${turn.id}:${turn.status}:${turn.sources.length}:${turn.related_sources?.length}:${turn.retrieval?.status}:${turn.retrieval?.round}`).join('|');
  useEffect(() => {
    const turn = conversation?.turns.at(-1);
    if (!turn) return;
    const timer = setTimeout(() => setAnnouncement(`${turn.routing === 'auto' && turn.papers ? turn.papers.length : turn.sources.length} ${turn.routing === 'auto' ? 'papers' : 'sources'} in the latest response. ${turn.retrieval ? retrievalStatus(turn.retrieval.status) : humanStatus(turn.status)}. ${isActive(turn.status) ? 'Available sources can be inspected while discovery continues.' : 'The resource response is ready to review.'}`), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusSignature]);

  function newConversation() {
    if (running || sending) return;
    requestedId.current = null; current.current = null; setConversation(null); setError(''); setMessage(''); setAction('discover'); setRouting('auto'); setSelected(['openalex']); pendingSend.current = null; setConnection('saved'); remember(null); input.current?.focus();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current || running || opening || !effectiveMessage.trim() || tooLong) return;
    if (action === 'generate' && generationBlocked) { setError(generationBlocked); return; }
    if (action === 'discover' && !lookup && (!providersReady || (routing === 'auto' ? !autoAvailable : !selected.length || selectedUnavailable))) { setError('Choose an available discovery provider before searching.'); return; }
    if (action === 'discover' && routing === 'manual' && selected.length > 2) { setError('Select at most two discovery providers for this comparison.'); return; }
    if ((action === 'lookup' || action === 'access') && !isDoi) { setError(`Paste one exact DOI or doi.org URL for ${action === 'access' ? 'an open-access' : 'a registry'} lookup.`); input.current?.focus(); return; }
    if (action === 'access' && accessBlocked) { setError(accessReason); return; }
    const from = yearFrom ? Number(yearFrom) : null, to = yearTo ? Number(yearTo) : null;
    if (action === 'discover' && !lookup && ([from, to].some(year => year != null && (!Number.isInteger(year) || year < 1000 || year > 2100)) || from != null && to != null && from > to)) { setError('Choose a valid publication-year range between 1000 and 2100.'); return; }
    submitLock.current = true; setSending(true); setError('');
    try {
      let saved = current.current;
      if (!saved) {
        saved = normalize(await request<Conversation>('/conversations', { method: 'POST', body: JSON.stringify({ routing, ...(routing === 'manual' ? { providers: selected.length ? selected : ['openalex'] } : {}), filters: { year_from: from, year_to: to } }) }));
        requestedId.current = saved.id; accept(saved); remember(saved.id);
      }
      const body = { message: effectiveMessage, action, routing, ...(routing === 'manual' ? { providers: action === 'saved' || action === 'generate' ? saved.providers : selected.length ? selected : ['openalex'] } : {}), ...(action === 'discover' && !lookup ? { filters: { year_from: from, year_to: to }, agentic: agentic && refinementReady } : {}), expected_revision: saved.revision };
      const signature = JSON.stringify({ id: saved.id, message: effectiveMessage, action, routing, providers: body.providers, filters: body.filters, agentic: body.agentic });
      if (pendingSend.current?.signature !== signature) pendingSend.current = { signature, key: crypto.randomUUID() };
      const updated = await request<Conversation>(`/conversations/${encodeURIComponent(saved.id)}/turns`, { method: 'POST', body: JSON.stringify({ ...body, idempotency_key: pendingSend.current.key }) });
      if (!mounted.current) return;
      accept(updated); setMessage(''); pendingSend.current = null; setStreamVersion(value => value + 1);
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 409 && current.current) {
        await request<Conversation>(`/conversations/${encodeURIComponent(current.current.id)}`).then(accept).catch(() => undefined);
        setError(`The conversation changed or another research operation is active. Your message is kept. ${errorText(failure)}`);
      } else setError(errorText(failure));
    } finally { submitLock.current = false; if (mounted.current) setSending(false); }
  }

  async function cancel() {
    if (!conversation || !activeTurn) return;
    setStopping(true); setError('');
    try { accept(await request<Conversation>(`/conversations/${encodeURIComponent(conversation.id)}/turns/${encodeURIComponent(activeTurn.id)}/cancel`, { method: 'POST', body: '{}' })); }
    catch (failure) { setError(errorText(failure)); }
    finally { setStopping(false); }
  }

  async function inspect(source: ChatSource) {
    setInspecting(`${source.run_id}:${source.source_ref}`); setError('');
    try { await onOpenSource(source); }
    catch (failure) { setError(errorText(failure)); }
    finally { if (mounted.current) setInspecting(null); }
  }

  async function openSavedResults(turnId: string) {
    const id = current.current?.id;
    if (!id || restoringTurn) return;
    setRestoringTurn(turnId); setError('');
    try {
      const turn = await request<ExplorationTurn>(`/conversations/${encodeURIComponent(id)}/turns/${encodeURIComponent(turnId)}`);
      if (!mounted.current || requestedId.current !== id || current.current?.id !== id) return;
      if (turn.id !== turnId) throw new Error('Saved results did not match the requested turn.');
      restoredTurns.current.set(`${id}:${turnId}`, turn);
      accept({ ...current.current, turns: current.current.turns.map(item => item.id === turnId ? turn : item) });
    } catch (failure) { if (mounted.current && requestedId.current === id) setError(`Saved results could not be opened. ${errorText(failure)}`); }
    finally { if (mounted.current) setRestoringTurn(null); }
  }

  return <section className="exploration-chat" aria-label="Exploration chat">
    <div className="exploration-toolbar"><div><strong>Explore with your research sources</strong><p>Search connected scholarly resources automatically, with matching DOI records grouped into one paper and open-access checks included. AI refinement can improve discovery; Stream answer separately writes from saved sources.</p></div><button className="button small" type="button" disabled={running || sending} onClick={newConversation}><Icon name="plus" />New conversation</button></div>
    {!!history.length && <label className="conversation-history">Saved conversation<select aria-label="Saved conversation" value={conversation?.id || ''} disabled={running || sending || opening} onChange={event => { if (event.target.value) void open(event.target.value); }}><option value="">Choose a conversation</option>{history.map(item => <option key={item.id} value={item.id}>{item.title || 'Untitled conversation'}</option>)}</select></label>}
    {error && <div className="feedback error-feedback" role="alert"><Icon name="alert" /><div><strong>Exploration needs attention</strong><p>{error}</p></div><button className="icon-button" aria-label="Dismiss exploration error" onClick={() => setError('')}><Icon name="close" /></button></div>}
    {opening && <p className="inline-loading" role="status"><span className="spinner" />Opening saved conversation…</p>}
    <div className="conversation-transcript" aria-label="Conversation messages">
      {!conversation?.turns.length && !opening && <div className="conversation-empty"><span className="empty-symbol"><Icon name="compass" /></span><h2>Follow a question through the evidence.</h2><p>Ask your research question. Research Scout chooses appropriate connected resources, groups matching papers and checks reported open-access copies. Manual source selection is available when you need it.</p><div className="conversation-examples"><button type="button" onClick={() => { setAction('lookup'); setMessage(providers.find(provider => provider.id === 'crossref')?.mode === 'fixture' ? '10.0000/scout.fixture.crossref.001' : '10.1038/nphys1170'); input.current?.focus(); }}>Try a Crossref DOI<Icon name="arrow" /></button><button type="button" onClick={() => { setAction('lookup'); setMessage(providers.find(provider => provider.id === 'datacite')?.mode === 'fixture' ? '10.0000/scout.fixture.datacite.002' : '10.14454/qdd3-ps68'); input.current?.focus(); }}>Try a DataCite DOI<Icon name="arrow" /></button></div></div>}
      {conversation?.turns.map((turn, index) => { const response = reviewedSummary(turn) ?? turn.response; const papers = turn.action === 'discover' && turn.routing === 'auto' ? turn.papers || [] : undefined; return <article className="exploration-turn" id={`turn-${turn.id}`} tabIndex={-1} key={turn.id} data-testid="exploration-turn" data-status={normalStatus(turn.status)}>
        <div className="turn-question"><span className="message-avatar">You</span><div><p className="message-label">Question {index + 1}</p><p>{turn.message}</p><span className="turn-intent">{turn.action === 'generate' ? 'Answer from saved sources · no new search' : turn.action === 'saved' ? 'Saved evidence · no new search' : turn.action === 'lookup' ? 'DOI registry lookup' : turn.action === 'access' ? 'Open-access lookup · Unpaywall' : `${turn.routing === 'auto' ? 'Automatic routing · ' : ''}${turn.providers.map(providerLabel).join(' + ') || 'Planning connected sources'}`}</span></div></div>
        <div className="turn-response"><span className="message-avatar scout"><Icon name="compass" /></span><div className="turn-response-body"><div className="response-heading"><strong>{turn.action === 'generate' ? 'OpenAI answer' : 'Research Scout'}</strong><span className={`turn-state ${normalStatus(turn.status)}`}>{isActive(turn.status) && <span className="spinner" />}{turn.action === 'generate' && isActive(turn.status) ? turn.response ? 'Streaming draft' : 'Starting answer' : humanStatus(turn.status)}</span></div>
          {turn.action !== 'saved' && turn.action !== 'generate' && turn.action !== 'access' && <div className="turn-provider-stages">{turn.providers.map(id => <span key={id}><span className="provider-dot" />{providerLabel(id)}<small>{turn.sources.filter(source => source.provider === id).length} observations available</small></span>)}</div>}
          {turn.action === 'generate' && <p className="answer-model">Demo answer writer · {turn.generation?.model || turn.plan.model || answerConfig.model || 'OpenAI'}{turn.generation?.status === 'completed' ? ' · Completed' : ' · Draft, review pending'}</p>}
          {turn.action === 'generate' && (turn.generation?.omitted_source_count || 0) > 0 && <p className="answer-model" data-testid="answer-coverage">{turn.sources.length} saved source {turn.sources.length === 1 ? 'preview' : 'previews'} used; {turn.generation!.omitted_source_count} other {turn.generation!.omitted_source_count === 1 ? 'record' : 'records'} not included. Saved evidence reused; no new scholarly queries.</p>}
          {compacted(turn) && <div className="answer-retry" data-testid="compacted-history"><p>{turn.saved_result_counts ? `Saved results: ${turn.saved_result_counts.papers || turn.saved_result_counts.sources}. ` : ''}Some details are collapsed in this long conversation. Open them from saved state; no research or model calls.</p><button className="button small" disabled={restoringTurn !== null} onClick={() => void openSavedResults(turn.id)}>{restoringTurn === turn.id ? 'Opening saved results…' : 'Open saved results'}</button></div>}
          {turn.source_plan?.length && <details className="turn-source-plan" data-testid="source-routing-plan"><summary>Source routing plan<Icon name="chevron" /></summary><p>Planned routing and readiness. Actual calls are listed in Resource activity.</p>{turn.source_plan.map(item => <div key={item.provider}><strong>{providerLabel(item.provider)}{item.role === 'access' ? ' · access' : ''}</strong><span>{humanStatus(item.status)} · {humanStatus(item.health_status)}</span><p>{item.reason}</p></div>)}</details>}{turn.retrieval && <SearchRefinement retrieval={turn.retrieval} />}
          {response ? turn.action === 'generate' ? <AnswerText turn={turn} /> : <p className="resource-response">{citedResponse({ ...turn, response })}</p> : <p className="quiet-text">{isActive(turn.status) ? turn.action === 'generate' ? 'Waiting for the first answer text. Saved sources remain available below.' : turn.retrieval ? `${retrievalStatus(turn.retrieval.status)}. Source batches appear after their relevance review.` : 'Waiting for the selected resources. Available sources can be opened immediately.' : 'No response text was supplied. Review the provider outcome and any available sources.'}</p>}
          <ResourceActivity turn={turn} />
          {turn.access && <OpenAccessResult access={turn.access} />}
          {!!turn.warnings.length && <div className="turn-warnings">{turn.warnings.map((warning, i) => <p key={`${i}:${warning}`}><Icon name="alert" />{warning}</p>)}</div>}
          {turn.action === 'generate' && ['failed', 'partial', 'cancelled', 'interrupted'].includes(normalStatus(turn.status)) && <div className="answer-retry"><p>The saved sources are still available. Another answer requires an explicit request; no new search will run.</p><button className="button small" type="button" disabled={running || sending || !answerConfig.enabled} onClick={() => { setAction('generate'); setMessage(turn.message); input.current?.focus(); }}>Prepare retry<Icon name="refresh" /></button></div>}
          {papers !== undefined ? !!papers.length && <ul className="chat-source-list" aria-label={`Papers for question ${index + 1}`}>{papers.map(paper => <ChatSourceCard key={paper.paper_id} source={paper.representative} paper={paper} turnId={turn.id} inspecting={inspecting} onInspect={inspect} />)}</ul> : !!turn.sources.length && <ul className="chat-source-list" aria-label={`Sources for question ${index + 1}`}>{turn.sources.map(source => <ChatSourceCard key={`${source.run_id}:${source.source_ref}`} source={source} turnId={turn.id} inspecting={inspecting} onInspect={inspect} />)}</ul>}
          {!!turn.related_sources?.length && <details className="related-sources" data-testid="related-sources"><summary>Related or uncertain records ({turn.related_sources.length})<Icon name="chevron" /></summary><p>Kept separately because relevance is partial or uncertain. These records are excluded from the main result count and answer-generation evidence.</p><ul className="chat-source-list" aria-label={`Related records for question ${index + 1}`}>{turn.related_sources.map(source => <ChatSourceCard key={`related:${source.run_id}:${source.source_ref}`} source={source} turnId={turn.id} inspecting={inspecting} onInspect={inspect} related />)}</ul></details>}
          <p className="response-scope">{turn.action === 'access' ? 'Access results stay separate from scientific source records. No paper discovery was requested.' : <>{turn.sources.some(source => source.mode === 'fixture') ? 'Illustrative fixture records. ' : ''}{turn.action === 'saved' || turn.action === 'generate' ? 'Reused saved observations. ' : ''}Source fields stay attributed to their provider. Full text has not been reviewed.</>}</p>
        </div></div>
      </article>; })}
    </div>
    {conversation && <div className="conversation-status"><span><span className={`status-dot${running ? ' pulse' : ' ready'}`} />{running ? activeTurn?.action === 'generate' ? 'Answer streaming from OpenAI' : activeTurn?.retrieval ? retrievalStatus(activeTurn.retrieval.status) : 'Resources are still arriving' : 'Saved conversation'}{connection === 'reconnecting' ? ' · reconnecting to saved updates' : connection === 'connecting' ? ' · connecting to updates' : ''}</span>{running && <button className="text-button" onClick={() => void cancel()} disabled={stopping || !activeTurn}><Icon name="stop" />{stopping ? 'Stopping' : 'Stop exploration'}</button>}</div>}
    <form className="research-form exploration-composer" onSubmit={event => void submit(event)}>
      <label className="query-label" htmlFor="exploration-message"><Icon name="search" />{conversation?.turns.length ? 'Continue exploring' : 'Start an exploration'}</label>
      <div className="question-composer"><textarea id="exploration-message" aria-label="Exploration message" ref={input} rows={2} value={message} onChange={event => setMessage(event.target.value)} aria-invalid={tooLong} aria-describedby="exploration-limit exploration-scope" placeholder={action === 'generate' ? 'Add an answer request, or use the previous question below' : action === 'saved' ? 'Which saved source would you like to inspect?' : action === 'lookup' || action === 'access' ? 'Paste one DOI or doi.org URL' : 'Ask a topic or paste a DOI'} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="button primary" type="submit" disabled={sending || running || opening || !effectiveMessage.trim() || effectiveMessage.trim().length < 3 || tooLong || action === 'generate' && !!generationBlocked || action === 'access' && accessBlocked || action === 'discover' && !lookup && (!providersReady || (routing === 'auto' ? !autoAvailable : !selected.length || selectedUnavailable))}>{sending && <span className="spinner" />}{sending ? 'Sending' : action === 'generate' ? 'Stream answer' : action === 'saved' ? 'Read saved sources' : action === 'access' ? 'Find open-access copy' : lookup ? 'Look up DOI' : 'Explore'}<Icon name="arrow" /></button></div>
      <div className="exploration-controls"><label>Next action<select aria-label="Exploration action" value={action} disabled={sending || running} onChange={event => setAction(event.target.value as 'discover' | 'saved' | 'lookup' | 'generate' | 'access')}><option value="discover">Search providers</option><option value="lookup">Look up a DOI</option><option value="access">Find open-access copy</option><option value="saved" disabled={!hasSources}>Use saved sources</option><option value="generate" disabled={!!generationBlocked}>Stream answer · demo</option></select></label>{action === 'discover' && !lookup && <label className="manual-routing-toggle"><input type="checkbox" aria-label="Choose sources manually" checked={routing === 'manual'} disabled={sending || running} onChange={event => setRouting(event.target.checked ? 'manual' : 'auto')} /><span>Choose sources manually</span></label>}{routing === 'manual' && <fieldset disabled={sending || running || action !== 'discover' || lookup}><legend>Discovery providers · {selected.length} of 2 selected</legend>{IDS.map(id => { const item = providers.find(provider => provider.id === id); const blocked = unavailable(item); return <label key={id} className={blocked ? 'provider-choice unavailable' : 'provider-choice'}><input type="checkbox" checked={selected.includes(id)} disabled={!selected.includes(id) && (blocked || selected.length >= 2)} onChange={event => setSelected(previous => event.target.checked ? IDS.filter(key => previous.includes(key) || key === id) : previous.filter(key => key !== id))} /><span>{providerLabel(id)}<small>{providerReadiness(item)}</small>{!blocked && <small className="provider-retrieval">{providerRetrieval(item)}</small>}</span></label>; })}</fieldset>}</div>
      {action === 'discover' && !lookup && routing === 'auto' && <ConnectedSources providers={providers} />}
      {action === 'discover' && !lookup && <div className="search-refinement-control"><label><input type="checkbox" aria-label="Refine search with AI" aria-describedby="search-refinement-help" checked={agentic} disabled={!refinementReady || sending || running} onChange={event => { agenticEdited.current = true; setAgentic(event.target.checked); }} /><span><strong>Refine search with AI</strong><span id="search-refinement-help">{refinementReady ? 'Clarifies intent, reviews relevance, and can try one revised query. It does not write an answer.' : retrievalConfig.blocked_reason || 'AI search refinement is unavailable. Direct provider search remains available.'}</span></span></label></div>}
      {action === 'access' && <p className={`access-action-note${accessBlocked ? ' blocked' : ''}`} role={accessBlocked ? 'status' : undefined}>{accessBlocked ? accessReason : 'Unpaywall checks this DOI for reported open-access locations, versions and licenses. It does not search papers or supply an abstract.'}</p>}
      <details className="exploration-scope-details"><summary>Publication scope<Icon name="chevron" /></summary><div><label>From year<input aria-label="Exploration publication year from" type="number" min="1000" max="2100" placeholder="Any" value={yearFrom} onChange={event => setYearFrom(event.target.value)} disabled={running || action !== 'discover' || lookup} /></label><label>To year<input aria-label="Exploration publication year to" type="number" min="1000" max="2100" placeholder="Present" value={yearTo} onChange={event => setYearTo(event.target.value)} disabled={running || action !== 'discover' || lookup} /></label></div></details>
      <div className="exploration-composer-foot"><p id="exploration-scope">{action === 'generate' ? 'OpenAI writes from saved sources only. No scholarly provider is searched again.' : action === 'saved' ? 'Uses saved provider fields. No new discovery request.' : action === 'access' ? 'Exact DOI · Unpaywall access locations. No paper search or PDF download.' : lookup ? 'Exact DOI · registration agency routes to Crossref or DataCite.' : routing === 'auto' ? 'Automatically routed search · matching DOI records grouped; access checks included.' : selected.length > 1 ? 'Explicit comparison · separate provider runs and source records.' : 'One selected provider · lexical and semantic outcomes stay visible.'}</p><span id="exploration-limit" className={tooLong ? 'query-limit-error' : ''}>{messageBytes.toLocaleString()} / 2,000 UTF-8 bytes</span></div>
      <div className="answer-availability"><strong>Answer streaming {answerConfig.enabled ? '· demo enabled' : '· unavailable'}</strong><p>{generationBlocked || `Optional OpenAI answer writer (${answerConfig.model || 'demo profile'}). Model selection for production remains open.`}</p>{action === 'generate' && !message.trim() && <p className="generation-default-prompt">Will answer: {generationPrompt}</p>}</div>
      {tooLong && <p className="query-limit-error" role="alert">Shorten the message to 2,000 UTF-8 bytes or fewer. Your text is kept for editing.</p>}
    </form>
    <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
  </section>;
}
