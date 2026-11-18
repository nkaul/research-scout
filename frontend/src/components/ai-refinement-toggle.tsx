'use client';

import Icon from './icon';
import Tooltip from './tooltip';
import styles from './ai-refinement-toggle.module.css';

export default function AiRefinementToggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <div className={styles.control}><Tooltip content={checked ? 'AI refinement on: plan the query and review relevance with AI.' : 'AI refinement off: use your direct query without model planning or AI relevance review.'}><button type="button" role="switch" aria-label="AI refinement" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><Icon name="sparkles" /><span className={styles.indicator} aria-hidden="true" /></button></Tooltip></div>;
}
