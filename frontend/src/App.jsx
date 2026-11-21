import React, { useState, useEffect } from 'react';
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
import MoiSeer from './pages/MoiSeer';
import DailyCollection from './pages/DailyCollection';
import ChitFund from './pages/ChitFund';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [preselectedCustomerForLoan, setPreselectedCustomerForLoan] = useState(null);
  const [preselectedLoanForCollection, setPreselectedLoanForCollection] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Prevent background scrolling while mobile navigation drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-bold tracking-wider">CPN RAJA – FINANCE SYSTEM</p>
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
    setCurrentTab('new-finance');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Navbar with integrated Mobile Hamburger */}
      <Navbar
        onNavigate={navigateTo}
        currentTab={currentTab}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMobileMenuOpen={isMobileMenuOpen}
      />

      <div className="flex-1 flex min-w-0">
        {/* Desktop Sidebar */}
        <div className="hidden md:block no-print shrink-0">
          <Sidebar currentTab={currentTab} onNavigate={navigateTo} />
        </div>

        {/* Mobile Slide-in Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex no-print">
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            {/* Slide-in drawer container */}
            <div className="relative z-50 w-72 max-w-[85vw] bg-slate-900 h-full shadow-2xl flex flex-col">
              <Sidebar
                currentTab={currentTab}
                onNavigate={navigateTo}
                onClose={() => setIsMobileMenuOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Main Content Workspace */}
        <main className="flex-1 p-3 sm:p-5 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full min-w-0">
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

          {(currentTab === 'new-finance' || currentTab === 'new-vatti') && (
            <NewVatti
              preselectedCustomer={preselectedCustomerForLoan}
              onNavigate={navigateTo}
            />
          )}

          {currentTab === 'daily-collection' && (
            <DailyCollection
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

          {currentTab === 'moi-seer' && <MoiSeer />}

          {currentTab === 'chit-fund' && <ChitFund />}

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
