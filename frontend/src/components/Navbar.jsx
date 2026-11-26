import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Bell, LogOut, Shield, Clock, Menu, X, Globe, Check, ChevronDown } from 'lucide-react';
import api from '../api';

export default function Navbar({ onNavigate, currentTab, onToggleMobileMenu, isMobileMenuOpen }) {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [currentTime, setCurrentTime] = useState('');
  const [notifCount, setNotifCount] = useState(0);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const langMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target)) {
        setIsLangMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
              <p className="text-[9px] sm:text-[11px] text-slate-300 tracking-wider font-medium truncate hidden sm:block">
                {language === 'ta' ? 'நிதி மேலாண்மை அமைப்பு' : 'FINANCE MANAGEMENT SYSTEM'}
              </p>
            </div>
          </div>
        </div>

        {/* Center Clock (Asia/Kolkata business date) */}
        <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700 shrink-0">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('nav.asiaKolkata', 'Asia/Kolkata:')}</span>
          <span className="font-mono text-white font-semibold">{currentTime}</span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-1 sm:space-x-3 shrink-0">
          {/* Notifications Quick Link */}
          <button
            onClick={() => onNavigate('notifications')}
            className={`relative p-2 rounded-lg transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center ${
              currentTab === 'notifications'
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title={t('nav.notifications', 'Notifications')}
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
          <div className="flex items-center space-x-1.5 sm:space-x-2.5 pl-1.5 sm:pl-2.5 border-l border-slate-700">
            <div className="hidden md:block text-right">
              <div className="text-xs font-semibold text-white flex items-center justify-end space-x-1">
                <span>{user?.fullName || 'CPN Raja'}</span>
                <Shield className="w-3 h-3 text-amber-400" />
              </div>
              <div className="text-[10px] text-slate-400 capitalize">{t('nav.admin', user?.role || 'Administrator')}</div>
            </div>

            <button
              onClick={logout}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center"
              title={t('nav.logout', 'Logout')}
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {/* Language Selector Dropdown (Marked Top-Right Area) */}
          <div className="relative pl-1 sm:pl-2 border-l border-slate-700" ref={langMenuRef}>
            <button
              onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
              className="flex items-center space-x-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-amber-300 border border-slate-700 hover:border-amber-500/40 transition-all text-xs font-semibold cursor-pointer shadow-xs min-h-[36px]"
              title={language === 'en' ? 'Switch language to தமிழ்' : 'Switch language to English'}
              aria-label="Language selector"
              aria-expanded={isLangMenuOpen}
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
              <span className="font-bold text-xs tracking-wide">
                {language === 'ta' ? 'தமிழ்' : 'English'}
              </span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isLangMenuOpen ? 'rotate-180 text-amber-400' : ''}`} />
            </button>

            {isLangMenuOpen && (
              <div className="absolute right-0 mt-2 w-36 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-700/60 mb-1">
                  {t('nav.language', 'Language')}
                </div>
                <button
                  onClick={() => {
                    setLanguage('en');
                    setIsLangMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer ${
                    language === 'en'
                      ? 'bg-amber-500/20 text-amber-300 font-bold'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${language === 'en' ? 'bg-amber-400' : 'bg-slate-500'}`} />
                    <span>English</span>
                  </span>
                  {language === 'en' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </button>
                <button
                  onClick={() => {
                    setLanguage('ta');
                    setIsLangMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer ${
                    language === 'ta'
                      ? 'bg-amber-500/20 text-amber-300 font-bold'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${language === 'ta' ? 'bg-amber-400' : 'bg-slate-500'}`} />
                    <span className="font-bold">தமிழ்</span>
                  </span>
                  {language === 'ta' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
