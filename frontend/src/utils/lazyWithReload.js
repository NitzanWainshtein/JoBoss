import { lazy } from 'react';

/**
 * `React.lazy` that survives a deploy.
 *
 * Chunk filenames carry a content hash, so a deploy changes them. A session that
 * loaded index.html before the deploy still holds the old names, and requesting a
 * chunk that has been replaced fails — the import rejects and the user lands on
 * the error screen for no reason of their own.
 *
 * The deploy no longer deletes superseded chunks, which removes the common case.
 * This covers the rest: a chunk that 404s for any reason (CDN eviction, a pruned
 * bucket, a network blip mid-fetch) triggers one reload, which fetches the fresh
 * index.html and its current chunk names.
 *
 * Guarded by sessionStorage so a genuinely broken chunk cannot cause a reload
 * loop: the second failure is allowed to propagate to the ErrorBoundary, where at
 * least the user gets an explanation and a way out.
 */
const flagFor = (key) => `chunk-reload:${key}`;

const readFlag = (key) => {
  try {
    return sessionStorage.getItem(flagFor(key)) === '1';
  } catch {
    // Private mode / blocked storage: treat as "not yet retried". Worst case is
    // one extra reload, which is still better than a dead screen.
    return false;
  }
};

const writeFlag = (key, value) => {
  try {
    if (value) sessionStorage.setItem(flagFor(key), '1');
    else sessionStorage.removeItem(flagFor(key));
  } catch {
    // Non-fatal — the retry just isn't remembered.
  }
};

// Split out from the default export so the retry rule can be tested directly.
// Wrapped in React.lazy it is only reachable by rendering a Suspense tree, and
// the thing worth pinning down here — that a permanently broken chunk reloads
// exactly once and then surfaces the error instead of looping — is about the
// promise, not about React.
export function withChunkRetry(factory, key) {
  return () =>
    factory()
      .then((module) => {
        // Clear on success so a later deploy gets its own retry.
        writeFlag(key, false);
        return module;
      })
      .catch((error) => {
        if (readFlag(key)) throw error; // already reloaded once — let it surface

        writeFlag(key, true);
        window.location.reload();

        // Deliberately never settles: the reload is already in flight, and
        // resolving or rejecting here would render something for the split second
        // before the page goes away.
        return new Promise(() => {});
      });
}

export default function lazyWithReload(factory, key) {
  return lazy(withChunkRetry(factory, key));
}
