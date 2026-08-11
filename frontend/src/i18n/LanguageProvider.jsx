import { useState, useEffect, useCallback, useMemo } from 'react';
import he from './he';
import en from './en';
import {
  LanguageContext,
  LANGUAGE_META,
  STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  readStoredLanguage,
} from './context';

const DICTIONARIES = { he, en };

function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage);

  // Keep <html dir> and <html lang> in step with the selected language so the
  // whole document (including native form controls) flips direction.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('dir', LANGUAGE_META[language]?.dir || 'rtl');
    root.setAttribute('lang', language);
  }, [language]);

  const setLanguage = useCallback((next) => {
    if (!SUPPORTED_LANGUAGES.includes(next)) return;
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the language still applies for this session.
    }
  }, []);

  // Falls back to the Hebrew string, then to the key itself, so a missing
  // translation degrades to readable text instead of blank UI.
  const t = useCallback(
    (key) => DICTIONARIES[language]?.[key] ?? DICTIONARIES.he[key] ?? key,
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export default LanguageProvider;
