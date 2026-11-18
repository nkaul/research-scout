'use client';

import { useEffect, useState } from 'react';
import { humanStatus, providerLabel, safeUrl, sourceTitle, type Source } from '@/lib/api';
import type { ChatSource } from '@/lib/conversations';
import type { SearchResource } from '@/lib/search-resources';
import ChatAbstract from './chat-abstract';
import Icon from './icon';
import { VideoThumbnail, youtubeId } from './video-preview';
import OpenAccessResult from './open-access-result';
import { SourceRelevance } from './search-refinement';
import { useInlineDocument } from './inline-document';
import Tooltip from './tooltip';
import styles from './search-result-card.module.css';

type Props = { item: SearchResource; active: boolean; inspecting: string | null; inspect: (source: ChatSource, passive?: boolean, intent?: 'play-video') => Promise<void>; hover: (source: ChatSource) => void; cancelHover: () => void; abstractsExpanded: boolean; onSave?: (source: ChatSource) => void; saved: boolean; saving: boolean; related?: boolean };

export default function SearchResultCard({ item, active, inspecting, inspect, hover, cancelHover, abstractsExpanded, onSave, saved, saving, related = false }: Props) {
  const { source, paper, kind } = item;
  const [resolvedRecord, setResolvedRecord] = useState<Source | null>(null);
  const [observationsOpen, setObservationsOpen] = useState(false), [accessOpen, setAccessOpen] = useState(false);
  const observationsId = `observations-${source.run_id}-${encodeURIComponent(source.source_ref)}`;
  const accessId = `access-${source.run_id}-${encodeURIComponent(source.source_ref)}`;
  useEffect(() => { setResolvedRecord(null); setObservationsOpen(false); setAccessOpen(false); }, [source.run_id, source.source_ref, source.version]);
  const saveSource: ChatSource = resolvedRecord ? { ...resolvedRecord, run_id: source.run_id } : source;
  const document = useInlineDocument(source, paper?.access.observation, { compact: true });
  const videoId = youtubeId(source);
  const original = source.provider === 'youtube' ? videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined : safeUrl(source.url) || (source.doi ? `https://doi.org/${encodeURIComponent(source.doi)}` : undefined);
  const busy = inspecting === `${source.run_id}:${source.source_ref}`;
  const compactCard = kind === 'paper' || kind === 'video';
  const typeLabel = kind === 'video' ? 'Video' : kind === 'web' ? 'Web page' : source.resource_type === 'dataset' ? 'Dataset' : kind === 'paper' ? 'Paper' : 'Source';
  const accessLabel = paper?.access.observation ? paper.access.observation.is_oa ? 'Open access' : 'No open copy' : humanStatus(paper?.access.status || 'not_requested');
  const byline = kind === 'video' ? Array.from(new Set(source.authors?.map(author => author.trim()).filter(Boolean))).join(', ') || 'Channel not supplied' : `${source.authors?.join(', ') || 'Authors not supplied'}${source.venue ? ` · ${source.venue}` : ''}`;
  const description = <div className={`search-result-description${kind === 'video' ? ` ${styles.videoDescription}` : ''}`}><ChatAbstract key={`${source.run_id}:${source.source_ref}`} source={source} compact={compactCard} defaultExpanded={abstractsExpanded} onResolvedSource={setResolvedRecord} /></div>;
  return <li className={`search-result-card${compactCard ? ` ${styles.card}` : ''}${kind === 'video' ? ` ${styles.videoCard}` : ''}${active ? ' is-active' : ''}`} data-testid={related ? 'search-related-card' : 'search-result-card'} data-resource-kind={kind} data-active={active} aria-current={active ? 'true' : undefined} aria-label={`${kind === 'video' ? 'Video' : 'Paper'}: ${sourceTitle(source)}`} tabIndex={source.run_id ? 0 : -1}
    onPointerEnter={event => { if (event.pointerType === 'mouse') hover(source); }} onPointerLeave={cancelHover}
    onFocus={event => { if (!event.currentTarget.contains(event.relatedTarget) && window.matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)').matches) void inspect(source, true); }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter') { event.preventDefault(); void inspect(source); }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const rows = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(':scope > .search-result-card') || []), index = rows.indexOf(event.currentTarget), next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) { event.preventDefault(); next.focus(); }
    }}>
    {kind === 'video' && <VideoThumbnail source={source} onPreview={() => void inspect(source, false, 'play-video')} />}
    <div className="search-result-content">
      {!compactCard && <div className="search-result-meta"><span>{typeLabel}</span><span>{providerLabel(source.provider)}</span><span>{source.year || 'Year not supplied'}</span>{source.mode === 'fixture' && <span>Fictional fixture record</span>}</div>}
      <div className={compactCard ? styles.titleRow : undefined}>
        {source.run_id ? <button type="button" className={'search-result-title' + (compactCard ? ' ' + styles.title : '')} aria-label={sourceTitle(source)} onClick={() => void inspect(source)}><span data-testid="paper-title-text">{sourceTitle(source)}</span>{compactCard && <>{' '}<ResourceTags source={source} typeLabel={typeLabel} /></>}</button> : <h3 className={'search-result-title' + (compactCard ? ' ' + styles.title : '')} aria-label={sourceTitle(source)}><span data-testid="paper-title-text">{sourceTitle(source)}</span>{compactCard && <>{' '}<ResourceTags source={source} typeLabel={typeLabel} /></>}</h3>}
      </div>
      <p className={`search-result-meta${compactCard ? ` ${styles.byline}` : ''}`} title={byline}>{byline}</p>
      <SourceRelevance source={source} />
      {kind !== 'video' && description}
    </div>
    {kind === 'video' && description}
    <div className={`search-result-actions resource-action-bar${compactCard ? ` ${styles.actionRow}` : ''}`} aria-label="Resource actions">
      {source.run_id && <><Tooltip content="Read this record in the side panel; selection follows your mouse or keyboard"><button type="button" className="resource-icon-button" aria-label="Preview details" aria-busy={busy} onClick={() => void inspect(source)}><Icon name={busy ? 'spinner' : 'eye'} /></button></Tooltip>{onSave && <Tooltip content={saved ? 'Already saved in the selected research project' : 'Add this resource to a research project'}><button type="button" className="resource-icon-button" aria-label={saved ? 'Saved to project' : 'Save to project'} aria-pressed={saved} disabled={saving || saved} onClick={() => onSave(saveSource)}><Icon name={saved ? 'check' : saving ? 'spinner' : 'bookmark'} /></button></Tooltip>}</>}
      {original && <Tooltip content={kind === 'video' ? 'Open this video on YouTube' : 'Open the original provider source in a new tab'}><a className="resource-icon-button" aria-label={kind === 'video' && source.provider === 'youtube' ? 'Open on YouTube' : 'Original source'} href={original} target="_blank" rel="noreferrer noopener"><Icon name="external" /></a></Tooltip>}
      {document.actions}
      {paper && <Tooltip content={`${paper.observations.length} separately saved provider ${paper.observations.length === 1 ? 'record' : 'records'}${item.matchBasis === 'citation' ? ' grouped by matching title, authors, year and publication' : paper.doi ? ' grouped by matching DOI' : ''}`}><button type="button" className={`resource-icon-button provider-observation-toggle ${styles.providerToggle}`} aria-label={`Provider observations (${paper.observations.length})`} aria-expanded={observationsOpen} aria-controls={observationsId} onClick={() => setObservationsOpen(value => !value)}><Icon name="database" /><span>{paper.observations.length}</span></button></Tooltip>}
      {paper && kind === 'paper' && <Tooltip content={`Unpaywall: ${accessLabel}. View DOI access locations and licenses.`}><button type="button" className={`resource-icon-button ${styles.accessToggle}${paper.access.observation?.is_oa ? ` ${styles.openAccess}` : ''}`} data-access-status={paper.access.observation ? paper.access.observation.is_oa ? 'open' : 'closed' : paper.access.status} aria-label={`Unpaywall open access: ${accessLabel}`} aria-expanded={accessOpen} aria-controls={accessId} onClick={() => setAccessOpen(value => !value)}><Icon name={paper.access.observation?.is_oa ? 'lockOpen' : 'link'} />{paper.access.observation?.is_oa && <span className={styles.accessLabel}>Open access</span>}<span className={styles.accessDot} aria-hidden="true" /></button></Tooltip>}
    </div>
    {document.preview}
    {paper && <section id={observationsId} className={`provider-observation-report ${styles.report}`} data-testid="search-paper-observations" hidden={!observationsOpen}>
      <div className={styles.reportHeading}><strong>Provider records · {paper.observations.length}</strong>{!!item.savedVersionCount && item.savedVersionCount > paper.observations.length && <span>Showing latest known records from {item.savedVersionCount} saved versions</span>}<span>{item.matchBasis === 'citation' ? 'Matching citation. Original DOIs and provider records stay separate.' : paper.doi ? 'Matched by DOI. Each record keeps its own metadata and version.' : 'Latest saved version of each provider record.'}</span></div>
      <div className={styles.observations}>{paper.observations.map(observation => <div className={styles.observation} key={`${observation.run_id}:${observation.source_ref}`}><span className={`${styles.chip} ${styles.providerChip}`} data-provider={observation.provider}>{providerLabel(observation.provider)}</span><div><strong title={sourceTitle(observation)}>{sourceTitle(observation)}</strong><small>{observation.source_ref} · version {observation.version}{observation.doi ? ` · DOI ${observation.doi}` : ''}</small></div>{observation.run_id && <Tooltip content={`Read the original ${providerLabel(observation.provider)} record in the side panel`}><button type="button" className="resource-icon-button" aria-label="Preview provider record" onClick={() => void inspect(observation)}><Icon name="eye" /></button></Tooltip>}</div>)}</div>
    </section>}
    {paper && kind === 'paper' && <section id={accessId} className={`${styles.report} ${styles.accessReport}`} data-testid="search-paper-access" hidden={!accessOpen} aria-label="Unpaywall open-access details"><div className={styles.reportHeading}><strong>Unpaywall · {accessLabel}</strong><span>DOI access locations and license metadata</span></div>{paper.access.observation ? <OpenAccessResult access={paper.access.observation} /> : <p>{paper.access.reason || 'No access lookup result is saved for this paper.'}</p>}</section>}
  </li>;
}

function ResourceTags({ source, typeLabel }: { source: Source; typeLabel: string }) {
  return <span className={styles.tags} aria-label="Resource tags"><span className={styles.chip} data-tag="type">{typeLabel}</span><span className={styles.chip + ' ' + styles.providerChip} data-provider={source.provider} title={providerLabel(source.provider)}>{providerLabel(source.provider)}</span>{source.year ? <span className={styles.chip} data-tag="year">{source.year}</span> : null}{source.mode === 'fixture' && <span className={styles.chip} data-tag="fixture">Fixture</span>}</span>;
}
