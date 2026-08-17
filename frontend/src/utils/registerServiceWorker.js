// Registers sw.js and turns its update lifecycle into one DOM event UpdateBanner
// can listen for. See sw-src/sw.js for why this exists: a page-script-based
// update check (the one UpdateBanner already had) cannot detect an update in a
// tab that has been running since before that check even existed — the browser's
// own SW update machinery does not have that bootstrapping problem, because it is
// the browser, not this app's JS, that notices the file changed.
//
// This module only wires the lifecycle; it never decides on its own to reload —
// that stays a user action via UpdateBanner's button, so an update never yanks
// the page out from under someone mid-interaction.

const UPDATE_EVENT = 'sw-update-available';

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

    // A worker was already waiting from a previous load that nobody acted on.
    if (registration.waiting) announce();

    registration.addEventListener('updatefound', () => {
      const incoming = registration.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        // 'installed' with an existing controller means this is a genuine
        // update — the very first install ever has no controller yet, and must
        // not be reported as "an update is available" (there is nothing to
        // update FROM).
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
          announce();
        }
      });
    });

    // Prompt an update check now, on top of whatever the browser already does
    // automatically on navigation.
    registration.update().catch(() => {});
  });

  // Fires once the accepted update actually takes control. One reload picks up
  // the new JS; the guard stops a second reload if this ever fires twice.
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
