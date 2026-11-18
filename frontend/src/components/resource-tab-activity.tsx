import { isActive, normalStatus } from '@/lib/api';
import type { ExplorationTurn } from '@/lib/conversations';
import styles from './resource-tab-activity.module.css';

export type ResourceTabActivity = {
  conversationId: string | null;
  turnId: string | null;
  reading: boolean;
  working: boolean;
};

const pending = (status: string) => ['created', 'queued', 'running', 'pending', 'checking', 'admitted', 'dispatched', 'retrieving', 'reviewing', 'refining', 'planning'].includes(normalStatus(status));

/** Only selected provider work contributes; access enrichment is a separate task. */
export function resourceProviderPending(turn: ExplorationTurn | undefined, lane: 'paper' | 'video'): boolean {
  if (!turn || !isActive(turn.status) || turn.retrieval?.status === 'clarification_needed') return false;
  if (!turn.providers?.length && turn.agentic && turn.retrieval?.status === 'planning') {
    const intended = turn.source_scope || (turn.source_plan || []).filter(item => item.status === 'eligible').map(item => item.provider);
    return lane === 'video' ? intended.includes('youtube') : !intended.length || intended.some(provider => provider !== 'youtube' && provider !== 'unpaywall');
  }
  const providers = (turn.providers || []).filter(provider => lane === 'video' ? provider === 'youtube' : provider !== 'youtube' && provider !== 'unpaywall');
  if (!providers.length) return false;
  if (turn.action === 'lookup') return lane === 'paper';
  const activity = (turn.activity || turn.provider_activity || []).filter(item => !['access', 'agency', 'search_refinement', 'generation'].includes(item.operation));
  return providers.some(provider => {
    const own = activity.filter(item => item.provider === provider);
    if (!own.length || own.some(item => pending(item.status))) return true;
    if (!turn.agentic || !turn.retrieval) return false;
    const review = turn.retrieval.provider_quality?.[provider];
    const plannedRound = Math.max(1, ...(turn.retrieval.query_history || []).filter(item => item.provider === provider).map(item => item.round));
    return !review || review.round < plannedRound || turn.retrieval.current_provider === provider && turn.retrieval.status === 'reviewing';
  });
}

export function ResourceTabSpinner({ lane }: { lane: 'paper' | 'video' | 'data' | 'repo' }) {
  return <span className={styles.indicator} aria-hidden="true" data-testid={`resource-tab-loading-${lane}`} />;
}

export function ResourceTabStatus({ messages }: { messages: string[] }) {
  return <div className={styles.liveStatus} role="status" aria-live="polite" aria-atomic="true" data-testid="resource-tabs-loading-status">{messages.join(' · ')}</div>;
}
