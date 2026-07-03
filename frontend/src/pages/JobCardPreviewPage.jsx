import { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import '../styles/job-card-preview.css';

// ── תמונות רקע — Unsplash placeholders (לא קשורות לחברה/מיקום)
// TODO: החלף בתמונות מקומיות מ-public/job-backgrounds/ לפי קטגוריית משרה
const BG = {
  office:  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=70',
  tech:    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=70',
  outdoor: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=70',
};

// ── Mock data — 3 כרטיסים לדוגמה ──────────────────────────────────────────────
const PREVIEW_JOBS = [
  {
    id: 3,
    companyName: 'Mobileye',
    title: 'Embedded Software Engineer',
    location: 'Israel - Jerusalem',
    distanceKm: 58.1,
    matchScore: 69,
    companyInitial: 'M',
    technologies: ['C', 'C++', 'RTOS', 'Embedded Linux'],
    backgroundImageUrl: BG.outdoor,
    shortSummary: 'Mobileye is hiring an Embedded Software Engineer to develop safety-critical software for autonomous driving systems used worldwide.',
    description: `Summary
Mobileye is hiring an Embedded Software Engineer to develop safety-critical software for autonomous driving systems.

Responsibilities
Design and implement embedded software for automotive safety systems
Ensure compliance with MISRA C and AUTOSAR standards
Optimize software for real-time performance constraints

Requirements
BSc in Electrical Engineering or Computer Science
2+ years in embedded systems development
Knowledge of RTOS concepts
Experience with CAN/LIN communication protocols

Technologies
C, C++, RTOS, Embedded Linux, CAN, AUTOSAR`,
  },
  {
    id: 2,
    companyName: 'Wix',
    title: 'Full Stack Engineer',
    location: 'Israel - Tel Aviv',
    distanceKm: 12.3,
    matchScore: 76,
    companyInitial: 'W',
    technologies: ['React', 'Node.js', 'TypeScript', 'MongoDB'],
    backgroundImageUrl: BG.tech,
    shortSummary: 'Wix is looking for a Full Stack Engineer to join our growing platform team in Tel Aviv, building features used by millions worldwide.',
    description: `Summary
Wix is looking for a Full Stack Engineer to join our growing platform team in Tel Aviv. You will build features used by millions of users worldwide.

Responsibilities
Build end-to-end features from design to production deployment
Maintain and improve existing platform services
Work closely with product and design teams on new capabilities

Requirements
2+ years of full-stack development experience
Proficiency in React and Node.js
Experience with cloud services (AWS or GCP)
Strong communication and collaboration skills

Technologies
React, Node.js, TypeScript, MongoDB, AWS`,
  },
  {
    id: 1,
    companyName: 'VAST',
    title: 'Software Engineer - Technion Fair',
    location: 'Israel - Haifa',
    distanceKm: 74.4,
    matchScore: 82,
    companyInitial: 'V',
    technologies: ['C++', 'Linux', 'Distributed Systems', 'Python'],
    backgroundImageUrl: BG.office,
    shortSummary: 'VAST is seeking a Software Engineer to join our innovative team at the Technion Career Fair, working on high-performance distributed storage systems.',
    description: `Summary
VAST is seeking a Software Engineer to join our innovative team at the Technion Career Fair in Haifa. This role offers hands-on work on high-performance distributed storage systems used by the world's leading enterprises.

Responsibilities
Develop and maintain high-performance storage software in C++
Collaborate with cross-functional teams on system architecture
Write clean, efficient, and well-documented code
Participate in code reviews and technical design sessions

Requirements
BSc or higher in Computer Science or related field
3+ years of experience in C++ development
Strong knowledge of Linux internals and systems programming
Experience with distributed systems design patterns

Technologies
C++, Linux, Python, Git, Kubernetes`,
  },
];

// ── Parse description text לסקציות (זהה ללוגיקה ב-SwipePage) ─────────────────
const SECTION_TITLES = new Set(['summary', 'responsibilities', 'requirements', 'nice to have', 'technologies']);

function parseSections(description = '') {
  const sections = [];
  let current = null;
  description.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
    if (SECTION_TITLES.has(line.toLowerCase())) {
      current = { title: line, items: [] };
      sections.push(current);
    } else {
      if (!current) { current = { title: 'Summary', items: [] }; sections.push(current); }
      current.items.push(line.replace(/^[-•]\s*/, ''));
    }
  });
  return sections;
}

