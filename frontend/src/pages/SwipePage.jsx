import React, { useState, useEffect, useCallback } from 'react';
import ICON_SIZES from '../iconSizes';
import { CompanyLogo } from '../utils/companyLogos';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';
import LimitModal from '../components/LimitModal';
import { getJobs, createSwipe, createApplication, updateMyProfile, getMySwipes, undoSwipe, getQuotaStatus, tailorCVForJob } from '../api';

const DESCRIPTION_SECTION_TITLES = new Set([
  'summary',
  'responsibilities',
  'requirements',
  'nice to have',
  'technologies',
]);

function parseJobDescription(description = '') {
  const sections = [];
  let currentSection = null;

  description
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const normalized = line.toLowerCase();

      if (DESCRIPTION_SECTION_TITLES.has(normalized)) {
        currentSection = { title: line, items: [] };
        sections.push(currentSection);
        return;
      }

      if (!currentSection) {
        currentSection = { title: 'Summary', items: [] };
        sections.push(currentSection);
      }

      currentSection.items.push(line.replace(/^[-•]\s*/, ''));
    });

  return sections;
}

function getJobSummary(description = '') {
  const summary = parseJobDescription(description)
    .find(section => section.title.toLowerCase() === 'summary');

  return summary?.items?.join(' ') || description;
}

// Trim a long Nominatim address ("street, neighborhood, city, district, ...,
// postcode, country") down to "street, city". Keeps already-short values as-is.
function shortenLocation(name = '') {
  const NOISE = /נפ[הת]|מחוז|מועצה|אזורית|ישראל|israel/i;
  const parts = name.split(',')
    .map(p => p.trim())
    .filter(p => p && !NOISE.test(p) && !/^\d{4,}$/.test(p));
  if (parts.length <= 2) return parts.join(', ');
  // First = street, last = city; drop the middle (neighborhood/county noise).
  return `${parts[0]}, ${parts[parts.length - 1]}`;
}

