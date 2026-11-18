'use client';

import { humanStatus, providerLabel } from '@/lib/api';
import { formatLoadTime } from '@/lib/load-timing';
import { searchTimeline, type TimelineContext } from '@/lib/search-timeline';
import Icon from './icon';
import styles from './search-timeline.module.css';

export default function SearchTimeline({ turn, now, catalogRequests = [], requestLabel = 'Recorded catalog request' }: { turn?: TimelineContext; now?: number; requestLabel?: string; catalogRequests?: { provider: string; query?: string; executed_arguments?: unknown }[] }) {
  const { rows, wall, covered, unattributed } = searchTimeline(turn, now);
  const format = (value: number | null) => value === null ? '—' : formatLoadTime(value);
  return <section className={styles.timeline} data-testid="search-timeline" aria-label="How this search progressed">
    <header className={styles.header}><h3>How this search progressed</h3><p>Recorded stages on one clock. Overlapping or nested spans are not added together.</p></header>
    {rows.length ? <>
      <dl className={styles.totals}>
        <div><dt>Search wall time</dt><dd data-testid="timeline-wall">{format(wall)}</dd></div>
        <div><dt>Covered by recorded stages</dt><dd data-testid="timeline-covered">{format(covered)}</dd></div>
        <div><dt>Between recorded stages</dt><dd data-testid="timeline-unattributed">{format(unattributed)}</dd></div>
      </dl>
      <p className={styles.hint}>Gaps can include routing, queueing, local work or stages without instrumentation. Open a row to inspect its saved query or model input.</p>
      <div className={styles.axis} aria-hidden="true"><span /><div>{[0, .25, .5, .75, 1].map(ratio => <span key={ratio}>{wall === null ? '—' : formatLoadTime(wall * ratio)}</span>)}</div><span /></div>
      <div className={styles.rows}>{rows.map(({ span, start, end, duration, active }, index) => {
        const plotted = wall !== null && wall > 0 && start !== null && end !== null && start <= wall;
        const left = plotted ? Math.max(0, Math.min(100, start / wall * 100)) : 0;
        const width = plotted ? Math.max(0, Math.min(100 - left, (end - start) / wall * 100)) : 0;
        const model = span.step ? turn?.retrieval?.llm_requests?.find(request => request.step === span.step) : undefined;
        const requests = turn?.retrieval?.source_requests?.filter(request => (!span.run_id || request.run_id === span.run_id) && (!span.provider || request.provider === span.provider) && (!span.branch || request.branch === span.branch) && (span.round === undefined || request.round === span.round)) || [];
        const providerRequests = span.phase === 'provider' || span.run_id ? requests : [];
        const catalogRequest = catalogRequests.find(request => request.provider === span.provider && (request.query || request.executed_arguments));
        return <details className={styles.row} key={`${span.id}:${index}`} data-testid="timeline-row" data-phase={span.phase} data-provider={span.provider} data-status={span.status} data-duration-ms={duration ?? undefined}>
          <summary>
            <span className={styles.identity}><Icon name="chevron" /><span><strong>{span.label}</strong><small>{span.provider ? providerLabel(span.provider) : humanStatus(span.phase)}{span.round !== undefined ? ` · round ${span.round}` : ''}{span.branch ? ` · ${span.branch}` : ''}{span.cache_hit ? ' · cached' : ''}</small></span></span>
            <span className={styles.track} aria-hidden="true">{plotted ? <span className={styles.span} data-phase={span.phase} data-provider={span.provider} data-active={active} style={{ left: `${left}%`, width: `${width}%` }} /> : <span className={styles.unmeasured}>Timing unavailable</span>}</span>
            <span className={styles.duration}>{format(duration)}{active && <small>elapsed</small>}</span>
          </summary>
          <div className={styles.detail}>
            <dl><div><dt>Status</dt><dd>{humanStatus(span.status)}</dd></div><div><dt>Started after search</dt><dd>{format(start)}</dd></div><div><dt>Completed after search</dt><dd>{format(end)}{active ? ' · in progress' : ''}</dd></div></dl>
            {span.query && <p><strong>Query input</strong><span className={styles.query} data-testid="timeline-query">{span.query}</span></p>}
            {model && <><p><strong>Model request</strong> {model.model} · {model.purpose} · {humanStatus(model.status)}</p>{model.body_compacted ? <p>The saved model body is collapsed. Open Query trace to restore it explicitly.</p> : <details><summary>Recorded model input</summary><pre data-testid="timeline-model-input">{JSON.stringify(model.body, null, 2)}</pre></details>}</>}
            {providerRequests.map((request, requestIndex) => <details key={`${request.run_id}:${request.branch}:${requestIndex}`}><summary>{humanStatus(request.branch)} · {request.transport}{request.cache_hit ? ' · cached' : ''}</summary>{request.query_input && <p className={styles.query} data-testid="timeline-provider-query">{request.query_input}</p>}<pre>{JSON.stringify(request.executed_arguments, null, 2)}</pre></details>)}
            {span.executed_arguments && <details><summary>Recorded stage input</summary><pre data-testid="timeline-stage-input">{JSON.stringify(span.executed_arguments, null, 2)}</pre></details>}
            {catalogRequest && !span.executed_arguments && <details><summary>{requestLabel}</summary>{catalogRequest.query && <p className={styles.query} data-testid="timeline-catalog-query">{catalogRequest.query}</p>}<pre>{JSON.stringify(catalogRequest.executed_arguments, null, 2)}</pre></details>}
            {!span.query && !model && !providerRequests.length && !catalogRequest && !span.executed_arguments && <p>No request input was recorded for this stage.</p>}
          </div>
        </details>;
      })}</div>
    </> : <>
      {wall !== null && <div className={styles.overall} data-testid="timeline-overall"><strong>Original search wall time</strong><span className={styles.track} aria-hidden="true"><span className={styles.span} style={{ left: 0, width: '100%' }} /></span><span className={styles.duration}>{format(wall)}</span></div>}
      <p className={styles.empty} data-testid="timeline-unavailable">{turn ? 'Detailed stage timing was not recorded for this saved search. New searches record planning, source retrieval, relevance review and access timings.' : 'The timeline appears as this search records its stages.'}</p>
    </>}
  </section>;
}
