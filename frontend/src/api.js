import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';

const BASE_URL = import.meta.env.VITE_API_URL || 'mock';
const SUBSCRIPTIONS_BASE_URL = import.meta.env.VITE_SUBSCRIPTIONS_API_URL || BASE_URL;

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

const subscriptionApiCall = async (method, path, body = null) => {
  if (SUBSCRIPTIONS_BASE_URL === 'mock') {
    return mockResponse(method, path, body);
  }

  try {
    const token = await getToken();

    const response = await fetch(`${SUBSCRIPTIONS_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Subscriptions API Error: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Subscriptions API call failed:', method, path, error.message);
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
export const createApplication = async (jobId, data = {}) => {
  return apiCall('POST', '/applications', {
    jobId,
    company: data.company || '',
    title: data.title || '',
    resumeVersionId: data.resumeVersionId || 'resume-001',
    tailoredResumeUrl: data.tailoredResumeUrl,
  });
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
          fileName: file.name
        });
        resolve({
          ...response,
          previewDataUrl: reader.result,
        });
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

// ===== SUBSCRIPTIONS =====
export const getMySubscription = async () => {
  const userId = await getUserId();
  return subscriptionApiCall('GET', `/subscriptions/me?userId=${encodeURIComponent(userId)}`);
};

export const checkoutSubscription = async () => {
  const userId = await getUserId();
  return subscriptionApiCall('POST', '/subscriptions/checkout', { userId });
};

export const cancelSubscription = async () => {
  const userId = await getUserId();
  return subscriptionApiCall('DELETE', '/subscriptions/me', { userId });
};

export const consumeApplicationQuota = async () => {
  const userId = await getUserId();
  return subscriptionApiCall('POST', '/subscriptions/consume', { userId });
};

// ===== AI TAILORING =====
export const tailorResume = async ({ jobId, resumeId, resumeText }) => {
  return apiCall('POST', '/ai/tailor', { jobId, resumeId, resumeText });
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
  { jobId: '3', company: 'Monday.com', title: 'React Developer', location: 'Tel Aviv', salary: '28,000 NIS', description: 'Build product features for a work management platform', requirements: ['React', 'GraphQL'] },
  { jobId: '4', company: 'Wix', title: 'Software Engineer', location: 'Tel Aviv', salary: '27,000 NIS', description: 'Develop scalable web product infrastructure', requirements: ['JavaScript', 'Node.js'] },
  { jobId: '5', company: 'Check Point', title: 'Backend Developer', location: 'Tel Aviv', salary: '32,000 NIS', description: 'Build cloud security services and APIs', requirements: ['Python', 'AWS'] },
  { jobId: '6', company: 'Taboola', title: 'Full Stack Engineer', location: 'Ramat Gan', salary: '29,000 NIS', description: 'Create interfaces and services for recommendation systems', requirements: ['React', 'Java'] },
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

let mockSubscription = {
  userId: 'mock-user',
  plan: 'FREE',
  dailyLimit: 5,
  used: 0,
  resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
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
  if (path === '/applications' && method === 'POST') {
    const job = mockJobs.find((item) => item.jobId === body?.jobId) || mockJobs[0];
    const application = {
      jobId: job.jobId,
      company: body?.company || job.company,
      title: body?.title || job.title,
      date: new Date().toLocaleDateString('he-IL'),
      status: 'pending',
      tailoredResumeUrl: body?.tailoredResumeUrl || null,
    };
    mockApplications.unshift(application);
    return { message: 'Application created', application };
  }
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
  
  if (path === '/subscriptions/me' && method === 'GET') {
    return mockSubscription;
  }
  if (path === '/subscriptions/checkout' && method === 'POST') {
    mockSubscription = {
      ...mockSubscription,
      plan: 'PREMIUM',
      dailyLimit: 50,
    };
    mockProfile.plan = 'PREMIUM';
    return {
      message: 'Mock checkout completed successfully',
      plan: 'PREMIUM',
      dailyLimit: 50,
    };
  }
  if (path === '/subscriptions/me' && method === 'DELETE') {
    mockSubscription = {
      ...mockSubscription,
      plan: 'FREE',
      dailyLimit: 5,
    };
    mockProfile.plan = 'FREE';
    return {
      message: 'Subscription cancelled',
      plan: 'FREE',
      dailyLimit: 5,
    };
  }
  if (path === '/subscriptions/consume' && method === 'POST') {
    if (mockSubscription.used >= mockSubscription.dailyLimit) {
      throw new Error('Daily application limit reached');
    }

    mockSubscription = {
      ...mockSubscription,
      used: mockSubscription.used + 1,
    };

    return {
      message: 'Application quota consumed',
      ...mockSubscription,
    };
  }
  if (path === '/ai/tailor' && method === 'POST') {
    const job = mockJobs.find((item) => item.jobId === body?.jobId) || mockJobs[0];
    const tailoredResume = buildMockTailoredResume(job, body?.resumeText || '');
    return {
      message: 'Tailored resume generated',
      mode: 'mock',
      job,
      sourceResume: {
        resumeId: body?.resumeId || 'mock-resume',
        fileName: 'resume.pdf',
      },
      tailoredResumeId: `tailored_${Date.now()}`,
      tailoredResumeUrl: `s3://joboss-resumes-171109860478/users/mock-user/tailored/${job.jobId}/mock.pdf`,
      tailoredResume,
    };
  }
  return { success: true };
};

const cleanResumeLines = (resumeText) => (
  (resumeText || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 1)
);

const uniqueItems = (items) => [...new Set(items.filter(Boolean))];

