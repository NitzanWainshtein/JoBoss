import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';
import LimitModal from '../components/LimitModal';
import { getJobs, createSwipe, createApplication, updateMyProfile, getMySwipes, undoSwipe, getQuotaStatus, tailorCVForJob } from '../api';

// ── Job detail modal (unchanged) ────────────────────────────────────────────
function JobDetailModal({ job, onClose }) {
  const [logoError, setLogoError] = useState(false);
  const logoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(job.company)}.com&sz=128`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={modal.overlay} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        style={modal.sheet} onClick={(e) => e.stopPropagation()}
      >
        <div style={modal.header}>
          {!logoError
            ? <img src={logoUrl} alt={job.company} style={modal.logo} onError={() => setLogoError(true)} />
            : <div style={modal.logo_placeholder}>{job.company?.charAt(0).toUpperCase()}</div>
          }
          <div style={{ flex: 1 }}>
            <h2 style={modal.title}>{job.title}</h2>
            <p style={modal.company}>{job.company}</p>
          </div>
          <button style={modal.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={modal.meta}>
          <span style={modal.metaItem}>📍 {job.location}</span>
          <span style={modal.metaItem}>💰 {job.salary || 'לא צוין'}</span>
          {job.distanceKm != null && (
            <span style={{ ...modal.metaItem, background: '#E8F5E9', color: '#2E7D32' }}>🗺 {job.distanceKm.toFixed(1)} ק"מ</span>
          )}
        </div>
        {(job.technologies || job.requirements)?.length > 0 && (
          <div style={modal.section}>
            <p style={modal.sectionTitle}>טכנולוגיות נדרשות</p>
            <div style={modal.tags}>
              {(job.technologies || job.requirements).map(t => <span key={t} style={modal.tag}>{t}</span>)}
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
            <a href={job.applyUrl} target="_blank" rel="noreferrer" style={modal.applyLink}>🔗 לינק למשרה המקורית</a>
          </div>
        )}
        <div style={modal.footer}>
          <button style={modal.passBtn} onClick={onClose}>דלג ✕</button>
          <button style={modal.applyBtn} onClick={() => onClose('apply')}>הגש ♥</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Job card ─────────────────────────────────────────────────────────────────
function JobCard({ job, onSwipe, onOpenDetail, locked }) {
  const [isDragging, setIsDragging] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);
  const logoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(job.company)}.com&sz=128`;

  const handleDragEnd = (_, info) => {
    if (locked) return;
    if (info.offset.x > 100) onSwipe('right');
    else if (info.offset.x < -100) onSwipe('left');
    setTimeout(() => setIsDragging(false), 150);
  };

  return (
    <motion.div
      style={{ x, rotate, opacity, ...styles.card, zIndex: 1, filter: locked ? 'blur(4px)' : 'none' }}
      drag={locked ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      onDragStart={() => !locked && setIsDragging(true)}
      onDragEnd={handleDragEnd}
      onTap={() => { if (!locked && !isDragging) onOpenDetail(); }}
      whileTap={locked ? {} : { cursor: 'grabbing' }}
    >
      {!locked && <motion.div style={{ ...styles.stamp, ...styles.likeStamp, opacity: likeOpacity }}>✅ YES</motion.div>}
      {!locked && <motion.div style={{ ...styles.stamp, ...styles.nopeStamp, opacity: nopeOpacity }}>❌ NOPE</motion.div>}

      <div style={styles.cardHeader}>
        {!logoError
          ? <img src={logoUrl} alt={job.company} style={styles.logo_img} onError={() => setLogoError(true)} />
          : <div style={styles.logo_placeholder}>{job.company?.charAt(0).toUpperCase()}</div>
        }
        <div>
          <h2 style={styles.company}>{job.company}</h2>
          <p style={styles.location}>📍 {job.location}</p>
        </div>
      </div>
      <h3 style={styles.title}>{job.title}</h3>
      <p style={styles.salary}>💰 {job.salary || job.jobType || 'לא צוין'}</p>
      {job.distanceKm != null && <p style={styles.distance}>🗺 {job.distanceKm.toFixed(1)} ק"מ ממך</p>}
      <p style={styles.description}>{job.description}</p>
      <div style={styles.techContainer}>
        {(job.technologies || job.requirements || []).map(t => <span key={t} style={styles.techBadge}>{t}</span>)}
      </div>
      {!locked && <p style={styles.tapHint}>לחץ לפרטים נוספים 👆</p>}
    </motion.div>
  );
}

// ── Quota counter bar ────────────────────────────────────────────────────────
function QuotaBar({ quota, onUpgradeClick }) {
  if (!quota || quota.unlimited) return null;

  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const color = pct >= 100 ? '#F44336' : pct >= 80 ? '#FF9800' : '#4CAF50';

  return (
    <motion.div
      style={styles.quotaBar}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div style={styles.quotaBarTop}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>
          {quota.remaining === 0 ? '🔒 הגעת למגבלה' : `📨 ${quota.remaining} הגשות נותרו היום`}
        </span>
        <button style={styles.quotaUpgradeBtn} onClick={onUpgradeClick}>שדרג ⭐</button>
      </div>
      <div style={styles.quotaBarBg}>
        <motion.div
          style={{ ...styles.quotaBarFill, background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
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
  const [swipedJobs, setSwipedJobs] = useState(new Set());
  const [quota, setQuota] = useState(null);          // { plan, limit, used, remaining, unlimited, resetAt }
  const [limitModal, setLimitModal] = useState(false);
  const autoTailorCV = localStorage.getItem('autoTailorCV') === 'true';
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
      if (lat && lng && radius) {
        setLocationFilter({ name: localStorage.getItem('jobLocation') || 'מיקום נוכחי', radius: Number(radius) });
      }
    } catch {
      setError('אין חיבור לשרת. אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadQuota = useCallback(async () => {
    try {
      const q = await getQuotaStatus();
      setQuota(q);
    } catch {
      // fail silently
    }
  }, []);

  useEffect(() => {
    loadJobs();
    loadQuota();
  }, [loadJobs, loadQuota]);

  useEffect(() => {
    const loadSwipes = async () => {
      try {
        const data = await getMySwipes();
        setSwipedJobs(new Set((data.swipes || []).map(s => s.jobId)));
      } catch {}
    };
    loadSwipes();
  }, []);

  const filteredJobs = jobs.filter(j => !swipedJobs.has(j.jobId));
  const currentJob = filteredJobs[filteredJobs.length - 1];
  const nextJob = filteredJobs[filteredJobs.length - 2];

  // Jobs beyond quota are blurred in preview
  const isLocked = quota && !quota.unlimited && quota.remaining === 0;

  const handleSwipe = async (direction) => {
    if (!currentJob) return;

    if (direction === 'right') {
      // Optimistic: check quota before calling API
      if (isLocked) {
        setLimitModal(true);
        return;
      }
    }

    setLastSwipe({ direction, job: currentJob });
    setSwipedJobs(prev => new Set([...prev, currentJob.jobId]));
    if (direction === 'right') setSwipedRight(p => p + 1);
    setJobs(prev => prev.slice(0, -1));

    if (direction === 'right' && autoTailorCV) {
      const pending = JSON.parse(localStorage.getItem('tailoringPending') || '{}');
      pending[currentJob.jobId] = { company: currentJob.company, title: currentJob.title };
      localStorage.setItem('tailoringPending', JSON.stringify(pending));
    }

    try {
      const result = await createSwipe(currentJob.jobId, direction === 'right' ? 'LIKE' : 'PASS', {
        company: currentJob.company,
        title: currentJob.title,
      });

      // Update quota from response — preserve unlimited flag from initial load
      if (result?.quota) {
        setQuota(q => ({ ...q, ...result.quota, unlimited: result.quota.unlimited ?? q?.unlimited, used: (q?.used || 0) + (direction === 'right' ? 1 : 0) }));
      }

      if (direction === 'right' && autoTailorCV) {

        tailorCVForJob(currentJob.jobId)
          .then(result => {
            const p = JSON.parse(localStorage.getItem('tailoringPending') || '{}');
            delete p[currentJob.jobId];
            localStorage.setItem('tailoringPending', JSON.stringify(p));
            window.dispatchEvent(new CustomEvent('tailorComplete', {
              detail: { jobId: currentJob.jobId, tailoredResume: result.tailoredResume, tailoredResumeUrl: result.tailoredResumeUrl }
            }));
          })
          .catch(() => {
            const p = JSON.parse(localStorage.getItem('tailoringPending') || '{}');
            delete p[currentJob.jobId];
            localStorage.setItem('tailoringPending', JSON.stringify(p));
            window.dispatchEvent(new CustomEvent('tailorError', { detail: { jobId: currentJob.jobId } }));
          });
      }
    } catch (err) {
      const p = JSON.parse(localStorage.getItem('tailoringPending') || '{}');
      delete p[currentJob.jobId];
      localStorage.setItem('tailoringPending', JSON.stringify(p));

      if (err.status === 429 || err.code === 'LIMIT_REACHED') {
        // Revert
        setSwipedJobs(prev => { const s = new Set(prev); s.delete(currentJob.jobId); return s; });
        setJobs(prev => [...prev, currentJob]);
        if (direction === 'right') setSwipedRight(p => Math.max(0, p - 1));
        setLastSwipe(null);
        setLimitModal(true);
        if (err.data) setQuota(err.data);
      }
    }
  };

  const handleUndo = async () => {
    if (!lastSwipe) return;
    try {
      await undoSwipe(lastSwipe.job.jobId);
      setSwipedJobs(prev => { const s = new Set(prev); s.delete(lastSwipe.job.jobId); return s; });
      setJobs(prev => [...prev, lastSwipe.job]);
      if (lastSwipe.direction === 'right') {
        setSwipedRight(p => Math.max(0, p - 1));
        setQuota(q => q ? { ...q, used: Math.max(0, (q.used || 0) - 1), remaining: q.limit === -1 ? -1 : (q.remaining || 0) + 1 } : q);
      }
      setLastSwipe(null);
    } catch {
      alert('❌ שגיאה בביטול Swipe');
    }
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
      <button style={{ background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white', border: 'none', borderRadius: '20px', padding: '12px 24px', cursor: 'pointer', fontWeight: 700 }} onClick={loadJobs}>נסה שוב</button>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Quota bar */}
      <QuotaBar quota={quota} onUpgradeClick={() => navigate('/profile?tab=subscription')} />

      {locationFilter && (
        <div style={styles.filterBanner}>
          <span>📍 {locationFilter.name} · עד {locationFilter.radius} ק"מ</span>
          <button style={styles.refreshBtn} onClick={loadJobs}>🔄</button>
        </div>
      )}

      <div style={styles.cardContainer}>
        {filteredJobs.length === 0 ? (
          <motion.div style={styles.emptyState} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <motion.p style={{ fontSize: '80px', margin: 0 }} animate={{ rotate: [0, 10, -10, 10, 0] }} transition={{ duration: 1, delay: 0.3 }}>🎉</motion.p>
            <p style={styles.emptyTitle}>סיימת את כל המשרות!</p>
            <p style={styles.emptySubtitle}>חזור מחר למשרות חדשות</p>
            <div style={styles.emptyStats}>
              <div style={styles.emptyStatItem}><p style={styles.emptyStatNumber}>{totalJobs}</p><p style={styles.emptyStatLabel}>נסקרו</p></div>
              <div style={styles.emptyStatDivider} />
              <div style={styles.emptyStatItem}><p style={styles.emptyStatNumber}>{swipedRight}</p><p style={styles.emptyStatLabel}>הוגשו</p></div>
            </div>
            <motion.button style={styles.emptyBtn} whileHover={{ scale: 1.05 }} onClick={() => navigate('/applications')}>📋 ראה הגשות</motion.button>
          </motion.div>
        ) : (
          <>
            {/* Next card preview */}
            {nextJob && (
              <motion.div style={{ ...styles.card, position: 'absolute', zIndex: 0, top: '10px', filter: 'blur(1.5px)', opacity: 0.6, transform: 'scale(0.95)', pointerEvents: 'none' }}>
                <div style={styles.cardHeader}>
                  <div style={{ ...styles.logo_placeholder }}>{nextJob.company?.charAt(0).toUpperCase()}</div>
                  <div><h2 style={styles.company}>{nextJob.company}</h2><p style={styles.location}>📍 {nextJob.location}</p></div>
                </div>
                <h3 style={styles.title}>{nextJob.title}</h3>
              </motion.div>
            )}

            <AnimatePresence>
              <JobCard
                key={currentJob.jobId}
                job={currentJob}
                onSwipe={handleSwipe}
                onOpenDetail={() => !isLocked && setSelectedJob(currentJob)}
                locked={isLocked}
              />
            </AnimatePresence>

            {/* Locked overlay */}
            {isLocked && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={styles.lockedOverlay}
                onClick={() => setLimitModal(true)}
              >
                <div style={styles.lockedContent}>
                  <span style={{ fontSize: '40px' }}>🔒</span>
                  <p style={styles.lockedTitle}>הגעת למגבלה היומית</p>
                  <p style={styles.lockedSub}>שדרג כדי להמשיך</p>
                  <button style={styles.lockedBtn}>שדרג עכשיו ⭐</button>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      {filteredJobs.length > 0 && !isLocked && (
        <div style={styles.buttons}>
          <motion.button style={styles.rejectBtn} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleSwipe('left')}>✕</motion.button>
          <motion.button style={styles.acceptBtn} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleSwipe('right')}>♥</motion.button>
        </div>
      )}

      {/* Locked action buttons hint */}
      {filteredJobs.length > 0 && isLocked && (
        <motion.button
          style={styles.unlockBtn}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setLimitModal(true)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          🔓 שדרג להמשיך להחליק
        </motion.button>
      )}

      {lastSwipe && filteredJobs.length > 0 && !isLocked && (
        <>
          <motion.p key={lastSwipe.job.jobId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={styles.feedback}>
            {lastSwipe.direction === 'right'
              ? autoApply ? `✅ CV נשלח ל-${lastSwipe.job.company}!` : `💾 נשמר — ${lastSwipe.job.company}`
              : `👋 דולגה — ${lastSwipe.job.company}`}
          </motion.p>
          <motion.button style={styles.undoBtn} whileHover={{ scale: 1.05 }} onClick={handleUndo} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            ↩️ Undo
          </motion.button>
        </>
      )}

      {/* Limit modal */}
      <LimitModal
        visible={limitModal}
        resetAt={quota?.resetAt}
        used={quota?.used || 0}
        limit={quota?.limit || 5}
        onClose={() => setLimitModal(false)}
      />

      <AnimatePresence>
        {selectedJob && <JobDetailModal job={selectedJob} onClose={handleModalClose} />}
      </AnimatePresence>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '16px', paddingBottom: '80px' },
  quotaBar: { width: 'min(360px, 95vw)', marginBottom: '8px', background: 'white', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  quotaBarTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  quotaUpgradeBtn: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 },
  quotaBarBg: { height: '6px', borderRadius: '3px', background: '#eee', overflow: 'hidden' },
  quotaBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.5s ease' },
  filterBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#E8F5E9', color: '#2E7D32', borderRadius: '12px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, width: 'min(360px, 95vw)', marginBottom: '8px', gap: '8px' },
  refreshBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' },
  cardContainer: { position: 'relative', width: 'min(360px, 95vw)', height: '500px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  card: { width: 'min(360px, 95vw)', background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 8px 32px rgba(108,79,212,0.15)', height: '480px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'grab', userSelect: 'none', position: 'absolute', overflow: 'hidden' },
  stamp: { position: 'absolute', top: '24px', padding: '8px 16px', borderRadius: '12px', fontSize: '24px', fontWeight: 900, letterSpacing: '2px', border: '4px solid', zIndex: 10 },
  likeStamp: { right: '24px', color: '#4CAF50', borderColor: '#4CAF50', transform: 'rotate(15deg)' },
  nopeStamp: { left: '24px', color: '#F44336', borderColor: '#F44336', transform: 'rotate(-15deg)' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  logo_img: { width: '52px', height: '52px', borderRadius: '12px', objectFit: 'contain', border: '1px solid #eee' },
  logo_placeholder: { width: '52px', height: '52px', borderRadius: '12px', background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 700, color: 'white' },
  company: { fontSize: '18px', fontWeight: 700, color: 'var(--text-dark)', margin: 0 },
  location: { color: 'var(--text-light)', fontSize: '13px', margin: 0 },
  title: { fontSize: '20px', fontWeight: 700, color: 'var(--primary)', margin: 0 },
  salary: { fontSize: '15px', fontWeight: 600, color: 'var(--secondary)', margin: 0 },
  distance: { fontSize: '13px', fontWeight: 600, color: '#2E7D32', margin: 0 },
  description: { fontSize: '14px', color: 'var(--text-light)', lineHeight: 1.6, flex: 1, margin: 0 },
  techContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  techBadge: { background: 'var(--background)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--primary)' },
  tapHint: { fontSize: '11px', color: '#bbb', textAlign: 'center', margin: 0 },
  lockedOverlay: { position: 'absolute', inset: 0, borderRadius: '20px', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(2px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 5, cursor: 'pointer' },
  lockedContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center', padding: '24px' },
  lockedTitle: { fontSize: '18px', fontWeight: 800, color: '#1E2A4A', margin: 0 },
  lockedSub: { fontSize: '13px', color: '#666', margin: 0 },
  lockedBtn: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' },
  buttons: { display: 'flex', gap: '40px', marginTop: '24px' },
  rejectBtn: { width: '64px', height: '64px', borderRadius: '50%', border: '2px solid #F44336', background: 'white', fontSize: '24px', cursor: 'pointer', color: '#F44336' },
  acceptBtn: { width: '64px', height: '64px', borderRadius: '50%', border: '2px solid #4CAF50', background: 'white', fontSize: '24px', cursor: 'pointer', color: '#4CAF50' },
  unlockBtn: { marginTop: '24px', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '24px', padding: '14px 28px', cursor: 'pointer', fontSize: '15px', fontWeight: 700 },
  undoBtn: { position: 'absolute', bottom: '120px', left: '50%', transform: 'translateX(-50%)', padding: '10px 24px', background: '#FF9800', color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 },
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
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' },
  sheet: { background: 'white', borderRadius: '20px', padding: '20px 24px 32px', width: 'min(360px, 95vw)', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' },
  header: { display: 'flex', alignItems: 'center', gap: '12px' },
  logo: { width: '56px', height: '56px', borderRadius: '14px', objectFit: 'contain', border: '1px solid #eee', flexShrink: 0 },
  logo_placeholder: { width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 700, color: 'white', flexShrink: 0 },
  title: { fontSize: '20px', fontWeight: 800, color: '#1E2A4A', margin: 0 },
  company: { fontSize: '14px', color: '#6C4FD4', fontWeight: 600, margin: 0 },
  closeBtn: { background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '14px', flexShrink: 0, marginRight: 'auto' },
  meta: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  metaItem: { background: '#F0F2FF', color: '#6C4FD4', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 },
  section: { display: 'flex', flexDirection: 'column', gap: '8px' },
  sectionTitle: { fontSize: '14px', fontWeight: 700, color: '#1E2A4A', margin: 0 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  tag: { background: '#F0F2FF', color: '#6C4FD4', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 },
  description: { fontSize: '14px', color: '#6B7280', lineHeight: 1.7, margin: 0 },
  applyLink: { color: '#6C4FD4', fontSize: '14px', fontWeight: 600 },
  footer: { display: 'flex', gap: '12px', paddingTop: '8px' },
  passBtn: { flex: 1, padding: '14px', borderRadius: '14px', border: '2px solid #F44336', background: 'white', color: '#F44336', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
  applyBtn: { flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
};

export default SwipePage;
