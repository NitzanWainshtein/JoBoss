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
  //
  // `params` fills {placeholders}. Without it every string containing a number
  // had to be built by concatenating fragments around the value, which does not
  // survive translation — word order differs between Hebrew and English.
  const t = useCallback(
    (key, params) => {
      const raw = DICTIONARIES[language]?.[key] ?? DICTIONARIES.he[key] ?? key;
      if (!params) return raw;
      return raw.replace(/\{(\w+)\}/g, (match, name) =>
        // An unknown placeholder is left verbatim — that reads as an obvious bug
        // in the string, which is easier to spot than a silent empty gap.
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
      );
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export default LanguageProvider;
