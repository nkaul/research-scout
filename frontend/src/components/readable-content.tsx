'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { readableContentPoints } from '@/lib/readable-content';
import styles from './readable-content.module.css';

export type ReadableContentProps = {
  text: string | null | undefined;
  label: 'description' | 'README' | 'excerpts';
  sourceKey: string;
  previewPoints?: number;
  compact?: boolean;
  sourceNotice?: string;
  originalText?: string | null;
  originalLabel?: string;
  onOriginal?: () => void;
  originalLoading?: boolean;
  originalError?: string;
};

/** Presentation state belongs to one saved source/version and supplied text. */
export default function ReadableContent(props: ReadableContentProps) {
  return <Content key={`${props.sourceKey}:${props.text || ''}`} {...props} />;
}

function Content({ text, label, previewPoints = 4, compact = false, sourceNotice, originalText, originalLabel, onOriginal, originalLoading = false, originalError }: ReadableContentProps) {
  const [original, setOriginal] = useState(false);
  const [expanded, setExpanded] = useState({ points: false, original: false });
  const [clipped, setClipped] = useState(false);
  const contentId = useId();
  const body = useRef<HTMLDivElement>(null);
  const points = useMemo(() => readableContentPoints(text || ''), [text]);
  const isExpanded = original ? expanded.original : expanded.points;
  const availableText = onOriginal ? originalText : originalText ?? text;
  const originalName = originalLabel || (label === 'README' ? 'Original saved README' : label === 'excerpts' ? 'Saved excerpts' : 'Original description');
  const visiblePoints = isExpanded ? points : points.slice(0, previewPoints);

  useEffect(() => {
    const element = body.current;
    if (!element || isExpanded) return;
    const measure = () => setClipped(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [original, isExpanded, text, originalText, originalLoading, previewPoints]);

  const expandable = isExpanded || clipped || (!original && points.length > previewPoints);
  return <div className={`${styles.content}${compact ? ` ${styles.compact}` : ''}`} data-testid="readable-content" data-presentation={original ? 'original' : 'points'}>
    <div className={styles.toolbar} role="group" aria-label={`${label === 'excerpts' ? 'Saved excerpts' : label} presentation`}>
      <button type="button" aria-pressed={!original} onClick={() => setOriginal(false)}>Key points</button>
      <button type="button" aria-pressed={original} onClick={() => { setOriginal(true); setClipped(false); if (onOriginal && originalText == null && !originalLoading) onOriginal(); }}>{originalName}</button>
    </div>
    <div ref={body} id={contentId} className={`${styles.body}${isExpanded ? '' : ` ${styles.collapsed}`}`} data-testid="readable-content-body">
      {original ? originalLoading ? <p role="status">Opening saved text…</p> : originalError ? <p className={styles.error} role="alert">{originalError} {onOriginal && <button type="button" onClick={onOriginal}>Retry saved text</button>}</p> : availableText ? <div className={styles.original} data-testid="readable-original">{availableText}</div> : <p>No {label === 'README' ? 'saved README text' : label === 'excerpts' ? 'saved excerpts' : 'description'} supplied.</p>
        : points.length ? <ul className={styles.points} data-testid="readable-key-points">{visiblePoints.map((point, index) => <li key={index}>{point}</li>)}</ul> : <p>{text?.trim() ? 'No explanatory source sentences available. Open the saved text to inspect its supplied structure.' : `No ${label === 'README' ? 'saved README text' : label === 'excerpts' ? 'saved excerpts' : 'description'} supplied.`}</p>}
    </div>
    {expandable && !(original && (originalLoading || originalError)) && <button type="button" className={styles.expand} aria-expanded={isExpanded} aria-controls={contentId} onClick={() => { setExpanded(value => ({ ...value, [original ? 'original' : 'points']: !isExpanded })); if (!isExpanded) setClipped(false); }}>Read {isExpanded ? 'less' : 'more'}</button>}
    {!original && !!points.length && <p className={styles.note}>Selected source sentences and list items. Read the saved text for full context.</p>}
    {sourceNotice && <p className={styles.notice}>{sourceNotice}</p>}
  </div>;
}
