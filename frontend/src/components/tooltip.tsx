'use client';

import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement, type Ref } from 'react';
import { createPortal } from 'react-dom';
import styles from './tooltip.module.css';

type TriggerProps = HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> };

/** One focusable element; cloned so an icon toolbar keeps its original layout. */
export default function Tooltip({ content, children, delay = 150 }: { content: string; children: ReactElement<TriggerProps>; delay?: number }) {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null), bubble = useRef<HTMLDivElement | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hovered = useRef(false), focused = useRef(false), dismissed = useRef(false);
  const [open, setOpen] = useState(false), [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const originalRef = children.props.ref;
  const triggerRef = useCallback((node: HTMLElement | null) => {
    anchor.current = node;
    if (typeof originalRef === 'function') return originalRef(node);
    if (originalRef) originalRef.current = node;
  }, [originalRef]);

  function clearTimers() { clearTimeout(showTimer.current); clearTimeout(hideTimer.current); }
  function show(immediate = false) {
    clearTimers();
    if (dismissed.current || !content) return;
    const activate = () => { document.dispatchEvent(new CustomEvent('research-scout:tooltip-open', { detail: id })); setOpen(true); };
    if (immediate) activate();
    else showTimer.current = setTimeout(activate, delay);
  }
  function hide() {
    clearTimeout(showTimer.current);
    hideTimer.current = setTimeout(() => { if (!hovered.current && !focused.current) setOpen(false); }, 90);
  }

  useEffect(() => () => { clearTimeout(showTimer.current); clearTimeout(hideTimer.current); }, []);
  useEffect(() => {
    const anotherOpened = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) { clearTimers(); setOpen(false); } };
    document.addEventListener('research-scout:tooltip-open', anotherOpened);
    return () => document.removeEventListener('research-scout:tooltip-open', anotherOpened);
  }, [id]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dismissed.current = true; clearTimers(); setOpen(false);
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const place = () => {
      const target = anchor.current, tooltip = bubble.current;
      if (!target || !tooltip || !target.isConnected) { setOpen(false); return; }
      const bounds = target.getBoundingClientRect(), size = tooltip.getBoundingClientRect();
      const left = Math.max(8, Math.min(bounds.left + (bounds.width - size.width) / 2, window.innerWidth - size.width - 8));
      const above = bounds.top - size.height - 8;
      const top = Math.max(8, Math.min(above >= 8 ? above : bounds.bottom + 8, window.innerHeight - size.height - 8));
      setPosition({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, content]);

  const describedBy = [children.props['aria-describedby'], open ? id : undefined].filter(Boolean).join(' ') || undefined;
  const portalParent = typeof document === 'undefined' ? null : anchor.current?.closest('dialog[open]') || document.body;
  return <>{cloneElement(children, {
    ref: triggerRef,
    title: undefined,
    'aria-describedby': describedBy,
    onPointerEnter: event => { children.props.onPointerEnter?.(event); if (event.pointerType !== 'touch') { hovered.current = true; dismissed.current = false; show(); } },
    onPointerLeave: event => { children.props.onPointerLeave?.(event); hovered.current = false; if (!focused.current) dismissed.current = false; hide(); },
    onFocus: event => { children.props.onFocus?.(event); focused.current = true; dismissed.current = false; show(true); },
    onBlur: event => { children.props.onBlur?.(event); focused.current = false; dismissed.current = false; hide(); },
    onClick: event => { children.props.onClick?.(event); dismissed.current = true; clearTimers(); setOpen(false); },
  })}{open && portalParent && createPortal(<div ref={bubble} id={id} role="tooltip" className={styles.bubble} style={{ left: position?.left ?? 8, top: position?.top ?? 8, visibility: position ? 'visible' : 'hidden' }} onPointerEnter={() => { hovered.current = true; clearTimeout(hideTimer.current); }} onPointerLeave={() => { hovered.current = false; hide(); }}>{content}</div>, portalParent)}</>;
}
