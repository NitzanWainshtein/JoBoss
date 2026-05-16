import React, { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import mockJobs from '../data/mockJobs';
import { useNavigate } from 'react-router-dom';

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

  return (
    <motion.div
      style={{ x, rotate, opacity, ...styles.card }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      whileTap={{ cursor: 'grabbing' }}
    >
      {/* LIKE stamp */}
      <motion.div style={{ ...styles.stamp, ...styles.likeStamp, opacity: likeOpacity }}>
        ✅ YES
      </motion.div>

      {/* NOPE stamp */}
      <motion.div style={{ ...styles.stamp, ...styles.nopeStamp, opacity: nopeOpacity }}>
        ❌ NOPE
      </motion.div>

      <div style={styles.cardHeader}>
        <img
          src={job.logo}
          alt={job.company}
          style={styles.logo_img}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div>
          <h2 style={styles.company}>{job.company}</h2>
          <p style={styles.location}>📍 {job.location}</p>
        </div>
      </div>
      <h3 style={styles.title}>{job.title}</h3>
      <p style={styles.salary}>💰 {job.salary}</p>
      <p style={styles.description}>{job.description}</p>
      <div style={styles.techContainer}>
        {job.technologies.map((tech) => (
          <span key={tech} style={styles.techBadge}>{tech}</span>
        ))}
      </div>
    </motion.div>
  );
}

function SwipePage() {
  const [jobs, setJobs] = useState(mockJobs);
  const [lastSwipe, setLastSwipe] = useState(null);
  const navigate = useNavigate();
  const autoApply = false;

  const currentJob = jobs[jobs.length - 1];

  const handleSwipe = (direction) => {
    if (!currentJob) return;
    setLastSwipe({ direction, job: currentJob });
    setJobs((prev) => prev.slice(0, -1));
  };

  return (
    <div style={styles.container}>
      <div style={styles.cardContainer}>
        {jobs.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={{ fontSize: '64px' }}>🎉</p>
            <p style={styles.emptyTitle}>סיימת את כל המשרות!</p>
            <p style={styles.emptySubtitle}>חזור מחר למשרות חדשות</p>
            <button style={styles.dashboardBtn} onClick={() => navigate('/dashboard')}>
              ראה את ההגשות שלך
            </button>
          </div>
        ) : (
          <AnimatePresence>
            <JobCard
              key={currentJob.jobId}
              job={currentJob}
              onSwipe={handleSwipe}
            />
          </AnimatePresence>
        )}
      </div>

      {jobs.length > 0 && (
        <div style={styles.buttons}>
          <motion.button
            style={styles.rejectBtn}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSwipe('left')}
          >
            ✕
          </motion.button>
          <motion.button
            style={styles.acceptBtn}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSwipe('right')}
          >
            ♥
          </motion.button>
        </div>
      )}

      {lastSwipe && (
        <motion.p
          key={lastSwipe.job.jobId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={styles.feedback}
        >
          {lastSwipe.direction === 'right'
            ? autoApply
              ? `✅ CV נשלח ל-${lastSwipe.job.company}!`
              : `💾 נשמר למועדפים — ${lastSwipe.job.company}`
            : `👋 דולגה משרה ב-${lastSwipe.job.company}`}
        </motion.p>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  logo: { fontSize: '28px', fontWeight: 800, color: 'var(--primary)', margin: 0 },
  logoAccent: { color: 'var(--secondary)' },
  dashboardBtn: { background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
  cardContainer: { position: 'relative', width: '360px', height: '500px', marginTop: '32px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  card: { width: '360px', background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 8px 32px rgba(255,107,107,0.15)', height: '480px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'grab', userSelect: 'none', position: 'relative', overflow: 'hidden' },
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
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' },
  emptyTitle: { fontSize: '22px', fontWeight: 800, margin: 0 },
  emptySubtitle: { fontSize: '14px', color: 'var(--text-light)', margin: 0 },
};

export default SwipePage;