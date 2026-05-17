import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

const BASE_URL = import.meta.env.VITE_API_URL || 'mock';

const getToken = async () => {
  const session = await fetchAuthSession({ forceRefresh: true });
  const token = session.tokens?.idToken?.toString();
  console.log('TOKEN:', token ? token.substring(0, 50) + '...' : 'NULL');
  return token;
};

const getUserId = async () => {
  const user = await getCurrentUser();
  return user.userId || user.username;
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
        'Authorization': token
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('API call failed:', method, path, error.message);
    throw error;
  }
};

// ===== JOBS =====
export const getJobs = async () => {
  const location = localStorage.getItem('jobLocation');
  const radius = localStorage.getItem('jobRadius');

  if (!location || !radius) return apiCall('GET', '/jobs');

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'he', 'User-Agent': 'joBoss-app' } }
    );
    const data = await res.json();
    if (data.length > 0) {
      const { lat, lon } = data[0];
      return apiCall('GET', `/jobs?lat=${lat}&lng=${lon}&radius=${radius}`);
    }
  } catch {}

  return apiCall('GET', '/jobs');
};
export const getJobById = (jobId) => apiCall('GET', `/jobs/${jobId}`);

// ===== SWIPES =====
export const createSwipe = async (jobId, decision) => {
  return apiCall('POST', '/swipes', { jobId, decision });
};

export const getMySwipes = async () => {
  return apiCall('GET', '/swipes/me');
};

// ===== APPLICATIONS =====
export const createApplication = async (jobId) => {
  return apiCall('POST', '/applications', { jobId, resumeVersionId: 'resume-001' });
};

export const getMyApplications = async () => {
  return apiCall('GET', '/applications');
};

export const updateApplication = async (jobId, status) => {
  return apiCall('PUT', '/applications', { jobId, status });
};

// ===== USERS =====
export const getMyProfile = async () => {
  return apiCall('GET', '/users/me');
};

export const updateMyProfile = async (data) => {
  return apiCall('PUT', '/users/me', data);
};

export const createMyProfile = async (data) => {
  return apiCall('POST', '/users/me', data);
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