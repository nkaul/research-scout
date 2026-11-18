import type { Source } from './api';

export const recordIdentity = (source: Pick<Source, 'provider' | 'source_ref'>) => `${source.provider}:${source.source_ref}`;

function numericVersion(value: Source['version']) {
  const text = String(value);
  return /^v?\d+(?:\.\d+)?$/i.test(text) ? Number(text.replace(/^v/i, '')) : null;
}

/** Compare only known chronology; hashes are immutable labels, not ordered versions. */
export function newerSource<T extends Source>(previous: T, candidate: T): T {
  if (recordIdentity(previous) === recordIdentity(candidate) && String(previous.version) === String(candidate.version) && !!previous.observation_reference !== !!candidate.observation_reference) return candidate.observation_reference ? previous : candidate;
  if (recordIdentity(previous) === recordIdentity(candidate)) {
    const left = numericVersion(previous.version), right = numericVersion(candidate.version);
    if (left !== null && right !== null && left !== right) return right > left ? candidate : previous;
  }
  for (const field of ['updated_at', 'observed_at', 'published_at'] as const) {
    const left = Date.parse(previous[field] || ''), right = Date.parse(candidate[field] || '');
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return right > left ? candidate : previous;
  }
  if (recordIdentity(previous) === recordIdentity(candidate) && previous.version === candidate.version && previous.details_loaded !== candidate.details_loaded) return candidate.details_loaded ? candidate : previous;
  if (recordIdentity(previous) === recordIdentity(candidate) && previous.version !== candidate.version) return candidate;
  return previous;
}

export function latestSourceRecords<T extends Source>(sources: T[]): T[] {
  const records = new Map<string, T>();
  for (const source of sources) {
    const key = recordIdentity(source), previous = records.get(key);
    records.set(key, previous ? newerSource(previous, source) : source);
  }
  return [...records.values()];
}

export function normalizedDoi(value?: string | null) {
  if (!value) return null;
  let text = value.trim();
  try {
    if (/^https?:\/\//i.test(text)) {
      const url = new URL(text);
      if (!['doi.org', 'dx.doi.org'].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash) return null;
      text = url.pathname.slice(1);
    } else text = text.replace(/^doi:\s*/i, '');
    text = decodeURIComponent(text).trim().toLowerCase();
  } catch { return null; }
  return /^10\.\d{4,9}\/[^\s?#\x00-\x1f\x7f]+$/.test(text) ? text : null;
}

/** Conservative display grouping, never a rewrite of DOI/evidence identity. */
export function citationIdentity(source: Source) {
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const title = normalize(source.title || ''), venue = normalize(source.venue || '');
  const authors = (source.authors || []).map(author => normalize(author.replace(/\([^)]*\)/g, ''))).filter(Boolean);
  if (title.length < 50 || !venue || !source.year || !authors.length) return null;
  return JSON.stringify([title, authors, source.year, venue, source.resource_type || 'article']);
}
