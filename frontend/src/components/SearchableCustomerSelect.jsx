import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown, User, Check, Loader2 } from 'lucide-react';
import api from '../api';

/**
 * Reusable Searchable Customer Selector
 * Displays: Customer Name - Mobile Number (e.g. "Sabari - 9632541875")
 * Customer ID is hidden from display labels as per business specification.
 */
export default function SearchableCustomerSelect({
  value,
  onChange,
  customers: initialCustomers = null,
  placeholder = 'Search by customer name or mobile number...',
  disabled = false,
  required = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customersList, setCustomersList] = useState(initialCustomers || []);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Find currently selected customer
  const selectedCustomer = (initialCustomers || customersList).find(
    (c) => c._id === value || c.id === value
  ) || null;

  // Sync initialCustomers if provided
  useEffect(() => {
    if (initialCustomers) {
      setCustomersList(initialCustomers);
    }
  }, [initialCustomers]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch or filter customers when search term changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialCustomers && initialCustomers.length > 0) {
      // Filter provided customers list locally
      const term = searchTerm.trim().toLowerCase();
      if (!term) {
        setCustomersList(initialCustomers);
      } else {
        const filtered = initialCustomers.filter(
          (c) =>
            (c.name && c.name.toLowerCase().includes(term)) ||
            (c.mobileNumber && c.mobileNumber.toLowerCase().includes(term)) ||
            (c.tamilName && c.tamilName.toLowerCase().includes(term))
        );
        setCustomersList(filtered);
      }
      setHighlightedIndex(0);
    } else {
      // Fetch from API with debounce
      const handler = setTimeout(async () => {
        setLoading(true);
        try {
          const res = await api.get('/customers', {
            params: {
              search: searchTerm.trim() || undefined,
              limit: 50,
            },
          });
          if (res.data?.success) {
            setCustomersList(res.data.customers || []);
            setHighlightedIndex(0);
          }
        } catch (err) {
          console.error('Error fetching customers in selector:', err);
        } finally {
          setLoading(false);
        }
      }, 150);

      return () => clearTimeout(handler);
    }
  }, [searchTerm, isOpen, initialCustomers]);

  const handleSelectCustomer = (customer) => {
    onChange(customer._id || customer.id, customer);
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
      setHighlightedIndex((prev) => (prev < customersList.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : customersList.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (customersList[highlightedIndex]) {
        handleSelectCustomer(customersList[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      {/* Selector Trigger Input */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            if (inputRef.current) inputRef.current.focus();
          }
        }}
        className={`w-full min-h-[42px] px-3 py-2 border rounded-lg bg-white flex items-center justify-between cursor-pointer transition-colors ${
          disabled
            ? 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-75'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-100 shadow-sm'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="flex items-center space-x-2 flex-1 overflow-hidden">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          {isOpen ? (
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedCustomer ? `${selectedCustomer.name} - ${selectedCustomer.mobileNumber}` : placeholder}
              className="w-full bg-transparent border-none outline-none text-xs text-slate-900 placeholder:text-slate-400"
              autoFocus
            />
          ) : selectedCustomer ? (
            <div className="flex items-center space-x-2 truncate">
              <span className="font-bold text-slate-900 text-xs truncate">
                {selectedCustomer.name}
              </span>
              <span className="text-slate-400 text-xs font-mono">·</span>
              <span className="text-slate-600 font-mono text-xs shrink-0">
                {selectedCustomer.mobileNumber}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 select-none truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center space-x-1 shrink-0 ml-2">
          {selectedCustomer && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
              title="Clear selection"
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

      {/* Search Results Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1 text-xs">
          {loading ? (
            <div className="flex items-center justify-center space-x-2 py-4 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Searching customers...</span>
            </div>
          ) : customersList.length === 0 ? (
            <div className="py-4 px-3 text-center text-slate-500">
              <User className="w-6 h-6 mx-auto mb-1 text-slate-300" />
              <p className="font-semibold text-slate-700">No customers found</p>
              {searchTerm && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  No matching borrower for "{searchTerm}"
                </p>
              )}
            </div>
          ) : (
            customersList.map((c, index) => {
              const isSelected = (c._id || c.id) === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <div
                  key={c._id || c.id || index}
                  onClick={() => handleSelectCustomer(c)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isHighlighted ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-900'
                  } ${isSelected ? 'bg-blue-50/80 font-bold' : ''}`}
                >
                  <div className="flex items-center space-x-2.5 overflow-hidden">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-600 font-bold text-xs uppercase">
                      {c.name ? c.name.charAt(0) : 'C'}
                    </div>
                    <div className="truncate">
                      <p className="font-bold text-slate-900 text-xs truncate">
                        {c.name}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {c.mobileNumber}
                        {c.village ? ` · ${c.village}` : ''}
                      </p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
