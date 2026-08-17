// JoBoss Service Worker — update detection ONLY. No fetch caching.
//
// Why no caching: this app is a thin client over a live, authenticated API —
// swipes, applications, quota, admin data. A service worker that caches API
// responses is one of the most common ways a PWA ships a bug where users see
// stale or wrong data and have no way to tell it's stale. Caching the app shell
// (index.html/JS/CSS) is also deliberately skipped: CloudFront + this deploy's
// cache headers already do that correctly (index.html is no-cache, hashed
// assets are immutable), so a service worker cache would only duplicate that
// with a second source of truth to keep in sync.
//
// What this IS for: the browser's own SW update machinery checks this exact
// file for byte changes independently of whatever JS is currently running in
// the tab — which is what finally escapes the bootstrapping problem a
// page-script-based update checker cannot: a tab that has been open since
// before an update-checker even existed has no way to run code that was never
// there. The SW lifecycle does not have that problem, because the browser
// itself — not this app's JS — is what notices the file changed.
//
// BUILD_ID is rewritten by vite.config.js on every build (see buildInfoPlugin)
// so this file's bytes differ across deploys — without that, the browser would
// never see a byte-diff and would never detect an update at all.
const BUILD_ID = '__JOBOSS_BUILD_ID__';

self.addEventListener('install', () => {
  // Do NOT self.skipWaiting() here. A new worker installs and then waits by
  // design — that pause is what lets the app decide (via the user's own "Reload"
  // tap in UpdateBanner) exactly when to cut over, instead of yanking the JS out
  // from under a user mid-interaction.
});

self.addEventListener('activate', (event) => {
  // Take control of any already-open tabs immediately once activated, so a
  // tab that accepted the update does not need a second reload to be fully on
  // the new version.
  event.waitUntil(self.clients.claim());
});

// The page sends this after the user taps "Reload" in UpdateBanner, once it has
// confirmed there is a waiting worker. This is the only message this worker
// understands — anything else is ignored rather than guessed at.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
