'use client';

import Tooltip from './tooltip';

import { useEffect, useRef, useState } from 'react';
import { providerLabel, request, sourceTitle } from '@/lib/api';
import type { ChatSource } from '@/lib/conversations';
import { projectResourceSource, type ProjectQuery, type ResearchProject } from '@/lib/projects';
import Icon from './icon';

export default function ResearchProjects({ open, projects, activeId, error: loadError, pendingSource, pendingQuery, onClose, onSelect, onChange, onRefresh, onSaveSource, onSaveQuery, onOpenQuery, onOpenSource }: {
  open: boolean; projects: ResearchProject[]; activeId: string | null; error: string; pendingSource: ChatSource | null; pendingQuery: boolean;
  onClose: () => void; onSelect: (id: string) => void; onChange: (project: ResearchProject) => void; onRefresh: () => void;
  onSaveSource: (projectId: string, conceptIds: string[]) => Promise<void>; onSaveQuery: (projectId: string, conceptIds: string[]) => Promise<void>;
  onOpenQuery: (query: ProjectQuery) => void; onOpenSource: (source: ChatSource) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closed = useRef(!open);
  closed.current = !open;
  function close() { closed.current = true; onClose(); }
  const [name, setName] = useState(''), [conceptName, setConceptName] = useState(''), [conceptId, setConceptId] = useState('');
  const [working, setWorking] = useState(false), [error, setError] = useState('');
  const selected = projects.find(item => item.id === activeId) || projects[0];
  const resourceList = (selected?.resources || []).filter(item => !conceptId || item.concept_ids.includes(conceptId));
  const queryList = (selected?.queries || []).filter(item => !conceptId || item.concept_ids.includes(conceptId));
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open && dialog.current?.open) dialog.current?.close(); }, [open]);
  useEffect(() => { setConceptId(''); setConceptName(''); setError(''); }, [selected?.id]);
  async function act(action: () => Promise<void>) {
    if (working) return;
    setWorking(true); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'This project action could not be saved.'); }
    finally { setWorking(false); }
  }
  return <dialog ref={dialog} className="research-projects-dialog" aria-labelledby="projects-heading" onClose={close}>
    <div className="dialog-heading"><div><h2 id="projects-heading"><Icon name="folder" />Research projects</h2><p>Keep questions, concepts and evidence together.</p></div><Tooltip content={'Close project management'}><button type="button" className="icon-button" aria-label="Close research projects" onClick={close}><Icon name="close" /></button></Tooltip></div>
    <div className="projects-layout">
      <nav className="projects-index" aria-label="Research projects"><form onSubmit={event => { event.preventDefault(); if (!name.trim()) return; void act(async () => { const project = await request<ResearchProject>('/projects', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); onChange(project); if (!closed.current) onSelect(project.id); setName(''); }); }}><label className="sr-only" htmlFor="new-project-name">New research project name</label><input id="new-project-name" value={name} onChange={event => setName(event.target.value)} placeholder="New project name" maxLength={120} disabled={working} /><Tooltip content={'Create a new research project'}><button type="submit" className="icon-button" aria-label="Create research project" title="Create research project" disabled={working || !name.trim()}><Icon name="plus" /></button></Tooltip></form>
        {projects.map(project => <button type="button" className={`project-index-item${selected?.id === project.id ? ' active' : ''}`} aria-current={selected?.id === project.id ? 'true' : undefined} key={project.id} disabled={working} onClick={() => onSelect(project.id)}><Icon name="folder" /><span><strong>{project.name}</strong><small>{project.queries.length} queries · {project.resources.length} resources</small></span></button>)}
        {!projects.length && <p className="project-empty">Create your first project, then add research queries and useful resources.</p>}
      </nav>
      <section className="project-content" aria-label="Selected research project">
        {loadError && <p role="alert" className="project-error">{loadError} <button type="button" className="text-button" onClick={onRefresh}>Retry projects</button></p>}
        {error && <p role="alert" className="project-error">{error}</p>}
        {selected ? <><header className="project-content-heading"><div><h3>{selected.name}</h3><p>{selected.queries.length} research queries · {selected.resources.length} saved resources</p></div><button type="button" className="text-button" onClick={close}>Continue researching<Icon name="arrow" /></button></header>
          <div className="project-concepts"><button type="button" className={!conceptId ? 'selected' : ''} aria-pressed={!conceptId} onClick={() => setConceptId('')}>All concepts</button>{selected.concepts.map(concept => <button type="button" key={concept.id} className={conceptId === concept.id ? 'selected' : ''} aria-pressed={conceptId === concept.id} onClick={() => setConceptId(concept.id)}><Icon name="tag" />{concept.name}</button>)}<form onSubmit={event => { event.preventDefault(); if (!conceptName.trim()) return; void act(async () => { const next = await request<ResearchProject>(`/projects/${selected.id}/concepts`, { method: 'POST', body: JSON.stringify({ name: conceptName.trim() }) }); onChange(next); const added = next.concepts.find(concept => concept.name === conceptName.trim()); if (added) setConceptId(added.id); setConceptName(''); }); }}><input aria-label="New concept name" placeholder="New concept" value={conceptName} maxLength={120} onChange={event => setConceptName(event.target.value)} disabled={working} /><Tooltip content={'Create a concept in this project'}><button type="submit" className="icon-button" title="Create concept" aria-label="Create concept" disabled={working || !conceptName.trim()}><Icon name="plus" /></button></Tooltip></form></div>
          {(pendingSource || pendingQuery) && <div className="project-save-prompt" role="group" aria-label="Save destination"><p>{pendingSource ? sourceTitle(pendingSource) : 'Add the current research query'}<small>Destination: {selected.name}{conceptId ? ` / ${selected.concepts.find(concept => concept.id === conceptId)?.name}` : ' / All concepts'}</small></p><button type="button" className="button primary" disabled={working} onClick={() => void act(async () => { if (pendingSource) await onSaveSource(selected.id, conceptId ? [conceptId] : []); else await onSaveQuery(selected.id, conceptId ? [conceptId] : []); })}><Icon name="bookmark" />{working ? 'Saving…' : pendingSource ? 'Save resource to project' : 'Add query to project'}</button></div>}
          <section className="project-queries"><h4><Icon name="search" />Research queries <span>{queryList.length}</span></h4>{queryList.length ? queryList.map(query => <button type="button" className="project-query" key={query.id} onClick={() => onOpenQuery(query)}><Icon name="search" /><span>{query.question || query.title}<small>Open saved results · no new search</small></span><Icon name="arrow" /></button>) : <p className="project-empty">New searches in this project appear here. Use the query icon beside Search to add an existing query.</p>}</section>
          <section className="project-resources"><h4><Icon name="bookmark" />Saved resources <span>{resourceList.length}</span></h4>{resourceList.length ? resourceList.map(resource => <button type="button" className="project-resource" key={resource.id} onClick={() => onOpenSource(projectResourceSource(resource))}><Icon name={resource.kind === 'video' ? 'compass' : 'file'} /><span><strong>{resource.title}</strong><small>{providerLabel(resource.provider)} · {resource.year || 'Year not supplied'} · {resource.kind === 'video' ? 'Video' : 'Paper'}</small></span><Icon name="arrow" /></button>) : <p className="project-empty">Use the bookmark icon on a paper or video to save it here. Projects can contain more than the three-paper review shortlist.</p>}</section>
        </> : <div className="project-empty-state"><Icon name="folder" /><h3>A home for your research</h3><p>Create a project for a question or goal. Group its queries and saved papers or videos with concepts.</p></div>}
      </section>
    </div>
  </dialog>;
}
