'use client';

import React, { useState } from 'react';

interface TabsProps {
  children: React.ReactNode[];
  tabTitles?: string[];
  tabIcons?: React.ReactNode[]; // Accept icons for each tab
}

const Tabs = ({ children, tabTitles, tabIcons }: TabsProps) => {
  const [activeTab, setActiveTab] = useState(0);

  const defaultTabTitles = ['Gang', 'Stash', 'Notes'];
  const titles = tabTitles || defaultTabTitles;

  return (
    <div className="w-full">
      <div className="bg-white rounded-lg mb-4 flex print:hidden">
        {titles.map((title, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === index
                ? 'text-black font-medium'
                : 'text-gray-500 hover:text-gray-700'
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
