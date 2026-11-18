'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MAX_VIDEO_COUNT } from '@/lib/search-preferences';
import Icon from './icon';
import Tooltip from './tooltip';
import ControlPopover from './control-popover';
import styles from './video-count-control.module.css';

export default function VideoCountControl({ value, onChange, disabled = false }: { value: number; onChange: (count: number) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <div className={styles.control}>
    <Tooltip content={`Fetch up to ${value} YouTube videos per query. Adjust the limit from 1 to ${MAX_VIDEO_COUNT}.`}><button ref={trigger} type="button" aria-label={`Videos to fetch: ${value}`} aria-haspopup="dialog" aria-expanded={open && !disabled} disabled={disabled} onClick={() => setOpen(previous => !previous)}><Icon name="video" /><span>Videos</span><strong>{value}</strong><Icon name="chevron" /></button></Tooltip>
    <ControlPopover open={open && !disabled} onClose={() => setOpen(false)} anchor={trigger} label="Video fetch limit">
      <div className={styles.heading}><label htmlFor={id}>Videos to fetch</label><output htmlFor={id}>{value}</output></div>
      <input id={id} aria-label="Videos to fetch" type="range" min="1" max={MAX_VIDEO_COUNT} step="1" value={value} onChange={event => onChange(Number(event.target.value))} />
      <div className={styles.ends} aria-hidden="true"><span>1</span><span>{MAX_VIDEO_COUNT}</span></div>
      <p>Maximum videos per YouTube query. Applies when you start your next search; fewer videos may match. Metadata and transcripts use the provider allowance separately.</p>
    </ControlPopover>
  </div>;
}
