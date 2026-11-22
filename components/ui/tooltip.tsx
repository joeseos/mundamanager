'use client';

import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { Tooltip as ReactTooltip, type ITooltip, type TooltipRefProps } from 'react-tooltip';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';

type TooltipProps = Omit<ITooltip, 'id' | 'afterShow' | 'afterHide'> & {
  id: string;
  ref?: Ref<TooltipRefProps>;
};

/**
 * react-tooltip for the whole app. On touch screens an open tooltip closes on
 * a tap anywhere outside it and its anchors: iOS Safari sends no mouseout or
 * click for taps on plain page content, so react-tooltip's own closing never
 * fires there.
 */
export function Tooltip({ ref, id, ...props }: TooltipProps) {
  const isCoarsePointer = useCoarsePointer();
  const tooltipRef = useRef<TooltipRefProps | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const handleShow = useCallback(() => setIsOpen(true), []);
  const handleHide = useCallback(() => setIsOpen(false), []);

  const setRefs = useCallback((node: TooltipRefProps | null) => {
    tooltipRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  useEffect(() => {
    if (!isCoarsePointer || !isOpen) return;
    // pointerup, not pointerdown: a touch that turns into a scroll ends in pointercancel.
    const closeOnTapOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(`[data-tooltip-id="${CSS.escape(id)}"]`)) return;
      if (target.closest('.react-tooltip')?.id === id) return;
      tooltipRef.current?.close();
    };
    document.addEventListener('pointerup', closeOnTapOutside, true);
    return () => document.removeEventListener('pointerup', closeOnTapOutside, true);
  }, [isCoarsePointer, isOpen, id]);

  return (
    <ReactTooltip
      {...props}
      ref={setRefs}
      id={id}
      afterShow={handleShow}
      afterHide={handleHide}
    />
  );
}
