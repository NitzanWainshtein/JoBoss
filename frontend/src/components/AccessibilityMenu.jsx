// Accessibility control panel.
//
// Deliberately limited to adjustments that do something real. There is no
// "blindness mode" or "dyslexia mode" here — those are the parts of the typical
// widget that look reassuring and help nobody, and they can actively interfere
// with a screen reader the user has already configured.
//
// Font size uses `zoom` rather than a root font-size because the app's spacing
// is written in px throughout; scaling the root would resize text while leaving
// every container the same, which breaks layouts instead of helping.

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useTranslation from '../i18n/useTranslation';

const STORAGE_KEY = 'a11yPrefs';
const DEFAULTS = { zoom: 0, contrast: false, noMotion: false, links: false };

function readPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function applyA11yPrefs(prefs) {
  const root = document.documentElement;
  root.style.setProperty('--a11y-zoom', String(1 + prefs.zoom * 0.1));
  root.classList.toggle('a11y-zoom', prefs.zoom !== 0);
  root.classList.toggle('a11y-contrast', !!prefs.contrast);
  root.classList.toggle('a11y-no-motion', !!prefs.noMotion);
  root.classList.toggle('a11y-links', !!prefs.links);
}

// Applied before first paint so a reload does not flash the default styling.
applyA11yPrefs(readPrefs());

export default function AccessibilityMenu() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(readPrefs);
  const wrapRef = useRef(null);

  useEffect(() => {
    applyA11yPrefs(prefs);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const set = (patch) => setPrefs(p => ({ ...p, ...patch }));

  const Toggle = ({ label, on, onClick }) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      style={{ ...S.row, ...(on ? S.rowOn : {}) }}
    >
      <span>{label}</span>
      <span style={{ ...S.pill, ...(on ? S.pillOn : {}) }}>{on ? '✓' : ''}</span>
    </button>
  );

  return (
    <div ref={wrapRef} style={S.wrap}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('a11y.title')}
        title={t('a11y.title')}
        style={S.fab}
      >
        ♿
      </button>

      {open && (
        <div role="dialog" aria-label={t('a11y.title')} style={S.panel}>
          <p style={S.heading}>{t('a11y.title')}</p>

          <div style={S.zoomRow}>
            <span style={S.zoomLabel}>{t('a11y.textSize')}</span>
            <div style={S.zoomBtns}>
              <button type="button" style={S.zoomBtn} aria-label={t('a11y.smaller')}
                onClick={() => set({ zoom: Math.max(-1, prefs.zoom - 1) })}>A−</button>
              <button type="button" style={S.zoomBtn} aria-label={t('a11y.bigger')}
                onClick={() => set({ zoom: Math.min(4, prefs.zoom + 1) })}>A+</button>
            </div>
          </div>

          <Toggle label={t('a11y.contrast')} on={prefs.contrast}
            onClick={() => set({ contrast: !prefs.contrast })} />
          <Toggle label={t('a11y.noMotion')} on={prefs.noMotion}
            onClick={() => set({ noMotion: !prefs.noMotion })} />
          <Toggle label={t('a11y.links')} on={prefs.links}
            onClick={() => set({ links: !prefs.links })} />

          <button type="button" style={S.reset} onClick={() => setPrefs({ ...DEFAULTS })}>
            {t('a11y.reset')}
          </button>

          <button
            type="button"
            style={S.statement}
            onClick={() => { setOpen(false); navigate('/legal/accessibility'); }}
          >
            {t('settings.accessibility')} {language === 'en' ? '›' : '›'}
          </button>
        </div>
      )}
    </div>
  );
}

const S = {
  // Physical right, not inset-inline-end: the logical property maps to LEFT in
  // an RTL document, which stacked this straight on top of the avatar.
  wrap: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' },
  fab: {
    width: '34px', height: '34px', borderRadius: '50%',
    border: '1px solid rgba(124,92,255,0.28)', background: 'rgba(255,255,255,0.9)',
    cursor: 'pointer', fontSize: '17px', lineHeight: 1, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(108,79,212,0.18)',
  },
  panel: {
    position: 'absolute', top: 'calc(100% + 10px)', right: 0,
    width: '232px', background: 'rgba(255,255,255,0.98)',
    backdropFilter: 'blur(20px)', borderRadius: '16px',
    border: '1px solid rgba(124,92,255,0.14)',
    boxShadow: '0 18px 50px rgba(70,45,160,0.24)',
    padding: '12px', zIndex: 400, display: 'flex', flexDirection: 'column', gap: '6px',
  },
  heading: { margin: '0 0 4px', fontSize: '13px', fontWeight: 900, color: '#1E2A4A' },
  zoomRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '4px 2px' },
  zoomLabel: { fontSize: '12.5px', fontWeight: 700, color: '#3F3A52' },
  zoomBtns: { display: 'flex', gap: '5px' },
  zoomBtn: {
    minWidth: '34px', padding: '5px 8px', borderRadius: '9px',
    border: '1px solid #E9E4FB', background: '#F8F6FF',
    cursor: 'pointer', fontSize: '12px', fontWeight: 800, color: '#5B3DF5',
  },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '8px', width: '100%', padding: '9px 10px', borderRadius: '10px',
    border: '1px solid #EFEBFB', background: 'white', cursor: 'pointer',
    fontSize: '12.5px', fontWeight: 700, color: '#3F3A52', textAlign: 'start',
  },
  rowOn: { background: '#F1ECFF', borderColor: '#C9BBFF' },
  pill: {
    width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
    border: '1px solid #DDD6F2', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '12px', color: 'white',
  },
  pillOn: { background: '#12A96F', borderColor: '#12A96F' },
  reset: {
    marginTop: '2px', border: 'none', borderRadius: '9px', background: '#F5F3FC',
    padding: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#5A5478',
  },
  statement: {
    border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: '12px', fontWeight: 800, color: '#5B3DF5', padding: '4px', textAlign: 'start',
  },
};
