import type { ExplorationTurn, RetrievalState, ResourceLane } from './conversations';

export const resourceLaneLabel = (lane: ResourceLane) => ({ papers: 'Papers', videos: 'Videos', datasets: 'Data', repos: 'Repos' })[lane];
/** Explicit direct intent only; absent or failed AI plans never become direct queries. */
export function isDirectResourceTurn(turn: ExplorationTurn | undefined): boolean {
  return turn?.agentic === false && turn.action === 'discover' && !turn.retrieval && ['queued', 'running', 'succeeded', 'partial', 'empty', 'failed'].includes(turn.status.toLowerCase()) && turn.message.trim().length >= 3;
}
/** Presentation guard; the backend independently verifies the full plan fingerprint. */
export function hasResourceQuery(retrieval: RetrievalState | null | undefined, lane: ResourceLane): boolean {
  const marker = retrieval?.shared_plan, expansion = retrieval?.context_expansion;
  const query = retrieval?.resource_queries?.[lane];
  if (!marker || marker.policy !== 'scout-agentic-retrieval-v7' || marker.model_step !== 'plan' || !/^[0-9a-f]{64}$/.test(marker.fingerprint) || !expansion || !['explicit', 'inferred'].includes(expansion.domain_basis) || retrieval?.needs_clarification || expansion.missing_information?.some(item => item.essential) || !query) return false;
  const plain = (value: unknown, max: number) => typeof value === 'string' && value.trim().length >= 3 && value.length <= max && !/[\x00-\x1f]/.test(value);
  return plain(query.lexical_query, 200) && plain(query.semantic_query, 400) && Array.isArray(query.query_terms) && query.query_terms.length >= 1 && query.query_terms.length <= 6 && query.query_terms.every(term => typeof term === 'string' && !!term.trim() && term.length <= 100);
}
