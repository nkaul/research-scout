import { normalStatus, providerLabel } from './api';
import type { ChatSource, ExplorationTurn } from './conversations';

export function groupReviewedSources(turn: ExplorationTurn): ExplorationTurn {
  if (turn.action !== 'discover' || !turn.agentic && !turn.retrieval) return { ...turn, sources: turn.sources || [], related_sources: turn.related_sources || [] };
  const sources: ChatSource[] = [], related: ChatSource[] = [];
  const seen = new Set<string>();
  for (const source of [...(turn.sources || []), ...(turn.related_sources || [])]) {
    if (!source.relevance || !['relevant', 'partial', 'unknown'].includes(source.relevance.label)) continue;
    const identity = `${source.run_id}:${source.source_ref}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (source.relevance?.label === 'relevant') sources.push(source);
    else if (source.relevance?.label === 'partial' || source.relevance?.label === 'unknown') related.push(source);
  }
  return { ...turn, sources, related_sources: related };
}

export function reviewedSummary(turn: ExplorationTurn): string | null {
  if (turn.history_compacted) return null;
  if (turn.action === 'discover' && ['succeeded', 'partial', 'empty'].includes(normalStatus(turn.status)) && !['failed', 'cancelled', 'interrupted', 'clarification_needed'].includes(normalStatus(turn.retrieval?.status)) && turn.routing === 'auto' && turn.papers) {
    const reviewed = !!(turn.agentic || turn.retrieval);
    return `${turn.papers.length ? `${turn.papers.length} ${reviewed ? 'reviewed relevant ' : ''}${turn.papers.length === 1 ? 'paper is' : 'papers are'} available.` : reviewed ? 'No directly relevant papers were found in this bounded search.' : 'No papers were returned in this bounded search.'} Matching DOI observations are grouped; each provider record remains separately available.${turn.related_sources?.length ? `\n${turn.related_sources.length} related or uncertain records are listed separately and excluded from answer-generation evidence.` : ''}`;
  }
  if (turn.action !== 'discover' || !turn.agentic && !turn.retrieval || !['succeeded', 'partial', 'empty'].includes(normalStatus(turn.status)) || ['failed', 'cancelled', 'interrupted', 'clarification_needed'].includes(normalStatus(turn.retrieval?.status))) return null;

  const count = turn.sources.length, related = turn.related_sources?.length || 0;
  const providers = turn.providers.map(provider => `${providerLabel(provider)}: ${turn.sources.filter(source => source.provider === provider).length} relevant`).join(' · ');
  return `${count ? `${count} reviewed relevant ${count === 1 ? 'source is' : 'sources are'} available.` : 'No directly relevant sources were found in this bounded search.'}${providers ? `\n${providers}` : ''}${related ? `\n${related} related or uncertain ${related === 1 ? 'record is' : 'records are'} listed separately and excluded from answer-generation evidence.` : ''}`;
}
