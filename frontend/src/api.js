import { fetchAuthSession } from 'aws-amplify/auth';
import { mockResponse } from './api.mock.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'mock';

const getToken = async () => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return token;
};

const apiCall = async (method, path, body = null) => {
  if (BASE_URL === 'mock') {
    return mockResponse(method, path, body);
  }

  try {
    const token = await getToken();
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const error = new Error(err.message || `API Error: ${response.status}`);
      error.status = response.status;
      error.code = err.code;
      error.data = err;
      throw error;
    }

    return response.json();
  } catch (error) {
    console.error('API call failed:', method, path, error.message);
    throw error;
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

export const getJobById = (jobId) => apiCall('GET', `/jobs/${jobId}`);

// ===== SWIPES =====
export const createSwipe = async (jobId, decision, extra = {}) => {
  return apiCall('POST', '/swipes', { jobId, decision, ...extra });
};

export const getMySwipes = async () => apiCall('GET', '/swipes/me');

export const undoSwipe = async (jobId) => apiCall('DELETE', `/swipes/${jobId}`);

export const getQuotaStatus = async () => apiCall('GET', '/swipes/quota');

// ===== APPLICATIONS =====
export const createApplication = async (jobId, { company = '', title = '', tailoredResumeUrl = '' } = {}) => {
  return apiCall('POST', '/applications', { jobId, company, title, tailoredResumeUrl });
};

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

export const getSubscriptionPlans = async () => apiCall('GET', '/subscriptions/plans');

export const createCheckoutSession = async (plan) => {
  return apiCall('POST', '/subscriptions/checkout', { plan });
};

export const cancelSubscription = async () => apiCall('DELETE', '/subscriptions/me');

// Aliases for SubscriptionPage compatibility
export const getMySubscription = getSubscription;
export const checkoutSubscription = createCheckoutSession;

// ===== AI =====
export const tailorResume = async (resumeText, jobDescription) => {
  return apiCall('POST', '/ai/tailor', {
    resume_text: resumeText,
    job_description: jobDescription,
  });
};

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
