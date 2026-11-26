import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import en from '../locales/en.json';
import ta from '../locales/ta.json';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'cpn_language';

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ta' || saved === 'en') return saved;
    } catch (e) {
      // Ignore localStorage access errors
    }
    return 'en';
  });

  const setLanguage = useCallback((newLang) => {
    if (newLang === 'en' || newLang === 'ta') {
      setLanguageState(newLang);
      try {
        localStorage.setItem(STORAGE_KEY, newLang);
        if (typeof document !== 'undefined') {
          document.documentElement.lang = newLang;
        }
      } catch (e) {
        // Ignore storage errors
      }
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const dictionary = useMemo(() => {
    return language === 'ta' ? ta : en;
  }, [language]);

  /**
   * Helper function to get translation by dot-path
   * e.g. t('dashboard.title')
   * e.g. t('nav.dueToday', { count: 3 })
   * e.g. t('common.save', 'Save')
   */
  const t = useCallback((key, paramsOrFallback, fallback) => {
    if (!key) return '';
    let fallbackText = '';
    let params = null;

    if (typeof paramsOrFallback === 'string') {
      fallbackText = paramsOrFallback;
    } else if (typeof paramsOrFallback === 'object' && paramsOrFallback !== null) {
      params = paramsOrFallback;
      if (typeof fallback === 'string') {
        fallbackText = fallback;
      }
    }

    const resolveKey = (dict, k) => {
      if (!dict || typeof dict !== 'object') return undefined;
      const parts = k.split('.');
      let cur = dict;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in cur) {
          cur = cur[p];
        } else {
          return undefined;
        }
      }
      return typeof cur === 'string' ? cur : undefined;
    };

    let result = resolveKey(dictionary, key);
    if (result === undefined && language !== 'en') {
      // Safe fallback to English dictionary
      result = resolveKey(en, key);
    }
    if (result === undefined) {
      result = fallbackText || key.split('.').pop() || key;
    }

    if (params && typeof result === 'string') {
      Object.keys(params).forEach((p) => {
        result = result.replace(new RegExp(`\\{${p}\\}`, 'g'), params[p]);
      });
    }

    return result;
  }, [dictionary, language]);

  const contextValue = useMemo(() => ({
    language,
    setLanguage,
    t,
    isTamil: language === 'ta',
  }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
