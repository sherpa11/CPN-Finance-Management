import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarRange,
  CalendarDays,
  Layers,
  Banknote,
  CalendarCheck,
  Bell,
  BookOpen,
  BarChart3,
  Settings,
  Gift,
  Landmark,
  Wallet,
  X,
} from 'lucide-react';
import api from '../api';

export default function Sidebar({ currentTab, onNavigate, onClose }) {
  const [counts, setCounts] = useState({ upcoming: 0, dueToday: 0, overdue: 0, totalActive: 0 });

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await api.get('/notifications/stats');
        if (res.data.success) {
          setCounts(res.data.stats);
        }
      } catch (err) {
        // silent
      }
    }
    loadStats();
    const interval = setInterval(loadStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'monthly-finance', label: 'Monthly Finance', icon: CalendarRange },
    { id: 'daily-finance', label: 'Daily Finance', icon: CalendarDays },
    { id: 'daily-collection', label: 'Daily Collection', icon: Layers },
    { id: 'collections', label: 'Collections', icon: Banknote },
    { id: 'irupu', label: 'இருப்பு (Cash in Hand)', icon: Wallet },
    { id: 'dues', label: 'Due Management', icon: CalendarCheck, badge: counts.dueToday > 0 ? `${counts.dueToday} Today` : null, badgeColor: 'bg-amber-500' },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: counts.totalActive > 0 ? counts.totalActive : null, badgeColor: 'bg-rose-500' },
    { id: 'ledgers', label: 'Customer Ledgers', icon: BookOpen },
    { id: 'moi-seer', label: 'மொய் / சீர்', icon: Gift },
    { id: 'chit-fund', label: 'சீட்டு / Chit Fund', icon: Landmark },
    { id: 'reports', label: 'Financial Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings & Audit', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col shrink-0 h-full min-h-[calc(100vh-4rem)]">
      {/* Mobile drawer header with close button */}
      {onClose && (
        <div className="md:hidden flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs">
              CR
            </div>
            <span className="font-bold text-xs text-amber-400 tracking-wider">NAVIGATION</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="p-3 sm:p-4 space-y-1 sm:space-y-1.5 flex-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                if (onClose) onClose();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 sm:px-3.5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all min-h-[42px] cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : item.highlight
                  ? 'text-amber-300 hover:bg-slate-800/80 hover:text-white border border-amber-500/20 bg-amber-500/5'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : item.highlight ? 'text-amber-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Business Footnote */}
      <div className="p-3 sm:p-4 border-t border-slate-800 text-[11px] text-slate-400 shrink-0">
        <p className="font-semibold text-slate-200">CPN Raja Finance Business</p>
        <p className="text-[10px] text-slate-500">Financial Engine v2.1 • Integer Precision</p>
      </div>
    </aside>
  );
}
