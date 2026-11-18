import type { RetrievalState, ResourceLane, ResourceQuery } from '@/lib/conversations';
import { resourceLaneLabel } from '@/lib/ai-query-plan';
import { materialTone } from '@/lib/material-colors';
import Icon from './icon';
import styles from './ai-query-plan.module.css';

export default function AiQueryPlan({ retrieval }: { retrieval: RetrievalState }) {
  const expansion = retrieval.context_expansion;
  const inferred = expansion?.inferred_context || [], missing = expansion?.missing_information || [];
  const lanes = (['papers', 'videos', 'datasets', 'repos'] as ResourceLane[]).filter(lane => retrieval.resource_queries?.[lane]);
  if (!expansion && !lanes.length) return null;
  return <section className={styles.plan} aria-label="Shared AI query plan" data-testid="shared-ai-query-plan">
    <header><strong><Icon name="sliders" />AI-refined research plan</strong><span>{retrieval.needs_clarification || retrieval.status === 'clarification_needed' ? 'Planning paused · clarification needed' : lanes.length ? `${lanes.length} resource plans` : 'Clarification before retrieval'}</span></header>
    {expansion && <><p className={styles.interpretation} data-testid="ai-interpreted-question">{expansion.interpreted_question}</p><p className={styles.basis}>Domain: {retrieval.domain || 'Unresolved'} <span data-basis={expansion.domain_basis}>{expansion.domain_basis === 'explicit' ? 'Explicit in your question' : expansion.domain_basis === 'inferred' ? 'Inferred by AI' : 'Needs clarification'}</span></p>
      {!!inferred.length && <details className={styles.details}><summary>Context inferred by AI ({inferred.length})</summary><p>Planning assumptions, not verified source evidence.</p><ul>{inferred.map((value, index) => <li key={index}>{value}</li>)}</ul></details>}
      {!!missing.length && <div className={styles.gaps} data-testid="ai-missing-information"><strong>Missing information</strong><ul>{missing.map((gap, index) => <li key={index}><span className={styles.gapKind} data-essential={gap.essential}>{gap.essential ? 'Clarification required' : 'Optional detail'}</span><strong>{gap.topic}</strong><p>{gap.question}</p></li>)}</ul></div>}
    </>}
    {!!lanes.length && <div className={styles.lanes}>{lanes.map(lane => { const query = retrieval.resource_queries![lane]; return <details className={styles.lane} key={lane} data-testid={`ai-resource-plan-${lane}`}><summary><span data-lane={lane}>{resourceLaneLabel(lane)}</span><span>{query.lexical_query}</span><Icon name="chevron" /></summary><dl><div><dt>Model-planned retrieval query</dt><dd>{query.lexical_query}</dd></div><div><dt>Semantic intent</dt><dd>{query.semantic_query}</dd></div></dl><div className={styles.terms}>{query.query_terms.map((term, index) => <span key={index} data-chip-tone={materialTone(term)}>{term}</span>)}</div><p>{query.rationale}</p></details>; })}</div>}
    <p className={styles.scope}>These saved model plans do not start provider requests. Each resource adapter records its actual query separately. Missing facts remain unknown; assumptions do not become answer evidence.</p>
  </section>;
}

export function ResourceQueryPreview({ query, lane, saved, directQuery }: { query?: ResourceQuery | null; lane: ResourceLane; saved: boolean; directQuery?: string }) {
  if (directQuery) return <details className={styles.resourcePreview} data-testid={`resource-query-preview-${lane}`}><summary>{saved ? 'Saved' : 'Next'} direct {resourceLaneLabel(lane)} query<Icon name="chevron" /></summary><p>{directQuery}</p><small>Direct query · no model planning or AI relevance review. Provider adapters may compile search syntax; actual execution inputs are recorded below. Opening this preview sends no request.</small></details>;
  if (!query) return null;
  return <details className={styles.resourcePreview} data-testid={`resource-query-preview-${lane}`}><summary>{saved ? 'Saved' : 'Planned'} AI {resourceLaneLabel(lane)} query<Icon name="chevron" /></summary><p>{query.lexical_query}</p><div className={styles.terms}>{query.query_terms.map((term, index) => <span key={index} data-chip-tone={materialTone(term)}>{term}</span>)}</div><small>{query.rationale} Provider-specific execution inputs are recorded below; opening this plan sends no new request.</small></details>;
}
