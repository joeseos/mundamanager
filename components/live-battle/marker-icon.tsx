'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { BsTriangle } from 'react-icons/bs';
import { cn } from '@/app/lib/utils';

function isIconComponent(value: IconType | ReactNode): value is IconType {
  return typeof value === 'function';
}

export interface MarkerIconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  shape: IconType;
  symbol: IconType | ReactNode;
  secondary?: IconType;
  /** Centred on the shape, not the inner symbol — e.g. Out of Ammo slash. */
  overlay?: IconType;
  symbolClassName?: string;
  secondaryClassName?: string;
}

/**
 * Outlined shape with a centred inner symbol and an optional bottom-right
 * secondary. Overall size follows the parent's font-size or className.
 */
export function MarkerIcon({
  shape: Shape,
  symbol,
  secondary: Secondary,
  overlay: Overlay,
  className,
  symbolClassName,
  secondaryClassName,
  title,
  ...rest
}: MarkerIconProps) {
  const isTriangle = Shape === BsTriangle;
  let innerSymbol: ReactNode;
  if (isIconComponent(symbol)) {
    const SymbolIcon = symbol;
    innerSymbol = <SymbolIcon className="size-full" />;
  } else {
    innerSymbol = (
      <span className="flex size-full items-center justify-center [&>span]:relative [&>span]:inline-flex [&>span]:size-full [&>span]:items-center [&>span]:justify-center [&>svg]:size-full">
        {symbol}
      </span>
    );
  }

  return (
    <span
      className={cn('relative inline-flex size-[1em] shrink-0 items-center justify-center', className)}
      title={title}
      {...rest}
    >
      <Shape aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      <span
        className={cn(
          'pointer-events-none absolute left-1/2 flex size-[65%] -translate-x-1/2 -translate-y-1/2 items-center justify-center',
          isTriangle ? 'top-[60%]' : 'top-1/2',
          symbolClassName
        )}
      >
        {innerSymbol}
      </span>
      {Overlay ? (
        <Overlay
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[100%] -translate-x-1/2 -translate-y-1/2"
        />
      ) : null}
      {Secondary ? (
        <Secondary
          aria-hidden
          className={cn(
            'pointer-events-none absolute bottom-[10%] right-[8%] size-[34%]',
            secondaryClassName
          )}
        />
      ) : null}
    </span>
  );
}
