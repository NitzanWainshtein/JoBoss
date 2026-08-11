import { useContext } from 'react';
import { LanguageContext, LANGUAGE_META } from './context';

/**
 * Returns { t, language, setLanguage, toggleLanguage, nextLanguage }.
 *
 * `nextLanguage` is the language the toggle button should advertise — i.e. the
 * one you would switch TO — along with its flag and label.
 */
export function useTranslation() {
  const { language, setLanguage, t } = useContext(LanguageContext);
  const next = language === 'he' ? 'en' : 'he';

  return {
    t,
    language,
    setLanguage,
    toggleLanguage: () => setLanguage(next),
    nextLanguage: { code: next, ...LANGUAGE_META[next] },
  };
}

export default useTranslation;
