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

export function getFinanceBadge(type) {
  switch (type) {
    case 'MONTHLY':
      return {
        label: 'Monthly Finance',
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'DAILY':
      return {
        label: 'Daily Finance',
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 'DAILY_COLLECTION':
      return {
        label: 'Daily Collection',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'MEATER':
      return {
        label: 'Meater Finance',
        bg: 'bg-purple-50 text-purple-700 border-purple-200',
      };
    default:
      return {
        label: type,
        bg: 'bg-slate-50 text-slate-700 border-slate-200',
      };
  }
}

export const getVattiBadge = getFinanceBadge;

export function getStatusBadge(status) {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'SETTLED':
      return { label: 'Settled', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'OVERDUE':
      return { label: 'Overdue', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'CLOSED':
      return { label: 'Closed', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'CONFIRMED':
      return { label: 'Confirmed', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'REVERSED':
      return { label: 'Reversed', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
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
