import { useRef } from 'react';
import Icon from './icon';
import { humanStatus, providerLabel, safeUrl, sourceTitle, type MetadataCheck, type Snapshot, type Source } from '@/lib/api';

export type PreviewTab = 'overview' | 'metadata' | 'notes';
type Props = {
  source: Source;
  snapshot: Snapshot;
  tab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  onSelect: (state: 'included' | 'excluded', citation?: 'discovery' | 'registry') => void;
  onDetails: () => void;
  onCheck: () => void;
  busy: Record<string, boolean>;
  error: string;
  isFixture: boolean;
  onClose?: () => void;
};

function display(value: unknown): string {
  if (value == null) return 'Not supplied';
  if (Array.isArray(value)) return value.map(display).join(', ');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export default function SourcePreview({ source, snapshot, tab, onTabChange, reason, onReasonChange, onSelect, onDetails, onCheck, busy, error, isFixture, onClose }: Props) {
  const tabs = useRef<HTMLDivElement>(null);
  const selection = snapshot.selections[source.source_ref];
  const included = selection?.state === 'included';
  const count = Object.values(snapshot.selections).filter(item => item.state === 'included').length;
  const saving = busy[`selection:${source.source_ref}`];
  const includeDisabled = saving || !included && count >= 3;
  const check = snapshot.checks[source.source_ref];
  const changeTab = (next: PreviewTab) => onTabChange(next);

  return <>
    <div className="inspector-top">
      <span><Icon name="file" />Source preview</span>
      {onClose ? <button className="icon-button" aria-label="Close source details" onClick={onClose}><Icon name="close" /></button> : <span className="preview-provider">{providerLabel(source.provider)}</span>}
    </div>
    <div className="inspector-tabs" role="tablist" aria-label="Source details" ref={tabs} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const values: PreviewTab[] = ['overview', 'metadata', 'notes'];
      const index = values.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      changeTab(values[next]);
      tabs.current?.querySelector<HTMLButtonElement>(`[data-preview-tab="${values[next]}"]`)?.focus();
    }}>
      {(['overview', 'metadata', 'notes'] as const).map(value => <button key={value} id={`preview-tab-${value}`} data-preview-tab={value} role="tab" aria-controls="preview-panel" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => changeTab(value)}>{value === 'notes' ? 'Your notes' : value === 'metadata' ? 'Metadata' : 'Overview'}</button>)}
    </div>
    <div className="inspector-content" id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${tab}`}>
      {error && <div className="feedback inspector-error" role="alert"><Icon name="alert" /><div><strong>Review this action</strong><p>{error}</p></div></div>}
      <div className="source-document">
        <div className="document-banner"><div><span>SOURCE RECORD</span><strong>{providerLabel(source.provider)} collection</strong></div><span className="document-illustration" aria-hidden="true"><Icon name="file" /></span></div>
        <div className="document-body">
          <p className="inspector-kicker">{source.resource_type?.replace(/_/g, ' ') || 'Provider record'}{source.year ? ` · ${source.year}` : ''}<span>{source.mode?.toLowerCase().includes('fixture') || isFixture ? 'Fixture record' : 'Provider supplied'}</span></p>
          <h2 id="inspector-heading">{sourceTitle(source)}</h2>
          <p className="inspector-authors">{source.authors?.join(', ') || 'Authors not supplied'}</p>
          {source.venue && <p className="inspector-venue">{source.venue}</p>}
          <CompletenessNotice source={source} />
          {source.eligible === false && <p className="selected-filter-warning"><Icon name="alert" />{source.filter_warnings?.join(' ') || 'This saved source no longer passes eligibility checks. Your decision is retained.'}</p>}
          {tab === 'overview' && <>
            <section className="inspector-section"><h3>{source.abstract ? 'Provider abstract' : source.description ? 'Provider description' : 'Available content'}</h3><p className="abstract-text">{source.abstract || source.description || 'The provider supplied bibliographic metadata without an abstract. Missing content is not generated.'}</p></section>
            <div className="content-state"><Icon name="file" /><div><strong>{source.abstract ? 'Abstract available' : source.description ? 'Description available' : 'Metadata only'}</strong><span>Full text has not been acquired or reviewed.</span></div></div>
            {safeUrl(source.url) && <a className="button source-link" href={safeUrl(source.url)} target="_blank" rel="noreferrer">Open original source<Icon name="external" /></a>}
            <p className="action-note">Use Metadata for the original record and explicit DOI checks. Your notes stay with your selection.</p>
          </>}
          {tab === 'metadata' && <>
            <section className="inspector-section"><h3>Record &amp; provenance</h3><dl className="record-properties">
              <div><dt>Provider</dt><dd>{providerLabel(source.provider)} · provider supplied</dd></div>
              <div><dt>Observed</dt><dd>{source.observed_at ? new Date(source.observed_at).toLocaleString() : 'Not supplied'}</dd></div>
              <div><dt>Version</dt><dd>{source.version ?? 'Not supplied'}</dd></div>
              <div><dt>DOI</dt><dd>{source.doi || 'Not supplied'}</dd></div>
              <div><dt>Record ID</dt><dd>{source.record_id}</dd></div>
              {Object.entries(source.branch_ranks || {}).map(([branch, rank]) => <div key={branch}><dt>{branch} rank</dt><dd>{rank} · provider scoped</dd></div>)}
            </dl><button className="button full-width" disabled={busy[`details:${source.source_ref}`]} onClick={onDetails}><Icon name={busy[`details:${source.source_ref}`] ? 'clock' : 'refresh'} />{busy[`details:${source.source_ref}`] ? 'Looking up details…' : 'Get available details'}</button><p className="action-note">Uses saved details or an explicit lookup within this run’s remaining allowance. Missing or truncated fields may remain.</p></section>
            <section className="inspector-section"><h3>DOI metadata check</h3><p className="section-explanation">Check the DOI’s registration agency while preserving the original discovery record.</p><button className="button full-width" disabled={!source.doi || !included || busy[`check:${source.source_ref}`]} onClick={onCheck}><Icon name={busy[`check:${source.source_ref}`] ? 'clock' : 'shield'} />{busy[`check:${source.source_ref}`] ? 'Checking metadata…' : 'Check DOI metadata'}</button>
              {!source.doi && <p className="action-note">This record does not supply a DOI.</p>}
              {source.doi && !included && <p className="action-note">Include this source in your shortlist before checking DOI metadata.</p>}
              <MetadataObservation check={check} />
              {check?.record && <div className="citation-choice"><p className="reason-label">Citation record</p><button className="button full-width" aria-pressed={selection?.citation_source === 'registry'} disabled={!included || saving} onClick={() => onSelect('included', 'registry')}><Icon name={selection?.citation_source === 'registry' ? 'check' : 'file'} />{selection?.citation_source === 'registry' ? 'Using registry record for citation' : 'Use registry record for citation'}</button>{selection?.citation_source === 'registry' && <button className="text-button" onClick={() => onSelect('included', 'discovery')}>Use discovery record instead</button>}<p className="action-note">Chooses one whole record for the next export. Discovery fields remain unchanged.</p></div>}
              <p className="action-note">Registry agreement concerns bibliographic metadata. It does not verify scientific findings.</p>
            </section>
          </>}
          {tab === 'notes' && <section className="inspector-section notes-section"><h3>Your selection</h3><p className="section-explanation">Record why this source belongs in your shortlist, or why you left it out.</p><div className="decision-options"><button className={`button small${included ? ' selected-decision' : ''}`} aria-pressed={included} disabled={includeDisabled} onClick={() => onSelect('included')}><Icon name="check" />Include</button><button className={`button small${selection?.state === 'excluded' ? ' selected-decision' : ''}`} aria-pressed={selection?.state === 'excluded'} disabled={saving} onClick={() => onSelect('excluded')}><Icon name="close" />Exclude</button><span>{count} / 3 included</span></div>
            <label className="reason-label" htmlFor="selection-reason">Reason <span>(optional)</span></label><textarea id="selection-reason" className="reason-input" rows={5} value={reason} onChange={event => onReasonChange(event.target.value)} placeholder="What makes this source useful, or why did you leave it out?" />
            <div className="note-save-row"><p className="action-note">{selection ? 'Saved with your decision for this research run.' : 'Choose Include or Exclude to save this reason.'}</p><button className="button small" disabled={!selection || saving} onClick={() => onSelect(selection!.state)}>Save reason<Icon name="check" /></button></div>
          </section>}
        </div>
      </div>
    </div>
    <div className="inspector-bottom"><span className="source-number">{providerLabel(source.provider)}<span> · {included ? 'Shortlisted by you' : selection?.state === 'excluded' ? 'Excluded by you' : 'Not yet reviewed'}</span></span><button className={`button${included ? ' included-button' : ' primary'}`} aria-pressed={included} disabled={includeDisabled} onClick={() => onSelect('included')}><Icon name={included ? 'check' : 'bookmark'} />{included ? 'Included' : 'Include source'}</button></div>
  </>;
}

function CompletenessNotice({ source }: { source: Source }) {
  const truncated = source.truncated_fields || [];
  const missing = source.missing_fields || [];
  if (!truncated.length && !missing.length) return null;
  const fields = (values: string[]) => values.map(value => value.replace(/_/g, ' ')).join(', ');
  return <aside className="completeness-notice" aria-label="Provider metadata completeness"><Icon name="alert" /><div><strong>Provider metadata is incomplete</strong>{truncated.length > 0 && <p>Truncated provider fields: {fields(truncated)}. Displayed values may be incomplete.</p>}{missing.length > 0 && <p>Missing provider fields: {fields(missing)}. Missing values have not been filled in.</p>}</div></aside>;
}

function MetadataObservation({ check }: { check?: MetadataCheck }) {
  if (!check) return <p className="unchecked-note">Not checked. Provider metadata remains as supplied.</p>;
  const conflicts = Array.isArray(check.conflicts) ? check.conflicts : Object.entries(check.conflicts || {}).map(([field, difference]) => `${field}: ${display(difference)}`);
  return <div className="metadata-observation"><div className="check-heading"><Icon name="shield" /><strong>{humanStatus(check.status)}</strong>{check.agency && <span>{providerLabel(check.agency)}</span>}</div>{check.message && <p>{check.message}</p>}{check.error && <p>{display(check.error)}</p>}{check.record && <div className="registry-record"><p className="eyebrow">SEPARATE REGISTRY OBSERVATION</p>{['title', 'authors', 'year', 'doi'].filter(field => check.record?.[field] != null).map(field => <p key={field}><strong>{field}: </strong>{display(check.record?.[field])}</p>)}</div>}{conflicts.length > 0 && <div className="metadata-conflicts"><strong>Metadata differences</strong>{conflicts.map((conflict, index) => <p key={index}>{display(conflict)}</p>)}<span>The original discovery fields remain unchanged.</span></div>}</div>;
}
