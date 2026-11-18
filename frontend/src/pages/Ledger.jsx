import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Printer,
  Calendar,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';
import { formatINR, formatDate, formatDateTime } from '../utils/formatters';
import api from '../api';

export default function Ledger() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedLoanId, setSelectedLoanId] = useState('ALL');
  const [customerLoans, setCustomerLoans] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [ledgerData, setLedgerData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load Customers
  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await api.get('/customers?limit=200');
        if (res.data.success && res.data.customers.length > 0) {
          setCustomers(res.data.customers);
          setSelectedCustomerId(res.data.customers[0]._id);
        }
      } catch (err) {
        console.error('Failed to load customers for ledger', err);
      }
    }
    loadCustomers();
  }, []);

  // Fetch customer ledger when selected customer or filters change
  const fetchLedger = async () => {
    if (!selectedCustomerId) return;
    setLoading(true);
    try {
      const res = await api.get(`/ledger/customer/${selectedCustomerId}`, {
        params: {
          loanId: selectedLoanId !== 'ALL' ? selectedLoanId : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });

      if (res.data.success) {
        setLedgerData(res.data.ledger);
        setCustomerLoans(res.data.ledger.loans || []);
      }
    } catch (err) {
      console.error('Failed to load ledger', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [selectedCustomerId, selectedLoanId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span>Customer & Loan Financial Ledgers</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable, double-entry financial transaction history with date filters and printable statements
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Print Ledger Statement</span>
        </button>
      </div>

      {/* Filter Toolbar (No Print) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs no-print">
        {/* Customer Select */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Select Customer</label>
          <select
            value={selectedCustomerId}
            onChange={(e) => {
              setSelectedCustomerId(e.target.value);
              setSelectedLoanId('ALL');
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
          >
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.customerId})
              </option>
            ))}
          </select>
        </div>

        {/* Loan Select */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Loan Account</label>
          <select
            value={selectedLoanId}
            onChange={(e) => setSelectedLoanId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
          >
            <option value="ALL">All Loans (Unified Customer Ledger)</option>
            {customerLoans.map((l) => (
              <option key={l._id} value={l._id}>
                {l.loanId} ({l.vattiType} - ₹{l.principalPaise / 100})
              </option>
            ))}
          </select>
        </div>

        {/* Date Filters */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">From Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">To Date</label>
          <div className="flex space-x-2">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
            />
            <button
              onClick={fetchLedger}
              className="px-3 py-1.5 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700"
            >
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Ledger Document (Printable) */}
      {loading ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
          Loading ledger entries...
        </div>
      ) : !ledgerData ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
          Please select a customer to view ledger.
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          {/* Printable Header */}
          <div className="text-center border-b border-slate-300 pb-4">
            <h1 className="text-2xl font-black text-slate-950 tracking-wider">CPN RAJA</h1>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
              VATTI BUSINESS MANAGEMENT SYSTEM
            </p>
            <p className="text-xs text-slate-500 mt-1">Official Account Ledger & Double-Entry Statement</p>
          </div>

          {/* Customer & Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-1">
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Account Holder:</span>
              <p className="text-base font-bold text-slate-900">{ledgerData.customer?.name}</p>
              <p className="font-mono text-slate-600">Customer ID: {ledgerData.customer?.customerId}</p>
              <p className="text-slate-700">Mobile: {ledgerData.customer?.mobileNumber}</p>
              <p className="text-slate-500">Address: {ledgerData.customer?.address || '—'}</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 font-mono space-y-1">
              <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase">Financial Summary:</span>
              <div className="flex justify-between font-sans">
                <span>Total Principal Borrowed:</span>
                <span className="font-bold text-slate-900">{formatINR(ledgerData.summary.totalLentRupees)}</span>
              </div>
              <div className="flex justify-between font-sans text-emerald-700">
                <span>Total Principal Repaid:</span>
                <span className="font-bold">{formatINR(ledgerData.summary.totalPrincipalPaidRupees)}</span>
              </div>
              <div className="flex justify-between font-sans text-emerald-700">
                <span>Total Interest Repaid:</span>
                <span className="font-bold">{formatINR(ledgerData.summary.totalInterestPaidRupees)}</span>
              </div>
              <div className="flex justify-between font-sans text-rose-700 border-t border-slate-200 pt-1 font-bold">
                <span>Total Outstanding Balance:</span>
                <span>{formatINR(ledgerData.summary.totalOutstandingRupees)}</span>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Date</th>
                  <th className="py-2.5 px-3 font-semibold">Txn ID</th>
                  <th className="py-2.5 px-2.5 font-semibold">Loan</th>
                  <th className="py-2.5 px-3 font-semibold">Category</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Principal Debit</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Principal Credit</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Interest Credit</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Bal Principal</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Bal Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {ledgerData.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-400 font-sans">
                      No transactions recorded within selected date criteria.
                    </td>
                  </tr>
                ) : (
                  ledgerData.transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-sans text-slate-800">{formatDate(t.date)}</td>
                      <td className="py-2.5 px-3 text-slate-600">{t.transactionId}</td>
                      <td className="py-2.5 px-2.5 font-bold text-blue-700">{t.loanCode}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.type === 'LOAN_DISBURSEMENT'
                            ? 'bg-blue-100 text-blue-800'
                            : t.type === 'COLLECTION'
                            ? 'bg-emerald-100 text-emerald-800'
                            : t.type === 'REVERSAL'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                        {t.principalDebitRupees > 0 ? formatINR(t.principalDebitRupees) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-emerald-700">
                        {t.principalCreditRupees > 0 ? formatINR(t.principalCreditRupees) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-emerald-700">
                        {t.interestCreditRupees > 0 ? formatINR(t.interestCreditRupees) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                        {formatINR(t.balancePrincipalRupees)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-950">
                        {formatINR(t.balanceTotalRupees)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pt-4 border-t border-slate-300 text-center text-[10px] text-slate-400">
            Statement generated on {formatDateTime(new Date())} • Double-entry verified • CPN Raja
          </div>
        </div>
      )}
    </div>
  );
}
