'use client';

import Tooltip from './tooltip';

import { useEffect, useState } from 'react';
import styles from './inline-document.module.css';
import { sourceTitle, type Source } from '@/lib/api';
import type { AccessObservation } from '@/lib/conversations';
import Icon from './icon';
import LoadTime from './load-time';
import PdfDownload from './pdf-download';
import { useLoadTiming } from '@/lib/load-timing';

function publicPdfUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443'
      || !host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local')
      || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)
      || host.includes(':')) return undefined;
    return url.href;
  } catch { return undefined; }
}

/** Validate a supplied arXiv record and use its canonical browser-readable PDF. */
function arxivPdfUrl(value?: string | null) {
  try {
    const supplied = new URL(value || '');
    if (!['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(supplied.hostname)) return undefined;
    if (!['https:', 'http:'].includes(supplied.protocol) || supplied.username || supplied.password || supplied.port) return undefined;
    const match = supplied.pathname.match(/^\/(?:abs|pdf)\/(\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}(?:v[1-9]\d*)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{2}(?:0[1-9]|1[0-2])\d{3}(?:v[1-9]\d*)?)(?:\.pdf)?$/);
    return match ? 'https://arxiv.org/pdf/' + match[1] : undefined;
  } catch { return undefined; }
}

/** Use only explicit provider/OA PDF locations, never a guessed publisher URL. */
export function sourcePdfUrl(source: Source, access?: AccessObservation | null) {
  if (source.provider === 'youtube' || source.resource_type === 'video') return undefined;
  const arxiv = arxivPdfUrl(source.url);
  if (arxiv) return arxiv;
  if (access?.is_oa) {
    for (const location of [access.best_oa_location, ...(access.oa_locations || [])]) {
      const url = publicPdfUrl(location?.url_for_pdf);
      if (url) return arxivPdfUrl(url) || url;
    }
  }
  // An invalid arXiv ID must not slip through the generic /pdf/ URL rule.
  try { if (['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(new URL(source.url || '').hostname)) return undefined; } catch { /* Missing original link. */ }
  const url = publicPdfUrl(source.url);
  if (!url) return undefined;
  const parsed = new URL(url);
  return /\.pdf$/i.test(parsed.pathname) || /\/pdf\//i.test(parsed.pathname) ? url : undefined;
}

/** Share one pair of PDF controls with a separately positioned inline preview. */
export function useInlineDocument(source: Source, access?: AccessObservation | null, { compact = false }: { compact?: boolean } = {}) {
  const url = sourcePdfUrl(source, access);
  const [openedUrl, setOpenedUrl] = useState<string | null>(null), [loadedUrl, setLoadedUrl] = useState<string | null>(null), [slowUrl, setSlowUrl] = useState<string | null>(null);
  const opened = !!url && openedUrl === url;
  const pdfClock = useLoadTiming();
  useEffect(() => {
    if (!opened || loadedUrl === url) return;
    const timer = setTimeout(() => setSlowUrl(url!), 12_000);
    return () => clearTimeout(timer);
  }, [opened, loadedUrl, url]);
  const actions = url ? <>
    <Tooltip content={opened ? 'Close the inline PDF' : 'Preview the reported PDF here'}><button type="button" className="resource-icon-button" aria-label={opened ? 'Close PDF' : 'Preview PDF'} aria-expanded={opened} onClick={() => { if (opened) pdfClock.clear(); else pdfClock.start(url, 'PDF'); setOpenedUrl(opened ? null : url); setLoadedUrl(null); setSlowUrl(null); }}><Icon name="pdf" />{!compact && <span>{opened ? 'Close PDF' : 'Preview PDF'}</span>}</button></Tooltip>
    <Tooltip content="Open the reported PDF in a new tab; publisher or browser settings may download it"><a className={compact ? 'resource-icon-button' : 'text-button'} aria-label="Open PDF in new tab" href={url} target="_blank" rel="noopener noreferrer" type="application/pdf"><Icon name="pdfExternal" />{!compact && <span>Open PDF in new tab</span>}</a></Tooltip>
  </> : null;
  const preview = opened && url ? <section className={styles.preview} aria-label="Inline PDF" data-testid="inline-document">
    <div className={styles.toolbar}><LoadTime timing={pdfClock.timing} description="Time from opening this PDF to the browser frame load event; it does not measure every page rendering." /><PdfDownload key={url} url={url} title={sourceTitle(source)} /></div>
    {loadedUrl !== url && <div className="inline-document-loading"><p role="status">{slowUrl === url ? 'The PDF is taking longer to open. Try its new-tab link if the publisher blocks previews.' : 'Opening PDF…'}</p><div className="transcript-loading-mask" aria-hidden="true"><span className="search-skeleton-line" /><span className="search-skeleton-line" /><span className="search-skeleton-line short" /></div></div>}
    <iframe key={url} className="inline-document-frame" title={'PDF: ' + sourceTitle(source)} src={url} referrerPolicy="no-referrer" onLoad={() => { setLoadedUrl(url); if (pdfClock.timing) pdfClock.finish(pdfClock.timing); }} onError={() => { setSlowUrl(url); if (pdfClock.timing) pdfClock.finish(pdfClock.timing, true); }} />
    <p className="inline-document-note">Provider-reported PDF. Viewing does not add PDF text to research evidence. If inline viewing is blocked, use the new-tab link; publisher headers or browser preferences may download it.</p>
  </section> : null;
  return { actions, preview, url, opened };
}

export default function InlineDocument({ source, access }: { source: Source; access?: AccessObservation | null }) {
  const document = useInlineDocument(source, access);
  if (!document.url) return null;
  return <section className="inline-document" aria-label="PDF controls"><div className="inline-document-toolbar">{document.actions}</div>{document.preview}</section>;
}
