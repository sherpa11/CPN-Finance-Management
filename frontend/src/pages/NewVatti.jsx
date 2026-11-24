import React, { useState, useEffect } from 'react';
import {
  PlusCircle,
  Calculator,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  Layers,
  Coins,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { formatINR, formatDate, getFinanceBadge } from '../utils/formatters';
import SearchableCustomerSelect from '../components/SearchableCustomerSelect';
import api from '../api';

export default function NewVatti({ preselectedCustomer, onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomer?._id || '');
  const [vattiType, setVattiType] = useState('MONTHLY');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [interestRatePercent, setInterestRatePercent] = useState('2.0');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [remarks, setRemarks] = useState('');

  // Daily Collection specific states (Upfront Interest Deduction: 70 or 100 Days)
  const [totalDurationDays, setTotalDurationDays] = useState(100);
  const [upfrontInterestRupees, setUpfrontInterestRupees] = useState('');
  const [upfrontInterestPercent, setUpfrontInterestPercent] = useState('10.0');

  // Live Preview State
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');

  // Confirmation Modal
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdLoan, setCreatedLoan] = useState(null);
  const [createdDcAccount, setCreatedDcAccount] = useState(null);

  // Load Customers
  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await api.get('/customers?status=ACTIVE&limit=200&fields=dropdown');
        if (res.data.success) {
          setCustomers(res.data.customers);
          if (!selectedCustomerId && res.data.customers.length > 0) {
            setSelectedCustomerId(res.data.customers[0]._id);
          }
        }
      } catch (err) {
        console.error('Failed to load customers for loan form', err);
      }
    }
    loadCustomers();
  }, []);

  // Sync Daily Collection upfront interest (Rupees <-> Percent two-way sync)
  const handleUpfrontRupeesChange = (val) => {
    setUpfrontInterestRupees(val);
    const p = Number(principalAmount);
    const rupees = Number(val);
    if (p > 0 && !isNaN(rupees) && val !== '') {
      const pct = ((rupees / p) * 100).toFixed(2);
      setUpfrontInterestPercent(pct);
    }
  };

  const handleUpfrontPercentChange = (val) => {
    setUpfrontInterestPercent(val);
    const p = Number(principalAmount);
    const pct = Number(val);
    if (p > 0 && !isNaN(pct) && val !== '') {
      const rupees = Math.round((p * pct) / 100);
      setUpfrontInterestRupees(String(rupees));
    }
  };

  // Recalculate upfront rupees when principal changes if percentage is set
  useEffect(() => {
    if (vattiType === 'DAILY_COLLECTION') {
      const p = Number(principalAmount);
      const pct = Number(upfrontInterestPercent);
      if (p > 0 && !isNaN(pct)) {
        setUpfrontInterestRupees(String(Math.round((p * pct) / 100)));
      }
    }
  }, [principalAmount, vattiType]);

  // Update default rate & due date when Vatti type changes
  useEffect(() => {
    const today = new Date(startDate || Date.now());
    if (vattiType === 'MONTHLY') {
      setInterestRatePercent('2.0');
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      setDueDate(nextMonth.toISOString().split('T')[0]);
    } else if (vattiType === 'DAILY') {
      setInterestRatePercent('0.1');
      const next10Days = new Date(today);
      next10Days.setDate(next10Days.getDate() + 10);
      setDueDate(next10Days.toISOString().split('T')[0]);
    } else if (vattiType === 'DAILY_COLLECTION') {
      // 70 or 100 calendar days (Start date is Day 1)
      const completionDate = new Date(today);
      completionDate.setDate(completionDate.getDate() + (Number(totalDurationDays) - 1));
      setDueDate(completionDate.toISOString().split('T')[0]);
    }
  }, [vattiType, startDate, totalDurationDays]);

  // Fetch Live Calculation Preview
  useEffect(() => {
    async function fetchPreview() {
      if (!principalAmount || Number(principalAmount) <= 0) {
        setPreview(null);
        return;
      }

      setPreviewLoading(true);
      setError('');
      try {
        if (vattiType === 'DAILY_COLLECTION') {
          const res = await api.post('/daily-collections/preview', {
            scheme: 'UPFRONT_DEDUCTION',
            grossPrincipal: Number(principalAmount),
            upfrontInterestRupees: upfrontInterestRupees !== '' ? Number(upfrontInterestRupees) : undefined,
            upfrontInterestPercent: upfrontInterestPercent !== '' ? Number(upfrontInterestPercent) : undefined,
            totalDurationDays: Number(totalDurationDays),
            startDate,
          });
          if (res.data.success) {
            setPreview({
              isDailyCollection: true,
              ...res.data.preview,
            });
          }
        } else {
          if (!dueDate || !interestRatePercent) {
            setPreview(null);
            setPreviewLoading(false);
            return;
          }
          const res = await api.post('/loans/preview', {
            vattiType,
            principalAmount: Number(principalAmount),
            interestRatePercent: Number(interestRatePercent),
            startDate,
            dueDate,
          });
          if (res.data.success) {
            setPreview({
              isDailyCollection: false,
              ...res.data.preview,
            });
          }
        }
      } catch (err) {
        console.error('Preview error', err);
        setError(err.response?.data?.message || 'Error generating calculation forecast');
      } finally {
        setPreviewLoading(false);
      }
    }

    const debounce = setTimeout(fetchPreview, 250);
    return () => clearTimeout(debounce);
  }, [
    vattiType,
    principalAmount,
    interestRatePercent,
    startDate,
    dueDate,
    upfrontInterestRupees,
    upfrontInterestPercent,
    totalDurationDays,
  ]);

  const handlePreConfirm = (e) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setError('Please select a borrower customer.');
      return;
    }
    if (!principalAmount || Number(principalAmount) <= 0) {
      setError('Please enter a valid principal amount.');
      return;
    }
    if (vattiType === 'DAILY_COLLECTION') {
      if (Number(upfrontInterestRupees) > Number(principalAmount)) {
        setError('Upfront interest deduction cannot exceed gross loan amount.');
        return;
      }
    } else {
      if (!dueDate) {
        setError('Please select a maturity/due date.');
        return;
      }
    }
    setError('');
    setIsConfirmOpen(true);
  };

  const handleFinalSave = async () => {
    setSubmitting(true);
    setError('');
    try {
      if (vattiType === 'DAILY_COLLECTION') {
        const res = await api.post('/daily-collections', {
          customerId: selectedCustomerId,
          scheme: 'UPFRONT_DEDUCTION',
          grossPrincipal: Number(principalAmount),
          upfrontInterestRupees: Number(upfrontInterestRupees) || 0,
          upfrontInterestPercent: Number(upfrontInterestPercent) || 0,
          totalDurationDays: Number(totalDurationDays),
          additionalInterestDays: 0,
          startDate,
          remarks,
        });

        if (res.data.success) {
          setCreatedDcAccount(res.data.account);
          setCreatedLoan(res.data.loan);
          setIsConfirmOpen(false);
        }
      } else {
        const res = await api.post('/loans', {
          customerId: selectedCustomerId,
          vattiType,
          principalAmount: Number(principalAmount),
          interestRatePercent: Number(interestRatePercent),
          startDate,
          dueDate,
          remarks,
        });

        if (res.data.success) {
          setCreatedLoan(res.data.loan);
          setIsConfirmOpen(false);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to disburse loan');
      setIsConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCustomerObj = customers.find((c) => c._id === selectedCustomerId);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <PlusCircle className="w-5 h-5 text-amber-500" />
            <span>New Finance / Loan Disbursement</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Disburse Monthly, Daily, or Daily Collection (70 or 100 Days Upfront Interest Deduction)
          </p>
        </div>
      </div>

      {createdLoan ? (
        /* Success Screen */
        <div className="bg-white p-8 rounded-xl border border-emerald-200 shadow-md text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">
            {createdDcAccount ? 'Daily Collection Account Disbursed!' : 'Loan Disbursed Successfully!'}
          </h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Account{' '}
            <span className="font-mono font-bold text-blue-700">
              {createdDcAccount ? createdDcAccount.accountId : createdLoan.loanId}
            </span>{' '}
            has been created for <span className="font-bold text-slate-900">{createdLoan.customerName}</span>. Customer balances and {createdDcAccount?.totalDurationDays || totalDurationDays}-day collection schedule are initialized.
          </p>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 max-w-sm mx-auto text-xs font-mono space-y-1.5 text-left">
            <div className="flex justify-between font-sans">
              <span className="text-slate-500">Gross Principal:</span>
              <span className="font-bold text-slate-900">{formatINR(createdLoan.principalPaise / 100)}</span>
            </div>
            {createdDcAccount && (
              <>
                <div className="flex justify-between font-sans">
                  <span className="text-slate-500">Net Cash Given:</span>
                  <span className="font-bold text-emerald-700">{formatINR(createdDcAccount.netDisbursementPaise / 100)}</span>
                </div>
                <div className="flex justify-between font-sans">
                  <span className="text-slate-500">Upfront Interest Deducted:</span>
                  <span className="font-bold text-rose-700">
                    - {formatINR(createdDcAccount.upfrontInterestPaise / 100)} ({createdDcAccount.upfrontInterestPercent}%)
                  </span>
                </div>
                <div className="flex justify-between font-sans">
                  <span className="text-slate-500">Daily Instalment:</span>
                  <span className="font-bold text-slate-900">{formatINR(createdDcAccount.dailyInstalmentPaise / 100)} / day</span>
                </div>
                <div className="flex justify-between font-sans">
                  <span className="text-slate-500">Total Duration:</span>
                  <span className="font-bold text-slate-900">{createdDcAccount.totalDurationDays || totalDurationDays} Calendar Days</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-sans">
              <span className="text-slate-500">Expected Completion:</span>
              <span className="font-bold text-slate-900">{formatDate(createdLoan.dueDate)}</span>
            </div>
          </div>

          <div className="flex justify-center space-x-3 pt-4">
            <button
              onClick={() => {
                setCreatedLoan(null);
                setCreatedDcAccount(null);
                setPrincipalAmount('');
                setRemarks('');
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              + Disburse Another Account
            </button>
            {createdDcAccount ? (
              <button
                onClick={() => onNavigate('daily-collection')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center space-x-1.5"
              >
                <Layers className="w-4 h-4" />
                <span>Open {createdDcAccount.totalDurationDays || totalDurationDays}-Day Collection Tracker</span>
              </button>
            ) : (
              <button
                onClick={() => onNavigate('dashboard')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Go to Dashboard
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Form & Live Forecast */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form (2 cols) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-5">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handlePreConfirm} className="space-y-4 text-xs">
              {/* Customer Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Customer *</label>
                <SearchableCustomerSelect
                  required
                  value={selectedCustomerId}
                  customers={customers}
                  onChange={(id) => setSelectedCustomerId(id)}
                  placeholder="Search by customer name or mobile number..."
                />
                <div className="mt-1 text-[11px] text-slate-400">
                  Don't see borrower?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('customers')}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Add new customer first
                  </button>
                </div>
              </div>

              {/* Finance Type Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Finance Category *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  {[
                    { id: 'MONTHLY', label: '1. Monthly Finance', desc: 'Simple interest monthly' },
                    { id: 'DAILY', label: '2. Daily Finance', desc: 'Simple interest daily' },
                    { id: 'DAILY_COLLECTION', label: '3. Daily Collection', desc: 'Upfront Interest (70 or 100 days)' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setVattiType(cat.id)}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer min-h-[50px] ${
                        vattiType === cat.id
                          ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                      }`}
                    >
                      <p className="font-bold text-xs sm:text-sm">{cat.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{cat.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Daily Collection Duration Option Selection (70 or 100 Days) */}
              {vattiType === 'DAILY_COLLECTION' && (
                <div className="p-3 sm:p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
                  <label className="block font-bold text-slate-800 text-xs">
                    Collection Duration / தவணை நாட்கள் *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {[
                      { days: 70, label: '70 Days (70 நாட்கள்)', desc: 'Daily instalment = Gross ÷ 70' },
                      { days: 100, label: '100 Days (100 நாட்கள்)', desc: 'Daily instalment = Gross ÷ 100' },
                    ].map((opt) => (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => setTotalDurationDays(opt.days)}
                        className={`p-3 rounded-lg border text-left transition-all cursor-pointer min-h-[50px] ${
                          totalDurationDays === opt.days
                            ? 'border-emerald-600 bg-white text-emerald-950 ring-2 ring-emerald-500/30 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white/60 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{opt.label}</span>
                          {totalDurationDays === opt.days && (
                            <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded-full">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Principal Amount & Rate / Upfront Interest Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {vattiType === 'DAILY_COLLECTION' ? 'Gross Loan Amount (₹) *' : 'Principal Amount (₹) *'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      required
                      min="100"
                      step="1"
                      placeholder="e.g. 100000"
                      value={principalAmount}
                      onChange={(e) => setPrincipalAmount(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {vattiType === 'DAILY_COLLECTION' && principalAmount > 0 && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Daily Instalment:{' '}
                      <span className="font-bold text-emerald-700">
                        {formatINR(Math.floor(Number(principalAmount) / totalDurationDays))} / day ({totalDurationDays} Days)
                      </span>
                    </p>
                  )}
                </div>

                {/* For Standard Monthly & Daily Finance */}
                {vattiType !== 'DAILY_COLLECTION' ? (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Individual Interest Rate (% {vattiType === 'DAILY' ? 'per Day' : 'per Month'}) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        placeholder="e.g. 2.0"
                        value={interestRatePercent}
                        onChange={(e) => setInterestRatePercent(e.target.value)}
                        className="w-full pr-8 pl-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="absolute right-3 top-2.5 font-bold text-slate-400">%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Saved as permanent snapshot on this loan.
                    </p>
                  </div>
                ) : (
                  /* Daily Collection: Upfront interest inputs with two-way sync */
                  <div className="space-y-1.5">
                    <label className="block font-semibold text-slate-700">
                      Upfront Interest Deduction (முன் வட்டி) *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          required
                          min="0"
                          placeholder="Amount in ₹"
                          value={upfrontInterestRupees}
                          onChange={(e) => handleUpfrontRupeesChange(e.target.value)}
                          className="w-full pl-6 pr-2 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="% Rate"
                          value={upfrontInterestPercent}
                          onChange={(e) => handleUpfrontPercentChange(e.target.value)}
                          className="w-full pr-6 pl-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="absolute right-2.5 top-2 font-bold text-slate-400">%</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Auto-syncs ₹ and %. Deducted upfront and never collected in daily instalments.
                    </p>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Disbursement / Start Date *</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500"
                  />
                  {vattiType === 'DAILY_COLLECTION' && (
                    <p className="text-[10px] text-slate-400 mt-0.5">Start Date is Day 1 of {totalDurationDays} days.</p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {vattiType === 'DAILY_COLLECTION' ? `Expected Completion Date (Day ${totalDurationDays}) *` : 'Maturity / Due Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    readOnly={vattiType === 'DAILY_COLLECTION'}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500 ${
                      vattiType === 'DAILY_COLLECTION' ? 'bg-slate-100 cursor-not-allowed font-medium' : ''
                    }`}
                  />
                  {vattiType === 'DAILY_COLLECTION' && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Automatically calculated as Start Date + {totalDurationDays - 1} calendar days.
                    </p>
                  )}
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Remarks / Collateral / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Promissory note signed, Cheque leaf #4401 received"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Submit Trigger */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-blue-700 to-blue-900 hover:from-blue-600 hover:to-blue-800 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <span>Review & Confirm Disbursement</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          {/* Real-time Calculation Forecast Card (1 col) */}
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                  <Calculator className="w-4 h-4 text-blue-600" />
                  <span>Real-time Calculation</span>
                </h3>
                {previewLoading && <span className="text-[10px] text-blue-600 animate-pulse">Calculating...</span>}
              </div>

              {preview?.isDailyCollection ? (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-2.5 bg-emerald-100/70 border border-emerald-200 rounded-lg text-emerald-900 font-sans text-[11px] flex items-center justify-between">
                    <span className="font-bold">Daily Collection (முன் வட்டி)</span>
                    <span className="font-bold px-2 py-0.5 bg-emerald-600 text-white text-[10px] rounded">
                      {preview.totalDurationDays || totalDurationDays} Days
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Gross Loan Amount:</span>
                    <span className="font-bold text-slate-900">{formatINR(preview.grossPrincipalRupees)}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200/60 font-sans text-rose-700">
                    <span className="font-semibold">Upfront Interest ({preview.upfrontInterestPercent}%):</span>
                    <span className="font-bold">- {formatINR(preview.upfrontInterestRupees)}</span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans bg-emerald-50 px-2 rounded">
                    <span className="font-bold text-emerald-800">Net Cash Given:</span>
                    <span className="font-bold text-emerald-800">{formatINR(preview.netDisbursementRupees)}</span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Daily Instalment:</span>
                    <span className="font-bold text-sm text-blue-800">
                      {formatINR(preview.dailyInstalmentRupees)} / day
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Duration:</span>
                    <span className="font-bold text-slate-900">{preview.totalDurationDays || totalDurationDays} Calendar Days</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Expected End Date:</span>
                    <span className="font-bold text-slate-900">{formatDate(preview.expectedCompletionDate)}</span>
                  </div>

                  <div className="flex justify-between py-2 border-t-2 border-slate-300 font-sans text-slate-950 font-bold">
                    <span>Total Repayment:</span>
                    <span className="text-base text-blue-700">{formatINR(preview.totalRepaymentRupees)}</span>
                  </div>
                </div>
              ) : preview ? (
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Gross Principal:</span>
                    <span className="font-bold text-slate-900">{formatINR(preview.principalAmount)}</span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Interest Rate:</span>
                    <span className="font-bold text-slate-900">{preview.interestRatePercent}% {vattiType === 'MONTHLY' ? '/ Month' : '/ Day'}</span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Duration:</span>
                    <span className="font-bold text-slate-900">
                      {preview.eligibleUnits} {preview.unitLabel}
                    </span>
                  </div>

                  {vattiType === 'MONTHLY' || preview.isUpfrontDeduction ? (
                    <>
                      <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans text-rose-700">
                        <span className="font-semibold">Upfront Interest Deducted:</span>
                        <span className="font-bold text-sm">- {formatINR(preview.expectedInterestRupees)}</span>
                      </div>

                      <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans text-emerald-800 font-bold bg-emerald-50 px-2 rounded">
                        <span>Net Cash Given:</span>
                        <span className="text-sm">{formatINR(preview.netAmountGivenRupees ?? (preview.principalAmount - preview.expectedInterestRupees))}</span>
                      </div>

                      <div className="flex justify-between py-2 border-t-2 border-slate-300 font-sans text-slate-950 font-bold">
                        <span>Total Payable:</span>
                        <span className="text-base text-blue-700">{formatINR(preview.expectedTotalPayableRupees)}</span>
                      </div>
                      <div className="text-[11px] font-sans text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
                        ℹ️ Interest is deducted upfront at disbursement. The customer repays the net payable amount of {formatINR(preview.expectedTotalPayableRupees)}.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans text-purple-800">
                        <span className="font-semibold">Expected Interest:</span>
                        <span className="font-bold text-sm">{formatINR(preview.expectedInterestRupees)}</span>
                      </div>

                      <div className="flex justify-between py-2 border-t-2 border-slate-300 font-sans text-slate-950 font-bold">
                        <span>Total Payable:</span>
                        <span className="text-base text-blue-700">{formatINR(preview.expectedTotalPayableRupees)}</span>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Enter Principal to view live calculation forecast.
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-400">
              Calculated using integer-precision financial engine in Asia/Kolkata timezone.
            </div>
          </div>
        </div>
      )}

      {/* Pre-save Confirmation Modal */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-blue-600 shrink-0" />
              <span>Confirm {vattiType === 'DAILY_COLLECTION' ? 'Daily Collection' : 'Finance'} Disbursement</span>
            </h3>

            <p className="text-xs text-slate-600">
              Please verify all agreed terms before proceeding. Once confirmed, ledger entries will be created and the {totalDurationDays}-day collection schedule will be initialized.
            </p>

            <div className="bg-slate-50 p-3.5 sm:p-4 rounded-lg border border-slate-200 text-xs font-mono space-y-1.5">
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Borrower:</span>
                <span className="font-bold text-slate-900 truncate ml-2">{selectedCustomerObj?.name}</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Category:</span>
                <span className="font-bold text-blue-700 ml-2">
                  {vattiType === 'DAILY_COLLECTION'
                    ? `Daily Collection (முன் வட்டி: ${totalDurationDays} நாட்கள்)`
                    : `${vattiType} Finance`}
                </span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Gross Principal:</span>
                <span className="font-bold text-slate-900">{formatINR(Number(principalAmount))}</span>
              </div>

              {vattiType === 'DAILY_COLLECTION' && (
                <>
                  <div className="flex justify-between font-sans text-rose-700">
                    <span className="font-semibold">Upfront Interest Deducted:</span>
                    <span className="font-bold">
                      - {formatINR(Number(upfrontInterestRupees))} ({upfrontInterestPercent}%)
                    </span>
                  </div>

                  <div className="flex justify-between font-sans text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                    <span>Net Cash Given to Customer:</span>
                    <span>{formatINR(Number(principalAmount) - Number(upfrontInterestRupees))}</span>
                  </div>

                  <div className="flex justify-between font-sans">
                    <span className="text-slate-500">Daily Instalment:</span>
                    <span className="font-bold text-blue-800">
                      {formatINR(Math.floor(Number(principalAmount) / totalDurationDays))} / day
                    </span>
                  </div>

                  <div className="flex justify-between font-sans">
                    <span className="text-slate-500">Total Duration:</span>
                    <span className="font-bold text-slate-900">{totalDurationDays} Calendar Days</span>
                  </div>
                </>
              )}

              {vattiType === 'MONTHLY' && (
                <>
                  <div className="flex justify-between font-sans text-rose-700">
                    <span className="font-semibold">Upfront Interest Deducted:</span>
                    <span className="font-bold">
                      - {formatINR(preview?.expectedInterestRupees || 0)} ({interestRatePercent}% / month)
                    </span>
                  </div>

                  <div className="flex justify-between font-sans text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                    <span>Net Cash Given to Customer:</span>
                    <span>{formatINR(preview?.netAmountGivenRupees ?? (Number(principalAmount) - (preview?.expectedInterestRupees || 0)))}</span>
                  </div>

                  <div className="flex justify-between font-sans font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded">
                    <span>Total Payable by Customer:</span>
                    <span>{formatINR(preview?.expectedTotalPayableRupees ?? (Number(principalAmount) - (preview?.expectedInterestRupees || 0)))}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Disbursement Date:</span>
                <span className="text-slate-900">{formatDate(startDate)}</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Expected End Date:</span>
                <span className="font-bold text-slate-900">{formatDate(dueDate)}</span>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[38px]"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalSave}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 min-h-[38px]"
              >
                {submitting ? 'Disbursing...' : 'Confirm & Disburse'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
