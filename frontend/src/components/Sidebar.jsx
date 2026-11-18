import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  PlusCircle,
  Banknote,
  CalendarCheck,
  Bell,
  BookOpen,
  BarChart3,
  Settings,
} from 'lucide-react';
import api from '../api';

export default function Sidebar({ currentTab, onNavigate }) {
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
    { id: 'new-vatti', label: 'New Vatti / Loan', icon: PlusCircle, highlight: true },
    { id: 'collections', label: 'Collections', icon: Banknote },
    { id: 'dues', label: 'Due Management', icon: CalendarCheck, badge: counts.dueToday > 0 ? `${counts.dueToday} Today` : null, badgeColor: 'bg-amber-500' },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: counts.totalActive > 0 ? counts.totalActive : null, badgeColor: 'bg-rose-500' },
    { id: 'ledgers', label: 'Customer Ledgers', icon: BookOpen },
    { id: 'reports', label: 'Financial Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings & Audit', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col shrink-0 min-h-[calc(100vh-4rem)]">
      <div className="p-4 space-y-1.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : item.highlight
                  ? 'text-amber-300 hover:bg-slate-800/80 hover:text-white border border-amber-500/20 bg-amber-500/5'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.highlight ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Business Footnote */}
      <div className="p-4 border-t border-slate-800 text-[11px] text-slate-300">
        <p className="font-semibold text-slate-100">CPN Raja Vatti Business</p>
        <p className="text-[10px]">Financial Engine v1.0 • Integer Precision</p>
      </div>
    </aside>
  );
}
