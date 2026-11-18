import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  FileSpreadsheet,
  TrendingUp,
  Percent,
  Wallet,
  ArrowDownLeft,
} from 'lucide-react';
import { formatINR, formatDate } from '../utils/formatters';
import api from '../api';

export default function Reports() {
  const [activeReportTab, setActiveReportTab] = useState('daily');
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const [dailyData, setDailyData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [yearlyData, setYearlyData] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [categoryData, setCategoryData] = useState(null);

  const [loading, setLoading] = useState(false);

  // Fetch report based on active tab
  useEffect(() => {
    async function loadReport() {
      setLoading(true);
      try {
        if (activeReportTab === 'daily') {
          const res = await api.get('/reports/daily', { params: { date: dailyDate } });
          if (res.data.success) setDailyData(res.data.report);
        } else if (activeReportTab === 'monthly') {
          const res = await api.get('/reports/monthly', { params: { year: selectedYear, month: selectedMonth } });
          if (res.data.success) setMonthlyData(res.data.report);
        } else if (activeReportTab === 'yearly') {
          const res = await api.get('/reports/yearly', { params: { year: selectedYear } });
          if (res.data.success) setYearlyData(res.data.report);
        } else if (activeReportTab === 'customer') {
          const res = await api.get('/reports/customer');
          if (res.data.success) setCustomerData(res.data.customers);
        } else if (activeReportTab === 'category') {
          const res = await api.get('/reports/category');
          if (res.data.success) setCategoryData(res.data.categories);
        }
      } catch (err) {
        console.error('Failed to load report data', err);
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [activeReportTab, dailyDate, selectedYear, selectedMonth]);

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

  const handleExportCSV = () => {
    if (activeReportTab === 'daily' && dailyData) {
      exportToCSV(dailyData.collections || [], `CPN_Daily_Report_${dailyDate}`);
    } else if (activeReportTab === 'customer' && customerData) {
      exportToCSV(customerData, `CPN_Customer_Financial_Report_${new Date().toISOString().split('T')[0]}`);
    } else if (activeReportTab === 'category' && categoryData) {
      exportToCSV(categoryData, `CPN_Vatti_Category_Report`);
    } else {
      alert('CSV export ready for Collections, Customers and Vatti Categories.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <span>Comprehensive Financial Reporting</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Segregated accounting of principal lending, collections, and accrued vs collected interest
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors border border-slate-300"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Excel / CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="flex flex-wrap gap-2 text-xs font-semibold no-print">
        {[
          { id: 'daily', label: '1. Daily Report' },
          { id: 'monthly', label: '2. Monthly Report' },
          { id: 'yearly', label: '3. Yearly Report' },
          { id: 'customer', label: '4. Customer Report' },
          { id: 'category', label: '5. Vatti Category Report' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveReportTab(tab.id)}
            className={`px-4 py-2 rounded-lg border transition-all cursor-pointer ${
              activeReportTab === tab.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date Pickers for Daily / Monthly / Yearly (No Print) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4 text-xs no-print">
        {activeReportTab === 'daily' && (
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-700">Select Date:</span>
            <input
              type="date"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>
        )}

        {activeReportTab === 'monthly' && (
          <div className="flex items-center space-x-3">
            <span className="font-semibold text-slate-700">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {new Date(2026, m - 1).toLocaleString('en', { month: 'long' })}
                </option>
              ))}
            </select>
            <span className="font-semibold text-slate-700">Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}

        {activeReportTab === 'yearly' && (
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-700">Financial Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}

        {(activeReportTab === 'customer' || activeReportTab === 'category') && (
          <span className="text-slate-500 italic">Showing all-time aggregate financial balances.</span>
        )}
      </div>

      {/* Report Content Body */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
          Generating financial report...
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          {/* Printable Header */}
          <div className="text-center border-b border-slate-300 pb-4">
            <h1 className="text-2xl font-black text-slate-950 tracking-wider">CPN RAJA</h1>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
              VATTI BUSINESS MANAGEMENT SYSTEM
            </p>
            <p className="text-xs text-slate-500 mt-1 uppercase font-semibold">
              {activeReportTab === 'daily'
                ? `Daily Financial Statement – ${formatDate(dailyDate)}`
                : activeReportTab === 'monthly'
                ? `Monthly Financial Statement – ${monthlyData?.monthName} ${selectedYear}`
                : activeReportTab === 'yearly'
                ? `Annual Financial Statement – Year ${selectedYear}`
                : activeReportTab === 'customer'
                ? 'Customer Ledger Summary Report'
                : 'Vatti Scheme Performance Breakdown'}
            </p>
          </div>

          {/* TAB 1: DAILY REPORT */}
          {activeReportTab === 'daily' && dailyData && (
            <div className="space-y-6 text-xs">
              {/* Daily KPI Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-sans block">Loans Issued Today</span>
                  <span className="text-lg font-bold text-slate-900">{dailyData.summary.loansIssuedCount}</span>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-blue-900">
                  <span className="text-[10px] text-blue-700 font-sans block">Principal Lent Today</span>
                  <span className="text-lg font-bold">{formatINR(dailyData.summary.principalLentRupees)}</span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-emerald-900">
                  <span className="text-[10px] text-emerald-700 font-sans block">Principal Collected</span>
                  <span className="text-lg font-bold">{formatINR(dailyData.summary.principalCollectedRupees)}</span>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900">
                  <span className="text-[10px] text-amber-700 font-sans block">Interest Collected (Profit)</span>
                  <span className="text-lg font-bold">{formatINR(dailyData.summary.interestCollectedRupees)}</span>
                </div>
              </div>

              {/* Collections Received Table */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2">
                  Collections Received Today ({dailyData.collections.length})
                </h4>
                <table className="w-full border border-slate-200 rounded-lg overflow-hidden text-left">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="py-2 px-3">Receipt #</th>
                      <th className="py-2 px-3">Customer</th>
                      <th className="py-2 px-3">Loan</th>
                      <th className="py-2 px-3">Mode</th>
                      <th className="py-2 px-3 text-right">Principal</th>
                      <th className="py-2 px-3 text-right">Interest</th>
                      <th className="py-2 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {dailyData.collections.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-slate-400 font-sans">
                          No collections recorded on this date.
                        </td>
                      </tr>
                    ) : (
                      dailyData.collections.map((c) => (
                        <tr key={c.receiptNumber}>
                          <td className="py-2 px-3 font-bold text-slate-900">{c.receiptNumber}</td>
                          <td className="py-2 px-3 font-sans font-medium text-slate-900">{c.customerName}</td>
                          <td className="py-2 px-3 text-blue-700 font-bold">{c.loanCode}</td>
                          <td className="py-2 px-3 uppercase text-[10px] text-slate-500 font-sans">{c.paymentMethod}</td>
                          <td className="py-2 px-3 text-right text-slate-800">{formatINR(c.principalAllocationRupees)}</td>
                          <td className="py-2 px-3 text-right text-emerald-700 font-semibold">
                            {formatINR(c.interestAllocationRupees)}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-950">
                            {formatINR(c.totalAmountRupees)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: MONTHLY REPORT */}
          {activeReportTab === 'monthly' && monthlyData && (
            <div className="space-y-6 text-xs">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-blue-900">
                  <span className="text-[10px] text-blue-700 font-sans block">Total Capital Lent</span>
                  <span className="text-lg font-bold">{formatINR(monthlyData.summary.totalPrincipalLentRupees)}</span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-emerald-900">
                  <span className="text-[10px] text-emerald-700 font-sans block">Principal Returned</span>
                  <span className="text-lg font-bold">{formatINR(monthlyData.summary.totalPrincipalCollectedRupees)}</span>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900">
                  <span className="text-[10px] text-amber-700 font-sans block">Interest Realized</span>
                  <span className="text-lg font-bold">{formatINR(monthlyData.summary.totalInterestCollectedRupees)}</span>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-200 text-purple-900">
                  <span className="text-[10px] text-purple-700 font-sans block">Accrued Vatti</span>
                  <span className="text-lg font-bold">{formatINR(monthlyData.summary.totalAccruedInterestRupees)}</span>
                </div>
              </div>

              {/* Vatti Breakdown */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2">
                  Lending By Scheme
                </h4>
                <table className="w-full border border-slate-200 rounded-lg overflow-hidden text-left">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="py-2 px-3">Vatti Scheme</th>
                      <th className="py-2 px-3">Loans Disbursed</th>
                      <th className="py-2 px-3 text-right">Principal Disbursed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {monthlyData.vattiBreakdown.map((vb) => (
                      <tr key={vb.vattiType}>
                        <td className="py-2 px-3 font-bold text-slate-900">{vb.vattiType}</td>
                        <td className="py-2 px-3 font-sans">{vb.loansCount} loans</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {formatINR(vb.principalLentRupees)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: YEARLY REPORT */}
          {activeReportTab === 'yearly' && yearlyData && (
            <div className="space-y-6 text-xs font-mono">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-sans block">Annual Lending</span>
                  <span className="text-lg font-bold text-slate-900">
                    {formatINR(yearlyData.summary.totalPrincipalLentRupees)}
                  </span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-emerald-900">
                  <span className="text-[10px] text-emerald-700 font-sans block">Principal Collections</span>
                  <span className="text-lg font-bold">
                    {formatINR(yearlyData.summary.totalPrincipalCollectedRupees)}
                  </span>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900">
                  <span className="text-[10px] text-amber-700 font-sans block">Interest Income</span>
                  <span className="text-lg font-bold">
                    {formatINR(yearlyData.summary.totalInterestCollectedRupees)}
                  </span>
                </div>
                <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-rose-900">
                  <span className="text-[10px] text-rose-700 font-sans block">Market Outstanding</span>
                  <span className="text-lg font-bold">
                    {formatINR(yearlyData.summary.totalOutstandingRupees)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CUSTOMER REPORT */}
          {activeReportTab === 'customer' && customerData && (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border border-slate-200 rounded-lg overflow-hidden text-left">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Customer ID</th>
                    <th className="py-2.5 px-3">Customer Name</th>
                    <th className="py-2.5 px-2 text-center">Loans</th>
                    <th className="py-2.5 px-3 text-right">Borrowed</th>
                    <th className="py-2.5 px-3 text-right">Principal Repaid</th>
                    <th className="py-2.5 px-3 text-right">Interest Repaid</th>
                    <th className="py-2.5 px-3 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {customerData.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-blue-700">{cust.customerId}</td>
                      <td className="py-2.5 px-3 font-sans font-bold text-slate-900">{cust.name}</td>
                      <td className="py-2.5 px-2 text-center font-sans">{cust.totalLoans}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-800">
                        {formatINR(cust.totalBorrowedRupees)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700">
                        {formatINR(cust.totalPrincipalRepaidRupees)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                        {formatINR(cust.totalInterestRepaidRupees)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-700">
                        {formatINR(cust.totalOutstandingRupees)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 5: VATTI CATEGORY REPORT */}
          {activeReportTab === 'category' && categoryData && (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border border-slate-200 rounded-lg overflow-hidden text-left">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Vatti Category</th>
                    <th className="py-2.5 px-2 text-center">Active Loans</th>
                    <th className="py-2.5 px-3 text-right">Capital Lent</th>
                    <th className="py-2.5 px-3 text-right">Capital Returned</th>
                    <th className="py-2.5 px-3 text-right">Interest Collected</th>
                    <th className="py-2.5 px-3 text-right">Outstanding</th>
                    <th className="py-2.5 px-3">Calculation Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {categoryData.map((cat) => (
                    <tr key={cat.vattiType} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{cat.vattiType}</td>
                      <td className="py-2.5 px-2 text-center font-sans font-bold">{cat.activeLoans}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-800">
                        {formatINR(cat.totalPrincipalLentRupees)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-medium">
                        {formatINR(cat.totalPrincipalCollectedRupees)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">
                        {formatINR(cat.totalInterestCollectedRupees)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-700">
                        {formatINR(cat.totalOutstandingRupees)}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        {cat.isPendingOwnerConfirmation ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                            Pending Owner Confirmation
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Active Formula
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="pt-6 border-t border-slate-300 text-center text-[10px] text-slate-400">
            CPN Raja Vatti Business Management System • Certified Accurate Financial Reporting • {new Date().toLocaleDateString('en-IN')}
          </div>
        </div>
      )}
    </div>
  );
}
