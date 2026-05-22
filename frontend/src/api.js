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
  const latitude = localStorage.getItem('jobLatitude');
  const longitude = localStorage.getItem('jobLongitude');
  const radius = localStorage.getItem('jobRadius');

  // נסה עם סינון גיאוגרפי, אם timeout - חזור לכל המשרות
  if (latitude && longitude && radius) {
    try {
      return await apiCall('GET', `/jobs?lat=${latitude}&lng=${longitude}&radius=${radius}`);
    } catch (error) {
      console.log('Geocoding timeout, falling back to all jobs');
      // אם נכשל (timeout/CORS) - תחזיר את כל המשרות בלי סינון
      return await apiCall('GET', '/jobs');
    }
  }

  // אחרת, קרא את כל המשרות
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

export const undoSwipe = async (jobId) => {
  return apiCall('DELETE', `/swipes/${jobId}`);
};

// ===== APPLICATIONS =====
export const createApplication = async (jobId, { company = '', title = '', tailoredResumeUrl = '' } = {}) => {
  return apiCall('POST', '/applications', { jobId, company, title, tailoredResumeUrl });
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

export const uploadResume = async (file) => {
  const reader = new FileReader();
  
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const response = await apiCall('POST', '/resumes/upload', {
          file: base64,
          fileName: file.name
        });
        resolve(response);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

let mockSwipes = []; // מערך לשמירת swipes ב-mock mode

let mockProfile = {
  userId: 'mock-user',
  plan: 'FREE',
  autoApply: false,
  preferredLocation: '',
  searchRadius: 20,
  latitude: null,
  longitude: null,
  resumeUrl: null,
  resumes: []
};

const mockResponse = (method, path, body) => {
  if (path === '/jobs') return { jobs: mockJobs };
  if (path.startsWith('/jobs/')) return { job: mockJobs[0] };
  
  // SWIPES
  if (path === '/swipes' && method === 'POST') {
    mockSwipes.push({ jobId: body.jobId, decision: body.decision, swipedAt: new Date().toISOString() });
    return { success: true, message: 'Swipe saved' };
  }
  if (path === '/swipes/me' && method === 'GET') {
    return { swipes: mockSwipes };
  }
  if (path.startsWith('/swipes/') && method === 'DELETE') {
    const jobId = path.split('/')[2];
    mockSwipes = mockSwipes.filter(s => s.jobId !== jobId);
    return { success: true, message: 'Swipe deleted' };
  }
  
  // APPLICATIONS
  if (path.startsWith('/applications')) return { applications: mockApplications };
  
  // RESUMES
  if (path === '/resumes/upload' && method === 'POST') {
    const resumeId = `resume_${Date.now()}`;
    return {
      resumeId,
      resumeUrl: `s3://joboss-resumes-171109860478/users/mock-user/${resumeId}.pdf`,
      fileName: body?.fileName || 'resume.pdf',
      uploadedAt: new Date().toISOString(),
    };
  }
  
  // USERS
  if (path === '/users/me' && method === 'GET') return { user: mockProfile };
  if (path === '/users/me' && method === 'PUT') {
    if (body?.resumeData) {
      const newResume = {
        resumeId: body.resumeData.resumeId,
        url: body.resumeData.resumeUrl,
        fileName: body.resumeData.fileName,
        uploadedAt: body.resumeData.uploadedAt,
        isActive: true,
      };

      mockProfile.resumes = (mockProfile.resumes || []).map((resume) => ({ ...resume, isActive: false }));
      mockProfile.resumes = [newResume, ...mockProfile.resumes].slice(0, 3);
      mockProfile.resumeUrl = newResume.url;
      if (mockProfile.resumes.length > 0) {
        mockProfile.resumes = mockProfile.resumes.map((resume, index) => ({
          ...resume,
          isActive: index === 0,
        }));
      }
    }

    if (body?.action === 'setActive' && body?.resumeId) {
      mockProfile.resumes = (mockProfile.resumes || []).map((resume) => ({
        ...resume,
        isActive: resume.resumeId === body.resumeId,
      }));
      const activeResume = mockProfile.resumes.find((resume) => resume.isActive);
      mockProfile.resumeUrl = activeResume?.url || null;
    }

    if (body?.action === 'delete' && body?.resumeId) {
      const target = (mockProfile.resumes || []).find((resume) => resume.resumeId === body.resumeId);
      mockProfile.resumes = (mockProfile.resumes || []).filter((resume) => resume.resumeId !== body.resumeId);
      if (target?.url === mockProfile.resumeUrl) {
        const nextActive = mockProfile.resumes[0] || null;
        mockProfile.resumes = (mockProfile.resumes || []).map((resume, index) => ({
          ...resume,
          isActive: index === 0,
        }));
        mockProfile.resumeUrl = nextActive?.url || null;
      }
    }

    const allowedFields = ['fullName', 'email', 'preferredLocation', 'searchRadius', 'desiredRole', 'experienceLevel', 'plan', 'role', 'autoApply'];
    allowedFields.forEach((field) => {
      if (body && Object.prototype.hasOwnProperty.call(body, field)) {
        mockProfile[field] = body[field];
      }
    });

    if (body?.resumeUrl !== undefined) {
      mockProfile.resumeUrl = body.resumeUrl;
    }

    return { message: 'User profile updated successfully', user: mockProfile };
  }
  
  return { success: true };
};