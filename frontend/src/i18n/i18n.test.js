import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readStoredLanguage,
  STORAGE_KEY,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  LANGUAGE_META,
} from './context.js';
import he from './he.js';
import en from './en.js';

describe('readStoredLanguage', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to Hebrew when nothing is stored', () => {
    expect(readStoredLanguage()).toBe('he');
    expect(DEFAULT_LANGUAGE).toBe('he');
  });

  it('returns a stored supported language', () => {
    localStorage.setItem(STORAGE_KEY, 'en');
    expect(readStoredLanguage()).toBe('en');
  });

  it('falls back to the default for an unsupported value', () => {
    // Otherwise a stale or hand-edited value renders every label as its raw key.
    localStorage.setItem(STORAGE_KEY, 'fr');
    expect(readStoredLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it('falls back to the default when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    // Private mode / blocked cookies must not break rendering.
    expect(readStoredLanguage()).toBe(DEFAULT_LANGUAGE);
    spy.mockRestore();
  });
});

describe('language metadata', () => {
  it('describes every supported language', () => {
    // A missing entry renders the toggle button with `undefined` on it.
    for (const code of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_META[code]).toMatchObject({
        flag: expect.any(String),
        label: expect.any(String),
        dir: expect.stringMatching(/^(rtl|ltr)$/),
      });
    }
  });
});

// scripts/check-i18n.mjs already covers key parity and duplicates. These check the
// VALUES, which it does not look at.
describe('dictionary values', () => {
  const placeholders = (s) => (s.match(/\{[a-zA-Z]+\}/g) || []).sort();

  it('has no empty strings, which would render as a blank label', () => {
    for (const [dictName, dict] of [['he', he], ['en', en]]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value === 'string' ? value.trim() : value,
          `${dictName}.${key} is empty`).not.toBe('');
      }
    }
  });

  it('uses the same {placeholders} in both languages', () => {
    // A placeholder present in one language and not the other silently renders
    // the literal token, or drops the value, depending on which way round it is.
    const mismatched = [];
    for (const key of Object.keys(he)) {
      if (typeof he[key] !== 'string' || typeof en[key] !== 'string') continue;
      const a = placeholders(he[key]);
      const b = placeholders(en[key]);
      if (a.join(',') !== b.join(',')) mismatched.push(`${key}: he=[${a}] en=[${b}]`);
    }
    expect(mismatched).toEqual([]);
  });

  it('keeps <b> tags balanced, since these strings are rendered as rich text', () => {
    const unbalanced = [];
    for (const [dictName, dict] of [['he', he], ['en', en]]) {
      for (const [key, value] of Object.entries(dict)) {
        if (typeof value !== 'string') continue;
        const open = (value.match(/<b>/g) || []).length;
        const close = (value.match(/<\/b>/g) || []).length;
        if (open !== close) unbalanced.push(`${dictName}.${key}`);
      }
    }
    expect(unbalanced).toEqual([]);
  });
});
