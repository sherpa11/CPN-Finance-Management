import React, { useState, useEffect } from 'react';
import {
  CalendarRange,
  Search,
  Plus,
  Filter,
  CheckCircle,
  AlertCircle,
  Clock,
  Printer,
  Calendar,
  X,
  CreditCard,
  Eye,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Percent,
  Wallet,
  Coins,
  Receipt,
  FileText,
  User,
  Phone,
} from 'lucide-react';
import { formatINR, formatDate, formatDateTime, getStatusBadge } from '../utils/formatters';
import SearchableCustomerSelect from '../components/SearchableCustomerSelect';
import api from '../api';

export default function MonthlyFinance({ onNavigate, preselectedCustomer }) {
  // Navigation tabs: 'roster' (default) or 'disburse'
  const [activeTab, setActiveTab] = useState(preselectedCustomer ? 'disburse' : 'roster');

  // Loans list & filters
  const [loans, setLoans] = useState([]);
  const [totalLoans, setTotalLoans] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Summary Metrics
  const [metrics, setMetrics] = useState({
    activeCount: 0,
    grossPrincipal: 0,
    principalReturned: 0,
    outstandingBalance: 0,
    upfrontInterestTotal: 0,
  });

  // Disbursement Form States
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomer?._id || '');
  const [grossPrincipal, setGrossPrincipal] = useState('');
  const [interestRatePercent, setInterestRatePercent] = useState('2.0');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [disbursing, setDisbursing] = useState(false);

  // Modal States: Loan Details & Statement
  const [selectedLoanForDetails, setSelectedLoanForDetails] = useState(null);
  const [loanTransactions, setLoanTransactions] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Modal States: Quick Collection
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [collectionTargetLoan, setCollectionTargetLoan] = useState(null);
  const [collectionAmount, setCollectionAmount] = useState('');
  const [collectionMethod, setPaymentMethod] = useState('CASH');
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectionRemarks, setCollectionRemarks] = useState('');
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);
  const [collectionError, setCollectionError] = useState('');
  const [collectionSuccess, setCollectionSuccess] = useState('');

  // Calculate default due date when start date changes (+1 month)
  useEffect(() => {
    if (startDate) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        d.setMonth(d.getMonth() + 1);
        setDueDate(d.toISOString().split('T')[0]);
      }
    }
  }, [startDate]);

  // Load Customers for Dropdown
  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await api.get('/customers?status=ACTIVE&limit=200&fields=dropdown');
        if (res.data?.success) {
          setCustomers(res.data.customers);
        }
      } catch (err) {
        console.error('Failed to load customers', err);
      }
    }
    loadCustomers();
  }, []);

  // Fetch Monthly Loans and Calculate Metrics
  const fetchMonthlyLoans = async () => {
    setLoading(true);
    try {
      const params = {
        vattiType: 'MONTHLY',
        limit: 100,
      };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await api.get('/loans', { params });
      if (res.data?.success) {
        const fetchedLoans = res.data.loans || [];
        setLoans(fetchedLoans);
        setTotalLoans(res.data.total || fetchedLoans.length);

        // Compute aggregate metrics
        let activeCount = 0;
        let grossSum = 0;
        let returnedSum = 0;
        let outstandingSum = 0;
        let upfrontInterestSum = 0;

        fetchedLoans.forEach((l) => {
          const gross = (l.grossPrincipalPaise || l.principalPaise || 0) / 100;
          const returned = (l.totalPrincipalPaidPaise || 0) / 100;
          const outstanding = (l.outstandingPrincipalPaise || 0) / 100;
          const upfrontInterest = (l.upfrontInterestPaise || 0) / 100;

          grossSum += gross;
          returnedSum += returned;
          outstandingSum += outstanding;
          upfrontInterestSum += upfrontInterest;

          if (l.status === 'ACTIVE') {
            activeCount += 1;
          }
        });

        setMetrics({
          activeCount,
          grossPrincipal: grossSum,
          principalReturned: returnedSum,
          outstandingBalance: outstandingSum,
          upfrontInterestTotal: upfrontInterestSum,
        });
      }
    } catch (err) {
      console.error('Failed to load monthly finance loans', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyLoans();
  }, [statusFilter, search]);

  // Live Calculation for New Monthly Finance Disbursement
  const pAmount = parseFloat(grossPrincipal) || 0;
  const ratePct = parseFloat(interestRatePercent) || 0;
  // Monthly finance interest calculated on full principal amount: (P * Rate * 1) / 100
  const calculatedMonthlyInterest = pAmount > 0 && ratePct >= 0 ? Math.round((pAmount * ratePct) / 100) : 0;
  // Upfront interest deduction:
  // Net cash handed to borrower = P - Upfront Interest
  // Total repayable cash by customer = Full Original Principal P (e.g. 5L)
  const netCashGiven = Math.max(0, pAmount - calculatedMonthlyInterest);
  const totalRepayableCash = pAmount;

  // Open Confirmation Modal
  const handleInitiateDisbursement = (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!selectedCustomerId) {
      setFormError('Please select a customer.');
      return;
    }
    if (pAmount <= 0) {
      setFormError('Please enter a valid Gross Principal amount.');
      return;
    }
    if (ratePct < 0) {
      setFormError('Interest rate cannot be negative.');
      return;
    }
    if (!startDate || !dueDate) {
      setFormError('Please select valid start and due dates.');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // Submit Monthly Loan Disbursement to Backend
  const handleConfirmDisbursement = async () => {
    setDisbursing(true);
    setFormError('');
    try {
      const res = await api.post('/loans', {
        customerId: selectedCustomerId,
        vattiType: 'MONTHLY',
        principalAmount: pAmount,
        interestRatePercent: ratePct,
        startDate,
        dueDate,
        remarks,
      });

      if (res.data?.success) {
        setIsConfirmModalOpen(false);
        setFormSuccess(`Monthly Finance ${res.data.loan?.loanId || ''} disbursed successfully!`);
        // Reset form
        setGrossPrincipal('');
        setRemarks('');
        setSelectedCustomerId('');
        fetchMonthlyLoans();
        // Switch to roster tab after brief moment
        setTimeout(() => {
          setActiveTab('roster');
          setFormSuccess('');
        }, 1800);
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to disburse monthly finance');
      setIsConfirmModalOpen(false);
    } finally {
      setDisbursing(false);
    }
  };

  // Open Details Modal and fetch loan statement
  const handleOpenDetails = async (loan) => {
    setSelectedLoanForDetails(loan);
    setLoadingDetails(true);
    setLoanTransactions([]);
    try {
      const res = await api.get(`/loans/${loan._id}`);
      if (res.data?.success) {
        setSelectedLoanForDetails(res.data.loan);
        setLoanTransactions(res.data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to load loan details', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Open Quick Collection Modal
  const handleOpenCollectionModal = (loan) => {
    setCollectionTargetLoan(loan);
    setCollectionAmount('');
    setCollectionError('');
    setCollectionSuccess('');
    setPaymentMethod('CASH');
    setCollectionDate(new Date().toISOString().split('T')[0]);
    setCollectionRemarks('');
    setIsCollectionModalOpen(true);
  };

  // Submit Quick Collection
  const handleRecordCollection = async (e) => {
    e.preventDefault();
    if (!collectionTargetLoan) return;

    const amt = parseFloat(collectionAmount);
    if (!amt || amt <= 0) {
      setCollectionError('Please enter a valid payment amount.');
      return;
    }

    const currentBal = (collectionTargetLoan.outstandingPrincipalPaise || 0) / 100;
    if (amt > currentBal) {
      setCollectionError(`Payment cannot exceed outstanding balance of ${formatINR(currentBal)}`);
      return;
    }

    setCollectionSubmitting(true);
    setCollectionError('');
    try {
      const res = await api.post('/collections', {
        loanId: collectionTargetLoan._id,
        paymentAmount: amt,
        principalAllocation: amt,
        interestAllocation: 0,
        paymentMethod: collectionMethod,
        paymentDate: collectionDate,
        remarks: collectionRemarks || 'Monthly Finance repayment',
      });

      if (res.data?.success) {
        setCollectionSuccess(`Payment of ${formatINR(amt)} recorded successfully!`);
        fetchMonthlyLoans();
        setTimeout(() => {
          setIsCollectionModalOpen(false);
          setCollectionTargetLoan(null);
        }, 1200);
      }
    } catch (err) {
      setCollectionError(err.response?.data?.message || err.message || 'Failed to record payment');
    } finally {
      setCollectionSubmitting(false);
    }
  };

  const selectedBorrowerObj = customers.find((c) => c._id === selectedCustomerId);

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <CalendarRange className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Monthly Finance</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800">
              மாத வட்டி
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Simple interest monthly finance with upfront interest deduction. Customer repays net principal.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('roster')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'roster'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 Monthly Loans Roster
          </button>
          <button
            onClick={() => setActiveTab('disburse')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'disburse'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>+ Disburse Monthly Finance</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Active Loans</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">{metrics.activeCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Total: {totalLoans} records</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Gross Capital Lent</span>
            <Wallet className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900">{formatINR(metrics.grossPrincipal)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Original gross principal</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Upfront Interest</span>
            <Percent className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-600">{formatINR(metrics.upfrontInterestTotal)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Deducted at disbursement</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Principal Returned</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-700">{formatINR(metrics.principalReturned)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Repaid by borrowers</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-xs font-bold">Outstanding Balance</span>
            <Coins className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-amber-900">{formatINR(metrics.outstandingBalance)}</p>
          <p className="text-[11px] text-amber-700 mt-0.5">Net balance to collect</p>
        </div>
      </div>

      {/* VIEW 1: MONTHLY LOANS ROSTER */}
      {activeTab === 'roster' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Controls / Filter Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by customer name, mobile, or loan ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 text-xs">
                {['ALL', 'ACTIVE', 'CLOSED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                      statusFilter === st
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st === 'ACTIVE' ? 'Active' : 'Closed'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              Loading Monthly Finance records...
            </div>
          ) : loans.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs space-y-3">
              <CalendarRange className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">No Monthly Finance loans found</p>
              <p className="text-slate-400 max-w-sm mx-auto">
                No monthly finance loans match your current filter or search criteria.
              </p>
              <button
                onClick={() => setActiveTab('disburse')}
                className="mt-2 inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Disburse First Monthly Loan</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Loan ID</th>
                    <th className="px-4 py-3">Disbursed Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Gross Principal</th>
                    <th className="px-4 py-3 text-right">Upfront Interest</th>
                    <th className="px-4 py-3 text-right">Net Given</th>
                    <th className="px-4 py-3 text-right">Principal Repaid</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loans.map((loan) => {
                    const gross = (loan.grossPrincipalPaise || loan.principalPaise || 0) / 100;
                    const upfrontInterest = (loan.upfrontInterestPaise || 0) / 100;
                    const netGiven = (loan.netAmountGivenPaise || (loan.principalPaise - loan.upfrontInterestPaise) || 0) / 100;
                    const repaid = (loan.totalPrincipalPaidPaise || 0) / 100;
                    const outstanding = (loan.outstandingPrincipalPaise || 0) / 100;
                    const statusBadge = getStatusBadge(loan.status);

                    return (
                      <tr key={loan._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-blue-700">
                          {loan.loanId}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {formatDate(loan.startDate)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{loan.customerName}</div>
                          <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{loan.customerMobile}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatINR(gross)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-rose-600">
                          - {formatINR(upfrontInterest)} ({loan.interestRatePercent}%)
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">
                          {formatINR(netGiven)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          {formatINR(repaid)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700">
                          {formatINR(outstanding)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {formatDate(loan.dueDate)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${statusBadge.bg}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => handleOpenDetails(loan)}
                              className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                              title="View Loan Statement & Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {loan.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleOpenCollectionModal(loan)}
                                className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded text-[10px] transition-colors cursor-pointer flex items-center space-x-1"
                                title="Record Payment"
                              >
                                <Coins className="w-3 h-3" />
                                <span>Collect</span>
                              </button>
                            )}

                            <button
                              onClick={() => onNavigate('ledgers')}
                              className="p-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                              title="View Customer Ledger"
                            >
                              <BookOpen className="w-4 h-4" />
                            </button>
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
      )}

      {/* VIEW 2: REGISTER NEW MONTHLY FINANCE */}
      {activeTab === 'disburse' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form (2 columns) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Register New Monthly Finance (மாத வட்டி)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Disburse a monthly loan with upfront interest deduction. Customer will only repay the remaining principal balance.
              </p>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleInitiateDisbursement} className="space-y-4 text-xs">
              {/* Customer Selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Borrower / வாடிக்கையாளர் *
                </label>
                <SearchableCustomerSelect
                  required
                  value={selectedCustomerId}
                  customers={customers}
                  onChange={(id) => setSelectedCustomerId(id)}
                  placeholder="Search borrower by name or mobile number..."
                />
                <div className="mt-1 text-[11px] text-slate-400">
                  Customer search hides Customer ID and shows borrower name and mobile number.
                </div>
              </div>

              {/* Gross Principal & Interest Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Gross Principal Amount (₹) / அசல் தொகை *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      required
                      min="100"
                      step="any"
                      placeholder="e.g. 100000"
                      value={grossPrincipal}
                      onChange={(e) => setGrossPrincipal(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Monthly Interest Rate (% per Month) *
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
                      className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Disbursement / Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Maturity / Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Remarks / Collateral / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Promissory note signed, Cheque leaf #1024 received"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('roster')}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center space-x-2 cursor-pointer"
                >
                  <span>Review & Disburse Monthly Finance</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          {/* Real-Time Live Calculation Forecast Card */}
          <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 shadow-md flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider mb-2">
                <Percent className="w-4 h-4" />
                <span>Monthly Finance Live Forecast</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Upfront Interest Deduction Calculation Model:
              </p>

              <div className="mt-4 space-y-3 font-mono text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400 font-sans">Gross Principal (P):</span>
                  <span className="font-bold text-white">{formatINR(pAmount)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400 font-sans">Monthly Rate (R):</span>
                  <span className="font-bold text-amber-300">{ratePct}% / Month</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400 font-sans">Calculated Upfront Interest (I):</span>
                  <span className="font-bold text-rose-400">- {formatINR(calculatedMonthlyInterest)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-700 bg-emerald-950/40 px-2 rounded">
                  <span className="text-emerald-400 font-sans font-bold">Net Cash Given (P - I):</span>
                  <span className="font-black text-emerald-400 text-sm">{formatINR(netCashGiven)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-700 bg-blue-950/40 px-2 rounded">
                  <span className="text-blue-300 font-sans font-bold">Total Customer Repayable Cash:</span>
                  <span className="font-black text-blue-300 text-sm">{formatINR(totalRepayableCash)}</span>
                </div>
              </div>

              {/* Explanatory callout */}
              <div className="mt-5 p-3 rounded-lg bg-blue-900/30 border border-blue-700/40 text-[11px] text-blue-200 space-y-1.5 font-sans">
                <p className="font-bold flex items-center space-x-1.5 text-blue-300">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Monthly Finance Business Rules:</span>
                </p>
                <p className="text-slate-300">
                  • Monthly Interest Deducted Upfront:
                  <br />
                  <span className="font-mono text-amber-300">I = (Principal × Rate) / 100</span>
                </p>
                <p className="text-slate-300">
                  • Net Cash Given to Customer:
                  <br />
                  <span className="font-mono text-emerald-300">Net Cash = Principal - Upfront Interest</span>
                </p>
                <p className="text-slate-300 font-semibold">
                  • Total Repayable Cash by Customer:
                  <br />
                  <span className="font-mono text-blue-300 font-bold">Total Repayable = Full Original Principal ({formatINR(pAmount)})</span>
                </p>
                <p className="text-slate-400 text-[10px]">
                  Interest is deducted upfront at disbursement. The customer receives net cash and repays the full original principal.
                </p>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 font-sans text-center">
              CPN Raja Finance Management System · Financial Engine v1.0
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL BEFORE DISBURSEMENT */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <CalendarRange className="w-4 h-4 text-amber-400" />
                <span>Confirm Monthly Finance Disbursement</span>
              </h3>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Please verify the Monthly Finance disbursement details. Once confirmed, customer ledger and initial balances will be initialized.
              </p>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Borrower:</span>
                  <span className="font-bold text-slate-900">{selectedBorrowerObj?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mobile:</span>
                  <span className="font-mono text-slate-700">{selectedBorrowerObj?.mobileNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross Principal:</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(pAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Monthly Interest ({ratePct}%):</span>
                  <span className="font-mono font-bold text-rose-600">- {formatINR(calculatedMonthlyInterest)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5">
                  <span className="font-bold text-emerald-800">Net Cash Handed Over:</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">{formatINR(netCashGiven)}</span>
                </div>
                <div className="flex justify-between bg-blue-50 px-2 py-1 rounded">
                  <span className="font-bold text-blue-900">Total Customer Repayable Cash:</span>
                  <span className="font-mono font-black text-blue-700 text-sm">{formatINR(totalRepayableCash)}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1">
                  <span className="text-slate-500">Repayment Due Date:</span>
                  <span className="font-bold text-slate-700">{formatDate(dueDate)}</span>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  disabled={disbursing}
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Back to Edit
                </button>
                <button
                  type="button"
                  disabled={disbursing}
                  onClick={handleConfirmDisbursement}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-md shadow-blue-600/30 flex items-center space-x-2 cursor-pointer"
                >
                  {disbursing ? (
                    <span>Disbursing Loan...</span>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Confirm & Disburse</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOAN DETAILS & STATEMENT MODAL */}
      {selectedLoanForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-6 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between no-print shrink-0">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">
                  Monthly Finance Statement · {selectedLoanForDetails.loanId}
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Statement</span>
                </button>
                <button
                  onClick={() => setSelectedLoanForDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto text-xs space-y-5">
              {/* Printable Header */}
              <div className="text-center border-b border-slate-200 pb-3">
                <h2 className="text-xl font-black text-slate-950 tracking-wider">CPN RAJA</h2>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                  FINANCE MANAGEMENT SYSTEM · MONTHLY FINANCE STATEMENT
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Generated on {formatDateTime(new Date())}
                </p>
              </div>

              {/* Customer & Loan Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-1">
                  <p className="text-slate-400 font-bold uppercase text-[10px]">Borrower Information</p>
                  <p className="font-bold text-sm text-slate-900">{selectedLoanForDetails.customerName}</p>
                  <p className="font-mono text-slate-600">Mobile: {selectedLoanForDetails.customerMobile}</p>
                  <p className="text-slate-500">Loan ID: <span className="font-mono font-bold text-blue-700">{selectedLoanForDetails.loanId}</span></p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-1">
                  <p className="text-slate-400 font-bold uppercase text-[10px]">Disbursement Snapshot</p>
                  <p className="text-slate-600">Disbursed Date: <span className="font-bold text-slate-900">{formatDate(selectedLoanForDetails.startDate)}</span></p>
                  <p className="text-slate-600">Maturity Due Date: <span className="font-bold text-slate-900">{formatDate(selectedLoanForDetails.dueDate)}</span></p>
                  <p className="text-slate-600">Monthly Interest Rate: <span className="font-bold text-slate-900">{selectedLoanForDetails.interestRatePercent}%</span></p>
                </div>
              </div>

              {/* Financial Balance Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50/60 border border-blue-200 p-3 rounded-lg text-center">
                  <p className="text-[10px] text-blue-700 font-bold uppercase">Gross Principal</p>
                  <p className="text-base font-black text-blue-900 mt-0.5">
                    {formatINR((selectedLoanForDetails.grossPrincipalPaise || selectedLoanForDetails.principalPaise || 0) / 100)}
                  </p>
                </div>

                <div className="bg-rose-50/60 border border-rose-200 p-3 rounded-lg text-center">
                  <p className="text-[10px] text-rose-700 font-bold uppercase">Upfront Interest</p>
                  <p className="text-base font-black text-rose-700 mt-0.5">
                    {formatINR((selectedLoanForDetails.upfrontInterestPaise || 0) / 100)}
                  </p>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-lg text-center">
                  <p className="text-[10px] text-emerald-700 font-bold uppercase">Principal Repaid</p>
                  <p className="text-base font-black text-emerald-700 mt-0.5">
                    {formatINR((selectedLoanForDetails.totalPrincipalPaidPaise || 0) / 100)}
                  </p>
                </div>

                <div className="bg-amber-50/60 border border-amber-200 p-3 rounded-lg text-center">
                  <p className="text-[10px] text-amber-800 font-bold uppercase">Remaining Balance</p>
                  <p className="text-base font-black text-amber-900 mt-0.5">
                    {formatINR((selectedLoanForDetails.outstandingPrincipalPaise || 0) / 100)}
                  </p>
                </div>
              </div>

              {/* Transaction Ledger Table */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2 flex items-center space-x-1.5">
                  <Receipt className="w-4 h-4 text-blue-600" />
                  <span>Loan Transaction & Collection History</span>
                </h4>

                {loadingDetails ? (
                  <p className="text-slate-400 py-4 text-center">Loading transactions...</p>
                ) : loanTransactions.length === 0 ? (
                  <p className="text-slate-400 py-4 text-center bg-slate-50 rounded-lg">
                    No payment collections recorded yet.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Receipt / Txn</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2 text-right">Repaid</th>
                          <th className="px-3 py-2 text-right">Remaining Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loanTransactions.map((tx) => (
                          <tr key={tx._id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-600">{formatDate(tx.date || tx.createdAt)}</td>
                            <td className="px-3 py-2 font-mono text-blue-700 font-bold">{tx.referenceId || tx.transactionId || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{tx.remarks || tx.type}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-600">
                              {tx.principalCreditPaise > 0 ? (
                                <span>{formatINR(tx.principalCreditPaise / 100)}</span>
                              ) : tx.interestCreditPaise > 0 ? (
                                <span className="text-amber-700" title="Interest Repaid">{formatINR(tx.interestCreditPaise / 100)}</span>
                              ) : (
                                '₹0.00'
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                              {formatINR((tx.balancePrincipalPaise || 0) / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK RECORD COLLECTION MODAL */}
      {isCollectionModalOpen && collectionTargetLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <Coins className="w-4 h-4 text-emerald-400" />
                <span>Record Monthly Collection · {collectionTargetLoan.loanId}</span>
              </h3>
              <button
                onClick={() => setIsCollectionModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordCollection} className="p-5 space-y-4 text-xs">
              {collectionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{collectionError}</span>
                </div>
              )}

              {collectionSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{collectionSuccess}</span>
                </div>
              )}

              {/* Borrower & Current Balance Info */}
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-bold text-slate-900">{collectionTargetLoan.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mobile:</span>
                  <span className="font-mono text-slate-700">{collectionTargetLoan.customerMobile}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5">
                  <span className="font-bold text-amber-800">Current Outstanding:</span>
                  <span className="font-mono font-black text-amber-700 text-sm">
                    {formatINR((collectionTargetLoan.outstandingPrincipalPaise || 0) / 100)}
                  </span>
                </div>
              </div>

              {/* Amount to Collect */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Collection Amount (₹) / பெறப்பட்ட தொகை *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    required
                    min="1"
                    max={(collectionTargetLoan.outstandingPrincipalPaise || 0) / 100}
                    step="any"
                    placeholder="Enter amount"
                    value={collectionAmount}
                    onChange={(e) => setCollectionAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Allocated 100% to principal repayment</span>
                  <button
                    type="button"
                    onClick={() => setCollectionAmount(String((collectionTargetLoan.outstandingPrincipalPaise || 0) / 100))}
                    className="text-blue-600 font-bold hover:underline"
                  >
                    Full Settlement
                  </button>
                </div>
              </div>

              {/* Payment Method & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Method *</label>
                  <select
                    value={collectionMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="CASH">CASH (பணம்)</option>
                    <option value="UPI">UPI / GPay</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={collectionDate}
                    onChange={(e) => setCollectionDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly instalment payment"
                  value={collectionRemarks}
                  onChange={(e) => setCollectionRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCollectionModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectionSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-md shadow-emerald-600/30 flex items-center space-x-2 cursor-pointer"
                >
                  {collectionSubmitting ? (
                    <span>Recording...</span>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Record Payment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
