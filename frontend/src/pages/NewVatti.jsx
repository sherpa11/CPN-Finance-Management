import React, { useState, useEffect } from 'react';
import {
  PlusCircle,
  Calculator,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { formatINR, formatDate, getVattiBadge } from '../utils/formatters';
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

  // Live Preview State
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');

  // Confirmation Modal
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdLoan, setCreatedLoan] = useState(null);

  // Load Customers
  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await api.get('/customers?status=ACTIVE&limit=200');
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

  // Update default rate & due date when Vatti type changes
  useEffect(() => {
    const today = new Date(startDate || Date.now());
    if (vattiType === 'MONTHLY') {
      setInterestRatePercent('2.0');
      // Default 1 month ahead
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      setDueDate(nextMonth.toISOString().split('T')[0]);
    } else if (vattiType === 'DAILY') {
      setInterestRatePercent('0.1');
      // Default 10 days ahead
      const next10Days = new Date(today);
      next10Days.setDate(next10Days.getDate() + 10);
      setDueDate(next10Days.toISOString().split('T')[0]);
    } else if (vattiType === 'MEATER') {
      setInterestRatePercent('1.5');
      // Default 30 days ahead
      const next30Days = new Date(today);
      next30Days.setDate(next30Days.getDate() + 30);
      setDueDate(next30Days.toISOString().split('T')[0]);
    }
  }, [vattiType, startDate]);

  // Fetch Live Calculation Preview from backend calculation engine
  useEffect(() => {
    async function fetchPreview() {
      if (!principalAmount || Number(principalAmount) <= 0 || !dueDate || !interestRatePercent) {
        setPreview(null);
        return;
      }

      setPreviewLoading(true);
      setError('');
      try {
        const res = await api.post('/loans/preview', {
          vattiType,
          principalAmount: Number(principalAmount),
          interestRatePercent: Number(interestRatePercent),
          startDate,
          dueDate,
        });
        if (res.data.success) {
          setPreview(res.data.preview);
        }
      } catch (err) {
        console.error('Preview error', err);
        setError(err.response?.data?.message || 'Error generating calculation forecast');
      } finally {
        setPreviewLoading(false);
      }
    }

    const debounce = setTimeout(fetchPreview, 300);
    return () => clearTimeout(debounce);
  }, [vattiType, principalAmount, interestRatePercent, startDate, dueDate]);

  const handlePreConfirm = (e) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }
    if (!principalAmount || Number(principalAmount) <= 0) {
      setError('Please enter a valid principal amount.');
      return;
    }
    if (!dueDate) {
      setError('Please select a maturity/due date.');
      return;
    }
    setError('');
    setIsConfirmOpen(true);
  };

  const handleFinalSave = async () => {
    setSubmitting(true);
    setError('');
    try {
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
            <span>New Vatti / Loan Disbursement</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Disburse Monthly, Daily, or Meater loans with individual agreed interest rates
          </p>
        </div>
      </div>

      {createdLoan ? (
        /* Success Screen */
        <div className="bg-white p-8 rounded-xl border border-emerald-200 shadow-md text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Loan Disbursed Successfully!</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Loan Account <span className="font-mono font-bold text-blue-700">{createdLoan.loanId}</span> has been created
            for <span className="font-bold text-slate-900">{createdLoan.customerName}</span>. Customer balances and due notifications have been updated.
          </p>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 max-w-sm mx-auto text-xs font-mono space-y-1">
            <div className="flex justify-between font-sans">
              <span className="text-slate-500">Principal Lent:</span>
              <span className="font-bold text-slate-900">{formatINR(createdLoan.principalPaise / 100)}</span>
            </div>
            <div className="flex justify-between font-sans">
              <span className="text-slate-500">Agreed Rate:</span>
              <span className="font-bold text-slate-900">{createdLoan.interestRatePercent}%</span>
            </div>
            <div className="flex justify-between font-sans">
              <span className="text-slate-500">Maturity Date:</span>
              <span className="font-bold text-slate-900">{formatDate(createdLoan.dueDate)}</span>
            </div>
          </div>

          <div className="flex justify-center space-x-3 pt-4">
            <button
              onClick={() => {
                setCreatedLoan(null);
                setPrincipalAmount('');
                setRemarks('');
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              + Create Another Loan
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Go to Dashboard
            </button>
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
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Choose Existing Borrower --</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.customerId}) - {c.mobileNumber}
                    </option>
                  ))}
                </select>
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

              {/* Vatti Type Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Vatti Category *</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'MONTHLY', label: '1. Monthly Vatti', desc: 'Simple interest monthly' },
                    { id: 'DAILY', label: '2. Daily Vatti', desc: 'Simple interest daily' },
                    { id: 'MEATER', label: '3. Meater Vatti', desc: 'Custom / Pending formula' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setVattiType(cat.id)}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        vattiType === cat.id
                          ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                      }`}
                    >
                      <p className="font-bold">{cat.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{cat.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Principal Amount & Agreed Individual Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Principal Amount (₹) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      required
                      min="100"
                      step="1"
                      placeholder="e.g. 50000"
                      value={principalAmount}
                      onChange={(e) => setPrincipalAmount(e.target.value)}
                      className="w-full pl-8 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

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
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Maturity / Due Date *</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500"
                  />
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

              {vattiType === 'MEATER' ? (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-purple-900 text-xs space-y-2">
                  <div className="flex items-center space-x-2 text-purple-800 font-bold">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Calculation Configuration Pending</span>
                  </div>
                  <p className="text-[11px] text-purple-700 leading-relaxed">
                    As per business specification, Meater Vatti interest formula has not yet been confirmed by CPN Raja.
                  </p>
                  <p className="text-[11px] text-purple-700 leading-relaxed">
                    Loan principal will be recorded and tracked independently. No arbitrary interest will be assumed until the formula is confirmed in Settings.
                  </p>
                </div>
              ) : preview ? (
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Principal:</span>
                    <span className="font-bold text-slate-900">{formatINR(preview.principalAmount)}</span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Interest Rate:</span>
                    <span className="font-bold text-slate-900">{preview.interestRatePercent}%</span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans">
                    <span className="text-slate-500">Duration:</span>
                    <span className="font-bold text-slate-900">
                      {preview.eligibleUnits} {preview.unitLabel}
                    </span>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-200/60 font-sans text-purple-800">
                    <span className="font-semibold">Expected Vatti:</span>
                    <span className="font-bold text-sm">{formatINR(preview.expectedInterestRupees)}</span>
                  </div>

                  <div className="flex justify-between py-2 border-t-2 border-slate-300 font-sans text-slate-950 font-bold">
                    <span>Total Payable:</span>
                    <span className="text-base text-blue-700">{formatINR(preview.expectedTotalPayableRupees)}</span>
                  </div>

                  {preview.isPendingOwnerConfirmation && (
                    <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] font-sans text-amber-800">
                      Note: Partial month calculation rule is currently set to pro-rata daily, pending final owner confirmation.
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Enter Principal and Due Date to view live interest forecast.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              <span>Confirm Loan Disbursement</span>
            </h3>

            <p className="text-xs text-slate-600">
              Please verify the terms before saving. Once created, a unique loan ID will be generated, the customer profile will be debited, and this account will enter due monitoring.
            </p>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs font-mono space-y-1.5">
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Borrower:</span>
                <span className="font-bold text-slate-900">{selectedCustomerObj?.name}</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Category:</span>
                <span className="font-bold text-blue-700">{vattiType} Vatti</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Principal Amount:</span>
                <span className="font-bold text-slate-900">{formatINR(Number(principalAmount))}</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Agreed Rate:</span>
                <span className="font-bold text-slate-900">{interestRatePercent}%</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Disbursement Date:</span>
                <span className="text-slate-900">{formatDate(startDate)}</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-slate-500">Maturity Due Date:</span>
                <span className="font-bold text-slate-900">{formatDate(dueDate)}</span>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalSave}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
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
