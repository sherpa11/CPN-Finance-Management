import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, Shield, Clock, Menu, X } from 'lucide-react';
import api from '../api';

export default function Navbar({ onNavigate, currentTab, onToggleMobileMenu, isMobileMenuOpen }) {
  const { user, logout } = useAuth();
  const [currentTime, setCurrentTime] = useState('');
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await api.get('/notifications/stats');
        if (res.data.success) {
          setNotifCount(res.data.stats.totalActive || 0);
        }
      } catch (err) {
        // silent
      }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        {/* Left: Mobile Hamburger + Brand Logo */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          {/* Hamburger toggle button for mobile/tablet drawer */}
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5 text-amber-400" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Brand */}
          <div
            className="flex items-center space-x-2 sm:space-x-3 cursor-pointer min-w-0 select-none"
            onClick={() => onNavigate('dashboard')}
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center font-black text-slate-950 text-base sm:text-xl shadow-inner shrink-0">
              CR
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-black tracking-wider uppercase text-amber-400 leading-tight truncate">
                CPN RAJA
              </h1>
              <p className="text-[9px] sm:text-[11px] text-slate-300 tracking-wider font-medium truncate hidden xs:block">
                FINANCE MANAGEMENT SYSTEM
              </p>
            </div>
          </div>
        </div>

        {/* Center Clock (Asia/Kolkata business date) */}
        <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700 shrink-0">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>Asia/Kolkata:</span>
          <span className="font-mono text-white font-semibold">{currentTime}</span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-1.5 sm:space-x-4 shrink-0">
          {/* Notifications Quick Link */}
          <button
            onClick={() => onNavigate('notifications')}
            className={`relative p-2 rounded-lg transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center ${
              currentTab === 'notifications'
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Notifications"
            aria-label="View notifications"
          >
            <Bell className="w-5 h-5" />
            {notifCount > 0 && (
              <span className="absolute 1 top-1 right-1 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-slate-900 animate-pulse">
                {notifCount > 99 ? '99+' : notifCount}
              </span>
            )}
          </button>

          {/* User Profile */}
          <div className="flex items-center space-x-2 sm:space-x-3 pl-2 sm:pl-3 border-l border-slate-700">
            <div className="hidden md:block text-right">
              <div className="text-xs font-semibold text-white flex items-center justify-end space-x-1">
                <span>{user?.fullName || 'CPN Raja'}</span>
                <Shield className="w-3 h-3 text-amber-400" />
              </div>
              <div className="text-[10px] text-slate-400 capitalize">{user?.role || 'Administrator'}</div>
            </div>

            <button
              onClick={logout}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
