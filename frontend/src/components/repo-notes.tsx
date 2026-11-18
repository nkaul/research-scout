'use client';

import { useEffect, useId, useState } from 'react';
import { ApiError, request } from '@/lib/api';
import { readmeSourceUrl, readmeStatus, repositoryRecordPath, type RepositoryNote, type RepositoryRecord } from '@/lib/repositories';
import styles from './repo-notes.module.css';

export type RepositoryNoteDraft = {
  text: string; savedText: string; revision: number; evidenceVersion: string | null;
  references: RepositoryNote['references']; loaded: boolean; loading: boolean; saving: boolean;
  editing: boolean; error: string; conflict: boolean; updatedAt: string | null;
};
export function emptyNoteDraft(): RepositoryNoteDraft {
  return { text: '', savedText: '', revision: 0, evidenceVersion: null, references: [], loaded: false, loading: false, saving: false, editing: false, error: '', conflict: false, updatedAt: null };
}

export default function RepositoryNotes({ active, searchId, record, draft, onDraft }: {
  active: boolean; searchId: string; record: RepositoryRecord; draft: RepositoryNoteDraft;
  onDraft: (patch: Partial<RepositoryNoteDraft>) => void;
}) {
  const id = useId(), [retry, setRetry] = useState(0);
  const [evidence, setEvidence] = useState<Record<string, { loading: boolean; error?: string; record?: RepositoryRecord }>>({});
  const path = repositoryRecordPath(searchId, record.record_id) + '/notes';
  const dirty = draft.text !== draft.savedText;
  useEffect(() => {
    if (!active || draft.loaded) return;
    let live = true;
    const update = onDraft;
    update({ loading: true, error: '' });
    void request<RepositoryNote>(path).then(note => {
      if (live) update({ text: note.text, savedText: note.text, revision: note.revision, evidenceVersion: note.evidence_version, references: note.references, updatedAt: note.updated_at, loaded: true, loading: false, conflict: false });
    }).catch(failure => {
      if (live) update({ loading: false, error: failure instanceof Error ? failure.message : 'Saved repository notes could not be opened.' });
    });
    return () => { live = false; update({ loading: false, editing: false }); };
    // The parent owns drafts by conversation/turn/numeric ID. Streamed record updates
    // must not reload or overwrite an admitted draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, path, retry]);

  async function save() {
    if (!draft.loaded || draft.saving || !dirty || draft.conflict) return;
    const text = draft.text, evidenceVersion = draft.evidenceVersion || record.evidence_version;
    const update = onDraft;
    update({ saving: true, error: '' });
    try {
      const note = await request<RepositoryNote>(path, { method: 'PUT', body: JSON.stringify({ text, expected_revision: draft.revision, evidence_version: evidenceVersion }) });
      update({ savedText: note.text, revision: note.revision, references: note.references, evidenceVersion: note.evidence_version, updatedAt: note.updated_at, saving: false, conflict: false });
    } catch (failure) {
      update({ saving: false, conflict: failure instanceof ApiError && failure.status === 409, error: failure instanceof ApiError && failure.status === 409 ? 'This note or its source changed. Your draft is retained. Review the latest saved note before saving again.' : failure instanceof Error ? failure.message : 'Repository note could not be saved.' });
    }
  }
  async function reviewLatest() {
    const update = onDraft;
    update({ loading: true });
    try {
      const note = await request<RepositoryNote>(path);
      update({ savedText: note.text, revision: note.revision, references: note.references, updatedAt: note.updated_at, loading: false, conflict: false, error: 'Latest saved note loaded below; your draft is retained. Review both before saving.' });
    } catch (failure) { update({ loading: false, error: failure instanceof Error ? failure.message : 'Latest saved note could not be opened.' }); }
  }
  async function inspectReference(reference: RepositoryNote['references'][number]) {
    const key = [reference.search_id, reference.record_id, reference.evidence_version].join(':');
    if (evidence[key]?.loading || evidence[key]?.record) return;
    setEvidence(previous => ({ ...previous, [key]: { loading: true } }));
    try {
      const source = await request<RepositoryRecord>(repositoryRecordPath(reference.search_id, reference.record_id) + '/evidence/' + encodeURIComponent(reference.evidence_version));
      if (source.record_id !== reference.record_id || source.evidence_version !== reference.evidence_version) throw new Error('Saved evidence does not match this note reference.');
      setEvidence(previous => ({ ...previous, [key]: { loading: false, record: source } }));
    } catch (failure) { setEvidence(previous => ({ ...previous, [key]: { loading: false, error: failure instanceof Error ? failure.message : 'Saved evidence could not be opened.' } })); }
  }

  return <section hidden={!active} className={styles.notes} aria-label="Repository notes">
    <p>Notes stay with this research question and GitHub repository. Editing pauses automatic reader following.</p>
    {draft.loading && <p role="status">Opening saved repository note…</p>}
    <label htmlFor={id}>Your repository note</label>
    <textarea id={id} value={draft.text} maxLength={8000} rows={8} disabled={!draft.loaded || draft.loading || draft.saving} onFocus={() => onDraft({ editing: true })} onBlur={() => onDraft({ editing: false })} onChange={event => onDraft({ text: event.target.value, evidenceVersion: dirty ? draft.evidenceVersion : record.evidence_version })} />
    <div className={styles.actions}><button type="button" className="button primary small" disabled={!draft.loaded || !dirty || draft.saving || draft.loading || draft.conflict || new TextEncoder().encode(draft.text).length > 16000} onClick={() => void save()}>{draft.saving ? 'Saving…' : 'Save note'}</button>{dirty && <span>Unsaved draft</span>}{draft.updatedAt && !dirty && <span>Saved {draft.updatedAt.slice(0, 10)}</span>}</div>
    {new TextEncoder().encode(draft.text).length > 16000 && <p role="alert">This note exceeds the 16,000-byte text limit. Shorten it before saving.</p>}
    {draft.error && <p role="alert">{draft.error}</p>}
    {!draft.loaded && !draft.loading && draft.error && <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry saved note</button>}
    {draft.conflict && <button type="button" className="text-button" disabled={draft.loading} onClick={() => void reviewLatest()}>Review latest saved note</button>}
    {dirty && draft.savedText && <details><summary>Latest saved note</summary><p className={styles.savedText}>{draft.savedText}</p></details>}
    {!!draft.references.length && <details><summary>Saved evidence references ({draft.references.length})</summary><ul>{draft.references.map(reference => {
      const saved = evidence[[reference.search_id, reference.record_id, reference.evidence_version].join(':')];
      return <li key={reference.search_id + ':' + reference.evidence_version}><strong>{reference.full_name}</strong><span>{reference.evidence_version === record.evidence_version ? 'Current evidence' : 'Earlier evidence'} · {reference.evidence_version}</span>{readmeSourceUrl(reference.source_url) && <a href={readmeSourceUrl(reference.source_url)} target="_blank" rel="noopener noreferrer">Pinned README blob</a>}{' '}<button type="button" className="text-button" disabled={saved?.loading} onClick={() => void inspectReference(reference)}>{saved?.loading ? 'Opening saved evidence…' : saved?.error ? 'Retry saved evidence' : 'Inspect saved evidence'}</button>{saved?.error && <p role="alert">{saved.error}</p>}{saved?.record && <div className={styles.reference}><p>{saved.record.description || 'No description supplied.'}</p><span>{readmeStatus(saved.record)}</span><ul>{saved.record.readme.evidence.map(item => <li key={item.id}>{item.text}<span>{item.section} · lines {item.start_line}–{item.end_line}</span></li>)}</ul></div>}</li>;
    })}</ul></details>}
  </section>;
}
