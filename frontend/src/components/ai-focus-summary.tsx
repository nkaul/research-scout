'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { isActive } from '@/lib/api';
import { resourceLaneLabel } from '@/lib/ai-query-plan';
import type { ExplorationTurn, ResourceLane } from '@/lib/conversations';
import { materialTone } from '@/lib/material-colors';
import Icon from './icon';
import Tooltip from './tooltip';
import styles from './ai-focus-summary.module.css';

type Props = { turn?: ExplorationTurn; lane: ResourceLane; onOpenDetails: () => void };
type FocusTerm = { value: string; kind: 'tag' | 'keyword' };

const suppliedText = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const termKey = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Compact saved facts only; neither an AI preference nor absent history proves a call. */
export default function AiFocusSummary({ turn, lane, onOpenDetails }: Props) {
  const hasRecordedAI = !!turn?.retrieval || (turn?.retrieval?.llm_requests?.length || 0) > 0 || (turn?.saved_result_counts?.llm_requests || 0) > 0 || (turn?.usage?.model_http_attempts || 0) > 0;
  if (!turn || !hasRecordedAI) return null;
  return <SavedFocus key={turn.id} turn={turn} lane={lane} onOpenDetails={onOpenDetails} />;
}

function SavedFocus({ turn, lane, onOpenDetails }: Props & { turn: ExplorationTurn }) {
  const [expanded, setExpanded] = useState(false);
  const [queryClipped, setQueryClipped] = useState(false);
  const queryElement = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const retrieval = turn.retrieval;
  const resource = retrieval?.resource_queries?.[lane];
  const laneQuery = suppliedText(resource?.lexical_query);
  const canonicalQuery = suppliedText(retrieval?.lexical_query);
  const intent = suppliedText(retrieval?.intent);
  const query = laneQuery || canonicalQuery || intent;
  const queryLabel = laneQuery ? `${resourceLaneLabel(lane)} query` : canonicalQuery ? 'Saved query' : 'Saved intent';
  const domain = suppliedText(retrieval?.domain);
  const seen = new Set(domain ? [termKey(domain)] : []);
  const terms: FocusTerm[] = [];
  const append = (values: unknown, kind: FocusTerm['kind']) => {
    if (!Array.isArray(values)) return;
    for (const candidate of values) {
      const value = suppliedText(candidate), key = termKey(value);
      if (!value || seen.has(key)) continue;
      seen.add(key); terms.push({ value, kind });
    }
  };
  append(retrieval?.tags, 'tag');
  append(resource?.query_terms?.length ? resource.query_terms : retrieval?.keywords, 'keyword');
  const shown = expanded ? terms : terms.slice(0, 3);
  const omitted = terms.length - shown.length;
  const compacted = !!turn.history_compacted || !!retrieval?.llm_requests?.some(item => item.body_compacted);
  const planning = isActive(turn.status) && (!query || ['planning', 'queued'].includes(retrieval?.status || ''));
  const emptyMessage = retrieval?.needs_clarification
    ? 'AI refinement is waiting for clarification; a finalized query focus is not recorded.'
    : planning ? 'Waiting for the saved AI query focus.'
      : compacted ? 'AI query focus details are not included in this compact saved history.'
        : 'Model planning or activity is recorded; query focus text is not included in this saved record.';
  useEffect(() => {
    const element = queryElement.current;
    if (!element || expanded) { if (!query) setQueryClipped(false); return; }
    const measure = () => setQueryClipped(element.scrollHeight > element.clientHeight + 1);
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [query, expanded, lane]);
  const canExpand = expanded || terms.length > 3 || queryClipped;

  return <section className={styles.summary} aria-label="AI query focus" data-testid="ai-focus-summary" data-expanded={expanded}>
    <div className={styles.heading}><span className={styles.label}><Icon name="sparkles" />AI query focus</span>
      <div className={styles.actions}>
        {canExpand && <Tooltip content={expanded ? 'Show the compact saved AI focus' : 'Show all saved AI focus terms and the full query'}><button type="button" className={styles.more} aria-expanded={expanded} aria-controls={`${id}-focus`} aria-label={expanded ? 'Show less AI focus' : terms.length > 3 ? `Show all ${terms.length} AI focus terms` : 'Show full AI query focus'} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : omitted ? `+${omitted}` : 'More'}<Icon name="chevron" /></button></Tooltip>}
        <Tooltip content="Open the saved query plan and recorded requests; this does not run a search"><button type="button" className={styles.details} onClick={onOpenDetails}><Icon name="layers" />Query details</button></Tooltip>
      </div>
    </div>
    <div id={`${id}-focus`} className={styles.focus}>
      {query ? <p ref={queryElement} className={`${styles.query}${expanded ? ` ${styles.expandedQuery}` : ''}`} data-testid="ai-focus-query"><span>{queryLabel}:</span> {query}</p> : <p className={styles.empty} data-testid="ai-focus-state">{emptyMessage}</p>}
      {(domain || terms.length > 0) && <div className={styles.terms} aria-label="Saved AI selected tags and keywords">
        {domain && <span className={`${styles.chip} ${styles.domain}`} data-chip-kind="domain" data-chip-tone={materialTone(domain)} title={`Recorded ${retrieval?.context_expansion?.domain_basis === 'inferred' ? 'inferred ' : ''}domain: ${domain}`}><span>Domain:</span> {domain}</span>}
        {shown.map(term => <span key={termKey(term.value)} className={styles.chip} data-chip-kind={term.kind} data-chip-tone={materialTone(term.value)} title={`${term.kind === 'tag' ? 'AI planner tag' : 'AI selected keyword'}: ${term.value}`}><span className="sr-only">{term.kind === 'tag' ? 'AI planner tag: ' : 'AI selected keyword: '}</span>{term.value}</span>)}
      </div>}
      {query && !domain && !terms.length && <p className={styles.empty}>{planning ? 'AI focus terms have not arrived yet.' : compacted ? 'Focus terms are not included in this compact saved history.' : 'No focus tags or keywords were recorded.'}</p>}
    </div>
  </section>;
}
