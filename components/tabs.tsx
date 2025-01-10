'use client';

import React, { useState } from 'react';

interface TabsProps {
  children: React.ReactNode[];
}

const Tabs = ({ children }: TabsProps) => {
  const [activeTab, setActiveTab] = useState(0);

  const tabsData = [
    { title: 'Details' },
    { title: 'Inventory' },
    { title: 'Fighters' },
    { title: 'History' },
  ];

  return (
    <div className="w-full">
      <div className="bg-white rounded-lg mb-4 flex">
        {tabsData.map((tab, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`flex-1 py-4 text-center transition-colors ${
              activeTab === index 
                ? 'text-black font-medium' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>

      {children[activeTab] || (
        <div className="p-4">
          <h2 className="text-xl font-bold mb-2">{tabsData[activeTab].title}</h2>
        </div>
      )}
    </div>
  );
};

export default Tabs; 