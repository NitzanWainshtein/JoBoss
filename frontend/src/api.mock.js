// Mock API backend — used only when VITE_API_URL is not configured (local
// development without AWS). Kept out of api.js so the production client stays
// readable; the mock state lives entirely in this module.

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
  { jobId: '1', company: 'Google', title: 'Frontend Developer', location: 'Tel Aviv', salary: '25,000 ₪', description: 'פיתוח ממשקי משתמש', requirements: ['React', 'TypeScript'] },
  { jobId: '2', company: 'Microsoft', title: 'Full Stack Developer', location: 'Herzliya', salary: '30,000 ₪', description: 'פיתוח Full Stack', requirements: ['Node.js', 'React'] },
];

// Mirrors backend TIER_LIMITS. daily_swipes is the binding daily gate (counts
// LIKEs only); -1 = unlimited.
const PLAN_LIMITS = {
  FREE: { daily_swipes: 5, daily_applications: 5, ai_tailoring: 0 },
  PREMIUM: { daily_swipes: 30, daily_applications: -1, ai_tailoring: 10 },
  PREMIUM_PLUS: { daily_swipes: -1, daily_applications: -1, ai_tailoring: -1 },
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

export const mockResponse = (method, path, body) => {
  // JOBS
  if (path.startsWith('/jobs') && method === 'GET') {
    if (path.includes('/jobs/')) return { job: mockJobs[0] };
    return { jobs: mockJobs };
  }

  // SWIPES
  if (path === '/swipes' && method === 'POST') {
    const plan = mockSubscription.plan;
    const limit = PLAN_LIMITS[plan]?.daily_swipes ?? 5;

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
    const limit = PLAN_LIMITS[plan]?.daily_swipes ?? 5;
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
