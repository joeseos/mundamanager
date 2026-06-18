import React from 'react';

export const GANG_PAGE_VIEW_MODES = ['normal', '2-card', '3-card', '4-card'] as const;
export type GangPageViewMode = (typeof GANG_PAGE_VIEW_MODES)[number];

/** Gang page grid modes plus print-only mode for /gang/[id]/print */
export type GangViewMode = GangPageViewMode | 'print';

export const PRINT_GANG_VIEW_MODE = 'print' as const;

export function isGangViewMode(value: string | null): value is GangPageViewMode {
  return value !== null && (GANG_PAGE_VIEW_MODES as readonly string[]).includes(value);
}

export function isCompactGangViewMode(
  viewMode: GangViewMode
): viewMode is Exclude<GangPageViewMode, 'normal'> {
  return viewMode !== 'normal' && viewMode !== 'print';
}

export function isFullSizeGangViewMode(viewMode?: GangViewMode): boolean {
  return viewMode === undefined || viewMode === 'normal' || viewMode === 'print';
}

interface ViewModeDropdownProps {
  viewMode: GangPageViewMode;
  setViewMode: (mode: GangPageViewMode) => void;
  className?: string;
}

export const ViewModeDropdown: React.FC<ViewModeDropdownProps> = ({ viewMode, setViewMode, className = '' }) => (
  <div className={`${className} print:hidden`}>
    <select
      value={viewMode}
      onChange={(e) => setViewMode(e.target.value as GangPageViewMode)}
      className="w-full h-10 p-1 border rounded-md border-border focus:outline-hidden focus:ring-2 focus:ring-black text-sm"
    >
      <option value="normal">Page View</option>
      <option value="2-card">2-card View</option>
      <option value="3-card">3-card View</option>
      <option value="4-card">4-card View</option>
    </select>
  </div>
);
