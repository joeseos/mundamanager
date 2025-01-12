'use client';

import React, { useState } from 'react';

interface TabsProps {
  children: React.ReactNode[];
  tabTitles?: string[];
}

const Tabs = ({ children, tabTitles }: TabsProps) => {
  const [activeTab, setActiveTab] = useState(0);

  const defaultTabTitles = ['Details', 'Stash', 'Notes'];
  
  const titles = tabTitles || defaultTabTitles;

  return (
    <div className="w-full">
      <div className="bg-white rounded-lg mb-4 flex">
        {titles.map((title, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === index 
                ? 'text-black font-medium' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {title}
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