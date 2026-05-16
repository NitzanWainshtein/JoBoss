import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import mockJobs from '../data/mockJobs';
import { useNavigate } from 'react-router-dom';

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
      <div style={styles.header}>
        <h1 style={styles.logo}>
          jo<span style={styles.logoAccent}>Boss</span>
        </h1>
        <button style={styles.dashboardBtn} onClick={() => navigate('/dashboard')}>
          📋 הגשות שלי
        </button>
      </div>

      <div style={styles.cardContainer}>
        {jobs.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>🎉 סיימת את כל המשרות!</p>
            <button style={styles.dashboardBtn} onClick={() => navigate('/dashboard')}>
              ראה את ההגשות שלך
            </button>
          </div>
        ) : (
          <AnimatePresence>
            <motion.div
              key={currentJob.jobId}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ x: lastSwipe?.direction === 'right' ? 400 : -400, opacity: 0, rotate: lastSwipe?.direction === 'right' ? 20 : -20 }}
              transition={{ duration: 0.3 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(e, info) => {
                if (info.offset.x > 100) handleSwipe('right');
                else if (info.offset.x < -100) handleSwipe('left');
              }}
              style={styles.card}
            >
              <div style={styles.cardHeader}>
                <img
                  src={currentJob.logo}
                  alt={currentJob.company}
                  style={styles.logo_img}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div>
                  <h2 style={styles.company}>{currentJob.company}</h2>
                  <p style={styles.location}>📍 {currentJob.location}</p>
                </div>
              </div>
              <h3 style={styles.title}>{currentJob.title}</h3>
              <p style={styles.salary}>💰 {currentJob.salary}</p>
              <p style={styles.description}>{currentJob.description}</p>
              <div style={styles.techContainer}>
                {currentJob.technologies.map((tech) => (
                  <span key={tech} style={styles.techBadge}>{tech}</span>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {jobs.length > 0 && (
        <div style={styles.buttons}>
          <button style={styles.rejectBtn} onClick={() => handleSwipe('left')}>✕</button>
          <button style={styles.acceptBtn} onClick={() => handleSwipe('right')}>♥</button>
        </div>
      )}

      {lastSwipe && (
        <p style={styles.feedback}>
          {lastSwipe.direction === 'right'
            ? autoApply
              ? `✅ CV נשלח ל-${lastSwipe.job.company}!`
              : `💾 נשמר למועדפים — ${lastSwipe.job.company}`
            : `👋 דולגה משרה ב-${lastSwipe.job.company}`}
        </p>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  logo: { fontSize: '28px', fontWeight: 800, color: 'var(--primary)' },
  logoAccent: { color: 'var(--secondary)' },
  dashboardBtn: { background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
  cardContainer: { position: 'relative', width: '360px', height: '500px', marginTop: '32px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  card: { width: '360px', background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 8px 32px rgba(255,107,107,0.15)', height: '480px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'grab', userSelect: 'none' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  logo_img: { width: '52px', height: '52px', borderRadius: '12px', objectFit: 'contain', border: '1px solid #eee' },
  company: { fontSize: '18px', fontWeight: 700, color: 'var(--text-dark)' },
  location: { color: 'var(--text-light)', fontSize: '13px' },
  title: { fontSize: '20px', fontWeight: 700, color: 'var(--primary)' },
  salary: { fontSize: '15px', fontWeight: 600, color: 'var(--secondary)' },
  description: { fontSize: '14px', color: 'var(--text-light)', lineHeight: 1.6, flex: 1 },
  techContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  techBadge: { background: 'var(--background)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--primary)' },
  buttons: { display: 'flex', gap: '40px', marginTop: '24px' },
  rejectBtn: { width: '64px', height: '64px', borderRadius: '50%', border: '2px solid #F44336', background: 'white', fontSize: '24px', cursor: 'pointer', color: '#F44336' },
  acceptBtn: { width: '64px', height: '64px', borderRadius: '50%', border: '2px solid #4CAF50', background: 'white', fontSize: '24px', cursor: 'pointer', color: '#4CAF50' },
  feedback: { marginTop: '16px', fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '100px' },
  emptyText: { fontSize: '20px', fontWeight: 700 }
};

export default SwipePage;