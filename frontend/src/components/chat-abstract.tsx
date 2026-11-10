import { useEffect, useRef, useState } from 'react';
import { isActive, providerLabel, request, type Snapshot, type Source } from '@/lib/api';
import type { ChatSource } from '@/lib/conversations';

export default function ChatAbstract({ source }: { source: ChatSource }) {
  const [saved, setSaved] = useState<Source | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState('');
  const [deferred, setDeferred] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const record = saved || source;
  const descriptive = !record.abstract && (record.content_origin === 'provider_description' || record.content_state === 'description' || !!record.description);
  const field = descriptive ? 'description' : 'abstract';
  const text = descriptive ? record.description || record.descriptions?.[0] : record.abstract;
  const label = descriptive ? 'Description' : 'Abstract';
  const partial = saved ? !!saved.truncated_fields?.includes(field) : (descriptive ? source.description_truncated : source.abstract_truncated) ?? source.preview_truncated ?? !!source.truncated_fields?.includes(field);

  async function load() {
    if (busy.current) return;
    setExpanded(true);
    if (!source.run_id || saved?.details_loaded) return;
    busy.current = true; setLoading(true); setError(''); setDeferred(false);
    try {
      // First reuse the saved full record; the GET makes no upstream call.
      let snapshot = await request<Snapshot>(`/research-runs/${encodeURIComponent(source.run_id)}/snapshot`);
      let notice = 'Read saved provider metadata · no external request.';
      let found = snapshot.entities.find(item => item.source_ref === source.source_ref);
      if (!found) throw new Error('The saved source could not be found.');
      if (!found.details_loaded && (!(found.abstract || found.description) || found.truncated_fields?.includes(field))) {
        if (isActive(snapshot.status)) {
          if (mounted.current) {
            setSaved(found); setDeferred(true);
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
        found = snapshot.entities.find(item => item.source_ref === source.source_ref);
      }
      if (!found || found.provider !== source.provider) throw new Error('Abstract details did not match this source.');
      if (mounted.current) { setSaved(found); setLookup(notice); }
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : `${label} lookup could not complete.`); }
    finally { busy.current = false; if (mounted.current) setLoading(false); }
  }

  return <section className="chat-abstract" aria-label={`${providerLabel(source.provider)} ${field}`} data-testid="chat-abstract">
    <div className="chat-abstract-heading"><strong>{label}</strong><span>{providerLabel(source.provider)}{partial && text ? ' · excerpt' : text ? ' · available' : ' · not supplied'}</span></div>
    <p className={`chat-abstract-text${expanded ? ' expanded' : ''}`}>{text || `No ${field} was supplied in this provider record.`}</p>
    {expanded && <p className="chat-abstract-scope">{saved?.version !== undefined && saved.version !== source.version ? 'Loaded the latest saved provider details. Earlier answers keep their original citations. ' : ''}{partial ? 'The provider still supplies only an excerpt. ' : ''}Full text has not been acquired.</p>}
    {expanded && lookup && <p className="chat-abstract-scope">{lookup}</p>}
    {(source.run_id || text) && <div className="chat-abstract-actions">{!expanded || error || deferred ? <button type="button" className="text-button" disabled={loading} onClick={() => void load()}>{loading ? `Loading ${field}…` : error ? `Retry ${field} lookup` : deferred ? `Check ${field} availability` : text ? `Read available ${field}` : `Look up ${field}`}</button> : <button type="button" className="text-button" onClick={() => setExpanded(false)}>Collapse {field}</button>}{loading && <span role="status">Loading {field}…</span>}</div>}
    {error && <p className="chat-abstract-error" role="alert">{error} The saved excerpt remains available.</p>}
    {!source.run_id && partial && <p className="chat-abstract-scope">Saved registry excerpt. Open the original registry record for additional content.</p>}
  </section>;
}
