// Registers sw.js and drives its update lifecycle. See sw-src/sw.js for why the
// service worker exists at all: a page-script update check cannot detect an
// update in a tab that has been running since before that check existed, but the
// browser's own SW machinery notices sw.js changed regardless of what JS is
// running in the tab.
//
// This module does two things beyond plain registration, both aimed at the same
// goal — every session converging on the current build without the user having
// to cooperate:
//
// 1. CHECKS AGGRESSIVELY. The browser only re-checks sw.js on navigation and at
//    most once a day. An installed PWA that is resumed rather than launched cold
//    does no navigation, so left alone it could run a stale build indefinitely.
//    We force a check on resume (the exact moment a stale session reappears) and
//    on an interval.
//
// 2. APPLIES SILENTLY WHILE HIDDEN. Reloading a page the user is looking at
//    would yank it out from under them mid-swipe, so that stays a button (the
//    UpdateBanner). But while the tab is hidden there is nothing to disrupt, so
//    the update is applied immediately and the user simply returns to the new
//    build having seen no banner at all. In practice this is what makes updates
//    non-optional: essentially every session backgrounds sooner or later, and
//    one background/foreground cycle is enough.
//
// The one case neither covers is a session running code from before this file
// shipped — there is no code in it to do any of the above. That resolves itself
// on that session's next cold load, and cannot recur afterwards.

const UPDATE_EVENT = 'sw-update-available';
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

// True when the update can be applied without the user noticing or losing
// anything: the tab is hidden (so no interaction to interrupt) and nothing looks
// half-typed. Exported because UpdateBanner's polling fallback — which runs in
// sessions where SW registration is unavailable — needs the same judgement.
export function canApplySilently() {
  return document.visibilityState === 'hidden' && !hasUnsavedInput();
}

// Reloading discards whatever the user had typed. While hidden they cannot see a
// banner to decide for themselves, so err toward keeping their work: anything
// that looks like an in-progress form defers the update to the visible path.
function hasUnsavedInput() {
  if (document.querySelector('[role="dialog"]')) return true;
  const fields = document.querySelectorAll('textarea, input');
  for (const el of fields) {
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'hidden') continue;
    if (el.value && el.value.trim() !== '') return true;
  }
  return false;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    let registration;
    try {
      registration = await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      console.error('Service worker registration failed:', e);
      return;
    }

    const announce = () => {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: { registration } }));
    };

    // Apply without asking when the user cannot be interrupted by it; otherwise
    // surface the banner and let them choose. Called both when an update is
    // found and when the tab is hidden with one already pending, so an update
    // that arrived while the user was looking still lands the moment they leave.
    const applyOrAnnounce = () => {
      if (!registration.waiting) return;
      if (canApplySilently()) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
      announce();
    };

    // A worker was already waiting from a previous load that nobody acted on.
    if (registration.waiting) applyOrAnnounce();

    registration.addEventListener('updatefound', () => {
      const incoming = registration.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        // 'installed' with an existing controller means this is a genuine
        // update — the very first install ever has no controller yet, and must
        // not be reported as "an update is available" (there is nothing to
        // update FROM).
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
          applyOrAnnounce();
        }
      });
    });

    const check = () => registration.update().catch(() => {});

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Leaving: cash in an update that was already waiting behind the banner.
        applyOrAnnounce();
      } else {
        // Returning: a resumed session is the case that goes stale silently, so
        // re-check right now rather than waiting for the interval or a
        // navigation that an installed PWA may never make.
        check();
      }
    });

    setInterval(check, CHECK_INTERVAL_MS);
    check();
  });

  // Fires once the accepted update actually takes control — including in other
  // open tabs, which is what makes every session converge on one build instead
  // of each carrying whatever it happened to load. One reload picks up the new
  // JS; the guard stops a second reload if this ever fires twice.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

// Called from UpdateBanner's "Reload" button when the update came from the
// service worker path. Tells the waiting worker to activate; the controllerchange
// listener above does the actual reload once it does.
export function activateWaitingServiceWorker(registration) {
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
