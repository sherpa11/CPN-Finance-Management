import React from 'react';
import { X, Printer, CheckCircle, ArrowDownCircle } from 'lucide-react';
import { formatINR, formatDate, formatDateTime } from '../utils/formatters';

export default function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden my-4 sm:my-8 max-h-[92vh] flex flex-col">
        {/* Top Header - No print */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-2 no-print shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <h2 className="font-bold text-sm sm:text-base truncate">Payment Receipt</h2>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm cursor-pointer min-h-[36px]"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden xs:inline">Print Receipt</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Content */}
        <div className="p-4 sm:p-8 print:p-0 text-slate-800 overflow-y-auto" id="printable-receipt">
          {/* Business Header */}
          <div className="text-center border-b border-slate-300 pb-4 mb-5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-wider">CPN RAJA</h1>
            <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest">
              FINANCE MANAGEMENT SYSTEM
            </p>
            <p className="text-xs text-slate-500 mt-1">Official Financial Collection Voucher</p>
          </div>

          {/* Receipt Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs mb-6 bg-slate-50 print:bg-transparent p-3 rounded-lg border border-slate-200 print:border-none">
            <div>
              <p className="text-slate-500">Receipt Number:</p>
              <p className="font-mono font-bold text-slate-900 text-sm">{receipt.receiptNumber}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-slate-500">Payment Date:</p>
              <p className="font-medium text-slate-900">{formatDate(receipt.paymentDate)}</p>
            </div>
          </div>

          {/* Customer & Loan Details */}
          <div className="border border-slate-200 rounded-lg p-4 mb-6 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Customer Name:</span>
              <span className="font-bold text-slate-900 text-sm">{receipt.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Customer Code:</span>
              <span className="font-mono text-slate-700">{receipt.customerId}</span>
            </div>
            {receipt.customerMobile && (
              <div className="flex justify-between">
                <span className="text-slate-500">Mobile:</span>
                <span className="text-slate-700">{receipt.customerMobile}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-500">Loan Account:</span>
              <span className="font-mono font-bold text-blue-700">
                {receipt.loanCode} ({receipt.vattiType === 'MONTHLY' ? 'Monthly Finance' : receipt.vattiType === 'DAILY' ? 'Daily Finance' : receipt.vattiType === 'MEATER' ? 'Meater Finance' : (receipt.vattiType || '')})
              </span>
            </div>
          </div>

          {/* Payment Allocation Table */}
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Payment Allocation Breakdown
            </h3>
            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3 text-left">Allocation Category</th>
                  <th className="py-2 px-3 text-right">Amount Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-700">Principal Repayment</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                    {formatINR(receipt.principalAllocationRupees)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-sans text-slate-700">Interest Repayment</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                    {formatINR(receipt.interestAllocationRupees)}
                  </td>
                </tr>
                <tr className="bg-emerald-50/80 font-bold border-t-2 border-emerald-300">
                  <td className="py-2.5 px-3 font-sans text-emerald-950">Total Amount Received</td>
                  <td className="py-2.5 px-3 text-right text-emerald-800 text-sm">
                    {formatINR(receipt.totalAmountRupees)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Balance Post-Transaction */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs mb-6 font-mono space-y-1">
            <div className="flex justify-between text-slate-600 font-sans">
              <span>Payment Mode:</span>
              <span className="font-semibold text-slate-800 uppercase">{receipt.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-slate-600 font-sans">
              <span>Remaining Principal:</span>
              <span className="text-slate-900">{formatINR(receipt.remainingPrincipalRupees)}</span>
            </div>
            <div className="flex justify-between text-slate-600 font-sans">
              <span>Remaining Interest:</span>
              <span className="text-slate-900">{formatINR(receipt.remainingInterestRupees)}</span>
            </div>
            <div className="flex justify-between font-bold pt-1 border-t border-slate-200 text-slate-950 text-sm">
              <span className="font-sans">Total Outstanding Balance:</span>
              <span>{formatINR(receipt.totalRemainingRupees)}</span>
            </div>
          </div>

          {receipt.remarks && (
            <p className="text-xs text-slate-500 italic mb-6">
              Remarks: {receipt.remarks}
            </p>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-10 border-t border-dashed border-slate-300 text-center text-xs">
            <div>
              <p className="border-t border-slate-400 pt-1 text-slate-600 font-medium">Customer Signature</p>
            </div>
            <div>
              <p className="border-t border-slate-400 pt-1 text-slate-600 font-medium">
                Authorized Signatory ({receipt.collectedBy || 'CPN Raja'})
              </p>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-400 mt-6">
            Generated on {formatDateTime(new Date())} • Computer Generated Official Receipt
          </div>
        </div>
      </div>
    </div>
  );
}
