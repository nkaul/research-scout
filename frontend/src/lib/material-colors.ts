const termTones = ['teal', 'violet', 'indigo', 'orange', 'rose', 'green'] as const;

/** Presentation only: the same saved label keeps its color across views/reorders. */
export function materialTone(label: string): typeof termTones[number] {
  const normalized = label.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\b(context|memory|prompt)\b/.test(normalized)) return 'teal';
  if (/\b(rag|retrieval|retrieve|search|reranking|rerank|relevance)\b/.test(normalized)) return 'violet';
  if (/\b(llm|llms|language|generation|generative|model|models|transformer|transformers)\b/.test(normalized)) return 'orange';
  if (/\b(evidence|evaluation|evaluate|grounded|grounding|faithfulness|citation|citations)\b/.test(normalized)) return 'green';
  if (/\b(learning|reasoning|agents?|planning|neural)\b/.test(normalized)) return 'indigo';
  let hash = 0;
  for (let index = 0; index < normalized.length; index++) hash = (Math.imul(hash, 31) + normalized.charCodeAt(index)) >>> 0;
  return termTones[hash % termTones.length];
}

