'use client';

import type { ReactNode } from 'react';

type TooltipRenderArgs = {
  content: ReactNode;
  activeAnchor: Element | null;
};

export function getTooltipAttribute(activeAnchor: Element | null, name: string) {
  return activeAnchor?.getAttribute(name)?.trim() ?? '';
}

export function renderDescriptionTooltip({ content, activeAnchor }: TooltipRenderArgs) {
  const title = getTooltipAttribute(activeAnchor, 'data-tooltip-title');
  const description = getTooltipAttribute(activeAnchor, 'data-tooltip-description');
  const body = description || content;

  if (!title && !body) return null;

  return (
    <div>
      {title && (
        <div className="mb-1.5 text-sm font-semibold">
          {title}
        </div>
      )}
      {body && (
        <div className="whitespace-pre-wrap">
          {body}
        </div>
      )}
    </div>
  );
}
