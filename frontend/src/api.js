import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

const BASE_URL = import.meta.env.VITE_API_URL || 'mock';

const getToken = async () => {
  const session = await fetchAuthSession({ forceRefresh: true });
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
    } catch {
      return await apiCall('GET', '/jobs');
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

// ===== USERS =====
export const getMyProfile = async () => apiCall('GET', '/users/me');

export const updateMyProfile = async (data) => apiCall('PUT', '/users/me', data);

export const createMyProfile = async (data) => apiCall('POST', '/users/me', data);

export const uploadProfileImage = async (file) => {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const response = await apiCall('POST', '/profile/image', {
          image: base64,
          fileName: file.name,
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

export const uploadResume = async (file) => {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const response = await apiCall('POST', '/resumes/upload', {
          file: base64,
          fileName: file.name,
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

export const tailorCVForJob = async (jobId) => {
  return apiCall('POST', '/ai/tailor', { jobId });
};

// ===== MOCK =====

// Mock subscription state
let mockSubscription = {
  userId: 'mock-user',
  plan: 'FREE',
  status: 'FREE',
  dailyApplicationsUsed: 0,
  aiUsedThisMonth: 0,
};

const mockApplications = [
  { jobId: '1', company: 'Google', title: 'Frontend Developer', createdAt: new Date().toISOString(), status: 'SUBMITTED' },
  { jobId: '2', company: 'Microsoft', title: 'Full Stack Developer', createdAt: new Date().toISOString(), status: 'ACCEPTED' },
  { jobId: '3', company: 'Monday.com', title: 'React Developer', createdAt: new Date().toISOString(), status: 'REJECTED' },
];

const mockJobs = [
  { jobId: '1', company: 'Google', title: 'Frontend Developer', location: 'Tel Aviv', salary: '25,000 âª', description: '×¤××ª×× ×××©×§× ××©×ª××©', requirements: ['React', 'TypeScript'] },
  { jobId: '2', company: 'Microsoft', title: 'Full Stack Developer', location: 'Herzliya', salary: '30,000 âª', description: '×¤××ª×× Full Stack', requirements: ['Node.js', 'React'] },
];

const PLAN_LIMITS = {
  FREE: { daily_applications: 5, ai_tailoring: 0 },
  PREMIUM: { daily_applications: -1, ai_tailoring: 10 },
  PREMIUM_PLUS: { daily_applications: -1, ai_tailoring: -1 },
};

let mockSwipes = [];
let mockProfile = {
  userId: 'mock-user',
  plan: 'FREE',
  autoApply: false,
  preferredLocation: '',
  searchRadius: 20,
  resumeUrl: null,
  resumes: [],
};

const getResetTime = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
};

const mockResponse = (method, path, body) => {
  // JOBS
  if (path.startsWith('/jobs') && method === 'GET') {
    if (path.includes('/jobs/')) return { job: mockJobs[0] };
    return { jobs: mockJobs };
  }

  // SWIPES
  if (path === '/swipes' && method === 'POST') {
    const plan = mockSubscription.plan;
    const limit = PLAN_LIMITS[plan]?.daily_applications ?? 5;

    if (body.decision === 'LIKE' && limit !== -1) {
      if (mockSubscription.dailyApplicationsUsed >= limit) {
        const err = new Error('Daily application limit reached');
        err.status = 429;
        err.code = 'LIMIT_REACHED';
        err.data = {
          code: 'LIMIT_REACHED',
          plan,
          limit,
          used: mockSubscription.dailyApplicationsUsed,
          remaining: 0,
          resetAt: getResetTime(),
        };
        throw err;
      }
      mockSubscription.dailyApplicationsUsed++;
    }

    mockSwipes.push({ jobId: body.jobId, decision: body.decision, swipedAt: new Date().toISOString() });

    const remaining = limit === -1 ? -1 : Math.max(0, limit - mockSubscription.dailyApplicationsUsed);
    return {
      message: 'Swipe recorded',
      decision: body.decision,
      quota: { plan, limit, remaining, resetAt: limit !== -1 ? getResetTime() : null },
    };
  }

  if (path === '/swipes/me' && method === 'GET') return { swipes: mockSwipes };

  if (path.startsWith('/swipes/') && method === 'DELETE') {
    const jobId = path.split('/').pop();
    mockSwipes = mockSwipes.filter(s => s.jobId !== jobId);
    if (mockSubscription.dailyApplicationsUsed > 0) mockSubscription.dailyApplicationsUsed--;
    return { message: 'Swipe undone' };
  }

  if (path === '/swipes/quota' && method === 'GET') {
    const plan = mockSubscription.plan;
    const limit = PLAN_LIMITS[plan]?.daily_applications ?? 5;
    const used = mockSubscription.dailyApplicationsUsed;
    return {
      plan,
      limit,
      used,
      remaining: limit === -1 ? -1 : Math.max(0, limit - used),
      unlimited: limit === -1,
      resetAt: limit !== -1 ? getResetTime() : null,
    };
  }

  // APPLICATIONS
  if (path.startsWith('/applications')) return { applications: mockApplications };

  // RESUMES
  if (path === '/resumes/upload' && method === 'POST') {
    return {
      resumeId: `resume_${Date.now()}`,
      resumeUrl: `s3://joboss-resumes-171109860478/users/mock-user/resume.pdf`,
      fileName: body?.fileName || 'resume.pdf',
      uploadedAt: new Date().toISOString(),
    };
  }

  // AI
  if (path === '/ai/analyze-cv' && method === 'POST') {
    return {
      suggestedRoles: ['Full Stack Developer', 'React Developer', 'Frontend Developer'],
      experienceLevel: 'Mid',
      technologies: ['React', 'JavaScript', 'Node.js'],
    };
  }

  if (path === '/ai/tailor' && method === 'POST') {
    const plan = mockSubscription.plan;
    const limit = PLAN_LIMITS[plan]?.ai_tailoring ?? 0;
    if (limit === 0) {
      const err = new Error('AI not available on Free plan');
      err.status = 403;
      err.code = 'AI_NOT_AVAILABLE';
      err.data = { code: 'AI_NOT_AVAILABLE', plan };
      throw err;
    }
    if (limit !== -1 && mockSubscription.aiUsedThisMonth >= limit) {
      const err = new Error('Monthly AI limit reached');
      err.status = 429;
      err.code = 'AI_LIMIT_REACHED';
      err.data = { code: 'AI_LIMIT_REACHED', plan, limit, used: mockSubscription.aiUsedThisMonth };
      throw err;
    }
    if (limit !== -1) mockSubscription.aiUsedThisMonth++;
    return {
      message: 'Tailored resume generated',
      tailored_resume: `[Mock AI] Tailored CV for: ${body?.job_description?.substring(0, 50)}...`,
      quota: { remaining: limit === -1 ? -1 : Math.max(0, limit - mockSubscription.aiUsedThisMonth), limit },
    };
  }

  // SUBSCRIPTIONS
  if (path === '/subscriptions/me' && method === 'GET') {
    return {
      subscription: mockSubscription,
      planKey: mockSubscription.plan,
      planDetails: PLAN_LIMITS[mockSubscription.plan],
    };
  }

  if (path === '/subscriptions/checkout' && method === 'POST') {
    // Mock: immediately upgrade
    mockSubscription = { ...mockSubscription, plan: body.plan, status: 'TRIAL', dailyApplicationsUsed: 0 };
    mockProfile.plan = body.plan;
    return { checkoutUrl: `${window.location.origin}/profile?subscription=success&plan=${body.plan}`, sessionId: 'mock_session' };
  }

  if (path === '/subscriptions/me' && method === 'DELETE') {
    mockSubscription = { ...mockSubscription, status: 'CANCELLED', cancelAtPeriodEnd: true };
    return { message: 'Subscription will be cancelled at period end' };
  }

  if (path === '/subscriptions/plans') {
    return { plans: PLAN_LIMITS };
  }

  // USERS
  if (path === '/users/me' && method === 'GET') return { user: mockProfile };
  if (path === '/users/me' && method === 'PUT') {
    if (body?.resumeData) {
      const newResume = { resumeId: body.resumeData.resumeId, url: body.resumeData.resumeUrl, fileName: body.resumeData.fileName, uploadedAt: body.resumeData.uploadedAt, isActive: true };
      mockProfile.resumes = (mockProfile.resumes || []).map(r => ({ ...r, isActive: false }));
      mockProfile.resumes = [newResume, ...mockProfile.resumes].slice(0, 3);
      mockProfile.resumeUrl = newResume.url;
    }
    const allowed = ['fullName', 'email', 'preferredLocation', 'searchRadius', 'desiredRole', 'experienceLevel', 'plan', 'role', 'autoApply'];
    allowed.forEach(f => { if (body && f in body) mockProfile[f] = body[f]; });
    return { message: 'Updated', user: mockProfile };
  }

  return { success: true };
};
