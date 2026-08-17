import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withChunkRetry } from './lazyWithReload.js';

// The reload is the whole mechanism, so it has to be observable. jsdom has no
// real navigation, and assigning to window.location is not allowed, so replace
// the object outright.
let reload;
beforeEach(() => {
  reload = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { reload, href: 'https://app.test/admin' },
    writable: true,
    configurable: true,
  });
  sessionStorage.clear();
});

describe('withChunkRetry', () => {
  it('passes the module through untouched when the import succeeds', async () => {
    const mod = { default: 'AdminPage' };
    await expect(withChunkRetry(() => Promise.resolve(mod), 'admin')()).resolves.toBe(mod);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once on the first failure instead of surfacing the error', async () => {
    const settled = vi.fn();
    withChunkRetry(() => Promise.reject(new Error('404 loading chunk')), 'admin')()
      .then(settled, settled);

    // Let the rejection handler run.
    await Promise.resolve();
    await Promise.resolve();

    expect(reload).toHaveBeenCalledTimes(1);
    // Never settling is deliberate: settling would flash a render (or the error
    // screen) for the moment before the page goes away.
    expect(settled).not.toHaveBeenCalled();
  });

  it('surfaces the error on the second failure rather than reloading again', async () => {
    const boom = new Error('chunk is genuinely gone');
    const factory = () => Promise.reject(boom);

    withChunkRetry(factory, 'admin')().catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);

    // Second attempt, as happens after the reload the first one triggered.
    await expect(withChunkRetry(factory, 'admin')()).rejects.toBe(boom);
    // A broken chunk must not be able to reload the page forever.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('tracks retries per key, so one broken chunk does not spend another chunk\'s retry', async () => {
    withChunkRetry(() => Promise.reject(new Error('x')), 'admin')().catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);

    withChunkRetry(() => Promise.reject(new Error('y')), 'preview')().catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('clears the retry flag on success so a later deploy gets its own retry', async () => {
    // Fail once...
    withChunkRetry(() => Promise.reject(new Error('x')), 'admin')().catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);

    // ...then succeed, which should forget the retry...
    await withChunkRetry(() => Promise.resolve({ ok: true }), 'admin')();

    // ...so a failure after the NEXT deploy is allowed to reload again.
    withChunkRetry(() => Promise.reject(new Error('x')), 'admin')().catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('still reloads when sessionStorage is unavailable (private mode)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    withChunkRetry(() => Promise.reject(new Error('x')), 'admin')().catch(() => {});
    await Promise.resolve();
    await Promise.resolve();

    // One extra reload beats a dead screen, which is the documented trade-off.
    expect(reload).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
