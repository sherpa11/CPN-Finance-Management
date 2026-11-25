import React, { useState, useEffect } from 'react';
import { X, Printer, FileText } from 'lucide-react';
import { formatINR, formatDate, formatDateTime } from '../utils/formatters';
import api from '../api';

export default function CustomerStatementModal({ customerId, onClose }) {
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatement() {
      try {
        const res = await api.get(`/customers/${customerId}/statement`);
        if (res.data.success) {
          setStatement(res.data.statement);
        }
      } catch (err) {
        console.error('Failed to load statement', err);
      } finally {
        setLoading(false);
      }
    }
    if (customerId) fetchStatement();
  }, [customerId]);

  const handlePrint = () => {
    window.print();
  };

  if (!customerId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-4 sm:my-6 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-2 no-print shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <FileText className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="font-bold text-sm sm:text-base truncate">Customer Account Statement</h2>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm cursor-pointer min-h-[36px]"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden xs:inline">Print Statement</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading statement details...</div>
        ) : !statement ? (
          <div className="p-12 text-center text-slate-500 text-sm">Statement not available.</div>
        ) : (
          <div className="p-4 sm:p-8 print:p-0 text-slate-800 text-xs overflow-y-auto">
            {/* Header */}
            <div className="text-center border-b border-slate-300 pb-4 mb-5">
              <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-wider">CPN RAJA</h1>
              <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest">
                FINANCE MANAGEMENT SYSTEM
              </p>
              <p className="text-xs text-slate-500 mt-1">Official Statement of Customer Account</p>
            </div>

            {/* Customer Details & Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 sm:p-4 space-y-1.5">
                <p className="text-slate-500">Customer Details:</p>
                <p className="text-base font-bold text-slate-950">{statement.customer.name}</p>
                <p className="font-mono text-slate-600">ID: {statement.customer.customerId}</p>
                <p className="text-slate-700">Mobile: {statement.customer.mobileNumber}</p>
                {statement.customer.address && <p className="text-slate-600">Address: {statement.customer.address}</p>}
                <p className="text-[11px] text-slate-400">Registered: {formatDate(statement.customer.registrationDate)}</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 sm:p-4 space-y-1.5 font-mono">
                <p className="text-slate-500 font-sans">Financial Position:</p>
                <div className="flex justify-between font-sans">
                  <span>Total Borrowed:</span>
                  <span className="font-bold">{formatINR(statement.summary.totalLentRupees)}</span>
                </div>
                <div className="flex justify-between font-sans text-emerald-700">
                  <span>Principal Repaid:</span>
                  <span className="font-bold">{formatINR(statement.summary.totalPrincipalPaidRupees)}</span>
                </div>
                <div className="flex justify-between font-sans text-emerald-700">
                  <span>Interest Repaid:</span>
                  <span className="font-bold">{formatINR(statement.summary.totalInterestPaidRupees)}</span>
                </div>
                <div className="flex justify-between font-sans text-rose-700 border-t border-slate-200 pt-1 font-bold text-sm">
                  <span>Total Outstanding:</span>
                  <span>{formatINR(statement.summary.totalOutstandingRupees)}</span>
                </div>
              </div>
            </div>

            {/* Loans Taken */}
            <div className="mb-6">
              <h3 className="font-bold text-sm text-slate-900 mb-2">Loan Accounts</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left min-w-[640px]">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Loan ID</th>
                      <th className="py-2 px-3">Finance Type</th>
                      <th className="py-2 px-3">Start Date</th>
                      <th className="py-2 px-3">Due Date</th>
                      <th className="py-2 px-3">Rate</th>
                      <th className="py-2 px-3 text-right">Principal</th>
                      <th className="py-2 px-3 text-right">Outstanding</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statement.loans.map((loan) => (
                      <tr key={loan._id}>
                        <td className="py-2 px-3 font-mono font-semibold text-blue-700">{loan.loanId}</td>
                        <td className="py-2 px-3 font-medium">{loan.financeType || (loan.vattiType ? `${loan.vattiType} Finance` : '—')}</td>
                        <td className="py-2 px-3">{formatDate(loan.startDate)}</td>
                        <td className="py-2 px-3">{formatDate(loan.dueDate)}</td>
                        <td className="py-2 px-3 font-mono">{loan.interestRatePercent}%</td>
                        <td className="py-2 px-3 text-right font-mono font-medium">{formatINR(loan.principalPaise / 100)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-rose-700">
                          {formatINR((loan.outstandingPrincipalPaise + loan.outstandingInterestPaise) / 100)}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            loan.status === 'SETTLED' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {loan.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Transactions History */}
            <div className="mb-6">
              <h3 className="font-bold text-sm text-slate-900 mb-2">Complete Ledger Transactions</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left min-w-[640px]">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">Date</th>
                      <th className="py-2 px-2.5">Txn ID</th>
                      <th className="py-2 px-2.5">Type</th>
                      <th className="py-2 px-2.5 text-right">Principal Debit</th>
                      <th className="py-2 px-2.5 text-right">Principal Credit</th>
                      <th className="py-2 px-2.5 text-right">Interest Credit</th>
                      <th className="py-2 px-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {statement.transactions.map((t) => (
                      <tr key={t._id}>
                        <td className="py-2 px-2.5 font-sans">{formatDate(t.date)}</td>
                        <td className="py-2 px-2.5 text-slate-600">{t.transactionId}</td>
                        <td className="py-2 px-2.5 font-sans">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.type === 'LOAN_DISBURSEMENT'
                              ? 'bg-blue-100 text-blue-800'
                              : t.type === 'COLLECTION'
                              ? 'bg-emerald-100 text-emerald-800'
                              : t.type === 'RENEWAL_INTEREST'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}>
                            {t.type}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-right font-medium text-slate-900">
                          {t.principalDebitPaise > 0 ? formatINR(t.principalDebitPaise / 100) : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right text-emerald-700 font-medium">
                          {t.principalCreditPaise > 0 ? formatINR(t.principalCreditPaise / 100) : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right text-emerald-700 font-medium">
                          {t.interestCreditPaise > 0 ? formatINR(t.interestCreditPaise / 100) : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-bold text-slate-950">
                          {formatINR(t.balanceTotalPaise / 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t border-slate-300 text-center text-[10px] text-slate-400">
              Statement generated as of {formatDateTime(new Date())} • CPN Raja Finance Management System
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
