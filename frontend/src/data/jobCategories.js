export const JOB_CATEGORIES = [
  {
    group: 'Frontend',
    icon: '🎨',
    roles: ['Frontend Developer', 'React Developer', 'Vue Developer', 'Angular Developer', 'UI Developer', 'Next.js Developer'],
  },
  {
    group: 'Backend',
    icon: '⚙️',
    roles: ['Backend Developer', 'Node.js Developer', 'Python Developer', 'Java Developer', '.NET Developer', 'Ruby Developer', 'Go Developer', 'PHP Developer'],
  },
  {
    group: 'Full Stack',
    icon: '🔄',
    roles: ['Full Stack Developer', 'MEAN/MERN Developer', 'Software Engineer'],
  },
  {
    group: 'Mobile',
    icon: '📱',
    roles: ['iOS Developer', 'Android Developer', 'React Native Developer', 'Flutter Developer', 'Mobile Developer'],
  },
  {
    group: 'DevOps & Cloud',
    icon: '☁️',
    roles: ['DevOps Engineer', 'Cloud Engineer', 'AWS Engineer', 'SRE', 'Platform Engineer', 'Infrastructure Engineer', 'Kubernetes Engineer'],
  },
  {
    group: 'Data & AI',
    icon: '🤖',
    roles: ['Data Scientist', 'Data Analyst', 'Data Engineer', 'ML Engineer', 'AI Engineer', 'BI Developer', 'NLP Engineer'],
  },
  {
    group: 'QA & Testing',
    icon: '🧪',
    roles: ['QA Engineer', 'Automation Engineer', 'SDET', 'Performance Engineer', 'Manual QA'],
  },
  {
    group: 'Security',
    icon: '🔒',
    roles: ['Security Engineer', 'Penetration Tester', 'SOC Analyst', 'AppSec Engineer', 'Cybersecurity Analyst'],
  },
  {
    group: 'Product & Management',
    icon: '📋',
    roles: ['Product Manager', 'Project Manager', 'Scrum Master', 'Technical Program Manager', 'Engineering Manager'],
  },
  {
    group: 'Design',
    icon: '✏️',
    roles: ['UX Designer', 'UI Designer', 'Product Designer', 'UX Researcher', 'Graphic Designer'],
  },
  {
    group: 'Other',
    icon: '🌐',
    roles: ['Technical Writer', 'Solutions Architect', 'Pre-Sales Engineer', 'Support Engineer', 'Developer Advocate'],
  },
];

export const ALL_ROLES = JOB_CATEGORIES.flatMap(c => c.roles);
