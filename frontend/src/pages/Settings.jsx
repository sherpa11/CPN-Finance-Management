import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import {
  Settings as SettingsIcon,
  Shield,
  Save,
  Download,
  Database,
  History,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { formatDateTime } from '../utils/formatters';
import api from '../api';

export default function Settings() {
  const { t, isTamil } = useLanguage();
  const [configs, setConfigs] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Settings form states
  const [monthlyPartialRule, setMonthlyPartialRule] = useState('PRO_RATA_DAILY');
  const [monthlyPending, setMonthlyPending] = useState(true);
  const [dailyInclusion, setDailyInclusion] = useState('INCLUDE_START_EXCLUDE_END');
  const [reminderDays, setReminderDays] = useState(3);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  // Change Password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passSuccess, setPassSuccess] = useState('');
  const [passError, setPassError] = useState('');

  const fetchSettingsAndAudit = async () => {
    setLoading(true);
    try {
      const [setRes, audRes] = await Promise.all([
        api.get('/settings'),
        api.get('/settings/audit-logs?limit=50'),
      ]);

      if (setRes.data.success) {
        setConfigs(setRes.data.configurations);
        const m = setRes.data.configurations.MONTHLY?.settings;
        if (m) {
          setMonthlyPartialRule(m.partialMonthRule || 'PRO_RATA_DAILY');
          setMonthlyPending(setRes.data.configurations.MONTHLY.isPendingOwnerConfirmation);
        }
        const d = setRes.data.configurations.DAILY?.settings;
        if (d) {
          setDailyInclusion(d.dateInclusionConvention || 'INCLUDE_START_EXCLUDE_END');
        }
        const b = setRes.data.configurations.BUSINESS?.settings;
        if (b && b.reminderDays !== undefined) {
          setReminderDays(b.reminderDays);
        }
      }

      if (audRes.data.success) {
        setAuditLogs(audRes.data.logs);
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndAudit();
  }, []);

  const handleSaveMonthly = async () => {
    setSaving(true);
    setSaveSuccess('');
    setSaveError('');
    try {
      const res = await api.post('/settings/config', {
        configType: 'MONTHLY',
        settings: {
          partialMonthRule: monthlyPartialRule,
        },
        isPendingOwnerConfirmation: monthlyPending,
        description: 'Monthly interest configuration with partial month treatment.',
      });
      if (res.data.success) {
        setSaveSuccess('Monthly calculation configuration updated.');
        fetchSettingsAndAudit();
      }
    } catch (err) {
      setSaveError(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDaily = async () => {
    setSaving(true);
    setSaveSuccess('');
    setSaveError('');
    try {
      const res = await api.post('/settings/config', {
        configType: 'DAILY',
        settings: {
          dateInclusionConvention: dailyInclusion,
        },
        isPendingOwnerConfirmation: false,
        description: 'Daily interest calculation with date-boundary inclusion rules.',
      });
      if (res.data.success) {
        setSaveSuccess('Daily calculation configuration updated.');
        fetchSettingsAndAudit();
      }
    } catch (err) {
      setSaveError(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBusiness = async () => {
    setSaving(true);
    setSaveSuccess('');
    setSaveError('');
    try {
      const res = await api.post('/settings/config', {
        configType: 'BUSINESS',
        settings: {
          reminderDays: Number(reminderDays),
        },
        description: 'Due reminder window and operational configuration.',
      });
      if (res.data.success) {
        setSaveSuccess('Business settings and reminder window updated.');
        fetchSettingsAndAudit();
      }
    } catch (err) {
      setSaveError(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await api.get('/settings/backup/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `CPN_RAJA_BACKUP_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Failed to download database backup: ' + err.message);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPassError(t('settings.changePassword.currentPasswordPlaceholder', 'Please fill in all password fields.'));
      return;
    }

    if (newPassword.length < 6) {
      setPassError(t('settings.changePassword.lengthError', 'New password must be at least 6 characters long.'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError(t('settings.changePassword.matchError', 'New password and confirm password do not match.'));
      return;
    }

    setPassLoading(true);
    try {
      const res = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      if (res.data.success) {
        setPassSuccess(res.data.message || t('settings.changePassword.successMessage', 'Admin password updated successfully!'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        await fetchSettingsAndAudit();
      }
    } catch (err) {
      setPassError(err.response?.data?.message || err.message || 'Failed to change password');
    } finally {
      setPassLoading(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-slate-700 shrink-0" />
            <span>Business Rules & System Configuration</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure financial calculation rules, partial month handling, reminder periods, and view audit history
          </p>
        </div>

        <button
          onClick={handleDownloadBackup}
          className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer min-h-[40px]"
        >
          <Database className="w-4 h-4 text-amber-400" />
          <span>Export Database Backup (JSON)</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Grid of Configurations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        {/* Monthly Calculation Config */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900">Monthly Finance Calculation Rules</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Simple Interest
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Partial Month Rule (When loan is settled or evaluated mid-month)
              </label>
              <select
                value={monthlyPartialRule}
                onChange={(e) => setMonthlyPartialRule(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
              >
                <option value="PRO_RATA_DAILY">Pro-Rata Daily (Interest calculated per exact day in month)</option>
                <option value="THIRTY_DAY_BASE">30-Day Base (Fraction based on 30-day standard month)</option>
                <option value="FULL_MONTH_IF_STARTED">Full Month if Started (Any day started counts as full month)</option>
                <option value="NO_INTEREST_IF_PARTIAL">No Interest if Partial (Only completed calendar months)</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="monthlyPending"
                checked={monthlyPending}
                onChange={(e) => setMonthlyPending(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <label htmlFor="monthlyPending" className="text-slate-700 font-medium">
                Mark partial-month rule as "Pending Owner Confirmation"
              </label>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-500">
              Future modifications to this rule apply to upcoming calculations. Historical settled transactions are permanently locked and preserved.
            </div>

            <button
              onClick={handleSaveMonthly}
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors cursor-pointer min-h-[38px]"
            >
              Save Monthly Rules
            </button>
          </div>
        </div>

        {/* Daily Calculation Config */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900">Daily Finance Calculation Rules</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              Simple Interest
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Date-Inclusion Convention (Start and Payment Date Boundaries)
              </label>
              <select
                value={dailyInclusion}
                onChange={(e) => setDailyInclusion(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white"
              >
                <option value="INCLUDE_START_EXCLUDE_END">
                  Include Start Date, Exclude End Date (Standard Banking Convention)
                </option>
                <option value="INCLUDE_BOTH">Include Both Start Date and End Date</option>
                <option value="EXCLUDE_START_INCLUDE_END">
                  Exclude Start Date, Include End Date
                </option>
              </select>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-500">
              Evaluated strictly in <strong className="text-slate-700">Asia/Kolkata</strong> business timezone to prevent double-counting or day-skipping across midnight.
            </div>

            <button
              onClick={handleSaveDaily}
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors cursor-pointer min-h-[38px]"
            >
              Save Daily Rules
            </button>
          </div>
        </div>

        {/* Daily Collection Configuration & Rules Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900">Daily Collection Rules (தினசரி வசூல்)</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active • 70 & 100 Days
            </span>
          </div>

          <div className="space-y-3">
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-emerald-950 text-xs space-y-1.5">
              <p className="font-bold">Upfront Interest Deduction (முன் வட்டி முறை):</p>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Agreed interest is deducted upfront before disbursement. Customer receives net cash and repays gross principal across either 70 or 100 equal daily instalments (Gross ÷ 70 or Gross ÷ 100).
              </p>
            </div>

            <p className="text-[11px] text-slate-400">
              Odd paise remainder is automatically absorbed on the final day (Day 70 or Day 100). Upfront interest is never collected again in daily instalments.
            </p>
          </div>
        </div>

        {/* Operational Due Reminder Period */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900">Due Reminder Window</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
              Notification Engine
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Upcoming Reminder Window (Days before Maturity Date)
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={reminderDays}
                onChange={(e) => setReminderDays(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono font-bold"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Borrowers will appear in "Upcoming Dues" when their maturity date is within this number of days.
              </p>
            </div>

            <button
              onClick={handleSaveBusiness}
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-colors cursor-pointer min-h-[38px]"
            >
              Save Reminder Window
            </button>
          </div>
        </div>
      </div>

      {/* Admin Security: Change Password */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3">
          <KeyRound className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {t('settings.changePassword.title', 'Admin Security & Password')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('settings.changePassword.subtitle', 'Change the administrator login password for this portal')}
            </p>
          </div>
        </div>

        {passSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{passSuccess}</span>
          </div>
        )}

        {passError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{passError}</span>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Current Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('settings.changePassword.currentPassword', 'Current Password')} *
            </label>
            <div className="relative">
              <input
                type={showCurrentPass ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('settings.changePassword.currentPasswordPlaceholder', 'Enter current password')}
                className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showCurrentPass ? 'Hide password' : 'Show password'}
              >
                {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('settings.changePassword.newPassword', 'New Password')} *
            </label>
            <div className="relative">
              <input
                type={showNewPass ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('settings.changePassword.newPasswordPlaceholder', 'Enter new password (min 6 characters)')}
                className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showNewPass ? 'Hide password' : 'Show password'}
              >
                {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('settings.changePassword.confirmPassword', 'Confirm New Password')} *
            </label>
            <div className="relative">
              <input
                type={showConfirmPass ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('settings.changePassword.confirmPasswordPlaceholder', 'Re-enter new password')}
                className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPass(!showConfirmPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showConfirmPass ? 'Hide password' : 'Show password'}
              >
                {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={passLoading}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {passLoading
                  ? t('settings.changePassword.updating', 'Updating...')
                  : t('settings.changePassword.updateButton', 'Update Password')}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Audit Log Trail Viewer */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-slate-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              System Audit Trail & Traceability (Last 50 Entries)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Immutable Log</span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left min-w-[650px]">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Entity</th>
                <th className="py-2.5 px-3">Performed By</th>
                <th className="py-2.5 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400 font-sans">
                    No audit records logged yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 text-slate-500 font-sans">{formatDateTime(log.timestamp)}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{log.action}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {log.entityType}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-700">{log.performedBy}</td>
                    <td className="py-2 px-4 font-sans text-slate-600 max-w-md truncate">{log.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
