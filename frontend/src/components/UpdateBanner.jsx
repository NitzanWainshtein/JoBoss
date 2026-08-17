// Tells the user when a newer build is live and offers to load it.
//
// Two independent detectors feed the same banner:
//
// 1. Service worker (sw-src/sw.js via registerServiceWorker.js) — the primary
//    path. The browser's own SW update machinery diffs sw.js on its own,
//    independent of whatever JS is currently running in the tab.
//
// 2. Polling index.html (below) — kept as a fallback for whenever the SW path
//    cannot fire at all: SW registration can fail (some in-app/embedded
//    browser webviews block it outright), and it does nothing for a session
//    that was already running before this feature existed and never got a
//    real reload to pick up the SW registration code itself. That case is
//    exactly why this can't be the ONLY mechanism — but pairing it with the
//    service worker as detector #1 covers new sessions immediately going
//    forward. index.html is no-cache, so this needed no other build machinery.
//
// Either firing sets the same `stale` flag; the button behaves differently
// underneath depending on which one fired (see handleReload).
//
// The banner is only how an update reaches a user who is LOOKING at the app —
// yanking the page mid-swipe would be worse than a moment of staleness. Once the
// tab is hidden there is nothing to disrupt, so both paths stop asking and just
// take the update (see canApplySilently). That is what keeps this from being
// opt-in: a user who never presses the button still lands on the new build the
// next time they leave the app and come back.

import { useState, useEffect, useCallback, useRef } from 'react';
import useTranslation from '../i18n/useTranslation';
import { activateWaitingServiceWorker, canApplySilently } from '../utils/registerServiceWorker';

const POLL_MS = 5 * 60 * 1000;
const SW_UPDATE_EVENT = 'sw-update-available';

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
  const swRegistration = useRef(null);

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
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Resume is the moment that matters for an installed app: that is
        // exactly when it comes back with a stale bundle and never re-fetches
        // anything.
        check();
      } else if (stale && canApplySilently()) {
        // Already known stale and the user just left — take the update now
        // rather than waiting for them to come back and press a button. Same
        // reasoning as the service worker path in registerServiceWorker.js;
        // this branch is what covers sessions where no SW is running at all.
        window.location.reload();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const id = setInterval(check, POLL_MS);
    check();
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(id);
    };
  }, [check, stale]);

  useEffect(() => {
    const onSwUpdate = (e) => {
      swRegistration.current = e.detail?.registration || null;
      setStale(true);
    };
    window.addEventListener(SW_UPDATE_EVENT, onSwUpdate);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onSwUpdate);
  }, []);

  const handleReload = () => {
    if (swRegistration.current?.waiting) {
      // Don't reload directly here — activating the waiting worker fires
      // 'controllerchange' in registerServiceWorker.js, which does the reload
      // once the new worker has actually taken control, not before.
      activateWaitingServiceWorker(swRegistration.current);
      return;
    }
    // Polling path: there is no service worker lifecycle to wait on.
    window.location.reload();
  };

  if (!stale) return null;

  return (
    <div style={S.wrap} role="status">
      <span style={S.text}>{t('update.available')}</span>
      <button type="button" style={S.btn} onClick={handleReload}>
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
