import { humanStatus, isActive, normalStatus } from './api';
import type { ExplorationTurn, ProviderActivity, ResourceLane } from './conversations';

const complete = new Set(['succeeded', 'completed', 'empty']);
const incomplete = new Set(['failed', 'error', 'partial', 'blocked', 'cancelled', 'interrupted', 'deferred', 'skipped', 'unavailable', 'configuration_error', 'needs_access', 'limit_reached']);

export type ProviderProgress = {
  provider: string;
  label: string;
  tone: 'active' | 'complete' | 'warning' | 'unknown';
  records: number | null;
  attempts: number | null;
  recorded: boolean;
  reason?: string;
};

export function recordedActivity(turn?: ExplorationTurn): ProviderActivity[] {
  return turn?.activity?.length ? turn.activity : turn?.provider_activity || [];
}

/** Counts come from recorded operations, never from the mere presence of a result. */
export function providerProgress(turn?: ExplorationTurn): ProviderProgress[] {
  if (!turn) return [];
  const activity = recordedActivity(turn).filter(item => item.provider !== 'openai' && item.provider !== 'unpaywall' && !['access', 'search_refinement', 'generation'].includes(item.operation));
  const providers = [...new Set([...turn.providers.filter(provider => !['openai', 'unpaywall'].includes(provider)), ...activity.map(item => item.provider)])];
  return providers.map(provider => {
    const entries = activity.filter(item => item.provider === provider);
    const plan = turn.source_plan?.find(item => item.provider === provider);
    const statuses = entries.map(item => normalStatus(item.status));
    const allComplete = statuses.length > 0 && statuses.every(status => complete.has(status));
    const active = statuses.some(status => isActive(status) || ['admitted', 'retrieving', 'searching', 'planning'].includes(status));
    const issue = statuses.some(status => incomplete.has(status));
    const planIssue = plan && ['skipped', 'blocked', 'unavailable', 'needs_access', 'configuration_error'].includes(normalStatus(plan.status));
    return {
      provider,
      label: allComplete ? entries.every(item => normalStatus(item.status) === 'empty') ? 'No results' : 'Complete' : active ? 'In progress' : issue ? 'Incomplete' : planIssue ? humanStatus(plan.status) : entries.length ? 'Status unrecognized' : isActive(turn.status) ? 'Waiting for status' : 'Not recorded',
      tone: allComplete ? 'complete' : active ? 'active' : issue || planIssue ? 'warning' : 'unknown',
      records: entries.length ? Math.max(0, ...entries.map(item => Number.isFinite(item.source_count) ? item.source_count : 0)) : null,
      attempts: entries.length ? entries.reduce((total, item) => total + (Number.isFinite(item.attempts) ? item.attempts : 0), 0) : null,
      recorded: entries.length > 0,
      reason: planIssue ? plan.reason : undefined,
    };
  });
}

export function accessProgress(turn?: ExplorationTurn) {
  const entries = recordedActivity(turn).filter(item => item.provider === 'unpaywall' || item.operation === 'access');
  const paperStatuses = turn?.papers?.flatMap(paper => paper.access?.status ? [normalStatus(paper.access.status)] : []).filter(status => !['not_requested', 'not_applicable'].includes(status)) || [];
  // Prefer operation statuses; a canonical-paper preview is only the fallback.
  const statuses = entries.length ? entries.map(item => normalStatus(item.status)) : paperStatuses;
  const finished = statuses.filter(status => complete.has(status)).length;
  const active = statuses.filter(status => isActive(status) || status === 'admitted').length;
  const unavailable = statuses.filter(status => incomplete.has(status)).length;
  return { recorded: statuses.length > 0, total: statuses.length, finished, active, unavailable };
}

export function originalSearchDuration(turn?: ExplorationTurn, now?: number): number | null {
  if (!turn) return null;
  const start = Date.parse(turn.created_at || '');
  const end = isActive(turn.status) ? now : Date.parse(turn.completed_at || '');
  if (!Number.isFinite(start) || end === undefined || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

export function performanceStatus(turn?: ExplorationTurn, { pending = false, opening = false, connection, resourceStatuses }: { pending?: boolean; opening?: boolean; connection?: string; resourceStatuses?: Partial<Record<ResourceLane, string>> } = {}) {
  if (pending) return { label: 'Starting search', tone: 'active' as const };
  if (opening) return { label: 'Opening saved search', tone: 'active' as const };
  if (!turn) return { label: 'Ready to search', tone: 'neutral' as const };
  const status = normalStatus(turn.status);
  if (!['cancelled', 'interrupted', 'failed', 'error'].includes(status) && (turn.retrieval?.needs_clarification || turn.retrieval?.status === 'clarification_needed')) return { label: 'Clarification needed', tone: 'warning' as const };
  if (isActive(status)) {
    if (connection === 'reconnecting') return { label: 'Reconnecting to saved updates', tone: 'warning' as const };
    const phase: Record<string, string> = { planning: 'Interpreting your question', retrieving: 'Searching selected sources', reviewing: 'Reviewing relevance', refining: 'Refining provider queries', clarification_needed: 'Clarification needed' };
    const action: Record<string, string> = { lookup: 'Looking up DOI metadata', access: 'Checking DOI access', saved: 'Reading saved evidence', generate: 'Preparing an answer' };
    return { label: phase[normalStatus(turn.retrieval?.status)] || action[turn.action] || 'Retrieving evidence', tone: 'active' as const };
  }
  // Legacy explicit child searches can have newer outcomes than the completed
  // parent turn. An incomplete child must not be labeled complete discovery.
  if (['succeeded', 'completed', 'empty', 'partial'].includes(status) && Object.values(resourceStatuses || {}).some(value => incomplete.has(normalStatus(value)))) return { label: 'Partial results', tone: 'warning' as const };
  if (status === 'partial') {
    const sources = providerProgress(turn), access = accessProgress(turn);
    const enabled = turn.modality_limits ? Object.entries(turn.modality_limits).filter(([, limit]) => limit > 0) : [];
    const jobsComplete = !turn.modality_limits || enabled.every(([lane]) => {
      const job = turn.resource_jobs?.[lane as keyof NonNullable<ExplorationTurn['resource_jobs']>];
      return !!job && complete.has(normalStatus(job.status));
    });
    const onlyAccess = jobsComplete && sources.length > 0 && sources.every(source => source.tone === 'complete') && access.unavailable > 0 && !turn.warnings.length && !turn.retrieval?.warnings?.length;
    return { label: onlyAccess ? 'Discovery complete · access incomplete' : 'Partial results', tone: onlyAccess ? 'success' as const : 'warning' as const };
  }
  if (['succeeded', 'completed', 'empty'].includes(status)) {
    if (turn.modality_limits) {
      const enabled = Object.entries(turn.modality_limits).filter(([, limit]) => limit > 0);
      const jobs = enabled.map(([lane]) => turn.resource_jobs?.[lane as keyof NonNullable<ExplorationTurn['resource_jobs']>]);
      if (jobs.some(job => !!job && !complete.has(normalStatus(job.status)))) return { label: 'Partial results', tone: 'warning' as const };
      if (jobs.some(job => !job)) return { label: 'Search complete · resource status not recorded', tone: 'neutral' as const };
    }
    return { label: 'Search complete', tone: 'success' as const };
  }
  if (['cancelled', 'interrupted'].includes(status)) return { label: status === 'cancelled' ? 'Search stopped' : 'Search interrupted', tone: 'warning' as const };
  if (['failed', 'error'].includes(status)) return { label: 'Search could not complete', tone: 'warning' as const };
  return { label: humanStatus(turn.status), tone: 'neutral' as const };
}
