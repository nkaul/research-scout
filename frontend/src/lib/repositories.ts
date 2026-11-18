import type { ResourceQuery, ContextExpansion } from './conversations';
import type { TimingSpan } from './conversations';

export type RepositoryRecord = {
  repo_id: string; observation_id: string; provider: 'github'; record_id: string; resource_type: 'repository';
  full_name: string; title: string; description: string | null; url: string; default_branch: string;
  language: string | null; topics: string[]; stars: number; forks: number; open_issues: number;
  license: string | null; archived: boolean; fork: boolean; updated_at: string | null; pushed_at: string | null;
  metadata_version: string; evidence_version: string; mode: string; observed_at: string;
  readme: { status: 'available' | 'pending' | 'missing' | 'not_assessed' | 'blocked' | 'error'; sha: string | null; source_url: string | null; web_url?: string | null; coordinate_basis?: string; repository_id_revalidated?: boolean; identity_basis?: string; identity_checked_at?: string; path: string | null; artifact_available?: boolean; artifact_id?: string; evidence: { id: string; section: string; text: string; start_line: number; end_line: number; source_url: string; source_sha: string }[]; truncated: boolean; error?: { code: string; message: string } };
  match: { status: 'candidate' | 'unknown'; score: number; method: string; matched_terms: string[]; evidence_ids: string[]; reason: string; missing_constraints: string[]; model_reviewed: false };
};
export type RepositoryContext = { conversation_id: string; turn_id: string; fingerprint: string; intent: string; domain: string | null; keywords: string[]; tags: string[]; query: string; query_mode?: 'ai' | 'direct'; origin?: string; query_origin?: string; resource_type?: string; canonical_query?: string; semantic_query?: string | null; resource_query?: ResourceQuery | null; context_expansion?: ContextExpansion | null; assumptions?: string[] };
export type RepositorySearch = {
  id: string; status: string; revision: number; cursor: string; question: string; limit: number; readme_limit: number; identity_check_limit?: number; request_limit?: number;
  context: RepositoryContext; records: RepositoryRecord[];
  provider_activity: { provider: string; status: string; attempts?: number; record_count?: number; error?: string | { code?: string; message?: string }; message?: string; query?: string; executed_arguments?: unknown }[];
  timing_spans: TimingSpan[]; warnings: string[]; usage: { model_http_attempts?: number; [key: string]: unknown }; created_at: string; completed_at?: string;
};
export type RepositorySearchSummary = Pick<RepositorySearch, 'id' | 'status' | 'revision' | 'context' | 'created_at' | 'completed_at'>;
export type RepositoryProvider = { id: 'github'; label?: string; status: string; mode: string; blocked_reason?: string };
export type RepositoryReadmeArtifact = { text: string; evidence_version: string; source_sha: string; record_id: string; source_url: string; parser_policy: string; transformed: boolean; transformations: string[]; complete: boolean; content_sha256: string };
export type RepositoryNote = { id: string; conversation_id: string; turn_id: string; record_id: string; text: string; revision: number; evidence_version: string | null; updated_at: string | null; references: { search_id: string; record_id: string; evidence_version: string; observation_id: string; full_name: string; source_sha: string | null; source_url: string | null; artifact_available: boolean }[] };

/** Navigational links only. No fetched provider URL is executed or rendered as markup. */
export function repositoryUrl(value?: string | null): string | undefined {
  try { if (!value) return; const url = new URL(value); if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.search || url.hash || url.username || url.password || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/.*)?$/.test(url.pathname)) return; return url.href; } catch { return; }
}
export function readmeSourceUrl(value?: string | null): string | undefined {
  try { if (!value) return; const url = new URL(value); if (url.protocol !== 'https:' || url.hostname !== 'api.github.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/git\/blobs\/[0-9a-f]{40,64}$/.test(url.pathname)) return; return url.href; } catch { return; }
}
export function repositoryRecords(records: RepositoryRecord[]) {
  const result = new Map<string, RepositoryRecord>();
  for (const record of records) {
    const key = `${record.provider}:${record.record_id}`;
    const previous = result.get(key);
    if (!previous || record.observed_at >= previous.observed_at) result.set(key, record);
  }
  return [...result.values()];
}
export function readmeStatus(record: RepositoryRecord) {
  const { status, error, evidence } = record.readme;
  const code = error?.code || '';
  if (status === 'pending') return 'README queued';
  if (status === 'available') return evidence.length ? 'README saved' : 'README fetched · no readable excerpts';
  if (/IDENTITY/.test(code)) return 'README not accepted · identity check failed';
  if (/INTERRUPTED|CANCELLED/.test(code)) return 'README not fetched · search stopped';
  if (/TOO_LARGE|RESPONSE_TOO_LARGE/.test(code)) return 'README too large for preview';
  if (/RATE|COOLDOWN/.test(code)) return 'README paused · GitHub request limit';
  if (status === 'not_assessed') return 'Metadata only · README outside the five-file budget';
  if (status === 'missing') return 'README unavailable at the public endpoint';
  if (status === 'blocked') return 'README request denied';
  return 'README could not be read';
}

export function readmeMessage(record: RepositoryRecord) {
  if (record.readme.error?.message) return record.readme.error.message;
  if (record.readme.status === 'pending') return 'This README is queued for the current bounded acquisition.';
  if (record.readme.status === 'not_assessed') return 'Only the first five locally ranked repositories receive README acquisition. Matching for this record uses saved metadata.';
  if (record.readme.status === 'missing') return 'GitHub’s public endpoint did not supply a README. It may be missing or inaccessible.';
  if (record.readme.status === 'available') return 'The README was fetched, but the bounded parser did not select readable excerpts.';
  return 'No readable README content is saved for this repository.';
}

export function repositoryRecordPath(searchId: string, recordId: string) {
  return `/repo-searches/${encodeURIComponent(searchId)}/records/${encodeURIComponent(recordId)}`;
}
