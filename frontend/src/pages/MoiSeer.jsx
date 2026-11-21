import React, { useState, useEffect } from 'react';
import {
  Gift,
  Coins,
  Package,
  Users,
  Calendar,
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  Eye,
  X,
  CheckCircle,
  AlertCircle,
  MapPin,
  ChevronLeft,
  ChevronRight,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { formatINR, formatDate, getMoiSeerBadge } from '../utils/formatters';
import api from '../api';

export default function MoiSeer() {
  const [activeTab, setActiveTab] = useState('records'); // 'records' | 'entry' | 'persons' | 'reports'

  // Summary Metrics State
  const [summary, setSummary] = useState({
    totalContributors: 0,
    totalMoneyRupees: 0,
    totalMaterialEntries: 0,
    totalContributionRecords: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Contributions List State
  const [contributions, setContributions] = useState([]);
  const [totalContributions, setTotalContributions] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [recordsLoading, setRecordsLoading] = useState(true);

  // Filters State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [districtFilter, setDistrictFilter] = useState('ALL');
  const [villageFilter, setVillageFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Dropdown Lookups State
  const [districtsList, setDistrictsList] = useState([]);
  const [villagesList, setVillagesList] = useState([]);
  const [materialsList, setMaterialsList] = useState([]);

  // Persons List State
  const [persons, setPersons] = useState([]);
  const [personSearch, setPersonSearch] = useState('');
  const [debouncedPersonSearch, setDebouncedPersonSearch] = useState('');
  const [personsLoading, setPersonsLoading] = useState(false);

  // Debounce search inputs
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPersonSearch(personSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [personSearch]);

  // Entry Form State
  const [entryPersonId, setEntryPersonId] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryDistrict, setEntryDistrict] = useState('');
  const [entryVillage, setEntryVillage] = useState('');
  const [entryItems, setEntryItems] = useState([
    { contributionType: 'MONEY', amount: '', materialName: '', quantity: '', description: '' },
  ]);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entrySuccess, setEntrySuccess] = useState('');
  const [entryError, setEntryError] = useState('');

  // Modals
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [personFormName, setPersonFormName] = useState('');
  const [personFormDistrict, setPersonFormDistrict] = useState('');
  const [personFormVillage, setPersonFormVillage] = useState('');
  const [personFormNotes, setPersonFormNotes] = useState('');
  const [personSubmitting, setPersonSubmitting] = useState(false);
  const [personModalError, setPersonModalError] = useState('');

  const [editingPerson, setEditingPerson] = useState(null);
  const [viewingPerson, setViewingPerson] = useState(null);
  const [editingContribution, setEditingContribution] = useState(null);
  const [deletingContribution, setDeletingContribution] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Reports Sub-Tab State
  const [reportType, setReportType] = useState('daily'); // 'daily' | 'date-wise' | 'district-wise' | 'village-wise' | 'material-wise' | 'person-wise'
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportStartDate, setReportStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Load Lookups (Districts, Villages, Materials)
  const fetchLookups = async () => {
    try {
      const [locRes, matRes] = await Promise.all([
        api.get('/moi-seer/locations'),
        api.get('/moi-seer/materials'),
      ]);
      if (locRes.data.success) {
        setDistrictsList(locRes.data.districts);
        setVillagesList(locRes.data.villages);
      }
      if (matRes.data.success) {
        setMaterialsList(matRes.data.materials);
      }
    } catch (err) {
      console.error('Failed to load lookups', err);
    }
  };

  // Load Dashboard Summary
  const fetchSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await api.get('/moi-seer/summary', {
        params: {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          district: districtFilter !== 'ALL' ? districtFilter : undefined,
          village: villageFilter !== 'ALL' ? villageFilter : undefined,
        },
      });
      if (res.data.success) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.error('Failed to load summary', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Load Contributions
  const fetchContributions = async () => {
    setRecordsLoading(true);
    try {
      const res = await api.get('/moi-seer/contributions', {
        params: {
          search: debouncedSearch.trim() || undefined,
          type: typeFilter !== 'ALL' ? typeFilter : undefined,
          district: districtFilter !== 'ALL' ? districtFilter : undefined,
          village: villageFilter !== 'ALL' ? villageFilter : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          page: currentPage,
          limit: 25,
        },
      });
      if (res.data.success) {
        setContributions(res.data.contributions);
        setTotalContributions(res.data.total);
        setTotalPages(res.data.totalPages);
      }
    } catch (err) {
      console.error('Failed to load contributions', err);
    } finally {
      setRecordsLoading(false);
    }
  };

  // Load Persons Directory
  const fetchPersons = async () => {
    setPersonsLoading(true);
    try {
      const res = await api.get('/moi-seer/persons', {
        params: {
          search: debouncedPersonSearch.trim() || undefined,
          limit: 100,
        },
      });
      if (res.data.success) {
        setPersons(res.data.persons);
      }
    } catch (err) {
      console.error('Failed to load persons', err);
    } finally {
      setPersonsLoading(false);
    }
  };

  // Load Reports
  const fetchReport = async () => {
    setReportLoading(true);
    try {
      const params = { reportType };
      if (reportType === 'daily') {
        params.date = reportDate;
      } else if (reportType === 'date-wise') {
        params.startDate = reportStartDate;
        params.endDate = reportEndDate;
      }
      const res = await api.get('/moi-seer/reports', { params });
      if (res.data.success) {
        setReportData(res.data);
      }
    } catch (err) {
      console.error('Failed to load report', err);
    } finally {
      setReportLoading(false);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchLookups();
    fetchPersons();
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchContributions();
  }, [debouncedSearch, typeFilter, districtFilter, villageFilter, startDate, endDate, currentPage]);

  useEffect(() => {
    if (activeTab === 'persons') {
      fetchPersons();
    }
  }, [debouncedPersonSearch]);

  useEffect(() => {
    if (activeTab === 'persons') {
      fetchPersons();
    } else if (activeTab === 'reports') {
      fetchReport();
    }
  }, [activeTab, reportType, reportDate, reportStartDate, reportEndDate]);

  // Handle Person selection in Entry Form
  const handleSelectPersonForEntry = (pId) => {
    setEntryPersonId(pId);
    const found = persons.find((p) => p._id === pId);
    if (found) {
      setEntryDistrict(found.district);
      setEntryVillage(found.village);
    }
  };

  // Entry Form Multi-Item management
  const handleAddItem = (type = 'MONEY') => {
    setEntryItems([
      ...entryItems,
      { contributionType: type, amount: '', materialName: '', quantity: '', description: '' },
    ]);
  };

  const handleRemoveItem = (index) => {
    if (entryItems.length === 1) return;
    setEntryItems(entryItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...entryItems];
    updated[index][field] = value;
    setEntryItems(updated);
  };

  // Submit Contributions
  const handleRecordSubmit = async (e) => {
    e.preventDefault();
    setEntryError('');
    setEntrySuccess('');

    if (!entryPersonId) {
      setEntryError('தயவுசெய்து நபரைத் தேர்ந்தெடுக்கவும் (Please select a person).');
      return;
    }

    // Validate items
    for (let i = 0; i < entryItems.length; i++) {
      const it = entryItems[i];
      if (it.contributionType === 'MONEY') {
        if (!it.amount || Number(it.amount) <= 0) {
          setEntryError(`பொருள் வரிசை #${i + 1}: சரியான தொகை (₹) உள்ளிடவும்.`);
          return;
        }
      } else {
        if (!it.materialName || !it.materialName.trim()) {
          setEntryError(`பொருள் வரிசை #${i + 1}: பொருளின் பெயர் உள்ளிடவும் (e.g. Silver Plate, Cooker).`);
          return;
        }
        if (!it.quantity || !String(it.quantity).trim()) {
          setEntryError(`பொருள் வரிசை #${i + 1}: அளவு / எண்ணிக்கை உள்ளிடவும் (e.g. 2, 5 Kg).`);
          return;
        }
      }
    }

    setEntrySubmitting(true);
    try {
      const res = await api.post('/moi-seer/contributions', {
        personId: entryPersonId,
        contributionDate: entryDate,
        district: entryDistrict,
        village: entryVillage,
        items: entryItems,
      });

      if (res.data.success) {
        setEntrySuccess(`${entryItems.length} பதிவு(கள்) வெற்றிகரமாக சேர்க்கப்பட்டது!`);
        // Reset items
        setEntryItems([
          { contributionType: 'MONEY', amount: '', materialName: '', quantity: '', description: '' },
        ]);
        fetchSummary();
        fetchContributions();
        fetchLookups();
        fetchPersons();
      }
    } catch (err) {
      setEntryError(err.response?.data?.message || err.message || 'பதிவு சேமிப்பதில் பிழை ஏற்பட்டது.');
    } finally {
      setEntrySubmitting(false);
    }
  };

  // Create Person Modal submit
  const handleCreatePerson = async (e) => {
    e.preventDefault();
    setPersonModalError('');
    setPersonSubmitting(true);
    try {
      const res = await api.post('/moi-seer/persons', {
        name: personFormName,
        district: personFormDistrict,
        village: personFormVillage,
        notes: personFormNotes,
      });
      if (res.data.success) {
        setIsPersonModalOpen(false);
        setPersonFormName('');
        setPersonFormDistrict('');
        setPersonFormVillage('');
        setPersonFormNotes('');
        await fetchPersons();
        await fetchLookups();
        // Auto-select for entry
        if (res.data.person) {
          setEntryPersonId(res.data.person._id);
          setEntryDistrict(res.data.person.district);
          setEntryVillage(res.data.person.village);
        }
      }
    } catch (err) {
      setPersonModalError(err.response?.data?.message || err.message || 'நபர் பதிவு செய்வதில் பிழை');
    } finally {
      setPersonSubmitting(false);
    }
  };

  // Update Person submit
  const handleUpdatePerson = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await api.put(`/moi-seer/persons/${editingPerson._id}`, {
        name: editingPerson.name,
        district: editingPerson.district,
        village: editingPerson.village,
        notes: editingPerson.notes,
      });
      if (res.data.success) {
        setEditingPerson(null);
        fetchPersons();
        fetchContributions();
        fetchLookups();
      }
    } catch (err) {
      alert('Update failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // View Person details + history
  const handleViewPerson = async (person) => {
    try {
      const res = await api.get(`/moi-seer/persons/${person._id}`);
      if (res.data.success) {
        setViewingPerson(res.data);
      }
    } catch (err) {
      alert('Failed to load person history: ' + err.message);
    }
  };

  // Edit Contribution submit
  const handleUpdateContribution = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await api.put(`/moi-seer/contributions/${editingContribution._id}`, {
        contributionDate: editingContribution.contributionDate,
        district: editingContribution.district,
        village: editingContribution.village,
        contributionType: editingContribution.contributionType,
        amount: editingContribution.amountRupees,
        materialName: editingContribution.materialName,
        quantity: editingContribution.quantity,
        description: editingContribution.description,
      });
      if (res.data.success) {
        setEditingContribution(null);
        fetchSummary();
        fetchContributions();
        fetchPersons();
      }
    } catch (err) {
      alert('Failed to update contribution: ' + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Contribution submit
  const handleDeleteContribution = async () => {
    if (!deletingContribution) return;
    setActionLoading(true);
    try {
      const res = await api.delete(`/moi-seer/contributions/${deletingContribution._id}`, {
        data: { reason: deleteReason || 'User confirmed deletion' },
      });
      if (res.data.success) {
        setDeletingContribution(null);
        setDeleteReason('');
        fetchSummary();
        fetchContributions();
        fetchPersons();
      }
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 sm:p-6 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl shrink-0">
              <Gift className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center space-x-2">
                <span>மொய் / சீர்</span>
                <span className="text-slate-400 font-normal text-xs sm:text-sm font-sans">(Moi / Seer Register)</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                டிஜிட்டல் மொய் & சீர் பதிவேடு • Independent Record Management System
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('entry')}
            className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md shadow-amber-500/20 flex items-center justify-center space-x-1.5 cursor-pointer min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>+ பதிவு சேர்க்க (Add Entry)</span>
          </button>
          <button
            onClick={() => setIsPersonModalOpen(true)}
            className="w-full sm:w-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg transition-all border border-slate-700 flex items-center justify-center space-x-1.5 cursor-pointer min-h-[40px]"
          >
            <Users className="w-4 h-4 text-blue-400" />
            <span>+ புதிய நபர் (New Person)</span>
          </button>
        </div>
      </div>

      {/* Top 4 Dashboard Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Total Contributors */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">மொத்த நபர்கள்</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-slate-900 font-mono truncate">
            {summaryLoading ? '...' : summary.totalContributors}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">Unique Registered People</div>
        </div>

        {/* Card 2: Total Money Received */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-emerald-800 truncate">மொய் பணம்</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base sm:text-xl font-bold text-emerald-700 font-mono truncate">
            {summaryLoading ? '...' : formatINR(summary.totalMoneyRupees)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-emerald-600 font-medium mt-1 truncate">Total Cash Contributed</div>
        </div>

        {/* Card 3: Total Material Entries */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-purple-800 truncate">சீர் பொருட்கள்</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-purple-50 text-purple-600 shrink-0">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-purple-900 font-mono truncate">
            {summaryLoading ? '...' : summary.totalMaterialEntries}
          </div>
          <div className="text-[10px] sm:text-[11px] text-purple-600 font-medium mt-1 truncate">Articles / Gifts Received</div>
        </div>

        {/* Card 4: Total Contribution Records */}
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-all min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">மொத்த பதிவுகள்</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-indigo-900 font-mono truncate">
            {summaryLoading ? '...' : summary.totalContributionRecords}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">All Logged Transactions</div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
        {[
          { id: 'records', label: 'அனைத்து பதிவுகள் (All Records)', icon: FileText },
          { id: 'entry', label: 'பதிவு செய்க (Record Contribution)', icon: Plus },
          { id: 'persons', label: 'நபர்கள் பட்டியல் (Persons Directory)', icon: Users },
          { id: 'reports', label: 'அறிக்கைகள் (Reports)', icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ALL RECORDS */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {/* Search and Filters Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 text-xs">
            {/* Top row: search + type */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by Person name, Material, Village, District..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-semibold"
              >
                <option value="ALL">அனைத்து வகைகள் (All Types)</option>
                <option value="MONEY">பணம் மட்டும் (Money Only)</option>
                <option value="MATERIAL">பொருட்கள் மட்டும் (Material Only)</option>
              </select>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setSearch('');
                    setTypeFilter('ALL');
                    setDistrictFilter('ALL');
                    setVillageFilter('ALL');
                    setStartDate('');
                    setEndDate('');
                    setCurrentPage(1);
                  }}
                  className="w-full py-2 px-3 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-100 font-semibold flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              </div>
            </div>

            {/* Bottom row: district, village, date range */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">மாவட்டம் (District)</label>
                <select
                  value={districtFilter}
                  onChange={(e) => {
                    setDistrictFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700"
                >
                  <option value="ALL">அனைத்து மாவட்டங்கள் (All)</option>
                  {districtsList.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">ஊர் (Village)</label>
                <select
                  value={villageFilter}
                  onChange={(e) => {
                    setVillageFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700"
                >
                  <option value="ALL">அனைத்து ஊர்கள் (All)</option>
                  {villagesList.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">தேதி முதல் (From Date)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">தேதி வரை (To Date)</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 text-slate-700"
                />
              </div>
            </div>
          </div>

          {/* Main Records Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                பதிவேடு (Records: {totalContributions})
              </span>
              <span className="text-[11px] text-slate-500 font-mono">Newest First</span>
            </div>

            {recordsLoading ? (
              <div className="p-12 text-center text-xs text-slate-500">Loading Moi / Seer contributions...</div>
            ) : contributions.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Gift className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500">பதிவுகள் எதுவும் இல்லை (No records match the filter criteria).</p>
                <button
                  onClick={() => setActiveTab('entry')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  + புதிய பதிவு சேர்க்க (Add First Entry)
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[720px]">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-semibold">தேதி (Date)</th>
                      <th className="py-3 px-4 font-semibold">நபர் பெயர் (Person Name)</th>
                      <th className="py-3 px-3 font-semibold">மாவட்டம் (District)</th>
                      <th className="py-3 px-3 font-semibold">ஊர் (Village)</th>
                      <th className="py-3 px-3 font-semibold">வகை (Type)</th>
                      <th className="py-3 px-3 font-semibold">தொகை / பொருள் (Amount / Material)</th>
                      <th className="py-3 px-3 font-semibold">அளவு & குறிப்பு (Qty / Notes)</th>
                      <th className="py-3 px-4 text-right font-semibold">செயல்கள் (Actions)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contributions.map((c) => {
                      const badge = getMoiSeerBadge(c.contributionType);
                      const isMoney = c.contributionType === 'MONEY';
                      return (
                        <tr key={c._id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                            {formatDate(c.contributionDate)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 block">{c.personName}</span>
                            <span className="font-mono text-[10px] text-blue-700">{c.personCode}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-700 font-medium">{c.district}</td>
                          <td className="py-3 px-3 text-slate-700 font-medium">{c.village}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {isMoney ? (
                              <span className="font-mono font-bold text-sm text-emerald-700">
                                {formatINR(c.amountRupees)}
                              </span>
                            ) : (
                              <span className="font-bold text-slate-900 flex items-center space-x-1">
                                <Package className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                <span>{c.materialName}</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600 max-w-xs">
                            {c.quantity && (
                              <span className="font-mono font-semibold text-slate-800 block text-[11px]">
                                அளவு: {c.quantity}
                              </span>
                            )}
                            {c.description && <span className="text-[11px] text-slate-500 italic">{c.description}</span>}
                            {!c.quantity && !c.description && '—'}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => setEditingContribution({ ...c })}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                                title="Edit Record"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeletingContribution(c)}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                title="Delete Record"
                              >
                                <Trash2 className="w-4 h-4" />
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs bg-slate-50/50">
                <span className="text-slate-500">
                  Showing Page <strong className="text-slate-900">{currentPage}</strong> of{' '}
                  <strong className="text-slate-900">{totalPages}</strong>
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-white disabled:opacity-40 cursor-pointer flex items-center space-x-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-white disabled:opacity-40 cursor-pointer flex items-center space-x-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RECORD CONTRIBUTION FORM */}
      {activeTab === 'entry' && (
        <div className="max-w-3xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-amber-500" />
                <span>மொய் / சீர் புதிய பதிவு (New Contribution Entry)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record money or material gifts from contributors with instant automatic ledger update
              </p>
            </div>
            <button
              onClick={() => setIsPersonModalOpen(true)}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg text-xs border border-blue-200 transition-colors"
            >
              + புதிய நபர் (New Person)
            </button>
          </div>

          {entrySuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{entrySuccess}</span>
            </div>
          )}

          {entryError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{entryError}</span>
            </div>
          )}

          <form onSubmit={handleRecordSubmit} className="space-y-5 text-xs">
            {/* Person Selector */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">நபர் தேர்வு (Select Person) *</label>
              <select
                required
                value={entryPersonId}
                onChange={(e) => handleSelectPersonForEntry(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium bg-white focus:ring-2 focus:ring-blue-500 shadow-xs"
              >
                <option value="">-- நபரைத் தேர்ந்தெடுக்கவும் (Choose Person) --</option>
                {persons.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.personId}) - {p.village}, {p.district}
                  </option>
                ))}
              </select>
            </div>

            {/* Date and Location row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">தேதி (Date) *</label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">மாவட்டம் (District) *</label>
                <input
                  type="text"
                  required
                  value={entryDistrict}
                  onChange={(e) => setEntryDistrict(e.target.value)}
                  placeholder="e.g. Salem"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ஊர் (Village) *</label>
                <input
                  type="text"
                  required
                  value={entryVillage}
                  onChange={(e) => setEntryVillage(e.target.value)}
                  placeholder="e.g. Omalur"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>
            </div>

            {/* Contribution Items List */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  பங்களிப்புகள் / சீர் விவரம் (Contributions List)
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleAddItem('MONEY')}
                    className="px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded text-[11px] font-bold cursor-pointer"
                  >
                    + பணம் (Add Money)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddItem('MATERIAL')}
                    className="px-2.5 py-1 bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200 rounded text-[11px] font-bold cursor-pointer"
                  >
                    + பொருள் (Add Material)
                  </button>
                </div>
              </div>

              {entryItems.map((item, idx) => {
                const isMoney = item.contributionType === 'MONEY';
                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border space-y-3 transition-all ${
                      isMoney ? 'bg-emerald-50/30 border-emerald-200' : 'bg-purple-50/30 border-purple-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-700 text-xs">வரிசை #{idx + 1}</span>
                        <div className="flex rounded-md shadow-xs" role="group">
                          <button
                            type="button"
                            onClick={() => handleItemChange(idx, 'contributionType', 'MONEY')}
                            className={`px-3 py-1 text-xs font-bold rounded-l-md border ${
                              isMoney
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            பணம் (Money)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleItemChange(idx, 'contributionType', 'MATERIAL')}
                            className={`px-3 py-1 text-xs font-bold rounded-r-md border-t border-b border-r ${
                              !isMoney
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            பொருள் (Material)
                          </button>
                        </div>
                      </div>

                      {entryItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-rose-600 hover:text-rose-800 text-xs font-semibold cursor-pointer"
                        >
                          நீக்கு (Remove)
                        </button>
                      )}
                    </div>

                    {isMoney ? (
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">தொகை (Amount in ₹) *</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 font-bold text-slate-400">₹</span>
                          <input
                            type="number"
                            required
                            min="1"
                            step="1"
                            placeholder="e.g. 2000"
                            value={item.amount}
                            onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-sm text-slate-900 bg-white"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">பொருளின் பெயர் (Material Name) *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Silver Plate, Cooker, 1 Gold Coin"
                            value={item.materialName}
                            onChange={(e) => handleItemChange(idx, 'materialName', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">அளவு / எண்ணிக்கை (Quantity) *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 2 Plates, 5 Kg, 1 Piece"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        கூடுதல் குறிப்பு (Optional Description / Notes)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Marriage gift, 5 sovereigns, Prestige brand"
                        value={item.description}
                        onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-800 bg-white"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setEntryPersonId('');
                  setEntryItems([
                    { contributionType: 'MONEY', amount: '', materialName: '', quantity: '', description: '' },
                  ]);
                  setEntryError('');
                  setEntrySuccess('');
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
              >
                Clear Form
              </button>
              <button
                type="submit"
                disabled={entrySubmitting}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-bold rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {entrySubmitting ? 'சேமிக்கப்படுகிறது...' : 'பதிவு செய்க (Confirm & Save)'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: PERSONS DIRECTORY */}
      {activeTab === 'persons' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search person by Name, ID, Village, or District..."
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setIsPersonModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>புதிய நபர் பதிவு (Register Person)</span>
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {personsLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading persons directory...</div>
            ) : persons.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No persons found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[720px]">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Person ID</th>
                      <th className="py-3 px-4 font-semibold">நபர் பெயர் (Full Name)</th>
                      <th className="py-3 px-3 font-semibold">மாவட்டம் (District)</th>
                      <th className="py-3 px-3 font-semibold">ஊர் (Village)</th>
                      <th className="py-3 px-3 font-semibold text-right">மொத்த பணம் (Money)</th>
                      <th className="py-3 px-3 font-semibold text-center">பொருட்கள் (Materials)</th>
                      <th className="py-3 px-3 font-semibold text-center">பதிவுகள் (Total)</th>
                      <th className="py-3 px-4 text-right font-semibold">செயல்கள் (Actions)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {persons.map((p) => (
                      <tr key={p._id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">{p.personId}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{p.name}</td>
                        <td className="py-3 px-3 text-slate-700">{p.district}</td>
                        <td className="py-3 px-3 text-slate-700">{p.village}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">
                          {formatINR(p.totalMoneyRupees)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700">
                            {p.totalMaterialCount || 0}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-800">
                          {p.totalContributionsCount || 0}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => handleViewPerson(p)}
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded font-semibold text-[11px] flex items-center space-x-1"
                              title="View History"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>வரலாறு (View)</span>
                            </button>
                            <button
                              onClick={() => setEditingPerson({ ...p })}
                              className="p-1 text-slate-500 hover:text-slate-900 rounded"
                              title="Edit Person"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* TAB 4: REPORTS INSIDE MOI / SEER MODULE */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Sub-Tabs for the 6 Reports */}
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {[
              { id: 'daily', label: '1. தினசரி அறிக்கை (Daily Report)' },
              { id: 'date-wise', label: '2. தேதி வாரியான அறிக்கை (Date-wise)' },
              { id: 'district-wise', label: '3. மாவட்ட அறிக்கை (District-wise)' },
              { id: 'village-wise', label: '4. ஊர் அறிக்கை (Village-wise)' },
              { id: 'material-wise', label: '5. பொருள் அறிக்கை (Material-wise)' },
              { id: 'person-wise', label: '6. நபர் அறிக்கை (Person-wise)' },
            ].map((sub) => (
              <button
                key={sub.id}
                onClick={() => setReportType(sub.id)}
                className={`px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                  reportType === sub.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {/* Date Selector toolbar for Daily or Date-wise */}
          {(reportType === 'daily' || reportType === 'date-wise') && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4 text-xs">
              {reportType === 'daily' && (
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-slate-700">தேதி தேர்வு (Select Date):</span>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              )}

              {reportType === 'date-wise' && (
                <div className="flex items-center space-x-3">
                  <span className="font-semibold text-slate-700">ஆரம்ப தேதி (From):</span>
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                  />
                  <span className="font-semibold text-slate-700">முடிவு தேதி (To):</span>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              )}
            </div>
          )}

          {/* Report Display Container */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            {reportLoading ? (
              <div className="p-12 text-center text-xs text-slate-500">Generating report...</div>
            ) : !reportData ? (
              <div className="p-12 text-center text-xs text-slate-500">No report data found.</div>
            ) : (
              <>
                {/* REPORT A: DAILY REPORT */}
                {reportType === 'daily' && (
                  <div className="space-y-6 text-xs">
                    <div className="border-b border-slate-200 pb-3">
                      <h4 className="font-bold text-sm text-slate-900">
                        தினசரி மொய் / சீர் அறிக்கை – {formatDate(reportData.reportDate)}
                      </h4>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-blue-900">
                        <span className="text-[10px] text-blue-700 font-sans block">பதிவான நபர்கள்</span>
                        <span className="text-xl font-bold">{reportData.summary?.peopleRecordedToday || 0}</span>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-emerald-900">
                        <span className="text-[10px] text-emerald-700 font-sans block">பெறப்பட்ட மொய் பணம்</span>
                        <span className="text-xl font-bold">
                          {formatINR(reportData.summary?.moneyReceivedRupees || 0)}
                        </span>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg border border-purple-200 text-purple-900">
                        <span className="text-[10px] text-purple-700 font-sans block">சீர் பொருட்கள் எண்ணிக்கை</span>
                        <span className="text-xl font-bold">{reportData.summary?.materialsReceivedCount || 0}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-900">
                        <span className="text-[10px] text-slate-500 font-sans block">மொத்த பதிவுகள்</span>
                        <span className="text-xl font-bold">{reportData.summary?.totalRecordsToday || 0}</span>
                      </div>
                    </div>

                    <div>
                      <h5 className="font-bold text-slate-800 mb-2">அன்றைய பங்களிப்புகள் பட்டியல் (Today's List)</h5>
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-left min-w-[550px]">
                          <thead className="bg-slate-100 text-slate-700">
                            <tr>
                              <th className="py-2.5 px-3">Person Name</th>
                              <th className="py-2.5 px-3">Village</th>
                              <th className="py-2.5 px-3">District</th>
                              <th className="py-2.5 px-3">Type</th>
                              <th className="py-2.5 px-3">Details / Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {reportData.contributions?.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-slate-400">
                                  அன்றைய தினத்தில் பதிவுகள் இல்லை.
                                </td>
                              </tr>
                            ) : (
                              reportData.contributions?.map((c) => (
                                <tr key={c._id}>
                                  <td className="py-2.5 px-3 font-bold text-slate-900">{c.personName}</td>
                                  <td className="py-2.5 px-3">{c.village}</td>
                                  <td className="py-2.5 px-3">{c.district}</td>
                                  <td className="py-2.5 px-3 font-semibold">{c.contributionType}</td>
                                  <td className="py-2.5 px-3 font-mono font-bold">
                                    {c.contributionType === 'MONEY'
                                      ? formatINR(c.amountRupees)
                                      : `${c.materialName} (${c.quantity})`}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* REPORT B: DATE-WISE REPORT */}
                {reportType === 'date-wise' && (
                  <div className="space-y-6 text-xs">
                    <div className="border-b border-slate-200 pb-3">
                      <h4 className="font-bold text-sm text-slate-900">
                        தேதி வாரியான அறிக்கை ({formatDate(reportData.startDate)} முதல் {formatDate(reportData.endDate)})
                      </h4>
                    </div>

                    <div className="grid grid-cols-3 gap-3 font-mono text-center">
                      <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-emerald-900">
                        <span className="text-[10px] text-emerald-700 font-sans block">மொத்த மொய் பணம்</span>
                        <span className="text-xl font-bold">
                          {formatINR(reportData.summary?.totalMoneyRupees || 0)}
                        </span>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg border border-purple-200 text-purple-900">
                        <span className="text-[10px] text-purple-700 font-sans block">மொத்த பொருட்கள்</span>
                        <span className="text-xl font-bold">{reportData.summary?.totalMaterialEntries || 0}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-900">
                        <span className="text-[10px] text-slate-500 font-sans block">மொத்த பதிவுகள்</span>
                        <span className="text-xl font-bold">{reportData.summary?.totalRecords || 0}</span>
                      </div>
                    </div>

                    {/* Material Breakdown */}
                    {reportData.summary?.materialWiseSummary?.length > 0 && (
                      <div>
                        <h5 className="font-bold text-slate-800 mb-2">பொருள் வாரியான சுருக்கம் (Material Summary)</h5>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-left min-w-[550px]">
                            <thead className="bg-slate-100 text-slate-700">
                              <tr>
                                <th className="py-2.5 px-3">பொருளின் பெயர் (Material)</th>
                                <th className="py-2.5 px-3 text-center">எண்ணிக்கை (Entries)</th>
                                <th className="py-2.5 px-3 text-center">நபர்கள் (Contributors)</th>
                                <th className="py-2.5 px-3">பதிவான அளவுகள் (Quantities)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {reportData.summary.materialWiseSummary.map((m, idx) => (
                                <tr key={idx}>
                                  <td className="py-2 px-3 font-bold text-slate-900">{m.materialName}</td>
                                  <td className="py-2 px-3 text-center font-bold text-purple-700">{m.totalEntries}</td>
                                  <td className="py-2 px-3 text-center">{m.contributorCount}</td>
                                  <td className="py-2 px-3 font-mono text-slate-600">{m.quantitiesRecorded}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* REPORT C: DISTRICT-WISE REPORT */}
                {reportType === 'district-wise' && (
                  <div className="space-y-4 text-xs">
                    <h4 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-3">
                      மாவட்ட வாரியான அறிக்கை (District-wise Breakdown)
                    </h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="py-2.5 px-3">மாவட்டம் (District)</th>
                            <th className="py-2.5 px-3 text-center">பங்களிப்பாளர்கள் (Contributors)</th>
                            <th className="py-2.5 px-3 text-right">மொத்த பணம் (Total Money)</th>
                            <th className="py-2.5 px-3 text-center">பொருட்கள் எண்ணிக்கை (Materials)</th>
                            <th className="py-2.5 px-3">பொருட்கள் விவரம் (Material Gifts)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reportData.districts?.map((d, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-bold text-slate-900">{d.district}</td>
                              <td className="py-2.5 px-3 text-center font-bold">{d.totalContributors}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                                {formatINR(d.totalMoneyRupees)}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-purple-700">
                                {d.materialEntriesCount}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                {d.materialsList?.length > 0
                                  ? d.materialsList.map((m) => `${m.name} (${m.qty})`).join(', ')
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* REPORT D: VILLAGE-WISE REPORT */}
                {reportType === 'village-wise' && (
                  <div className="space-y-4 text-xs">
                    <h4 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-3">
                      ஊர் வாரியான அறிக்கை (Village-wise Breakdown)
                    </h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="py-2.5 px-3">ஊர் (Village)</th>
                            <th className="py-2.5 px-3">மாவட்டம் (District)</th>
                            <th className="py-2.5 px-3 text-center">பங்களிப்பாளர்கள் (Contributors)</th>
                            <th className="py-2.5 px-3 text-right">மொத்த பணம் (Total Money)</th>
                            <th className="py-2.5 px-3 text-center">பொருட்கள் (Materials)</th>
                            <th className="py-2.5 px-3">பொருட்கள் விவரம் (Material Details)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reportData.villages?.map((v, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-bold text-slate-900">{v.village}</td>
                              <td className="py-2.5 px-3 text-slate-700">{v.district}</td>
                              <td className="py-2.5 px-3 text-center font-bold">{v.totalContributors}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                                {formatINR(v.totalMoneyRupees)}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-purple-700">
                                {v.materialEntriesCount}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                {v.materialsList?.length > 0
                                  ? v.materialsList.map((m) => `${m.name} (${m.qty})`).join(', ')
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* REPORT E: MATERIAL-WISE REPORT */}
                {reportType === 'material-wise' && (
                  <div className="space-y-4 text-xs">
                    <h4 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-3">
                      பொருள் வாரியான அறிக்கை (Material-wise Breakdown)
                    </h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left min-w-[550px]">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="py-2.5 px-3">பொருளின் பெயர் (Material)</th>
                            <th className="py-2.5 px-3 text-center">மொத்த பதிவுகள் (Total Count)</th>
                            <th className="py-2.5 px-3 text-center">வழங்கிய நபர்கள் (Contributors)</th>
                            <th className="py-2.5 px-3">நபர்கள் பெயர் பட்டியல் (List of Contributors)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reportData.materials?.map((m, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-bold text-slate-900 flex items-center space-x-1.5">
                                <Package className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                <span>{m.materialName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold font-mono text-purple-700">
                                {m.totalEntries}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold font-mono">
                                {m.uniqueContributorsCount}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700 text-[11px]">
                                {m.contributorNames?.join(', ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* REPORT F: PERSON-WISE REPORT */}
                {reportType === 'person-wise' && (
                  <div className="space-y-4 text-xs">
                    <h4 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-3">
                      நபர் வாரியான அறிக்கை (Person-wise Contributions)
                    </h4>
                    <div className="space-y-3">
                      {reportData.persons?.map((p) => (
                        <div key={p.personId} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <div>
                              <span className="font-bold text-sm text-slate-950">{p.name}</span>
                              <span className="ml-2 font-mono text-blue-700 font-semibold">({p.personId})</span>
                              <p className="text-[11px] text-slate-500">
                                {p.village}, {p.district}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 uppercase block">Total Money</span>
                              <span className="font-mono font-bold text-base text-emerald-700">
                                {formatINR(p.totalMoneyRupees)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-[11px]">
                            {/* Money details */}
                            <div>
                              <span className="font-bold text-emerald-800 block mb-1">
                                பண பங்களிப்புகள் ({p.moneyContributions?.length || 0}):
                              </span>
                              {p.moneyContributions?.length === 0 ? (
                                <span className="text-slate-400">இல்லை</span>
                              ) : (
                                <ul className="space-y-0.5 font-mono">
                                  {p.moneyContributions?.map((mc, idx) => (
                                    <li key={idx} className="flex justify-between">
                                      <span className="text-slate-600">{formatDate(mc.date)}:</span>
                                      <span className="font-bold text-emerald-700">{formatINR(mc.amountRupees)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            {/* Material details */}
                            <div>
                              <span className="font-bold text-purple-800 block mb-1">
                                சீர் பொருட்கள் ({p.materialContributions?.length || 0}):
                              </span>
                              {p.materialContributions?.length === 0 ? (
                                <span className="text-slate-400">இல்லை</span>
                              ) : (
                                <ul className="space-y-0.5">
                                  {p.materialContributions?.map((mat, idx) => (
                                    <li key={idx} className="flex justify-between">
                                      <span className="text-slate-800 font-medium">
                                        {mat.materialName} ({mat.quantity})
                                      </span>
                                      <span className="text-slate-400 text-[10px]">{formatDate(mat.date)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTER NEW PERSON */}
      {isPersonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900 flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>புதிய நபர் பதிவு (Register Person)</span>
              </h3>
              <button onClick={() => setIsPersonModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {personModalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {personModalError}
              </div>
            )}

            <form onSubmit={handleCreatePerson} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">முழு பெயர் (Full Name) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. கந்தசாமி கவுண்டர்"
                  value={personFormName}
                  onChange={(e) => setPersonFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">மாவட்டம் (District) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Salem"
                    value={personFormDistrict}
                    onChange={(e) => setPersonFormDistrict(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ஊர் (Village) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Omalur"
                    value={personFormVillage}
                    onChange={(e) => setPersonFormVillage(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">குறிப்புகள் (Notes / Family Reference)</label>
                <input
                  type="text"
                  placeholder="e.g. Sambanthi family, Periyappa relation"
                  value={personFormNotes}
                  onChange={(e) => setPersonFormNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPersonModalOpen(false)}
                  className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold min-h-[38px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={personSubmitting}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 min-h-[38px] cursor-pointer"
                >
                  {personSubmitting ? 'பதிவாகிறது...' : 'Save Person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT PERSON */}
      {editingPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">நபர் விவரம் திருத்து (Edit Person)</h3>
                <p className="text-xs font-mono text-blue-700">{editingPerson.personId}</p>
              </div>
              <button onClick={() => setEditingPerson(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePerson} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">பெயர் (Name) *</label>
                <input
                  type="text"
                  required
                  value={editingPerson.name}
                  onChange={(e) => setEditingPerson({ ...editingPerson, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">மாவட்டம் (District) *</label>
                  <input
                    type="text"
                    required
                    value={editingPerson.district}
                    onChange={(e) => setEditingPerson({ ...editingPerson, district: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ஊர் (Village) *</label>
                  <input
                    type="text"
                    required
                    value={editingPerson.village}
                    onChange={(e) => setEditingPerson({ ...editingPerson, village: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">குறிப்புகள் (Notes)</label>
                <input
                  type="text"
                  value={editingPerson.notes || ''}
                  onChange={(e) => setEditingPerson({ ...editingPerson, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPerson(null)}
                  className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold min-h-[38px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 min-h-[38px] cursor-pointer"
                >
                  {actionLoading ? 'Updating...' : 'Update Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VIEW PERSON HISTORY */}
      {viewingPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900">{viewingPerson.person.name}</h3>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  {viewingPerson.person.personId} • {viewingPerson.person.village}, {viewingPerson.person.district}
                </p>
              </div>
              <button onClick={() => setViewingPerson(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Balances */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-center font-mono">
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-emerald-900">
                <span className="text-[10px] text-emerald-700 font-sans uppercase">மொத்த பணம் (Total Money)</span>
                <p className="text-lg sm:text-xl font-bold">{formatINR(viewingPerson.person.totalMoneyRupees)}</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 text-purple-900">
                <span className="text-[10px] text-purple-700 font-sans uppercase">சீர் பொருட்கள் (Material Gifts)</span>
                <p className="text-lg sm:text-xl font-bold">{viewingPerson.person.totalMaterialCount || 0}</p>
              </div>
            </div>

            {/* All contributions by this person */}
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2">
                பங்களிப்பு வரலாறு (Contribution History: {viewingPerson.contributions.length})
              </h4>
              <div className="space-y-2">
                {viewingPerson.contributions.length === 0 ? (
                  <p className="text-xs text-slate-400">பதிவுகள் இல்லை.</p>
                ) : (
                  viewingPerson.contributions.map((c) => (
                    <div
                      key={c._id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-blue-700">{c.contributionId}</span>
                          <span className="font-semibold text-slate-800">
                            {c.contributionType === 'MONEY' ? 'பணம் (Money)' : `${c.materialName} (${c.quantity})`}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          தேதி: {formatDate(c.contributionDate)} {c.description ? `• ${c.description}` : ''}
                        </p>
                      </div>
                      <div className="text-left sm:text-right font-mono">
                        {c.contributionType === 'MONEY' ? (
                          <span className="font-bold text-emerald-700 text-sm">{formatINR(c.amountRupees)}</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] font-bold">
                            பொருள்
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setViewingPerson(null)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold min-h-[38px] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: EDIT CONTRIBUTION */}
      {editingContribution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">பதிவு திருத்து (Edit Contribution)</h3>
                <p className="text-xs font-mono text-blue-700">{editingContribution.contributionId}</p>
              </div>
              <button onClick={() => setEditingContribution(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateContribution} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">வகை (Type) *</label>
                <select
                  value={editingContribution.contributionType}
                  onChange={(e) =>
                    setEditingContribution({ ...editingContribution, contributionType: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="MONEY">பணம் (Money)</option>
                  <option value="MATERIAL">பொருள் (Material)</option>
                </select>
              </div>

              {editingContribution.contributionType === 'MONEY' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">தொகை (Amount in ₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={editingContribution.amountRupees}
                    onChange={(e) =>
                      setEditingContribution({ ...editingContribution, amountRupees: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">பொருள் (Material Name) *</label>
                    <input
                      type="text"
                      required
                      value={editingContribution.materialName}
                      onChange={(e) =>
                        setEditingContribution({ ...editingContribution, materialName: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">அளவு (Quantity) *</label>
                    <input
                      type="text"
                      required
                      value={editingContribution.quantity}
                      onChange={(e) =>
                        setEditingContribution({ ...editingContribution, quantity: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">குறிப்புகள் (Description)</label>
                <input
                  type="text"
                  value={editingContribution.description || ''}
                  onChange={(e) =>
                    setEditingContribution({ ...editingContribution, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingContribution(null)}
                  className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold min-h-[38px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 min-h-[38px] cursor-pointer"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: DELETE CONTRIBUTION CONFIRMATION */}
      {deletingContribution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4 text-xs">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-full">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">பதிவை நீக்க உறுதிப்படுத்தவும்</h3>
            </div>

            <p className="text-slate-600">
              Are you sure you want to delete this contribution record?
            </p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono space-y-1">
              <div><strong>Record ID:</strong> {deletingContribution.contributionId}</div>
              <div><strong>Person:</strong> {deletingContribution.personName}</div>
              <div>
                <strong>Contribution:</strong>{' '}
                {deletingContribution.contributionType === 'MONEY'
                  ? formatINR(deletingContribution.amountRupees)
                  : `${deletingContribution.materialName} (${deletingContribution.quantity})`}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                நீக்குவதற்கான காரணம் (Mandatory Reason) *
              </label>
              <input
                type="text"
                required
                placeholder="State reason for audit log"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setDeletingContribution(null);
                  setDeleteReason('');
                }}
                className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer min-h-[38px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleDeleteContribution}
                className="w-full sm:w-auto px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 min-h-[38px]"
              >
                {actionLoading ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
