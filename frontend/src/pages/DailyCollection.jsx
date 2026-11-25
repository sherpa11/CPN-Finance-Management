import React, { useState, useEffect } from 'react';
import {
  Layers,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  Calendar,
  CalendarDays,
  DollarSign,
  User,
  Phone,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Printer,
  ChevronRight,
  Sparkles,
  XCircle,
  Check,
  CreditCard,
  AlertTriangle,
  Coins,
} from 'lucide-react';
import { formatINR, formatDate, formatDateTime, getStatusBadge } from '../utils/formatters';
import api from '../api';

export default function DailyCollection({ onNavigate }) {
  const [activeView, setActiveView] = useState('accounts'); // 'accounts', 'tracker', 'today-sheet'
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Accounts list states
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Selected account for visual tracker
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedAccountData, setSelectedAccountData] = useState(null);
  const [loadingTracker, setLoadingTracker] = useState(false);

  // Day Payment Modal
  const [activeDayModal, setActiveDayModal] = useState(null); // day schedule object
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentRemarks, setPaymentRemarks] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [dayActionType, setDayActionType] = useState('PAID'); // 'PAID', 'PARTIAL', 'MISSED'

  // Reversal Modal
  const [reversalTarget, setReversalTarget] = useState(null);
  const [reversalReason, setReversalReason] = useState('');
  const [submittingReversal, setSubmittingReversal] = useState(false);

  // Today Sheet state
  const [sheetDate, setSheetDate] = useState(new Date().toISOString().split('T')[0]);
  const [sheetData, setSheetData] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(false);

  // Success / Error Alerts
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // Load KPI summary
  const loadSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await api.get('/daily-collections/summary');
      if (res.data.success) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Failed to load Daily Collection summary', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Load Accounts
  const loadAccounts = async (searchTerm = debouncedSearch) => {
    setLoadingAccounts(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '100');

      const res = await api.get(`/daily-collections?${params.toString()}`);
      if (res.data.success) {
        setAccounts(res.data.accounts);
        if (!selectedAccountId && res.data.accounts.length > 0) {
          setSelectedAccountId(res.data.accounts[0]._id);
        }
      }
    } catch (err) {
      console.error('Failed to load accounts', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Load Full Account Tracker Details
  const loadAccountTracker = async (accId) => {
    if (!accId) return;
    setLoadingTracker(true);
    try {
      const res = await api.get(`/daily-collections/${accId}`);
      if (res.data.success) {
        setSelectedAccountData(res.data.account);
      }
    } catch (err) {
      console.error('Failed to load account tracker', err);
    } finally {
      setLoadingTracker(false);
    }
  };

  // Load Today Collection Sheet
  const loadSheet = async (date) => {
    setLoadingSheet(true);
    try {
      const res = await api.get(`/daily-collections/reports?reportType=collection-sheet&date=${date}`);
      if (res.data.success) {
        setSheetData(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load collection sheet', err);
    } finally {
      setLoadingSheet(false);
    }
  };

  useEffect(() => {
    loadSummary();
    loadAccounts(debouncedSearch);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (selectedAccountId && activeView === 'tracker') {
      loadAccountTracker(selectedAccountId);
    }
  }, [selectedAccountId, activeView]);

  useEffect(() => {
    if (activeView === 'today-sheet') {
      loadSheet(sheetDate);
    }
  }, [activeView, sheetDate]);

  // Open Day Payment Modal
  const handleOpenDayModal = (dayItem) => {
    setActiveDayModal(dayItem);
    setPaymentAmount(String(dayItem.expectedRupees));
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('CASH');
    setPaymentRemarks('');
    setDayActionType(dayItem.status === 'MISSED' ? 'MISSED' : 'PAID');
    setActionSuccess('');
    setActionError('');
  };

  // Submit Day Payment / Missed
  const handleSubmitDayPayment = async () => {
    if (!activeDayModal || !selectedAccountData) return;
    setSubmittingPayment(true);
    setActionError('');
    setActionSuccess('');

    try {
      const payload = {
        dayNumber: activeDayModal.dayNumber,
        paymentDate,
        amountRupees: dayActionType === 'MISSED' ? 0 : Number(paymentAmount),
        paymentMethod,
        status: dayActionType,
        remarks: paymentRemarks,
        idempotencyKey: `DC-${selectedAccountData._id}-D${activeDayModal.dayNumber}-${Date.now()}`,
      };

      const res = await api.post(`/daily-collections/${selectedAccountData._id}/payments`, payload);
      if (res.data.success) {
        setActionSuccess(`Day ${activeDayModal.dayNumber} recorded successfully as ${dayActionType}!`);
        setActiveDayModal(null);
        loadAccountTracker(selectedAccountData._id);
        loadSummary();
        loadAccounts();
      }
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to record daily collection');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handle Reversal
  const handleConfirmReversal = async () => {
    if (!reversalTarget || !selectedAccountData) return;
    setSubmittingReversal(true);
    setActionError('');
    setActionSuccess('');

    try {
      const res = await api.post(
        `/daily-collections/${selectedAccountData._id}/payments/${reversalTarget.paymentId}/reverse`,
        { reason: reversalReason || 'Correction by admin' }
      );
      if (res.data.success) {
        setActionSuccess(`Payment ${reversalTarget.paymentId} reversed successfully.`);
        setReversalTarget(null);
        setReversalReason('');
        loadAccountTracker(selectedAccountData._id);
        loadSummary();
        loadAccounts();
      }
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to reverse payment');
    } finally {
      setSubmittingReversal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2.5">
            <Layers className="w-6 h-6 text-emerald-600" />
            <span>Daily Collection Management (தினசரி வசூல்)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Upfront Interest Deduction (முன் வட்டி முறை) • 70 / 100 Equal Daily Instalments
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigate('new-finance')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5 cursor-pointer"
          >
            <span>+ New Daily Collection</span>
          </button>
          <button
            onClick={() => {
              loadSummary();
              loadAccounts();
              if (selectedAccountId) loadAccountTracker(selectedAccountId);
            }}
            className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 10 Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Active</p>
          <p className="text-lg font-black text-slate-900 mt-0.5">{summary?.totalActiveAccounts ?? 0}</p>
          <p className="text-[10px] text-slate-500">Active Accounts</p>
        </div>

        {/* Card 2 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross Principal</p>
          <p className="text-lg font-black text-slate-900 mt-0.5">{formatINR(summary?.grossPrincipalDisbursedRupees ?? 0)}</p>
          <p className="text-[10px] text-slate-500">Disbursed Capital</p>
        </div>

        {/* Card 3 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Net Disbursed</p>
          <p className="text-lg font-black text-emerald-700 mt-0.5">{formatINR(summary?.netDisbursedRupees ?? 0)}</p>
          <p className="text-[10px] text-emerald-600">Cash Given to Borrowers</p>
        </div>

        {/* Card 4 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Upfront Interest</p>
          <p className="text-lg font-black text-purple-700 mt-0.5">{formatINR(summary?.upfrontInterestDeductedRupees ?? 0)}</p>
          <p className="text-[10px] text-purple-500">Deducted at Inception</p>
        </div>

        {/* Card 5 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Total Collected</p>
          <p className="text-lg font-black text-blue-700 mt-0.5">{formatINR(summary?.totalCollectionsReceivedRupees ?? 0)}</p>
          <p className="text-[10px] text-blue-500">Gross Recovered</p>
        </div>

        {/* Card 6 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Outstanding</p>
          <p className="text-lg font-black text-rose-700 mt-0.5">{formatINR(summary?.totalOutstandingBalanceRupees ?? 0)}</p>
          <p className="text-[10px] text-rose-500">Remaining Balance</p>
        </div>

        {/* Card 7 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Today Expected</p>
          <p className="text-lg font-black text-slate-900 mt-0.5">{formatINR(summary?.todayExpectedRupees ?? 0)}</p>
          <p className="text-[10px] text-slate-400">Scheduled for Today</p>
        </div>

        {/* Card 8 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Today Collected</p>
          <p className="text-lg font-black text-emerald-700 mt-0.5">{formatINR(summary?.todayActualRupees ?? 0)}</p>
          <p className="text-[10px] text-emerald-500">Received Today</p>
        </div>

        {/* Card 9 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Missed Collections</p>
          <p className="text-lg font-black text-rose-700 mt-0.5">{summary?.missedCollectionsCount ?? 0}</p>
          <p className="text-[10px] text-rose-500">Unpaid Scheduled Days</p>
        </div>

        {/* Card 10 */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Completed</p>
          <p className="text-lg font-black text-emerald-800 mt-0.5">{summary?.completedAccountsCount ?? 0}</p>
          <p className="text-[10px] text-emerald-600">Fully Settled Accounts</p>
        </div>
      </div>

      {/* Global Alerts */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess('')} className="text-emerald-600 font-bold">×</button>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError('')} className="text-rose-600 font-bold">×</button>
        </div>
      )}

      {/* View Switcher Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 sm:px-4 rounded-xl shadow-sm text-xs font-bold overflow-x-auto whitespace-nowrap">
        <button
          onClick={() => setActiveView('accounts')}
          className={`py-3.5 px-3 sm:px-4 border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[44px] ${
            activeView === 'accounts'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Accounts List ({accounts.length})</span>
        </button>

        <button
          onClick={() => setActiveView('tracker')}
          className={`py-3.5 px-3 sm:px-4 border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[44px] ${
            activeView === 'tracker'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Visual Collection Tracker ({selectedAccountData?.totalDurationDays || '70/100'} Days)</span>
        </button>

        <button
          onClick={() => setActiveView('today-sheet')}
          className={`py-3.5 px-3 sm:px-4 border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[44px] ${
            activeView === 'today-sheet'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>Daily Collection Sheet & Field Due</span>
        </button>
      </div>

      {/* VIEW 1: ACCOUNTS LIST */}
      {activeView === 'accounts' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search Account ID, Borrower Name, Mobile..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white"
            >
              <option value="">All Statuses (Active, Overdue, Completed)</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="OVERDUE">OVERDUE</option>
              <option value="COMPLETED">COMPLETED</option>
            </select>
          </div>

          {/* Accounts Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 min-w-[720px]">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-y border-slate-200">
                <tr>
                  <th className="py-3 px-3">Account ID</th>
                  <th className="py-3 px-3">Borrower Customer</th>
                  <th className="py-3 px-3 text-right">Gross Principal</th>
                  <th className="py-3 px-3 text-right">Net Cash Given</th>
                  <th className="py-3 px-3 text-right">Daily Instalment</th>
                  <th className="py-3 px-3 text-center">Progress</th>
                  <th className="py-3 px-3 text-right">Collected</th>
                  <th className="py-3 px-3 text-right">Outstanding</th>
                  <th className="py-3 px-3 text-right">Overdue Penalty</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingAccounts ? (
                  <tr>
                    <td colSpan="11" className="py-8 text-center text-slate-400">
                      Loading Daily Collection accounts...
                    </td>
                  </tr>
                ) : !accounts || accounts.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="py-12 text-center text-slate-400">
                      <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
                      <p className="font-semibold text-slate-700 text-sm">No Daily Collection accounts added yet</p>
                      <p className="text-slate-400 text-xs mt-1">
                        Disburse a new Daily Collection account (70 or 100 Days Upfront Interest) to begin daily tracking.
                      </p>
                    </td>
                  </tr>
                ) : (
                  (accounts || []).map((acc) => {
                    const statusBadge = getStatusBadge(acc.status);
                    return (
                      <tr key={acc._id} className="hover:bg-slate-50/80 transition-all font-mono">
                        <td className="py-3 px-3">
                          <span className="font-bold text-blue-700">{acc.accountId}</span>
                          <span className="ml-1.5 px-1.5 py-0.5 text-[9px] bg-slate-100 text-slate-700 font-sans font-bold rounded">
                            {acc.totalDurationDays || 100}D
                          </span>
                        </td>
                        <td className="py-3 px-3 font-sans">
                          <p className="font-bold text-slate-900">{acc.customerName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{acc.customerMobile}</p>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {formatINR(acc.grossPrincipalRupees)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700">
                          {formatINR(acc.netDisbursementRupees)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {formatINR(acc.dailyInstalmentRupees)}
                        </td>
                        <td className="py-3 px-3 text-center font-sans">
                          <div className="w-24 mx-auto space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                              <span>Day {acc.daysCompleted}</span>
                              <span>/{acc.totalDurationDays || 100}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-emerald-500 h-1.5 rounded-full"
                                style={{ width: `${Math.min(100, acc.progressPercent)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-600">
                          {formatINR(acc.totalCollectedRupees)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-rose-600">
                          {formatINR(acc.totalOutstandingRupees)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {acc.penaltyBreakdown && acc.penaltyBreakdown.overdueDays > 0 ? (
                            <div>
                              <span className="font-bold text-rose-700">
                                {formatINR(acc.penaltyBreakdown.penaltyOutstandingRupees)}
                              </span>
                              <div className="text-[10px] text-rose-500 font-mono">
                                {acc.penaltyBreakdown.overdueDays}d overdue ({formatINR(acc.penaltyBreakdown.dailyPenaltyRupees)}/d @ {acc.overduePenaltyRate || acc.penaltyRatePercent || 2}%)
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="text-slate-400 font-mono text-[11px]">₹0.00</span>
                              <div className="text-[9px] text-slate-400 font-sans">
                                ({acc.overduePenaltyRate || acc.penaltyRatePercent || 2}%/day)
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-sans">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.bg}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-sans">
                          <button
                            onClick={() => {
                              setSelectedAccountId(acc._id);
                              setActiveView('tracker');
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold flex items-center space-x-1 mx-auto cursor-pointer"
                          >
                            <span>Open Tracker</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: 100-DAY VISUAL TRACKER GRID */}
      {activeView === 'tracker' && (
        <div className="space-y-5">
          {/* Account Selector Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-700 whitespace-nowrap">Select Account:</span>
              <select
                value={selectedAccountId || ''}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full sm:w-80 px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 bg-white"
              >
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.accountId} - {a.customerName} ({formatINR(a.grossPrincipalRupees)})
                  </option>
                ))}
              </select>
            </div>

            {selectedAccountData && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-mono text-slate-600">
                <span>
                  Start: <strong className="font-sans text-slate-900">{formatDate(selectedAccountData.startDate)}</strong>
                </span>
                <span>
                  End: <strong className="font-sans text-slate-900">{formatDate(selectedAccountData.expectedCompletionDate)}</strong>
                </span>
                <span>
                  Instalment: <strong className="text-emerald-700">{formatINR(selectedAccountData.dailyInstalmentRupees)}/day</strong>
                </span>
              </div>
            )}
          </div>

          {loadingTracker ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
              Loading Visual Day Tracker...
            </div>
          ) : !selectedAccountData ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
              Select an account to view visual day tracker.
            </div>
          ) : (
            <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              {/* Account Hero Summary */}
              <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4 text-xs">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Borrower</p>
                  <p className="font-bold text-slate-900 text-sm mt-0.5 truncate">{selectedAccountData.customerName}</p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">{selectedAccountData.customerMobile}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Duration</p>
                  <p className="font-bold text-blue-700 mt-0.5">{selectedAccountData.totalDurationDays || 100} Days</p>
                  <p className="text-[10px] text-slate-500 truncate">Upfront Interest</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Gross Principal</p>
                  <p className="font-bold text-slate-900 text-sm mt-0.5 truncate">{formatINR(selectedAccountData.grossPrincipalRupees)}</p>
                  <p className="text-[10px] text-emerald-600 font-mono truncate">Net: {formatINR(selectedAccountData.netDisbursementRupees)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Total Collected</p>
                  <p className="font-bold text-emerald-700 text-sm mt-0.5 truncate">{formatINR(selectedAccountData.totalCollectedRupees)}</p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">{selectedAccountData.daysCompleted} / {selectedAccountData.totalDurationDays || 100} Days</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Remaining</p>
                  <p className="font-bold text-rose-700 text-sm mt-0.5 truncate">{formatINR(selectedAccountData.totalOutstandingRupees)}</p>
                  <p className="text-[10px] text-slate-500 font-mono truncate">{selectedAccountData.daysRemaining} Days Left</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Status</p>
                  <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(selectedAccountData.status).bg}`}>
                    {getStatusBadge(selectedAccountData.status).label}
                  </span>
                  {selectedAccountData.daysMissed > 0 && (
                    <p className="text-[10px] text-rose-600 font-bold mt-0.5">{selectedAccountData.daysMissed} Missed</p>
                  )}
                </div>
              </div>

              {/* Overdue Daily Penalty Breakdown Block (Matches loan interest on Gross Principal) */}
              {selectedAccountData.penaltyBreakdown && (
                <div className="bg-rose-50/50 border border-rose-200 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-rose-200/60 pb-2">
                    <h4 className="font-bold text-rose-900 text-xs flex items-center space-x-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span>Overdue Penalty Breakdown ({selectedAccountData.overduePenaltyRate || selectedAccountData.penaltyBreakdown.penaltyRatePercent || selectedAccountData.upfrontInterestPercent || 10}% per day on Gross Principal)</span>
                    </h4>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200">
                      {selectedAccountData.penaltyBreakdown.overdueDays > 0
                        ? `${selectedAccountData.penaltyBreakdown.overdueDays} Days Overdue (Past Term)`
                        : 'Within Scheduled Term (₹0 Penalty)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-slate-500 font-sans">Gross Principal</p>
                      <p className="font-bold font-mono text-slate-800 text-sm mt-0.5">
                        {formatINR(selectedAccountData.grossPrincipalRupees)}
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-slate-500 font-sans">Daily Instalment</p>
                      <p className="font-bold font-mono text-slate-800 text-sm mt-0.5">
                        {formatINR(selectedAccountData.dailyInstalmentRupees)}
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-rose-600 font-sans font-medium">Daily Penalty ({selectedAccountData.overduePenaltyRate || selectedAccountData.penaltyBreakdown.penaltyRatePercent || selectedAccountData.upfrontInterestPercent || 10}%)</p>
                      <p className="font-bold font-mono text-rose-700 text-sm mt-0.5">
                        {formatINR(selectedAccountData.penaltyBreakdown.dailyPenaltyRupees)} / day
                      </p>
                      <p className="text-[9px] text-slate-400 font-sans">
                        Matches loan interest
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-slate-500 font-sans">Cumulative Penalty</p>
                      <p className="font-bold font-mono text-slate-900 text-sm mt-0.5">
                        {formatINR(selectedAccountData.penaltyBreakdown.cumulativePenaltyRupees)}
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-emerald-600 font-sans font-medium">Penalty Paid</p>
                      <p className="font-bold font-mono text-emerald-700 text-sm mt-0.5">
                        {formatINR(selectedAccountData.penaltyBreakdown.penaltyPaidRupees)}
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-rose-700 font-sans font-bold">Penalty Outstanding</p>
                      <p className="font-bold font-mono text-rose-800 text-sm mt-0.5">
                        {formatINR(selectedAccountData.penaltyBreakdown.penaltyOutstandingRupees)}
                      </p>
                    </div>

                    <div className="bg-amber-100/70 p-2.5 rounded-lg border border-amber-300 col-span-2">
                      <p className="text-[10px] text-amber-900 font-sans font-bold">Total Amount Required to Close Account</p>
                      <p className="font-black font-mono text-amber-950 text-base mt-0.5">
                        {formatINR(selectedAccountData.penaltyBreakdown.totalAmountToCloseRupees)}
                      </p>
                      <p className="text-[9px] text-amber-800 mt-0.5">
                        Scheduled Repayment ({formatINR(selectedAccountData.totalOutstandingRupees)}) + Penalty ({formatINR(selectedAccountData.penaltyBreakdown.penaltyOutstandingRupees)})
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Grid Legend */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs pt-1 pb-2 border-b border-slate-200 gap-2">
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <span className="font-bold text-slate-700">Grid Legend:</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-emerald-500 inline-block shrink-0" />
                    <span className="text-slate-600 text-[11px]">Paid (வசூலானது)</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-amber-400 inline-block shrink-0" />
                    <span className="text-slate-600 text-[11px]">Partial (பகுதி)</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-rose-500 inline-block shrink-0" />
                    <span className="text-slate-600 text-[11px]">Missed (தவறியது)</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-slate-200 inline-block shrink-0" />
                    <span className="text-slate-600 text-[11px]">Upcoming (வரவிருப்பது)</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 font-sans italic">
                  Tap any day to record collection or mark missed.
                </p>
              </div>

              {/* COLLECTION GRID (70 or 100 DAYS) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span>{selectedAccountData.totalDurationDays || 100}-Day Collection Grid ({selectedAccountData.totalDurationDays || 100} நாட்கள் வசூல் வரைபடம்)</span>
                  </h4>
                  <span className="text-[11px] font-mono text-slate-500">
                    Daily Instalment: {formatINR(selectedAccountData.dailyInstalmentRupees)} / day
                  </span>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-10 lg:grid-cols-20 gap-1.5">
                  {selectedAccountData.schedule.slice(0, selectedAccountData.totalDurationDays || 100).map((day) => {
                    let cellBg = 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200';
                    if (day.status === 'PAID') {
                      cellBg = 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600';
                    } else if (day.status === 'PARTIAL') {
                      cellBg = 'bg-amber-400 hover:bg-amber-500 text-slate-900 border-amber-500';
                    } else if (day.status === 'MISSED') {
                      cellBg = 'bg-rose-500 hover:bg-rose-600 text-white border-rose-600';
                    }

                    return (
                      <button
                        key={day.dayNumber}
                        onClick={() => handleOpenDayModal(day)}
                        className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col justify-between h-14 ${cellBg}`}
                        title={`Day ${day.dayNumber}: ${day.status} - Due: ${formatINR(day.expectedRupees)} on ${formatDate(day.scheduledDate)}`}
                      >
                        <span className="text-[10px] font-bold">D{day.dayNumber}</span>
                        <span className="text-[8px] opacity-80 leading-none">
                          {new Date(day.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                        <span className="text-[9px] font-bold font-mono leading-none">
                          {day.status === 'PAID'
                            ? `₹${day.collectedRupees}`
                            : day.status === 'PARTIAL'
                            ? `₹${day.collectedRupees}`
                            : `₹${day.expectedRupees}`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Overdue Penalty Schedule Days (Day D+1+) */}
                {selectedAccountData.schedule.length > (selectedAccountData.totalDurationDays || 100) && (
                  <div className="pt-3 border-t border-rose-200 space-y-2 mt-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs uppercase tracking-wider text-rose-700 flex items-center space-x-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Overdue Penalty Schedule (Day {(selectedAccountData.totalDurationDays || 100) + 1}+)</span>
                      </h5>
                      <span className="text-[11px] font-mono text-rose-600">
                        Daily Penalty ({selectedAccountData.overduePenaltyRate || selectedAccountData.penaltyBreakdown?.penaltyRatePercent || selectedAccountData.upfrontInterestPercent || 10}%): {formatINR(selectedAccountData.penaltyBreakdown?.dailyPenaltyRupees || 0)} / overdue day
                      </span>
                    </div>

                    <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-10 lg:grid-cols-20 gap-1.5">
                      {selectedAccountData.schedule.slice(selectedAccountData.totalDurationDays || 100).map((day) => {
                        let cellBg = 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200';
                        if (day.status === 'PAID') {
                          cellBg = 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600';
                        } else if (day.status === 'PARTIAL') {
                          cellBg = 'bg-amber-400 hover:bg-amber-500 text-slate-900 border-amber-500';
                        }

                        return (
                          <button
                            key={day.dayNumber}
                            onClick={() => handleOpenDayModal(day)}
                            className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer flex flex-col justify-between h-14 ${cellBg}`}
                            title={`Overdue Day ${day.dayNumber}: Penalty ${formatINR(day.expectedRupees)}`}
                          >
                            <span className="text-[10px] font-bold">D{day.dayNumber}</span>
                            <span className="text-[8px] opacity-80 leading-none">
                              {new Date(day.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </span>
                            <span className="text-[9px] font-bold font-mono leading-none">
                              {day.status === 'PAID' ? `₹${day.collectedRupees}` : `₹${day.expectedRupees}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Payments History for Selected Account */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                  Logged Payments & Transaction Trail ({selectedAccountData.payments?.length || 0})
                </h4>
                {selectedAccountData.payments?.length === 0 ? (
                  <p className="text-xs text-slate-400">No collections recorded yet for this account.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase border-y border-slate-200 font-sans font-bold">
                        <tr>
                          <th className="py-2 px-3">Receipt / ID</th>
                          <th className="py-2 px-3">Day #</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                          <th className="py-2 px-3">Method</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedAccountData.payments.map((p) => (
                          <tr key={p._id || p.paymentId} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-blue-700">{p.paymentId}</td>
                            <td className="py-2 px-3 font-bold">Day {p.dayNumber}</td>
                            <td className="py-2 px-3 font-sans">{formatDateTime(p.paymentDate)}</td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-700">
                              {formatINR(p.amountRupees)}
                            </td>
                            <td className="py-2 px-3">{p.paymentMethod}</td>
                            <td className="py-2 px-3 font-sans">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                                p.status === 'CONFIRMED'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-sans">
                              {p.status === 'CONFIRMED' && (
                                <button
                                  onClick={() => setReversalTarget(p)}
                                  className="text-[10px] text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                                >
                                  Reverse
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: TODAY'S COLLECTION SHEET & FIELD DUE */}
      {activeView === 'today-sheet' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between pb-4 border-b border-slate-200 gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Daily Collection Sheet (கள வசூல் பட்டியல்)</h3>
              <p className="text-xs text-slate-500">
                Printable field collection schedule for collectors on the ground.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="date"
                value={sheetDate}
                onChange={(e) => setSheetDate(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
              />
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 cursor-pointer no-print"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Sheet</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 min-w-[700px]">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Account ID</th>
                  <th className="py-2.5 px-3">Borrower Name</th>
                  <th className="py-2.5 px-3">Mobile</th>
                  <th className="py-2.5 px-3 text-center">Day Number</th>
                  <th className="py-2.5 px-3 text-right">Expected ₹</th>
                  <th className="py-2.5 px-3 text-right">Collected ₹</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Collector Signature / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {loadingSheet ? (
                  <tr>
                    <td colSpan="9" className="py-8 text-center text-slate-400">
                      Loading collection sheet for {formatDate(sheetDate)}...
                    </td>
                  </tr>
                ) : sheetData.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-8 text-center text-slate-400">
                      No active daily collections scheduled on {formatDate(sheetDate)}.
                    </td>
                  </tr>
                ) : (
                  sheetData.map((row, idx) => (
                    <tr key={row.accountId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-sans text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-blue-700">{row.accountId}</td>
                      <td className="py-2.5 px-3 font-sans font-bold text-slate-900">{row.customerName}</td>
                      <td className="py-2.5 px-3">{row.customerMobile}</td>
                      <td className="py-2.5 px-3 text-center font-bold">Day {row.dayNumber}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {formatINR(row.expectedRupees)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                        {formatINR(row.collectedRupees)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${getStatusBadge(row.status).bg}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center border-l border-dashed border-slate-200">
                        <span className="text-slate-300">____________________</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DAY PAYMENT MODAL */}
      {activeDayModal && selectedAccountData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center space-x-2">
                <Coins className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Record Collection: Day {activeDayModal.dayNumber}</span>
              </h3>
              <button
                onClick={() => setActiveDayModal(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1"
              >
                ×
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Account:</span>
                <span className="font-mono font-bold text-blue-700">{selectedAccountData.accountId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Borrower:</span>
                <span className="font-bold text-slate-900 truncate ml-2">{selectedAccountData.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scheduled Date:</span>
                <span className="font-mono">{formatDate(activeDayModal.scheduledDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expected Instalment:</span>
                <span className="font-bold text-slate-900">{formatINR(activeDayModal.expectedRupees)}</span>
              </div>
            </div>

            {/* Action Type: Paid, Partial, Missed */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {[
                { id: 'PAID', label: 'Full Paid', desc: '₹' + activeDayModal.expectedRupees },
                { id: 'PARTIAL', label: 'Partial', desc: 'Custom ₹' },
                { id: 'MISSED', label: 'Missed', desc: '₹0 Received' },
              ].map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => {
                    setDayActionType(act.id);
                    if (act.id === 'PAID') setPaymentAmount(String(activeDayModal.expectedRupees));
                    if (act.id === 'MISSED') setPaymentAmount('0');
                  }}
                  className={`p-2 rounded-lg border text-center transition-all cursor-pointer min-h-[46px] flex flex-col justify-center ${
                    dayActionType === act.id
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs">{act.label}</p>
                  <p className="text-[10px] text-slate-400">{act.desc}</p>
                </button>
              ))}
            </div>

            {dayActionType !== 'MISSED' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount Received (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={activeDayModal.expectedRupees}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 bg-white"
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs text-slate-800"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / Note</label>
              <input
                type="text"
                placeholder={dayActionType === 'MISSED' ? 'Reason for missed payment...' : 'Optional notes...'}
                value={paymentRemarks}
                onChange={(e) => setPaymentRemarks(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-800"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setActiveDayModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingPayment}
                onClick={handleSubmitDayPayment}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submittingPayment ? 'Saving...' : 'Save Collection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVERSAL MODAL */}
      {reversalTarget && selectedAccountData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-rose-700 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirm Payment Reversal</span>
            </h3>

            <p className="text-xs text-slate-600">
              You are reversing collection <strong className="font-mono text-slate-900">{reversalTarget.paymentId}</strong> for Day {reversalTarget.dayNumber} ({formatINR(reversalTarget.amountRupees)}). This will restore the outstanding balance and audit this reversal.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Reversal *</label>
              <input
                type="text"
                required
                placeholder="e.g. Entry error, Cheque bounce, Wrong account"
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-800"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setReversalTarget(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingReversal || !reversalReason.trim()}
                onClick={handleConfirmReversal}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submittingReversal ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
