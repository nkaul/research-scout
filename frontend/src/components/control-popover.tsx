'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './control-popover.module.css';

/** Small viewport-bound control panel. Opening it never submits its parent form. */
export default function ControlPopover({ open, onClose, anchor, label, children, className = '' }: { open: boolean; onClose: () => void; anchor: RefObject<HTMLElement | null>; label: string; children: ReactNode; className?: string }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!anchor.current?.isConnected || !panel.current) return;
      const bounds = anchor.current.getBoundingClientRect(), size = panel.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(bounds.left, window.innerWidth - size.width - 8));
      const belowSpace = Math.max(0, window.innerHeight - bounds.bottom - 15);
      const aboveSpace = Math.max(0, bounds.top - 15);
      const below = belowSpace >= 160 || belowSpace >= aboveSpace;
      const available = below ? belowSpace : aboveSpace;
      // A tall menu must scroll on its chosen side, rather than covering its own
      // trigger. scrollHeight also lets an above menu grow safely after resize.
      const naturalHeight = panel.current.scrollHeight + (panel.current.offsetHeight - panel.current.clientHeight);
      const visibleHeight = Math.min(naturalHeight, available);
      const top = below ? bounds.bottom + 7 : bounds.top - 7 - visibleHeight;
      setPosition({ left, top: Math.max(8, top), maxHeight: Math.max(1, available), visibility: 'visible' });
    };
    place();
    panel.current?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) close.current(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); anchor.current?.focus({ preventScroll: true }); } };
    const another = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close.current(); };
    window.dispatchEvent(new CustomEvent('scout:control-popover-open', { detail: id }));
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('scout:control-popover-open', another);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('scout:control-popover-open', another);
    };
  }, [open, anchor, id]);
  if (!open || typeof document === 'undefined') return null;
  const parent = anchor.current?.closest('dialog[open]') || document.body;
  return createPortal(<div ref={panel} role="dialog" aria-label={label} className={`${styles.panel} ${className}`} style={position}>{children}</div>, parent);
}
