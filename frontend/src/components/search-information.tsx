'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { humanStatus, isActive, providerLabel } from '@/lib/api';
import { hasResourceQuery, isDirectResourceTurn } from '@/lib/ai-query-plan';
import type { ExplorationTurn } from '@/lib/conversations';
import { formatLoadTime, type LoadTiming } from '@/lib/load-timing';
import { accessProgress, originalSearchDuration, performanceStatus, providerProgress, recordedActivity } from '@/lib/search-performance';
import { informationLane, resourceIssues, resourceLanes, savedLaneProviders, type ResourceInformation, type ResourceInformationUpdate } from '@/lib/search-information';
import { type SearchCategory, type SearchResource } from '@/lib/search-resources';
import ControlPopover from './control-popover';
import Icon, { type IconName } from './icon';
import AiFocusSummary from './ai-focus-summary';
import RetrievalFocus from './retrieval-focus';
import SearchPerformance from './search-performance';
import SearchTimeline from './search-timeline';
import Tooltip from './tooltip';
import styles from './search-information.module.css';

type Section = 'overview' | 'query' | 'sources' | 'timing';
const sections: { id: Section; label: string; icon: IconName }[] = [{ id: 'overview', label: 'Search overview', icon: 'info' }, { id: 'query', label: 'Query and focus', icon: 'layers' }, { id: 'sources', label: 'Sources and coverage', icon: 'shield' }, { id: 'timing', label: 'Timing and usage', icon: 'clock' }];
type Props = {
  turn?: ExplorationTurn;
  category: SearchCategory;
  resources: SearchResource[];
  information: ResourceInformation;
  counts: Record<SearchCategory, number | string>;
  pending: boolean;
  opening: boolean;
  reading: boolean;
  working: boolean;
  activityMessages: string[];
  connection: string;
  stopping: boolean;
  onCancel: () => void;
  filter: string;
  onFilterChange: (value: string) => void;
  savedTiming: LoadTiming | null;
  readerTiming?: LoadTiming | null;
  firstEvidenceTiming?: { key: string; elapsedMs: number } | null;
  draftQuestion?: string;
  restoring: boolean;
  onRestore: () => void;
  actions?: ReactNode;
  toolbarHost?: HTMLElement | null;
  detailHost?: HTMLElement | null;
};

function ChildRequests({ child }: { child?: ResourceInformationUpdate }) {
  const snapshot = child?.snapshot;
  return <div className={styles.stack}><h3>Recorded requests</h3><p>Actual saved adapter inputs, separate from the model plan. Opening these records sends no provider or model request.</p>{snapshot?.provider_activity.length ? snapshot.provider_activity.map((item, index) => <details key={`${item.provider}:${index}`} className={styles.request}><summary>{providerLabel(item.provider)} · {humanStatus(item.status)}{item.attempts !== undefined ? ` · ${item.attempts} attempts` : ''}</summary>{item.query && <p data-testid={child?.lane === 'datasets' ? 'dataset-executed-query' : 'repo-executed-query'}>{item.query}</p>}{item.executed_arguments !== undefined && <pre data-testid="saved-provider-arguments">{JSON.stringify(item.executed_arguments, null, 2)}</pre>}{item.error && <p>{typeof item.error === 'string' ? item.error : item.error.message || item.error.code}</p>}{item.message && <p>{item.message}</p>}</details>) : <p>{child?.reading ? 'Opening saved request details…' : 'No request arguments were recorded for this resource.'}</p>}</div>;
}

