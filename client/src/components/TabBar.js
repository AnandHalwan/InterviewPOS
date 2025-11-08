import React from 'react';
import './TabBar.css';

const TabBar = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'cashier', label: 'Cashier' },
    { id: 'items', label: 'Items' },
    { id: 'reports', label: 'Reports' }
  ];

  return (
    <nav className="tab-bar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
};

export default TabBar;

