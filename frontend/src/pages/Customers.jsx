import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  MapPin,
  FileText,
  Edit2,
  Calendar,
  Wallet,
  Clock,
  CheckCircle,
  X,
  UserPlus,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Archive,
  CheckCircle2,
} from 'lucide-react';
import { formatINR, formatDate, getFinanceBadge } from '../utils/formatters';
import CustomerStatementModal from '../components/CustomerStatementModal';
import api from '../api';

export default function Customers({ onNavigate, onSelectCustomerForLoan }) {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedStatementCustomer, setSelectedStatementCustomer] = useState(null);
  const [viewCustomerDetail, setViewCustomerDetail] = useState(null);

  // Delete / Archive Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetCustomer, setDeleteTargetCustomer] = useState(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteEligibility, setDeleteEligibility] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', message: string }

  // Form State
  const [formName, setFormName] = useState('');
  const [formMobile, setFormMobile] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState('ACTIVE');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Debounce search input to prevent rapid unnecessary API queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Auto-dismiss notification after 6 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchCustomers = async (searchTerm = debouncedSearch, status = statusFilter, signal) => {
    setLoading(true);
    try {
      const res = await api.get('/customers', {
        params: { search: searchTerm, status },
        signal,
      });
      if (res?.data?.success && Array.isArray(res.data.customers)) {
        setCustomers(res.data.customers);
        setTotal(res.data.total ?? res.data.customers.length);
      } else if (res?.data?.customers && Array.isArray(res.data.customers)) {
        setCustomers(res.data.customers);
        setTotal(res.data.total ?? res.data.customers.length);
      } else {
        setCustomers([]);
        setTotal(0);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        return;
      }
      console.error('Failed to load customers', err);
      setCustomers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomers(debouncedSearch, statusFilter, controller.signal);
    return () => controller.abort();
  }, [debouncedSearch, statusFilter]);

  const openAddModal = () => {
    setFormName('');
    setFormMobile('');
    setFormAddress('');
    setFormNotes('');
    setFormStatus('ACTIVE');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (cust) => {
    setEditingCustomer(cust);
    setFormName(cust.name);
    setFormMobile(cust.mobileNumber);
    setFormAddress(cust.address || '');
    setFormNotes(cust.notes || '');
    setFormStatus(cust.status);
    setFormError('');
    setIsEditModalOpen(true);
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const res = await api.post('/customers', {
        name: formName,
        mobileNumber: formMobile,
        address: formAddress,
        notes: formNotes,
        status: formStatus,
      });
      if (res.data.success) {
        setIsAddModalOpen(false);
        fetchCustomers();
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to save customer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const res = await api.put(`/customers/${editingCustomer._id}`, {
        name: formName,
        mobileNumber: formMobile,
        address: formAddress,
        notes: formNotes,
        status: formStatus,
      });
      if (res.data.success) {
        setIsEditModalOpen(false);
        fetchCustomers();
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to update customer');
    } finally {
      setSubmitting(false);
    }
  };

  const openCustomerProfile = async (cust) => {
    try {
      const res = await api.get(`/customers/${cust._id}`);
      if (res.data.success) {
        setViewCustomerDetail(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenDeleteModal = async (cust) => {
    setDeleteTargetCustomer(cust);
    setIsDeleteModalOpen(true);
    setDeleteError('');
    setDeleteEligibility(null);
    setDeleteChecking(true);

    try {
      const res = await api.get(`/customers/${cust._id}/delete-check`);
      if (res.data.success) {
        setDeleteEligibility(res.data);
      }
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to verify customer financial records.');
    } finally {
      setDeleteChecking(false);
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!deleteTargetCustomer) return;
    setDeleting(true);
    setDeleteError('');

    try {
      const res = await api.delete(`/customers/${deleteTargetCustomer._id}`);
      if (res.data.success) {
        setIsDeleteModalOpen(false);
        setNotification({
          type: 'success',
          message: res.data.message || `Customer ${deleteTargetCustomer.name} (${deleteTargetCustomer.customerId}) was permanently deleted.`,
        });
        fetchCustomers();
      }
    } catch (err) {
      if (err.response?.data?.hasFinancialRecords) {
        setDeleteEligibility({
          eligibleForPermanentDelete: false,
          hasFinancialRecords: true,
          dependencies: err.response.data.dependencies,
        });
        setDeleteError(err.response.data.message);
      } else {
        setDeleteError(err.response?.data?.message || err.message || 'Failed to delete customer.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deleteTargetCustomer) return;
    setDeleting(true);
    setDeleteError('');

    try {
      const res = await api.delete(`/customers/${deleteTargetCustomer._id}?action=deactivate`);
      if (res.data.success) {
        setIsDeleteModalOpen(false);
        setNotification({
          type: 'success',
          message: res.data.message || `Customer ${deleteTargetCustomer.name} (${deleteTargetCustomer.customerId}) has been archived and marked INACTIVE.`,
        });
        fetchCustomers();
      }
    } catch (err) {
      setDeleteError(err.response?.data?.message || err.message || 'Failed to archive customer.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-medium shadow-sm transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>Customer Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage borrower profiles, verify individual accounts and print statements
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center justify-center space-x-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer min-h-[40px] w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Customer</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by Customer Name or Mobile Number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active Only</option>
          <option value="INACTIVE">Inactive Only</option>
        </select>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading customers...</div>
        ) : !customers || customers.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No customers registered yet</p>
            <p className="text-slate-400 mt-1 max-w-sm mx-auto">
              Register your first customer to begin managing Monthly Finance, Daily Finance, or Daily Collection accounts.
            </p>
            <button
              onClick={openAddModal}
              className="mt-4 inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register First Customer</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[720px]">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Customer ID</th>
                  <th className="py-3 px-4 font-semibold">Customer Name</th>
                  <th className="py-3 px-3 font-semibold">Mobile Number</th>
                  <th className="py-3 px-4 font-semibold">Address</th>
                  <th className="py-3 px-3 font-semibold text-center">Active Loans</th>
                  <th className="py-3 px-3 font-semibold text-right">Principal Lent</th>
                  <th className="py-3 px-3 font-semibold text-right">Outstanding</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(customers || []).map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">{c.customerId}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => openCustomerProfile(c)}
                        className="font-bold text-slate-900 hover:text-blue-600 transition-colors text-left cursor-pointer"
                      >
                        {c.name}
                      </button>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      <a href={`tel:${c.mobileNumber}`} className="hover:text-blue-600">
                        {c.mobileNumber}
                      </a>
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{c.address || '—'}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[11px]">
                        {c.activeLoanCount || 0}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-800">
                      {formatINR(c.totalLentPaise / 100)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-rose-700">
                      {formatINR((c.outstandingPrincipalPaise + c.outstandingInterestPaise) / 100)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => setSelectedStatementCustomer(c._id)}
                          className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded transition-colors"
                          title="Print Statement"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                          title="Edit Details"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (onSelectCustomerForLoan) {
                              onSelectCustomerForLoan(c);
                            } else {
                              onNavigate('new-finance');
                            }
                          }}
                          className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[10px] transition-colors"
                        >
                          + Finance
                        </button>
                        <button
                          onClick={() => handleOpenDeleteModal(c)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          title="Delete Customer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-sm text-slate-900">Register New Customer</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateCustomer} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Murugan Sundaram"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mobile Number *</label>
                <input
                  type="text"
                  required
                  value={formMobile}
                  onChange={(e) => setFormMobile(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Street, City, Pincode"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes / Business Reference</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Grocery shop owner, introduced by Senthil"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Registering...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Edit Customer Profile</h3>
                <p className="text-[10px] text-slate-400">ID: {editingCustomer?.customerId}</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleUpdateCustomer} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mobile Number *</label>
                <input
                  type="text"
                  required
                  value={formMobile}
                  onChange={(e) => setFormMobile(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-800 text-[11px] rounded-lg">
                Note: Updating customer details preserves all existing loan accounts and ledger transactions.
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Update Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Profile View Modal */}
      {viewCustomerDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">{viewCustomerDetail.customer.name}</h3>
                <p className="text-xs font-mono text-blue-700">{viewCustomerDetail.customer.customerId}</p>
              </div>
              <button onClick={() => setViewCustomerDetail(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Balances */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-6 font-mono text-center">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="text-[10px] text-slate-500 font-sans uppercase">Total Lent</p>
                <p className="text-sm font-bold text-slate-900">{formatINR(viewCustomerDetail.customer.totalLentPaise / 100)}</p>
              </div>
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-emerald-800">
                <p className="text-[10px] text-emerald-700 font-sans uppercase">Total Repaid</p>
                <p className="text-sm font-bold">
                  {formatINR((viewCustomerDetail.customer.totalPrincipalPaidPaise + viewCustomerDetail.customer.totalInterestPaidPaise) / 100)}
                </p>
              </div>
              <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-rose-800">
                <p className="text-[10px] text-rose-700 font-sans uppercase">Outstanding</p>
                <p className="text-sm font-bold">
                  {formatINR((viewCustomerDetail.customer.outstandingPrincipalPaise + viewCustomerDetail.customer.outstandingInterestPaise) / 100)}
                </p>
              </div>
            </div>

            {/* Customer Loans */}
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600 mb-2">Loan Accounts</h4>
            <div className="space-y-2 mb-6">
              {viewCustomerDetail.loans.length === 0 ? (
                <p className="text-xs text-slate-400">No loans on record.</p>
              ) : (
                viewCustomerDetail.loans.map((loan) => (
                  <div key={loan._id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-mono font-bold text-blue-700">{loan.loanId}</span>
                      <span className="ml-2 font-semibold text-slate-800">({loan.financeType || (loan.vattiType ? `${loan.vattiType} Finance` : '')} @ {loan.interestRatePercent}%)</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Due: {formatDate(loan.dueDate)} • Disbursed: {formatDate(loan.startDate)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right font-mono">
                      <p className="font-bold text-slate-900">{formatINR(loan.principalPaise / 100)}</p>
                      <p className="text-[11px] text-rose-600 font-semibold">
                        Due: {formatINR((loan.outstandingPrincipalPaise + loan.outstandingInterestPaise) / 100)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setSelectedStatementCustomer(viewCustomerDetail.customer._id);
                  setViewCustomerDetail(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 min-h-[38px] cursor-pointer"
              >
                View Full Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Archive Confirmation Modal */}
      {isDeleteModalOpen && deleteTargetCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-2">
                {deleteChecking ? (
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <Clock className="w-5 h-5 animate-spin" />
                  </div>
                ) : deleteEligibility?.hasFinancialRecords ? (
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {deleteChecking
                      ? 'Checking Customer Records...'
                      : deleteEligibility?.hasFinancialRecords
                      ? 'Financial Records Detected'
                      : 'Confirm Customer Deletion'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {deleteEligibility?.hasFinancialRecords
                      ? 'Financial audit integrity protection'
                      : 'Permanent deletion safety verification'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={deleting}
                className="text-slate-400 hover:text-slate-600 p-1 disabled:opacity-50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Customer Info Card */}
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 mb-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 text-sm">{deleteTargetCustomer.name}</span>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="font-mono text-blue-700 font-semibold text-[11px]">{deleteTargetCustomer.customerId}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-600 font-mono text-[11px]">{deleteTargetCustomer.mobileNumber}</span>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    deleteTargetCustomer.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {deleteTargetCustomer.status || 'ACTIVE'}
                </span>
              </div>
            </div>

            {/* Error Message */}
            {deleteError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Checking State */}
            {deleteChecking && (
              <div className="py-8 text-center text-xs text-slate-500 space-y-2">
                <div className="inline-block animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                <p className="font-medium text-slate-700">Inspecting associated financial ledger accounts...</p>
                <p className="text-[11px] text-slate-400">
                  Checking active loans, collections, transaction history, and daily finance accounts.
                </p>
              </div>
            )}

            {/* If Customer Has Financial Records */}
            {!deleteChecking && deleteEligibility?.hasFinancialRecords && (
              <div className="space-y-4">
                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg text-xs space-y-2">
                  <div className="flex items-center space-x-2 text-amber-900 font-bold">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Permanent Deletion Strictly Prohibited</span>
                  </div>
                  <p className="text-amber-800 leading-relaxed text-[11.5px]">
                    This customer has active or historical financial records. To preserve accounting balances, ledger calculations, and audit history, this customer <strong>cannot be permanently deleted</strong>.
                  </p>
                </div>

                {/* Dependency breakdown */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Associated Financial Records ({deleteEligibility.dependencies?.totalRecords || 0} Total)
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-100">
                      <span className="text-slate-600">Finance Accounts:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {deleteEligibility.dependencies?.loansCount || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-100">
                      <span className="text-slate-600">Collections / Receipts:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {deleteEligibility.dependencies?.collectionsCount || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-100">
                      <span className="text-slate-600">Ledger Transactions:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {deleteEligibility.dependencies?.transactionsCount || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-100">
                      <span className="text-slate-600">Daily Accounts / Payments:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {(deleteEligibility.dependencies?.dailyAccountsCount || 0) + (deleteEligibility.dependencies?.dailyPaymentsCount || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg text-xs space-y-1">
                  <p className="font-bold text-blue-900">Recommended Safe Action: Deactivate & Archive</p>
                  <p className="text-blue-800 text-[11px] leading-relaxed">
                    Deactivating this customer marks their account as <strong>INACTIVE</strong>. All historical statements, payment receipts, and balance reports remain fully accessible and protected.
                  </p>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(false)}
                    disabled={deleting}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeactivate}
                    disabled={deleting}
                    className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Archive className="w-4 h-4" />
                    <span>{deleting ? 'Archiving...' : 'Deactivate & Archive Customer'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* If Customer Has No Financial Records (Safe to permanently delete) */}
            {!deleteChecking && deleteEligibility?.eligibleForPermanentDelete && (
              <div className="space-y-4">
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-2">
                  <div className="flex items-center space-x-2 text-rose-900 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Warning: This action is permanent and cannot be undone</span>
                  </div>
                  <p className="text-rose-800 leading-relaxed text-[11.5px]">
                    This customer has <strong>0 financial records</strong> and no active loans. Confirming will permanently remove this customer profile from the system.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11.5px] text-slate-600 space-y-1">
                  <div className="flex items-center space-x-1.5 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Financial Safety Check Passed</span>
                  </div>
                  <p className="text-slate-500">
                    No active loan balances, payments, or ledger transactions will be affected.
                  </p>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(false)}
                    disabled={deleting}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPermanentDelete}
                    disabled={deleting}
                    className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{deleting ? 'Deleting...' : 'Yes, Delete Customer Permanently'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Statement Modal */}
      {selectedStatementCustomer && (
        <CustomerStatementModal
          customerId={selectedStatementCustomer}
          onClose={() => setSelectedStatementCustomer(null)}
        />
      )}
    </div>
  );
}
