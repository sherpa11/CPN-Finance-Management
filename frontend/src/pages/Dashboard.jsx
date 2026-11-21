import React, { useState, useEffect } from 'react';
import {
  Users,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Percent,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { formatINR, formatDate, getFinanceBadge } from '../utils/formatters';
import api from '../api';

const CATEGORY_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6'];

export default function Dashboard({ onNavigate, onOpenCollection }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dueTab, setDueTab] = useState('today');

  useEffect(() => {
    async function loadDashboard() {
      try {
        const res = await api.get('/dashboard');
        if (res.data.success) {
          setData(res.data.data);
        }
      } catch (err) {
        console.error('Failed to load dashboard', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500 text-sm">
        Loading financial analytics...
      </div>
    );
  }

  const summary = data?.summary || {};
  const monthlyTrends = data?.monthlyTrends || [];
  const categoryDistribution = data?.categoryDistribution || [];
  const dueCustomers = data?.dueCustomers || { todayDue: [], overdue: [], upcoming: [], recentlySettled: [] };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 rounded-2xl p-4 sm:p-6 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2">
            <span>Welcome, CPN Raja</span>
            <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-normal">
              Live Ledger Active
            </span>
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Real-time tracking of principal disbursements, interest accruals, repayments, and due monitoring.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => onNavigate('new-finance')}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md shadow-amber-500/20 flex items-center justify-center space-x-1.5 cursor-pointer min-h-[40px]"
          >
            <span>+ New Finance / Loan</span>
          </button>
          <button
            onClick={() => onNavigate('collections')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-1.5 cursor-pointer min-h-[40px]"
          >
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* 8 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Total Customers */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Total Customers</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{summary.totalCustomers}</div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">Registered Borrowers</div>
        </div>

        {/* Card 2: Active Loans */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Active Loans</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 shrink-0">
              <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">{summary.activeLoans}</div>
          <div className="text-[10px] sm:text-[11px] text-amber-600 font-medium mt-0.5 truncate">Earning Interest</div>
        </div>

        {/* Card 3: Total Principal Lent */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Principal Lent</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl font-bold text-slate-900 font-mono truncate">
            {formatINR(summary.totalPrincipalLentRupees)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">Total Capital Disbursed</div>
        </div>

        {/* Card 4: Total Interest Accrued */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Accrued Interest</span>
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600 shrink-0">
              <Percent className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl font-bold text-purple-700 font-mono truncate">
            {formatINR(summary.totalInterestAccruedRupees)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">Total Earned Interest</div>
        </div>

        {/* Card 5: Principal Collected */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Principal Collected</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl font-bold text-emerald-600 font-mono truncate">
            {formatINR(summary.totalPrincipalCollectedRupees)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 truncate">Returned Capital</div>
        </div>

        {/* Card 6: Interest Collected */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Interest Collected</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl font-bold text-emerald-600 font-mono truncate">
            {formatINR(summary.totalInterestCollectedRupees)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-emerald-700 font-semibold mt-0.5 truncate">Realized Net Profit</div>
        </div>

        {/* Card 7: Outstanding Principal */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border-2 border-blue-100 shadow-sm hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-blue-900 truncate">Outstanding Principal</span>
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-800 shrink-0">
              <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl font-bold text-blue-900 font-mono truncate">
            {formatINR(summary.outstandingPrincipalRupees)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-blue-600 mt-0.5 truncate">Capital in Market</div>
        </div>

        {/* Card 8: Outstanding Interest */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border-2 border-amber-100 shadow-sm hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-900 truncate">Outstanding Interest</span>
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 shrink-0">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl font-bold text-amber-800 font-mono truncate">
            {formatINR(summary.outstandingInterestRupees)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-amber-700 font-medium mt-0.5 truncate">Uncollected Accruals</div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend Chart (2 cols) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">6-Month Lending & Collections Trend</h3>
              <p className="text-xs text-slate-500">Monthly breakdown of capital lent vs repayments received</p>
            </div>
          </div>
          {monthlyTrends.length === 0 || monthlyTrends.every((m) => m.lendingRupees === 0 && m.totalCollectedRupees === 0) ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs text-center border border-dashed border-slate-200 rounded-lg">
              <TrendingUp className="w-8 h-8 mb-2 opacity-30 text-slate-400" />
              <p className="font-semibold text-slate-600">No lending or collections recorded yet.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Disbursed loans and collected payments will automatically plot here across the 6-month timeline.</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrends}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `₹${val / 1000}k`} />
                  <Tooltip
                    formatter={(val) => [formatINR(val), '']}
                    labelStyle={{ fontWeight: 'bold' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="lendingRupees" name="Principal Lent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="principalCollectedRupees" name="Principal Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="interestCollectedRupees" name="Interest Collected" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Category Breakdown (1 col) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Finance Category Distribution</h3>
            <p className="text-xs text-slate-500 mb-4">Active loans by Monthly, Daily & Meater</p>
            {categoryDistribution.reduce((s, c) => s + c.totalPrincipalRupees, 0) === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-slate-400 text-xs text-center px-4 border border-dashed border-slate-200 rounded-lg">
                <Wallet className="w-7 h-7 mb-2 opacity-30 text-slate-400" />
                <p className="font-semibold text-slate-600">No active loans.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Category distribution will plot here once accounts are disbursed.</p>
              </div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryDistribution}
                      dataKey="totalPrincipalRupees"
                      nameKey="financeType"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                    >
                      {categoryDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => [formatINR(val), 'Capital']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100">
            {categoryDistribution.map((cat, idx) => (
              <div key={cat.vattiType || cat.financeType} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                  />
                  <span className="font-semibold text-slate-700">{cat.financeType || `${cat.vattiType} Finance`}</span>
                </div>
                <div className="text-right font-mono">
                  <span className="font-medium text-slate-900">{formatINR(cat.totalPrincipalRupees)}</span>
                  <span className="text-[10px] text-slate-400 ml-1.5">({cat.activeLoans} active)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Prominent Due Customers Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center space-x-2">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />
              <span>Due Customers Monitoring</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Automated evaluation based on Asia/Kolkata business calendar
            </p>
          </div>

          {/* Sub-tabs with horizontal scroll on mobile */}
          <div className="flex items-center space-x-1.5 bg-slate-200/70 p-1 rounded-lg text-xs font-semibold overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => setDueTab('today')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap min-h-[36px] ${
                dueTab === 'today' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today Due ({dueCustomers.todayDue.length})
            </button>
            <button
              onClick={() => setDueTab('overdue')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap min-h-[36px] ${
                dueTab === 'overdue' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Overdue ({dueCustomers.overdue.length})
            </button>
            <button
              onClick={() => setDueTab('upcoming')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap min-h-[36px] ${
                dueTab === 'upcoming' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upcoming ({dueCustomers.upcoming.length})
            </button>
            <button
              onClick={() => setDueTab('settled')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer whitespace-nowrap min-h-[36px] ${
                dueTab === 'settled' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Recently Settled
            </button>
          </div>
        </div>

        {/* Tab Content Table */}
        <div className="overflow-x-auto">
          {(() => {
            const list =
              dueTab === 'today'
                ? dueCustomers.todayDue
                : dueTab === 'overdue'
                ? dueCustomers.overdue
                : dueTab === 'upcoming'
                ? dueCustomers.upcoming
                : dueCustomers.recentlySettled;

            if (!list || list.length === 0) {
              return (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No accounts in this category currently.
                </div>
              );
            }

            return (
              <table className="w-full text-xs text-left min-w-[650px]">
                <thead className="bg-slate-100/75 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Customer</th>
                    <th className="py-2.5 px-3 font-semibold">Mobile</th>
                    <th className="py-2.5 px-3 font-semibold">Loan Code</th>
                    <th className="py-2.5 px-3 font-semibold">Finance Type</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Principal</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Outstanding</th>
                    <th className="py-2.5 px-3 font-semibold">Due Date</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((item) => {
                    const badge = getFinanceBadge(item.financeType || item.vattiType);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{item.customerName}</td>
                        <td className="py-3 px-3 font-mono text-slate-600">{item.customerMobile}</td>
                        <td className="py-3 px-3 font-mono text-blue-700 font-semibold">{item.loanId}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-medium text-slate-800">
                          {formatINR(item.principalRupees)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-rose-700">
                          {formatINR(item.totalOutstandingRupees)}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-medium text-slate-800">{formatDate(item.dueDate)}</span>
                          {dueTab === 'overdue' && (
                            <span className="ml-1 text-[10px] text-rose-600 font-bold block">
                              ({Math.abs(item.daysRemainingOrOverdue)} days overdue)
                            </span>
                          )}
                          {dueTab === 'today' && (
                            <span className="text-[10px] text-amber-600 font-bold block">Due Today</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => onOpenCollection ? onOpenCollection(item) : onNavigate('collections')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition-colors cursor-pointer shadow-xs"
                          >
                            Collect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
