import { fetchAuthSession } from 'aws-amplify/auth';

// Mock mode must be asked for explicitly. It used to be the fallback for a missing
// VITE_API_URL, which is how a production deploy once came up serving fabricated
// data with no error anywhere: an empty admin panel, no profiles, no CVs, and
// returning users pushed into onboarding, while the database was untouched.
//
// Opting in by name means the only way to get mock data is to have written
// VITE_USE_MOCK=true, and vite.config.js refuses to build without VITE_API_URL —
// so there is no longer a path where a real build quietly stops calling the API.
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const getToken = async () => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return token;
};

// A request that never settles is worse than one that fails: the UI keeps its
// spinner forever with no error to react to. Cap every call.
const REQUEST_TIMEOUT_MS = 30000;

// Session expiry used to surface as a wall of generic errors on every screen,
// because each caller had to notice 401 for itself (and only one did). Handle it
// once, here: sign out and bounce to /login so the user gets an explicable state.
//
// Guarded by a module-level flag — a screen that fires several calls in parallel
// would otherwise trigger a signOut + redirect per failure.
let signingOut = false;

const forceSignOut = async () => {
  if (signingOut) return;
  signingOut = true;
  try {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
  } catch {
    // Even if Amplify can't reach Cognito, still get the user to a sane screen.
  }
  window.location.href = '/login';
};

const apiCall = async (method, path, body = null) => {
  if (USE_MOCK) {
    // Dynamic import so the fixtures are only pulled in when mock mode is on.
    // USE_MOCK is a compile-time constant, so in a real build this whole branch —
    // and api.mock.js with it — is dropped from the bundle rather than shipped as
    // unreachable code.
    const { mockResponse } = await import('./api.mock.js');
    return mockResponse(method, path, body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const token = await getToken();
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
      body: body ? JSON.stringify(body) : null,
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const error = new Error(err.message || `API Error: ${response.status}`);
      error.status = response.status;
      error.code = err.code;
      error.data = err;

      // 401 = the token is gone or no longer valid. Nothing the caller can do.
      // A suspended account is a 403 with its own code and is deliberately left
      // to App.jsx, which has a dedicated screen for it.
      if (response.status === 401) {
        forceSignOut();
      }

      throw error;
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeout = new Error('הבקשה ארכה יותר מדי — נסה שוב');
      timeout.code = 'TIMEOUT';
      timeout.status = 408;
      console.error('API call timed out:', method, path);
      throw timeout;
    }
    console.error('API call failed:', method, path, error.message);
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

// ===== JOBS =====
export const getJobs = async () => {
  const latitude = localStorage.getItem('jobLatitude');
  const longitude = localStorage.getItem('jobLongitude');
  const radius = localStorage.getItem('jobRadius');

  if (latitude && longitude && radius) {
    try {
      return await apiCall('GET', `/jobs?lat=${latitude}&lng=${longitude}&radius=${radius}`);
    } catch (error) {
      // Fall back to unfiltered jobs, but tell the caller so the UI can show
      // that radius filtering is off instead of failing silently.
      console.warn('Location-filtered jobs failed, falling back to unfiltered:', error?.message);
      const data = await apiCall('GET', '/jobs');
      return { ...data, locationFilterFailed: true };
    }
  }
  return apiCall('GET', '/jobs');
};

// ===== SWIPES =====
export const createSwipe = async (jobId, decision, extra = {}) => {
  return apiCall('POST', '/swipes', { jobId, decision, ...extra });
};

export const getMySwipes = async () => apiCall('GET', '/swipes/me');

export const undoSwipe = async (jobId) => apiCall('DELETE', `/swipes/${jobId}`);

export const getQuotaStatus = async () => apiCall('GET', '/swipes/quota');

// ===== APPLICATIONS =====
// Applications are created server-side by the swipes Lambda on a LIKE, so there
// is deliberately no client-side create here.
export const getMyApplications = async () => apiCall('GET', '/applications');

export const updateApplication = async (jobId, status) => {
  return apiCall('PUT', '/applications', { jobId, status });
};

export const clearApplicationTailoring = async (jobId) => {
  return apiCall('PUT', '/applications', { jobId, clearTailoring: true });
};

export const deleteApplications = async (jobIds) => {
  return apiCall('DELETE', '/applications', { jobIds });
};

// ===== USERS =====
export const getMyProfile = async () => apiCall('GET', '/users/me');

export const updateMyProfile = async (data) => apiCall('PUT', '/users/me', data);

export const createMyProfile = async (data) => apiCall('POST', '/users/me', data);

// Downscale an image client-side (canvas → JPEG). Avatars don't need 5MB:
// large originals inflated by base64 used to exceed the 6MB Lambda invoke
// cap and the gateway rejected them before the Lambda ever ran.
const downscaleImage = (file, maxDim = 512, quality = 0.85) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('image processing failed'))),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('invalid image')); };
    img.src = url;
  });

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export const uploadProfileImage = async (file) => {
  let payload = file;
  let fileName = file.name;
  try {
    payload = await downscaleImage(file);
    fileName = (file.name.replace(/\.[^.]+$/, '') || 'profile') + '.jpg';
  } catch {
    // Unsupported format for canvas (e.g. some HEICs) — send the original.
  }
  const base64 = await blobToBase64(payload);
  return apiCall('POST', '/profile/image', { image: base64, fileName });
};

