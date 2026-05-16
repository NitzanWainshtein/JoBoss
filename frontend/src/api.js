import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

const BASE_URL = import.meta.env.VITE_API_URL || 'mock';

const getToken = async () => {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString();
};

const getUserId = async () => {
  const user = await getCurrentUser();
  return user.userId || user.username;
};

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
export const createSwipe = async (jobId, decision) => {
  const userId = await getUserId();
  return apiCall('POST', '/swipes', { userId, jobId, decision });
};

export const getMySwipes = async () => {
  const userId = await getUserId();
  return apiCall('GET', `/swipes/me?userId=${userId}`);
};

// ===== APPLICATIONS =====
export const createApplication = async (jobId) => {
  const userId = await getUserId();
  return apiCall('POST', '/applications', { userId, jobId, resumeVersionId: 'resume-001' });
};

export const getMyApplications = async () => {
  const userId = await getUserId();
  return apiCall('GET', `/applications?userId=${userId}`);
};

export const updateApplication = async (jobId, status) => {
  const userId = await getUserId();
  return apiCall('PUT', '/applications', { userId, jobId, status });
};

// ===== USERS =====
export const getMyProfile = async () => {
  const userId = await getUserId();
  return apiCall('GET', `/users/me?userId=${userId}`);
};

export const updateMyProfile = async (data) => {
  const userId = await getUserId();
  return apiCall('PUT', '/users/me', { userId, ...data });
};

export const createMyProfile = async (data) => {
  const userId = await getUserId();
  return apiCall('POST', '/users/me', { userId, ...data });
};

// ===== MOCK =====
const mockApplications = [
  { jobId: '1', company: 'Google', title: 'Frontend Developer', date: '15/05/2026', status: 'pending' },
  { jobId: '2', company: 'Microsoft', title: 'Full Stack Developer', date: '14/05/2026', status: 'accepted' },
  { jobId: '3', company: 'Monday.com', title: 'React Developer', date: '13/05/2026', status: 'rejected' },
];

const mockJobs = [
  { jobId: '1', company: 'Google', title: 'Frontend Developer', location: 'Tel Aviv', salary: '25,000 ₪', description: 'פיתוח ממשקי משתמש', requirements: ['React', 'TypeScript'] },
  { jobId: '2', company: 'Microsoft', title: 'Full Stack Developer', location: 'Herzliya', salary: '30,000 ₪', description: 'פיתוח Full Stack', requirements: ['Node.js', 'React'] },
];

const mockResponse = (method, path, body) => {
  if (path === '/jobs') return { jobs: mockJobs };
  if (path.startsWith('/jobs/')) return { job: mockJobs[0] };
  if (path.startsWith('/swipes/me')) return { swipes: [] };
  if (path.startsWith('/applications')) return { applications: mockApplications };
  if (path.startsWith('/users/me')) return { user: { plan: 'FREE', autoApply: false } };
  return { success: true };
};