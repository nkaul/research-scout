import type { Source } from './api';
import type { ChatSource } from './conversations';

export type ProjectConcept = { id: string; name: string; created_at: string };
export type ProjectQuery = { id: string; conversation_id: string | null; run_id: string | null; turn_id?: string | null; title: string; question: string; created_at: string; concept_ids: string[] };
export type ProjectResource = { id: string; identity: string; kind: string; title: string; doi?: string | null; provider: string; record_id: string; url?: string | null; year?: number | null; run_id: string; source_ref: string; version: string | number; resource_type?: string; saved_at: string; concept_ids: string[]; observations: { run_id: string; source_ref: string; version: string | number; source: Source }[] };
export type ResearchProject = { id: string; name: string; description: string; created_at: string; updated_at: string; revision: number; concepts: ProjectConcept[]; queries: ProjectQuery[]; resources: ProjectResource[] };

export function projectHasSource(project: ResearchProject | undefined, source: Pick<ChatSource, 'provider' | 'source_ref' | 'record_id' | 'doi' | 'run_id'>, conceptId?: string) {
  return !!project?.resources.some(item => (!conceptId || item.concept_ids.includes(conceptId)) && (item.observations.some(observation => observation.run_id === source.run_id && observation.source_ref === source.source_ref)
    || !!source.doi && item.doi?.toLowerCase().replace(/^https?:\/\/doi\.org\//, '') === source.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//, '')
    || source.provider === 'youtube' && item.provider === 'youtube' && item.record_id === source.record_id));
}

export function mergeProjects(previous: ResearchProject[], incoming: ResearchProject[]) {
  const projects = new Map(previous.map(project => [project.id, project]));
  for (const project of incoming) if (!projects.has(project.id) || projects.get(project.id)!.revision <= project.revision) projects.set(project.id, project);
  return [...projects.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function projectResourceSource(resource: ProjectResource): ChatSource {
  const observation = resource.observations[0];
  return { ...(observation?.source || resource), run_id: observation?.run_id || resource.run_id } as ChatSource;
}
