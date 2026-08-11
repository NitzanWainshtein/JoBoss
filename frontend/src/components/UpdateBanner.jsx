// Tells the user when a newer build is live and offers to load it.
//
// Why this is needed even though index.html is served no-cache: the app is
// installed as a PWA (manifest declares display: standalone), and an installed
// app resumes from memory instead of reloading. index.html is never re-fetched,
// so the cache headers never come into play and the user keeps running whatever
// bundle they had when they first opened it.
//
// No build-time version file: the bundle filename is already content-hashed and
// changes on every meaningful build, so comparing it against a freshly fetched
// index.html detects exactly the thing that matters, with nothing to keep in
// sync.

import { useState, useEffect, useCallback, useRef } from 'react';
import useTranslation from '../i18n/useTranslation';

const POLL_MS = 5 * 60 * 1000;

// The script tag this session is actually running.
function currentBundle() {
  const el = [...document.querySelectorAll('script[src]')]
    .map(s => s.getAttribute('src'))
    .find(src => src && src.includes('/assets/index-'));
  return el || null;
}

export default function UpdateBanner() {
  const { t } = useTranslation();
  const [stale, setStale] = useState(false);
  const mine = useRef(currentBundle());

  const check = useCallback(async () => {
    if (!mine.current || stale) return;
    try {
      // Cache-bust the request itself: an intermediate cache returning the old
      // HTML would make this silently useless.
      const res = await fetch(`/index.html?_v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const html = await res.text();
      const match = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
      if (match && !mine.current.includes(match[0])) setStale(true);
    } catch {
      // Offline or a blip — not a reason to nag the user.
    }
  }, [stale]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    // Resume is the moment that matters for an installed app: that is exactly
    // when it comes back with a stale bundle and never re-fetches anything.
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(check, POLL_MS);
    check();
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, [check]);

  if (!stale) return null;

  return (
    <div style={S.wrap} role="status">
      <span style={S.text}>{t('update.available')}</span>
      <button type="button" style={S.btn} onClick={() => window.location.reload()}>
        {t('update.reload')}
      </button>
    </div>
  );
}

const S = {
  wrap: {
    position: 'fixed', left: '50%', transform: 'translateX(-50%)',
    bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
    zIndex: 500, display: 'flex', alignItems: 'center', gap: '10px',
    background: 'rgba(24,16,56,0.94)', backdropFilter: 'blur(12px)',
    borderRadius: '999px', padding: '9px 10px 9px 16px',
    boxShadow: '0 14px 34px rgba(15,8,50,0.4)',
    maxWidth: 'calc(100vw - 28px)',
  },
  text: { color: 'white', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' },
  btn: {
    border: 'none', borderRadius: '999px', cursor: 'pointer',
    background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', color: 'white',
    padding: '7px 15px', fontSize: '12.5px', fontWeight: 800, flexShrink: 0,
  },
};