export const removeProfileImage = async () => {
  return apiCall('POST', '/profile/image', { remove: true });
};

const MAX_RESUME_BYTES = 10 * 1024 * 1024; // keep in sync with the uploads Lambda

export const uploadResume = async (file) => {
  if (file.size > MAX_RESUME_BYTES) {
    const error = new Error('הקובץ גדול מדי — עד 10MB');
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }

  // Ask the backend for a presigned POST policy, then upload the file straight
  // to S3. S3 enforces content-length-range server-side, so an oversized file
  // is rejected even if this client-side check is bypassed.
  const { upload, uploadUrl, ...meta } = await apiCall('POST', '/resumes/upload', {
    fileName: file.name,
    contentType: file.type || 'application/pdf',
  });

  if (upload?.url) {
    const form = new FormData();
    Object.entries(upload.fields || {}).forEach(([k, v]) => form.append(k, v));
    form.append('file', file); // must be the last field in an S3 POST policy
    const postResponse = await fetch(upload.url, { method: 'POST', body: form });
    if (!postResponse.ok) {
      const error = new Error(`Resume upload failed: ${postResponse.status}`);
      error.status = postResponse.status;
      throw error;
    }
  } else if (uploadUrl) {
    // Older Lambda still deployed — presigned PUT fallback.
    const putResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });
    if (!putResponse.ok) {
      const error = new Error(`Resume upload failed: ${putResponse.status}`);
      error.status = putResponse.status;
      throw error;
    }
  }

  return meta;
};

// ===== SUBSCRIPTIONS =====
export const getSubscription = async () => apiCall('GET', '/subscriptions/me');

export const createCheckoutSession = async (plan) => {
  return apiCall('POST', '/subscriptions/checkout', { plan });
};

export const cancelSubscription = async () => apiCall('DELETE', '/subscriptions/me');

// ===== AI =====
export const analyzeCV = async (resumeUrl) => {
  return apiCall('POST', '/ai/analyze-cv', { resumeUrl });
};

export const explainFailure = async (jobId) => {
  return apiCall('POST', '/ai/explain-failure', { jobId });
};

// ===== ADMIN =====
export const adminPing           = ()           => apiCall('GET',    '/admin/ping');
export const adminGetStats       = ()           => apiCall('GET',    '/admin/stats');
export const adminGetUsers       = ()           => apiCall('GET',    '/admin/users');
export const adminGetJobs        = ()           => apiCall('GET',    '/admin/jobs');
export const adminUpdateUserPlan = (uid, plan)  => apiCall('PUT',    `/admin/users/${uid}/plan`,        { plan });
export const adminResetUserQuota = (uid)        => apiCall('POST',   `/admin/users/${uid}/reset-quota`, {});
export const adminBlockUser      = (uid, block) => apiCall('PUT',    `/admin/users/${uid}/block`,       { blocked: block });
export const adminDeleteUser     = (uid)        => apiCall('DELETE', `/admin/users/${uid}`);
export const adminGrantAdmin     = (uid, pass)  => apiCall('POST',   `/admin/users/${uid}/grant-admin`,  { password: pass });
export const adminRevokeAdmin    = (uid, pass)  => apiCall('POST',   `/admin/users/${uid}/revoke-admin`, { password: pass });
export const adminToggleJob      = (jid, act)   => apiCall('PUT',    `/admin/jobs/${jid}`,              { active: act });
export const adminTriggerImport  = ()           => apiCall('POST',   '/admin/jobs/import',              {});
export const adminImportStatus   = ()           => apiCall('GET',    '/admin/jobs/import-status');
export const adminDeleteJobs     = (jobIds)     => apiCall('DELETE', '/admin/jobs',                     { jobIds });
export const adminResetMyQuota   = (plan)       => apiCall('POST',   '/admin/reset-my-quota',           { plan });
export const adminResetMySwipes  = ()           => apiCall('POST',   '/admin/reset-my-swipes',           {});

export const tailorCVForJob = async (jobId, force = false) => {
  return apiCall('POST', '/ai/tailor', { jobId, ...(force && { force: true }) });
};
