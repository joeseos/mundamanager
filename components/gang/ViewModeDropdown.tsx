import React from 'react';

type ViewMode = 'normal' | 'small' | 'medium' | 'large';

interface ViewModeDropdownProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  className?: string;
}

export const ViewModeDropdown: React.FC<ViewModeDropdownProps> = ({
  viewMode,
  setViewMode,
  className = '',
}) => (
  <div className={`${className} print:hidden`}>
    <select
      value={viewMode}
      onChange={(e) => setViewMode(e.target.value as ViewMode)}
      className="w-full h-10 p-1 border rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-black text-sm"
    >
      <option value="normal">Page View</option>
      <option value="small">Small Cards</option>
      <option value="medium">Medium Cards</option>
      <option value="large">Large Cards</option>
    </select>
  </div>
);
