export const DISCOVERY_PROVIDERS = ['openalex', 'semantic_scholar', 'crossref', 'arxiv', 'openaire', 'europe_pmc'] as const;
export type ProviderId = typeof DISCOVERY_PROVIDERS[number];
export type Source = {
  source_ref: string;
  provider: string;
  record_id: string;
  title: string | null;
  authors: string[];
  year: number | null;
  venue?: string | null;
  doi?: string | null;
  url?: string | null;
  abstract?: string | null;
  description?: string | null;
  descriptions?: string[];
  content_origin?: string;
  resource_type?: string;
  observed_at?: string;
  version: number | string;
  mode?: string;
  branch_ranks?: Record<string, number>;
  eligible?: boolean;
  rank_score?: number | null;
  filter_warnings?: string[];
  truncated_fields?: string[];
  missing_fields?: string[];
  metadata_status?: string;
  content_state?: string;
  details_loaded?: boolean;
};
export type Selection = { state: 'included' | 'excluded'; reason?: string; source_version?: string | number; citation_source?: 'discovery' | 'registry' };
export type Operation = { status: string; error?: string; message?: string; [key: string]: unknown };
export type MetadataCheck = {
  status: string;
  agency?: string | null;
  record?: Record<string, unknown> | null;
  conflicts?: unknown[] | Record<string, unknown> | null;
  message?: string;
  error?: string;
  [key: string]: unknown;
};
export type Snapshot = {
  id: string;
  question: string;
  provider: ProviderId;
  status: string;
  mode?: string;
  created_at: string;
  entities: Source[];
  selections: Record<string, Selection>;
  checks: Record<string, MetadataCheck>;
  operations: Record<string, Operation>;
  warnings: string[];
  usage?: { research_attempts?: number; by_provider?: Record<string, unknown> };
  revision: number;
  cursor: string;
  summary: string | null;
  plan?: { source_review_scope?: string; actual_queries?: Record<string, string>; [key: string]: unknown };
  runtime?: { mode?: string; [key: string]: unknown };
  filters?: { year_from?: number | null; year_to?: number | null; [key: string]: unknown };
};
export type RunSummary = Pick<Snapshot, 'id' | 'question' | 'provider' | 'status' | 'created_at'>;
export type Provider = {
  id: string;
  label: string;
  role?: string;
  status?: string;
  mode?: string;
  capabilities?: unknown;
  access_configured?: boolean;
  blocked_reason?: string | null;
  last_error?: string | null;
  verified_capabilities?: string[];
  [key: string]: unknown;
};
export type ExportResult = { revision: number; bibliography: string; manifest: Record<string, unknown> };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function errorMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(errorMessage).join('; ');
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return errorMessage(object.message || object.msg || object.detail || object.error || 'The request could not be completed.');
  }
  return 'The request could not be completed.';
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, errorMessage(data?.detail || data?.error || data || response.statusText));
  return data as T;
}

export function sourcePath(runId: string, sourceRef: string) {
  return `/research-runs/${encodeURIComponent(runId)}/papers/${encodeURIComponent(sourceRef)}`;
}
export function providerLabel(provider: string) {
  return provider === 'openalex' ? 'OpenAlex' : provider === 'semantic_scholar' ? 'Semantic Scholar' : provider === 'datacite' ? 'DataCite' : provider === 'crossref' ? 'Crossref' : provider === 'arxiv' ? 'arXiv' : provider === 'openaire' ? 'OpenAIRE Graph' : provider === 'europe_pmc' ? 'Europe PMC' : provider === 'unpaywall' ? 'Unpaywall' : provider;
}
export function providerRole(provider: string) {
  return provider === 'openalex' ? 'Primary discovery' : provider === 'semantic_scholar' ? 'Complementary discovery' : provider === 'crossref' ? 'Paper discovery and DOI metadata' : provider === 'arxiv' ? 'Preprint discovery' : provider === 'openaire' ? 'Research graph discovery' : provider === 'europe_pmc' ? 'Biomedical literature discovery' : provider === 'unpaywall' ? 'Open-access DOI lookup' : 'DOI registry metadata';
}
export function providerRetrieval(provider?: Provider) {
  if (provider?.mode === 'fixture') return 'Fixture retrieval';
  if (provider?.id === 'openalex') return 'Native lexical + semantic';
  return provider?.semantic_execution === 'local_candidate_pool' ? 'Lexical + bounded local rerank' : 'Lexical · local rerank pending';
}
export function providerReadiness(provider?: Provider): string {
  if (!provider) return 'Unavailable';
  if (provider.mode === 'fixture') return 'Fixture';
  if (provider.access_configured === false || ['unavailable', 'disabled', 'unconfigured', 'blocked', 'not_configured', 'needs_access', 'configuration_error'].includes(normalStatus(provider.status))) return provider.access_configured === false ? 'Needs access' : humanStatus(provider.status);
  if (provider.last_error === 'UPSTREAM_RATE_LIMIT') return 'Rate-limited';
  const verified = provider.verified_capabilities || [];
  const lexical = verified.includes('lexical') || verified.includes('keyword');
  if ((DISCOVERY_PROVIDERS as readonly string[]).includes(provider.id)) {
    if (lexical && verified.includes('semantic')) return provider.id === 'openalex' ? 'Discovery verified' : 'Hybrid verified · bounded local rerank';
    if (lexical) return provider.id === 'openalex' ? 'Lexical verified · semantic pending' : 'Lexical verified · local rerank pending';
    return 'Configured · discovery unverified';
  }
  if (provider.id === 'unpaywall') return verified.includes('access') ? 'Access lookup verified' : 'Configured · access unverified';
  return verified.includes('metadata') ? 'Metadata verified' : 'Configured · metadata unverified';
}
export function sourceTitle(source: Pick<Source, 'title'>): string {
  return source.title?.trim() ? source.title : 'Untitled provider record';
}
export function normalStatus(status?: string) { return (status || 'pending').toLowerCase().replace(/-/g, '_'); }
export function isActive(status?: string) { return ['created', 'queued', 'running', 'pending', 'checking'].includes(normalStatus(status)); }
export function isSuccess(status?: string) { return ['succeeded', 'success', 'completed', 'complete', 'ready', 'found', 'matched'].includes(normalStatus(status)); }
export function humanStatus(status?: string) { return normalStatus(status).replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase()); }
export function safeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; }
}
