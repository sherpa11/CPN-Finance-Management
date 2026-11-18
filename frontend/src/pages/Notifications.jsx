import React, { useState, useEffect } from 'react';
import {
  Bell,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  RefreshCw,
  Phone,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { formatINR, formatDate, getVattiBadge } from '../utils/formatters';
import api from '../api';

export default function Notifications({ onNavigate, onOpenCollection }) {
  const [notifications, setNotifications] = useState([]);
  const [category, setCategory] = useState('ALL');
  const [stats, setStats] = useState({ upcoming: 0, dueToday: 0, overdue: 0, completed: 0, totalActive: 0 });
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evalMessage, setEvalMessage] = useState('');

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const [notifsRes, statsRes] = await Promise.all([
        api.get('/notifications', { params: { category, limit: 100 } }),
        api.get('/notifications/stats'),
      ]);

      if (notifsRes.data.success) {
        setNotifications(notifsRes.data.notifications);
      }
      if (statsRes.data.success) {
        setStats(statsRes.data.stats);
      }
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [category]);

  const handleEvaluateNow = async () => {
    setEvaluating(true);
    setEvalMessage('');
    try {
      const res = await api.post('/notifications/evaluate');
      if (res.data.success) {
        setEvalMessage(res.data.message);
        fetchNotifications();
      }
    } catch (err) {
      setEvalMessage('Evaluation failed: ' + err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleAcknowledge = async (id) => {
    try {
      const res = await api.put(`/notifications/${id}/acknowledge`);
      if (res.data.success) {
        fetchNotifications();
      }
    } catch (err) {
      console.error('Failed to acknowledge', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Sync */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Bell className="w-5 h-5 text-amber-500" />
            <span>Dedicated Notifications Menu</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated backend due monitoring evaluated in Asia/Kolkata timezone with MongoDB persistence
          </p>
        </div>

        <button
          onClick={handleEvaluateNow}
          disabled={evaluating}
          className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
          <span>{evaluating ? 'Evaluating...' : 'Re-Evaluate Dues Now'}</span>
        </button>
      </div>

      {evalMessage && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{evalMessage}</span>
        </div>
      )}

      {/* Category Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setCategory('DUE_TODAY')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            category === 'DUE_TODAY'
              ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Due Today</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.dueToday}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">Maturity is today</p>
        </button>

        <button
          onClick={() => setCategory('OVERDUE')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            category === 'OVERDUE'
              ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/30'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Overdue</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-rose-700">{stats.overdue}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">Past due date</p>
        </button>

        <button
          onClick={() => setCategory('UPCOMING')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            category === 'UPCOMING'
              ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Upcoming</span>
            <Calendar className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-blue-900">{stats.upcoming}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">Due in reminder window</p>
        </button>

        <button
          onClick={() => setCategory('COMPLETED')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            category === 'COMPLETED'
              ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Completed</span>
            <CheckCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">{stats.completed}</div>
          <p className="text-[11px] text-slate-500 mt-0.5">Fully settled accounts</p>
        </button>
      </div>

      {/* Filter Reset */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">
          Showing {category === 'ALL' ? 'All Active' : category} notifications ({notifications.length} items)
        </span>
        {category !== 'ALL' && (
          <button
            onClick={() => setCategory('ALL')}
            className="text-blue-600 hover:underline font-semibold cursor-pointer"
          >
            Show All Categories
          </button>
        )}
      </div>

      {/* Notification Cards List */}
      {loading ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
          Loading notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
          No notifications in this category. All accounts are up-to-date!
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => {
            const vattiBadge = getVattiBadge(notif.vattiType);
            const isOverdue = notif.category === 'OVERDUE';
            const isDueToday = notif.category === 'DUE_TODAY';
            const isCompleted = notif.category === 'COMPLETED';

            return (
              <div
                key={notif.id}
                className={`bg-white p-5 rounded-xl border shadow-sm transition-all hover:shadow-md ${
                  isOverdue
                    ? 'border-rose-300 bg-rose-50/20'
                    : isDueToday
                    ? 'border-amber-300 bg-amber-50/20'
                    : isCompleted
                    ? 'border-emerald-200 bg-emerald-50/10'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  {/* Left Column: Customer & Loan details */}
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-base font-bold text-slate-950">{notif.customerName}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${vattiBadge.bg}`}>
                        {vattiBadge.label}
                      </span>
                      <span className="font-mono text-xs font-semibold text-blue-700">{notif.loanCode}</span>
                    </div>

                    <div className="flex items-center space-x-4 text-xs text-slate-600">
                      <a
                        href={`tel:${notif.mobileNumber}`}
                        className="flex items-center space-x-1 text-slate-700 hover:text-blue-600 font-mono font-medium"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{notif.mobileNumber}</span>
                      </a>
                      <span>•</span>
                      <span>Maturity Due Date: <strong className="text-slate-900">{formatDate(notif.dueDate)}</strong></span>
                      <span>•</span>
                      <span className={isOverdue ? 'text-rose-700 font-bold' : isDueToday ? 'text-amber-700 font-bold' : 'text-blue-700 font-medium'}>
                        {isOverdue
                          ? `${Math.abs(notif.daysRemainingOrOverdue)} days overdue`
                          : isDueToday
                          ? 'DUE TODAY'
                          : isCompleted
                          ? 'Settled'
                          : `${notif.daysRemainingOrOverdue} days remaining`}
                      </span>
                    </div>
                  </div>

                  {/* Middle Column: Financial Balances */}
                  <div className="grid grid-cols-3 gap-3 font-mono text-xs text-right bg-slate-50 md:bg-transparent p-3 md:p-0 rounded-lg">
                    <div>
                      <p className="text-[10px] text-slate-500 font-sans">Principal Lent</p>
                      <p className="font-bold text-slate-800">{formatINR(notif.principalRupees)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-sans">Accrued Vatti</p>
                      <p className="font-bold text-purple-700">{formatINR(notif.accruedInterestRupees)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-sans">Total Outstanding</p>
                      <p className={`font-bold text-sm ${isCompleted ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatINR(notif.totalOutstandingRupees)}
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex items-center justify-end space-x-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                    {notif.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleAcknowledge(notif.id)}
                        className="px-2.5 py-1.5 border border-slate-300 hover:bg-slate-100 rounded text-xs font-semibold text-slate-700 flex items-center space-x-1 cursor-pointer"
                        title="Mark Acknowledged"
                      >
                        <Check className="w-3.5 h-3.5 text-slate-500" />
                        <span>Acknowledge</span>
                      </button>
                    )}

                    {!isCompleted && (
                      <button
                        onClick={() => {
                          if (onOpenCollection) {
                            onOpenCollection({ id: notif.loanId, customerName: notif.customerName, loanId: notif.loanCode });
                          } else {
                            onNavigate('collections');
                          }
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center space-x-1"
                      >
                        <span>Collect Payment</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WhatsApp Future Notice */}
      <div className="p-4 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
        <div>
          <span className="font-bold text-slate-800">Future Integration Architecture: </span>
          <span>
            Notification engine includes prepared hooks for WhatsApp Business API integration in the upcoming phase without requiring architectural redesign.
          </span>
        </div>
        <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-700 font-mono">
          Phase 2 Ready
        </span>
      </div>
    </div>
  );
}