const findMatchingSkills = (resumeText, jobSkills) => {
  const knownSkills = [
    'React', 'Node.js', 'JavaScript', 'TypeScript', 'Python', 'Java', 'C#',
    'AWS', 'Lambda', 'DynamoDB', 'SQL', 'MongoDB', 'Git', 'Docker',
    'HTML', 'CSS', 'REST', 'API', 'OOP', 'Agile',
  ];
  const text = resumeText.toLowerCase();
  const skills = uniqueItems([...jobSkills, ...knownSkills])
    .filter((skill) => text.includes(skill.toLowerCase()) || jobSkills.includes(skill));

  return skills.length ? skills : jobSkills;
};

const pickEvidenceLines = (lines, keywords, limit = 5) => {
  const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const matches = lines.filter((line) => {
    const lowerLine = line.toLowerCase();
    return lowerKeywords.some((keyword) => lowerLine.includes(keyword));
  });

  return uniqueItems(matches).slice(0, limit);
};

const findName = (lines) => {
  const firstUseful = lines.find((line) => (
    /^[A-Za-z][A-Za-z\s'-]{3,40}$/.test(line)
    && !/resume|curriculum|student|developer|engineer/i.test(line)
  ));
  return firstUseful || 'Aviv Oz';
};

const compactSentence = (line) => line
  .replace(/^[•\-–]\s*/, '')
  .replace(/\s+/g, ' ')
  .trim();

const findContactLines = (lines) => uniqueItems(lines.filter((line) => (
  /@|\+\d|github\.com|linkedin\.com|kfar sava|israel/i.test(line)
))).slice(0, 4);

const findEducationLines = (lines) => uniqueItems(lines.filter((line) => (
  /computer science|ariel university|bachelor|degree|student|coursework|data structures|algorithms|operating systems/i.test(line)
))).slice(0, 4);

const findExperienceLines = (lines) => uniqueItems(lines.filter((line) => (
  /teva|shift supervisor|led|supervised|maintained|reported|trusted|leadership|communication/i.test(line)
)).map(compactSentence)).slice(0, 5);

const findProjectLines = (lines) => uniqueItems(lines.filter((line) => (
  /tcp chat|fitness studio|library management|developed|implemented|socket|threading|oop|inheritance|polymorphism|github\.com/i.test(line)
)).map(compactSentence)).slice(0, 8);

const bulletize = (items, fallback) => {
  const source = items.length ? items : fallback;
  return source.map((item) => `- ${item}`);
};

const buildMockTailoredResume = (job, resumeText) => {
  const lines = cleanResumeLines(resumeText);
  const jobSkills = job.requirements || job.technologies || [];
  const matchedSkills = findMatchingSkills(resumeText, jobSkills);
  const evidenceKeywords = uniqueItems([
    ...matchedSkills,
    'project',
    'developed',
    'implemented',
    'built',
    'managed',
    'security',
    'leadership',
  ]);
  const evidence = pickEvidenceLines(lines, evidenceKeywords, 6);
  const name = findName(lines);
  const contactLines = findContactLines(lines);
  const educationLines = findEducationLines(lines);
  const experienceLines = findExperienceLines(lines);
  const projectLines = findProjectLines(lines);
  const resumeSkills = matchedSkills.filter((skill) => resumeText.toLowerCase().includes(skill.toLowerCase()));
  const roleSkills = matchedSkills.filter((skill) => jobSkills.includes(skill));
  const safeSkills = uniqueItems([...resumeSkills, ...roleSkills]);
  const requestedSkills = jobSkills.length ? jobSkills.join(', ') : 'full stack development';
  const projectBullets = bulletize(projectLines, evidence.length ? evidence : [
    `Built software projects that demonstrate practical engineering foundations relevant to ${job.title}.`,
    'Applied object-oriented design, problem solving, and implementation skills in academic and personal projects.',
    'Used Git/GitHub and development tools to manage code and project delivery.',
  ]);
  const experienceBullets = bulletize(experienceLines, [
    'Led day-to-day operational responsibilities in a high-trust environment.',
    'Developed communication, ownership, documentation, and incident-response skills.',
  ]);

  return [
    name,
    `${job.title} Candidate | Tailored for ${job.company}`,
    ...contactLines,
    '',
    'PROFESSIONAL SUMMARY',
    `Computer Science student and software developer targeting ${job.title} roles. This version emphasizes the strongest truthful overlap between the existing resume and ${job.company}'s requirements: ${safeSkills.join(', ') || requestedSkills}.`,
    `Strong foundation in software development, OOP, data structures, practical projects, and continuous learning. Positioned for a junior/student full-stack role with emphasis on clean implementation, ownership, and fast ramp-up.`,
    '',
    'TARGETED TECHNICAL SKILLS',
    `Role keywords: ${requestedSkills}`,
    `Resume-supported strengths: ${safeSkills.join(' | ') || 'Python | Java | C | C++ | OOP | Git'}`,
    '',
    'SELECTED PROJECTS',
    ...projectBullets.slice(0, 7),
    '',
    'RELEVANT EXPERIENCE',
    ...experienceBullets,
    '',
    'EDUCATION',
    ...bulletize(educationLines, ['Bachelor degree in Computer Science, Ariel University.']),
    '',
    'TAILORING NOTES',
    `- Prioritized ${job.title} wording and ATS terms connected to ${requestedSkills}.`,
    '- Kept the content grounded in the original resume and avoided inventing experience.',
    '- For a production version, this text should be injected into a designed resume template or edited with a real PDF/template engine.',
  ].filter((line) => line !== '').join('\n');
};
