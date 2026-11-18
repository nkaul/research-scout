'use client';

import { useEffect, useId, useState } from 'react';
import { isActive, providerLabel } from '@/lib/api';
import type { ExplorationTurn } from '@/lib/conversations';
import { formatLoadTime, type LoadTiming } from '@/lib/load-timing';
import { accessProgress, originalSearchDuration, performanceStatus, providerProgress } from '@/lib/search-performance';
import Icon from './icon';
import Tooltip from './tooltip';
import SearchTimeline from './search-timeline';
import styles from './search-performance.module.css';

export type SearchPerformanceProps = {
  turn?: ExplorationTurn;
  pending?: boolean;
  opening?: boolean;
  savedTiming?: LoadTiming | null;
  readerTiming?: LoadTiming | null;
  /** key must be the current turn.id; only a current-view measured arrival belongs here. */
  firstEvidenceTiming?: { key: string; elapsedMs: number } | null;
  connection?: string;
  stopping?: boolean;
  onCancel?: () => void;
  detailsOnly?: boolean;
};

function measuredDuration(timing: LoadTiming | null | undefined, now: number | null) {
  if (!timing) return null;
  const value = timing.elapsedMs ?? (now === null ? null : now - timing.startedAt);
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

export default function SearchPerformance({ turn, pending = false, opening = false, savedTiming, readerTiming, firstEvidenceTiming, connection, stopping = false, onCancel, detailsOnly = false }: SearchPerformanceProps) {
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const [clock, setClock] = useState<{ wall: number; monotonic: number } | null>(null);
  // Admission/opening is a new context even if an older turn is still in props.
  const visibleTurn = pending || opening ? undefined : turn;
  const running = !!visibleTurn && isActive(visibleTurn.status);
  const currentSaved = pending ? null : savedTiming;
  const currentReader = visibleTurn ? readerTiming : null;
  const ticking = running || !!currentSaved && currentSaved.elapsedMs === null || !!currentReader && currentReader.elapsedMs === null;
  useEffect(() => {
    if (!ticking) return;
    const update = () => setClock({ wall: Date.now(), monotonic: performance.now() });
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [ticking, visibleTurn?.id, currentSaved?.token, currentReader?.token]);

  const original = originalSearchDuration(visibleTurn, clock?.wall);
  const saved = measuredDuration(currentSaved, clock?.monotonic ?? null);
  const reader = measuredDuration(currentReader, clock?.monotonic ?? null);
  const first = visibleTurn && firstEvidenceTiming?.key === visibleTurn.id && Number.isFinite(firstEvidenceTiming.elapsedMs) && firstEvidenceTiming.elapsedMs >= 0 ? firstEvidenceTiming.elapsedMs : null;
  const status = performanceStatus(visibleTurn, { pending, opening, connection });
  const sources = providerProgress(visibleTurn);
  const access = accessProgress(visibleTurn);
  const recordedSources = sources.some(source => source.recorded);
  const completeSources = sources.filter(source => source.tone === 'complete').length;
  const providerStrip = !!sources.length && (running || status.tone === 'warning');
  const duration = (value: number | null) => value === null ? '—' : formatLoadTime(value);
  const metrics = [
    { id: 'first', label: 'First evidence', value: first, active: false, failed: false, hint: first === null ? 'Not measured for this view. Opening saved results cannot establish the original time to first evidence.' : 'Measured from this current search/view until its first available evidence appeared; not a historical server latency.' },
    { id: 'retrieval', label: 'Retrieval', value: original, active: running, failed: false, hint: 'Original search duration from its saved start/completion timestamps. A running search uses the browser clock against its saved start time.' },
    { id: 'saved', label: 'Saved view', value: saved, active: !!currentSaved && currentSaved.elapsedMs === null, failed: !!currentSaved?.failed, hint: 'Time to open saved results in this browser. This does not repeat discovery and is separate from the original search.' },
    { id: 'reader', label: 'Reader', value: reader, active: !!currentReader && currentReader.elapsedMs === null, failed: !!currentReader?.failed, hint: 'Time to read metadata for the currently selected source in this browser. A cached read may finish quickly.' },
  ];

  return <section className={styles.container} data-testid="search-performance-bar" data-turn-id={visibleTurn?.id || ''} data-outcome={status.tone} aria-label="Search progress and performance">
    {!detailsOnly && <div className={styles.bar}>
      <span className={`${styles.status} ${styles[status.tone]}`}><Icon name={status.tone === 'active' ? 'spinner' : status.tone === 'warning' ? 'alert' : status.tone === 'success' ? 'check' : 'clock'} /><strong data-testid="performance-status" role="status" aria-live="polite">{status.label}</strong></span>
      <dl className={styles.metrics} aria-live="off">{metrics.map(metric => <div key={metric.id} className={styles.metric} title={metric.hint} data-testid={`performance-${metric.id}`} data-loading={metric.active} data-duration-ms={metric.value === null ? undefined : Math.round(metric.value)}><dt>{metric.label}</dt><dd>{duration(metric.value)}{metric.active && metric.value !== null ? ' elapsed' : metric.failed ? ' · failed' : ''}</dd></div>)}</dl>
      <div className={styles.actions}><Tooltip content="Show measured timing context and recorded source progress"><button type="button" className={styles.detailsButton} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}><Icon name="clock" /><span>Timing details</span><Icon name="chevron" /></button></Tooltip>{running && onCancel && <Tooltip content="Stop this search; already available evidence remains saved"><button type="button" className={styles.stop} disabled={stopping} onClick={onCancel}><Icon name={stopping ? 'spinner' : 'stop'} />{stopping ? 'Stopping…' : 'Stop search'}</button></Tooltip>}</div>
    </div>}
    {!detailsOnly && providerStrip && <div className={styles.progress} aria-label="Recorded source progress">{recordedSources && <span className={styles.progressCount}>{completeSources} / {sources.length} sources complete</span>}{sources.map(source => <span key={source.provider} className={styles.chip} data-provider={source.provider} data-state={source.tone}><i aria-hidden="true" />{providerLabel(source.provider)}<span>{source.label}</span></span>)}{access.active > 0 && <span className={styles.chip} data-state="active"><Icon name="lockOpen" />Unpaywall · {access.active} access {access.active === 1 ? 'lookup' : 'lookups'} pending</span>}</div>}
    {(detailsOnly || expanded) && <div className={styles.details} id={detailsId}>
      <SearchTimeline turn={visibleTurn} now={clock?.wall} />
      <div className={styles.detailHeader}><h3>Measured timing context</h3><p>Separate clocks, not a sum of provider durations.</p></div>
      <dl className={styles.context}>{metrics.map(metric => <div key={metric.id} data-testid={detailsOnly ? `performance-${metric.id}` : undefined} data-loading={metric.active} data-duration-ms={metric.value === null ? undefined : Math.round(metric.value)}><dt>{metric.label}<strong>{duration(metric.value)}{metric.active ? ' · loading' : metric.failed ? ' · failed' : ''}</strong></dt><dd>{metric.hint}</dd></div>)}</dl>
      {!detailsOnly && <><div className={styles.detailHeader}><h3>Recorded source activity</h3><p>{visibleTurn?.timing_spans?.length ? 'Source outcomes and counts; recorded durations appear in the timeline above.' : 'Per-provider elapsed times are not recorded in this search data.'}</p></div>
      {sources.length ? <ul className={styles.sourceList}>{sources.map(source => <li key={source.provider}><span className={styles.sourceIdentity}><i data-state={source.tone} aria-hidden="true" /><strong>{providerLabel(source.provider)}</strong></span><span>{source.label}</span><span>{source.records === null ? 'Record count unavailable' : `${source.records} provider ${source.records === 1 ? 'record' : 'records'}`}{source.attempts !== null ? ` · ${source.attempts} ${source.attempts === 1 ? 'attempt' : 'attempts'}` : ''}</span>{source.reason && <p>{source.reason}</p>}</li>)}</ul> : <p className={styles.empty}>{pending || opening ? 'Source activity appears when this search is available.' : 'No provider activity was recorded for this view.'}</p>}
      {access.recorded && <p className={styles.access}><Icon name="lockOpen" /><span><strong>Unpaywall · DOI access</strong> {access.finished} / {access.total} lookups complete{access.active ? ` · ${access.active} pending` : ''}{access.unavailable ? ` · ${access.unavailable} unavailable or incomplete` : ''}. Access metadata is separate from discovery and does not establish whether the paper is relevant.</span></p>}
      {connection === 'reconnecting' && <p className={styles.notice}>Reconnecting to saved updates. Visible evidence remains available; this does not start another search.</p>}</>}
      {detailsOnly && <p>{visibleTurn?.usage.research_attempts ?? 'Not recorded'} research attempts · {visibleTurn?.usage.model_http_attempts ?? 'Not recorded'} model requests. Saved reads and result tabs add no retrieval calls.</p>}
    </div>}
  </section>;
}
