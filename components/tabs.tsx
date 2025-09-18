'use client';

import React, { useState, useEffect } from 'react';

interface TabsProps {
  children: React.ReactNode[];
  tabTitles?: string[];
  tabIcons?: React.ReactNode[]; // Accept icons for each tab
  onTabChange?: (tabIndex: number) => void; // Callback for tab changes
}

const Tabs = ({ children, tabTitles, tabIcons, onTabChange }: TabsProps) => {
  const [activeTab, setActiveTab] = useState(0);

  const defaultTabTitles = ['Gang', 'Stash', 'Notes'];
  const titles = tabTitles || defaultTabTitles;
  
  // Call onTabChange whenever activeTab changes
  useEffect(() => {
    if (onTabChange) {
      onTabChange(activeTab);
    }
  }, [activeTab, onTabChange]);

  // Handle tab click with callback
  const handleTabClick = (index: number) => {
    setActiveTab(index);
  };

  return (
    <div className="w-full">
      <div className="bg-card rounded-lg mb-4 flex print:hidden">
        {titles.map((title, index) => (
          <button
            key={index}
            onClick={() => handleTabClick(index)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === index
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-muted-foreground'
            } flex items-center justify-center`}
          >
            {tabIcons && tabIcons[index]} {/* Render the icon */}
            <span className="ml-2 hidden sm:inline">{title}</span> {/* Text visible only on small screens and larger */}
          </button>
        ))}
      </div>

      {children[activeTab] || (
        <div className="p-4">
          <h2 className="text-xl font-bold mb-2">{titles[activeTab]}</h2>
        </div>
      )}
    </div>
  );
};

export default Tabs;
