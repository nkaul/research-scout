import type { ResourceQuery, ContextExpansion } from './conversations';
import type { ChatSource } from './conversations';
import type { TimingSpan } from './conversations';

export type DatasetProviderId = 'hugging_face' | 'datacite';
export type DatasetRecord = {
  dataset_id: string;
  source_ref: string;
  provider: string;
  record_id: string;
  resource_type: 'dataset';
  title: string | null;
  description: string | null;
  description_truncated?: boolean | null;
  description_truncation_reason?: string | null;
  url: string | null;
  doi: string | null;
  version: string | null;
  authors: string[];
  publisher: string | null;
  catalog_owner?: string | null;
  year: number | null;
  year_basis?: 'catalog_created' | 'publication' | null;
  tags: string[];
  tasks: string[];
  formats: string[];
  sizes?: string[];
  languages?: string[];
  size_categories?: string[];
  coverage_dates?: Record<string, unknown>[];
  resource_dates?: Record<string, unknown>[];
  geography?: Record<string, unknown>[];
  metadata_url?: string | null;
  warnings?: string[];
  historical?: boolean;
  license: string | null;
  access: { status: 'public' | 'gated' | 'restricted' | 'unknown'; gated: boolean; private: boolean };
  relationships: { identifier: string; type: string; source: 'registered' }[];
  match: { status: 'candidate' | 'unknown'; matched_terms: string[]; missing_constraints: string[]; reason: string };
  mode: string;
  observed_at: string;
};
export type DatasetContext = { conversation_id: string; turn_id: string; fingerprint: string; intent: string; domain: string | null; keywords: string[]; tags: string[]; query: string; query_mode?: 'ai' | 'direct'; origin?: string; query_origin?: string; resource_type?: string; canonical_query?: string; semantic_query?: string | null; resource_query?: ResourceQuery | null; context_expansion?: ContextExpansion | null; assumptions?: string[] };
export type DatasetSearch = {
  id: string; status: string; revision: number; cursor: string; question: string;
  context: DatasetContext; records: DatasetRecord[];
  provider_activity: { provider: string; status: string; attempts?: number; source_count?: number; record_count?: number; error?: string; error_code?: string; message?: string; query?: string; executed_arguments?: unknown }[];
  timing_spans: TimingSpan[]; warnings: string[];
  usage: { research_attempts?: number; catalog_attempts?: number; model_http_attempts?: number; [key: string]: unknown };
  created_at: string; completed_at?: string;
};
export type DatasetSearchSummary = Pick<DatasetSearch, 'id' | 'status' | 'revision' | 'context' | 'created_at' | 'completed_at'>;
export type DatasetProvider = { id: DatasetProviderId; label?: string; status: string; mode: string; blocked_reason?: string };

export const datasetProviderLabel = (provider: string) => provider === 'hugging_face' ? 'Hugging Face' : provider === 'datacite' ? 'DataCite' : provider;
export function datasetUrl(value?: string | null): string | undefined {
  try {
    if (!value) return;
    const url = new URL(value), host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !host || host.includes(':') || !host.includes('.') || /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || /\.(local|internal)$/.test(host)) return;
    return url.href;
  } catch { return; }
}

/** Historical catalog identity is preserved, not confused with observation versions. */
export function legacyDataset(source: ChatSource): DatasetRecord {
  return {
    dataset_id: `legacy:${source.provider}:${source.record_id}:${source.version}`,
    source_ref: source.source_ref, provider: source.provider, record_id: source.record_id, resource_type: 'dataset',
    title: source.title, description: source.description || source.abstract || null, url: source.url || null,
    doi: source.doi || null, version: null, authors: source.authors || [], publisher: source.venue || null, year: source.year,
    tags: [], tasks: [], formats: [], license: null,
    access: { status: 'unknown', gated: false, private: false }, relationships: [],
    match: { status: 'unknown', matched_terms: [], missing_constraints: [], reason: 'Historical dataset metadata. Dataset-specific applicability and access were not assessed in this record.' },
    mode: source.mode || 'unknown', observed_at: source.observed_at || '', historical: true,
  };
}

export function datasetRecords(records: DatasetRecord[], historical: DatasetRecord[]) {
  const result = new Map<string, DatasetRecord>();
  // Prefer complete current catalog records only within the same provider/version.
  // Citation DOIs are not dataset identity; never merge records across catalogs.
  for (const record of [...records, ...historical]) {
    const key = `${record.provider}:${record.record_id}:${record.version || ''}`;
    if (!result.has(key)) result.set(key, record);
  }
  return [...result.values()];
}
