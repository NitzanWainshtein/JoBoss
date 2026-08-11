import { createContext } from 'react';

export const STORAGE_KEY = 'appLanguage';
export const DEFAULT_LANGUAGE = 'he';
export const SUPPORTED_LANGUAGES = ['he', 'en'];

// Metadata for the toggle button: for each language, what to show when it is
// the language you would switch TO.
export const LANGUAGE_META = {
  he: { flag: '🇮🇱', label: 'עב', dir: 'rtl' },
  en: { flag: '🇺🇸', label: 'EN', dir: 'ltr' },
};

export function readStoredLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved;
  } catch {
    // localStorage can throw in private-mode / blocked-cookie contexts.
  }
  return DEFAULT_LANGUAGE;
}

export const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
});
