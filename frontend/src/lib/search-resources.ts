import type { Source } from './api';
import { citationIdentity, latestSourceRecords, newerSource, normalizedDoi, recordIdentity } from './source-versions';
import type { CanonicalPaper, ChatSource, ExplorationTurn } from './conversations';

export type SearchCategory = 'paper' | 'video' | 'data' | 'repo';
export type SearchResourceKind = SearchCategory | 'web' | 'other';
export type SearchResource = { key: string; source: ChatSource; paper?: CanonicalPaper; kind: SearchResourceKind; matchBasis?: 'doi' | 'citation' | 'record'; savedVersionCount?: number; versions?: ChatSource[] };

export function searchResourceKind(source: Pick<Source, 'provider' | 'resource_type'>): SearchResourceKind {
  const type = source.resource_type?.toLowerCase();
  if (type === 'repository' || source.provider === 'github') return 'repo';
  if (type === 'dataset') return 'data';
  if (type === 'video' || source.provider === 'youtube') return 'video';
  if (['webpage', 'web_page', 'website', 'web'].includes(type || '')) return 'web';
  if (type && ['article', 'paper', 'review', 'preprint', 'book', 'book-chapter', 'journal-article', 'conference-paper', 'proceedings-article', 'report', 'thesis'].includes(type)) return 'paper';
  // Keep all scholarly record types and older previews in the research lane.
  // Removing the combined All tab must not hide other registry metadata.
  // This display classification never rewrites the saved resource_type.
  if (['openalex', 'crossref', 'datacite', 'semantic_scholar', 'arxiv', 'openaire', 'europe_pmc'].includes(source.provider)) return 'paper';
  return 'other';
}

export function searchResources(turn?: ExplorationTurn): SearchResource[] {
  if (!turn) return [];
  const raw: SearchResource[] = turn.action === 'discover' && (turn.routing === 'auto' || turn.modality_limits) && turn.papers
    ? turn.papers.map(paper => ({ key: paper.paper_id, source: paper.representative, paper, kind: searchResourceKind(paper.representative) }))
    : (turn.sources || []).map(source => ({ key: source.run_id + ':' + source.source_ref, source, kind: searchResourceKind(source) }));
  const groups: { entries: SearchResource[]; basis?: SearchResource['matchBasis'] }[] = [];
  const byKey = new Map<string, number>();
  for (const entry of raw) {
    const records = [entry.source, ...(entry.paper?.observations || [])];
    const keys = records.flatMap(record => {
      const identity = [entry.kind + ':record:' + recordIdentity(record)];
      if (entry.kind === 'paper') {
        const doi = normalizedDoi(record.doi), citation = citationIdentity(record);
        if (doi) identity.push('paper:doi:' + doi);
        if (citation) identity.push('paper:citation:' + citation);
      }
      return identity;
    });
    const matches = [...new Set(keys.flatMap(key => byKey.has(key) ? [byKey.get(key)!] : []))];
    const index = matches.length ? Math.min(...matches) : groups.length;
    if (!groups[index]) groups[index] = { entries: [] };
    const group = groups[index];
    for (const other of matches.filter(value => value !== index)) {
      group.entries.push(...groups[other].entries); groups[other].entries = [];
      for (const [key, value] of byKey) if (value === other) byKey.set(key, index);
    }
    if (group.entries.length) {
      const matched = keys.filter(key => byKey.get(key) === index);
      const basis = matched.some(key => key.includes(':doi:')) ? 'doi' : matched.some(key => key.includes(':record:')) ? 'record' : 'citation';
      if (basis === 'citation' || !group.basis) group.basis = basis;
    }
    group.entries.push(entry);
    for (const key of keys) byKey.set(key, index);
  }
  return groups.filter(group => group.entries.length).map(group => {
    const first = group.entries[0];
    const all = group.entries.flatMap(entry => [entry.source, ...(entry.paper?.observations || [])]);
    const observations = latestSourceRecords(all);
    const representativeCandidates = group.entries.map(entry => observations.find(source => recordIdentity(source) === recordIdentity(entry.source)) || entry.source);
    const source = representativeCandidates.reduce((latest, candidate) => newerSource(latest, candidate));
    const doi = normalizedDoi(source.doi);
    const matching = group.entries.find(entry => (normalizedDoi(entry.source.doi) === doi && recordIdentity(entry.source) === recordIdentity(source))) || first;
    const access = matching.paper && normalizedDoi(matching.paper.doi || matching.paper.representative.doi) === doi ? matching.paper.access : { status: 'not_requested' };
    const paper = first.paper || observations.length > 1 ? {
      ...(matching.paper || first.paper || {}), paper_id: first.paper?.paper_id || first.key,
      doi, representative: source, observations, providers: [...new Set(observations.map(item => item.provider))],
      access,
    } as CanonicalPaper : undefined;
    const versions = new Set(all.map(item => recordIdentity(item) + ':' + String(item.version))).size;
    return { ...first, source, paper, versions: all, matchBasis: group.basis || (paper?.doi ? 'doi' : 'record'), savedVersionCount: versions };
  });
}