function SourceCoverage({ turn, category, child, resources }: { turn: ExplorationTurn; category: SearchCategory; child?: ResourceInformationUpdate; resources: SearchResource[] }) {
  const lane = informationLane(category), job = turn.resource_jobs?.[lane];
  const isChild = category === 'data' || category === 'repo';
  const providers = savedLaneProviders(turn, category, child);
  const rows = providerProgress(turn).filter(item => category === 'video' ? item.provider === 'youtube' : !['youtube', 'unpaywall'].includes(item.provider));
  const plans = turn.source_plan?.filter(item => category === 'video' ? item.provider === 'youtube' : !['youtube', 'unpaywall'].includes(item.provider)) || [];
  const warnings = [...new Set([...(turn.warnings || []), ...(turn.retrieval?.warnings || [])])];
  const access = accessProgress(turn);
  const accessPlan = turn.source_plan?.find(item => item.provider === 'unpaywall');
  const accessRows = recordedActivity(turn).filter(item => item.operation === 'access' || item.provider === 'unpaywall');
  const grouped = resources.some(item => item.kind === 'paper' && (item.paper?.observations.length || 0) > 1);
  return <div className={styles.stack} data-testid="search-coverage-details"><h3>{category === 'data' ? 'Data catalog outcomes' : category === 'repo' ? 'Repos source outcomes' : category === 'video' ? 'Videos source outcomes' : 'Papers source outcomes'}</h3>
    {job && <p><strong>{humanStatus(job.status)}</strong>{job.reason || job.error?.message ? ` · ${job.error?.message || job.reason}` : ''}</p>}
    {isChild ? <>{child?.snapshot?.provider_activity.length ? <ul className={styles.outcomes}>{child.snapshot.provider_activity.map((item, index) => <li key={`${item.provider}:${index}`}><strong>{providerLabel(item.provider)} · {humanStatus(item.status)}</strong><span>{item.record_count ?? ('source_count' in item ? item.source_count : undefined) ?? 'Not recorded'} {category === 'repo' ? 'repository' : 'catalog'} records{item.attempts !== undefined ? ` · ${item.attempts} attempts` : ''}</span>{item.error && <p>{typeof item.error === 'string' ? item.error : item.error.message || item.error.code}</p>}{item.message && <p>{item.message}</p>}</li>)}</ul> : <p>{child?.reading ? 'Opening saved source outcomes…' : providers.length ? `${providers.map(providerLabel).join(', ')} · detailed outcomes not recorded` : 'Source outcomes not recorded for this resource.'}</p>}
      {category === 'data' ? <p>Data limits apply per catalog. Catalog metadata and topical fit are discovery aids; files, schemas, population coverage and analytical suitability have not been profiled. Dataset coverage and version dates are separate from paper publication filters.</p> : <p>Public repository metadata and locally ranked README evidence are discovery aids. README acquisition remains bounded to five candidates; no extra model review, cloning or code execution is performed. Publication-year filters apply to papers.</p>}
      {category === 'repo' && child?.lane === 'repos' && child.snapshot && <p>Saved fetch: up to {child.snapshot.limit} repositories · {child.snapshot.readme_limit} README candidates · up to {child.snapshot.request_limit} GitHub requests, including public identity checks.</p>}
      {!!child?.snapshot?.warnings.length && <div><h4>Resource coverage notes</h4><ul>{child.snapshot.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
    </> : <><ul className={styles.outcomes}>{rows.map(item => <li key={item.provider}><strong>{providerLabel(item.provider)} · {item.label}</strong><span>{item.records === null ? 'Record count not recorded' : `${item.records} provider records`}{item.attempts !== null ? ` · ${item.attempts} attempts` : ''}</span>{item.reason && <p>{item.reason}</p>}<details className={styles.request}><summary>Recorded operations</summary>{recordedActivity(turn).filter(operation => operation.provider === item.provider && !['access', 'agency', 'search_refinement', 'generation'].includes(operation.operation)).map((operation, index) => <p key={index}>{humanStatus(operation.operation)} · {humanStatus(operation.status)} · {operation.source_count} provider records · {operation.attempts} attempts{operation.error_code ? ` · ${humanStatus(operation.error_code)}` : ''}</p>)}</details></li>)}</ul>{!rows.length && <p>Provider outcomes not recorded for this resource.</p>}{!!plans.length && <details className={styles.request} data-testid="search-source-routing-plan"><summary>Source routing and readiness</summary>{plans.map(item => <p key={item.provider}><strong>{providerLabel(item.provider)} · {humanStatus(item.status)}</strong> · {item.reason}</p>)}</details>}</>}
    {category === 'paper' && <><h3>Paper access coverage</h3><p>{access.recorded ? `Unpaywall: ${access.total} ${access.total === 1 ? 'lookup' : 'lookups'} · ${access.finished} usable access results${access.active ? ` · ${access.active} pending` : ''}${access.unavailable ? ` · ${access.unavailable} unavailable or incomplete` : ''}.` : 'Access outcomes not recorded.'} Access enrichment is separate from discovery and relevance. A missing Unpaywall record does not establish that no free copy exists.</p>{accessPlan && <p><strong>Unpaywall · {humanStatus(accessPlan.health_status || accessPlan.status)}</strong> · {accessPlan.reason}</p>}{!!accessRows.length && <ul>{accessRows.map((item, index) => <li key={index}>Unpaywall · {item.error_code === 'NOT_FOUND' ? 'No access record found' : humanStatus(item.status)}{item.error_code && item.error_code !== 'NOT_FOUND' ? ` · ${humanStatus(item.error_code)}` : ''}{item.doi ? ` · DOI ${item.doi}` : ''}</li>)}</ul>}{grouped && <p>Matching DOI or exact citation records appear once; provider observations and historical evidence versions remain separately preserved.</p>}</>}
    {!!warnings.length && <div><h3>Search coverage notes</h3><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
  </div>;
}

export default function SearchInformation({ turn, category, resources, information: suppliedInformation, counts, pending, opening, reading, working, activityMessages, connection, stopping, onCancel, filter: suppliedFilter, onFilterChange, savedTiming, readerTiming, firstEvidenceTiming, draftQuestion, restoring, onRestore, actions, toolbarHost, detailHost }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(false), [section, setSection] = useState<Section>('overview');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null), sectionButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const [clock, setClock] = useState<{ wall: number; monotonic: number } | null>(null);
  const visibleTurn = pending || opening ? undefined : turn;
  const information = visibleTurn ? suppliedInformation : {};
  const filter = visibleTurn ? suppliedFilter : '';
  const running = !!visibleTurn && isActive(visibleTurn.status);
  const lane = informationLane(category), child = lane === 'datasets' || lane === 'repos' ? information[lane] : undefined;
  const status = performanceStatus(visibleTurn, { pending, opening, connection, resourceStatuses: Object.fromEntries(Object.entries(information).flatMap(([key, item]) => item?.snapshot ? [[key, item.snapshot.status]] : [])) });
  const issues = resourceIssues(visibleTurn);
  for (const item of Object.values(information)) if (item?.snapshot && ['failed', 'error', 'partial', 'blocked', 'cancelled', 'interrupted'].includes(item.snapshot.status.toLowerCase()) && !issues.some(issue => issue.lane === item.lane)) issues.push({ lane: item.lane, label: `${item.lane === 'datasets' ? 'Data' : 'Repos'} needs attention`, reason: item.snapshot.warnings[0] });
  const sourceNames = savedLaneProviders(visibleTurn, category, child);
  const currentSaved = pending ? null : savedTiming;
  const ticking = running || !!child?.working || !!currentSaved && currentSaved.elapsedMs === null;
  useEffect(() => { if (!ticking) return; const tick = () => setClock({ wall: Date.now(), monotonic: performance.now() }); tick(); const timer = setInterval(tick, 250); return () => clearInterval(timer); }, [ticking, visibleTurn?.id, currentSaved?.token]);
  useEffect(() => { setFilterOpen(false); }, [category, pending, opening]);
  const savedDuration = currentSaved ? currentSaved.elapsedMs ?? (clock ? Math.max(0, clock.monotonic - currentSaved.startedAt) : null) : null;
  const duration = opening ? savedDuration : originalSearchDuration(visibleTurn, clock?.wall);
  const clockLabel = opening ? 'Saved-view loading time' : 'Original retrieval duration';
  const activeLabel = reading && !pending && !opening ? `Opening saved ${resourceLanes.find(item => item.lane === lane)!.label} details` : working && !pending && !opening ? `${resourceLanes.find(item => item.lane === lane)!.label}: retrieving results` : '';
  const childErrors = Object.values(information).filter(item => item?.error);
  const reconnecting = !!visibleTurn && (connection === 'reconnecting' || child?.connection === 'reconnecting');
  const resourceGate = visibleTurn && (lane === 'datasets' || lane === 'repos') && visibleTurn.modality_limits?.[lane] !== 0
    ? isDirectResourceTurn(visibleTurn) && visibleTurn.message.length > 400 ? `This saved direct question exceeds the 400-character ${lane === 'datasets' ? 'Data' : 'Repos'} query limit. Shorten it and start a new search; the query will not be silently truncated.`
      : visibleTurn.agentic && !running && !hasResourceQuery(visibleTurn.retrieval, lane) ? `This saved query has no usable AI ${lane === 'datasets' ? 'dataset' : 'repository'} plan. Open saved query details if they are collapsed, or run this question again in Search. Saved results remain readable.` : ''
    : '';
  const announcement = [...new Set([status.label, ...activityMessages, ...issues.map(item => item.label), ...(reconnecting ? ['Reconnecting to saved updates'] : [])])].join(' · ');

  const activeIndex = sections.findIndex(item => item.id === section);
  function toggleSection(next: Section) {
    if (next === section) setExpanded(value => !value);
    else { setSection(next); setExpanded(true); }
  }
  function closeDetails() {
    setExpanded(false);
    sectionButtons.current[activeIndex]?.focus({ preventScroll: true });
  }
  const timingDescription = `${clockLabel}: ${duration === null ? 'not recorded' : formatLoadTime(duration)}`;
  const sourceDescription = visibleTurn?.modality_limits?.[lane] === 0 ? 'This resource was off in the saved search.' : `Saved ${resourceLanes.find(item => item.lane === lane)!.label} sources: ${sourceNames.map(providerLabel).join(', ') || 'not recorded'}.`;
  const toolbar = <div className={styles.toolbar} role="toolbar" aria-label="Saved search information controls" data-testid="search-information-controls" onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const current = sectionButtons.current.findIndex(button => button === event.target);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : sections.length - 1)) % sections.length;
    sectionButtons.current[next]?.focus();
  }}>
    {sections.map((item, index) => <Tooltip key={item.id} content={item.id === 'timing' ? `${item.label} · ${timingDescription}` : item.id === 'sources' ? `${item.label} · ${sourceDescription}` : item.label}><button ref={node => { sectionButtons.current[index] = node; }} id={`${id}-control-${item.id}`} type="button" className={styles.sectionButton} aria-label={item.label} aria-expanded={expanded && section === item.id} aria-controls={`${id}-${item.id}`} onClick={() => toggleSection(item.id)}><Icon name={item.icon} />{item.id === 'timing' && <span className={styles.clock} aria-live="off" aria-label={timingDescription} data-testid="information-clock">{duration === null ? '—' : formatLoadTime(duration)}</span>}</button></Tooltip>)}
    <Tooltip content={status.label}><span className={styles.status} tabIndex={0} role="img" aria-label={status.label} data-tone={status.tone} data-testid="performance-status"><Icon name={status.tone === 'active' ? 'spinner' : status.tone === 'warning' ? 'alert' : status.tone === 'success' ? 'check' : 'info'} /><span className="sr-only">{status.label}</span></span></Tooltip>
    <Tooltip content="Filter only the already available records in this tab"><button ref={filterButton} type="button" className={styles.iconButton} disabled={!visibleTurn} aria-label="Filter available results" aria-haspopup="dialog" aria-expanded={!!visibleTurn && filterOpen} aria-pressed={!!filter.trim()} onClick={() => setFilterOpen(value => !value)}><Icon name="search" /></button></Tooltip>
    {running && <button type="button" className={styles.stop} disabled={stopping} onClick={onCancel}><Icon name={stopping ? 'spinner' : 'stop'} />{stopping ? 'Stopping…' : 'Stop search'}</button>}
  </div>;
  const details = <section className={styles.container} data-testid="search-information" aria-label="Search information">
    <AiFocusSummary turn={visibleTurn} lane={lane} onOpenDetails={() => { setSection('query'); setExpanded(true); }} />
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="resource-tabs-loading-status">{announcement}</span>
    {!!activeLabel && <p className={styles.notice} data-testid="active-resource-loading">{activeLabel}. Available records remain readable.</p>}
    {!!issues.length && <div className={styles.notice} data-testid="resource-outcome-alerts">{issues.map(issue => <p key={issue.lane}><strong>{issue.label}</strong>{issue.reason ? ` · ${issue.reason}` : ''}</p>)}</div>}
    {childErrors.map(item => <p className={styles.error} role="alert" key={item!.lane}>{item!.lane === 'datasets' ? 'Data' : 'Repos'} · {item!.error}</p>)}
    {reconnecting && <p className={styles.notice}>Reconnecting to saved updates. Available evidence stays readable.</p>}
    {resourceGate && <p className={styles.notice} data-testid={lane === 'datasets' ? 'datasets-ai-plan-required' : 'repos-ai-plan-required'}>{resourceGate}</p>}
    {!!filter.trim() && <div className={styles.filterIndicator} data-testid="search-filter-status"><Icon name="search" /><span>Local filter: <strong>{filter}</strong></span><button type="button" className="text-button" onClick={() => onFilterChange('')}>Clear result filter</button></div>}
    <ControlPopover open={!!visibleTurn && filterOpen} onClose={() => setFilterOpen(false)} anchor={filterButton} label="Filter available results"><div className={styles.popover}><label htmlFor={`${id}-filter`}>Filter available {resourceLanes.find(item => item.lane === lane)!.label.toLowerCase()}</label><input id={`${id}-filter`} type="search" aria-label="Find in available search results" value={filter} maxLength={1000} placeholder="Filter these results" onChange={event => onFilterChange(event.target.value)} /><p>Filters saved records locally. This does not start a search.</p><button type="button" className="text-button" onClick={() => { setFilterOpen(false); filterButton.current?.focus(); }}>Done</button></div></ControlPopover>
    <div onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented || filterOpen || document.querySelector('[role="tooltip"]')) return;
      event.preventDefault(); event.stopPropagation(); closeDetails();
    }}>
      {sections.map(item => <section key={item.id} role="region" id={`${id}-${item.id}`} aria-labelledby={`${id}-heading-${item.id}`} hidden={!expanded || section !== item.id} className={styles.pane}>
        <header className={styles.paneHeading}><h2 id={`${id}-heading-${item.id}`}>{item.label}</h2><Tooltip content="Close these saved search details"><button type="button" className={styles.iconButton} aria-label="Close search details" onClick={closeDetails}><Icon name="close" /></button></Tooltip></header>
        <div className={styles.body}>{expanded && section === item.id && (item.id === 'overview' ? visibleTurn ? <div className={styles.stack}>
        <h3>Saved search settings</h3><p>{visibleTurn.action === 'lookup' ? 'Exact DOI lookup' : visibleTurn.agentic === false ? 'Direct query · no model planning or AI relevance review' : visibleTurn.agentic ? 'AI-refined search' : 'Execution mode not recorded'}. These are saved execution facts; controls above prepare your next search.</p>
        <p>Saved paper/video scope: {(visibleTurn.source_scope || visibleTurn.providers || []).map(providerLabel).join(', ') || 'Not recorded'}. Saved publication range: {visibleTurn.filters ? `${visibleTurn.filters.year_from ?? 'Any year'}–${visibleTurn.filters.year_to ?? 'present'}` : 'Not recorded'}. Exact applied bounds remain in recorded provider arguments.</p>
        <div className={styles.tableWrap}><table data-testid="saved-search-limits"><caption>Saved limits and resource outcomes</caption><thead><tr><th>Resource</th><th>Saved maximum</th><th>Outcome</th><th>Available records</th><th>Eligible / candidate matches</th><th>Fetched observations</th><th>Overflow</th></tr></thead><tbody>{resourceLanes.map(({ lane: key, category: kind, label }) => {
          const job = visibleTurn.resource_jobs?.[key];
          const limit = visibleTurn.modality_limits?.[key];
          const own = key === 'datasets' || key === 'repos' ? information[key] : undefined;
          const literature = key === 'papers' || key === 'videos';
          const candidates = literature ? job?.eligible_count : job?.candidate_count ?? own?.snapshot?.records.filter(record => record.match.status === 'candidate').length;
          return <tr key={key}><th scope="row">{label}</th><td>{limit === 0 ? 'Off' : limit !== undefined ? `${limit}${key === 'datasets' ? ' per catalog' : ''}` : 'Not recorded'}</td><td>{limit === 0 ? 'Off' : job ? humanStatus(job.status) : own?.snapshot ? humanStatus(own.snapshot.status) : 'Not recorded'}</td><td>{counts[kind]}</td><td>{candidates !== undefined ? `${candidates} ${literature ? 'eligible' : 'candidate'}` : 'Not recorded'}</td><td>{literature ? job?.candidate_count ?? 'Not recorded' : 'Not recorded'}</td><td>{job?.overflow_count ?? 'Not recorded'}</td></tr>;
        })}</tbody></table></div>
        <p>Maximums do not guarantee relevant records. Papers and Videos count primary results; Data and Repos include unassessed records. Candidate matches and unknown fit remain separate. Related or uncertain records ({visibleTurn.related_sources?.length ?? visibleTurn.saved_result_counts?.related_sources ?? 0}) stay outside primary results and answer evidence.</p>
        <p>Matching DOI or exact citation records may be grouped into one paper while retaining provider observations. Overflow observations are retained in saved source records; missing historical counts are not inferred.</p>
      </div> : <p>Saved information appears after this search is accepted.</p> : item.id === 'query' ? <RetrievalFocus embedded turn={visibleTurn} lane={lane} draftQuestion={draftQuestion} restoring={restoring} onRestore={onRestore} providerContent={category === 'data' || category === 'repo' ? <ChildRequests child={child} /> : undefined} /> : item.id === 'sources' ? visibleTurn ? <SourceCoverage turn={visibleTurn} category={category} child={child} resources={resources} /> : <p>Source outcomes appear as this search is recorded.</p> : <div className={styles.stack}><SearchPerformance detailsOnly turn={visibleTurn} pending={pending} opening={opening} savedTiming={savedTiming} readerTiming={readerTiming} firstEvidenceTiming={firstEvidenceTiming} connection={connection} />{child?.snapshot && <section><h3>{category === 'data' ? 'Data retrieval timing' : 'Repos retrieval timing'}</h3><p>This child search has its own start time. Its durations are not added to the parent search.</p><SearchTimeline turn={child.snapshot} catalogRequests={child.snapshot.provider_activity} now={clock?.wall} requestLabel={category === 'repo' ? 'Recorded GitHub request' : 'Recorded catalog request'} /><p>{Object.entries(child.snapshot.usage).map(([key, value]) => `${humanStatus(key)}: ${String(value)}`).join(' · ')}</p></section>}</div>)}</div>
        {expanded && section === item.id && actions && <div className={styles.extraActions}>{actions}</div>}
      </section>)}
    </div>
  </section>;
  return <>{toolbarHost ? createPortal(toolbar, toolbarHost) : toolbarHost === undefined ? toolbar : null}{detailHost ? createPortal(details, detailHost) : detailHost === undefined ? details : null}</>;
}
