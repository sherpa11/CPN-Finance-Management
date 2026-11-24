import React, { useState, useEffect } from 'react';
import {
  Banknote,
  Plus,
  Receipt,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Search,
  Printer,
  X,
  CreditCard,
  FileCheck,
  Trash2,
} from 'lucide-react';
import { formatINR, formatDate, formatDateTime, getStatusBadge } from '../utils/formatters';
import ReceiptModal from '../components/ReceiptModal';
import SearchableLoanSelect from '../components/SearchableLoanSelect';
import api from '../api';

export default function Collections({ initialLoan }) {
  const [collections, setCollections] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // New Collection Form State
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [activeLoans, setActiveLoans] = useState([]);
  const [selectedLoanId, setSelectedLoanId] = useState(initialLoan?.id || '');
  const [selectedLoanObj, setSelectedLoanObj] = useState(null);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [principalAllocation, setPrincipalAllocation] = useState('');
  const [interestAllocation, setInterestAllocation] = useState('');
  const [penaltyAllocation, setPenaltyAllocation] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');

  // Live breakdown from backend
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownError, setBreakdownError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Receipt Modal
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // Reversal Modal
  const [reversalTarget, setReversalTarget] = useState(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalSubmitting, setReversalSubmitting] = useState(false);
  const [reversalError, setReversalError] = useState('');

  // Delete Modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const res = await api.get('/collections', {
        params: { limit: 100 },
      });
      if (res.data.success) {
        setCollections(res.data.collections);
        setTotal(res.data.total);
      }
    } catch (err) {
      console.error('Failed to load collections', err);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveLoans = async () => {
    try {
      const res = await api.get('/loans?status=ACTIVE,OVERDUE&limit=500');
      if (res.data.success) {
        setActiveLoans(res.data.loans);
        if (initialLoan) {
          const match = res.data.loans.find(
            (l) => l._id === initialLoan.id || l.id === initialLoan.id || l.loanId === initialLoan.id
          );
          if (match) {
            setSelectedLoanId(match._id);
            setSelectedLoanObj(match);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load active loans', err);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    if (isRecordModalOpen || initialLoan) {
      loadActiveLoans();
    }
  }, [isRecordModalOpen, initialLoan]);

  useEffect(() => {
    if (initialLoan) {
      setSelectedLoanId(initialLoan.id);
      setIsRecordModalOpen(true);
    }
  }, [initialLoan]);

  // Update selected loan object
  useEffect(() => {
    if (selectedLoanId) {
      const found = activeLoans.find((l) => l._id === selectedLoanId);
      if (found) {
        setSelectedLoanObj(found);
      }
    }
  }, [selectedLoanId, activeLoans]);

  // Live Allocation Breakdown preview
  useEffect(() => {
    async function calculateBreakdown() {
      if (!selectedLoanId || !paymentAmount || Number(paymentAmount) <= 0) {
        setBreakdown(null);
        setBreakdownError('');
        return;
      }

      try {
        const res = await api.post('/collections/preview', {
          loanId: selectedLoanId,
          paymentAmount: Number(paymentAmount),
          principalAllocation: Number(principalAllocation || 0),
          interestAllocation: Number(interestAllocation || 0),
          penaltyAllocation: Number(penaltyAllocation || 0),
        });

        if (res.data.success) {
          setBreakdown(res.data.breakdown);
          setBreakdownError('');
        }
      } catch (err) {
        setBreakdown(null);
        setBreakdownError(err.response?.data?.message || 'Invalid allocation breakdown');
      }
    }

    const timer = setTimeout(calculateBreakdown, 300);
    return () => clearTimeout(timer);
  }, [selectedLoanId, paymentAmount, principalAllocation, interestAllocation, penaltyAllocation]);

  // Quick allocation helper: Full Interest
  const handleAutoInterestOnly = () => {
    if (!selectedLoanObj) return;
    const dueInterest = (selectedLoanObj.outstandingInterestPaise || 0) / 100;
    setPaymentAmount(String(dueInterest));
    setPrincipalAllocation('0');
    setInterestAllocation(String(dueInterest));
    setPenaltyAllocation('0');
  };

  // Quick allocation helper: Full Settlement
  const handleAutoFullSettlement = () => {
    if (!selectedLoanObj) return;
    const dueP = (selectedLoanObj.outstandingPrincipalPaise || 0) / 100;
    const dueI = (selectedLoanObj.outstandingInterestPaise || 0) / 100;
    const duePen = selectedLoanObj.penaltyBreakdown?.penaltyOutstandingRupees || (selectedLoanObj.penaltyOutstandingPaise || 0) / 100;
    const total = dueP + dueI + duePen;
    setPaymentAmount(String(total));
    setPrincipalAllocation(String(dueP));
    setInterestAllocation(String(dueI));
    setPenaltyAllocation(String(duePen));
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!breakdown) {
      setBreakdownError('Please ensure principal, interest, and penalty allocations match the total amount received.');
      return;
    }

    setSubmitting(true);
    // Generate idempotency token
    const idempotencyKey = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await api.post('/collections', {
        loanId: selectedLoanId,
        paymentDate,
        paymentAmount: Number(paymentAmount),
        principalAllocation: Number(principalAllocation || 0),
        interestAllocation: Number(interestAllocation || 0),
        penaltyAllocation: Number(penaltyAllocation || 0),
        paymentMethod,
        remarks,
        idempotencyKey,
      });

      if (res.data.success) {
        setIsRecordModalOpen(false);
        // Show receipt immediately!
        setSelectedReceipt({
          ...res.data.collection,
          totalAmountRupees: res.data.collection.totalAmountPaise / 100,
          principalAllocationRupees: res.data.collection.principalAllocationPaise / 100,
          interestAllocationRupees: res.data.collection.interestAllocationPaise / 100,
          penaltyAllocationRupees: (res.data.collection.penaltyAllocationPaise || 0) / 100,
          remainingPrincipalRupees: res.data.remainingSummary?.remainingPrincipalRupees,
          remainingInterestRupees: res.data.remainingSummary?.remainingInterestRupees,
          remainingPenaltyRupees: res.data.remainingSummary?.remainingPenaltyRupees,
          totalRemainingRupees: res.data.remainingSummary?.totalRemainingRupees,
        });
        fetchCollections();
        loadActiveLoans();
      }
    } catch (err) {
      setBreakdownError(err.response?.data?.message || err.message || 'Payment submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenReceipt = async (col) => {
    try {
      const res = await api.get(`/collections/${col._id}/receipt`);
      if (res.data.success) {
        setSelectedReceipt(res.data.receipt);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReverse = async (e) => {
    e.preventDefault();
    if (!reversalReason.trim()) {
      setReversalError('A formal reason is mandatory for financial collection reversals.');
      return;
    }

    setReversalSubmitting(true);
    setReversalError('');
    try {
      const res = await api.post(`/collections/${reversalTarget._id}/reverse`, {
        reason: reversalReason.trim(),
      });
      if (res.data.success) {
        setReversalTarget(null);
        setReversalReason('');
        fetchCollections();
        loadActiveLoans();
      }
    } catch (err) {
      setReversalError(err.response?.data?.message || err.message || 'Failed to reverse payment');
    } finally {
      setReversalSubmitting(false);
    }
  };

  const handleDeleteCollection = async () => {
    setDeleteSubmitting(true);
    setDeleteError('');
    try {
      const reason = deleteReason.trim() || 'Deleted by admin';
      const res = await api.delete(`/collections/${deleteTarget._id}`, {
        data: { reason },
      });
      if (res.data.success) {
        setDeleteTarget(null);
        setDeleteReason('');
        fetchCollections();
        loadActiveLoans();
      }
    } catch (err) {
      setDeleteError(err.response?.data?.message || err.message || 'Failed to delete collection');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Banknote className="w-5 h-5 text-emerald-600" />
            <span>Collection Management & Receipts</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Explicit allocation of principal and interest payments with receipt generation and reversal audit trails
          </p>
        </div>

        <button
          onClick={() => {
            if (!initialLoan) {
              setSelectedLoanId('');
              setSelectedLoanObj(null);
            }
            setPaymentAmount('');
            setPrincipalAllocation('');
            setInterestAllocation('');
            setPenaltyAllocation('');
            setRemarks('');
            setBreakdownError('');
            setIsRecordModalOpen(true);
          }}
          className="flex items-center justify-center space-x-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer min-h-[40px] w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record New Collection</span>
        </button>
      </div>

      {/* Collection Records Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Collections History ({collections.filter((col) => {
              if (filterType === 'UPFRONT') return col.isUpfrontInterest || col.collectionType === 'UPFRONT_INTEREST';
              if (filterType === 'MONTHLY') return col.vattiType === 'MONTHLY';
              if (filterType === 'DAILY') return col.vattiType === 'DAILY';
              if (filterType === 'DAILY_COLLECTION') return col.vattiType === 'DAILY_COLLECTION';
              return true;
            }).length} Records)
          </h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${filterType === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType('UPFRONT')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${filterType === 'UPFRONT' ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
            >
              Upfront Interest
            </button>
            <button
              type="button"
              onClick={() => setFilterType('MONTHLY')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${filterType === 'MONTHLY' ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setFilterType('DAILY')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${filterType === 'DAILY' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
            >
              Daily Finance
            </button>
            <button
              type="button"
              onClick={() => setFilterType('DAILY_COLLECTION')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${filterType === 'DAILY_COLLECTION' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            >
              Daily Collection
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading payment collections...</div>
        ) : collections.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <Receipt className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No collections recorded yet</p>
            <p className="text-slate-400 mt-1 max-w-sm mx-auto">
              Payments collected against active Monthly Finance and Daily Finance loans will appear here with instant printable receipts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[760px]">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Receipt #</th>
                  <th className="py-3 px-3 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-3 font-semibold">Loan Code</th>
                  <th className="py-3 px-3 font-semibold">Method</th>
                  <th className="py-3 px-3 font-semibold text-right">Principal Repaid</th>
                  <th className="py-3 px-3 font-semibold text-right">Interest Repaid</th>
                  <th className="py-3 px-3 font-semibold text-right">Penalty Repaid</th>
                  <th className="py-3 px-3 font-semibold text-right">Total Received</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {collections
                  .filter((col) => {
                    if (filterType === 'UPFRONT') return col.isUpfrontInterest || col.collectionType === 'UPFRONT_INTEREST';
                    if (filterType === 'MONTHLY') return col.vattiType === 'MONTHLY';
                    if (filterType === 'DAILY') return col.vattiType === 'DAILY';
                    if (filterType === 'DAILY_COLLECTION') return col.vattiType === 'DAILY_COLLECTION';
                    return true;
                  })
                  .map((col) => {
                  const statusBadge = getStatusBadge(col.status);
                  return (
                    <tr key={col._id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs">{col.receiptNumber}</span>
                          <div>
                            {col.isUpfrontInterest || col.collectionType === 'UPFRONT_INTEREST' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                Upfront Interest (Retained)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-sans font-normal">
                                Customer Repayment
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">{formatDate(col.paymentDate)}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div>{col.customerName}</div>
                        {col.customerMobile && (
                          <div className="text-[10px] text-slate-400 font-normal font-mono">{col.customerMobile}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-blue-700 font-semibold">
                        <div>{col.loanCode}</div>
                        <div className="text-[10px] text-slate-500 font-sans font-normal">
                          {col.vattiType === 'DAILY' ? 'Daily Finance' : col.vattiType === 'DAILY_COLLECTION' ? 'Daily Collection' : 'Monthly Finance'}
                        </div>
                        {col.isUpfrontInterest && col.grossPrincipalRupees > 0 && (
                          <div className="text-[9px] text-slate-500 font-sans font-normal">
                            Gross: ₹{col.grossPrincipalRupees} · Net: ₹{col.netDisbursedRupees}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 uppercase text-[11px] font-medium text-slate-600">
                        {col.paymentMethod}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-800">
                        {formatINR(col.principalAllocationPaise / 100)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-emerald-700">
                        <div>{formatINR(col.interestAllocationPaise / 100)}</div>
                        {col.isUpfrontInterest && (
                          <div className="text-[9px] text-purple-600 font-sans font-normal">Retained at Disb.</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-rose-700">
                        {col.penaltyAllocationPaise > 0 ? formatINR(col.penaltyAllocationPaise / 100) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-950">
                        {formatINR(col.totalAmountPaise / 100)}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusBadge.bg}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleOpenReceipt(col)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="View / Print Receipt"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {col.status === 'CONFIRMED' && (
                            <>
                              {col.isUpfrontInterest ? (
                                <span
                                  className="p-1.5 text-slate-400 cursor-not-allowed inline-flex items-center"
                                  title="Upfront interest is linked directly to loan disbursement. Reverse or cancel the loan account to revert."
                                >
                                  <RotateCcw className="w-4 h-4 opacity-30" />
                                </span>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setReversalTarget(col);
                                      setReversalReason('');
                                      setReversalError('');
                                    }}
                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                                    title="Audited Reversal"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDeleteTarget(col);
                                      setDeleteReason('');
                                      setDeleteError('');
                                    }}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                    title="Delete Collection"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Collection Modal */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-4 sm:p-6 border border-slate-200 my-4 sm:my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center space-x-2">
                <Banknote className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Record Customer Collection</span>
              </h3>
              <button onClick={() => setIsRecordModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {breakdownError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{breakdownError}</span>
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
              {/* Select Loan with Searchable Customer / Loan Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Search Customer / Loan Account *
                </label>
                <SearchableLoanSelect
                  loans={activeLoans}
                  value={selectedLoanId}
                  onChange={(loanId, loanObj) => {
                    setSelectedLoanId(loanId);
                    setSelectedLoanObj(loanObj);
                  }}
                  placeholder="Search customer name, mobile number, or loan ID..."
                  required
                />
              </div>

              {/* Outstanding Balance Banner */}
              {selectedLoanObj && (
                <div className={`bg-slate-50 border border-slate-200 p-3 rounded-lg grid grid-cols-1 ${selectedLoanObj.penaltyBreakdown?.isPenaltyApplicable ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2 sm:gap-3 text-xs font-mono`}>
                  <div>
                    <span className="text-[10px] text-slate-500 font-sans block">Current Outstanding Principal:</span>
                    <span className="text-sm font-bold text-slate-900">
                      {formatINR(selectedLoanObj.outstandingPrincipalPaise / 100)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-sans block">Accrued Outstanding Interest:</span>
                    <span className="text-sm font-bold text-amber-700">
                      {formatINR(selectedLoanObj.outstandingInterestPaise / 100)}
                    </span>
                  </div>
                  {selectedLoanObj.penaltyBreakdown?.isPenaltyApplicable && (
                    <div>
                      <span className="text-[10px] text-rose-600 font-sans block font-semibold">
                        Overdue Penalty (2%/day):
                      </span>
                      <span className="text-sm font-bold text-rose-700">
                        {formatINR(selectedLoanObj.penaltyBreakdown?.penaltyOutstandingRupees || (selectedLoanObj.penaltyOutstandingPaise || 0) / 100)}
                      </span>
                      {selectedLoanObj.penaltyBreakdown?.overdueDays > 0 && (
                        <span className="text-[10px] text-rose-500 block font-sans">
                          ({selectedLoanObj.penaltyBreakdown.overdueDays} days @ ₹{selectedLoanObj.penaltyBreakdown.dailyPenaltyRupees}/day)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Total Payment Amount */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Total Payment Received (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  placeholder="e.g. 5000"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg font-mono font-bold text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />

                {/* Quick Auto Buttons */}
                <div className="flex items-center space-x-2 mt-1.5">
                  <span className="text-[10px] text-slate-400">Quick Fill:</span>
                  <button
                    type="button"
                    onClick={handleAutoInterestOnly}
                    className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-semibold cursor-pointer"
                  >
                    Pay Full Interest
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoFullSettlement}
                    className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-semibold cursor-pointer"
                  >
                    Full Settlement
                  </button>
                </div>
              </div>

              {/* Explicit Allocation Inputs */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <p className="font-bold text-slate-800 text-xs">
                  Explicit Payment Allocation (Must sum exactly to total received)
                </p>

                <div className={`grid grid-cols-1 ${selectedLoanObj?.penaltyBreakdown?.isPenaltyApplicable ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2 sm:gap-3`}>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Principal Allocation (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={principalAllocation}
                      onChange={(e) => setPrincipalAllocation(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Interest Allocation (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={interestAllocation}
                      onChange={(e) => setInterestAllocation(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono font-bold text-slate-900"
                    />
                  </div>

                  {selectedLoanObj?.penaltyBreakdown?.isPenaltyApplicable && (
                    <div>
                      <label className="block text-[11px] font-semibold text-rose-700 mb-1">
                        Penalty Allocation (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={penaltyAllocation}
                        onChange={(e) => setPenaltyAllocation(e.target.value)}
                        className="w-full px-3 py-1.5 border border-rose-300 rounded font-mono font-bold text-rose-800 focus:ring-rose-500"
                      />
                    </div>
                  )}
                </div>

                {/* Live Post-Payment Breakdown Preview */}
                {breakdown && (
                  <div className="pt-2 border-t border-slate-200 text-[11px] space-y-1 font-mono">
                    <div className="flex justify-between font-sans">
                      <span className="text-slate-500">Remaining Principal:</span>
                      <span className="font-bold text-slate-900">{formatINR(breakdown.remainingPrincipalRupees)}</span>
                    </div>
                    <div className="flex justify-between font-sans">
                      <span className="text-slate-500">Remaining Interest:</span>
                      <span className="font-bold text-slate-900">{formatINR(breakdown.remainingInterestRupees)}</span>
                    </div>
                    {(breakdown.penaltyAllocationRupees > 0 || (breakdown.remainingPenaltyRupees || 0) > 0) && (
                      <div className="flex justify-between font-sans">
                        <span className="text-rose-600 font-semibold">Remaining Penalty:</span>
                        <span className="font-bold text-rose-700">{formatINR(breakdown.remainingPenaltyRupees || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-sans font-bold pt-1 border-t border-slate-200 text-slate-950">
                      <span>Total Remaining:</span>
                      <span className={breakdown.isFullySettled ? 'text-emerald-700' : 'text-rose-700'}>
                        {breakdown.isFullySettled ? 'FULLY SETTLED' : formatINR(breakdown.totalRemainingRupees)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Method & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method *</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI (GooglePay / PhonePe)</option>
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Remarks / Transaction Ref</label>
                <input
                  type="text"
                  placeholder="e.g. Received at Salem bazaar, UPI Ref #77892"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Confirm & Issue Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {reversalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4 text-xs">
            <h3 className="font-bold text-base text-rose-700 flex items-center space-x-2">
              <RotateCcw className="w-5 h-5" />
              <span>Execute Financial Reversal</span>
            </h3>

            <p className="text-slate-600">
              Receipt <span className="font-mono font-bold text-slate-900">{reversalTarget.receiptNumber}</span> of{' '}
              <span className="font-bold text-slate-900">{formatINR(reversalTarget.totalAmountPaise / 100)}</span> will be reversed.
              Balances will be atomically restored and a permanent reversal audit entry will be created.
            </p>

            {reversalError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                {reversalError}
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Mandatory Reversal Reason *</label>
              <textarea
                required
                rows={2}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="State the explicit business reason for this reversal"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setReversalTarget(null)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reversalSubmitting}
                onClick={handleReverse}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg disabled:opacity-50"
              >
                {reversalSubmitting ? 'Reversing...' : 'Execute Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Collection Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center space-x-2 text-rose-600">
              <Trash2 className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-base text-slate-900">Delete Collection Record</h3>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Receipt #:</span>
                <span className="font-mono font-bold text-slate-900">{deleteTarget.receiptNumber}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Customer:</span>
                <span className="font-bold text-slate-900">{deleteTarget.customerName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Total Received:</span>
                <span className="font-mono font-bold text-rose-700 text-sm">
                  {formatINR(deleteTarget.totalAmountPaise / 100)}
                </span>
              </div>
            </div>

            <p className="text-slate-600 text-xs leading-relaxed">
              Deleting this collection will safely reverse its financial effects, restore the borrower's loan balance, 
              update customer ledgers, and maintain a permanent audit trail.
            </p>

            {deleteError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                {deleteError}
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Reason for Deletion</label>
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Payment recorded in error / bounced cheque"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleDeleteCollection}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deleteSubmitting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {selectedReceipt && (
        <ReceiptModal receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
      )}
    </div>
  );
}
