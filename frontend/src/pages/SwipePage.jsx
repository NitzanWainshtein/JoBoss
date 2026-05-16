import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';
import { getJobs, createSwipe, createApplication } from '../api';

function JobCard({ job, onSwipe }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragEnd = (e, info) => {
    if (info.offset.x > 100) onSwipe('right');
    else if (info.offset.x < -100) onSwipe('left');
  };

  const logoUrl = `https://logo.clearbit.com/${job.company?.toLowerCase().replace(/\s/g, '')}.com`;

  return (
    <motion.div
      style={{ x, rotate, opacity, ...styles.card, zIndex: 1 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      whileTap={{ cursor: 'grabbing' }}
    >
      <motion.div style={{ ...styles.stamp, ...styles.likeStamp, opacity: likeOpacity }}>✅ YES</motion.div>
      <motion.div style={{ ...styles.stamp, ...styles.nopeStamp, opacity: nopeOpacity }}>❌ NOPE</motion.div>

      <div style={styles.cardHeader}>
        <img src={logoUrl} alt={job.company} style={styles.logo_img}
          onError={(e) => { e.target.style.display = 'none'; }} />
        <div>
          <h2 style={styles.company}>{job.company}</h2>
          <p style={styles.location}>📍 {job.location}</p>
        </div>
      </div>
      <h3 style={styles.title}>{job.title}</h3>
      <p style={styles.salary}>💰 {job.salary || job.jobType || 'לא צוין'}</p>
      <p style={styles.description}>{job.description}</p>
      <div style={styles.techContainer}>
        {(job.technologies || job.requirements || []).map((tech) => (
          <span key={tech} style={styles.techBadge}>{tech}</span>
        ))}
      </div>
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
  const navigate = useNavigate();
  const autoApply = false;

  useEffect(() => {
    getJobs()
      .then((data) => {
        const jobList = data.jobs || [];
        setJobs(jobList);
        setTotalJobs(jobList.length);
        setLoading(false);
      })
      .catch(() => {
        setError('אין חיבור לשרת. אנא נסה שוב מאוחר יותר.');
        setLoading(false);
      });
  }, []);

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
        onClick={() => window.location.reload()}
      >
        נסה שוב
      </button>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.cardContainer}>
        {jobs.length === 0 ? (
          <motion.div
            style={styles.emptyState}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
          >
            <motion.p
              style={{ fontSize: '80px', margin: 0 }}
              animate={{ rotate: [0, 10, -10, 10, 0] }}
              transition={{ duration: 1, delay: 0.3 }}
            >
              🎉
            </motion.p>
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
            <motion.button
              style={styles.emptyBtn}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/dashboard')}
            >
              📋 ראה את ההגשות שלך
            </motion.button>
          </motion.div>
        ) : (
          <>
            {/* קארד הבא — מאחורה */}
            {nextJob && (
              <motion.div
                style={{
                  ...styles.card,
                  position: 'absolute',
                  zIndex: 0,
                  top: '10px',
                  filter: 'blur(1.5px)',
                  opacity: 0.6,
                  transform: 'scale(0.95)',
                  pointerEvents: 'none',
                }}
              >
                <div style={styles.cardHeader}>
                  <img
                    src={`https://logo.clearbit.com/${nextJob.company?.toLowerCase().replace(/\s/g, '')}.com`}
                    alt={nextJob.company}
                    style={styles.logo_img}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div>
                    <h2 style={styles.company}>{nextJob.company}</h2>
                    <p style={styles.location}>📍 {nextJob.location}</p>
                  </div>
                </div>
                <h3 style={styles.title}>{nextJob.title}</h3>
                <p style={styles.salary}>💰 {nextJob.salary || nextJob.jobType || 'לא צוין'}</p>
              </motion.div>
            )}

            {/* קארד נוכחי — מעל */}
            <AnimatePresence>
              <JobCard
                key={currentJob.jobId}
                job={currentJob}
                onSwipe={handleSwipe}
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
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '24px' },
  cardContainer: { position: 'relative', width: 'min(360px, 95vw)', height: '500px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  card: { width: 'min(360px, 95vw)', background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 8px 32px rgba(255,107,107,0.15)', height: '480px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'grab', userSelect: 'none', position: 'absolute', overflow: 'hidden' },
  stamp: { position: 'absolute', top: '24px', padding: '8px 16px', borderRadius: '12px', fontSize: '24px', fontWeight: 900, letterSpacing: '2px', border: '4px solid', zIndex: 10 },
  likeStamp: { right: '24px', color: '#4CAF50', borderColor: '#4CAF50', transform: 'rotate(15deg)' },
  nopeStamp: { left: '24px', color: '#F44336', borderColor: '#F44336', transform: 'rotate(-15deg)' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  logo_img: { width: '52px', height: '52px', borderRadius: '12px', objectFit: 'contain', border: '1px solid #eee' },
  company: { fontSize: '18px', fontWeight: 700, color: 'var(--text-dark)', margin: 0 },
  location: { color: 'var(--text-light)', fontSize: '13px', margin: 0 },
  title: { fontSize: '20px', fontWeight: 700, color: 'var(--primary)', margin: 0 },
  salary: { fontSize: '15px', fontWeight: 600, color: 'var(--secondary)', margin: 0 },
  description: { fontSize: '14px', color: 'var(--text-light)', lineHeight: 1.6, flex: 1, margin: 0 },
  techContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  techBadge: { background: 'var(--background)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--primary)' },
  buttons: { display: 'flex', gap: '40px', marginTop: '24px' },
  rejectBtn: { width: '64px', height: '64px', borderRadius: '50%', border: '2px solid #F44336', background: 'white', fontSize: '24px', cursor: 'pointer', color: '#F44336' },
  acceptBtn: { width: '64px', height: '64px', borderRadius: '50%', border: '2px solid #4CAF50', background: 'white', fontSize: '24px', cursor: 'pointer', color: '#4CAF50' },
  feedback: { marginTop: '16px', fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', padding: '24px' },
  emptyTitle: { fontSize: '24px', fontWeight: 800, margin: 0 },
  emptySubtitle: { fontSize: '14px', color: '#777', margin: 0 },
  emptyStats: { display: 'flex', alignItems: 'center', gap: '24px', background: 'white', borderRadius: '20px', padding: '20px 32px', boxShadow: '0 4px 16px rgba(255,107,107,0.1)' },
  emptyStatItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  emptyStatNumber: { fontSize: '28px', fontWeight: 800, color: '#FF6B6B', margin: 0 },
  emptyStatLabel: { fontSize: '12px', color: '#777', margin: 0 },
  emptyStatDivider: { width: '1px', height: '40px', background: '#eee' },
  emptyBtn: { background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white', border: 'none', borderRadius: '20px', padding: '14px 28px', cursor: 'pointer', fontWeight: 700, fontSize: '16px' },
};

export default SwipePage;