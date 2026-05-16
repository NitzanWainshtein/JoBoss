import { fetchAuthSession } from 'aws-amplify/auth';

const BASE_URL = import.meta.env.VITE_API_URL || 'mock';

// פונקציה שמחזירה את הטוקן של המשתמש המחובר
const getToken = async () => {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString();
};

// פונקציה בסיסית לכל קריאות ה-API
const apiCall = async (method, path, body = null) => {
  if (BASE_URL === 'mock') {
    return mockResponse(method, path, body);
  }

  const token = await getToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : null
  });

  return response.json();
};

// ===== JOBS =====
export const getJobs = () => apiCall('GET', '/jobs');
export const getJobById = (jobId) => apiCall('GET', `/jobs/${jobId}`);

// ===== SWIPES =====
export const createSwipe = (jobId, decision) =>
  apiCall('POST', '/swipes', { jobId, decision });
export const getMySwipes = () => apiCall('GET', '/swipes/me');

// ===== APPLICATIONS =====
export const createApplication = (jobId) =>
  apiCall('POST', '/applications', { jobId });
export const getMyApplications = () => apiCall('GET', '/applications');
export const updateApplication = (jobId, status) =>
  apiCall('PUT', '/applications', { jobId, status });

// ===== USERS =====
export const getMyProfile = () => apiCall('GET', '/users/me');
export const updateMyProfile = (data) => apiCall('PUT', '/users/me', data);

// ===== MOCK (זמני עד שהבאקאנד מוכן) =====
import mockJobs from './data/mockJobs';

const mockApplications = [
  { jobId: '1', company: 'Google', title: 'Frontend Developer', date: '15/05/2026', status: 'pending' },
  { jobId: '2', company: 'Microsoft', title: 'Full Stack Developer', date: '14/05/2026', status: 'accepted' },
  { jobId: '3', company: 'Monday.com', title: 'React Developer', date: '13/05/2026', status: 'rejected' },
];

const mockResponse = (method, path, body) => {
  if (path === '/jobs') return { jobs: mockJobs };
  if (path.startsWith('/jobs/')) return { job: mockJobs[0] };
  if (path === '/swipes/me') return { swipes: [] };
  if (path === '/applications') return { applications: mockApplications };
  if (path === '/users/me') return { user: { plan: 'free', autoApply: false } };
  return { success: true };
};