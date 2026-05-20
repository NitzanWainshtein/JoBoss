import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';
import { getJobs, createSwipe, createApplication, updateMyProfile } from '../api';

function JobDetailModal({ job, onClose }) {
  const [logoError, setLogoError] = useState(false);
  const logoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(job.company)}.com&sz=128`;
  const companyInitial = job.company?.charAt(0).toUpperCase() || '?';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={modal.overlay}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        style={modal.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={modal.handle} />

        <div style={modal.header}>
          {!logoError ? (
            <img
              src={logoUrl}
              alt={job.company}
              style={modal.logo}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div style={modal.logo_placeholder}>
              {companyInitial}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h2 style={modal.title}>{job.title}</h2>
            <p style={modal.company}>{job.company}</p>
          </div>
          <button style={modal.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={modal.meta}>
          <span style={modal.metaItem}>📍 {job.location}</span>
          <span style={modal.metaItem}>💰 {job.salary || 'לא צוין'}</span>
          {job.jobType && <span style={modal.metaItem}>⏱ {job.jobType}</span>}
          {job.distanceKm != null && (
            <span style={{ ...modal.metaItem, background: '#E8F5E9', color: '#2E7D32' }}>
              🗺 {job.distanceKm.toFixed(1)} ק"מ
            </span>
          )}
        </div>

        {(job.technologies || job.requirements)?.length > 0 && (
          <div style={modal.section}>
            <p style={modal.sectionTitle}>טכנולוגיות נדרשות</p>
            <div style={modal.tags}>
              {(job.technologies || job.requirements).map((tech) => (
                <span key={tech} style={modal.tag}>{tech}</span>
              ))}
            </div>
          </div>
        )}

        {job.description && (
          <div style={modal.section}>
            <p style={modal.sectionTitle}>תיאור המשרה</p>
            <p style={modal.description}>{job.description}</p>
          </div>
        )}

        {job.applyUrl && (
          <div style={modal.section}>
            <a href={job.applyUrl} target="_blank" rel="noreferrer" style={modal.applyLink}>
              🔗 לינק למשרה המקורית
            </a>
          </div>
        )}

        <div style={modal.footer}>
          <button style={modal.passBtn} onClick={onClose}>דלג ✕</button>
          <button style={modal.applyBtn} onClick={() => { onClose('apply'); }}>הגש ♥</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function JobCard({ job, onSwipe, onOpenDetail }) {
  const [isDragging, setIsDragging] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (e, info) => {
    if (info.offset.x > 100) onSwipe('right');
    else if (info.offset.x < -100) onSwipe('left');
    
    setTimeout(() => setIsDragging(false), 150);
  };

  const handleTap = () => {
    if (!isDragging) {
      onOpenDetail();
    }
  };

  const [logoError, setLogoError] = useState(false);
  const logoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(job.company)}.com&sz=128`;
  const companyInitial = job.company?.charAt(0).toUpperCase() || '?';

  return (
    <motion.div
      style={{ x, rotate, opacity, ...styles.card, zIndex: 1 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTap={handleTap}
      whileTap={{ cursor: 'grabbing' }}
    >
      <motion.div style={{ ...styles.stamp, ...styles.likeStamp, opacity: likeOpacity }}>✅ YES</motion.div>
      <motion.div style={{ ...styles.stamp, ...styles.nopeStamp, opacity: nopeOpacity }}>❌ NOPE</motion.div>

      <div style={styles.cardHeader}>
        {!logoError ? (
          <img 
            src={logoUrl} 
            alt={job.company} 
            style={styles.logo_img}
            onError={() => setLogoError(true)} 
          />
        ) : (
          <div style={styles.logo_placeholder}>
            {companyInitial}
          </div>
        )}
        <div>
          <h2 style={styles.company}>{job.company}</h2>
          <p style={styles.location}>📍 {job.location}</p>
        </div>
      </div>
      <h3 style={styles.title}>{job.title}</h3>
      <p style={styles.salary}>💰 {job.salary || job.jobType || 'לא צוין'}</p>
      {job.distanceKm != null && (
        <p style={styles.distance}>🗺 {job.distanceKm.toFixed(1)} ק"מ ממך</p>
      )}
      <p style={styles.description}>{job.description}</p>
      <div style={styles.techContainer}>
        {(job.technologies || job.requirements || []).map((tech) => (
          <span key={tech} style={styles.techBadge}>{tech}</span>
        ))}
      </div>
      <p style={styles.tapHint}>לחץ לפרטים נוספים 👆</p>
    </motion.div>
  );
}

function SwipePage() {
  const [jobs, setJobs] = useState([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSwipe, setLastSwipe] = useState(null);
  const [swipedRight, setSwipedRight] = useState(0);
  const [selectedJob, setSelectedJob] = useState(null);
  const [locationFilter, setLocationFilter] = useState(null);
  const [autoApply, setAutoApply] = useState(false);
  const [location, setLocation] = useState(localStorage.getItem('jobLocation') || '');
  const [radius, setRadius] = useState(localStorage.getItem('jobRadius') || '');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const navigate = useNavigate();

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getJobs();
      const jobList = data.jobs || [];
      setJobs(jobList);
      setTotalJobs(jobList.length);

      const lat = localStorage.getItem('jobLatitude');
      const lng = localStorage.getItem('jobLongitude');
      const radius = localStorage.getItem('jobRadius');
      const locationName = localStorage.getItem('jobLocation');
      if (lat && lng && radius) {
        setLocationFilter({ name: locationName || 'מיקום נוכחי', radius: Number(radius) });
      } else {
        setLocationFilter(null);
      }
    } catch {
      setError('אין חיבור לשרת. אנא נסה שוב מאוחר יותר.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (loadingProfile) return; // לא לשמור בזמן טעינה ראשונית

    const saveTimer = setTimeout(async () => {
      const latitude = localStorage.getItem('jobLatitude');
      const longitude = localStorage.getItem('jobLongitude');

      if (!latitude || !longitude || !location) return;

      localStorage.setItem('autoApply', autoApply);
      localStorage.setItem('jobLocation', location);
      localStorage.setItem('jobRadius', radius);

      try {
        await updateMyProfile({
          autoApply,
          preferredLocation: location,
          ...(radius ? { searchRadius: Number(radius) } : {})
        });
        console.log('✅ הגדרות נשמרו אוטומטית');
      } catch (e) {
        console.error('שגיאה בשמירה:', e);
      }
    }, 1000); // המתן שנייה אחרי שינוי

    return () => clearTimeout(saveTimer);
  }, [location, radius, autoApply, loadingProfile]);

  const currentJob = jobs[jobs.length - 1];
  const nextJob = jobs[jobs.length - 2];

  const handleSwipe = (direction) => {
    if (!currentJob) return;
    setLastSwipe({ direction, job: currentJob });
    if (direction === 'right') {
      setSwipedRight((prev) => prev + 1);
      createSwipe(currentJob.jobId, 'LIKE');
      createApplication(currentJob.jobId);
    } else {
      createSwipe(currentJob.jobId, 'PASS');
    }
    setJobs((prev) => prev.slice(0, -1));
  };

  const handleModalClose = (action) => {
    if (action === 'apply') handleSwipe('right');
    setSelectedJob(null);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Spinner text="טוען משרות..." />
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', gap: '16px' }}>
      <p style={{ fontSize: '48px' }}>⚠️</p>
      <p style={{ fontSize: '18px', fontWeight: 700, color: '#F44336' }}>{error}</p>
      <button
        style={{ background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white', border: 'none', borderRadius: '20px', padding: '12px 24px', cursor: 'pointer', fontWeight: 700 }}
        onClick={loadJobs}
      >
        נסה שוב
      </button>
    </div>
  );

  return (
    <div style={styles.container}>
      {locationFilter && (
        <div style={styles.filterBanner}>
          <span>📍 {locationFilter.name} · עד {locationFilter.radius} ק"מ</span>
          <button style={styles.refreshBtn} onClick={loadJobs} title="רענן משרות">
            🔄
          </button>
        </div>
      )}

      <div style={styles.cardContainer}>
        {jobs.length === 0 ? (
          <motion.div
            style={styles.emptyState}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
          >
            <motion.p style={{ fontSize: '80px', margin: 0 }} animate={{ rotate: [0, 10, -10, 10, 0] }} transition={{ duration: 1, delay: 0.3 }}>🎉</motion.p>
            <p style={styles.emptyTitle}>סיימת את כל המשרות!</p>
            <p style={styles.emptySubtitle}>חזור מחר למשרות חדשות</p>
            <div style={styles.emptyStats}>
              <div style={styles.emptyStatItem}>
                <p style={styles.emptyStatNumber}>{totalJobs}</p>
                <p style={styles.emptyStatLabel}>משרות נסקרו</p>
              </div>
              <div style={styles.emptyStatDivider} />
              <div style={styles.emptyStatItem}>
                <p style={styles.emptyStatNumber}>{swipedRight}</p>
                <p style={styles.emptyStatLabel}>הגשות נשלחו</p>
              </div>
            </div>
            <motion.button style={styles.emptyBtn} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/dashboard')}>
              📋 ראה את ההגשות שלך
            </motion.button>
          </motion.div>
        ) : (
          <>
            {nextJob && (
              <motion.div style={{ ...styles.card, position: 'absolute', zIndex: 0, top: '10px', filter: 'blur(1.5px)', opacity: 0.6, transform: 'scale(0.95)', pointerEvents: 'none' }}>
                <div style={styles.cardHeader}>
                  <div style={{
                    width: '52px', height: '52px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '24px', fontWeight: 700, color: 'white', border: '1px solid #eee'
                  }}>
                    {nextJob.company?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div>
                    <h2 style={styles.company}>{nextJob.company}</h2>
                    <p style={styles.location}>📍 {nextJob.location}</p>
                  </div>
                </div>
                <h3 style={styles.title}>{nextJob.title}</h3>
                <p style={styles.salary}>💰 {nextJob.salary || nextJob.jobType || 'לא צוין'}</p>
              </motion.div>
            )}

            <AnimatePresence>
              <JobCard
                key={currentJob.jobId}
                job={currentJob}
                onSwipe={handleSwipe}
                onOpenDetail={() => setSelectedJob(currentJob)}
              />
            </AnimatePresence>
          </>
        )}
      </div>

      {jobs.length > 0 && (
        <div style={styles.buttons}>
          <motion.button style={styles.rejectBtn} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleSwipe('left')}>✕</motion.button>
          <motion.button style={styles.acceptBtn} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleSwipe('right')}>♥</motion.button>
        </div>
      )}

      {lastSwipe && jobs.length > 0 && (
        <motion.p key={lastSwipe.job.jobId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={styles.feedback}>
          {lastSwipe.direction === 'right'
            ? autoApply ? `✅ CV נשלח ל-${lastSwipe.job.company}!` : `💾 נשמר למועדפים — ${lastSwipe.job.company}`
            : `👋 דולגה משרה ב-${lastSwipe.job.company}`}
        </motion.p>
      )}

      <AnimatePresence>
        {selectedJob && <JobDetailModal job={selectedJob} onClose={handleModalClose} />}
      </AnimatePresence>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px' },
  filterBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#E8F5E9', color: '#2E7D32', borderRadius: '12px',
    padding: '8px 16px', fontSize: '13px', fontWeight: 600,
    width: 'min(360px, 95vw)', marginBottom: '8px', gap: '8px'
  },
  refreshBtn: {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '0 4px'
  },
  cardContainer: { position: 'relative', width: 'min(360px, 95vw)', height: '500px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  card: { width: 'min(360px, 95vw)', background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 8px 32px rgba(108,79,212,0.15)', height: '480px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'grab', userSelect: 'none', position: 'absolute', overflow: 'hidden' },
  stamp: { position: 'absolute', top: '24px', padding: '8px 16px', borderRadius: '12px', fontSize: '24px', fontWeight: 900, letterSpacing: '2px', border: '4px solid', zIndex: 10 },
  likeStamp: { right: '24px', color: '#4CAF50', borderColor: '#4CAF50', transform: 'rotate(15deg)' },
  nopeStamp: { left: '24px', color: '#F44336', borderColor: '#F44336', transform: 'rotate(-15deg)' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  logo_img: { width: '52px', height: '52px', borderRadius: '12px', objectFit: 'contain', border: '1px solid #eee' },
  logo_placeholder: { 
    width: '52px', height: '52px', borderRadius: '12px', 
    background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)', 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '24px', fontWeight: 700, color: 'white', border: '1px solid #eee'
  },
  company: { fontSize: '18px', fontWeight: 700, color: 'var(--text-dark)', margin: 0 },
  location: { color: 'var(--text-light)', fontSize: '13px', margin: 0 },
  title: { fontSize: '20px', fontWeight: 700, color: 'var(--primary)', margin: 0 },
  salary: { fontSize: '15px', fontWeight: 600, color: 'var(--secondary)', margin: 0 },
  distance: { fontSize: '13px', fontWeight: 600, color: '#2E7D32', margin: 0 },
  description: { fontSize: '14px', color: 'var(--text-light)', lineHeight: 1.6, flex: 1, margin: 0 },
  techContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  techBadge: { background: 'var(--background)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--primary)' },
  tapHint: { fontSize: '11px', color: '#bbb', textAlign: 'center', margin: 0 },
  buttons: { display: 'flex', gap: '40px', marginTop: '24px' },
  rejectBtn: { width: '64px', height: '64px', borderRadius: '50%', border: '2px solid #F44336', background: 'white', fontSize: '24px', cursor: 'pointer', color: '#F44336' },
  acceptBtn: { width: '64px', height: '64px', borderRadius: '50%', border: '2px solid #4CAF50', background: 'white', fontSize: '24px', cursor: 'pointer', color: '#4CAF50' },
  feedback: { marginTop: '16px', fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', padding: '24px' },
  emptyTitle: { fontSize: '24px', fontWeight: 800, margin: 0 },
  emptySubtitle: { fontSize: '14px', color: '#777', margin: 0 },
  emptyStats: { display: 'flex', alignItems: 'center', gap: '24px', background: 'white', borderRadius: '20px', padding: '20px 32px', boxShadow: '0 4px 16px rgba(108,79,212,0.1)' },
  emptyStatItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  emptyStatNumber: { fontSize: '28px', fontWeight: 800, color: '#6C4FD4', margin: 0 },
  emptyStatLabel: { fontSize: '12px', color: '#777', margin: 0 },
  emptyStatDivider: { width: '1px', height: '40px', background: '#eee' },
  emptyBtn: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '14px 28px', cursor: 'pointer', fontWeight: 700, fontSize: '16px' },
};

const modal = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' },
  sheet: { background: 'white', borderRadius: '24px 24px 0 0', padding: '16px 24px 40px', width: '100%', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' },
  handle: { width: '40px', height: '4px', background: '#eee', borderRadius: '2px', margin: '0 auto 8px' },
  header: { display: 'flex', alignItems: 'center', gap: '12px' },
  logo: { width: '56px', height: '56px', borderRadius: '14px', objectFit: 'contain', border: '1px solid #eee', flexShrink: 0 },
  logo_placeholder: { 
    width: '56px', height: '56px', borderRadius: '14px', 
    background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)', 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '26px', fontWeight: 700, color: 'white', border: '1px solid #eee', flexShrink: 0
  },
  title: { fontSize: '20px', fontWeight: 800, color: '#1E2A4A', margin: 0 },
  company: { fontSize: '14px', color: '#6C4FD4', fontWeight: 600, margin: 0 },
  closeBtn: { background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '14px', flexShrink: 0, marginRight: 'auto' },
  meta: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  metaItem: { background: '#F0F2FF', color: '#6C4FD4', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 },
  section: { display: 'flex', flexDirection: 'column', gap: '8px' },
  sectionTitle: { fontSize: '14px', fontWeight: 700, color: '#1E2A4A', margin: 0 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  tag: { background: '#F0F2FF', color: '#6C4FD4', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, border: '1px solid #6C4FD4' },
  description: { fontSize: '14px', color: '#6B7280', lineHeight: 1.7, margin: 0 },
  applyLink: { color: '#6C4FD4', fontSize: '14px', fontWeight: 600 },
  footer: { display: 'flex', gap: '12px', paddingTop: '8px' },
  passBtn: { flex: 1, padding: '14px', borderRadius: '14px', border: '2px solid #F44336', background: 'white', color: '#F44336', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
  applyBtn: { flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
};

export default SwipePage;