import type { ReactNode } from 'react';
import { providerLabel, sourceTitle } from '@/lib/api';
import type { ExplorationTurn } from '@/lib/conversations';

export const sourceAnchor = (turnId: string, label: string) => `answer-source-${turnId}-${label}`;

// A deliberately small renderer: source text always remains React text, never HTML.
// Unclosed markers in a partial stream remain readable until their closing token arrives.
function inline(text: string, turn: ExplorationTurn, depth = 0): ReactNode[] {
  const tokens = /\[S\d+\]|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|(?<!\w)_[^_\n]+_(?!\w)/g;
  const content: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(tokens)) {
    const start = match.index!, token = match[0];
    if (start > cursor) content.push(text.slice(cursor, start));
    const label = /^\[(S\d+)\]$/.exec(token)?.[1];
    const source = label && turn.sources.find(source => source.citation_label === label);
    if (source) content.push(<a key={start} className="answer-citation" href={`#${sourceAnchor(turn.id, label!)}`} aria-label={`${label}: ${providerLabel(source.provider)}, ${sourceTitle(source)}`}>{token}</a>);
    else if (label || depth >= 2) content.push(token);
    else if (token.startsWith('**') || token.startsWith('__')) content.push(<strong key={start}>{inline(token.slice(2, -2), turn, depth + 1)}</strong>);
    else content.push(<em key={start}>{inline(token.slice(1, -1), turn, depth + 1)}</em>);
    cursor = start + token.length;
  }
  if (cursor < text.length) content.push(text.slice(cursor));
  return content;
}

export default function AnswerText({ turn }: { turn: ExplorationTurn }) {
  const blocks: { type: 'paragraph' | 'unordered' | 'ordered'; lines: string[] }[] = [];
  let separate = true;
  for (const line of turn.response.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) { separate = true; continue; }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    const type = unordered ? 'unordered' : ordered ? 'ordered' : 'paragraph';
    const value = unordered?.[1] || ordered?.[1] || line;
    const previous = blocks.at(-1);
    if (!separate && previous?.type === type) previous.lines.push(value);
    else blocks.push({ type, lines: [value] });
    separate = false;
  }
  return <div className="resource-response formatted-answer" data-testid="streamed-answer">{blocks.map((block, index) => block.type === 'paragraph' ? <p key={index}>{inline(block.lines.join('\n'), turn)}</p> : block.type === 'unordered' ? <ul key={index}>{block.lines.map((line, item) => <li key={item}>{inline(line, turn)}</li>)}</ul> : <ol key={index}>{block.lines.map((line, item) => <li key={item}>{inline(line, turn)}</li>)}</ol>)}</div>;
}
