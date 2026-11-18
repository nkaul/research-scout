'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ModalityLimits, ResourceLane } from '@/lib/conversations';
import { MAX_MODALITY_LIMIT } from '@/lib/search-preferences';
import Icon, { type IconName } from './icon';
import Tooltip from './tooltip';
import ControlPopover from './control-popover';
import styles from './modality-limit-control.module.css';

const lanes: { key: ResourceLane; label: string; icon: IconName }[] = [{ key: 'papers', label: 'Papers', icon: 'file' }, { key: 'videos', label: 'Videos', icon: 'video' }, { key: 'datasets', label: 'Data per catalog', icon: 'database' }, { key: 'repos', label: 'Repos', icon: 'repo' }];

export default function ModalityLimitControl({ value, onChange, disabled = false }: { value: ModalityLimits; onChange: (limits: ModalityLimits) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const active = Object.values(value).filter(limit => limit > 0).length;
  const summary = lanes.map(lane => `${lane.label}: ${value[lane.key] || 'off'}`).join(' · ');
  return <div className={styles.control}>
    <Tooltip content={`Search result limits · ${summary}`}><button ref={trigger} type="button" aria-label="Search result limits" aria-haspopup="dialog" aria-expanded={open && !disabled} disabled={disabled} onClick={() => setOpen(previous => !previous)}><Icon name="sliders" /><span>Limits</span><strong>{active}/4</strong><Icon name="chevron" /></button></Tooltip>
    <ControlPopover open={open && !disabled} onClose={() => setOpen(false)} anchor={trigger} label="Search result limits" className={styles.panel}>
      <strong>Limits for your next search</strong>
      {lanes.map(lane => <div className={styles.lane} key={lane.key}><label htmlFor={`${id}-${lane.key}`}><Icon name={lane.icon} />{lane.label}</label><output htmlFor={`${id}-${lane.key}`}>{value[lane.key] === 0 ? 'Off' : value[lane.key]}</output><input id={`${id}-${lane.key}`} type="range" aria-label={lane.label} aria-valuetext={value[lane.key] === 0 ? 'Off' : `${value[lane.key]} maximum${lane.key === 'datasets' ? ' per catalog' : ''}`} min="0" max={MAX_MODALITY_LIMIT} step="1" value={value[lane.key]} onChange={event => onChange({ ...value, [lane.key]: Number(event.target.value) })} /></div>)}
      <p>0 turns a type off. Press Search once to retrieve all enabled types. These are maximums; sources, filters and relevance checks can return fewer results. Editing limits does not start a search.</p>
      {active === 0 && <p className={styles.warning} role="status">Enable at least one result type to start a topic search.</p>}
    </ControlPopover>
  </div>;
}
