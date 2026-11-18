import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import NewVatti from './pages/NewVatti';
import Collections from './pages/Collections';
import DueManagement from './pages/DueManagement';
import Notifications from './pages/Notifications';
import Ledger from './pages/Ledger';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { Menu, X } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [preselectedCustomerForLoan, setPreselectedCustomerForLoan] = useState(null);
  const [preselectedLoanForCollection, setPreselectedLoanForCollection] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-bold tracking-wider">CPN RAJA – VATTI SYSTEM</p>
          <p className="text-xs text-slate-400">Loading secure environment...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const navigateTo = (tab) => {
    setCurrentTab(tab);
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCollectionWithLoan = (loan) => {
    setPreselectedLoanForCollection(loan);
    setCurrentTab('collections');
  };

  const handleSelectCustomerForLoan = (customer) => {
    setPreselectedCustomerForLoan(customer);
    setCurrentTab('new-vatti');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar onNavigate={navigateTo} currentTab={currentTab} />

      {/* Mobile Menu Trigger */}
      <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between no-print">
        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
          {currentTab.replace('-', ' ')}
        </span>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-1.5 text-slate-300 hover:text-white rounded-md bg-slate-800"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:block no-print">
          <Sidebar currentTab={currentTab} onNavigate={navigateTo} />
        </div>

        {/* Mobile Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-slate-950/70 flex no-print">
            <div className="w-64 bg-slate-900 h-full overflow-y-auto">
              <Sidebar currentTab={currentTab} onNavigate={navigateTo} />
            </div>
            <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
          </div>
        )}

        {/* Main Content Workspace */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {currentTab === 'dashboard' && (
            <Dashboard
              onNavigate={navigateTo}
              onOpenCollection={handleOpenCollectionWithLoan}
            />
          )}

          {currentTab === 'customers' && (
            <Customers
              onNavigate={navigateTo}
              onSelectCustomerForLoan={handleSelectCustomerForLoan}
            />
          )}

          {currentTab === 'new-vatti' && (
            <NewVatti
              preselectedCustomer={preselectedCustomerForLoan}
              onNavigate={navigateTo}
            />
          )}

          {currentTab === 'collections' && (
            <Collections
              initialLoan={preselectedLoanForCollection}
            />
          )}

          {currentTab === 'dues' && (
            <DueManagement
              onNavigate={navigateTo}
              onOpenCollection={handleOpenCollectionWithLoan}
            />
          )}

          {currentTab === 'notifications' && (
            <Notifications
              onNavigate={navigateTo}
              onOpenCollection={handleOpenCollectionWithLoan}
            />
          )}

          {currentTab === 'ledgers' && <Ledger />}

          {currentTab === 'reports' && <Reports />}

          {currentTab === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
