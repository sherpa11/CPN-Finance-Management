import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, Check, User, Banknote, AlertCircle } from 'lucide-react';
import { formatINR, getFinanceBadge } from '../utils/formatters';

/**
 * Searchable Customer / Loan Account Selector for Collection Modal
 * Supports instant search by:
 * - Customer Name
 * - Mobile Number
 * - Loan ID (e.g. CPN-LN-0001, CPN-DC-0001)
 * - Customer Code (e.g. CPN-CUST-0001)
 * - Finance Type (Monthly, Daily, Daily Collection)
 */
export default function SearchableLoanSelect({
  loans = [],
  value,
  onChange,
  placeholder = 'Search customer name, mobile number, or loan ID...',
  disabled = false,
  required = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Find currently selected loan object
  const selectedLoan = useMemo(() => {
    return loans.find((l) => l._id === value || l.id === value || l.loanId === value) || null;
  }, [loans, value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter loans based on search term
  const filteredLoans = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return loans;

    return loans.filter((l) => {
      const name = (l.customerName || l.customerId?.name || '').toLowerCase();
      const mobile = (l.customerMobile || l.customerId?.mobileNumber || '').toLowerCase();
      const loanCode = (l.loanId || '').toLowerCase();
      const custCode = (l.customerCode || l.customerId?.customerId || '').toLowerCase();
      const vatti = (l.vattiType || l.financeType || '').toLowerCase();
      
      let vattiLabel = 'monthly finance';
      if (vatti === 'daily') vattiLabel = 'daily finance';
      else if (vatti === 'daily_collection' || vatti === 'meater') vattiLabel = 'daily collection';

      return (
        name.includes(term) ||
        mobile.includes(term) ||
        loanCode.includes(term) ||
        custCode.includes(term) ||
        vatti.includes(term) ||
        vattiLabel.includes(term)
      );
    });
  }, [loans, searchTerm]);

  // Reset highlight when list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredLoans]);

  const handleSelectLoan = (loan) => {
    onChange(loan._id || loan.id, loan);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('', null);
    setSearchTerm('');
    if (inputRef.current) inputRef.current.focus();
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredLoans.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredLoans.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredLoans[highlightedIndex]) {
        handleSelectLoan(filteredLoans[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const selectedBadge = selectedLoan ? getFinanceBadge(selectedLoan.vattiType || selectedLoan.financeType || 'MONTHLY') : null;

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      {/* Trigger & Search Input Container */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            if (inputRef.current) inputRef.current.focus();
          }
        }}
        className={`w-full min-h-[44px] px-3 py-2 border rounded-lg bg-white flex items-center justify-between cursor-pointer transition-all ${
          disabled
            ? 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-75'
            : isOpen
            ? 'border-emerald-500 ring-2 ring-emerald-100 shadow-sm'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="flex items-center space-x-2 flex-1 overflow-hidden min-w-0">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          {selectedLoan ? (
            <div className="flex items-center space-x-2 truncate flex-1 min-w-0">
              <span className="font-bold text-slate-900 text-xs truncate">
                {selectedLoan.customerName || selectedLoan.customerId?.name}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                {selectedLoan.loanId}
              </span>
              {selectedBadge && (
                <span className={`hidden sm:inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0 ${selectedBadge.bg}`}>
                  {selectedBadge.label}
                </span>
              )}
              <span className="text-[11px] font-mono text-emerald-700 font-bold ml-auto shrink-0 pr-1">
                Due: {formatINR((selectedLoan.outstandingPrincipalPaise || 0) / 100)}
              </span>
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full bg-transparent border-none outline-none text-xs text-slate-900 placeholder:text-slate-400 font-sans"
              disabled={disabled}
            />
          )}
        </div>

        <div className="flex items-center space-x-1 shrink-0 ml-2">
          {selectedLoan && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
              title="Clear and search another loan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Hidden input to ensure HTML form validation works if required */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          style={{ opacity: 0, height: 0, width: 0, position: 'absolute' }}
          value={value || ''}
          required={required}
          onChange={() => {}}
        />
      )}

      {/* Autocomplete Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl py-1 text-xs">
          {filteredLoans.length === 0 ? (
            <div className="py-6 px-4 text-center text-slate-500">
              <Search className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
              <p className="font-semibold text-slate-700 text-xs">No matching customers found</p>
              {searchTerm ? (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  No active loan found matching "{searchTerm}"
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  No active loan accounts available for collection
                </p>
              )}
            </div>
          ) : (
            filteredLoans.map((l, index) => {
              const isSelected = (l._id || l.id) === value;
              const isHighlighted = index === highlightedIndex;
              const badge = getFinanceBadge(l.vattiType || l.financeType || 'MONTHLY');
              const custName = l.customerName || l.customerId?.name || 'Customer';
              const mobile = l.customerMobile || l.customerId?.mobileNumber || '';
              const duePrincipal = (l.outstandingPrincipalPaise || 0) / 100;
              const dueInterest = (l.outstandingInterestPaise || 0) / 100;

              return (
                <div
                  key={l._id || l.id || index}
                  onClick={() => handleSelectLoan(l)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors border-b border-slate-50 last:border-b-0 ${
                    isHighlighted ? 'bg-blue-50/80 text-blue-900' : 'hover:bg-slate-50 text-slate-900'
                  } ${isSelected ? 'bg-blue-50 font-bold' : ''}`}
                >
                  <div className="flex items-start space-x-2.5 overflow-hidden flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-600 font-bold text-xs uppercase mt-0.5">
                      {custName.charAt(0)}
                    </div>
                    <div className="truncate flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                        <span className="font-bold text-slate-900 text-xs truncate">
                          {custName}
                        </span>
                        <span className="font-mono text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          {l.loanId}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-mono mt-0.5 flex-wrap">
                        {mobile && <span>{mobile}</span>}
                        {mobile && <span>•</span>}
                        <span className="text-slate-700 font-sans">
                          Principal Due: <strong className="font-mono text-slate-900">{formatINR(duePrincipal)}</strong>
                        </span>
                        {dueInterest > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-700 font-sans">
                              Interest: <strong className="font-mono">{formatINR(dueInterest)}</strong>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