function JobDescription({ description }) {
  const sections = parseJobDescription(description);

  if (!sections.length) return null;

  return (
    <div style={modal.descriptionPanel}>
      {sections.map((section) => {
        const normalizedTitle = section.title.toLowerCase();
        const isBulletSection = ['responsibilities', 'requirements', 'nice to have'].includes(normalizedTitle);
        const isTechnologySection = normalizedTitle === 'technologies';

        return (
          <div key={section.title} style={modal.descriptionSection}>
            <h4 style={modal.descriptionHeading}>{section.title}</h4>

            {isTechnologySection ? (
              <div style={modal.techList}>
                {section.items.join(', ').split(',').map(item => item.trim()).filter(Boolean).map(item => (
                  <span key={item} style={modal.techPill}>{item}</span>
                ))}
              </div>
            ) : isBulletSection ? (
              <ul style={modal.bulletList}>
                {section.items.map((item, index) => (
                  <li key={`${section.title}-${index}`} style={modal.bulletItem}>{item}</li>
                ))}
              </ul>
            ) : (
              <p style={modal.descriptionText}>{section.items.join(' ')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Job detail modal (unchanged) ────────────────────────────────────────────
function JobDetailModal({ job, onClose }) {

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={modal.overlay} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        style={modal.sheet} onClick={(e) => e.stopPropagation()}
      >
        <div style={modal.header}>
          <CompanyLogo company={job.company} style={modal.logo} />
          <div style={{ flex: 1 }}>
            <h2 style={modal.title}>{job.title}</h2>
            <p style={modal.company}>{job.company}</p>
          </div>
          <button style={modal.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={modal.meta}>
          <span style={modal.metaItem}>📍 {job.location}</span>
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
            <JobDescription description={job.description} />
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
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

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
      {!locked && <motion.div style={{ ...styles.stamp, ...styles.likeStamp, opacity: likeOpacity, pointerEvents: 'none' }}><img src="/icons/yes_icon.png" alt="YES" draggable="false" style={{ height: `${ICON_SIZES.stampYes}px`, objectFit: 'contain' }} /></motion.div>}
      {!locked && <motion.div style={{ ...styles.stamp, ...styles.nopeStamp, opacity: nopeOpacity, pointerEvents: 'none' }}><img src="/icons/nope_icon.png" alt="NOPE" draggable="false" style={{ height: `${ICON_SIZES.stampNope}px`, objectFit: 'contain' }} /></motion.div>}

      <div style={styles.cardHeader}>
        <CompanyLogo company={job.company} style={styles.logo_img} />
        <div>
          <h2 style={styles.company}>{job.company}</h2>
          <p style={styles.location}>📍 {job.location}</p>
        </div>
      </div>
      <h3 style={styles.title}>{job.title}</h3>
      {job.distanceKm != null && <p style={styles.distance}>🗺 {job.distanceKm.toFixed(1)} ק"מ ממך</p>}
      <div style={styles.shortSummaryBlock}>
        <p style={styles.shortSummaryTitle}>Short Summary</p>
        <p style={styles.description}>{job.shortDescription || getJobSummary(job.description)}</p>
      </div>
      <div style={styles.techContainer}>
        {(job.technologies || job.requirements || []).map(t => <span key={t} style={styles.techBadge}>{t}</span>)}
      </div>
      {!locked && <p style={styles.tapHint}>לחץ לפרטים נוספים 👆</p>}
    </motion.div>
  );
}

// ── Quota counter bar ────────────────────────────────────────────────────────
function QuotaBar({ quota, onUpgradeClick }) {
  // PREMIUM_PLUS is unlimited — no counter needed.
  // FREE and PREMIUM both have a finite daily limit: show the bar for both.
  if (!quota || quota.unlimited) return null;

  const plan = quota.plan || 'FREE';
  const pct = Math.min(100, Math.round(((quota.used ?? 0) / quota.limit) * 100));
  const color = pct >= 100 ? '#F44336' : pct >= 80 ? '#FF9800' : '#4CAF50';

  return (
    <motion.div
      style={styles.quotaBar}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div style={styles.quotaBarTop}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>
          {quota.remaining === 0
            ? '🔒 הגעת למגבלה'
            : <>📨 <span dir="ltr">{quota.used ?? 0} / {quota.limit}</span> החלקות היום</>}
        </span>
        {/* Upgrade button only for FREE users — Premium users are already paying */}
        {plan === 'FREE' && (
          <button style={styles.quotaUpgradeBtn} onClick={onUpgradeClick}>שדרג ⭐</button>
        )}
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
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [limitModal, setLimitModal] = useState(false);
  const autoTailorCV = localStorage.getItem('autoTailorCV') === 'true' && quota?.plan !== 'FREE';
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

  const getResetTime = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  };

  const loadQuota = useCallback(async () => {
    setQuotaLoading(true);
    try {
      const q = await getQuotaStatus();
      setQuota(q);
    } catch (e) {
      console.error('QUOTA LOAD FAILED:', e?.message, e?.status);
      // On any failure, assume limit is reached — prevents bypass if backend is unreachable
      setQuota({ plan: 'FREE', limit: 5, used: 5, remaining: 0, unlimited: false, resetAt: getResetTime() });
    } finally {
      setQuotaLoading(false);
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
        const swipes = data.swipes || [];
        setSwipedJobs(new Set(swipes.map(s => s.jobId)));
        // Seed the "applied" counter from persisted LIKE swipes so it reflects
        // past right-swipes (not just the current session). It then keeps
        // incrementing/decrementing via handleSwipe/handleUndo.
        setSwipedRight(swipes.filter(s => s.decision === 'LIKE').length);
      } catch {}
    };
    loadSwipes();
  }, []);

  const filteredJobs = jobs.filter(j => !swipedJobs.has(j.jobId));
  const currentJob = filteredJobs[filteredJobs.length - 1];
  const nextJob = filteredJobs[filteredJobs.length - 2];

  // Only lock when quota is confirmed from backend — never while loading
  const isLocked = !quotaLoading && quota && !quota.unlimited && quota.remaining <= 0;
  // Blocks all swipe interactions: confirmed locked OR still loading
  const isBlocked = quotaLoading || isLocked;

  const handleSwipe = async (direction) => {
    if (!currentJob) return;
    if (quotaLoading) return;  // never swipe before quota is confirmed

    if (direction === 'right') {
      if (isLocked) {
        setLimitModal(true);
        return;
      }
      // Optimistic update so rapid taps see the new remaining before API responds
      if (quota && !quota.unlimited) {
        setQuota(q => ({
          ...q,
          remaining: Math.max(0, (q.remaining ?? 0) - 1),
          used: (q.used || 0) + 1,
        }));
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

      // Authoritative quota from server replaces optimistic value
      if (result?.quota) {
        setQuota(q => ({ ...q, ...result.quota, unlimited: result.quota.unlimited ?? q?.unlimited }));
      }

      if (direction === 'right' && autoTailorCV) {

        tailorCVForJob(currentJob.jobId, true)
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
        setSwipedJobs(prev => { const s = new Set(prev); s.delete(currentJob.jobId); return s; });
        setJobs(prev => [...prev, currentJob]);
        if (direction === 'right') setSwipedRight(p => Math.max(0, p - 1));
        setLastSwipe(null);
        setLimitModal(true);
        if (err.data) setQuota(err.data);
      } else if (direction === 'right' && quota && !quota.unlimited) {
        // Roll back optimistic update on non-429 errors
        setQuota(q => ({
          ...q,
          remaining: (q.remaining ?? 0) + 1,
          used: Math.max(0, (q.used || 0) - 1),
        }));
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

  // Upgrade prompt overlaid on top of the (blurred) cards when the daily limit
  // is reached. Shared between the "jobs remaining" and "feed exhausted" cases.
  const lockedOverlay = (
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
  );

  return (
    <div style={styles.container}>
      {/* Quota bar */}
      <QuotaBar quota={quota} onUpgradeClick={() => navigate('/profile?tab=subscription')} />

      {locationFilter && (
        <div style={styles.filterBanner}>
          <span>📍 {shortenLocation(locationFilter.name)} · עד {locationFilter.radius} ק"מ</span>
          <button style={styles.refreshBtn} onClick={loadJobs}>🔄</button>
        </div>
      )}

      <div style={styles.cardContainer}>
        {filteredJobs.length > 0 ? (
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
                onOpenDetail={() => !isBlocked && setSelectedJob(currentJob)}
                locked={isBlocked}
              />
            </AnimatePresence>

            {/* Locked overlay (limit reached, jobs still in feed = blurred teaser) */}
            {isLocked && lockedOverlay}
          </>
        ) : isLocked ? (
          // Daily limit reached AND the visible feed is exhausted: still show the
          // limit UI (blurred placeholder teaser + upgrade overlay), NOT the
          // "all done" empty state.
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ ...styles.card, filter: 'blur(5px)', opacity: 0.5, pointerEvents: 'none' }}
            >
              <div style={styles.cardHeader}>
                <div style={{ ...styles.logo_placeholder }}>★</div>
                <div><h2 style={styles.company}>משרה נוספת</h2><p style={styles.location}>📍  זמין אחרי שדרוג</p></div>
              </div>
              <h3 style={styles.title}>משרה מחכה לך</h3>
              <p style={styles.salary}>💰 ———</p>
            </motion.div>
            {lockedOverlay}
          </>
        ) : (
          // Genuinely out of jobs and NOT blocked — the "all done" celebration.
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
        )}
      </div>

      {/* Action buttons — hidden while loading quota or confirmed locked */}
      {filteredJobs.length > 0 && !isBlocked && (
        <div style={styles.buttons}>
          <motion.button style={styles.rejectBtn} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleSwipe('left')}><img src="/icons/x_icon.png" alt="Pass" style={styles.swipeIcon} /></motion.button>
          <motion.button style={styles.acceptBtn} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleSwipe('right')}><img src="/icons/heart_icon.png" alt="Like" style={styles.swipeIcon} /></motion.button>
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

      {lastSwipe && filteredJobs.length > 0 && !isBlocked && (
        <motion.p key={lastSwipe.job.jobId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={styles.feedback}>
          {lastSwipe.direction === 'right'
            ? autoApply ? `✅ CV נשלח ל-${lastSwipe.job.company}!` : `💾 נשמר — ${lastSwipe.job.company}`
            : `👋 דולגה — ${lastSwipe.job.company}`}
        </motion.p>
      )}

      {/* Undo button — fixed at bottom of screen, above navbar, never hidden behind cards.
          Only shown when there is a previous swipe to undo. */}
      {lastSwipe && filteredJobs.length > 0 && !isBlocked && (
        <motion.button
          style={styles.undoBtn}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleUndo}
          aria-label="בטל את ה-Swipe האחרון"
          title="בטל"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <span style={{ fontSize: '20px', lineHeight: 1 }}>↩</span>
          <span>Undo</span>
        </motion.button>
      )}

      {/* Limit modal */}
      <LimitModal
        visible={limitModal}
        resetAt={quota?.resetAt}
        used={quota?.used || 0}
        limit={quota?.limit || 5}
        plan={quota?.plan || 'FREE'}
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
  cardContainer: { position: 'relative', zIndex: 1, width: 'min(360px, 95vw)', height: '500px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRadius: '20px' },
  card: { width: 'min(360px, 95vw)', background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 8px 32px rgba(108,79,212,0.15)', height: '480px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'grab', userSelect: 'none', position: 'absolute', overflow: 'hidden' },
  stamp: { position: 'absolute', top: '24px', zIndex: 10 },
  likeStamp: { right: '24px', transform: 'rotate(15deg)' },
  nopeStamp: { left: '24px', transform: 'rotate(-15deg)' },
  stampIcon: { height: '120px', objectFit: 'contain' },
  // LTR + left-aligned so the logo sits on the left and the (Latin) company
  // name + location align left, instead of being flipped right by the global RTL.
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px', direction: 'ltr', textAlign: 'left' },
  logo_img: { width: '52px', height: '52px', borderRadius: '12px', objectFit: 'contain', border: '1px solid #eee' },
  logo_placeholder: { width: '52px', height: '52px', borderRadius: '12px', background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 700, color: 'white' },
  company: { fontSize: '18px', fontWeight: 700, color: 'var(--text-dark)', margin: 0 },
  location: { color: 'var(--text-light)', fontSize: '13px', margin: 0 },
  title: { fontSize: '20px', fontWeight: 700, color: 'var(--primary)', margin: 0 },
  salary: { fontSize: '15px', fontWeight: 600, color: 'var(--secondary)', margin: 0 },
  distance: { fontSize: '13px', fontWeight: 600, color: '#2E7D32', margin: 0 },
  shortSummaryBlock: { marginTop: '8px' },
  shortSummaryTitle: { fontSize: '20px', fontWeight: 800, color: '#1E2A4A', margin: '0 0 6px'},
  description: { fontSize: '14px', color: 'var(--text-light)', lineHeight: 1.6, margin: 0 },
  techContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  techBadge: { background: 'var(--background)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--primary)' },
  tapHint: { fontSize: '11px', color: '#bbb', textAlign: 'center', margin: 0, marginTop: 'auto', paddingTop: '16px'},
  lockedOverlay: { position: 'absolute', inset: 0, borderRadius: '20px', background: 'rgba(255,255,255,0.15)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 5, cursor: 'pointer' },
  lockedContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center', padding: '24px' },
  lockedTitle: { fontSize: '18px', fontWeight: 800, color: '#1E2A4A', margin: 0 },
  lockedSub: { fontSize: '13px', color: '#666', margin: 0 },
  lockedBtn: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' },
  buttons: { display: 'flex', gap: '40px', marginTop: '24px' },
  rejectBtn: { width: `${ICON_SIZES.swipeButton}px`, height: `${ICON_SIZES.swipeButton}px`, background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  acceptBtn: { width: `${ICON_SIZES.swipeButton}px`, height: `${ICON_SIZES.swipeButton}px`, background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  swipeIcon: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  unlockBtn: { marginTop: '24px', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '24px', padding: '14px 28px', cursor: 'pointer', fontSize: '15px', fontWeight: 700 },
  undoBtn: { position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minWidth: '44px', minHeight: '44px', padding: '12px 28px', background: '#FF9800', color: 'white', border: 'none', borderRadius: '28px', cursor: 'pointer', fontSize: '15px', fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' },
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
  descriptionPanel: { display: 'flex', flexDirection: 'column', gap: '14px' },
  descriptionSection: { background: '#F8FAFC', border: '1px solid #EEF2F7', borderRadius: '14px', padding: '14px' },
  descriptionHeading: { fontSize: '14px', fontWeight: 800, color: '#1E2A4A', margin: '0 0 8px' },
  descriptionText: { fontSize: '14px', color: '#5F6675', lineHeight: 1.65, margin: 0 },
  bulletList: { margin: 0, paddingInlineStart: '18px', display: 'flex', flexDirection: 'column', gap: '8px' },
  bulletItem: { fontSize: '14px', color: '#5F6675', lineHeight: 1.55 },
  techList: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  techPill: { background: 'white', color: '#6C4FD4', border: '1px solid #DDD6FE', borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: 700 },  applyLink: { color: '#6C4FD4', fontSize: '14px', fontWeight: 600 },
  footer: { display: 'flex', gap: '12px', paddingTop: '8px' },
  passBtn: { flex: 1, padding: '14px', borderRadius: '14px', border: '2px solid #F44336', background: 'white', color: '#F44336', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
  applyBtn: { flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
};

export default SwipePage;