// ── Modal פרטי משרה מלאים (עיצוב זהה לאתר האמיתי) ───────────────────────────
function PreviewDetailModal({ job, onClose }) {
  const sections = parseSections(job.description);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={modalSt.overlay}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        style={modalSt.sheet}
        onClick={e => e.stopPropagation()}
      >
        <div style={modalSt.header}>
          <div style={modalSt.logo}>{job.companyInitial}</div>
          <div style={{ flex: 1 }}>
            <h2 style={modalSt.title}>{job.title}</h2>
            <p style={modalSt.company}>{job.companyName}</p>
          </div>
          <button style={modalSt.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={modalSt.meta}>
          <span style={modalSt.metaItem}>📍 {job.location}</span>
          {job.distanceKm != null && (
            <span style={{ ...modalSt.metaItem, background: '#E8F5E9', color: '#2E7D32' }}>
              🗺 {job.distanceKm.toFixed(1)} ק&quot;מ
            </span>
          )}
          <span style={{ ...modalSt.metaItem, background: '#EDE9FE', color: '#6C4FD4' }}>
            ✦ {job.matchScore}% Match
          </span>
        </div>

        {job.technologies?.length > 0 && (
          <div style={modalSt.section}>
            <p style={modalSt.sectionTitle}>טכנולוגיות נדרשות</p>
            <div style={modalSt.tags}>
              {job.technologies.map(t => <span key={t} style={modalSt.tag}>{t}</span>)}
            </div>
          </div>
        )}

        {sections.length > 0 && (
          <div style={modalSt.section}>
            <p style={modalSt.sectionTitle}>תיאור המשרה</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sections.map(section => {
                const norm = section.title.toLowerCase();
                const isTech   = norm === 'technologies';
                const isBullet = ['responsibilities', 'requirements', 'nice to have'].includes(norm);
                return (
                  <div key={section.title} style={modalSt.descSection}>
                    <h4 style={modalSt.descHeading}>{section.title}</h4>
                    {isTech ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {section.items.join(', ').split(',').map(i => i.trim()).filter(Boolean).map(item => (
                          <span key={item} style={modalSt.techPill}>{item}</span>
                        ))}
                      </div>
                    ) : isBullet ? (
                      <ul style={modalSt.list}>
                        {section.items.map((item, i) => (
                          <li key={i} style={modalSt.listItem}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p style={modalSt.descText}>{section.items.join(' ')}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={modalSt.footer}>
          <button style={modalSt.passBtn} onClick={onClose}>דלג ✕</button>
          <button style={modalSt.applyBtn} onClick={onClose}>הגש ♥</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── כרטיס בודד עם אנימציית גרירה ─────────────────────────────────────────────
function PreviewJobCard({ job, onSwipe, onOpenDetail }) {
  const [isDragging, setIsDragging] = useState(false);
  const x         = useMotionValue(0);
  const rotate    = useTransform(x, [-200, 200], [-25, 25]);
  const opacity   = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
  const likeOp    = useTransform(x, [0, 80], [0, 1]);
  const nopeOp    = useTransform(x, [-80, 0], [1, 0]);

  const handleDragEnd = (_, info) => {
    if (info.offset.x > 100)       onSwipe('right');
    else if (info.offset.x < -100) onSwipe('left');
    setTimeout(() => setIsDragging(false), 150);
  };

  return (
    <motion.div
      style={{ x, rotate, opacity, position: 'absolute' }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      whileTap={{ cursor: 'grabbing' }}
    >
      {/* חותמות YES / NOPE */}
      <motion.div style={{ ...stampSt.base, ...stampSt.like, opacity: likeOp }}>
        <span style={stampSt.likeText}>YES</span>
      </motion.div>
      <motion.div style={{ ...stampSt.base, ...stampSt.nope, opacity: nopeOp }}>
        <span style={stampSt.nopeText}>NOPE</span>
      </motion.div>

      <div className="preview-job-card" style={{ cursor: 'grab' }}>
        {/* Hero */}
        <div
          className="preview-job-card-hero"
          style={{ backgroundImage: `url(${job.backgroundImageUrl})` }}
        >
          <div className="preview-job-card-overlay" />
          <div className="preview-job-card-badge">✦ {job.matchScore}% Match</div>
          <div className="preview-job-card-hero-content">
            <div className="preview-job-card-logo-wrap">
              <span className="preview-job-card-logo-letter">{job.companyInitial}</span>
            </div>
            <div className="preview-job-card-hero-text">
              <span className="preview-job-card-company">{job.companyName}</span>
              <span className="preview-job-card-location">📍 {job.location}</span>
            </div>
          </div>
        </div>

        {/* גוף */}
        <div className="preview-job-card-body">
          <h3 className="preview-job-card-title">{job.title}</h3>
          {job.distanceKm != null && (
            <p className="preview-job-card-distance">🗺 {job.distanceKm.toFixed(1)} ק&quot;מ ממך</p>
          )}
          <div className="preview-job-card-summary-block">
            <span className="preview-job-card-summary-label">Short Summary</span>
            <p className="preview-job-card-summary-text">{job.shortSummary}</p>
          </div>
          <div className="preview-job-card-tech-list">
            {job.technologies.map(t => (
              <span key={t} className="preview-job-card-tech-pill">{t}</span>
            ))}
          </div>
          <button
            className="preview-job-card-details-btn"
            onClick={e => { e.stopPropagation(); if (!isDragging) onOpenDetail(); }}
          >
            לצפייה בפרטים
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── עמוד ראשי ────────────────────────────────────────────────────────────────
export default function JobCardPreviewPage() {
  const [jobs, setJobs]           = useState([...PREVIEW_JOBS]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [feedback, setFeedback]   = useState(null);

  const currentJob = jobs[jobs.length - 1];
  const nextJob    = jobs[jobs.length - 2];

  const handleSwipe = (direction) => {
    if (!currentJob) return;
    setFeedback({ direction, name: currentJob.companyName });
    setJobs(prev => prev.slice(0, -1));
    setTimeout(() => setFeedback(null), 1500);
  };

  return (
    <div className="preview-page">
      <div className="preview-page-label">
        🎨 Design Preview — Job Card · localhost only
      </div>

      {/* Stack כרטיסים */}
      <div style={{ position: 'relative', width: 'min(360px, 95vw)', height: '490px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {jobs.length > 0 ? (
          <>
            {/* הכרטיס הבא — ברקע */}
            {nextJob && (
              <div style={{ position: 'absolute', top: '10px', transform: 'scale(0.95)', opacity: 0.55, filter: 'blur(1.5px)', pointerEvents: 'none' }}>
                <div className="preview-job-card">
                  <div className="preview-job-card-hero" style={{ backgroundImage: `url(${nextJob.backgroundImageUrl})` }}>
                    <div className="preview-job-card-overlay" />
                    <div className="preview-job-card-hero-content">
                      <div className="preview-job-card-logo-wrap">
                        <span className="preview-job-card-logo-letter">{nextJob.companyInitial}</span>
                      </div>
                      <div className="preview-job-card-hero-text">
                        <span className="preview-job-card-company">{nextJob.companyName}</span>
                        <span className="preview-job-card-location">📍 {nextJob.location}</span>
                      </div>
                    </div>
                  </div>
                  <div className="preview-job-card-body">
                    <h3 className="preview-job-card-title">{nextJob.title}</h3>
                  </div>
                </div>
              </div>
            )}

            <AnimatePresence>
              <PreviewJobCard
                key={currentJob.id}
                job={currentJob}
                onSwipe={handleSwipe}
                onOpenDetail={() => setSelectedJob(currentJob)}
              />
            </AnimatePresence>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
          >
            <p style={{ fontSize: '64px', margin: 0 }}>🎉</p>
            <p style={{ fontSize: '18px', fontWeight: 800, color: '#1E2A4A', margin: 0 }}>
              סיימת את ה-Preview!
            </p>
            <button
              onClick={() => setJobs([...PREVIEW_JOBS])}
              style={{ background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '12px 28px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}
            >
              ↺ אפס כרטיסים
            </button>
          </motion.div>
        )}
      </div>

      {/* כפתורי ✕ / ♥ */}
      {jobs.length > 0 && (
        <div className="preview-action-buttons">
          <motion.button
            className="preview-action-btn preview-action-pass"
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={() => handleSwipe('left')}
          >✕</motion.button>
          <motion.button
            className="preview-action-btn preview-action-like"
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={() => handleSwipe('right')}
          >♥</motion.button>
        </div>
      )}

      {feedback && (
        <p className="preview-action-hint">
          {feedback.direction === 'right'
            ? `💾 preview: "${feedback.name}" — אין פעולה אמיתית`
            : `👋 preview: דולג על "${feedback.name}" — אין פעולה אמיתית`}
        </p>
      )}

      <p className="preview-note">
        * תמונות רקע: Unsplash placeholders, לא קשורות לחברה/מיקום —
        החלף ב-public/job-backgrounds/ לפי קטגוריית משרה
      </p>

      {/* Modal פרטים מלאים */}
      <AnimatePresence>
        {selectedJob && (
          <PreviewDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── סטיילים למודל (זהים לאתר האמיתי) ────────────────────────────────────────
const modalSt = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' },
  sheet:       { background: 'white', borderRadius: '20px', padding: '20px 24px 32px', width: 'min(360px, 95vw)', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' },
  header:      { display: 'flex', alignItems: 'center', gap: '12px', direction: 'ltr' },
  logo:        { width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 700, color: 'white', flexShrink: 0 },
  title:       { fontSize: '20px', fontWeight: 800, color: '#1E2A4A', margin: 0 },
  company:     { fontSize: '14px', color: '#6C4FD4', fontWeight: 600, margin: 0 },
  closeBtn:    { background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '14px', flexShrink: 0, marginRight: 'auto' },
  meta:        { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  metaItem:    { background: '#F0F2FF', color: '#6C4FD4', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 },
  section:     { display: 'flex', flexDirection: 'column', gap: '8px' },
  sectionTitle:{ fontSize: '14px', fontWeight: 700, color: '#1E2A4A', margin: 0 },
  tags:        { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  tag:         { background: '#F0F2FF', color: '#6C4FD4', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 },
  descSection: { background: '#F8FAFC', border: '1px solid #EEF2F7', borderRadius: '14px', padding: '14px' },
  descHeading: { fontSize: '14px', fontWeight: 800, color: '#1E2A4A', margin: '0 0 8px' },
  descText:    { fontSize: '14px', color: '#5F6675', lineHeight: 1.65, margin: 0 },
  list:        { margin: 0, paddingInlineStart: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px', direction: 'ltr', textAlign: 'left' },
  listItem:    { fontSize: '14px', color: '#5F6675', lineHeight: 1.55 },
  techPill:    { background: 'white', color: '#6C4FD4', border: '1px solid #DDD6FE', borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: 700 },
  footer:      { display: 'flex', gap: '12px', paddingTop: '8px' },
  passBtn:     { flex: 1, padding: '14px', borderRadius: '14px', border: '2px solid #F44336', background: 'white', color: '#F44336', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
  applyBtn:    { flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
};

// ── סטיילים לחותמות YES/NOPE ─────────────────────────────────────────────────
const stampSt = {
  base:     { position: 'absolute', top: '24px', zIndex: 10, pointerEvents: 'none' },
  like:     { right: '20px', transform: 'rotate(15deg)' },
  nope:     { left: '20px', transform: 'rotate(-15deg)' },
  likeText: { fontSize: '28px', fontWeight: 900, color: '#6C4FD4', border: '3px solid #6C4FD4', borderRadius: '6px', padding: '2px 8px', letterSpacing: '2px', textShadow: 'none' },
  nopeText: { fontSize: '28px', fontWeight: 900, color: '#F44336', border: '3px solid #F44336', borderRadius: '6px', padding: '2px 8px', letterSpacing: '2px' },
};
