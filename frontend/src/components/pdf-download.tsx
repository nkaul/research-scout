'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchDownloadPdf, pdfFilename } from '@/lib/pdf-download';
import { useLoadTiming } from '@/lib/load-timing';
import LoadTime from './load-time';
import Icon from './icon';
import Tooltip from './tooltip';

export default function PdfDownload({ url, title }: { url: string; title: string }) {
  const controller = useRef<AbortController | null>(null), blobs = useRef(new Set<string>());
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const clock = useLoadTiming();
  useEffect(() => () => {
    const pending = controller.current; controller.current = null; pending?.abort();
    for (const blob of blobs.current) URL.revokeObjectURL(blob);
    blobs.current.clear();
  }, [url]);
  async function download() {
    if (controller.current) return;
    const pending = new AbortController(); controller.current = pending;
    const ticket = clock.start(url, 'Download');
    setBusy(true); setError('');
    const timeout = setTimeout(() => pending.abort(), 30_000);
    try {
      const blob = await fetchDownloadPdf(url, pending.signal);
      if (controller.current !== pending || pending.signal.aborted) return;
      const location = URL.createObjectURL(blob); blobs.current.add(location);
      const anchor = document.createElement('a'); anchor.href = location; anchor.download = pdfFilename(title);
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => { URL.revokeObjectURL(location); blobs.current.delete(location); }, 30_000);
      clock.finish(ticket);
    } catch (failure) {
      if (controller.current !== pending) return;
      clock.finish(ticket, true);
      setError(pending.signal.aborted ? 'Download timed out.' : failure instanceof TypeError ? 'This host does not allow a direct browser download, or the connection failed.' : failure instanceof Error ? failure.message : 'The PDF could not be downloaded.');
    } finally {
      clearTimeout(timeout);
      if (controller.current === pending) { controller.current = null; setBusy(false); }
    }
  }
  return <div className="pdf-download-control"><Tooltip content="Download this PDF file without leaving the inline preview"><button type="button" className="button small" disabled={busy} onClick={() => void download()}><Icon name={busy ? 'spinner' : 'download'} />{busy ? 'Preparing download…' : 'Download PDF'}</button></Tooltip><LoadTime timing={clock.timing} description="Time to fetch and prepare the PDF download; the browser handles saving the file." />{error && <p className="inline-document-note" role="alert">{error} Open the PDF in a new tab and use the viewer’s Download control. <a href={url} target="_blank" rel="noopener noreferrer">Open PDF in new tab</a></p>}</div>;
}
