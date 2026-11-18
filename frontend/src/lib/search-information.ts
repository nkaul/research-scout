import { normalStatus } from './api';
import type { ExplorationTurn, ResourceLane } from './conversations';
import type { DatasetSearch } from './datasets';
import type { RepositorySearch } from './repositories';
import type { SearchCategory } from './search-resources';

type InformationState = {
  conversationId: string | null;
  turnId: string | null;
  searchId: string | null;
  revision: number | null;
  reading: boolean;
  working: boolean;
  error: string;
  connection: string;
};

/** A report from the existing child GET/SSE owner, never another acquisition. */
export type ResourceInformationUpdate = InformationState & (
  { lane: 'datasets'; snapshot: DatasetSearch | null } |
  { lane: 'repos'; snapshot: RepositorySearch | null }
);
export type ResourceInformation = Partial<Record<'datasets' | 'repos', ResourceInformationUpdate>>;

export const resourceLanes = [
  { lane: 'papers', category: 'paper', label: 'Papers' },
  { lane: 'videos', category: 'video', label: 'Videos' },
  { lane: 'datasets', category: 'data', label: 'Data' },
  { lane: 'repos', category: 'repo', label: 'Repos' },
] as const;

export function informationLane(category: SearchCategory): ResourceLane {
  return resourceLanes.find(item => item.category === category)!.lane;
}

/** Reject a delayed read, old revision, or report from a different linked child. */
export function acceptsResourceInformation(incoming: ResourceInformationUpdate, conversationId: string | null, turn: ExplorationTurn | undefined, previous?: ResourceInformationUpdate): boolean {
  if (!conversationId || !turn || incoming.conversationId !== conversationId || incoming.turnId !== turn.id) return false;
  const linked = turn.resource_jobs?.[incoming.lane]?.search_id;
  if (linked && incoming.searchId !== linked) return false;
  if (incoming.snapshot && (incoming.snapshot.id !== incoming.searchId || incoming.snapshot.context.conversation_id !== conversationId || incoming.snapshot.context.turn_id !== turn.id || incoming.snapshot.revision !== incoming.revision)) return false;
  if (previous?.searchId && previous.searchId === incoming.searchId && previous.revision !== null && incoming.revision !== null && incoming.revision < previous.revision) return false;
  // Cleanup cannot clear a newer snapshot that is still attached to this turn.
  if (previous?.snapshot && incoming.snapshot === null && incoming.searchId === previous.searchId && incoming.revision === null && !incoming.reading) return false;
  return true;
}

export function resourceIssues(turn?: ExplorationTurn): { lane: ResourceLane; label: string; reason?: string }[] {
  if (!turn) return [];
  return resourceLanes.flatMap(({ lane, label }) => {
    const job = turn.resource_jobs?.[lane];
    if (!job || turn.modality_limits?.[lane] === 0 || !['failed', 'error', 'partial', 'blocked', 'cancelled', 'interrupted', 'unavailable', 'configuration_error'].includes(normalStatus(job.status))) return [];
    return [{ lane, label: `${label} ${['cancelled', 'interrupted'].includes(normalStatus(job.status)) ? 'stopped' : 'needs attention'}`, reason: job.error?.message || job.reason }];
  });
}

export function savedLaneProviders(turn: ExplorationTurn | undefined, category: SearchCategory, child?: ResourceInformationUpdate): string[] {
  if (!turn) return [];
  const lane = informationLane(category);
  if (turn.modality_limits?.[lane] === 0) return [];
  const childProviders = child?.snapshot?.provider_activity.map(item => item.provider) || [];
  if (category === 'data' || category === 'repo') return [...new Set([...(turn.resource_jobs?.[lane]?.providers || []), ...childProviders])];
  return [...new Set([...(turn.providers || []), ...(turn.source_plan || []).filter(item => item.status === 'eligible').map(item => item.provider), ...(turn.source_scope || [])])].filter(provider => category === 'video' ? provider === 'youtube' : !['youtube', 'unpaywall', 'openai', 'hugging_face', 'github'].includes(provider));
}
