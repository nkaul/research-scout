/** Source-order excerpts for documentation. No ranking, rewriting or generated claims. */
export type ReadableContentBlock = {
  text: string;
  kind: 'paragraph' | 'list';
  startLine: number;
  endLine: number;
  section: string | null;
};

/** Keep Markdown paragraph/list boundaries and source line provenance. */
export function readableContentBlocks(text: string): ReadableContentBlock[] {
  const blocks: ReadableContentBlock[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let section: string | null = null, fence: string | null = null;
  let pending: ReadableContentBlock | null = null;
  const flush = () => { if (pending?.text.trim()) blocks.push(pending); pending = null; };
  lines.forEach((line, index) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      flush();
      if (!fence) fence = marker[1][0];
      else if (fence === marker[1][0]) fence = null;
      return;
    }
    if (fence) return;
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) { flush(); section = heading[1]; return; }
    if (!line.trim() || /^\s*(?:[-*_]\s*){3,}$/.test(line)) { flush(); return; }
    // Badges and image-only lines are not explanatory source text. Nothing is loaded.
    if (/^\s*(?:!\[|\[!\[|<img\b)/i.test(line)) { flush(); return; }
    const item = line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (item) {
      flush(); pending = { text: item[1], kind: 'list', startLine: index + 1, endLine: index + 1, section };
      return;
    }
    if (pending?.kind === 'list' && !/^\s+/.test(line)) flush();
    if (pending) { pending.text += `\n${line.trim()}`; pending.endLine = index + 1; }
    else pending = { text: line.trim(), kind: 'paragraph', startLine: index + 1, endLine: index + 1, section };
  });
  flush();
  return blocks;
}

/** Complete supplied sentences/list items, in their original order. */
export function readableContentPoints(text: string): string[] {
  const points = readableContentBlocks(text).flatMap(block => {
    if (block.kind === 'list') return [block.text];
    return typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(block.text), part => part.segment.trim()).filter(Boolean)
      : block.text.match(/[^.!?]+(?:[.!?]+(?:\s|$)|$)/g)?.map(part => part.trim()) || [block.text];
  });
  return [...new Set(points)];
}
