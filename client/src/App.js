import React, { useState } from 'react';
import './App.css';
import TabBar from './components/TabBar';
import CashierScreen from './screens/CashierScreen';
import ReportsScreen from './screens/ReportsScreen';
import ItemsScreen from './screens/ItemsScreen';

function App() {
  const [activeTab, setActiveTab] = useState('cashier');

  return (
    <div className="App">
      <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
        {activeTab === 'cashier' && <CashierScreen />}
        {activeTab === 'items' && <ItemsScreen />}
        {activeTab === 'reports' && <ReportsScreen />}
      </main>
    </div>
  );
}

export default App;

