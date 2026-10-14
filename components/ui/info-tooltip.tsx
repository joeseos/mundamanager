'use client';

import { useId, type ReactNode } from 'react';
import { ImInfo } from 'react-icons/im';
import { Tooltip } from 'react-tooltip';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';

interface InfoTooltipProps {
  children: ReactNode;
  ariaLabel?: string;
}

export function InfoTooltip({ children, ariaLabel = 'More information' }: InfoTooltipProps) {
  const tooltipId = useId();
  const isCoarsePointer = useCoarsePointer();

  return (
    <>
      <button
        type="button"
        className="inline-flex shrink-0 cursor-help border-0 bg-transparent p-0 text-muted-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        aria-label={ariaLabel}
        data-tooltip-id={tooltipId}
      >
        <ImInfo />
      </button>
      <Tooltip
        id={tooltipId}
        place="top"
        className="bg-neutral-900! text-white! text-xs! z-[2000]!"
        delayHide={isCoarsePointer ? 100 : undefined}
        clickable={isCoarsePointer}
        openOnClick={isCoarsePointer}
        positionStrategy={isCoarsePointer ? 'fixed' : 'absolute'}
        style={{
          padding: '8px',
          maxWidth: 'min(18rem, 90vw)',
        }}
      >
        {children}
      </Tooltip>
    </>
  );
}
