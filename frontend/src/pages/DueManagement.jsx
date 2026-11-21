import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  Search,
  Filter,
  ArrowUpDown,
  Clock,
  AlertCircle,
  Calendar,
  Phone,
  Banknote,
} from 'lucide-react';
import { formatINR, formatDate, getFinanceBadge } from '../utils/formatters';
import api from '../api';

export default function DueManagement({ onNavigate, onOpenCollection }) {
  const [dues, setDues] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('dueDate');
  const [sortOrder, setSortOrder] = useState('asc');
  const [vattiType, setVattiType] = useState('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchDues = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dues', {
        params: {
          filter,
          search,
          sortBy,
          sortOrder,
          vattiType,
          customStartDate: filter === 'CUSTOM' ? customStartDate : undefined,
          customEndDate: filter === 'CUSTOM' ? customEndDate : undefined,
          limit: 100,
        },
      });

      if (res.data.success) {
        setDues(res.data.dues);
        setTotal(res.data.total);
      }
    } catch (err) {
      console.error('Failed to load dues', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDues();
  }, [filter, sortBy, sortOrder, vattiType]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDues();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <CalendarCheck className="w-5 h-5 text-amber-500" />
            <span>Due Management & Maturity Schedule</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Filter and sort accounts by maturity date, outstanding amount, and Finance scheme
          </p>
        </div>

        <div className="text-xs font-mono bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700">
          Showing <span className="font-bold text-slate-900">{total}</span> Due Accounts
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {[
          { id: 'ALL', label: 'All Active Dues' },
          { id: 'TODAY', label: 'Due Today' },
          { id: 'TOMORROW', label: 'Due Tomorrow' },
          { id: 'NEXT_7_DAYS', label: 'Next 7 Days' },
          { id: 'OVERDUE', label: 'Overdue Only' },
          { id: 'COMPLETED', label: 'Completed' },
          { id: 'CUSTOM', label: 'Custom Range' },
        ].map((chip) => (
          <button
            key={chip.id}
            onClick={() => setFilter(chip.id)}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              filter === chip.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Custom Date Pickers if CUSTOM selected */}
      {filter === 'CUSTOM' && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          <span>From:</span>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => setCustomStartDate(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded"
          />
          <span>To:</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded"
          />
          <button
            onClick={fetchDues}
            className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-500 cursor-pointer min-h-[36px]"
          >
            Apply Range
          </button>
        </div>
      )}

      {/* Search & Sort Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <form onSubmit={handleSearchSubmit} className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search customer name, mobile, or loan ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>

        <select
          value={vattiType}
          onChange={(e) => setVattiType(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-semibold"
        >
          <option value="ALL">All Finance Types</option>
          <option value="MONTHLY">Monthly Finance</option>
          <option value="DAILY">Daily Finance</option>
          <option value="MEATER">Meater Finance</option>
        </select>

        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [b, o] = e.target.value.split('-');
            setSortBy(b);
            setSortOrder(o);
          }}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-semibold"
        >
          <option value="dueDate-asc">Due Date (Earliest First)</option>
          <option value="dueDate-desc">Due Date (Latest First)</option>
          <option value="outstandingAmount-desc">Outstanding Amount (Highest)</option>
          <option value="outstandingAmount-asc">Outstanding Amount (Lowest)</option>
          <option value="customerName-asc">Customer Name (A-Z)</option>
        </select>
      </div>

      {/* Dues List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading due accounts...</div>
        ) : dues.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No due accounts match the specified filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[700px]">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-3 font-semibold">Mobile</th>
                  <th className="py-3 px-3 font-semibold">Loan Code</th>
                  <th className="py-3 px-3 font-semibold">Finance Type</th>
                  <th className="py-3 px-3 font-semibold">Rate</th>
                  <th className="py-3 px-3 font-semibold text-right">Principal</th>
                  <th className="py-3 px-3 font-semibold text-right">Outstanding</th>
                  <th className="py-3 px-3 font-semibold">Maturity Date</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dues.map((d) => {
                  const badge = getFinanceBadge(d.financeType || d.vattiType);
                  const isOverdue = d.dueStatus === 'OVERDUE';
                  const isToday = d.dueStatus === 'DUE_TODAY';

                  return (
                    <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{d.customerName}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        <a href={`tel:${d.customerMobile}`} className="hover:text-blue-600">
                          {d.customerMobile}
                        </a>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-blue-700">{d.loanId}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-medium text-slate-700">{d.interestRatePercent}%</td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-900">
                        {formatINR(d.principalRupees)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-700">
                        {formatINR(d.totalOutstandingRupees)}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900">{formatDate(d.dueDate)}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isOverdue
                              ? 'bg-rose-100 text-rose-800'
                              : isToday
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {isOverdue
                            ? `${Math.abs(d.daysRemainingOrOverdue)}d Overdue`
                            : isToday
                            ? 'Due Today'
                            : `${d.daysRemainingOrOverdue}d Left`}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            if (onOpenCollection) {
                              onOpenCollection(d);
                            } else {
                              onNavigate('collections');
                            }
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[11px] transition-colors cursor-pointer"
                        >
                          Collect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
