import { useEffect, useRef, useState } from 'react';
import { isActive, providerLabel, request, type Snapshot, type Source } from '@/lib/api';
import type { ChatSource } from '@/lib/conversations';
import { latestSourceRecords, newerSource } from '@/lib/source-versions';
import Icon from './icon';
import { AbstractPoints } from './readable-abstract';
import LoadTime from './load-time';
import { useLoadTiming } from '@/lib/load-timing';
import Tooltip from './tooltip';
import styles from './chat-abstract.module.css';

export default function ChatAbstract({ source, onExpand, defaultExpanded = false, onResolvedSource, compact = false }: { source: ChatSource; onExpand?: () => void; defaultExpanded?: boolean; onResolvedSource?: (source: Source) => void; compact?: boolean }) {
  const clock = useLoadTiming();
  const [saved, setSaved] = useState<Source | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState('');
  const [deferred, setDeferred] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const requestSequence = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // The list display control expands already returned text without bulk lookups.
  useEffect(() => { setExpanded(defaultExpanded); }, [defaultExpanded]);
  useEffect(() => {
    requestSequence.current++; busy.current = false; setSaved(null); setLoading(false); setError(''); setLookup(''); setDeferred(false);
  }, [source.run_id, source.source_ref, source.version]);
  const record = saved || source;
  const descriptive = record.provider === 'youtube' || !record.abstract && (record.content_origin === 'provider_description' || record.content_state === 'description' || !!record.description);
  const field = descriptive ? 'description' : 'abstract';
  const text = descriptive ? record.description || record.descriptions?.[0] : record.abstract;
  const label = descriptive ? 'Description' : 'Abstract';
  const searchSnippet = record.provider === 'youtube' && record.content_origin === 'youtube_search_snippet';
  const partial = truncated(record, field) || searchSnippet;
  const excerpt = text && !expanded && text.length > 360 ? `${text.slice(0, 360).replace(/\s+\S*$/, '')}…` : text;
  const compactAction = loading ? `Loading ${field}…` : expanded && !error && !deferred ? `Collapse ${field}` : error ? `Retry ${field} lookup` : deferred ? `Check ${field} availability` : text ? `Read available ${field}` : `Look up ${field}`;

  async function load() {
    if (onExpand) { onExpand(); return; }
    if (busy.current) return;
    setExpanded(true);
    if (compact && text && !partial && !error && !deferred) return;
    if (!source.run_id || saved?.details_loaded && !searchSnippet) return;
    const sequence = ++requestSequence.current;
    const current = () => mounted.current && sequence === requestSequence.current;
    const loadTicket = clock.start(`${source.run_id}:${source.source_ref}`, label);
    let loadFailed = false;
    busy.current = true; setLoading(true); setError(''); setDeferred(false);
    try {
      // First reuse the saved full record; the GET makes no upstream call.
      let snapshot = await request<Snapshot>(`/research-runs/${encodeURIComponent(source.run_id)}/snapshot`);
      if (!current()) return;
      let notice = 'Read saved provider metadata · no external request.';
      const savedRecord = (value: Snapshot) => {
        const found = latestSourceRecords(value.entities).find(item => item.source_ref === source.source_ref && item.provider === source.provider);
        if (!found) throw new Error('The saved source could not be found.');
        // A delayed saved response must not replace a newer displayed record.
        // Prefer the full snapshot on equal versions rather than its public preview.
        return String(found.version) === String(record.version)
          ? newerSource<Source>(found, record)
          : newerSource<Source>(record, found);
      };
      let found = savedRecord(snapshot);
      const needsDetails = found.provider === 'youtube'
        ? found.content_origin === 'youtube_search_snippet' || !found.details_loaded && (!(found.description || found.descriptions?.[0]) || truncated(found, 'description'))
        : !found.details_loaded && (!(found.abstract || found.description) || truncated(found, field));
      if (needsDetails) {
        if (isActive(snapshot.status)) {
          if (current()) {
            setSaved(found); setDeferred(true);
            onResolvedSource?.(found);
            setLookup(`This source’s search is still running. Showing saved metadata; no external ${field} request was made. Check again after its search finishes.`);
          }
          return;
        }
        const before = snapshot.usage?.research_attempts;
        snapshot = await request<Snapshot>(`/research-runs/${encodeURIComponent(source.run_id)}/papers/${encodeURIComponent(source.source_ref)}/details`, { method: 'POST', body: '{}' });
        const count = before !== undefined && snapshot.usage?.research_attempts !== undefined ? snapshot.usage.research_attempts - before : undefined;
        notice = count !== undefined
          ? `Same-provider detail lookup · ${count} new external ${count === 1 ? 'request' : 'requests'}.`
          : 'Requested originating-provider details within this run’s remaining allowance.';
        found = savedRecord(snapshot);
        if (found.provider === 'youtube') notice += ' Description metadata only; captions were not requested.';
      }
      if (current()) { setSaved(found); setLookup(notice); onResolvedSource?.(found); }
    } catch (failure) { loadFailed = true; if (current()) setError(failure instanceof Error ? failure.message : `${label} lookup could not complete.`); }
    finally { clock.finish(loadTicket, loadFailed); if (current()) { busy.current = false; setLoading(false); } }
  }

  if (compact) return <section className={`chat-abstract ${styles.compact}`} aria-label={`${providerLabel(source.provider)} ${field}`} data-testid="chat-abstract">
    <div className={`chat-abstract-text ${styles.text}${expanded ? ` expanded ${styles.expandedText}` : ''}`}><span className={styles.contentChip}>{label}{partial ? ' excerpt' : ''}</span>{text && !descriptive && !expanded ? <AbstractPoints text={text} compact /> : excerpt || `No ${field} supplied.`}{' '}{(source.run_id || text) && <Tooltip content={expanded && !error && !deferred ? `Collapse the ${field}` : partial || !text ? `Read available ${field}; an explicit provider lookup may be needed` : `Expand the available ${field}`}><button type="button" className={styles.toggle} aria-label={compactAction} aria-expanded={expanded} disabled={loading} onClick={() => { if (expanded && !error && !deferred) setExpanded(false); else void load(); }}><Icon name={loading ? 'spinner' : expanded && !error && !deferred ? 'chevron' : 'plus'} /></button></Tooltip>}</div>
    <LoadTime timing={clock.timing?.key === `${source.run_id}:${source.source_ref}` ? clock.timing : null} />
    {loading && <span className={styles.loading} role="status">Loading {field}…</span>}
    {expanded && source.provider !== 'youtube' && <p className={`chat-abstract-scope ${styles.scope}`}>{saved?.version !== undefined && saved.version !== source.version ? 'Latest saved provider version. ' : ''}{partial ? 'Provider excerpt · ' : ''}Full text has not been acquired.</p>}
    {expanded && saved && source.provider === 'youtube' && partial && !loading && !deferred && <p className={`chat-abstract-scope ${styles.scope}`}>Provider description excerpt. The complete description is not available in this saved record.</p>}
    {expanded && lookup && <p className={`chat-abstract-scope ${styles.scope}`}>{lookup}</p>}
    {error && <p className="chat-abstract-error" role="alert">{error} The saved excerpt remains available.</p>}
  </section>;

  return <section className="chat-abstract" aria-label={`${providerLabel(source.provider)} ${field}`} data-testid="chat-abstract">
    <div className="chat-abstract-heading"><strong>{label}</strong><span>{providerLabel(source.provider)}{partial && text ? ' · excerpt' : text ? ' · available' : ' · not supplied'}</span></div>
    <p className={`chat-abstract-text${expanded ? ` expanded ${styles.expandedText}` : ''}`}>{text || `No ${field} was supplied in this provider record.`}</p>
    {expanded && <p className="chat-abstract-scope">{saved?.version !== undefined && saved.version !== source.version ? 'Loaded the latest saved provider details. Earlier answers keep their original citations. ' : ''}{partial ? 'The provider still supplies only an excerpt. ' : ''}Full text has not been acquired.</p>}
    {expanded && lookup && <p className="chat-abstract-scope">{lookup}</p>}
    {(source.run_id || text) && <div className="chat-abstract-actions">{!expanded || error || deferred ? <button type="button" className="text-button" aria-expanded={expanded} disabled={loading} onClick={() => void load()}>{loading ? `Loading ${field}…` : error ? `Retry ${field} lookup` : deferred ? `Check ${field} availability` : text ? `Read available ${field}` : `Look up ${field}`}</button> : <button type="button" className="text-button" aria-expanded="true" onClick={() => setExpanded(false)}>Collapse {field}</button>}{loading && <span role="status">Loading {field}…</span>}</div>}
    <LoadTime timing={clock.timing?.key === `${source.run_id}:${source.source_ref}` ? clock.timing : null} />
    {error && <p className="chat-abstract-error" role="alert">{error} The saved excerpt remains available.</p>}
    {!source.run_id && partial && <p className="chat-abstract-scope">Saved registry excerpt. Open the original registry record for additional content.</p>}
  </section>;
}

function truncated(record: Source, field: 'abstract' | 'description') {
  const preview = record as Partial<ChatSource>;
  const fieldFlag = field === 'description' ? preview.description_truncated : preview.abstract_truncated;
  return fieldFlag === true || !!record.truncated_fields?.includes(field) || fieldFlag === undefined && !!preview.preview_truncated;
}
