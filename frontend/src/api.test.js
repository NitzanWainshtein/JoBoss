import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Amplify is never exercised for real here: getToken() only needs to hand back a
// string, and the signOut triggered by a 401 is the thing being asserted.
const signOut = vi.fn(() => Promise.resolve());
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(() => Promise.resolve({
    tokens: { idToken: { toString: () => 'test-id-token' } },
  })),
  signOut,
}));

let api;
let fetchMock;

beforeEach(async () => {
  vi.resetModules();          // api.js guards signOut with module state — reset it per test
  signOut.mockClear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(window, 'location', {
    value: { href: 'https://app.test/swipe', reload: vi.fn() },
    writable: true,
    configurable: true,
  });
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  api = await import('./api.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const fail = (status, body = {}) => ({ ok: false, status, json: () => Promise.resolve(body) });

describe('apiCall', () => {
  it('sends the id token and hits the configured base URL', async () => {
    fetchMock.mockResolvedValue(ok({ user: { id: 'u1' } }));
    await api.getMyProfile();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/users/me');
    expect(opts.headers.Authorization).toBe('test-id-token');
    expect(opts.method).toBe('GET');
  });

  it('never falls back to mock data when VITE_USE_MOCK is unset', async () => {
    // The production incident this guards: a build that stopped calling the API
    // and served fabricated data instead, with no error anywhere.
    fetchMock.mockResolvedValue(ok({ user: { id: 'real' } }));
    const res = await api.getMyProfile();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.user.id).toBe('real');
  });

  it('carries status, code and body through on an error response', async () => {
    fetchMock.mockResolvedValue(fail(403, { message: 'Account suspended', code: 'SUSPENDED' }));

    await expect(api.getMyProfile()).rejects.toMatchObject({
      message: 'Account suspended',
      status: 403,
      code: 'SUSPENDED',
    });
  });

  it('signs out and redirects on 401', async () => {
    fetchMock.mockResolvedValue(fail(401, { message: 'Unauthorized' }));

    await expect(api.getMyProfile()).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(window.location.href).toBe('/login');
  });

  it('signs out only once when several parallel calls all 401', async () => {
    // A screen that fires a handful of requests at once used to trigger a signOut
    // and redirect per failure.
    fetchMock.mockResolvedValue(fail(401, { message: 'Unauthorized' }));

    await Promise.allSettled([
      api.getMyProfile(),
      api.getMySwipes(),
      api.getMyApplications(),
      api.getQuotaStatus(),
    ]);

    await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it('leaves 403 to the app instead of signing the user out', async () => {
    // A suspended account has its own screen in App.jsx; signing out would hide it.
    fetchMock.mockResolvedValue(fail(403, { code: 'SUSPENDED' }));

    await expect(api.getMyProfile()).rejects.toMatchObject({ status: 403 });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('turns an aborted request into a TIMEOUT error rather than hanging', async () => {
    fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    }));

    vi.useFakeTimers();
    const pending = api.getMyProfile();
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT', status: 408 });
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
    vi.useRealTimers();
  });

  it('serialises a body only when there is one', async () => {
    fetchMock.mockResolvedValue(ok({}));
    await api.createSwipe('job-1', 'LIKE');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body))
      .toEqual({ jobId: 'job-1', decision: 'LIKE' });

    fetchMock.mockClear();
    await api.getMySwipes();
    expect(fetchMock.mock.calls[0][1].body).toBeNull();
  });
});

describe('getJobs', () => {
  it('requests one page rather than the whole list', async () => {
    // The endpoint used to return every match in one response, which a Lambda caps
    // at 6MB — the screen would have started failing outright around 2,600 jobs.
    fetchMock.mockResolvedValue(ok({ jobs: [], page: {} }));
    await api.getJobs();

    expect(fetchMock.mock.calls[0][0])
      .toBe(`https://api.test/jobs?limit=${api.JOBS_PAGE_SIZE}&offset=0`);
  });

  it('passes an explicit offset through for the next page', async () => {
    fetchMock.mockResolvedValue(ok({ jobs: [], page: {} }));
    await api.getJobs({ offset: 50 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/jobs?limit=50&offset=50');
  });

  it('adds the location filter when a radius is stored, keeping paging', async () => {
    localStorage.setItem('jobLatitude', '32.08');
    localStorage.setItem('jobLongitude', '34.78');
    localStorage.setItem('jobRadius', '25');
    fetchMock.mockResolvedValue(ok({ jobs: [], page: {} }));

    await api.getJobs({ offset: 100 });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.test/jobs?lat=32.08&lng=34.78&radius=25&limit=50&offset=100',
    );
  });

  it('ignores a partial location, so a half-set filter cannot build a bad URL', async () => {
    localStorage.setItem('jobLatitude', '32.08');   // no longitude, no radius
    fetchMock.mockResolvedValue(ok({ jobs: [], page: {} }));

    await api.getJobs();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/jobs?limit=50&offset=0');
  });

  it('falls back to unfiltered jobs and flags it when the filtered call fails', async () => {
    localStorage.setItem('jobLatitude', '32.08');
    localStorage.setItem('jobLongitude', '34.78');
    localStorage.setItem('jobRadius', '25');
    fetchMock
      .mockResolvedValueOnce(fail(500, { message: 'boom' }))
      .mockResolvedValueOnce(ok({ jobs: [{ id: 'j1' }], page: { total: 1 } }));

    const res = await api.getJobs();

    // The flag is what lets the UI say filtering is off instead of failing silently.
    expect(res.locationFilterFailed).toBe(true);
    expect(res.jobs).toHaveLength(1);
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/jobs?limit=50&offset=0');
  });

  it('does not claim a location filter failed when none was requested', async () => {
    fetchMock.mockResolvedValue(ok({ jobs: [], page: {} }));
    const res = await api.getJobs();
    expect(res.locationFilterFailed).toBeUndefined();
  });
});
