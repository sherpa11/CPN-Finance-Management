import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
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

export default function DailyFinance({ onNavigate, preselectedCustomer }) {
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
    capitalLent: 0,
    principalReturned: 0,
    outstandingPrincipal: 0,
    interestCollected: 0,
  });

  // Disbursement Form States
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomer?._id || '');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [upfrontRatePercent, setUpfrontRatePercent] = useState('2.0');
  const [durationDays, setDurationDays] = useState('10');
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
  const [collectionPrincipalAllocation, setCollectionPrincipalAllocation] = useState('');
  const [collectionPenaltyAllocation, setCollectionPenaltyAllocation] = useState('0');
  const [collectionMethod, setPaymentMethod] = useState('CASH');
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectionRemarks, setCollectionRemarks] = useState('');
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);
  const [collectionError, setCollectionError] = useState('');
  const [collectionSuccess, setCollectionSuccess] = useState('');

  // Synchronize Due Date when Start Date or Duration Days changes
  useEffect(() => {
    if (startDate && durationDays) {
      const d = new Date(startDate);
      const daysCount = parseInt(durationDays, 10);
      if (!isNaN(d.getTime()) && !isNaN(daysCount) && daysCount > 0) {
        d.setDate(d.getDate() + daysCount);
        setDueDate(d.toISOString().split('T')[0]);
      }
    }
  }, [startDate, durationDays]);

  // Synchronize Duration Days when Due Date is manually changed
  const handleDueDateChange = (e) => {
    const newDueDate = e.target.value;
    setDueDate(newDueDate);
    if (startDate && newDueDate) {
      const s = new Date(startDate);
      const d = new Date(newDueDate);
      const diffDays = Math.round((d - s) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        setDurationDays(String(diffDays));
      }
    }
  };

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

  // Fetch Daily Loans and Compute Metrics
  const fetchDailyLoans = async () => {
    setLoading(true);
    try {
      const params = {
        vattiType: 'DAILY',
        limit: 100,
      };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await api.get('/loans', { params });
      if (res.data?.success) {
        const fetchedLoans = res.data.loans || [];
        setLoans(fetchedLoans);
        setTotalLoans(res.data.total || fetchedLoans.length);

        // Compute metrics
        let activeCount = 0;
        let lentSum = 0;
        let returnedSum = 0;
        let outstandingSum = 0;
        let interestSum = 0;

        fetchedLoans.forEach((l) => {
          const gross = (l.grossPrincipalPaise || l.principalPaise || 0) / 100;
          const upfrontInterest = (l.upfrontInterestPaise || (l.dailyFinanceDetails?.upfrontInterestPaise) || 0) / 100;
          const netDisbursed = l.netDisbursementPaise !== undefined ? l.netDisbursementPaise / 100 : Math.max(0, gross - upfrontInterest);
          const returned = (l.totalPrincipalPaidPaise || 0) / 100;
          const outstanding = (l.outstandingPrincipalPaise || 0) / 100;
          const interestCollected = (l.totalInterestPaidPaise || upfrontInterest) / 100;

          lentSum += netDisbursed;
          returnedSum += returned;
          outstandingSum += outstanding;
          interestSum += interestCollected;

          if (l.status === 'ACTIVE' || l.status === 'OVERDUE') {
            activeCount += 1;
          }
        });

        setMetrics({
          activeCount,
          capitalLent: lentSum,
          principalReturned: returnedSum,
          outstandingPrincipal: outstandingSum,
          interestCollected: interestSum,
        });
      }
    } catch (err) {
      console.error('Failed to load daily finance loans', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyLoans();
  }, [statusFilter, search]);

  // Live Calculation for Daily Finance Upfront Interest Model
  const pAmount = parseFloat(principalAmount) || 0;
  const ratePct = parseFloat(upfrontRatePercent) || 0;
  const numDays = parseInt(durationDays, 10) > 0 ? parseInt(durationDays, 10) : 1;

  // 1. Upfront interest = Principal × Rate% / 100
  const upfrontInterestDeducted = pAmount > 0 && ratePct >= 0 ? Math.round((pAmount * ratePct) / 100) : 0;

  // 2. Net cash disbursed = Principal - Upfront Interest
  const netCashGiven = Math.max(0, pAmount - upfrontInterestDeducted);

  // 3. Total daily repayment = Full Principal
  const totalDailyRepayment = pAmount;

  // 4. Daily instalment = Principal ÷ Duration in days
  const dailyCollectionAmount = pAmount > 0 && numDays > 0 ? Math.floor(pAmount / numDays) : 0;

  // 5. Total interest collected = Upfront interest
  const totalInterestCollected = upfrontInterestDeducted;

  // 6. Total cash received from customer = Full Principal
  const totalCashReceived = pAmount;

  // 7. Total business receipt including upfront interest = Principal + Upfront interest
  const totalBusinessReceipt = pAmount + upfrontInterestDeducted;

  // 8. Total profit / interest = Upfront interest
  const totalProfit = upfrontInterestDeducted;

  // Open Confirmation Modal
  const handleInitiateDisbursement = (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!selectedCustomerId) {
      setFormError('Please select a borrower.');
      return;
    }
    if (pAmount <= 0) {
      setFormError('Please enter a valid Principal amount.');
      return;
    }
    if (ratePct < 0) {
      setFormError('Upfront interest rate cannot be negative.');
      return;
    }
    if (numDays <= 0) {
      setFormError('Number of collection days must be at least 1 day.');
      return;
    }
    if (!startDate || !dueDate) {
      setFormError('Please select valid start and due dates.');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // Submit Daily Loan to Backend
  const handleConfirmDisbursement = async () => {
    setDisbursing(true);
    setFormError('');
    try {
      const res = await api.post('/loans', {
        customerId: selectedCustomerId,
        vattiType: 'DAILY',
        principalAmount: pAmount,
        interestRatePercent: ratePct,
        startDate,
        dueDate,
        remarks,
      });

      if (res.data?.success) {
        setIsConfirmModalOpen(false);
        setFormSuccess(`Daily Finance ${res.data.loan?.loanId || ''} disbursed successfully!`);
        // Reset form
        setPrincipalAmount('');
        setRemarks('');
        setSelectedCustomerId('');
        fetchDailyLoans();
        setTimeout(() => {
          setActiveTab('roster');
          setFormSuccess('');
        }, 1800);
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to disburse daily finance');
      setIsConfirmModalOpen(false);
    } finally {
      setDisbursing(false);
    }
  };

  // Open Details Modal
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
    const targetInstalment = loan.dailyInstalmentPaise
      ? String(loan.dailyInstalmentPaise / 100)
      : String(Math.min((loan.outstandingPrincipalPaise || 0) / 100, Math.floor((loan.principalPaise || 0) / (loan.totalDurationDays || 10) / 100)));
    const targetVal = targetInstalment > 0 ? targetInstalment : '';
    setCollectionAmount(targetVal);
    setCollectionPrincipalAllocation(targetVal);
    setCollectionPenaltyAllocation('0');
    setCollectionError('');
    setCollectionSuccess('');
    setPaymentMethod('CASH');
    setCollectionDate(new Date().toISOString().split('T')[0]);
    setCollectionRemarks('');
    setIsCollectionModalOpen(true);
  };

  // Submit Quick Collection (with strict separation between Principal and Penalty)
  const handleRecordCollection = async (e) => {
    e.preventDefault();
    if (!collectionTargetLoan) return;

    const amt = parseFloat(collectionAmount);
    if (!amt || amt <= 0) {
      setCollectionError('Please enter a valid collection payment amount.');
      return;
    }

    const pAlloc = parseFloat(collectionPrincipalAllocation) || 0;
    const penaltyAlloc = parseFloat(collectionPenaltyAllocation) || 0;

    if (Math.round((pAlloc + penaltyAlloc) * 100) !== Math.round(amt * 100)) {
      setCollectionError(`Sum of principal (₹${pAlloc}) and penalty (₹${penaltyAlloc}) allocations must equal total payment (₹${amt}).`);
      return;
    }

    const currentBal = (collectionTargetLoan.outstandingPrincipalPaise || 0) / 100;
    if (pAlloc > currentBal) {
      setCollectionError(`Principal allocation cannot exceed outstanding principal balance of ${formatINR(currentBal)}`);
      return;
    }

    const penaltyBal = collectionTargetLoan.penaltyBreakdown?.penaltyOutstandingRupees || 0;
    if (penaltyAlloc > penaltyBal && penaltyBal > 0) {
      setCollectionError(`Penalty allocation cannot exceed outstanding penalty of ${formatINR(penaltyBal)}`);
      return;
    }

    setCollectionSubmitting(true);
    setCollectionError('');
    try {
      const res = await api.post('/collections', {
        loanId: collectionTargetLoan._id,
        paymentAmount: amt,
        principalAllocation: pAlloc,
        interestAllocation: 0,
        penaltyAllocation: penaltyAlloc,
        paymentMethod: collectionMethod,
        paymentDate: collectionDate,
        remarks: collectionRemarks || (penaltyAlloc > 0 ? 'Daily repayment & overdue penalty' : 'Daily Finance repayment collection'),
      });

      if (res.data?.success) {
        setCollectionSuccess(`Daily payment of ${formatINR(amt)} recorded successfully!`);
        fetchDailyLoans();
        setTimeout(() => {
          setIsCollectionModalOpen(false);
          setCollectionTargetLoan(null);
        }, 1200);
      }
    } catch (err) {
      setCollectionError(err.response?.data?.message || err.message || 'Failed to record daily collection');
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
            <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
              <CalendarDays className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Daily Finance</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800">
              நாள் வட்டி
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Upfront interest deduction daily finance. Customer receives principal minus upfront interest and repays full principal through daily instalments.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('roster')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'roster'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 Daily Loans Roster
          </button>
          <button
            onClick={() => setActiveTab('disburse')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'disburse'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>+ Disburse Daily Finance</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Active Loans</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">{metrics.activeCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Total: {totalLoans} records</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Capital Lent</span>
            <Wallet className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900">{formatINR(metrics.capitalLent)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Net cash handed out</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Upfront Interest</span>
            <Percent className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-purple-700">{formatINR(metrics.interestCollected)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Realized upfront profit</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Principal Returned</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-700">{formatINR(metrics.principalReturned)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">From daily collections</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-xs font-bold">Outstanding Principal</span>
            <Coins className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-amber-900">{formatINR(metrics.outstandingPrincipal)}</p>
          <p className="text-[11px] text-amber-700 mt-0.5">Daily repayment balance</p>
        </div>
      </div>

      {/* VIEW 1: DAILY LOANS ROSTER */}
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
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                        ? 'bg-amber-600 text-white'
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
              Loading Daily Finance records...
            </div>
          ) : loans.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs space-y-3">
              <CalendarDays className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">No Daily Finance loans found</p>
              <p className="text-slate-400 max-w-sm mx-auto">
                No daily finance loans match your current filter or search criteria.
              </p>
              <button
                onClick={() => setActiveTab('disburse')}
                className="mt-2 inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-500 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Disburse First Daily Loan</span>
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
                    <th className="px-4 py-3 text-right">Principal</th>
                    <th className="px-4 py-3 text-right">Upfront Interest</th>
                    <th className="px-4 py-3 text-right">Net Given</th>
                    <th className="px-4 py-3 text-right">Daily Instalment</th>
                    <th className="px-4 py-3 text-right">Daily Repaid</th>
                    <th className="px-4 py-3 text-right">Outstanding Balance</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-right">Overdue Penalty (2%)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loans.map((loan) => {
                    const gross = (loan.grossPrincipalPaise || loan.principalPaise || 0) / 100;
                    const upfrontInterest = (loan.upfrontInterestPaise || (loan.dailyFinanceDetails?.upfrontInterestPaise) || 0) / 100;
                    const netGiven = loan.netDisbursementPaise !== undefined ? loan.netDisbursementPaise / 100 : Math.max(0, gross - upfrontInterest);
                    const days = loan.totalDurationDays || loan.dailyFinanceDetails?.totalDurationDays || 10;
                    const dailyInstalment = loan.dailyInstalmentPaise !== undefined ? loan.dailyInstalmentPaise / 100 : Math.floor(gross / days);
                    const repaid = (loan.totalPrincipalPaidPaise || 0) / 100;
                    const outstanding = (loan.outstandingPrincipalPaise || 0) / 100;
                    const statusBadge = getStatusBadge(loan.status);

                    return (
                      <tr key={loan._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-amber-700">
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
                        <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
                          {formatINR(dailyInstalment)} / day ({days}d)
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          {formatINR(repaid)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-800">
                          {formatINR(outstanding)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {formatDate(loan.dueDate)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {loan.penaltyBreakdown && loan.penaltyBreakdown.overdueDays > 0 ? (
                            <div>
                              <span className="font-bold text-rose-700">
                                {formatINR(loan.penaltyBreakdown.penaltyOutstandingRupees)}
                              </span>
                              <div className="text-[10px] text-rose-500 font-mono">
                                {loan.penaltyBreakdown.overdueDays}d overdue ({formatINR(loan.penaltyBreakdown.dailyPenaltyRupees)}/d)
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">₹0.00</span>
                          )}
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
                              className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                              title="View Loan Statement & Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {loan.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleOpenCollectionModal(loan)}
                                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded text-[10px] transition-colors cursor-pointer flex items-center space-x-1"
                                title="Record Daily Collection"
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

      {/* VIEW 2: REGISTER NEW DAILY FINANCE */}
      {activeTab === 'disburse' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form (2 columns) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Plus className="w-4 h-4 text-amber-600" />
                <span>Register New Daily Finance (நாள் வட்டி)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Upfront interest deduction daily finance. Customer receives principal minus upfront interest and repays full original principal through daily instalments.
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

              {/* Principal & Upfront Interest Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Principal Amount (₹) / அசல் தொகை *
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
                      value={principalAmount}
                      onChange={(e) => setPrincipalAmount(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Upfront Interest Rate (% on Principal) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="e.g. 2.0"
                      value={upfrontRatePercent}
                      onChange={(e) => setUpfrontRatePercent(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                      %
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Deducted upfront: ₹{formatINR(upfrontInterestDeducted).replace('₹', '')}
                  </p>
                </div>
              </div>

              {/* Duration and Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Collection Days / தவணை நாட்கள் *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      placeholder="e.g. 10"
                      value={durationDays}
                      onChange={(e) => setDurationDays(e.target.value)}
                      className="w-full pl-3 pr-12 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">
                      Days
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Disbursement Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                    onChange={handleDueDateChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
                  placeholder="e.g. Daily market collection, signed promissory note"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Actions */}
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
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-amber-600/20 flex items-center space-x-2 cursor-pointer"
                >
                  <span>Review & Disburse Daily Finance</span>
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
                <span>Daily Finance Live Forecast</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Upfront Interest Deduction Calculation Model:
              </p>

              <div className="mt-4 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400 font-sans">Principal Amount:</span>
                  <span className="font-bold text-white">{formatINR(pAmount)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400 font-sans">Upfront Interest Rate:</span>
                  <span className="font-bold text-amber-300">{ratePct}%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400 font-sans">Upfront Interest Deducted:</span>
                  <span className="font-bold text-rose-400">- {formatINR(upfrontInterestDeducted)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-700 bg-emerald-950/40 px-2 rounded">
                  <span className="text-emerald-400 font-sans font-bold">Net Cash Given to Customer:</span>
                  <span className="font-black text-emerald-400 text-sm">{formatINR(netCashGiven)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400 font-sans">Daily Collection Amount:</span>
                  <span className="font-bold text-white">{formatINR(dailyCollectionAmount)} / day</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400 font-sans">Number of Collection Days:</span>
                  <span className="font-bold text-amber-300">{numDays} Days</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-700 bg-blue-950/40 px-2 rounded">
                  <span className="text-blue-300 font-sans font-bold">Total Daily Repayment:</span>
                  <span className="font-black text-blue-300 text-sm">{formatINR(totalDailyRepayment)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400 font-sans">Total Interest Collected:</span>
                  <span className="font-bold text-purple-400">{formatINR(totalInterestCollected)}</span>
                </div>
                <div className="flex justify-between py-1 text-[11px] text-slate-400">
                  <span className="font-sans">Total Business Receipt:</span>
                  <span className="font-mono text-slate-300">{formatINR(totalBusinessReceipt)}</span>
                </div>
              </div>

              {/* Explanatory callout */}
              <div className="mt-4 p-3 rounded-lg bg-amber-900/30 border border-amber-700/40 text-[11px] text-amber-200 space-y-1 font-sans">
                <p className="font-bold flex items-center space-x-1.5 text-amber-300">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Daily Finance Business Rules:</span>
                </p>
                <p className="text-slate-300 text-[10px]">
                  • Principal − Upfront Interest = <strong className="text-emerald-300">Net Cash Given</strong>
                </p>
                <p className="text-slate-300 text-[10px]">
                  • Full Original Principal = <strong className="text-blue-300">Total Daily Repayment</strong>
                </p>
                <p className="text-slate-400 text-[10px]">
                  Interest is recorded as collected immediately at loan disbursement. Customer repays the full original principal through daily instalments. Upfront interest is never charged or accrued again.
                </p>

                <div className="pt-2 border-t border-amber-800/60 mt-2">
                  <p className="font-bold flex items-center space-x-1.5 text-rose-300">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Client-Confirmed Daily Penalty Rule:</span>
                  </p>
                  <p className="text-slate-300 text-[10px] mt-0.5">
                    • Daily Penalty = Daily Repayment Amount × 2 / 100 ({formatINR((pAmount > 0 && numDays > 0 ? Math.round((Math.floor(pAmount / numDays) * 2) / 100) : 0))}/day)
                  </p>
                  <p className="text-slate-400 text-[10px]">
                    • Starts strictly on Day D+1 (Day {numDays + 1}). Days 1 to {numDays} incur ₹0 penalty.
                  </p>
                  <p className="text-slate-400 text-[10px]">
                    • Penalty is tracked separately from principal repayments and upfront profit.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 font-sans text-center mt-2">
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
                <CalendarDays className="w-4 h-4 text-amber-400" />
                <span>Confirm Daily Finance Disbursement</span>
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
                Please verify the Daily Finance details. Once confirmed, upfront interest will be recorded as collected and customer daily collection schedule will be initialized.
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
                  <span className="text-slate-500">Principal Amount:</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(pAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Upfront Interest ({ratePct}%):</span>
                  <span className="font-mono font-bold text-rose-600">- {formatINR(upfrontInterestDeducted)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5">
                  <span className="font-bold text-emerald-800">Net Cash Handed to Customer:</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">{formatINR(netCashGiven)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Daily Instalment Amount:</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(dailyCollectionAmount)} / day ({numDays} days)</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-blue-800">Total Daily Repayment Target:</span>
                  <span className="font-mono font-black text-blue-700 text-sm">{formatINR(totalDailyRepayment)}</span>
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
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-md shadow-amber-600/30 flex items-center space-x-2 cursor-pointer"
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
                  Daily Finance Statement · {selectedLoanForDetails.loanId}
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
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
                  FINANCE MANAGEMENT SYSTEM · DAILY FINANCE STATEMENT
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
                  <p className="text-slate-500">Loan ID: <span className="font-mono font-bold text-amber-700">{selectedLoanForDetails.loanId}</span></p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-1">
                  <p className="text-slate-400 font-bold uppercase text-[10px]">Disbursement Snapshot</p>
                  <p className="text-slate-600">Disbursed Date: <span className="font-bold text-slate-900">{formatDate(selectedLoanForDetails.startDate)}</span></p>
                  <p className="text-slate-600">Maturity Due Date: <span className="font-bold text-slate-900">{formatDate(selectedLoanForDetails.dueDate)}</span></p>
                  <p className="text-slate-600">Upfront Interest Rate: <span className="font-bold text-slate-900">{selectedLoanForDetails.interestRatePercent}%</span></p>
                  <p className="text-slate-600">Collection Duration: <span className="font-bold text-slate-900">{selectedLoanForDetails.totalDurationDays || 10} Days</span></p>
                </div>
              </div>

              {/* Financial Balance Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50/60 border border-blue-200 p-3 rounded-lg text-center">
                  <p className="text-[10px] text-blue-700 font-bold uppercase">Principal Amount</p>
                  <p className="text-base font-black text-blue-900 mt-0.5">
                    {formatINR((selectedLoanForDetails.grossPrincipalPaise || selectedLoanForDetails.principalPaise || 0) / 100)}
                  </p>
                </div>

                <div className="bg-rose-50/60 border border-rose-200 p-3 rounded-lg text-center">
                  <p className="text-[10px] text-rose-700 font-bold uppercase">Upfront Interest Deducted</p>
                  <p className="text-base font-black text-rose-700 mt-0.5">
                    {formatINR((selectedLoanForDetails.upfrontInterestPaise || selectedLoanForDetails.dailyFinanceDetails?.upfrontInterestPaise || 0) / 100)}
                  </p>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-lg text-center">
                  <p className="text-[10px] text-emerald-700 font-bold uppercase">Net Cash Given</p>
                  <p className="text-base font-black text-emerald-700 mt-0.5">
                    {formatINR((selectedLoanForDetails.netDisbursementPaise !== undefined ? selectedLoanForDetails.netDisbursementPaise : ((selectedLoanForDetails.principalPaise || 0) - (selectedLoanForDetails.upfrontInterestPaise || 0))) / 100)}
                  </p>
                </div>

                <div className="bg-amber-50/60 border border-amber-200 p-3 rounded-lg text-center">
                  <p className="text-[10px] text-amber-800 font-bold uppercase">Outstanding Daily Repayment</p>
                  <p className="text-base font-black text-amber-900 mt-0.5">
                    {formatINR((selectedLoanForDetails.outstandingPrincipalPaise || 0) / 100)}
                  </p>
                </div>
              </div>

              {/* Overdue Daily Penalty Breakdown (Client-Confirmed 2% Rule) */}
              {selectedLoanForDetails.penaltyBreakdown && (
                <div className="bg-rose-50/50 border border-rose-200 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-rose-200/60 pb-2">
                    <h4 className="font-bold text-rose-900 text-xs flex items-center space-x-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span>Overdue Daily Penalty Breakdown (Client-Confirmed 2% Rule)</span>
                    </h4>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200">
                      {selectedLoanForDetails.penaltyBreakdown.overdueDays > 0
                        ? `${selectedLoanForDetails.penaltyBreakdown.overdueDays} Days Overdue (Past Maturity)`
                        : 'Within Scheduled Term (₹0 Penalty)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-slate-500 font-sans">Scheduled Duration</p>
                      <p className="font-bold font-mono text-slate-800 text-sm mt-0.5">
                        {selectedLoanForDetails.totalDurationDays || selectedLoanForDetails.dailyFinanceDetails?.totalDurationDays || 10} Days
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-slate-500 font-sans">Daily Repayment Amount</p>
                      <p className="font-bold font-mono text-slate-800 text-sm mt-0.5">
                        {formatINR(selectedLoanForDetails.penaltyBreakdown.dailyRepaymentAmountRupees)}
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-rose-600 font-sans font-medium">Daily Penalty Rate (2%)</p>
                      <p className="font-bold font-mono text-rose-700 text-sm mt-0.5">
                        {formatINR(selectedLoanForDetails.penaltyBreakdown.dailyPenaltyRupees)} / day
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-slate-500 font-sans">Cumulative Penalty</p>
                      <p className="font-bold font-mono text-slate-900 text-sm mt-0.5">
                        {formatINR(selectedLoanForDetails.penaltyBreakdown.cumulativePenaltyRupees)}
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-emerald-600 font-sans font-medium">Penalty Paid</p>
                      <p className="font-bold font-mono text-emerald-700 text-sm mt-0.5">
                        {formatINR(selectedLoanForDetails.penaltyBreakdown.penaltyPaidRupees)}
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <p className="text-[10px] text-rose-700 font-sans font-bold">Penalty Outstanding</p>
                      <p className="font-bold font-mono text-rose-800 text-sm mt-0.5">
                        {formatINR(selectedLoanForDetails.penaltyBreakdown.penaltyOutstandingRupees)}
                      </p>
                    </div>

                    <div className="bg-amber-100/70 p-2.5 rounded-lg border border-amber-300 col-span-2">
                      <p className="text-[10px] text-amber-900 font-sans font-bold">Total Amount Required to Close Loan</p>
                      <p className="font-black font-mono text-amber-950 text-base mt-0.5">
                        {formatINR(selectedLoanForDetails.penaltyBreakdown.totalAmountToCloseRupees)}
                      </p>
                      <p className="text-[9px] text-amber-800 mt-0.5">
                        Principal ({formatINR((selectedLoanForDetails.outstandingPrincipalPaise || 0) / 100)}) + Penalty ({formatINR(selectedLoanForDetails.penaltyBreakdown.penaltyOutstandingRupees)})
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Transaction Ledger Table */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2 flex items-center space-x-1.5">
                  <Receipt className="w-4 h-4 text-amber-600" />
                  <span>Loan Transaction & Daily Collection History</span>
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
                          <th className="px-3 py-2 text-right">Daily Repaid</th>
                          <th className="px-3 py-2 text-right">Remaining Principal Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loanTransactions.map((tx) => (
                          <tr key={tx._id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-600">{formatDate(tx.date || tx.createdAt)}</td>
                            <td className="px-3 py-2 font-mono text-amber-700 font-bold">{tx.transactionId || tx.referenceId || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{tx.remarks || tx.type}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-600">
                              {formatINR((tx.principalCreditPaise || 0) / 100)}
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
                <Coins className="w-4 h-4 text-amber-400" />
                <span>Record Daily Collection · {collectionTargetLoan.loanId}</span>
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

              {/* Borrower & Balance Info */}
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
                  <span className="font-bold text-amber-800">Outstanding Principal Repayment:</span>
                  <span className="font-mono font-black text-amber-700 text-sm">
                    {formatINR((collectionTargetLoan.outstandingPrincipalPaise || 0) / 100)}
                  </span>
                </div>
                {collectionTargetLoan.penaltyBreakdown && collectionTargetLoan.penaltyBreakdown.penaltyOutstandingRupees > 0 && (
                  <>
                    <div className="flex justify-between text-rose-700">
                      <span className="font-bold">Overdue Penalty (2%/day):</span>
                      <span className="font-mono font-black text-rose-700 text-sm">
                        {formatINR(collectionTargetLoan.penaltyBreakdown.penaltyOutstandingRupees)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1 text-slate-900 font-bold bg-amber-50/80 -mx-1.5 px-1.5 py-1 rounded">
                      <span>Total Required to Close Loan:</span>
                      <span className="font-mono font-black text-amber-950 text-sm">
                        {formatINR(collectionTargetLoan.penaltyBreakdown.totalAmountToCloseRupees)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Total Payment Amount */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Collection Payment Amount (₹) / பெறப்பட்ட தொகை *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    placeholder="Enter amount"
                    value={collectionAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCollectionAmount(val);
                      if (!collectionTargetLoan.penaltyBreakdown || collectionTargetLoan.penaltyBreakdown.penaltyOutstandingRupees <= 0) {
                        setCollectionPrincipalAllocation(val);
                        setCollectionPenaltyAllocation('0');
                      }
                    }}
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Strict separation of principal and overdue penalty</span>
                  <button
                    type="button"
                    onClick={() => {
                      const fullP = (collectionTargetLoan.outstandingPrincipalPaise || 0) / 100;
                      const fullPen = collectionTargetLoan.penaltyBreakdown?.penaltyOutstandingRupees || 0;
                      setCollectionAmount(String(fullP + fullPen));
                      setCollectionPrincipalAllocation(String(fullP));
                      setCollectionPenaltyAllocation(String(fullPen));
                    }}
                    className="text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    Full Settlement (₹{formatINR((collectionTargetLoan.outstandingPrincipalPaise || 0) / 100 + (collectionTargetLoan.penaltyBreakdown?.penaltyOutstandingRupees || 0)).replace('₹', '')})
                  </button>
                </div>
              </div>

              {/* Split allocation inputs if penalty outstanding exists */}
              {collectionTargetLoan.penaltyBreakdown && collectionTargetLoan.penaltyBreakdown.penaltyOutstandingRupees > 0 && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50/40 rounded-lg border border-amber-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Principal Allocation (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={collectionPrincipalAllocation}
                      onChange={(e) => setCollectionPrincipalAllocation(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-rose-700 mb-1">Penalty Allocation (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={collectionPenaltyAllocation}
                      onChange={(e) => setCollectionPenaltyAllocation(e.target.value)}
                      className="w-full px-3 py-1.5 border border-rose-300 rounded-lg font-mono font-bold text-xs bg-white text-rose-700"
                    />
                  </div>
                </div>
              )}

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
                  placeholder="e.g. Daily repayment received"
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
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-md shadow-amber-600/30 flex items-center space-x-2 cursor-pointer"
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
