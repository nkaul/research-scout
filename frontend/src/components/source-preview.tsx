import Tooltip from './tooltip';
import LoadTime from './load-time';
import { formatLoadTime, type LoadTiming } from '@/lib/load-timing';
import { latestSourceRecords } from '@/lib/source-versions';
import ReadableAbstract from './readable-abstract';
import { useRef, useState } from 'react';
import Icon from './icon';
import VideoPreview from './video-preview';
import InlineDocument, { sourcePdfUrl } from './inline-document';
import { humanStatus, providerLabel, safeUrl, sourceTitle, type MetadataCheck, type Snapshot, type Source } from '@/lib/api';
import styles from './source-preview.module.css';

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
  onTranscript?: () => void;
  playbackRequest?: number;
  onCheck: () => void;
  busy: Record<string, boolean>;
  error: string;
  isFixture: boolean;
  onClose?: () => void;
  onSaveToProject?: () => void;
  projectSaved?: boolean;
  projectName?: string | null;
  compact?: boolean;
  pending?: boolean;
  loadTiming?: LoadTiming | null;
  operationTiming?: LoadTiming | null;
};

function display(value: unknown): string {
  if (value == null) return 'Not supplied';
  if (Array.isArray(value)) return value.map(display).join(', ');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export default function SourcePreview({ source, snapshot, tab, onTabChange, reason, onReasonChange, onSelect, onDetails, onTranscript, playbackRequest, onCheck, busy, error, isFixture, onClose, onSaveToProject, projectSaved = false, projectName, compact = false, pending = false, loadTiming, operationTiming }: Props) {
  const tabs = useRef<HTMLDivElement>(null);
  const isVideo = source.provider === 'youtube';
  const selection = snapshot.selections[source.source_ref];
  const included = selection?.state === 'included';
  const count = Object.values(snapshot.selections).filter(item => item.state === 'included').length;
  const saving = busy[`selection:${source.source_ref}`];
  const latestRecord = latestSourceRecords(snapshot.entities).find(item => item.source_ref === source.source_ref);
  const historicalRecord = !!latestRecord && String(latestRecord.version) !== String(source.version);
  const metadataLoading = !!busy[`details:${source.source_ref}`];
  const transcriptLoading = !!busy[`${onTranscript ? 'transcript' : 'details'}:${source.source_ref}`];
  const videoDetailsComplete = !!source.details_loaded && source.content_origin === 'youtube_video_details' && !source.truncated_fields?.includes('description');
  const includeDisabled = historicalRecord || saving || !included && count >= 3;
  const check = snapshot.checks[source.source_ref];
  const checking = !!busy[`check:${source.source_ref}`];
  const checkDisabled = historicalRecord || !source.doi || !included || checking;
  const checkHelp = historicalRecord ? 'This is an earlier saved version. Load available details before checking the current record.' : !source.doi ? 'This record does not supply a DOI.' : !included ? 'Include this source in your shortlist before checking DOI metadata.' : checking ? 'Checking the DOI registration agency…' : 'Optional registry comparison; original provider fields stay unchanged.';
  const changeTab = (next: PreviewTab) => onTabChange(next);
  const authors = [...new Map((source.authors || []).map(name => [name.trim().toLocaleLowerCase(), name.trim()])).values()].filter(Boolean);
  const recordFields: [string, string][] = [['Provider', providerLabel(source.provider)], ...(!isVideo ? [['DOI', source.doi || 'Not available'] as [string, string]] : []), ['Year', String(source.year || 'Not available')], ['Record ID', source.record_id], ['Version', String(source.version ?? 'Not available')], ['Observed', source.observed_at ? new Date(source.observed_at).toLocaleString() : 'Not available']];
  const fieldIdentity = (value: string) => value.toLowerCase().replace(/^https?:\/\/(?:dx\.)?(?:doi.org|openalex.org)\//, '').replace(/\/$/, '');
  const fieldValues = new Set(recordFields.map(([, value]) => fieldIdentity(value)));
  for (const [key, value] of Object.entries(source.provider_identifiers || {})) if (value && !fieldValues.has(fieldIdentity(value))) { fieldValues.add(fieldIdentity(value)); recordFields.push([key.replace(/_/g, ' '), value]); }


  return <>
    <div className="inspector-top">
      <span title={sourceTitle(source)}><Icon name={isVideo ? 'video' : 'file'} />{compact ? `${providerLabel(source.provider)}${source.year ? ` · ${source.year}` : ''}` : isVideo ? 'Video preview' : 'Source preview'}</span>
      {onClose ? <Tooltip content={'Close the source reader'}><button className="icon-button" aria-label="Close source details" onClick={onClose}><Icon name="close" /></button></Tooltip> : <span className="preview-provider">{providerLabel(source.provider)}</span>}
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
      {(['overview', 'metadata', 'notes'] as const).map(value => <Tooltip key={value} content={value === 'overview' ? 'Read available content and preview documents' : value === 'metadata' ? 'View provider identifiers and record history' : 'Review this run’s shortlist and notes'}><button key={value} id={`preview-tab-${value}`} data-preview-tab={value} role="tab" aria-controls="preview-panel" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => changeTab(value)}><Icon name={value === 'notes' ? 'text' : value === 'metadata' ? 'database' : 'eye'} />{value === 'notes' ? 'Your notes' : value === 'metadata' ? 'Metadata' : 'Overview'}</button></Tooltip>)}
    </div>
    <div className={`inspector-content ${styles.content}${compact ? ` ${styles.compact}` : ''}`} id="preview-panel" role="tabpanel" tabIndex={0} aria-labelledby={`preview-tab-${tab}`} inert={pending ? true : undefined}>
      {error && <div className="feedback inspector-error" role="alert"><Icon name="alert" /><div><strong>Review this action</strong><p>{error}</p></div></div>}
      <div className={`source-document${isVideo ? ' video-source-document' : ''}${compact ? ' compact-source-document' : ''}`}>
        <div className="document-body">
          {<header className={styles.identity}><h2 id="inspector-heading" className={styles.title}>{sourceTitle(source)}</h2><p className={styles.venue}><span>{isVideo ? 'Channel' : 'Publication'}</span>{isVideo ? authors.join(', ') || 'Not available' : source.venue || 'Not available'}</p></header>}
          {source.eligible === false && <p className="selected-filter-warning"><Icon name="alert" />{source.filter_warnings?.join(' ') || 'This saved source no longer passes eligibility checks. Your decision is retained.'}</p>}
          {tab === 'overview' && <>
            {!isVideo && <><section className="inspector-section"><h3>{source.abstract ? 'Abstract' : source.description ? 'Provider description' : 'Abstract'}</h3>{source.abstract ? <ReadableAbstract key={source.source_ref + ':' + source.version} text={source.abstract} /> : <p className="abstract-text">{source.description || 'Abstract not available from this provider.'}</p>}</section>
            <section className={styles.contributors} data-testid="source-authors"><h3>Authors</h3><p className={!compact ? 'inspector-authors' : undefined}>{authors.length ? authors.join(', ') : 'Not available'}</p></section></>}
            {isVideo && <VideoPreview key={source.source_ref} source={source} loading={transcriptLoading} onTranscript={onTranscript || onDetails} onDetails={onDetails} detailsLoading={metadataLoading} detailsComplete={videoDetailsComplete} playbackRequest={playbackRequest}><VideoDescription key={source.source_ref} source={source} loading={metadataLoading} historical={historicalRecord} onDetails={onDetails} /></VideoPreview>}
            {!isVideo && sourcePdfUrl(source) && <InlineDocument key={source.source_ref} source={source} />}
            {!isVideo && !compact && <div className="content-state"><Icon name="file" /><div><strong>{source.abstract ? 'Abstract available' : source.description ? 'Description available' : 'Metadata only'}</strong><span>Provider metadata. Use available source links to review the full document.</span></div></div>}
            {!isVideo && safeUrl(source.url) && <a className="button source-link" href={safeUrl(source.url)} target="_blank" rel="noreferrer">Open original source<Icon name="external" /></a>}
            {!compact && <p className="action-note">{isVideo ? 'Use Your notes to record why this video is useful.' : 'Use Metadata for the original record and explicit DOI checks. Your notes stay with your selection.'}</p>}
          </>}
          {tab === 'metadata' && <section className={'inspector-section ' + styles.metadata}><h3>Record details</h3><dl className={'record-properties ' + styles.properties}>{recordFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <CompletenessNotice source={source} />
            <div className={styles.metadataActions}><Tooltip content={isVideo ? 'Load the description and video metadata only. Use Overview for public captions.' : 'Look up additional metadata from this provider'}><button className="button small" disabled={metadataLoading || isVideo && videoDetailsComplete} onClick={onDetails}><Icon name={metadataLoading ? 'spinner' : isVideo && videoDetailsComplete ? 'check' : 'refresh'} />{metadataLoading ? 'Looking up details…' : isVideo ? videoDetailsComplete ? 'Video details loaded' : source.details_loaded ? 'Refresh video details' : 'Load video details' : 'Get available details'}</button></Tooltip>
            {!isVideo && <Tooltip content="Compare the DOI with its registration metadata"><button className="button small" disabled={checkDisabled} aria-describedby="doi-check-help" onClick={onCheck}><Icon name={checking ? 'spinner' : 'shield'} />{checking ? 'Checking metadata…' : 'Check DOI metadata'}</button></Tooltip>}</div>
            {!isVideo && <><p className="action-note" id="doi-check-help">{checkHelp}</p>{!!source.doi && !included && !historicalRecord && <button type="button" className="text-button" disabled={includeDisabled} onClick={() => onSelect('included')}><Icon name="plus" />Add to run shortlist</button>}{!!source.doi && !included && count >= 3 && !historicalRecord && <p className="action-note">This run’s shortlist is full (3/3). Remove a shortlisted source to enable this check.</p>}<MetadataObservation check={check} />
            {check?.record && <div className="citation-choice"><p className="reason-label">Export citation</p><button className="button small" aria-pressed={selection?.citation_source === 'registry'} disabled={historicalRecord || !included || saving} onClick={() => onSelect('included', 'registry')}><Icon name={selection?.citation_source === 'registry' ? 'check' : 'file'} />{selection?.citation_source === 'registry' ? 'Using registry record for citation' : 'Use registry record for citation'}</button>{selection?.citation_source === 'registry' && <button className="text-button" disabled={historicalRecord} onClick={() => onSelect('included', 'discovery')}>Use discovery record instead</button>}<p className="action-note">Chooses one saved record for export.</p></div>}</>}
          </section>}
          {tab === 'notes' && <section className={`inspector-section notes-section ${styles.notes}`}>{historicalRecord && <p className="action-note" role="status">This is a saved project version. Load available details in Metadata before changing the current run’s shortlist or notes.</p>}<div className={styles.notesHeading}><h3>{compact ? 'Research notes' : 'Your selection'}</h3><span>{count} / 3 shortlisted</span></div><p className={`section-explanation ${styles.notesHelp}`}>{onSaveToProject ? 'Notes stay with this search; saving to a project is separate.' : 'Choose a decision and save why this source matters.'}</p><div className="decision-options"><button className={`button small${included ? ' selected-decision' : ''}`} aria-pressed={included} disabled={includeDisabled} onClick={() => onSelect('included')}><Icon name="check" />Include</button><button className={`button small${selection?.state === 'excluded' ? ' selected-decision' : ''}`} aria-pressed={selection?.state === 'excluded'} disabled={historicalRecord || saving} onClick={() => onSelect('excluded')}><Icon name="close" />Exclude</button></div>
            {!included && count >= 3 && !historicalRecord && <p className="action-note">This run’s shortlist is full. Project resources have no three-source limit.</p>}
            <label className="reason-label" htmlFor="selection-reason">Reason <span>(optional)</span></label><textarea id="selection-reason" className="reason-input" disabled={historicalRecord} rows={3} value={reason} onChange={event => onReasonChange(event.target.value)} placeholder="Why keep or exclude this source?" />
            <div className="note-save-row"><p className="action-note">{selection ? 'Saved with your decision for this research run.' : 'Choose Include or Exclude to save this reason.'}</p><button className="button small" disabled={historicalRecord || !selection || saving} onClick={() => onSelect(selection!.state)}>Save reason<Icon name="check" /></button></div>
          </section>}
        </div>
      </div>
    </div>
    <div className="inspector-bottom" inert={pending ? true : undefined}>{onSaveToProject ? <><div className={styles.footerContext}><span className="source-number">{providerLabel(source.provider)}<span> · {projectSaved ? `Saved${projectName ? ` to ${projectName}` : ' to project'}` : projectName ? projectName : 'Choose a research project'}</span></span><ReaderTiming timing={loadTiming} operation={operationTiming} /></div><Tooltip content={projectSaved ? 'Save this displayed record version to the selected project' : 'Save this source to a research project'}><button className={`button${projectSaved ? ' included-button' : ' primary'}`} aria-label={projectSaved ? 'Save current version to project' : 'Save to project'} title={projectSaved ? 'Keep this displayed provider version in the selected project' : 'Add this resource to a research project'} onClick={onSaveToProject}><Icon name={projectSaved ? 'check' : 'bookmark'} />{projectSaved ? 'Save version' : 'Save to project'}</button></Tooltip></> : <><div className={styles.footerContext}><span className="source-number">{providerLabel(source.provider)}<span> · {included ? 'Shortlisted by you' : selection?.state === 'excluded' ? 'Excluded by you' : 'Not yet reviewed'}</span></span><ReaderTiming timing={loadTiming} operation={operationTiming} /></div><button className={`button${included ? ' included-button' : ' primary'}`} aria-pressed={included} disabled={includeDisabled} onClick={() => onSelect('included')}><Icon name={included ? 'check' : 'bookmark'} />{included ? 'Included' : 'Include source'}</button></>}</div>
  </>;
}

function VideoDescription({ source, loading, historical, onDetails }: { source: Source; loading: boolean; historical: boolean; onDetails: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const text = source.description || source.descriptions?.[0] || '';
  const partial = source.content_origin === 'youtube_search_snippet' || !!source.truncated_fields?.includes('description');
  const excerpt = text && !expanded && text.length > 360 ? `${text.slice(0, 360).replace(/\s+\S*$/, '')}…` : text;
  const action = loading ? 'Loading description…' : expanded ? 'Collapse description' : text ? 'Read available description' : 'Look up description';
  return <section className={styles.videoDescription} aria-label="YouTube description" data-testid="chat-abstract">
    <div className={`chat-abstract-text ${styles.descriptionText}${expanded ? ' expanded' : ''}`}><span className={styles.descriptionChip}>Description{partial ? ' excerpt' : ''}</span>{excerpt || 'Description not available.'}{' '}<Tooltip content={expanded ? 'Collapse the description' : historical ? 'Expand this saved project version without looking up a newer record' : partial || !text ? 'Load available video details and expand the description' : 'Expand the saved description'}><button type="button" className={styles.descriptionToggle} aria-label={action} aria-expanded={expanded} disabled={loading} onClick={() => { if (expanded) setExpanded(false); else { setExpanded(true); if (!historical && (partial || !text)) onDetails(); } }}><Icon name={loading ? 'spinner' : expanded ? 'chevron' : 'plus'} /></button></Tooltip></div>
    {loading && <div className={styles.descriptionLoading} role="status">Loading video description and metadata…<span className="search-skeleton-line" aria-hidden="true" /></div>}
    {expanded && partial && !loading && <p className={styles.descriptionHint}>{historical ? 'Saved project excerpt. Use Load video details to inspect the current provider record.' : 'Showing the saved provider excerpt. Additional text may not be available.'}</p>}
  </section>;
}

function CompletenessNotice({ source }: { source: Source }) {
  const present = (field: string) => { const value = (source as unknown as Record<string, unknown>)[field]; return Array.isArray(value) ? value.length > 0 : value != null && String(value).trim() !== ''; };
  const missing = [...new Set(source.missing_fields || [])].filter(field => !present(field) && !['venue', 'doi', 'year'].includes(field) && (source.provider !== 'youtube' || !['abstract'].includes(field)));
  const shortened = [...new Set(source.truncated_fields || [])].filter(present);
  const names = (fields: string[]) => fields.map(field => field.replace(/_/g, ' ')).join(', ');
  if (!missing.length && !shortened.length) return null;
  return <p className={styles.availability} data-testid="metadata-availability">{missing.length > 0 && <>Not available: {names(missing)}. </>}{shortened.length > 0 && <>Provider excerpt: {names(shortened)}. Full values are not available in this record.</>}</p>;
}

function ReaderTiming({ timing, operation }: { timing?: LoadTiming | null; operation?: LoadTiming | null }) {
  if (!timing && !operation) return null;
  const label = [timing, operation].filter((value): value is LoadTiming => !!value).map(value => value.label + ': ' + (value.elapsedMs === null ? 'loading' : formatLoadTime(value.elapsedMs))).join(' · ');
  return <Tooltip content={label}><span className={styles.readerTiming} tabIndex={0} aria-label="Reader load times"><Icon name="clock" /><span className="sr-only"><LoadTime timing={timing} /><LoadTime timing={operation} /></span></span></Tooltip>;
}

export function SourcePreviewLoading({ kind, onClose, overlay = false, timing }: { kind: 'paper' | 'video'; onClose: () => void; overlay?: boolean; timing?: LoadTiming | null }) {
  return <div className={`source-preview-loading${overlay ? ' preview-loading-overlay' : ''}`} data-testid="source-preview-loading" aria-busy="true">{!overlay && <div className="inspector-top"><span><Icon name={kind === 'video' ? 'video' : 'file'} />Loading {kind === 'video' ? 'video' : 'paper'}…</span><Tooltip content={'Close the source reader'}><button type="button" className="icon-button" aria-label="Close source details" onClick={onClose}><Icon name="close" /></button></Tooltip></div>}<p role="status">Opening saved {kind === 'video' ? 'video' : 'paper'} details…</p><LoadTime timing={timing} /><div aria-hidden="true" className="preview-loading-mask">{kind === 'video' && <span className="search-skeleton-thumb" />}<span className="search-skeleton-line title" /><span className="search-skeleton-line" /><span className="search-skeleton-line" /><span className="search-skeleton-line short" /></div></div>;
}

function MetadataObservation({ check }: { check?: MetadataCheck }) {
  if (!check) return null;
  const conflicts = Array.isArray(check.conflicts) ? check.conflicts : Object.entries(check.conflicts || {}).map(([field, difference]) => `${field}: ${display(difference)}`);
  return <div className="metadata-observation"><div className="check-heading"><Icon name="shield" /><strong>{humanStatus(check.status)}</strong>{check.agency && <span>{providerLabel(check.agency)}</span>}</div>{check.message && <p>{check.message}</p>}{check.error && <p>{display(check.error)}</p>}{check.record && <div className="registry-record"><p className="eyebrow">SEPARATE REGISTRY OBSERVATION</p>{['title', 'authors', 'year', 'doi'].filter(field => check.record?.[field] != null).map(field => <p key={field}><strong>{field}: </strong>{display(check.record?.[field])}</p>)}</div>}{conflicts.length > 0 && <div className="metadata-conflicts"><strong>Metadata differences</strong>{conflicts.map((conflict, index) => <p key={index}>{display(conflict)}</p>)}<span>The original discovery fields remain unchanged.</span></div>}</div>;
}
