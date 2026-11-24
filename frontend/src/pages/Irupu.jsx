import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  MinusCircle,
  Settings,
  Calendar,
  RotateCcw,
  Printer,
  FileSpreadsheet,
  Coins,
  TrendingUp,
  Receipt,
  Layers,
  CalendarRange,
  CalendarDays,
  CheckCircle,
  AlertCircle,
  X,
  Search,
  Filter,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import api from '../api';
import { formatINR } from '../utils/formatters';

export default function Irupu({ onNavigate }) {
  // State
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState('register'); // 'register' | 'daily_breakdown' | 'investments' | 'outflows'
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modals state
  const [isInvestmentModalOpen, setIsInvestmentModalOpen] = useState(false);
  const [isOutflowModalOpen, setIsOutflowModalOpen] = useState(false);
  const [isOpeningBalanceModalOpen, setIsOpeningBalanceModalOpen] = useState(false);
  const [reversalTarget, setReversalTarget] = useState(null); // { type: 'investment'|'outflow', item }
  const [reversalReason, setReversalReason] = useState('');

  // Form states
  const [invAmount, setInvAmount] = useState('');
  const [invDate, setInvDate] = useState(new Date().toISOString().split('T')[0]);
  const [invDesc, setInvDesc] = useState('');
  const [invRef, setInvRef] = useState('');

  const [outAmount, setOutAmount] = useState('');
  const [outDate, setOutDate] = useState(new Date().toISOString().split('T')[0]);
  const [outCategory, setOutCategory] = useState('EXPENSE');
  const [outDesc, setOutDesc] = useState('');
  const [outRef, setOutRef] = useState('');

  const [opbAmount, setOpbAmount] = useState('');
  const [opbDate, setOpbDate] = useState(new Date().toISOString().split('T')[0]);
  const [opbRemarks, setOpbRemarks] = useState('');

  // Feedback states
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Fetch Irupu Summary
  const fetchSummary = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (period === 'custom') {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }
      const res = await api.get('/irupu/summary', { params });
      if (res.data?.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load Irupu cash summary', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [period, startDate, endDate]);

  // Handle Add Investment
  const handleAddInvestment = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    const amt = parseFloat(invAmount);
    if (!amt || amt <= 0) {
      setFormError('Please enter a valid positive investment amount.');
      return;
    }
    if (!invDesc.trim()) {
      setFormError('Please provide a description or remarks for this investment.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/irupu/investments', {
        amount: amt,
        date: invDate,
        description: invDesc,
        referenceNumber: invRef,
      });
      if (res.data?.success) {
        setFormSuccess(res.data.message);
        setInvAmount('');
        setInvDesc('');
        setInvRef('');
        fetchSummary();
        setTimeout(() => {
          setIsInvestmentModalOpen(false);
          setFormSuccess('');
        }, 1200);
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to add investment');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Add Cash Outflow
  const handleAddOutflow = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    const amt = parseFloat(outAmount);
    if (!amt || amt <= 0) {
      setFormError('Please enter a valid positive outflow amount.');
      return;
    }
    if (!outDesc.trim()) {
      setFormError('Please provide description/reason for this cash outflow.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/irupu/outflows', {
        amount: amt,
        date: outDate,
        category: outCategory,
        description: outDesc,
        referenceNumber: outRef,
      });
      if (res.data?.success) {
        setFormSuccess(res.data.message);
        setOutAmount('');
        setOutDesc('');
        setOutRef('');
        fetchSummary();
        setTimeout(() => {
          setIsOutflowModalOpen(false);
          setFormSuccess('');
        }, 1200);
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to record cash outflow');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Set Opening Balance
  const handleSetOpeningBalance = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    const amt = parseFloat(opbAmount);
    if (isNaN(amt) || amt < 0) {
      setFormError('Please enter a valid non-negative opening balance amount.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/irupu/opening-balance', {
        amount: amt,
        effectiveDate: opbDate,
        remarks: opbRemarks || 'Physical cash opening balance',
      });
      if (res.data?.success) {
        setFormSuccess(res.data.message);
        fetchSummary();
        setTimeout(() => {
          setIsOpeningBalanceModalOpen(false);
          setFormSuccess('');
        }, 1200);
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to update opening balance');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Reversal
  const handleConfirmReversal = async (e) => {
    e.preventDefault();
    if (!reversalTarget || !reversalReason.trim()) return;

    setSubmitting(true);
    try {
      const endpoint =
        reversalTarget.type === 'investment'
          ? `/irupu/investments/${reversalTarget.item.investmentId || reversalTarget.item._id}/reverse`
          : `/irupu/outflows/${reversalTarget.item.outflowId || reversalTarget.item._id}/reverse`;

      const res = await api.post(endpoint, { reason: reversalReason });
      if (res.data?.success) {
        fetchSummary();
        setReversalTarget(null);
        setReversalReason('');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reverse transaction');
    } finally {
      setSubmitting(false);
    }
  };

  // CSV Export utility
  const exportToCSV = (dataRows, filename) => {
    if (!dataRows || !dataRows.length) return;
    const headers = Object.keys(dataRows[0]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        headers.join(','),
        ...dataRows.map((row) =>
          headers.map((h) => `"${String(row[h] !== undefined ? row[h] : '').replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportRegister = () => {
    if (!data?.cashRegister?.length) return;
    const rows = data.cashRegister.map((r) => ({
      'Date': new Date(r.date).toLocaleDateString('en-IN'),
      'Reference #': r.id || r.referenceNumber || '',
      'Source': r.sourceLabel || r.source,
      'Particulars': r.particulars,
      'Cash Received (₹)': r.cashInflowRupees || 0,
      'Investment Added (₹)': r.investmentRupees || 0,
      'Cash Paid / Outflow (₹)': r.cashOutflowRupees || 0,
      'Running Balance (₹)': r.runningBalanceRupees || 0,
      'Recorded By': r.performedBy || '',
    }));
    exportToCSV(rows, `CPN_Irupu_Cash_Register_${period}`);
  };

  const handleExportDailyBreakdown = () => {
    if (!data?.dailyBreakdown?.length) return;
    const rows = data.dailyBreakdown.map((d) => ({
      'Date': d.date,
      'Opening Balance (இருப்பு)': d.openingBalanceRupees,
      'Monthly (Mon)': d.monthlyCashRupees,
      'Daily Collection (D.C)': d.dailyCollectionCashRupees,
      'Daily Finance (D.I)': d.dailyFinanceCashRupees,
      'Investment Added': d.investmentRupees,
      'Disbursements & Outflows': (d.disbursementRupees + d.outflowRupees).toFixed(2),
      'Day Collections Total (மொத்த வரவு)': d.totalDayInflowRupees,
      'Closing Balance (இறுதி இருப்பு)': d.closingBalanceRupees,
    }));
    exportToCSV(rows, `CPN_Irupu_Daily_Summary_${period}`);
  };

  // Filtered Register
  const filteredRegister = useMemo(() => {
    if (!data?.cashRegister) return [];
    return data.cashRegister.filter((item) => {
      if (categoryFilter !== 'ALL' && item.source !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const particulars = (item.particulars || '').toLowerCase();
        const id = (item.id || '').toLowerCase();
        const ref = (item.referenceNumber || '').toLowerCase();
        return particulars.includes(q) || id.includes(q) || ref.includes(q);
      }
      return true;
    });
  }, [data, categoryFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 font-bold">
              <Wallet className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              இருப்பு (Cash in Hand) Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
              Live Cash Box
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time physical cash in hand tracking automatically calculated from finance cash collections, investments, and outflows.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setInvAmount('');
              setInvDesc('');
              setInvRef('');
              setFormError('');
              setIsInvestmentModalOpen(true);
            }}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Add Investment</span>
          </button>

          <button
            onClick={() => {
              setOutAmount('');
              setOutDesc('');
              setOutRef('');
              setFormError('');
              setIsOutflowModalOpen(true);
            }}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5 cursor-pointer"
          >
            <MinusCircle className="w-4 h-4" />
            <span>− Add Cash Outflow</span>
          </button>

          <button
            onClick={() => {
              setOpbAmount(data?.configuredOpeningBalance?.amountRupees || '0');
              setOpbRemarks(data?.configuredOpeningBalance?.remarks || '');
              setFormError('');
              setIsOpeningBalanceModalOpen(true);
            }}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer"
            title="Set One-time Initial Opening Cash Balance"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>Opening Balance</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer"
            title="Print Cash Register"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          <button
            onClick={activeTab === 'daily_breakdown' ? handleExportDailyBreakdown : handleExportRegister}
            className="px-3 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1 cursor-pointer"
            title="Export Excel/CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. DATE FILTERS BAR */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs no-print">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-500 font-semibold mr-1 flex items-center">
            <Filter className="w-3.5 h-3.5 mr-1" />
            Period:
          </span>
          {[
            { id: 'today', label: 'Today (இன்று)' },
            { id: 'this_month', label: 'This Month (இந்த மாதம்)' },
            { id: 'this_year', label: 'This Year (இந்த ஆண்டு)' },
            { id: 'all', label: 'All Time (மொத்தம்)' },
            { id: 'custom', label: 'Custom Range' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setPeriod(btn.id)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                period === btn.id
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center space-x-2">
            <div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs font-medium"
              />
            </div>
            <span className="text-slate-400">to</span>
            <div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs font-medium"
              />
            </div>
          </div>
        )}

        <button
          onClick={fetchSummary}
          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer ml-auto"
          title="Refresh Data"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* 3. TOP KPI METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: CURRENT PHYSICAL CASH IN HAND */}
        <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 text-white p-5 rounded-xl border border-emerald-800/40 shadow-lg relative overflow-hidden">
          <div className="absolute right-3 top-3 opacity-15">
            <Coins className="w-20 h-20 text-emerald-400" />
          </div>
          <div className="flex items-center justify-between text-emerald-400 text-xs font-bold mb-2">
            <span className="flex items-center space-x-1.5">
              <Wallet className="w-4 h-4" />
              <span>CURRENT CASH IN HAND (இருப்பு)</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
              Physical Cash
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white mt-1">
            {formatINR(data?.currentCashInHandRupees || 0)}
          </div>
          <p className="text-[11px] text-emerald-200/80 mt-2 font-medium">
            Opening + Confirmed Cash Collections + Investments − Cash Paid Out
          </p>
        </div>

        {/* Card 2: PERIOD OPENING BALANCE */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-1">
            <span>OPENING BALANCE (ஆரம்ப இருப்பு)</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Calendar className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 mt-1">
            {formatINR(data?.periodSummary?.openingBalanceRupees || 0)}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Carried forward cash at period start
          </p>
        </div>

        {/* Card 3: TOTAL CASH INFLOWS */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-emerald-700 text-xs font-bold mb-1">
            <span>TOTAL CASH INFLOWS (மொத்த வரவு)</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 mt-1">
            + {formatINR(data?.periodSummary?.totalInflowsRupees || 0)}
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex flex-wrap gap-x-2">
            <span>Mon: {formatINR(data?.periodSummary?.monthlyFinanceCashRupees || 0)}</span>
            <span>D.I: {formatINR(data?.periodSummary?.dailyFinanceCashRupees || 0)}</span>
            <span>D.C: {formatINR(data?.periodSummary?.dailyCollectionCashRupees || 0)}</span>
          </div>
        </div>

        {/* Card 4: TOTAL CASH OUTFLOWS */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-rose-700 text-xs font-bold mb-1">
            <span>TOTAL CASH OUTFLOWS (பற்று / செலவு)</span>
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-rose-600 mt-1">
            − {formatINR(data?.periodSummary?.totalOutflowsRupees || 0)}
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex flex-wrap gap-x-2">
            <span>Loans: {formatINR(data?.periodSummary?.disbursementRupees || 0)}</span>
            <span>Exp: {formatINR(data?.periodSummary?.expenseRupees || 0)}</span>
            <span>Withdr: {formatINR(data?.periodSummary?.withdrawalRupees || 0)}</span>
          </div>
        </div>
      </div>

      {/* 4. REFERENCE DIARY CARD: "Jun - 6 - 26" HANDWRITTEN DIARY SUMMARY FORMAT */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 sm:p-6 rounded-xl border border-slate-700 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs">
              CR
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider flex items-center space-x-2">
                <span>தினசரி ரொக்க இருப்பு பதிவேடு (Daily Cash Position)</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Segregated source-wise breakdown of physical cash collections as per owner daily diary format
              </p>
            </div>
          </div>
          <div className="text-xs font-mono font-bold text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            {period === 'today' ? 'Today · ' + new Date().toLocaleDateString('en-IN') : `Selected Period: ${period.toUpperCase()}`}
          </div>
        </div>

        {/* Handwritten Diary Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mt-4 text-xs font-mono">
          {/* 1. Opening இருப்பு */}
          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700">
            <span className="text-[10px] uppercase font-sans text-slate-400 block mb-1">
              இருப்பு (Opening)
            </span>
            <span className="font-bold text-white text-sm">
              {formatINR(data?.periodSummary?.openingBalanceRupees || 0)}
            </span>
          </div>

          {/* 2. Mon */}
          <div className="bg-blue-950/40 p-3 rounded-lg border border-blue-900/60">
            <span className="text-[10px] uppercase font-sans text-blue-300 block mb-1">
              Mon (Monthly Finance)
            </span>
            <span className="font-bold text-blue-300 text-sm">
              + {formatINR(data?.periodSummary?.monthlyFinanceCashRupees || 0)}
            </span>
          </div>

          {/* 3. D.C */}
          <div className="bg-emerald-950/40 p-3 rounded-lg border border-emerald-900/60">
            <span className="text-[10px] uppercase font-sans text-emerald-300 block mb-1">
              D.C (Daily Collection)
            </span>
            <span className="font-bold text-emerald-300 text-sm">
              + {formatINR(data?.periodSummary?.dailyCollectionCashRupees || 0)}
            </span>
          </div>

          {/* 4. D.I */}
          <div className="bg-amber-950/40 p-3 rounded-lg border border-amber-900/60">
            <span className="text-[10px] uppercase font-sans text-amber-300 block mb-1">
              D.I (Daily Finance)
            </span>
            <span className="font-bold text-amber-300 text-sm">
              + {formatINR(data?.periodSummary?.dailyFinanceCashRupees || 0)}
            </span>
          </div>

          {/* 5. Investments & Inflows */}
          <div className="bg-purple-950/40 p-3 rounded-lg border border-purple-900/60">
            <span className="text-[10px] uppercase font-sans text-purple-300 block mb-1">
              Investments Added
            </span>
            <span className="font-bold text-purple-300 text-sm">
              + {formatINR(data?.periodSummary?.investmentRupees || 0)}
            </span>
          </div>

          {/* 6. Closing இருப்பு */}
          <div className="bg-emerald-900/40 p-3 rounded-lg border border-emerald-600/70">
            <span className="text-[10px] uppercase font-sans text-emerald-300 font-bold block mb-1">
              மொத்த இருப்பு (Closing)
            </span>
            <span className="font-black text-emerald-300 text-base">
              = {formatINR(data?.periodSummary?.closingBalanceRupees || 0)}
            </span>
          </div>
        </div>

        <div className="mt-3 pt-2 border-t border-slate-700/60 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
          <span>
            Total Confirmed Finance Cash Inflow: <strong className="text-white">{formatINR(data?.periodSummary?.totalFinanceCollectionsRupees || 0)}</strong>
          </span>
          <span>
            Cash Disbursed & Expenses: <strong className="text-rose-400">− {formatINR(data?.periodSummary?.totalOutflowsRupees || 0)}</strong>
          </span>
        </div>
      </div>

      {/* 5. NAVIGATION TABS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden no-print">
        <div className="flex border-b border-slate-200 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab('register')}
            className={`px-5 py-3.5 border-b-2 flex items-center space-x-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'register'
                ? 'border-amber-600 text-amber-600 bg-amber-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Digital Cash Register (ரொக்கப் பதிவேடு)</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
              {data?.cashRegister?.length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('daily_breakdown')}
            className={`px-5 py-3.5 border-b-2 flex items-center space-x-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'daily_breakdown'
                ? 'border-amber-600 text-amber-600 bg-amber-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Daily Reconciliation Summary (நாள் வாரியான இருப்பு)</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
              {data?.dailyBreakdown?.length || 0} Days
            </span>
          </button>

          <button
            onClick={() => setActiveTab('investments')}
            className={`px-5 py-3.5 border-b-2 flex items-center space-x-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'investments'
                ? 'border-amber-600 text-amber-600 bg-amber-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Investments History (முதலீடுகள்)</span>
          </button>

          <button
            onClick={() => setActiveTab('outflows')}
            className={`px-5 py-3.5 border-b-2 flex items-center space-x-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'outflows'
                ? 'border-amber-600 text-amber-600 bg-amber-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <MinusCircle className="w-4 h-4" />
            <span>Cash Outflows (செலவுகள் & பற்று)</span>
          </button>
        </div>

        {/* TAB 1: DIGITAL CASH REGISTER */}
        {activeTab === 'register' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Filter and Search row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs no-print">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search particulars, receipt #, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 font-semibold mr-1">Source:</span>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'MONTHLY', label: 'Mon' },
                  { id: 'DAILY_FINANCE', label: 'D.I' },
                  { id: 'DAILY_COLLECTION', label: 'D.C' },
                  { id: 'INVESTMENT', label: 'Investment' },
                  { id: 'DISBURSEMENT', label: 'Disbursement' },
                  { id: 'EXPENSE', label: 'Expense' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setCategoryFilter(f.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                      categoryFilter === f.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Loading Digital Cash Register...
              </div>
            ) : filteredRegister.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs space-y-2">
                <Wallet className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="font-bold text-slate-700">No Cash Transactions Found</p>
                <p className="text-slate-400 max-w-sm mx-auto">
                  Confirmed cash collections from Monthly, Daily, or Daily Collection, plus any manual investments and cash expenses will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Ref / ID</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Particulars</th>
                      <th className="px-4 py-3 text-right text-emerald-700">Cash Received</th>
                      <th className="px-4 py-3 text-right text-purple-700">Investment</th>
                      <th className="px-4 py-3 text-right text-rose-700">Cash Paid / Outflow</th>
                      <th className="px-4 py-3 text-right font-black text-amber-800">Running Balance</th>
                      <th className="px-4 py-3">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {filteredRegister.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap font-sans text-[11px]">
                          {new Date(item.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap text-[11px]">
                          {item.id || item.referenceNumber || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-sans">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.source === 'MONTHLY'
                                ? 'bg-blue-100 text-blue-800'
                                : item.source === 'DAILY_FINANCE'
                                ? 'bg-amber-100 text-amber-800'
                                : item.source === 'DAILY_COLLECTION'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.source === 'INVESTMENT'
                                ? 'bg-purple-100 text-purple-800'
                                : item.source === 'DISBURSEMENT'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {item.sourceLabel || item.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-sans text-slate-800 text-[11px] max-w-xs truncate">
                          {item.particulars}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">
                          {item.cashInflowRupees > 0 ? `+ ${formatINR(item.cashInflowRupees)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-purple-600">
                          {item.investmentRupees > 0 ? `+ ${formatINR(item.investmentRupees)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-rose-600">
                          {item.cashOutflowRupees > 0 ? `− ${formatINR(item.cashOutflowRupees)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-amber-900 bg-amber-50/50">
                          {formatINR(item.runningBalanceRupees)}
                        </td>
                        <td className="px-4 py-3 font-sans text-slate-500 text-[10px] whitespace-nowrap">
                          {item.performedBy || 'admin'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DAILY RECONCILIATION BREAKDOWN (HANDWRITTEN DIARY REPLICA) */}
        {activeTab === 'daily_breakdown' && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2">
              <span className="font-semibold text-slate-700">
                Daily Ledger Summary matching handwritten cash register format
              </span>
              <span className="text-[11px]">
                Closing balance of each day becomes opening balance of next day
              </span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Loading daily breakdown...
              </div>
            ) : (!data?.dailyBreakdown || data.dailyBreakdown.length === 0) ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                No daily transactions recorded in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">இருப்பு (Opening)</th>
                      <th className="px-4 py-3 text-right text-blue-700">Mon (Monthly)</th>
                      <th className="px-4 py-3 text-right text-emerald-700">D.C (Daily Col.)</th>
                      <th className="px-4 py-3 text-right text-amber-700">D.I (Daily Fin.)</th>
                      <th className="px-4 py-3 text-right text-purple-700">Investment</th>
                      <th className="px-4 py-3 text-right text-rose-700">Disb. & Outflow</th>
                      <th className="px-4 py-3 text-right text-emerald-800 font-bold">மொத்த வரவு (Total)</th>
                      <th className="px-4 py-3 text-right font-black text-slate-900 bg-amber-50">இறுதி இருப்பு (Closing)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {data.dailyBreakdown.map((row) => (
                      <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-sans font-bold text-slate-900 whitespace-nowrap">
                          {row.displayDate}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {formatINR(row.openingBalanceRupees)}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-700 font-bold">
                          {row.monthlyCashRupees > 0 ? formatINR(row.monthlyCashRupees) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700 font-bold">
                          {row.dailyCollectionCashRupees > 0 ? formatINR(row.dailyCollectionCashRupees) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-700 font-bold">
                          {row.dailyFinanceCashRupees > 0 ? formatINR(row.dailyFinanceCashRupees) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-purple-700 font-bold">
                          {row.investmentRupees > 0 ? formatINR(row.investmentRupees) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-rose-600 font-bold">
                          {(row.disbursementRupees + row.outflowRupees) > 0
                            ? `− ${formatINR(row.disbursementRupees + row.outflowRupees)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700 bg-emerald-50/40">
                          + {formatINR(row.totalDayInflowRupees)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-900 bg-amber-50/80 text-sm">
                          {formatINR(row.closingBalanceRupees)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: INVESTMENTS HISTORY */}
        {activeTab === 'investments' && (
          <InvestmentsTab
            onReverse={(item) => {
              setReversalTarget({ type: 'investment', item });
              setReversalReason('');
            }}
            onAddNew={() => {
              setInvAmount('');
              setInvDesc('');
              setInvRef('');
              setFormError('');
              setIsInvestmentModalOpen(true);
            }}
          />
        )}

        {/* TAB 4: CASH OUTFLOWS HISTORY */}
        {activeTab === 'outflows' && (
          <OutflowsTab
            onReverse={(item) => {
              setReversalTarget({ type: 'outflow', item });
              setReversalReason('');
            }}
            onAddNew={() => {
              setOutAmount('');
              setOutDesc('');
              setOutRef('');
              setFormError('');
              setIsOutflowModalOpen(true);
            }}
          />
        )}
      </div>

      {/* 6. MODAL: ADD MANUAL INVESTMENT */}
      {isInvestmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <PlusCircle className="w-4 h-4 text-emerald-400" />
                <span>Add Capital Investment (முதலீடு வரவு)</span>
              </h3>
              <button
                onClick={() => setIsInvestmentModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddInvestment} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Record personal or owner capital directly introduced into the physical cash box. This increases Cash in Hand immediately.
              </p>

              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {formSuccess}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Investment Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="e.g. 100000"
                  value={invAmount}
                  onChange={(e) => setInvAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Investment Date *
                </label>
                <input
                  type="date"
                  required
                  value={invDate}
                  onChange={(e) => setInvDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Description / Remarks *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Owner capital added for monthly finance lending"
                  value={invDesc}
                  onChange={(e) => setInvDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Optional Reference Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bank slip # / Voucher #"
                  value={invRef}
                  onChange={(e) => setInvRef(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsInvestmentModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  {submitting ? 'Adding...' : 'Confirm & Add Investment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: ADD CASH OUTFLOW */}
      {isOutflowModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <MinusCircle className="w-4 h-4 text-rose-400" />
                <span>Record Cash Outflow (செலவு / பற்று)</span>
              </h3>
              <button
                onClick={() => setIsOutflowModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddOutflow} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Record physical cash paid out of the cash box for office expenses, personal owner withdrawals, or utilities.
              </p>

              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {formSuccess}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Outflow Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="e.g. 5000"
                  value={outAmount}
                  onChange={(e) => setOutAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={outCategory}
                    onChange={(e) => setOutCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                  >
                    <option value="EXPENSE">Expense (அலுவலக செலவு)</option>
                    <option value="WITHDRAWAL">Withdrawal (உரிமையாளர் பற்று)</option>
                    <option value="OTHER">Other Outflow</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={outDate}
                    onChange={(e) => setOutDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Description / Purpose *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Office rent / Electricity / Tea & snacks"
                  value={outDesc}
                  onChange={(e) => setOutDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Optional Reference / Bill #
                </label>
                <input
                  type="text"
                  placeholder="e.g. Receipt / Bill number"
                  value={outRef}
                  onChange={(e) => setOutRef(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsOutflowModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  {submitting ? 'Recording...' : 'Record Cash Outflow'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: SET ONE-TIME OPENING CASH BALANCE */}
      {isOpeningBalanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Settings className="w-4 h-4 text-amber-400" />
                <span>Set Opening Cash Balance (ஆரம்ப இருப்பு)</span>
              </h3>
              <button
                onClick={() => setIsOpeningBalanceModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSetOpeningBalance} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Set or adjust the starting physical cash count in the cash box. Full audit trail is preserved.
              </p>

              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {formSuccess}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Opening Cash Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  placeholder="e.g. 4150"
                  value={opbAmount}
                  onChange={(e) => setOpbAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Effective Date *
                </label>
                <input
                  type="date"
                  required
                  value={opbDate}
                  onChange={(e) => setOpbDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Physical cash count at counter start"
                  value={opbRemarks}
                  onChange={(e) => setOpbRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsOpeningBalanceModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-md shadow-amber-600/20 cursor-pointer"
                >
                  {submitting ? 'Updating...' : 'Save Opening Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MODAL: REVERSAL CONFIRMATION */}
      {reversalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Confirm Transaction Reversal</span>
              </h3>
              <button
                onClick={() => setReversalTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReversal} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Are you sure you want to reverse this {reversalTarget.type === 'investment' ? 'investment' : 'cash outflow'}?
                The transaction will be marked as REVERSED and Cash in Hand will be automatically updated with full audit trail.
              </p>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-xs space-y-1">
                <div>
                  <span className="text-slate-500 font-sans">ID: </span>
                  <span className="font-bold text-slate-800">
                    {reversalTarget.item.investmentId || reversalTarget.item.outflowId}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Amount: </span>
                  <span className="font-bold text-slate-900">
                    {formatINR(reversalTarget.item.amountRupees || (reversalTarget.item.amountPaise / 100))}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Description: </span>
                  <span className="text-slate-700">{reversalTarget.item.description}</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reason for Reversal *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Entered wrong amount / Duplicate entry"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setReversalTarget(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  {submitting ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Sub-Component: Investments Tab
 */
function InvestmentsTab({ onReverse, onAddNew }) {
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInvestments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/irupu/investments');
      if (res.data?.success) {
        setInvestments(res.data.investments || []);
      }
    } catch (err) {
      console.error('Failed to load investments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestments();
  }, []);

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-xs text-slate-900 flex items-center space-x-2">
          <span>Manual Capital Investments</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
            {investments.length} records
          </span>
        </h3>
        <button
          onClick={onAddNew}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
        >
          + Add Investment
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-xs">Loading investments...</div>
      ) : investments.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-xs">
          No manual investments recorded. Click + Add Investment to introduce capital.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Investment ID</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Ref #</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {investments.map((inv) => (
                <tr key={inv._id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900">{inv.investmentId}</td>
                  <td className="px-4 py-3 font-sans text-[11px] text-slate-600">
                    {new Date(inv.date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 font-sans text-slate-800">{inv.description}</td>
                  <td className="px-4 py-3 text-slate-500">{inv.referenceNumber || '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600 text-sm">
                    {formatINR(inv.amountRupees)}
                  </td>
                  <td className="px-4 py-3 text-center font-sans">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        inv.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-sans">
                    {inv.status === 'ACTIVE' && (
                      <button
                        onClick={() => onReverse(inv)}
                        className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded text-[11px] font-bold transition-colors cursor-pointer"
                        title="Reverse Investment"
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
  );
}

/**
 * Sub-Component: Outflows Tab
 */
function OutflowsTab({ onReverse, onAddNew }) {
  const [outflows, setOutflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('ALL');

  const fetchOutflows = async () => {
    setLoading(true);
    try {
      const params = {};
      if (catFilter !== 'ALL') params.category = catFilter;
      const res = await api.get('/irupu/outflows', { params });
      if (res.data?.success) {
        setOutflows(res.data.outflows || []);
      }
    } catch (err) {
      console.error('Failed to load outflows', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOutflows();
  }, [catFilter]);

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <h3 className="font-bold text-xs text-slate-900">Cash Outflow Records</h3>
          <div className="flex items-center space-x-1">
            {['ALL', 'EXPENSE', 'WITHDRAWAL', 'OTHER'].map((c) => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                  catFilter === c
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c === 'ALL' ? 'All' : c === 'EXPENSE' ? 'Expense' : c === 'WITHDRAWAL' ? 'Withdrawal' : 'Other'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onAddNew}
          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
        >
          − Add Cash Outflow
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-xs">Loading cash outflows...</div>
      ) : outflows.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-xs">
          No cash outflows recorded for this category.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Outflow ID</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Ref #</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {outflows.map((out) => (
                <tr key={out._id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900">{out.outflowId}</td>
                  <td className="px-4 py-3 font-sans text-[11px] text-slate-600">
                    {new Date(out.date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3 font-sans">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        out.category === 'EXPENSE'
                          ? 'bg-amber-100 text-amber-800'
                          : out.category === 'WITHDRAWAL'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {out.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-sans text-slate-800">{out.description}</td>
                  <td className="px-4 py-3 text-slate-500">{out.referenceNumber || '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-rose-600 text-sm">
                    − {formatINR(out.amountRupees)}
                  </td>
                  <td className="px-4 py-3 text-center font-sans">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        out.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {out.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-sans">
                    {out.status === 'ACTIVE' && (
                      <button
                        onClick={() => onReverse(out)}
                        className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded text-[11px] font-bold transition-colors cursor-pointer"
                        title="Reverse Outflow"
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
  );
}
