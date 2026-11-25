import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Clock,
  Layers,
  Info,
  DollarSign,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { formatINR, formatDate } from '../utils/formatters';
import SearchableCustomerSelect from './SearchableCustomerSelect';
import api from '../api';

export default function ExistingLoanModal({
  isOpen,
  onClose,
  vattiType = 'MONTHLY',
  customers = [],
  onSuccess,
}) {
  if (!isOpen) return null;

  const isDaily = vattiType === 'DAILY';
  const periodLabel = isDaily ? '10 Days' : '1 Month';
  const titleLabel = isDaily ? 'Daily Finance' : 'Monthly Finance';

  // Form Fields
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [originalLoanDate, setOriginalLoanDate] = useState(() => {
    // Default to roughly 6 months ago for convenience
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
  });
  const [originalPrincipal, setOriginalPrincipal] = useState('');
  const [interestRatePercent, setInterestRatePercent] = useState('2.0');
  
  const [isCustomUpfront, setIsCustomUpfront] = useState(false);
  const [originalUpfrontInterest, setOriginalUpfrontInterest] = useState('');
  
  const [isCustomNetGiven, setIsCustomNetGiven] = useState(false);
  const [originalNetGiven, setOriginalNetGiven] = useState('');

  const [outstandingPrincipal, setOutstandingPrincipal] = useState('');
  const [isCustomRenewalInterest, setIsCustomRenewalInterest] = useState(false);
  const [renewalInterestAmount, setRenewalInterestAmount] = useState('');

  const [lastPaidThroughDate, setLastPaidThroughDate] = useState(() => {
    // Default to roughly 1 period ago
    const d = new Date();
    if (isDaily) {
      d.setDate(d.getDate() - 10);
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    return d.toISOString().split('T')[0];
  });

  const [nextDueDate, setNextDueDate] = useState('');
  const [isManualDueDate, setIsManualDueDate] = useState(false);

  const [completedRenewals, setCompletedRenewals] = useState('');
  const [isManualRenewals, setIsManualRenewals] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [historicalReference, setHistoricalReference] = useState('');
  const [remarks, setRemarks] = useState('');

  // UI Flow & Validation State
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [error, setError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-calculated Upfront Interest & Net Given
  const autoUpfrontInterest = originalPrincipal && interestRatePercent
    ? Math.round((Number(originalPrincipal) * Number(interestRatePercent)) / 100)
    : 0;

  const effectiveUpfrontInterest = isCustomUpfront && originalUpfrontInterest !== ''
    ? Number(originalUpfrontInterest)
    : autoUpfrontInterest;

  const autoNetGiven = originalPrincipal
    ? Math.max(0, Number(originalPrincipal) - effectiveUpfrontInterest)
    : 0;

  const effectiveNetGiven = isCustomNetGiven && originalNetGiven !== ''
    ? Number(originalNetGiven)
    : autoNetGiven;

  // Auto-calculated Renewal Interest per period based on original gross principal (Original Gross Principal × Rate)
  const autoRenewalInterest = originalPrincipal && interestRatePercent
    ? Math.round((Number(originalPrincipal) * Number(interestRatePercent)) / 100)
    : 0;

  const effectiveRenewalInterest = isCustomRenewalInterest && renewalInterestAmount !== ''
    ? Number(renewalInterestAmount)
    : autoRenewalInterest;

  // Date Logic: Compute suggested next due date & renewal count
  useEffect(() => {
    if (!originalLoanDate || !lastPaidThroughDate) return;

    try {
      const orig = new Date(originalLoanDate);
      const lastPaid = new Date(lastPaidThroughDate);

      if (isNaN(orig.getTime()) || isNaN(lastPaid.getTime()) || lastPaid < orig) {
        return;
      }

      if (isDaily) {
        // Daily Finance: 10 calendar days per renewal
        const diffMs = lastPaid.getTime() - orig.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const suggestedRenewals = Math.max(0, Math.floor(diffDays / 10));
        
        if (!isManualRenewals) {
          setCompletedRenewals(String(suggestedRenewals));
        }

        if (!isManualDueDate) {
          const nextDue = new Date(lastPaid);
          nextDue.setDate(nextDue.getDate() + 10);
          setNextDueDate(nextDue.toISOString().split('T')[0]);
        }
      } else {
        // Monthly Finance: 1 calendar month per renewal
        let months = (lastPaid.getFullYear() - orig.getFullYear()) * 12 + (lastPaid.getMonth() - orig.getMonth());
        if (lastPaid.getDate() < orig.getDate()) {
          months = Math.max(0, months - 1);
        }
        const suggestedRenewals = Math.max(0, months);

        if (!isManualRenewals) {
          setCompletedRenewals(String(suggestedRenewals));
        }

        if (!isManualDueDate) {
          const nextDue = new Date(lastPaid);
          nextDue.setMonth(nextDue.getMonth() + 1);
          setNextDueDate(nextDue.toISOString().split('T')[0]);
        }
      }
    } catch (err) {
      console.warn('Date calculation warning:', err);
    }
  }, [originalLoanDate, lastPaidThroughDate, isDaily, isManualDueDate, isManualRenewals]);

  // Validation before opening confirmation
  const handleProceedToReview = (e) => {
    e.preventDefault();
    setError('');

    if (!selectedCustomerId) {
      setError('Please select a borrower.');
      return;
    }
    if (!originalPrincipal || Number(originalPrincipal) <= 0) {
      setError('Original gross principal must be greater than zero.');
      return;
    }
    if (!interestRatePercent || Number(interestRatePercent) < 0) {
      setError('Interest rate must be zero or positive.');
      return;
    }
    if (outstandingPrincipal !== '' && Number(outstandingPrincipal) < 0) {
      setError('Current outstanding principal cannot be negative.');
      return;
    }
    if (outstandingPrincipal !== '' && Number(outstandingPrincipal) > Number(originalPrincipal)) {
      setError('Current outstanding principal cannot exceed original principal amount.');
      return;
    }
    if (!originalLoanDate) {
      setError('Original loan date is required.');
      return;
    }
    if (!lastPaidThroughDate) {
      setError('Last interest-paid date is required.');
      return;
    }
    if (new Date(lastPaidThroughDate) < new Date(originalLoanDate)) {
      setError('Last interest-paid date cannot be earlier than the original loan date.');
      return;
    }
    if (!nextDueDate) {
      setError('Next renewal due date is required.');
      return;
    }

    setIsConfirmationOpen(true);
  };

  // Submit to Backend API
  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        customerId: selectedCustomerId,
        vattiType,
        originalLoanDate,
        originalPrincipal: Number(originalPrincipal),
        interestRatePercent: Number(interestRatePercent),
        originalUpfrontInterest: effectiveUpfrontInterest,
        originalNetGiven: effectiveNetGiven,
        currentOutstandingPrincipal: outstandingPrincipal !== '' ? Number(outstandingPrincipal) : Number(originalPrincipal),
        renewalInterestAmount: effectiveRenewalInterest,
        lastPaidThroughDate,
        nextDueDate,
        completedRenewals: completedRenewals !== '' ? parseInt(completedRenewals, 10) : 0,
        paymentMethod,
        historicalReference: historicalReference.trim(),
        remarks: remarks.trim(),
      };

      const res = await api.post('/loans/legacy', payload);

      if (res.data && res.data.success) {
        if (onSuccess) {
          onSuccess(res.data.loan);
        }
        onClose();
      } else {
        setError(res.data?.message || 'Failed to save legacy loan.');
        setIsConfirmationOpen(false);
      }
    } catch (err) {
      console.error('Legacy loan creation error:', err);
      setError(err.response?.data?.message || err.message || 'Error importing legacy loan.');
      setIsConfirmationOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Find customer display name for confirmation
  const selectedCustomerObj = customers.find((c) => (c._id || c.id) === selectedCustomerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-6 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-lg ${isDaily ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center space-x-2">
                <span>+ Add Existing {titleLabel} Loan</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Legacy Entry
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Import an existing historical loan with completed past renewals without affecting today's Cash in Hand.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Callout */}
        <div className="bg-amber-50 border-b border-amber-200/80 px-5 py-3 flex items-start space-x-3 text-amber-900">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold">Opening Balance Migration:</span> Historical interest and disbursement records are informational. They will <span className="underline font-bold">never</span> be deducted from or added to today's physical Cash in Hand. Future renewals and collections will be tracked normally.
          </div>
        </div>

        {error && (
          <div className="m-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Error:</span> {error}
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleProceedToReview} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* 1. Borrower Search */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Select Borrower / வாடிக்கையாளர் *
            </label>
            <SearchableCustomerSelect
              required
              value={selectedCustomerId}
              customers={customers}
              onChange={(id) => setSelectedCustomerId(id)}
              placeholder="Search borrower by name or mobile number..."
            />
          </div>

          {/* 2. Original Loan Date & Gross Principal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Original Loan Date / அசல் வழங்கிய தேதி *
              </label>
              <input
                type="date"
                required
                value={originalLoanDate}
                onChange={(e) => setOriginalLoanDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Original Gross Principal (₹) / ஆரம்ப அசல் *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  placeholder="e.g. 100000"
                  value={originalPrincipal}
                  onChange={(e) => setOriginalPrincipal(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 3. Interest Rate & Upfront Interest */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Interest Rate (% per {periodLabel}) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  placeholder="e.g. 2.0"
                  value={interestRatePercent}
                  onChange={(e) => setInterestRatePercent(e.target.value)}
                  className="w-full pl-3 pr-7 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
              </div>
            </div>

            {/* Current Outstanding Principal (Separate from original principal) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Current Outstanding Principal (₹) *
                </label>
                <span className="text-[10px] text-slate-400">Can be &lt; original</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={originalPrincipal ? `Default: ${originalPrincipal}` : 'e.g. 100000'}
                  value={outstandingPrincipal}
                  onChange={(e) => setOutstandingPrincipal(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Leave blank if equal to original principal (₹{originalPrincipal ? formatINR(Number(originalPrincipal)) : '0'}).
              </p>
            </div>
          </div>

          {/* Upfront Interest & Net Amount Breakdown (Collapsible / Informational) */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Original Disbursement Details (Informational)</span>
              <div className="flex items-center space-x-3 text-[11px]">
                <label className="flex items-center space-x-1 cursor-pointer text-slate-600">
                  <input
                    type="checkbox"
                    checked={isCustomUpfront}
                    onChange={(e) => {
                      setIsCustomUpfront(e.target.checked);
                      if (!e.target.checked) setOriginalUpfrontInterest('');
                    }}
                    className="rounded text-blue-600"
                  />
                  <span>Custom Upfront</span>
                </label>
                <label className="flex items-center space-x-1 cursor-pointer text-slate-600">
                  <input
                    type="checkbox"
                    checked={isCustomNetGiven}
                    onChange={(e) => {
                      setIsCustomNetGiven(e.target.checked);
                      if (!e.target.checked) setOriginalNetGiven('');
                    }}
                    className="rounded text-blue-600"
                  />
                  <span>Custom Net Given</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Original Upfront Interest (₹)
                </label>
                {isCustomUpfront ? (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={originalUpfrontInterest}
                    onChange={(e) => setOriginalUpfrontInterest(e.target.value)}
                    placeholder={String(autoUpfrontInterest)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-mono font-bold bg-white"
                  />
                ) : (
                  <div className="px-2.5 py-1.5 bg-slate-100 rounded-md text-xs font-mono font-bold text-slate-800">
                    ₹{formatINR(autoUpfrontInterest)} ({interestRatePercent}%)
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Original Net Amount Given (₹)
                </label>
                {isCustomNetGiven ? (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={originalNetGiven}
                    onChange={(e) => setOriginalNetGiven(e.target.value)}
                    placeholder={String(autoNetGiven)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-mono font-bold bg-white"
                  />
                ) : (
                  <div className="px-2.5 py-1.5 bg-slate-100 rounded-md text-xs font-mono font-bold text-slate-800">
                    ₹{formatINR(autoNetGiven)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Renewal Interest Amount (Customizable independently of rate) */}
          <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">
                Renewal Interest per {periodLabel} (₹) *
              </label>
              <label className="flex items-center space-x-1.5 text-[11px] text-blue-700 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={isCustomRenewalInterest}
                  onChange={(e) => {
                    setIsCustomRenewalInterest(e.target.checked);
                    if (!e.target.checked) setRenewalInterestAmount('');
                    else setRenewalInterestAmount(String(autoRenewalInterest));
                  }}
                  className="rounded text-blue-600"
                />
                <span>Custom Interest Amount</span>
              </label>
            </div>

            {isCustomRenewalInterest ? (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={renewalInterestAmount}
                  onChange={(e) => setRenewalInterestAmount(e.target.value)}
                  placeholder={String(autoRenewalInterest)}
                  className="w-full pl-7 pr-3 py-2 border border-blue-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-blue-200 text-xs font-mono font-bold text-blue-900">
                <span>Calculated Interest:</span>
                <span className="text-sm font-black text-blue-700">₹{formatINR(autoRenewalInterest)}</span>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              This is the fixed interest charged for each future renewal period until full principal settlement.
            </p>
          </div>

          {/* 5. Date Logic: Last Paid-Through Date, Next Due Date & Completed Renewals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Last Paid-Through Date *
              </label>
              <input
                type="date"
                required
                value={lastPaidThroughDate}
                onChange={(e) => {
                  setLastPaidThroughDate(e.target.value);
                  setIsManualDueDate(false);
                  setIsManualRenewals(false);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Date up to which interest is paid</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Next Due Date *
                </label>
                <button
                  type="button"
                  onClick={() => setIsManualDueDate(!isManualDueDate)}
                  className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                >
                  {isManualDueDate ? 'Auto' : 'Override'}
                </button>
              </div>
              <input
                type="date"
                required
                value={nextDueDate}
                onChange={(e) => {
                  setNextDueDate(e.target.value);
                  setIsManualDueDate(true);
                }}
                className={`w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold focus:outline-none ${
                  isManualDueDate ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300 bg-white'
                }`}
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                {isManualDueDate ? 'Manual override active' : `Suggested: +${periodLabel}`}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Completed Renewals *
                </label>
                <button
                  type="button"
                  onClick={() => setIsManualRenewals(!isManualRenewals)}
                  className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                >
                  {isManualRenewals ? 'Auto' : 'Override'}
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={completedRenewals}
                onChange={(e) => {
                  setCompletedRenewals(e.target.value);
                  setIsManualRenewals(true);
                }}
                placeholder="0"
                className={`w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold focus:outline-none ${
                  isManualRenewals ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300 bg-white'
                }`}
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                {isManualRenewals ? 'Manual count' : 'Calculated from dates'}
              </p>
            </div>
          </div>

          {/* 6. Historical Reference & Remarks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Historical Book / Ledger Ref (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Old Ledger Book 2, Page 45"
                value={historicalReference}
                onChange={(e) => setHistoricalReference(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Remarks / Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Existing customer migrating to portal"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-lg text-xs font-bold text-white shadow-sm flex items-center space-x-1.5 cursor-pointer ${
                isDaily ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              <span>Review Existing Loan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Confirmation Summary Modal */}
        {isConfirmationOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-up">
              <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold">Confirm Existing Loan Migration</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfirmationOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Warning Banner */}
                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 text-amber-950 text-xs flex items-start space-x-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-[13px] text-amber-900 uppercase tracking-wide">
                      Historical Loan Warning
                    </p>
                    <p className="mt-1 font-semibold leading-relaxed">
                      "This is a historical existing loan. No past cash transaction will be added to today's Cash in Hand."
                    </p>
                  </div>
                </div>

                {/* Summary Table */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/80">
                    <span className="text-slate-500 font-medium">Borrower Name:</span>
                    <span className="font-bold text-slate-900">{selectedCustomerObj?.name || 'Selected Customer'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/80">
                    <span className="text-slate-500 font-medium">Finance Type:</span>
                    <span className="font-bold text-blue-700">{titleLabel} ({periodLabel} Period)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/80">
                    <span className="text-slate-500 font-medium">Original Principal:</span>
                    <span className="font-bold font-mono text-slate-900">₹{formatINR(Number(originalPrincipal))}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/80">
                    <span className="text-slate-500 font-medium">Current Outstanding Principal:</span>
                    <span className="font-black font-mono text-emerald-700">₹{formatINR(effectiveOutstanding)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/80">
                    <span className="text-slate-500 font-medium">Interest per {periodLabel}:</span>
                    <span className="font-bold font-mono text-slate-900">₹{formatINR(effectiveRenewalInterest)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/80">
                    <span className="text-slate-500 font-medium">Last Paid-Through Date:</span>
                    <span className="font-mono text-slate-800">{formatDate(lastPaidThroughDate)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/80">
                    <span className="text-slate-500 font-medium">Next Renewal Due Date:</span>
                    <span className="font-bold font-mono text-blue-800">{formatDate(nextDueDate)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 font-medium">Completed Past Renewals:</span>
                    <span className="font-black font-mono text-indigo-700">{completedRenewals || 0} renewals</span>
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-rose-600 font-semibold">{error}</p>
                )}

                {/* Confirm Buttons */}
                <div className="pt-2 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setIsConfirmationOpen(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Back to Edit
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirmSubmit}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <span>Saving Legacy Loan...</span>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Confirm & Save Existing Loan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
