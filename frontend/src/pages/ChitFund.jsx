import React, { useState, useEffect } from 'react';
import {
  Landmark,
  Users,
  Coins,
  Calendar,
  CheckCircle,
  AlertCircle,
  Search,
  Plus,
  ArrowRight,
  Eye,
  FileText,
  RotateCcw,
  Printer,
  ChevronRight,
  Sparkles,
  Trophy,
  X,
  CreditCard,
  Edit2,
  Clock,
  Layers,
  TrendingUp,
  Download,
} from 'lucide-react';
import api from '../api';
import { formatINR, formatDate, formatDateTime } from '../utils/formatters';
import SearchableCustomerSelect from '../components/SearchableCustomerSelect';

export default function ChitFund() {
  // Navigation & Group Selection
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'members' | 'collections' | 'payouts' | 'schedule' | 'reports'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dashboard KPI Summary
  const [summary, setSummary] = useState({
    totalGroups: 0,
    activeGroups: 0,
    formingGroups: 0,
    completedGroups: 0,
    totalMembers: 0,
    totalChitValueRupees: 0,
    totalInstalmentExpectedRupees: 0,
    totalCollectedRupees: 0,
    totalPayoutsRupees: 0,
    totalOutstandingRupees: 0,
  });

  // Filter for Chit Groups
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Members View State
  const [memberSlots, setMemberSlots] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedMemberProfile, setSelectedMemberProfile] = useState(null);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [targetSlotNumber, setTargetSlotNumber] = useState(1);
  const [existingCustomers, setExistingCustomers] = useState([]);

  // Add Member Form State
  const [memberFormName, setMemberFormName] = useState('');
  const [memberFormMobile, setMemberFormMobile] = useState('');
  const [memberFormAddress, setMemberFormAddress] = useState('');
  const [memberFormDistrict, setMemberFormDistrict] = useState('');
  const [memberFormVillage, setMemberFormVillage] = useState('');
  const [memberFormRemarks, setMemberFormRemarks] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [submittingMember, setSubmittingMember] = useState(false);
  const [memberError, setMemberError] = useState('');

  // Collections View State
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [collectionSheet, setCollectionSheet] = useState(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState(null);
  const [payAmountInput, setPayAmountInput] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payNotes, setPayNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentSuccessReceipt, setPaymentSuccessReceipt] = useState(null);

  // Payout View State
  const [payoutMonth, setPayoutMonth] = useState(1);
  const [hasPayoutToggle, setHasPayoutToggle] = useState(true);
  const [payoutMemberId, setPayoutMemberId] = useState('');
  const [payoutAmountInput, setPayoutAmountInput] = useState('');
  const [payoutKasarInput, setPayoutKasarInput] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('BANK_TRANSFER');
  const [payoutRemarks, setPayoutRemarks] = useState('');
  const [payoutOverride, setPayoutOverride] = useState(false);
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState('');

  // Create Chit Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newChitCategory, setNewChitCategory] = useState('10_LAKH');
  const [newChitName, setNewChitName] = useState('');
  const [newChitStartDate, setNewChitStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newChitFirstInstDate, setNewChitFirstInstDate] = useState(new Date().toISOString().split('T')[0]);
  const [newChitRemarks, setNewChitRemarks] = useState('');
  const [submittingNewChit, setSubmittingNewChit] = useState(false);
  const [createChitError, setCreateChitError] = useState('');

  // Edit/Approve Schedule Modal State (for ₹5L or customization)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editableSchedule, setEditableSchedule] = useState([]);
  const [submittingSchedule, setSubmittingSchedule] = useState(false);

  // Reports View State
  const [activeReportType, setActiveReportType] = useState('monthly-collection');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedReportMemberId, setSelectedReportMemberId] = useState('');
  const [selectedReportMonth, setSelectedReportMonth] = useState('ALL');
  const [reportSearchTerm, setReportSearchTerm] = useState('');

  // Member Payment Report Modal State (accessible directly from Collections & Members)
  const [isMemberReportModalOpen, setIsMemberReportModalOpen] = useState(false);
  const [memberReportModalData, setMemberReportModalData] = useState(null);
  const [loadingMemberModalReport, setLoadingMemberModalReport] = useState(false);
  const [memberModalMonthFilter, setMemberModalMonthFilter] = useState('ALL');
  const [activeModalMemberId, setActiveModalMemberId] = useState('');

  // 1. Initial Load: Summary, Groups, Customers
  useEffect(() => {
    loadSummary();
    loadGroups();
    loadCustomers();
  }, []);

  // 2. When selectedGroupId changes, load its details
  useEffect(() => {
    if (selectedGroupId) {
      loadGroupDetails(selectedGroupId);
    }
  }, [selectedGroupId]);

  // 3. When group details load or tab changes, load specific tab data
  useEffect(() => {
    if (selectedGroup) {
      if (activeTab === 'members') {
        loadMembers(selectedGroup._id);
      } else if (activeTab === 'collections') {
        loadCollectionSheet(selectedGroup._id, selectedMonth);
      } else if (activeTab === 'reports') {
        loadReport();
      }
    }
  }, [selectedGroup, activeTab, selectedMonth, activeReportType, selectedReportMemberId, selectedReportMonth]);

  const loadSummary = async () => {
    try {
      const res = await api.get('/chit-funds/summary');
      if (res.data.success) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Failed to load chit summary', err);
    }
  };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await api.get('/chit-funds/groups');
      if (res.data.success) {
        setGroups(res.data.groups);
        if (res.data.groups.length > 0 && !selectedGroupId) {
          setSelectedGroupId(res.data.groups[0]._id);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load chit groups');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await api.get('/customers?status=ACTIVE&limit=200');
      if (res.data.success) {
        setExistingCustomers(res.data.customers);
      }
    } catch (err) {
      // silent
    }
  };

  const loadGroupDetails = async (groupId) => {
    try {
      const res = await api.get(`/chit-funds/groups/${groupId}`);
      if (res.data.success) {
        setSelectedGroup(res.data.group);
        setSelectedMonth(res.data.group.currentMonth || 1);
        setPayoutMonth(res.data.group.currentMonth || 1);
        // Pre-fill payout amount from schedule
        const currentSched = res.data.group.schedule.find(
          (s) => s.month === (res.data.group.currentMonth || 1)
        );
        if (currentSched) {
          setPayoutAmountInput(String(currentSched.payoutAmountRupees || ''));
          setPayoutKasarInput(String(currentSched.kasarRupees || ''));
          setHasPayoutToggle(currentSched.hasPayout !== false);
        }
      }
    } catch (err) {
      console.error('Failed to load chit group details', err);
    }
  };

  const loadMembers = async (groupId) => {
    setLoadingMembers(true);
    try {
      const res = await api.get(`/chit-funds/groups/${groupId}/members`);
      if (res.data.success) {
        setMemberSlots(res.data.slots);
      }
    } catch (err) {
      console.error('Failed to load member slots', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadCollectionSheet = async (groupId, month) => {
    setLoadingSheet(true);
    try {
      const res = await api.get(`/chit-funds/groups/${groupId}/collections?month=${month}`);
      if (res.data.success) {
        setCollectionSheet(res.data);
      }
    } catch (err) {
      console.error('Failed to load monthly collection sheet', err);
    } finally {
      setLoadingSheet(false);
    }
  };

  const loadMemberProfile = async (memberId) => {
    try {
      const res = await api.get(`/chit-funds/members/${memberId}`);
      if (res.data.success) {
        setSelectedMemberProfile(res.data.member);
      }
    } catch (err) {
      console.error('Failed to load member profile', err);
    }
  };

  const loadReport = async () => {
    if (!selectedGroup) return;
    setReportLoading(true);
    try {
      const params = {
        reportType: activeReportType,
        chitId: selectedGroup.chitId,
      };
      if (selectedReportMonth !== 'ALL') {
        params.month = selectedReportMonth;
      }
      if (selectedReportMemberId) {
        params.memberId = selectedReportMemberId;
      }

      const res = await api.get('/chit-funds/reports', { params });
      if (res.data.success) {
        setReportData(res.data);
      }
    } catch (err) {
      console.error('Failed to load chit report', err);
    } finally {
      setReportLoading(false);
    }
  };

  const exportActiveReportCSV = () => {
    if (!reportData || !selectedGroup) return;
    const groupName = selectedGroup.name || selectedGroup.chitId;

    if (activeReportType === 'monthly-collection') {
      const rows = Array.isArray(reportData.data) ? reportData.data : [];
      let csv = `CPN RAJA FINANCE - MONTHLY COLLECTION REPORT\r\n`;
      csv += `Chit Group:,"${groupName} (${selectedGroup.category || ''})"\r\n`;
      csv += `Month Filter:,"${selectedReportMonth === 'ALL' ? 'All Months' : 'Month ' + selectedReportMonth}"\r\n`;
      csv += `Total Expected:,"Rs. ${reportData.totalExpectedRupees || 0}"\r\n`;
      csv += `Total Collected:,"Rs. ${reportData.totalCollectedRupees || 0}"\r\n`;
      csv += `Total Balance:,"Rs. ${reportData.totalPendingRupees || 0}"\r\n\r\n`;
      csv += `Receipt No,Month,Member Name,Slot #,Expected Amount (Rs),Amount Paid (Rs),Balance (Rs),Payment Date & Time,Payment Method,Status,Notes\r\n`;

      rows.forEach((r) => {
        csv += `"${r.receiptNumber}",Month ${r.month},"${r.memberName}",Slot ${String(r.memberNumber).padStart(2, '0')},${r.expectedRupees},${r.paidRupees},${r.balanceRupees},"${formatDateTime(r.paymentDate)}","${r.paymentMethod}","${r.status}","${(r.notes || '').replace(/"/g, '""')}"\r\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Chit_Monthly_Collection_${selectedGroup.chitId}_Month_${selectedReportMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (activeReportType === 'monthly-payout') {
      const rows = Array.isArray(reportData.data) ? reportData.data : [];
      let csv = `CPN RAJA FINANCE - MONTHLY PAYOUT REPORT\r\n`;
      csv += `Chit Group:,"${groupName} (${selectedGroup.category || ''})"\r\n`;
      csv += `Month Filter:,"${selectedReportMonth === 'ALL' ? 'All Months' : 'Month ' + selectedReportMonth}"\r\n`;
      csv += `Total Payouts:,"Rs. ${reportData.totalPayoutsRupees || 0}"\r\n`;
      csv += `Total Kasar:,"Rs. ${reportData.totalKasarRupees || 0}"\r\n`;
      csv += `Net Amount Paid:,"Rs. ${reportData.totalNetPaidRupees || 0}"\r\n\r\n`;
      csv += `Voucher No,Month,Payout Date & Time,Member Name,Slot #,Payout Amount (Rs),Kasar / Deduction (Rs),Net Paid (Rs),Payment Method,Status,Remarks\r\n`;

      rows.forEach((r) => {
        csv += `"${r.voucherNumber}",Month ${r.month},"${formatDateTime(r.payoutDate)}","${r.memberName}",Slot ${r.memberNumber ? String(r.memberNumber).padStart(2, '0') : '—'},${r.payoutAmountRupees},${r.kasarRupees},${r.netPaidRupees},"${r.paymentMethod}","${r.status}","${(r.remarks || '').replace(/"/g, '""')}"\r\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Chit_Monthly_Payout_${selectedGroup.chitId}_Month_${selectedReportMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (activeReportType === 'member-payment-report') {
      const rep = Array.isArray(reportData?.data) ? reportData.data[0] : reportData?.data;
      if (rep) exportMemberPaymentCSV(rep);
    } else {
      const rows = Array.isArray(reportData.data) ? reportData.data : [];
      if (rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      let csv = headers.join(',') + '\r\n';
      rows.forEach((r) => {
        csv += headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',') + '\r\n';
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Chit_${activeReportType}_${selectedGroup.chitId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleOpenMemberPaymentReport = async (memberId, monthFilter = 'ALL') => {
    if (!memberId) return;
    setActiveModalMemberId(memberId);
    setMemberModalMonthFilter(monthFilter);
    setIsMemberReportModalOpen(true);
    setLoadingMemberModalReport(true);
    try {
      const params = {
        reportType: 'member-payment-report',
        memberId,
      };
      if (monthFilter !== 'ALL') params.month = monthFilter;
      const res = await api.get('/chit-funds/reports', { params });
      if (res.data.success) {
        setMemberReportModalData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load member payment report', err);
    } finally {
      setLoadingMemberModalReport(false);
    }
  };

  const handleModalMonthFilterChange = async (newMonth) => {
    setMemberModalMonthFilter(newMonth);
    if (!activeModalMemberId) return;
    setLoadingMemberModalReport(true);
    try {
      const params = {
        reportType: 'member-payment-report',
        memberId: activeModalMemberId,
      };
      if (newMonth !== 'ALL') params.month = newMonth;
      const res = await api.get('/chit-funds/reports', { params });
      if (res.data.success) {
        setMemberReportModalData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to update month filter', err);
    } finally {
      setLoadingMemberModalReport(false);
    }
  };

  const exportMemberPaymentCSV = (report) => {
    if (!report || !report.member) return;
    const { member, group: grp, summary, monthBreakdown } = report;
    let csv = `CPN RAJA FINANCE - CHIT FUND MEMBER PAYMENT REPORT\r\n`;
    csv += `Chit Group:,"${grp?.name || grp?.chitId || ''} (${grp?.category || ''})"\r\n`;
    csv += `Member Name:,"${member.name}"\r\n`;
    csv += `Slot #:,"Slot ${String(member.memberNumber).padStart(2, '0')}"\r\n`;
    csv += `Mobile:,"${member.mobile || ''}"\r\n`;
    csv += `Total Expected:,"Rs. ${summary?.totalExpectedRupees || 0}"\r\n`;
    csv += `Total Received:,"Rs. ${summary?.totalReceivedRupees || 0}"\r\n`;
    csv += `Total Balance:,"Rs. ${summary?.totalBalanceRupees || 0}"\r\n`;
    csv += `Overall Status:,"${summary?.status || ''}"\r\n\r\n`;
    csv += `Month,Due/Instalment Expected (Rs),Total Received (Rs),Balance (Rs),Status,Receipt #,Payment Date,Payment Amount (Rs),Method,Notes\r\n`;

    (monthBreakdown || []).forEach((m) => {
      if (m.payments && m.payments.length > 0) {
        m.payments.forEach((p, idx) => {
          csv += `Month ${m.month},${idx === 0 ? m.expectedRupees : ''},${idx === 0 ? m.receivedRupees : ''},${idx === 0 ? m.balanceRupees : ''},${idx === 0 ? m.status : ''},"${p.receiptNumber}","${formatDate(p.paymentDate)}",${p.amountPaidRupees},"${p.paymentMethod}","${(p.notes || '').replace(/"/g, '""')}"\r\n`;
        });
      } else {
        csv += `Month ${m.month},${m.expectedRupees},${m.receivedRupees},${m.balanceRupees},${m.status},"None","—",0,"—","No payments recorded"\r\n`;
      }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Chit_Payment_Report_Slot_${member.memberNumber}_${member.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Customer Auto-Fill for Add Member
  const handleSelectCustomerForSlot = (custId, customerObj) => {
    setSelectedCustomerId(custId);
    const found = customerObj || existingCustomers.find((c) => c._id === custId);
    if (found) {
      setMemberFormName(found.name);
      setMemberFormMobile(found.mobileNumber);
      setMemberFormAddress(found.address || '');
    }
  };

  // Open Add Member Modal for a slot
  const handleOpenAddMember = (slotNum) => {
    setTargetSlotNumber(slotNum);
    setMemberFormName('');
    setMemberFormMobile('');
    setMemberFormAddress('');
    setMemberFormDistrict('');
    setMemberFormVillage('');
    setMemberFormRemarks('');
    setSelectedCustomerId('');
    setMemberError('');
    setIsAddMemberModalOpen(true);
  };

  // Submit Add Member
  const handleSaveMember = async (e) => {
    e.preventDefault();
    setMemberError('');
    setSubmittingMember(true);
    try {
      const res = await api.post(`/chit-funds/groups/${selectedGroup._id}/members`, {
        memberNumber: targetSlotNumber,
        name: memberFormName,
        mobile: memberFormMobile,
        address: memberFormAddress,
        district: memberFormDistrict,
        village: memberFormVillage,
        remarks: memberFormRemarks,
        customerId: selectedCustomerId || undefined,
      });

      if (res.data.success) {
        setIsAddMemberModalOpen(false);
        loadGroupDetails(selectedGroup._id);
        loadMembers(selectedGroup._id);
        loadSummary();
      }
    } catch (err) {
      setMemberError(err.response?.data?.message || 'Failed to add member');
    } finally {
      setSubmittingMember(false);
    }
  };

  // Open Payment Modal for Collection
  const handleOpenPaymentModal = (memberRow) => {
    setPaymentModalData(memberRow);
    setPayAmountInput(String(memberRow.remainingRupees));
    setPayMethod('CASH');
    setPayNotes('');
    setPaymentSuccessReceipt(null);
  };

  // Submit Collection Payment
  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!paymentModalData || !payAmountInput) return;

    setSubmittingPayment(true);
    try {
      const res = await api.post(`/chit-funds/groups/${selectedGroup._id}/collections`, {
        memberId: paymentModalData.memberId,
        month: selectedMonth,
        amountRupees: Number(payAmountInput),
        paymentMethod: payMethod,
        notes: payNotes,
      });

      if (res.data.success) {
        setPaymentSuccessReceipt(res.data.collection);
        loadCollectionSheet(selectedGroup._id, selectedMonth);
        loadGroupDetails(selectedGroup._id);
        loadSummary();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handle Month Change in Payout Tab
  const handlePayoutMonthChange = (m) => {
    const monthNum = Number(m);
    setPayoutMonth(monthNum);
    const sched = selectedGroup?.schedule?.find((s) => s.month === monthNum);
    if (sched) {
      setPayoutAmountInput(String(sched.payoutAmountRupees || ''));
      setPayoutKasarInput(String(sched.kasarRupees || ''));
      setHasPayoutToggle(sched.hasPayout !== false);
    }
  };

  // Submit Payout
  const handleSavePayout = async (e) => {
    e.preventDefault();
    setSubmittingPayout(true);
    setPayoutMessage('');
    try {
      const res = await api.post(`/chit-funds/groups/${selectedGroup._id}/payouts`, {
        month: payoutMonth,
        hasPayout: hasPayoutToggle,
        memberId: hasPayoutToggle ? payoutMemberId : undefined,
        payoutAmountRupees: hasPayoutToggle ? Number(payoutAmountInput) : 0,
        kasarRupees: hasPayoutToggle ? Number(payoutKasarInput) : 0,
        paymentMethod: payoutMethod,
        remarks: payoutRemarks,
        overrideDuplicate: payoutOverride,
      });

      if (res.data.success) {
        setPayoutMessage(res.data.message);
        loadGroupDetails(selectedGroup._id);
        loadSummary();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record payout');
    } finally {
      setSubmittingPayout(false);
    }
  };

  // Submit Create New Chit Group
  const handleCreateChitGroup = async (e) => {
    e.preventDefault();
    setCreateChitError('');
    setSubmittingNewChit(true);
    try {
      const res = await api.post('/chit-funds/groups', {
        category: newChitCategory,
        name: newChitName,
        startDate: newChitStartDate,
        firstInstalmentDate: newChitFirstInstDate,
        remarks: newChitRemarks,
      });

      if (res.data.success) {
        setIsCreateModalOpen(false);
        setNewChitName('');
        setNewChitRemarks('');
        await loadGroups();
        await loadSummary();
        setSelectedGroupId(res.data.group._id);
        setActiveTab('members');
      }
    } catch (err) {
      setCreateChitError(err.response?.data?.message || 'Failed to create chit group');
    } finally {
      setSubmittingNewChit(false);
    }
  };

  // Filter groups
  const filteredGroups = categoryFilter === 'ALL'
    ? groups
    : groups.filter((g) => g.category === categoryFilter);

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-6 rounded-2xl border border-indigo-900/40 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-2.5 bg-amber-500/20 rounded-xl border border-amber-500/30 text-amber-400 shrink-0">
              <Landmark className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-black tracking-tight flex items-center space-x-2">
                <span>சீட்டு / Chit Fund Management System</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-indigo-200/80">
                டிஜிட்டல் சீட்டு மேலாண்மை • ₹5 Lakh, ₹10 Lakh & ₹20 Lakh Schemes (20 Months • 20 Members)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 cursor-pointer min-h-[42px]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>புதிய சீட்டு தொடங்கு (New Chit)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-1 min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Total Chits</p>
          <p className="text-base sm:text-lg font-black text-slate-900 font-mono truncate">{summary.totalGroups}</p>
          <div className="flex space-x-1.5 text-[10px] text-slate-500 truncate">
            <span className="text-emerald-600 font-bold">{summary.activeGroups} Active</span>
            <span>•</span>
            <span className="text-amber-600 font-bold">{summary.formingGroups} Forming</span>
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-1 min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Enrolled Members</p>
          <p className="text-base sm:text-lg font-black text-blue-700 font-mono truncate">{summary.totalMembers}</p>
          <p className="text-[10px] text-slate-500 truncate">Across all groups</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-1 min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Chit Portfolio</p>
          <p className="text-sm sm:text-base font-black text-indigo-700 font-mono truncate">
            {formatINR(summary.totalChitValueRupees)}
          </p>
          <p className="text-[10px] text-slate-400 truncate">Total Group Value</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-1 min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Total Collected</p>
          <p className="text-sm sm:text-base font-black text-emerald-700 font-mono truncate">
            {formatINR(summary.totalCollectedRupees)}
          </p>
          <p className="text-[10px] text-emerald-600 font-bold truncate">Confirmed Receipts</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-1 min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Total Payouts</p>
          <p className="text-sm sm:text-base font-black text-purple-700 font-mono truncate">
            {formatINR(summary.totalPayoutsRupees)}
          </p>
          <p className="text-[10px] text-purple-600 font-bold truncate">Disbursed (பட்டுவாடா)</p>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-1 min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Pending Dues</p>
          <p className="text-sm sm:text-base font-black text-rose-700 font-mono truncate">
            {formatINR(summary.totalOutstandingRupees)}
          </p>
          <p className="text-[10px] text-rose-600 font-bold truncate">Outstanding</p>
        </div>
      </div>

      {/* Chit Selector Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        {/* Category Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'ALL', label: 'All Categories' },
            { id: '5_LAKH', label: '₹5 Lakh Chit (20M)' },
            { id: '10_LAKH', label: '₹10 Lakh Chit (20M)' },
            { id: '20_LAKH', label: '₹20 Lakh Chit (20M)' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                categoryFilter === cat.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Group Selector Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full md:w-auto">
          <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Active Chit Group:</label>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500 min-w-0 sm:min-w-[220px]"
          >
            {filteredGroups.length === 0 ? (
              <option value="">No chit groups found</option>
            ) : (
              filteredGroups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.chitId} – {g.name} ({g.memberCount}/20 Members)
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Selected Chit Hero Banner */}
      {selectedGroup && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 bg-slate-50/50">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 bg-blue-600 text-white text-[11px] font-black rounded-md tracking-wider">
                  {selectedGroup.chitId}
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900">{selectedGroup.name}</h3>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                    selectedGroup.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : selectedGroup.status === 'FORMING'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {selectedGroup.status}
                </span>
                {!selectedGroup.isScheduleApproved && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    Schedule Pending Approval
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Value: <span className="font-bold text-slate-800">{formatINR(selectedGroup.totalValueRupees)}</span> • Duration: 20 Months • Base Monthly: {formatINR(selectedGroup.monthlyChitAmountRupees)} • 20 Member Slots
              </p>
            </div>

            {/* Member Capacity Progress */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="text-left md:text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Enrolled Members</p>
                <p className="text-sm font-black text-slate-800">
                  <span className="text-blue-700">{selectedGroup.memberCount}</span> / 20 Slots
                </p>
              </div>
              <div className="w-20 sm:w-24 bg-slate-200 rounded-full h-2 overflow-hidden shrink-0">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(selectedGroup.memberCount / 20) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 px-3 sm:px-4 border-b border-slate-200 overflow-x-auto text-xs font-bold text-slate-600">
            {[
              { id: 'overview', label: 'மேற்பார்வை (Overview)', icon: Layers },
              { id: 'members', label: `உறுப்பினர்கள் (${selectedGroup.memberCount}/20)`, icon: Users },
              { id: 'collections', label: 'தவணை வசூல் (Collections)', icon: Coins },
              { id: 'payouts', label: 'பட்டுவாடா (Payouts)', icon: Trophy },
              { id: 'schedule', label: '20 மாத அட்டவணை (Schedule)', icon: Calendar },
              { id: 'reports', label: 'அறிக்கைகள் (Reports)', icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-3 sm:px-3.5 border-b-2 flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap min-h-[42px] ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
                      : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="p-4 sm:p-6 space-y-6">
              {/* Financial Snapshot */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
                <div className="p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase truncate">Expected Collections</p>
                  <p className="text-sm sm:text-base font-black text-slate-900 font-mono truncate">
                    {formatINR(selectedGroup.totalExpectedRupees)}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">Across 20 months</p>
                </div>

                <div className="p-3 sm:p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1 min-w-0">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase truncate">Total Collected</p>
                  <p className="text-sm sm:text-base font-black text-emerald-800 font-mono truncate">
                    {formatINR(selectedGroup.totalCollectedRupees)}
                  </p>
                  <p className="text-[10px] text-emerald-600 font-bold truncate">
                    {selectedGroup.totalExpectedRupees > 0
                      ? Math.round((selectedGroup.totalCollectedRupees / selectedGroup.totalExpectedRupees) * 100)
                      : 0}
                    % realized
                  </p>
                </div>

                <div className="p-3 sm:p-4 bg-purple-50/70 rounded-xl border border-purple-200 space-y-1 min-w-0">
                  <p className="text-[10px] font-bold text-purple-700 uppercase truncate">Payouts Handed</p>
                  <p className="text-sm sm:text-base font-black text-purple-800 font-mono truncate">
                    {formatINR(selectedGroup.totalPayoutsRupees)}
                  </p>
                  <p className="text-[10px] text-purple-600 font-bold truncate">Disbursed (பட்டுவாடா)</p>
                </div>

                <div className="p-3 sm:p-4 bg-rose-50/70 rounded-xl border border-rose-200 space-y-1 min-w-0">
                  <p className="text-[10px] font-bold text-rose-700 uppercase truncate">Outstanding Dues</p>
                  <p className="text-sm sm:text-base font-black text-rose-800 font-mono truncate">
                    {formatINR(selectedGroup.outstandingRupees)}
                  </p>
                  <p className="text-[10px] text-rose-600 font-bold truncate">To be collected</p>
                </div>
              </div>

              {/* Current Month Banner & Actions */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-blue-700 text-white text-[10px] font-bold rounded">
                      Month {selectedGroup.currentMonth} of 20
                    </span>
                    <h4 className="font-bold text-sm text-slate-900">
                      Current Active Month: Month {selectedGroup.currentMonth}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600">
                    Expected instalment per member:{' '}
                    <span className="font-bold text-slate-900">
                      {formatINR(selectedGroup.schedule[selectedGroup.currentMonth - 1]?.instalmentRupees || 0)}
                    </span>{' '}
                    • Payout:{' '}
                    <span className="font-bold text-purple-800">
                      {formatINR(selectedGroup.schedule[selectedGroup.currentMonth - 1]?.payoutAmountRupees || 0)}
                    </span>{' '}
                    (Kasar: {formatINR(selectedGroup.schedule[selectedGroup.currentMonth - 1]?.kasarRupees || 0)})
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                  <button
                    onClick={() => {
                      setSelectedMonth(selectedGroup.currentMonth);
                      setActiveTab('collections');
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer min-h-[38px]"
                  >
                    <Coins className="w-4 h-4" />
                    <span>Record Collections (தவணை வசூல்)</span>
                  </button>

                  <button
                    onClick={() => {
                      setPayoutMonth(selectedGroup.currentMonth);
                      setActiveTab('payouts');
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer min-h-[38px]"
                  >
                    <Trophy className="w-4 h-4" />
                    <span>Disburse Payout (பட்டுவாடா)</span>
                  </button>
                </div>
              </div>

              {/* 20-Month Visual Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>20-Month Timeline Progress:</span>
                  <span className="font-mono text-slate-500">Month {selectedGroup.currentMonth} / 20</span>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-20 gap-1">
                  {selectedGroup.schedule.map((s) => {
                    let cellBg = 'bg-slate-100 border-slate-200 text-slate-400';
                    if (s.month < selectedGroup.currentMonth) {
                      cellBg = 'bg-emerald-100 border-emerald-300 text-emerald-800 font-bold';
                    } else if (s.month === selectedGroup.currentMonth) {
                      cellBg = 'bg-blue-600 border-blue-700 text-white font-black ring-2 ring-blue-300';
                    }

                    return (
                      <div
                        key={s.month}
                        className={`p-1.5 sm:p-2 rounded-lg border text-center text-[11px] sm:text-xs font-mono transition-all ${cellBg}`}
                        title={`Month ${s.month}: Inst ${formatINR(s.instalmentRupees)}`}
                      >
                        M{s.month}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MEMBERS (20 SLOTS) */}
          {activeTab === 'members' && (
            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>20-Member Slots Board (20 நபர்கள் இடஒதுக்கீடு)</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Each chit has exactly 20 independent member slots. Click any slot to view payment history or enroll borrower.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-500 font-mono">
                    Occupied: {selectedGroup.memberCount} / 20
                  </span>
                </div>
              </div>

              {/* 20-Slots Interactive Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
                {memberSlots.map((slot) => {
                  if (slot.isOccupied) {
                    return (
                      <div
                        key={slot.memberNumber}
                        onClick={() => loadMemberProfile(slot.memberId)}
                        className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all cursor-pointer space-y-2 relative"
                      >
                        <div className="flex items-center justify-between">
                          <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 font-black text-xs flex items-center justify-center font-mono">
                            {String(slot.memberNumber).padStart(2, '0')}
                          </span>
                          {slot.hasReceivedPayout && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 font-bold text-[9px] rounded flex items-center space-x-1">
                              <Trophy className="w-3 h-3 text-purple-600" />
                              <span>M{slot.payoutMonth} Won</span>
                            </span>
                          )}
                        </div>

                        <div>
                          <p className="font-bold text-xs text-slate-900 truncate">{slot.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{slot.mobile}</p>
                        </div>

                        <div className="pt-1 border-t border-slate-100 text-[10px] flex justify-between font-mono">
                          <span className="text-slate-400">Paid:</span>
                          <span className="font-bold text-emerald-700">{formatINR(slot.totalPaidRupees)}</span>
                        </div>
                      </div>
                    );
                  }

                  // Empty Slot
                  return (
                    <div
                      key={slot.memberNumber}
                      onClick={() => handleOpenAddMember(slot.memberNumber)}
                      className="p-3.5 bg-slate-50/70 border border-dashed border-slate-300 rounded-xl hover:border-amber-500 hover:bg-amber-50/40 transition-all cursor-pointer space-y-2 text-center flex flex-col justify-between"
                    >
                      <div className="flex justify-between items-center">
                        <span className="w-7 h-7 rounded-lg bg-slate-200 text-slate-600 font-black text-xs flex items-center justify-center font-mono">
                          {String(slot.memberNumber).padStart(2, '0')}
                        </span>
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 font-bold text-[9px] rounded">
                          Available
                        </span>
                      </div>

                      <div className="py-1">
                        <p className="text-xs font-bold text-slate-400">+ Add Member</p>
                        <p className="text-[10px] text-slate-400">Click to assign slot</p>
                      </div>

                      <div className="pt-1 border-t border-slate-200/50 text-[10px] text-slate-400">
                        Slot {String(slot.memberNumber).padStart(2, '0')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: MONTHLY COLLECTIONS (தவணை வசூல்) */}
          {activeTab === 'collections' && (
            <div className="p-6 space-y-6">
              {/* Month Selection Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center space-x-3">
                  <label className="text-xs font-bold text-slate-700">தவணை எண் (Select Month):</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        Month {m} (தவணை {m})
                      </option>
                    ))}
                  </select>
                </div>

                {collectionSheet && (
                  <div className="flex items-center space-x-4 text-xs font-mono">
                    <div>
                      <span className="text-slate-400">Expected/Member: </span>
                      <span className="font-bold text-slate-900">
                        {formatINR(collectionSheet.expectedInstalmentRupees)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Collected: </span>
                      <span className="font-bold text-emerald-700">
                        {formatINR(collectionSheet.totalMonthCollectedRupees)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Pending: </span>
                      <span className="font-bold text-rose-700">
                        {formatINR(collectionSheet.totalMonthPendingRupees)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 20 Members Collection Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 min-w-[720px]">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-y border-slate-200">
                    <tr>
                      <th className="py-3 px-3">Slot #</th>
                      <th className="py-3 px-3">Member Name</th>
                      <th className="py-3 px-3">Mobile</th>
                      <th className="py-3 px-3 text-right">Expected (₹)</th>
                      <th className="py-3 px-3 text-right">Received (₹)</th>
                      <th className="py-3 px-3 text-right">Remaining (₹)</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {loadingSheet ? (
                      <tr>
                        <td colSpan="8" className="py-8 text-center text-slate-400">
                          Loading collection sheet for Month {selectedMonth}...
                        </td>
                      </tr>
                    ) : !collectionSheet || collectionSheet.members.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-8 text-center text-slate-400">
                          No members registered yet. Please enroll members first.
                        </td>
                      </tr>
                    ) : (
                      collectionSheet.members.map((m) => {
                        let statusBadge = { bg: 'bg-slate-100 text-slate-600 border-slate-200', label: 'PENDING' };
                        if (m.status === 'PAID') {
                          statusBadge = { bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', label: 'PAID' };
                        } else if (m.status === 'PARTIAL') {
                          statusBadge = { bg: 'bg-amber-100 text-amber-800 border-amber-300', label: 'PARTIAL' };
                        } else if (m.status === 'UNENROLLED') {
                          statusBadge = { bg: 'bg-slate-100 text-slate-400 border-slate-200', label: 'EMPTY SLOT' };
                        }

                        return (
                          <tr key={m.memberNumber} className="hover:bg-slate-50/80 transition-all">
                            <td className="py-3 px-3 font-bold text-slate-800">
                              Slot {String(m.memberNumber).padStart(2, '0')}
                            </td>
                            <td className="py-3 px-3 font-sans font-bold text-slate-900">
                              {m.name}
                              {m.hasReceivedPayout && (
                                <span className="ml-1.5 px-1 py-0.2 text-[9px] bg-purple-100 text-purple-800 font-bold rounded">
                                  Prize Won
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-slate-500">{m.mobile || '—'}</td>
                            <td className="py-3 px-3 text-right font-bold text-slate-800">
                              {formatINR(m.expectedRupees)}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-emerald-700">
                              {formatINR(m.paidRupees)}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-rose-600">
                              {formatINR(m.remainingRupees)}
                            </td>
                            <td className="py-3 px-3 text-center font-sans">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.bg}`}>
                                {statusBadge.label}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-sans">
                              {m.isOccupied ? (
                                <div className="flex items-center justify-center space-x-1.5">
                                  {m.remainingRupees > 0 ? (
                                    <button
                                      onClick={() => handleOpenPaymentModal(m)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs transition-all shadow-sm cursor-pointer whitespace-nowrap"
                                    >
                                      + வசூல் (Pay)
                                    </button>
                                  ) : (
                                    <span className="text-emerald-600 text-xs font-bold flex items-center space-x-1 px-1">
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      <span>Cleared</span>
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMemberPaymentReport(m.memberId || m._id)}
                                    title="View Individual Member Payment Report & Receipts"
                                    className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold rounded text-xs border border-slate-200 hover:border-blue-300 flex items-center space-x-1 transition-all cursor-pointer whitespace-nowrap"
                                  >
                                    <FileText className="w-3 h-3 text-blue-600" />
                                    <span>அறிக்கை</span>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleOpenAddMember(m.memberNumber)}
                                  className="text-blue-600 font-bold hover:underline text-xs cursor-pointer"
                                >
                                  Enroll Member
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: MONTHLY PAYOUTS (பட்டுவாடா) */}
          {activeTab === 'payouts' && (
            <div className="p-6 space-y-6">
              {payoutMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{payoutMessage}</span>
                </div>
              )}

              {/* Month Selector for Payout */}
              <div className="flex items-center space-x-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="text-xs font-bold text-slate-700">Select Month to Disburse / Record Payout:</label>
                <select
                  value={payoutMonth}
                  onChange={(e) => handlePayoutMonthChange(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-purple-500"
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      Month {m} (தவணை {m})
                    </option>
                  ))}
                </select>
              </div>

              {/* Payout Form Card */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <span>Month {payoutMonth} Chit Payout (பட்டுவாடா பதிவு)</span>
                  </h4>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setHasPayoutToggle(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        hasPayoutToggle
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Member Payout (பட்டுவாடா)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasPayoutToggle(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        !hasPayoutToggle
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      No Payout (பட்டுவாடா இல்லை)
                    </button>
                  </div>
                </div>

                {hasPayoutToggle ? (
                  <form onSubmit={handleSavePayout} className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Recipient Member */}
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Select Recipient Member (பட்டுவாடா பெறும் நபர்) *
                        </label>
                        <select
                          required
                          value={payoutMemberId}
                          onChange={(e) => setPayoutMemberId(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium text-slate-900 bg-white focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">-- Choose Member --</option>
                          {memberSlots
                            .filter((s) => s.isOccupied)
                            .map((s) => (
                              <option key={s.memberId} value={s.memberId}>
                                Slot {String(s.memberNumber).padStart(2, '0')} – {s.name} ({s.mobile})
                                {s.hasReceivedPayout ? ' [Already Won M' + s.payoutMonth + ']' : ''}
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Payment Method */}
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Payment Method *</label>
                        <select
                          value={payoutMethod}
                          onChange={(e) => setPayoutMethod(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                        >
                          <option value="BANK_TRANSFER">Bank Transfer (வங்கி பரிவர்த்தனை)</option>
                          <option value="CASH">Cash (ரொக்கம்)</option>
                          <option value="CHEQUE">Cheque (காசோலை)</option>
                          <option value="UPI">UPI / GPay / PhonePe</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Payout Amount */}
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          பட்டுவாடா தொகை (Payout Amount in ₹) *
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={payoutAmountInput}
                          onChange={(e) => setPayoutAmountInput(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-purple-900 focus:ring-2 focus:ring-purple-500"
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Prefilled from reference schedule. Can be adjusted if negotiated.
                        </p>
                      </div>

                      {/* Kasar */}
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          கசர் (Kasar Amount in ₹) *
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          value={payoutKasarInput}
                          onChange={(e) => setPayoutKasarInput(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    {/* Remarks */}
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Remarks / Voucher Notes</label>
                      <input
                        type="text"
                        placeholder="e.g. Month 1 Auction Winner, Promissory voucher signed"
                        value={payoutRemarks}
                        onChange={(e) => setPayoutRemarks(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingPayout}
                      className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center space-x-2"
                    >
                      <Trophy className="w-4 h-4" />
                      <span>{submittingPayout ? 'Disbursing...' : 'Confirm & Disburse Payout (பட்டுவாடா உறுதிப்படுத்து)'}</span>
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                      <p className="font-bold text-slate-800">
                        Month {payoutMonth} will be recorded as "No Payout" (பட்டுவாடா இல்லை).
                      </p>
                      <p className="text-slate-500 leading-relaxed">
                        Per chit terms (e.g. Month 2 in reference schedule or organizer priority), no auction payout is handed out. Member instalment collections remain active and recorded normally.
                      </p>
                    </div>

                    <button
                      onClick={handleSavePayout}
                      disabled={submittingPayout}
                      className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      {submittingPayout ? 'Saving...' : 'Confirm No Payout (பட்டுவாடா இல்லை என சேமிக்க)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: 20-MONTH COMPLETE SCHEDULE TABLE */}
          {activeTab === 'schedule' && (
            <div className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>20 Months Complete Reference Schedule (முழு அட்டவணை)</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Source of truth verified from reference chart.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
                <table className="w-full text-left text-xs text-slate-700 min-w-[720px]">
                  <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3 text-center">தவணை எண்</th>
                      <th className="py-3 px-3 text-right">சீட்டுத்தொகை</th>
                      <th className="py-3 px-3 text-right">தவணைத் தொகை</th>
                      <th className="py-3 px-3 text-right">கசர்</th>
                      <th className="py-3 px-3 text-right">பட்டுவாடா தொகை</th>
                      <th className="py-3 px-3 text-center">பட்டுவாடா பெற்றவர்</th>
                      <th className="py-3 px-3 text-center">வசூல் நிலை</th>
                      <th className="py-3 px-3 text-center">பட்டுவாடா நிலை</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {selectedGroup.schedule.map((row) => (
                      <tr
                        key={row.month}
                        className={`hover:bg-slate-50 transition-all ${
                          row.month === selectedGroup.currentMonth ? 'bg-blue-50/60 font-bold' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                          {String(row.month).padStart(2, '0')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {formatINR(row.chitAmountRupees)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatINR(row.instalmentRupees)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-700">
                          {row.kasarRupees > 0 ? formatINR(row.kasarRupees) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-purple-800">
                          {row.hasPayout && row.payoutAmountRupees > 0
                            ? formatINR(row.payoutAmountRupees)
                            : '— (No Payout)'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans">
                          {row.payoutRecipientName ? (
                            <span className="font-bold text-slate-900">
                              {row.payoutRecipientName}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.collectionStatus === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.collectionStatus === 'PARTIAL'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {row.collectionStatus}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.payoutStatus === 'PAID'
                                ? 'bg-purple-100 text-purple-800'
                                : row.payoutStatus === 'NO_PAYOUT'
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {row.payoutStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals Footer Row Matching Image Totals */}
                  <tfoot className="bg-slate-100 font-mono font-bold text-xs border-t-2 border-slate-300">
                    <tr>
                      <td className="py-3 px-3 text-center font-sans uppercase">மொத்தம் (Total)</td>
                      <td className="py-3 px-3 text-right text-slate-900">
                        {formatINR(selectedGroup.totalValueRupees)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-900">
                        {formatINR(selectedGroup.schedule.reduce((acc, s) => acc + s.instalmentRupees, 0))}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-800">
                        {formatINR(selectedGroup.schedule.reduce((acc, s) => acc + s.kasarRupees, 0))}
                      </td>
                      <td colSpan="4" className="py-3 px-3 text-center font-sans text-slate-400">
                        வாழ்க வளமுடன்
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: REPORTS */}
          {activeTab === 'reports' && (
            <div className="p-6 space-y-6">
              {/* Reports Sub-nav */}
              <div className="flex items-center space-x-2 pb-3 border-b border-slate-200 overflow-x-auto">
                {[
                  { id: 'monthly-collection', label: '1. Monthly Collection' },
                  { id: 'monthly-payout', label: '2. Monthly Payout' },
                  { id: 'member-wise', label: '3. Member-wise Ledger' },
                  { id: 'chit-group', label: '4. Chit Group Summary' },
                  { id: 'outstanding', label: '5. Outstanding Defaulters' },
                  { id: 'category-wise', label: '6. Category-wise' },
                  { id: 'member-payment-report', label: '7. Member Payment Report (தவணை வசூல் அறிக்கை)' },
                ].map((rep) => (
                  <button
                    key={rep.id}
                    onClick={() => setActiveReportType(rep.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      activeReportType === rep.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {rep.label}
                  </button>
                ))}
              </div>

              {/* Universal Report Filter & Action Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs print:hidden">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Chit Group Selector */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Chit Group:</label>
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-white min-w-[180px] focus:ring-2 focus:ring-blue-500"
                    >
                      {groups.map((g) => (
                        <option key={g._id} value={g._id}>
                          {g.chitId} - {g.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Month Filter */}
                  {(activeReportType === 'monthly-collection' ||
                    activeReportType === 'monthly-payout' ||
                    activeReportType === 'member-payment-report') && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">தவணை (Filter Month):</label>
                      <select
                        value={selectedReportMonth}
                        onChange={(e) => setSelectedReportMonth(e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-white min-w-[150px] focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="ALL">All Months (அனைத்தும்)</option>
                        {Array.from({ length: selectedGroup?.durationMonths || 20 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>
                            Month {m} (தவணை {m})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Member Filter */}
                  {(activeReportType === 'monthly-collection' ||
                    activeReportType === 'monthly-payout' ||
                    activeReportType === 'member-wise' ||
                    activeReportType === 'member-payment-report') && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">உறுப்பினர் (Filter Member):</label>
                      <select
                        value={selectedReportMemberId}
                        onChange={(e) => setSelectedReportMemberId(e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-white min-w-[200px] focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- All Members / அனைவரும் --</option>
                        {memberSlots.filter((s) => s.isOccupied).map((slot) => (
                          <option key={slot._id || slot.memberNumber} value={slot._id}>
                            Slot {String(slot.memberNumber).padStart(2, '0')} - {slot.name} ({slot.mobile})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Search Box */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Search Records:</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={reportSearchTerm}
                        onChange={(e) => setReportSearchTerm(e.target.value)}
                        placeholder="Search member, receipt #, voucher #..."
                        className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white w-full sm:w-56 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Export & Print */}
                <div className="flex items-center space-x-2 self-end lg:self-auto pt-2 lg:pt-0">
                  <button
                    type="button"
                    onClick={exportActiveReportCSV}
                    className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer shadow-sm min-h-[34px]"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer shadow-sm min-h-[34px]"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Report</span>
                  </button>
                </div>
              </div>

              {/* Report Content Loading / Empty / Tables */}
              {reportLoading ? (
                <div className="p-16 text-center text-slate-400 text-xs">
                  <Clock className="w-8 h-8 mx-auto mb-2 animate-spin text-blue-500" />
                  <span>Loading report data...</span>
                </div>
              ) : !reportData || !reportData.data ? (
                <div className="p-16 text-center text-slate-400 text-xs bg-slate-50 border border-slate-200 rounded-xl">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <span>No report records found for the selected criteria.</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* REPORT 1: MONTHLY COLLECTION REPORT */}
                  {activeReportType === 'monthly-collection' && (() => {
                    const allRows = Array.isArray(reportData.data) ? reportData.data : [];
                    const rows = allRows.filter((r) => {
                      if (!reportSearchTerm.trim()) return true;
                      const q = reportSearchTerm.toLowerCase();
                      return (
                        (r.receiptNumber || '').toLowerCase().includes(q) ||
                        (r.memberName || '').toLowerCase().includes(q) ||
                        (r.paymentMethod || '').toLowerCase().includes(q) ||
                        (r.status || '').toLowerCase().includes(q) ||
                        (r.notes || '').toLowerCase().includes(q) ||
                        `slot ${r.memberNumber}`.toLowerCase().includes(q)
                      );
                    });

                    const totalCollected = rows.reduce((acc, r) => acc + (r.paidRupees || 0), 0);
                    const totalExpected = reportData.totalExpectedRupees || rows.reduce((acc, r) => acc + (r.expectedRupees || 0), 0);
                    const totalPending = reportData.totalPendingRupees !== undefined ? reportData.totalPendingRupees : Math.max(0, totalExpected - totalCollected);

                    return (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4 sm:p-6 print:border-none print:shadow-none print:p-0">
                        {/* Report Heading */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                              <Coins className="w-5 h-5 text-emerald-600" />
                              <span>Monthly Collection Report (மாத தவணை வசூல் அறிக்கை)</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {selectedGroup?.name} ({selectedGroup?.chitId}) • {selectedReportMonth === 'ALL' ? 'All Months' : `Month ${selectedReportMonth}`}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg self-start sm:self-auto">
                            {rows.length} Receipts Found
                          </span>
                        </div>

                        {/* KPI Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] text-slate-500 uppercase font-sans">Total Expected</p>
                            <p className="text-base font-bold text-slate-900">{formatINR(totalExpected)}</p>
                          </div>
                          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                            <p className="text-[10px] text-emerald-700 uppercase font-sans">Total Amount Collected</p>
                            <p className="text-base font-bold text-emerald-800">{formatINR(totalCollected)}</p>
                          </div>
                          <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                            <p className="text-[10px] text-rose-700 uppercase font-sans">Total Pending Balance</p>
                            <p className="text-base font-bold text-rose-800">{formatINR(totalPending)}</p>
                          </div>
                          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-[10px] text-blue-700 uppercase font-sans">Total Payment Records</p>
                            <p className="text-base font-bold text-blue-800">{rows.length} Transactions</p>
                          </div>
                        </div>

                        {/* Table */}
                        {rows.length === 0 ? (
                          <div className="p-12 text-center text-slate-400 text-xs">
                            No collection records found matching your filters.
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full text-left text-xs min-w-[850px]">
                              <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                                <tr>
                                  <th className="py-2.5 px-3">Receipt No.</th>
                                  <th className="py-2.5 px-3">Month / Instalment</th>
                                  <th className="py-2.5 px-3">Member Name</th>
                                  <th className="py-2.5 px-3 text-right">Expected Amount (₹)</th>
                                  <th className="py-2.5 px-3 text-right">Amount Paid (₹)</th>
                                  <th className="py-2.5 px-3 text-right">Balance (₹)</th>
                                  <th className="py-2.5 px-3">Payment Date & Time</th>
                                  <th className="py-2.5 px-3">Payment Method</th>
                                  <th className="py-2.5 px-3 text-center">Status</th>
                                  <th className="py-2.5 px-3">Notes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono">
                                {rows.map((r, idx) => (
                                  <tr key={r.receiptNumber || idx} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-2.5 px-3 font-bold text-blue-700">
                                      {r.receiptNumber}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans font-medium text-slate-800">
                                      Month {r.month} (தவணை {r.month})
                                    </td>
                                    <td className="py-2.5 px-3 font-sans">
                                      <span className="font-bold text-slate-900">{r.memberName}</span>
                                      <span className="ml-1 text-[11px] text-slate-500 font-mono">
                                        (Slot {String(r.memberNumber).padStart(2, '0')})
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-medium text-slate-800">
                                      {formatINR(r.expectedRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                                      {formatINR(r.paidRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                                      {formatINR(r.balanceRupees !== undefined ? r.balanceRupees : Math.max(0, (r.expectedRupees || 0) - (r.paidRupees || 0)))}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-700 font-sans text-[11px]">
                                      {formatDateTime(r.paymentDate)}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans">
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                        {r.paymentMethod}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-sans">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                        r.status === 'PAID'
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                          : 'bg-amber-100 text-amber-800 border-amber-300'
                                      }`}>
                                        {r.status}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-sans text-slate-500 text-[11px] max-w-[150px] truncate">
                                      {r.notes || '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900 font-mono">
                                <tr>
                                  <td colSpan="3" className="py-3 px-3 font-sans text-right">
                                    TOTALS (சுருக்கம்):
                                  </td>
                                  <td className="py-3 px-3 text-right text-slate-900">
                                    {formatINR(totalExpected)}
                                  </td>
                                  <td className="py-3 px-3 text-right text-emerald-800">
                                    {formatINR(totalCollected)}
                                  </td>
                                  <td className="py-3 px-3 text-right text-rose-700">
                                    {formatINR(totalPending)}
                                  </td>
                                  <td colSpan="4" className="py-3 px-3 font-sans text-slate-500 font-normal">
                                    {rows.length} collections recorded
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* REPORT 2: MONTHLY PAYOUT REPORT */}
                  {activeReportType === 'monthly-payout' && (() => {
                    const allRows = Array.isArray(reportData.data) ? reportData.data : [];
                    const rows = allRows.filter((r) => {
                      if (!reportSearchTerm.trim()) return true;
                      const q = reportSearchTerm.toLowerCase();
                      return (
                        (r.voucherNumber || '').toLowerCase().includes(q) ||
                        (r.memberName || '').toLowerCase().includes(q) ||
                        (r.paymentMethod || '').toLowerCase().includes(q) ||
                        (r.remarks || '').toLowerCase().includes(q)
                      );
                    });

                    const totalPayouts = rows.reduce((acc, r) => acc + (r.payoutAmountRupees || 0), 0);
                    const totalKasar = rows.reduce((acc, r) => acc + (r.kasarRupees || 0), 0);
                    const totalNetPaid = rows.reduce((acc, r) => acc + (r.netPaidRupees || 0), 0);

                    return (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4 sm:p-6 print:border-none print:shadow-none print:p-0">
                        {/* Report Heading */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                              <Trophy className="w-5 h-5 text-purple-600" />
                              <span>Monthly Payout Report (மாத பட்டுவாடா அறிக்கை)</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {selectedGroup?.name} ({selectedGroup?.chitId}) • {selectedReportMonth === 'ALL' ? 'All Months' : `Month ${selectedReportMonth}`}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg self-start sm:self-auto">
                            {rows.length} Payout Records
                          </span>
                        </div>

                        {/* KPI Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <p className="text-[10px] text-purple-700 uppercase font-sans">Total Payouts Disbursed</p>
                            <p className="text-base font-bold text-purple-900">{formatINR(totalPayouts)}</p>
                          </div>
                          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <p className="text-[10px] text-amber-700 uppercase font-sans">Total Kasar / Deduction</p>
                            <p className="text-base font-bold text-amber-900">{formatINR(totalKasar)}</p>
                          </div>
                          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                            <p className="text-[10px] text-emerald-700 uppercase font-sans">Net Disbursed Amount</p>
                            <p className="text-base font-bold text-emerald-800">{formatINR(totalNetPaid)}</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] text-slate-500 uppercase font-sans">Disbursed Records</p>
                            <p className="text-base font-bold text-slate-800">{rows.length} Months</p>
                          </div>
                        </div>

                        {/* Table or Empty State */}
                        {rows.length === 0 ? (
                          <div className="p-12 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                            <Trophy className="w-8 h-8 text-slate-300 mx-auto" />
                            <p className="font-bold text-slate-600">No payout records found for the selected criteria.</p>
                            <p className="text-[11px] text-slate-400">Record a payout in the பட்டுவாடா (Payouts) tab to view disbursement vouchers here.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full text-left text-xs min-w-[850px]">
                              <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                                <tr>
                                  <th className="py-2.5 px-3">Voucher No.</th>
                                  <th className="py-2.5 px-3">Month / Instalment</th>
                                  <th className="py-2.5 px-3">Payout Date & Time</th>
                                  <th className="py-2.5 px-3">Member Name & Slot</th>
                                  <th className="py-2.5 px-3 text-right">Payout Amount (₹)</th>
                                  <th className="py-2.5 px-3 text-right">Kasar / Deduction (₹)</th>
                                  <th className="py-2.5 px-3 text-right">Net Amount Paid (₹)</th>
                                  <th className="py-2.5 px-3">Payment Method</th>
                                  <th className="py-2.5 px-3 text-center">Status</th>
                                  <th className="py-2.5 px-3">Remarks</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono">
                                {rows.map((r, idx) => (
                                  <tr key={r.voucherNumber || idx} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-2.5 px-3 font-bold text-purple-700">
                                      {r.voucherNumber}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans font-medium text-slate-800">
                                      Month {r.month} (தவணை {r.month})
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-700 font-sans text-[11px]">
                                      {formatDateTime(r.payoutDate)}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans">
                                      {r.hasPayout ? (
                                        <>
                                          <span className="font-bold text-slate-900">{r.memberName}</span>
                                          {r.memberNumber && (
                                            <span className="ml-1 text-[11px] text-slate-500 font-mono">
                                              (Slot {String(r.memberNumber).padStart(2, '0')})
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-slate-400 italic">No Payout Disbursed</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-purple-900">
                                      {formatINR(r.payoutAmountRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-medium text-amber-700">
                                      {formatINR(r.kasarRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                                      {formatINR(r.netPaidRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans">
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                        {r.paymentMethod}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-sans">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                        r.hasPayout
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                          : 'bg-slate-100 text-slate-600 border-slate-300'
                                      }`}>
                                        {r.hasPayout ? 'COMPLETED' : 'NO_PAYOUT'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-sans text-slate-500 text-[11px] max-w-[150px] truncate">
                                      {r.remarks || '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900 font-mono">
                                <tr>
                                  <td colSpan="4" className="py-3 px-3 font-sans text-right">
                                    TOTALS (சுருக்கம்):
                                  </td>
                                  <td className="py-3 px-3 text-right text-purple-900">
                                    {formatINR(totalPayouts)}
                                  </td>
                                  <td className="py-3 px-3 text-right text-amber-800">
                                    {formatINR(totalKasar)}
                                  </td>
                                  <td className="py-3 px-3 text-right text-emerald-800">
                                    {formatINR(totalNetPaid)}
                                  </td>
                                  <td colSpan="3" className="py-3 px-3 font-sans text-slate-500 font-normal">
                                    {rows.length} payout records
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* REPORT 3: MEMBER-WISE LEDGER */}
                  {activeReportType === 'member-wise' && (() => {
                    const allRows = Array.isArray(reportData.data) ? reportData.data : [];
                    const rows = allRows.filter((r) => {
                      if (!reportSearchTerm.trim()) return true;
                      const q = reportSearchTerm.toLowerCase();
                      return (
                        (r.name || '').toLowerCase().includes(q) ||
                        (r.mobile || '').includes(q) ||
                        (r.village || '').toLowerCase().includes(q) ||
                        (r.district || '').toLowerCase().includes(q) ||
                        `slot ${r.memberNumber}`.toLowerCase().includes(q)
                      );
                    });

                    const totalExpected = rows.reduce((acc, r) => acc + (r.expectedRupees || 0), 0);
                    const totalPaid = rows.reduce((acc, r) => acc + (r.paidRupees || 0), 0);
                    const totalPending = rows.reduce((acc, r) => acc + (r.pendingRupees || 0), 0);

                    return (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4 sm:p-6 print:border-none print:shadow-none print:p-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                              <Users className="w-5 h-5 text-blue-600" />
                              <span>Member-wise Ledger (உறுப்பினர் கணக்கு அறிக்கை)</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {selectedGroup?.name} ({selectedGroup?.chitId}) • Total {rows.length} Enrolled Members
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg self-start sm:self-auto">
                            {rows.length} Members Listed
                          </span>
                        </div>

                        {/* KPI Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-[10px] text-slate-500 uppercase font-sans">Total Expected</p>
                            <p className="text-base font-bold text-slate-900">{formatINR(totalExpected)}</p>
                          </div>
                          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                            <p className="text-[10px] text-emerald-700 uppercase font-sans">Total Paid</p>
                            <p className="text-base font-bold text-emerald-800">{formatINR(totalPaid)}</p>
                          </div>
                          <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                            <p className="text-[10px] text-rose-700 uppercase font-sans">Total Pending Balance</p>
                            <p className="text-base font-bold text-rose-800">{formatINR(totalPending)}</p>
                          </div>
                          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-[10px] text-blue-700 uppercase font-sans">Enrolled Count</p>
                            <p className="text-base font-bold text-blue-800">{rows.length} / 20 Slots</p>
                          </div>
                        </div>

                        {rows.length === 0 ? (
                          <div className="p-12 text-center text-slate-400 text-xs">
                            No member records found matching your filters.
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full text-left text-xs min-w-[750px]">
                              <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                                <tr>
                                  <th className="py-2.5 px-3">Slot #</th>
                                  <th className="py-2.5 px-3">Member Name</th>
                                  <th className="py-2.5 px-3">Mobile</th>
                                  <th className="py-2.5 px-3">Location</th>
                                  <th className="py-2.5 px-3 text-right">Total Expected (₹)</th>
                                  <th className="py-2.5 px-3 text-right">Total Paid (₹)</th>
                                  <th className="py-2.5 px-3 text-right">Pending Balance (₹)</th>
                                  <th className="py-2.5 px-3 text-center">Payout Status</th>
                                  <th className="py-2.5 px-3 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono">
                                {rows.map((r) => (
                                  <tr key={r.memberNumber} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-2.5 px-3 font-bold text-slate-800">
                                      Slot {String(r.memberNumber).padStart(2, '0')}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                                      {r.name}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-600 font-sans">
                                      {r.mobile || '—'}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-500 font-sans text-[11px]">
                                      {r.village ? `${r.village}` : ''} {r.district ? `(${r.district})` : ''}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-medium text-slate-800">
                                      {formatINR(r.expectedRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                                      {formatINR(r.paidRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                                      {formatINR(r.pendingRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-sans">
                                      {r.hasReceivedPayout ? (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                          M{r.payoutMonth} Won ({formatINR(r.payoutAmountRupees)})
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-[11px]">Pending</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-sans">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenMemberPaymentReport(r.memberId)}
                                        className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold rounded text-xs border border-slate-200 hover:border-blue-300 transition-all cursor-pointer whitespace-nowrap"
                                      >
                                        அறிக்கை (Report)
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-900 font-mono">
                                <tr>
                                  <td colSpan="4" className="py-3 px-3 font-sans text-right">
                                    TOTALS:
                                  </td>
                                  <td className="py-3 px-3 text-right text-slate-900">
                                    {formatINR(totalExpected)}
                                  </td>
                                  <td className="py-3 px-3 text-right text-emerald-800">
                                    {formatINR(totalPaid)}
                                  </td>
                                  <td className="py-3 px-3 text-right text-rose-700">
                                    {formatINR(totalPending)}
                                  </td>
                                  <td colSpan="2"></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* REPORT 4: CHIT GROUP SUMMARY */}
                  {activeReportType === 'chit-group' && (() => {
                    const rows = Array.isArray(reportData.data) ? reportData.data : [];
                    return (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4 sm:p-6 print:border-none print:shadow-none print:p-0">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                          <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                            <Layers className="w-5 h-5 text-blue-600" />
                            <span>Chit Group Performance Summary (சீட்டு குழு விபரம்)</span>
                          </h3>
                          <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                            {rows.length} Groups
                          </span>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full text-left text-xs min-w-[800px]">
                            <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-3">Chit ID</th>
                                <th className="py-2.5 px-3">Group Name</th>
                                <th className="py-2.5 px-3">Category</th>
                                <th className="py-2.5 px-3 text-center">Status</th>
                                <th className="py-2.5 px-3 text-right">Total Value (₹)</th>
                                <th className="py-2.5 px-3 text-center">Members</th>
                                <th className="py-2.5 px-3 text-center">Month</th>
                                <th className="py-2.5 px-3 text-right">Expected (₹)</th>
                                <th className="py-2.5 px-3 text-right">Collected (₹)</th>
                                <th className="py-2.5 px-3 text-right">Payouts (₹)</th>
                                <th className="py-2.5 px-3 text-right">Outstanding (₹)</th>
                                <th className="py-2.5 px-3 text-center">Progress</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono">
                              {rows.map((g) => (
                                <tr key={g.chitId} className="hover:bg-slate-50/80">
                                  <td className="py-2.5 px-3 font-bold text-blue-700">{g.chitId}</td>
                                  <td className="py-2.5 px-3 font-sans font-bold text-slate-900">{g.name}</td>
                                  <td className="py-2.5 px-3 font-sans">{g.category}</td>
                                  <td className="py-2.5 px-3 text-center font-sans">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      g.status === 'ACTIVE'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : 'bg-amber-100 text-amber-800 border-amber-300'
                                    }`}>
                                      {g.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatINR(g.totalValueRupees)}</td>
                                  <td className="py-2.5 px-3 text-center font-sans">{g.memberCount} / 20</td>
                                  <td className="py-2.5 px-3 text-center font-sans">Month {g.currentMonth || 1}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-700">{formatINR(g.expectedRupees)}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-700">{formatINR(g.collectedRupees)}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-purple-700">{formatINR(g.payoutsRupees)}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-rose-600">{formatINR(g.outstandingRupees)}</td>
                                  <td className="py-2.5 px-3 text-center font-sans">
                                    <span className="font-bold text-slate-700">{g.progressPercent}%</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* REPORT 5: OUTSTANDING / DEFAULTERS */}
                  {activeReportType === 'outstanding' && (() => {
                    const rows = Array.isArray(reportData.data) ? reportData.data : [];
                    return (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4 sm:p-6 print:border-none print:shadow-none print:p-0">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                              <AlertCircle className="w-5 h-5 text-rose-600" />
                              <span>Outstanding Defaulters Report (நிலுவை அறிக்கை)</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Members with overdue instalments as of Month {selectedGroup?.currentMonth || 1}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
                            {rows.length} Defaulters
                          </span>
                        </div>

                        {rows.length === 0 ? (
                          <div className="p-12 text-center text-slate-400 text-xs bg-emerald-50/50 rounded-xl border border-emerald-100">
                            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                            <p className="font-bold text-emerald-800">Excellent! No overdue defaulters in this chit group.</p>
                            <p className="text-[11px] text-emerald-600">All members have cleared payments up to Month {selectedGroup?.currentMonth || 1}.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full text-left text-xs min-w-[700px]">
                              <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                                <tr>
                                  <th className="py-2.5 px-3">Slot #</th>
                                  <th className="py-2.5 px-3">Member Name</th>
                                  <th className="py-2.5 px-3">Mobile</th>
                                  <th className="py-2.5 px-3 text-center">Current Month</th>
                                  <th className="py-2.5 px-3 text-right">Expected to Date (₹)</th>
                                  <th className="py-2.5 px-3 text-right">Paid to Date (₹)</th>
                                  <th className="py-2.5 px-3 text-right">Overdue Balance (₹)</th>
                                  <th className="py-2.5 px-3 text-center">Payout Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono">
                                {rows.map((r) => (
                                  <tr key={r.memberNumber} className="hover:bg-rose-50/30">
                                    <td className="py-2.5 px-3 font-bold text-slate-800">
                                      Slot {String(r.memberNumber).padStart(2, '0')}
                                    </td>
                                    <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                                      {r.name}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-600 font-sans">
                                      {r.mobile || '—'}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-sans">
                                      Month {r.currentMonth}
                                    </td>
                                    <td className="py-2.5 px-3 text-right text-slate-700">
                                      {formatINR(r.expectedToCurrentMonthRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                                      {formatINR(r.paidRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-rose-600 bg-rose-50/50">
                                      {formatINR(r.overdueRupees)}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-sans">
                                      {r.hasReceivedPayout ? (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                                          Prize Won
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 text-[11px]">Pending</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* REPORT 6: CATEGORY-WISE */}
                  {activeReportType === 'category-wise' && (() => {
                    const rows = Array.isArray(reportData.data) ? reportData.data : [];
                    return (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4 sm:p-6 print:border-none print:shadow-none print:p-0">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                          <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                            <span>Category-wise Portfolio (பிரிவு வாரியாக சுருக்கம்)</span>
                          </h3>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full text-left text-xs min-w-[750px]">
                            <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-3">Category</th>
                                <th className="py-2.5 px-3 text-center">Total Groups</th>
                                <th className="py-2.5 px-3 text-center">Active Groups</th>
                                <th className="py-2.5 px-3 text-right">Total Chit Value (₹)</th>
                                <th className="py-2.5 px-3 text-right">Total Expected (₹)</th>
                                <th className="py-2.5 px-3 text-right">Total Collected (₹)</th>
                                <th className="py-2.5 px-3 text-right">Total Payouts (₹)</th>
                                <th className="py-2.5 px-3 text-right">Outstanding (₹)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono">
                              {rows.map((cat) => (
                                <tr key={cat.category} className="hover:bg-slate-50/80">
                                  <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                                    {cat.label}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-sans">{cat.totalGroups}</td>
                                  <td className="py-2.5 px-3 text-center font-sans font-bold text-emerald-700">{cat.activeGroups}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatINR(cat.totalChitValueRupees)}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-700">{formatINR(cat.totalExpectedRupees)}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-700">{formatINR(cat.totalCollectedRupees)}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-purple-700">{formatINR(cat.totalPayoutsRupees)}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-rose-600">{formatINR(cat.outstandingRupees)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* REPORT 7: INDIVIDUAL MEMBER PAYMENT REPORT */}
                  {activeReportType === 'member-payment-report' && (
                    <div className="space-y-6">
                      {(Array.isArray(reportData.data) ? reportData.data : [reportData.data]).map((mr, idx) => (
                        <div
                          key={mr.member?._id || mr.member?.memberNumber || idx}
                          className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-4 sm:p-6 print:border-none print:shadow-none print:p-0"
                        >
                          {/* Member Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="w-8 h-8 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center font-mono">
                                  {String(mr.member?.memberNumber).padStart(2, '0')}
                                </span>
                                <h3 className="text-base font-bold text-slate-900">{mr.member?.name}</h3>
                                {mr.member?.hasReceivedPayout && (
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold text-xs rounded">
                                    Prize Won (Month {mr.member?.payoutMonth})
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 font-mono">
                                Mobile: {mr.member?.mobile || '—'} {mr.member?.village ? `• ${mr.member.village}` : ''} {mr.member?.district ? `, ${mr.member.district}` : ''}
                              </p>
                            </div>

                            <div className="text-right text-xs">
                              <span className="font-bold text-slate-700">{mr.group?.name || selectedGroup?.name}</span>
                              <p className="text-[11px] text-slate-500 font-mono">Chit Value: {formatINR(mr.group?.totalValueRupees || selectedGroup?.totalValueRupees)}</p>
                            </div>
                          </div>

                          {/* KPI Cards */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                              <p className="text-[10px] text-slate-500 uppercase font-sans">Total Expected</p>
                              <p className="text-sm font-bold text-slate-900">{formatINR(mr.summary?.totalExpectedRupees)}</p>
                            </div>
                            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                              <p className="text-[10px] text-emerald-700 uppercase font-sans">Total Received</p>
                              <p className="text-sm font-bold text-emerald-800">{formatINR(mr.summary?.totalReceivedRupees)}</p>
                            </div>
                            <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                              <p className="text-[10px] text-rose-700 uppercase font-sans">Balance Pending</p>
                              <p className="text-sm font-bold text-rose-800">{formatINR(mr.summary?.totalBalanceRupees)}</p>
                            </div>
                            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                              <p className="text-[10px] text-indigo-700 uppercase font-sans">Status & Receipts</p>
                              <div className="flex items-center space-x-1.5 mt-0.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  mr.summary?.status === 'PAID' ? 'bg-emerald-200 text-emerald-900' :
                                  mr.summary?.status === 'PARTIAL' ? 'bg-amber-200 text-amber-900' : 'bg-rose-200 text-rose-900'
                                }`}>
                                  {mr.summary?.status}
                                </span>
                                <span className="text-[11px] text-slate-600">({mr.summary?.totalPaymentsCount || 0} Receipts)</span>
                              </div>
                            </div>
                          </div>

                          {/* Month Breakdown & Multiple Partial Payments */}
                          <div className="space-y-3 pt-2">
                            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                              Month-by-Month Payment History & Partial Collections
                            </h4>

                            <div className="overflow-x-auto rounded-lg border border-slate-200">
                              <table className="w-full text-left text-xs min-w-[700px]">
                                <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                                  <tr>
                                    <th className="py-2.5 px-3">Month (தவணை)</th>
                                    <th className="py-2.5 px-3 text-right">Expected (₹)</th>
                                    <th className="py-2.5 px-3 text-right">Total Received (₹)</th>
                                    <th className="py-2.5 px-3 text-right">Balance (₹)</th>
                                    <th className="py-2.5 px-3 text-center">Status</th>
                                    <th className="py-2.5 px-3">Payment Receipts & Partial Payments</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono">
                                  {mr.monthBreakdown?.map((m) => (
                                    <tr key={m.month} className="hover:bg-slate-50/80 align-top">
                                      <td className="py-3 px-3 font-bold text-slate-900">
                                        Month {m.month}
                                      </td>
                                      <td className="py-3 px-3 text-right font-bold text-slate-800">
                                        {formatINR(m.expectedRupees)}
                                      </td>
                                      <td className="py-3 px-3 text-right font-bold text-emerald-700">
                                        {formatINR(m.receivedRupees)}
                                      </td>
                                      <td className="py-3 px-3 text-right font-bold text-rose-600">
                                        {formatINR(m.balanceRupees)}
                                      </td>
                                      <td className="py-3 px-3 text-center font-sans">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                          m.status === 'PAID' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                          m.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                                          'bg-rose-50 text-rose-700 border-rose-200'
                                        }`}>
                                          {m.status}
                                        </span>
                                      </td>
                                      <td className="py-3 px-3 font-sans">
                                        {m.payments && m.payments.length > 0 ? (
                                          <div className="space-y-1.5">
                                            {m.payments.map((p, pIdx) => (
                                              <div key={p._id || pIdx} className="bg-slate-50 p-2 rounded border border-slate-200 text-[11px] font-mono space-y-0.5">
                                                <div className="flex justify-between items-center text-slate-800 font-bold">
                                                  <span className="text-blue-700">{p.receiptNumber}</span>
                                                  <span className="text-emerald-700 font-bold">{formatINR(p.amountPaidRupees)}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-500 text-[10px]">
                                                  <span>{formatDateTime(p.paymentDate)} • {p.paymentMethod}</span>
                                                  {p.recordedBy && <span>By: {p.recordedBy}</span>}
                                                </div>
                                                {p.notes && (
                                                  <div className="text-[10px] text-slate-600 italic">
                                                    Note: {p.notes}
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-slate-400 text-[11px] italic">No payment recorded</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty State when no Chit Group is selected/created */}
      {!selectedGroup && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Chit Groups Available</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Create a ₹5 Lakh, ₹10 Lakh, or ₹20 Lakh chit group (20 members, 20 months) to begin managing monthly auctions, member ledgers, and payouts.
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg text-xs font-bold hover:from-blue-500 hover:to-indigo-600 shadow-md cursor-pointer inline-flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Chit Group</span>
          </button>
        </div>
      )}

      {/* MODAL 1: CREATE CHIT GROUP */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Landmark className="w-5 h-5 text-amber-500" />
                <span>புதிய சீட்டு தொடங்கு (Create Chit Group)</span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createChitError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {createChitError}
              </div>
            )}

            <form onSubmit={handleCreateChitGroup} className="space-y-4 text-xs">
              {/* Category */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Chit Category *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: '5_LAKH', label: '₹5,00,000', sub: '5 Lakh' },
                    { id: '10_LAKH', label: '₹10,00,000', sub: '10 Lakh' },
                    { id: '20_LAKH', label: '₹20,00,000', sub: '20 Lakh' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setNewChitCategory(cat.id)}
                      className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                        newChitCategory === cat.id
                          ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20'
                          : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                      }`}
                    >
                      <p className="font-bold text-xs">{cat.label}</p>
                      <p className="text-[10px] text-slate-500">{cat.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Group Name */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chit Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. 10 Lakh Chit 001"
                  value={newChitName}
                  onChange={(e) => setNewChitName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={newChitStartDate}
                    onChange={(e) => setNewChitStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">First Instalment Date *</label>
                  <input
                    type="date"
                    required
                    value={newChitFirstInstDate}
                    onChange={(e) => setNewChitFirstInstDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Traditional 20 members group"
                  value={newChitRemarks}
                  onChange={(e) => setNewChitRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer min-h-[38px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingNewChit}
                  className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-md cursor-pointer disabled:opacity-50 min-h-[38px]"
                >
                  {submittingNewChit ? 'Creating...' : 'Create Chit Group (சேமிக்க)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD MEMBER */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>உறுப்பினர் பதிவு (Slot {String(targetSlotNumber).padStart(2, '0')})</span>
              </h3>
              <button
                onClick={() => setIsAddMemberModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {memberError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {memberError}
              </div>
            )}

            <form onSubmit={handleSaveMember} className="space-y-3.5 text-xs">
              {/* Optional Pick from Borrower */}
              {existingCustomers.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Choose from Existing Borrowers (விருப்பத்தேர்வு)
                  </label>
                  <SearchableCustomerSelect
                    value={selectedCustomerId}
                    customers={existingCustomers}
                    onChange={(id, cust) => handleSelectCustomerForSlot(id, cust)}
                    placeholder="Search borrower by name or mobile..."
                  />
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Member Name (பெயர்) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh"
                  value={memberFormName}
                  onChange={(e) => setMemberFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-bold"
                />
              </div>

              {/* Mobile */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mobile Number (கைபேசி) *</label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile number"
                  value={memberFormMobile}
                  onChange={(e) => setMemberFormMobile(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono font-bold"
                />
              </div>

              {/* District & Village */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">District (மாவட்டம்)</label>
                  <input
                    type="text"
                    placeholder="e.g. Dindigul"
                    value={memberFormDistrict}
                    onChange={(e) => setMemberFormDistrict(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Village / ஊர்</label>
                  <input
                    type="text"
                    placeholder="e.g. Palani"
                    value={memberFormVillage}
                    onChange={(e) => setMemberFormVillage(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddMemberModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer min-h-[38px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMember}
                  className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-md cursor-pointer disabled:opacity-50 min-h-[38px]"
                >
                  {submittingMember ? 'Saving...' : 'Save Member (பதிவு செய்ய)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD COLLECTION PAYMENT */}
      {paymentModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Coins className="w-5 h-5 text-emerald-600" />
                <span>தவணை வசூல் பதிவு (Record Instalment)</span>
              </h3>
              <button
                onClick={() => setPaymentModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {paymentSuccessReceipt ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 text-center">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-emerald-900 text-sm">வசூல் வெற்றிகரமாக சேமிக்கப்பட்டது!</h4>
                <p className="text-xs text-emerald-700 font-mono">
                  Receipt: <span className="font-bold">{paymentSuccessReceipt.receiptNumber}</span>
                </p>
                <p className="text-xs text-slate-600">
                  Amount: <span className="font-bold">{formatINR(paymentSuccessReceipt.amountPaidRupees)}</span> • Remaining: {formatINR(paymentSuccessReceipt.remainingRupees)}
                </p>
                <button
                  onClick={() => setPaymentModalData(null)}
                  className="w-full py-2 bg-emerald-600 text-white font-bold rounded-lg text-xs cursor-pointer min-h-[38px]"
                >
                  Done (முடிந்தது)
                </button>
              </div>
            ) : (
              <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="font-bold text-slate-900 text-sm">
                    Slot {String(paymentModalData.memberNumber).padStart(2, '0')} – {paymentModalData.name}
                  </p>
                  <p className="text-slate-500 font-mono">
                    Month {selectedMonth} • Expected: {formatINR(paymentModalData.expectedRupees)} • Remaining Due: <span className="font-bold text-rose-700">{formatINR(paymentModalData.remainingRupees)}</span>
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount Received (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={payAmountInput}
                    onChange={(e) => setPayAmountInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex space-x-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setPayAmountInput(String(paymentModalData.remainingRupees))}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded cursor-pointer min-h-[30px]"
                    >
                      Full Balance ({formatINR(paymentModalData.remainingRupees)})
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method *</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                  >
                    <option value="CASH">Cash (ரொக்கம்)</option>
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="BANK_TRANSFER">Bank Transfer (வங்கி கணக்கு)</option>
                    <option value="CHEQUE">Cheque (காசோலை)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Notes / Receipt Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Month 1 payment received in cash"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setPaymentModalData(null)}
                    className="w-full sm:w-auto px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer min-h-[38px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingPayment}
                    className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-md cursor-pointer disabled:opacity-50 min-h-[38px]"
                  >
                    {submittingPayment ? 'Recording...' : 'Confirm Receipt (ரசீது பதிவு)'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: MEMBER DETAIL PROFILE (20-Month Ledger Matrix) */}
      {selectedMemberProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 font-black text-sm flex items-center justify-center font-mono shrink-0">
                  {String(selectedMemberProfile.memberNumber).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedMemberProfile.name}</h3>
                  <p className="text-[11px] text-slate-500 font-mono">{selectedMemberProfile.mobile} • {selectedMemberProfile.chitId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMemberProfile(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total Expected</p>
                <p className="font-bold text-slate-900 font-mono text-sm sm:text-base">{formatINR(selectedMemberProfile.totalExpectedRupees)}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-[10px] text-emerald-700 font-bold uppercase">Total Paid</p>
                <p className="font-bold text-emerald-800 font-mono text-sm sm:text-base">{formatINR(selectedMemberProfile.totalPaidRupees)}</p>
              </div>
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                <p className="text-[10px] text-rose-700 font-bold uppercase">Pending</p>
                <p className="font-bold text-rose-800 font-mono text-sm sm:text-base">{formatINR(selectedMemberProfile.totalPendingRupees)}</p>
              </div>
            </div>

            {/* Payout Status Banner if won */}
            {selectedMemberProfile.hasReceivedPayout && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="font-bold">Prize Winner: Month {selectedMemberProfile.payoutMonth}</p>
                    <p className="text-[11px] text-purple-700">
                      Disbursed: {formatINR(selectedMemberProfile.payoutAmountRupees)} • Voucher: {selectedMemberProfile.payoutDetails?.voucherNumber}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 20 Months Ledger Matrix */}
            <div className="space-y-2">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">
                20-Month Payment History (20 மாத தவணை விபரம்)
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Month</th>
                      <th className="py-2 px-3 text-right">Expected (₹)</th>
                      <th className="py-2 px-3 text-right">Paid (₹)</th>
                      <th className="py-2 px-3 text-right">Pending (₹)</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {selectedMemberProfile.monthlyLedger.map((row) => (
                      <tr key={row.month} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-slate-800">Month {row.month}</td>
                        <td className="py-2 px-3 text-right text-slate-600">{formatINR(row.expectedRupees)}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">{formatINR(row.paidRupees)}</td>
                        <td className="py-2 px-3 text-right font-bold text-rose-600">{formatINR(row.pendingRupees)}</td>
                        <td className="py-2 px-3 text-center font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              row.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.status === 'PARTIAL'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: DEDICATED MEMBER PAYMENT REPORT MODAL (Direct access from Collections/Members) */}
      {isMemberReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Member Payment Statement (உறுப்பினர் தவணை அறிக்கை)
                  </h3>
                  {memberReportModalData?.member && (
                    <p className="text-xs text-slate-500 font-mono">
                      Slot {String(memberReportModalData.member.memberNumber).padStart(2, '0')} • {memberReportModalData.member.name} ({memberReportModalData.member.mobile})
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMemberReportModalOpen(false);
                  setMemberReportModalData(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingMemberModalReport ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Loading payment records...
              </div>
            ) : !memberReportModalData ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No payment history available for this member.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Filter and Actions Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="flex items-center space-x-2">
                    <label className="font-bold text-slate-700">Filter Month:</label>
                    <select
                      value={memberModalMonthFilter}
                      onChange={(e) => handleModalMonthFilterChange(e.target.value)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 bg-white"
                    >
                      <option value="ALL">All Months (அனைத்து தவணைகளும்)</option>
                      {Array.from({ length: memberReportModalData.group?.durationMonths || 20 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          Month {m} (தவணை {m})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => exportMemberPaymentCSV(memberReportModalData)}
                      className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer shadow-sm"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                  </div>
                </div>

                {/* Summary KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-500 uppercase font-sans">Total Expected</p>
                    <p className="text-sm font-bold text-slate-900">{formatINR(memberReportModalData.summary?.totalExpectedRupees)}</p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <p className="text-[10px] text-emerald-700 uppercase font-sans">Total Received</p>
                    <p className="text-sm font-bold text-emerald-800">{formatINR(memberReportModalData.summary?.totalReceivedRupees)}</p>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                    <p className="text-[10px] text-rose-700 uppercase font-sans">Balance Pending</p>
                    <p className="text-sm font-bold text-rose-800">{formatINR(memberReportModalData.summary?.totalBalanceRupees)}</p>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                    <p className="text-[10px] text-indigo-700 uppercase font-sans">Status & Receipts</p>
                    <div className="flex items-center space-x-1 mt-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        memberReportModalData.summary?.status === 'PAID' ? 'bg-emerald-200 text-emerald-900' :
                        memberReportModalData.summary?.status === 'PARTIAL' ? 'bg-amber-200 text-amber-900' : 'bg-rose-200 text-rose-900'
                      }`}>
                        {memberReportModalData.summary?.status}
                      </span>
                      <span className="text-[11px] text-slate-600 font-sans">({memberReportModalData.summary?.totalPaymentsCount || 0} Receipts)</span>
                    </div>
                  </div>
                </div>

                {/* Detailed Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs min-w-[650px]">
                    <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Month</th>
                        <th className="py-2.5 px-3 text-right">Expected (₹)</th>
                        <th className="py-2.5 px-3 text-right">Total Received (₹)</th>
                        <th className="py-2.5 px-3 text-right">Balance (₹)</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3">Partial Payments Breakdown</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {memberReportModalData.monthBreakdown?.map((m) => (
                        <tr key={m.month} className="hover:bg-slate-50/80 align-top">
                          <td className="py-3 px-3 font-bold text-slate-900">
                            Month {m.month}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-800">
                            {formatINR(m.expectedRupees)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-700">
                            {formatINR(m.receivedRupees)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-rose-600">
                            {formatINR(m.balanceRupees)}
                          </td>
                          <td className="py-3 px-3 text-center font-sans">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              m.status === 'PAID' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                              m.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                              'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {m.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-sans">
                            {m.payments && m.payments.length > 0 ? (
                              <div className="space-y-1.5">
                                {m.payments.map((p, pIdx) => (
                                  <div key={p._id || pIdx} className="bg-slate-50 p-2 rounded border border-slate-200 text-[11px] font-mono space-y-0.5">
                                    <div className="flex justify-between items-center text-slate-800 font-bold">
                                      <span className="text-blue-700">{p.receiptNumber}</span>
                                      <span className="text-emerald-700 font-bold">{formatINR(p.amountPaidRupees)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-500 text-[10px]">
                                      <span>{formatDate(p.paymentDate)} • {p.paymentMethod}</span>
                                      {p.recordedBy && <span>By: {p.recordedBy}</span>}
                                    </div>
                                    {p.notes && (
                                      <div className="text-[10px] text-slate-600 italic">
                                        Note: {p.notes}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">No payment recorded</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
