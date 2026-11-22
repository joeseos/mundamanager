'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Tooltip as ReactTooltip, type ITooltip, type TooltipRefProps } from 'react-tooltip';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';

type TooltipProps = Omit<ITooltip, 'id' | 'afterShow' | 'afterHide'> & { id: string };

/**
 * react-tooltip for the whole app. On touch screens an open tooltip closes on
 * a tap anywhere but its anchors (taps inside a `clickable` one excepted) and
 * on a scroll outside it: iOS Safari sends no mouseout or click for taps on
 * plain page content, so react-tooltip's own closing never fires there.
 */
export function Tooltip({ id, clickable, ...props }: TooltipProps) {
  const isCoarsePointer = useCoarsePointer();
  const tooltipRef = useRef<TooltipRefProps>(null);
  const [isOpen, setIsOpen] = useState(false);
  const handleShow = useCallback(() => setIsOpen(true), []);
  const handleHide = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isCoarsePointer || !isOpen) return;
    const closeOnTap = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(`[data-tooltip-id="${CSS.escape(id)}"]`)) return;
      if (clickable && target.closest('.react-tooltip')?.id === id) return;
      tooltipRef.current?.close();
    };
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.react-tooltip')?.id === id) return;
      tooltipRef.current?.close();
    };
    document.addEventListener('pointerup', closeOnTap, true);
    document.addEventListener('scroll', closeOnScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerup', closeOnTap, true);
      document.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [isCoarsePointer, isOpen, id, clickable]);

  return (
    <ReactTooltip
      {...props}
      ref={tooltipRef}
      id={id}
      clickable={isCoarsePointer || clickable}
      afterShow={handleShow}
      afterHide={handleHide}
    />
  );
}
