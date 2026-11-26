/**
 * Financial & Date Formatting Utilities
 */

export function formatINR(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateInput) {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateInput) {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getFinanceBadge(type, t) {
  const isFunc = typeof t === 'function';
  switch (type) {
    case 'MONTHLY':
      return {
        label: isFunc ? t('nav.monthlyFinance', 'Monthly Finance') : 'Monthly Finance',
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'DAILY':
      return {
        label: isFunc ? t('nav.dailyFinance', 'Daily Finance') : 'Daily Finance',
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 'DAILY_COLLECTION':
    case 'MEATER':
      return {
        label: isFunc ? t('nav.dailyCollection', 'Daily Collection') : 'Daily Collection',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    default:
      return {
        label: type,
        bg: 'bg-slate-50 text-slate-700 border-slate-200',
      };
  }
}

export function formatFinanceType(type, t) {
  if (!type) return '';
  const isFunc = typeof t === 'function';
  if (type === 'MEATER' || type === 'DAILY_COLLECTION') return isFunc ? t('nav.dailyCollection', 'DAILY COLLECTION') : 'DAILY COLLECTION';
  if (type === 'MONTHLY') return isFunc ? t('nav.monthlyFinance', 'MONTHLY') : 'MONTHLY';
  if (type === 'DAILY') return isFunc ? t('nav.dailyFinance', 'DAILY') : 'DAILY';
  return type;
}

export const getVattiBadge = getFinanceBadge;

export function getStatusBadge(status, t) {
  const isFunc = typeof t === 'function';
  switch (status) {
    case 'ACTIVE':
      return { label: isFunc ? t('common.active', 'Active') : 'Active', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'SETTLED':
      return { label: isFunc ? t('common.settled', 'Settled') : 'Settled', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'OVERDUE':
      return { label: isFunc ? t('common.overdue', 'Overdue') : 'Overdue', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'CLOSED':
      return { label: isFunc ? t('common.closed', 'Closed') : 'Closed', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'CONFIRMED':
      return { label: isFunc ? t('common.confirmed', 'Confirmed') : 'Confirmed', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'REVERSED':
      return { label: isFunc ? t('common.reversed', 'Reversed') : 'Reversed', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'PAID':
      return { label: isFunc ? t('common.paid', 'Paid') : 'Paid', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'PARTIAL':
      return { label: isFunc ? t('common.partial', 'Partial') : 'Partial', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'MISSED':
      return { label: isFunc ? t('common.missed', 'Missed') : 'Missed', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    default:
      return { label: status, bg: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

export function getMoiSeerBadge(type) {
  if (type === 'MONEY') {
    return {
      label: 'பணம் (Money)',
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dot: 'bg-emerald-500',
    };
  }
  return {
    label: 'பொருள் (Material)',
    bg: 'bg-purple-50 text-purple-800 border-purple-200',
    dot: 'bg-purple-500',
  };
}
