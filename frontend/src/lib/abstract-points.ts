/** Extract complete source sentences; never invent findings or rewrite qualifiers. */
export function abstractPoints(text: string, limit = 4): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(clean), part => part.segment.trim()).filter(Boolean)
    : clean.match(/[^.!?]+(?:[.!?]+(?:\s|$)|$)/g)?.map(part => part.trim()) || [clean];
  const unique = [...new Set(sentences)];
  if (unique.length <= limit) return unique;
  const score = (sentence: string) => /\b(results?|findings?)\b|\bwe (?:find|found|show|demonstrate)\b|\b(outperformed|achieved|reduced)\b/i.test(sentence) ? 4 : /\b(conclu\w*|outperform\w*|improv\w*|reduc\w*|achiev\w*)\b/i.test(sentence) ? 3 : /\b(method\w*|evaluat\w*|compar\w*|experiment\w*|dataset\w*|propos\w*)\b/i.test(sentence) ? 2 : 0;
  const ranked = unique.map((sentence, index) => ({ index, score: score(sentence) })).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Set([limit <= 2 ? ranked[0].index : 0]);
  if (limit > 2) selected.add(unique.length - 1);
  const caveat = unique.findIndex(sentence => /\b(limitations?|caution|uncertain|may not|cannot|does not|did not|should not|not significant|only)\b/i.test(sentence));
  if (caveat >= 0 && selected.size < limit) selected.add(caveat);
  for (const item of unique.map((sentence, index) => ({ index, score: score(sentence) })).filter(item => !selected.has(item.index)).sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (selected.size >= Math.max(2, limit)) break;
    selected.add(item.index);
  }
  return [...selected].sort((a, b) => a - b).map(index => unique[index]);
}
