import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import PageSkeleton from './components/PageSkeleton';
import Login from './pages/Login';

// Lazy-loaded page components for instant initial bundle loading and code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Customers = lazy(() => import('./pages/Customers'));
const NewVatti = lazy(() => import('./pages/NewVatti'));
const Collections = lazy(() => import('./pages/Collections'));
const DueManagement = lazy(() => import('./pages/DueManagement'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Ledger = lazy(() => import('./pages/Ledger'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const MoiSeer = lazy(() => import('./pages/MoiSeer'));
const DailyCollection = lazy(() => import('./pages/DailyCollection'));
const ChitFund = lazy(() => import('./pages/ChitFund'));

// Helper to resolve route tab from URL pathname
function getTabFromPath() {
  const path = window.location.pathname.replace(/^\//, '').toLowerCase();
  const validTabs = [
    'dashboard',
    'customers',
    'new-finance',
    'new-vatti',
    'daily-collection',
    'collections',
    'dues',
    'notifications',
    'ledgers',
    'reports',
    'settings',
    'moi-seer',
    'chit-fund',
  ];
  if (path === '' || path === 'login') return 'dashboard';
  if (validTabs.includes(path)) {
    return path === 'new-vatti' ? 'new-finance' : path;
  }
  return 'dashboard';
}

function AppContent() {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState(getTabFromPath);
  const [preselectedCustomerForLoan, setPreselectedCustomerForLoan] = useState(null);
  const [preselectedLoanForCollection, setPreselectedLoanForCollection] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Synchronize browser history and support Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentTab(getTabFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
    const targetPath = tab === 'dashboard' ? '/' : `/${tab}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ tab }, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCollectionWithLoan = (loan) => {
    setPreselectedLoanForCollection(loan);
    navigateTo('collections');
  };

  const handleSelectCustomerForLoan = (customer) => {
    setPreselectedCustomerForLoan(customer);
    navigateTo('new-finance');
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
          <ErrorBoundary
            key={currentTab}
            title={`Error in ${currentTab.replace('-', ' ')}`}
            onNavigateHome={() => navigateTo('dashboard')}
          >
            <Suspense fallback={<PageSkeleton />}>
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
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary title="Application Error">
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
