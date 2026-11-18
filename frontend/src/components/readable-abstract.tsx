'use client';

import { useState } from 'react';
import { abstractPoints } from '@/lib/abstract-points';
import styles from './readable-abstract.module.css';

export function AbstractPoints({ text, compact = false }: { text: string; compact?: boolean }) {
  return <ul className={`${styles.points}${compact ? ` ${styles.compact}` : ''}`} data-testid="abstract-key-points">{abstractPoints(text, compact ? 2 : 4).map((point, index) => <li key={index}>{point}</li>)}</ul>;
}

export default function ReadableAbstract({ text }: { text: string }) {
  const [original, setOriginal] = useState(false);
  return <div className={styles.abstract}>
    <div className={styles.toolbar} role="group" aria-label="Abstract presentation"><button type="button" aria-pressed={!original} onClick={() => setOriginal(false)}>Key points</button><button type="button" aria-pressed={original} onClick={() => setOriginal(true)}>Original abstract</button></div>
    {original ? <p className="abstract-text" data-testid="original-abstract">{text}</p> : <><AbstractPoints text={text} /><p className={styles.note}>Selected sentences from the provider abstract. Read the original for full context.</p></>}
  </div>;
}
