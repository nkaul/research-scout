/** Browser-only, explicit PDF acquisition. No provider/model API or server proxy. */
export async function fetchDownloadPdf(url: string, signal: AbortSignal) {
  const limit = 50 * 1024 * 1024;
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  if (!response.ok) throw new Error(`The PDF host returned ${response.status}.`);
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('This PDF exceeds the 50 MB inline download limit.'); }
  if (!response.body) throw new Error('The host returned no PDF data.');
  const reader = response.body.getReader(), chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('This PDF exceeds the 50 MB inline download limit.'); }
      chunks.push(new Uint8Array(part.value).buffer);
    }
  } finally { reader.releaseLock(); }
  const blob = new Blob(chunks, { type: 'application/pdf' });
  if (!new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()).startsWith('%PDF-')) throw new Error('The host returned a page instead of a PDF.');
  return blob;
}

export function pdfFilename(title: string) {
  return `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 100) || 'research-paper'}.pdf`;
}
