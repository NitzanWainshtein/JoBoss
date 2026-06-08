import React, { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';

const MOCK_JOB = {
  company: 'Google',
  title: 'Senior Frontend Developer',
  location: 'תל אביב-יפו',
  distance: '3.2',
  summary: 'אנחנו מחפשים מפתח Frontend מנוסה לצוות ה-Cloud Console. תעבוד על ממשקי משתמש בסדר גודל של מיליוני משתמשים, תוך שימוש ב-React, TypeScript ו-GraphQL.',
  technologies: ['React', 'TypeScript', 'GraphQL', 'Node.js', 'Figma'],
};

const MOCK_NEXT = { company: 'Microsoft', firstLetter: 'M' };

function MockCard({ job, x, rotate, likeOpacity, nopeOpacity, isDraggable }) {
  const cardStyle = isDraggable
    ? { ...s.card, x, rotate }
    : { ...s.card, position: 'absolute', zIndex: 0, top: '8px', transform: 'scale(0.96)', filter: 'blur(1.5px)', opacity: 0.55, pointerEvents: 'none' };

  return (
    <motion.div
      style={cardStyle}
      drag={isDraggable ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
    >
      {isDraggable && (
        <>
          <motion.div style={{ ...s.stamp, right: '20px', top: '20px', transform: 'rotate(15deg)', opacity: likeOpacity }}>
            <img src="/icons/yes_icon.png" alt="YES" style={{ height: '100px', objectFit: 'contain' }} draggable="false" />
          </motion.div>
          <motion.div style={{ ...s.stamp, left: '20px', top: '20px', transform: 'rotate(-15deg)', opacity: nopeOpacity }}>
            <img src="/icons/nope_icon.png" alt="NOPE" style={{ height: '100px', objectFit: 'contain' }} draggable="false" />
          </motion.div>
        </>
      )}

      <div style={s.cardHeader}>
        <div style={s.logoBox}>{isDraggable ? 'G' : MOCK_NEXT.firstLetter}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.company}>{isDraggable ? job.company : MOCK_NEXT.company}</div>
          {isDraggable && <div style={s.distanceRow}>📍 {job.distance} ק"מ ממך</div>}
          {isDraggable && <div style={s.locationText}>{job.location}</div>}
        </div>
      </div>

      {isDraggable && (
        <>
          <div style={s.title}>{job.title}</div>

          <div style={s.summaryBlock}>
            <div style={s.summaryTitle}>Summary</div>
            <div style={s.summaryText}>{job.summary}</div>
          </div>

          <div style={s.techRow}>
            {job.technologies.map(t => (
              <span key={t} style={s.techBadge}>{t}</span>
            ))}
          </div>

          <div style={s.tapHint}>
            <img
              src="/icons/clickHere_icon.png"
              alt="לחץ לפרטים נוספים"
              style={{ width: 'min(200px, 65%)', height: 'auto', objectFit: 'contain' }}
              draggable="false"
            />
          </div>
        </>
      )}
    </motion.div>
  );
}

export default function SwipeMockupPage() {
  const [cardKey, setCardKey] = useState(0);
  const [feedback, setFeedback] = useState(null);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-20, 20]);
  const likeOpacity = useTransform(x, [20, 80], [0, 1]);
  const nopeOpacity = useTransform(x, [-80, -20], [1, 0]);

  const swipeCard = (dir) => {
    const targetX = dir === 'right' ? 520 : -520;
    setFeedback(dir);
    animate(x, targetX, { duration: 0.38, ease: 'easeIn' }).then(() => {
      x.set(0);
      setCardKey(k => k + 1);
      setTimeout(() => setFeedback(null), 1000);
    });
  };

  const used = 8;
  const limit = 20;
  const pct = Math.round((used / limit) * 100);

  return (
    <div style={s.page}>
      {/* Top bar with image background */}
      <div style={s.header}>
        <img src="/app_logo.png" alt="JoBoss" style={s.logo} />
      </div>

      {/* Content */}
      <div style={s.content}>

        {/* Quota bar */}
        <div style={s.quotaBar}>
          <div style={s.quotaTop}>
            <span style={s.quotaLabel}>
              <span dir="ltr">{used} / {limit}</span> החלקות היום
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button style={s.quotaRefreshBtn} title="רענן משרות">↻</button>
              <button style={s.quotaUpgradeBtn}>שדרג ⭐</button>
            </div>
          </div>
          <div style={s.quotaTrack}>
            <div style={{ ...s.quotaFill, width: `${pct}%` }} />
          </div>
          <div style={s.locationChip}>
            <img src="/icons/location_icon.png" alt="" style={{ width: '12px', height: '12px', objectFit: 'contain', flexShrink: 0 }} />
            תל אביב-יפו&nbsp;•&nbsp;20 ק"מ
          </div>
        </div>

        {/* Card area */}
        <div style={s.cardWrap}>
          {/* Back card */}
          <MockCard job={null} isDraggable={false} x={null} rotate={null} likeOpacity={null} nopeOpacity={null} />

          {/* Front card */}
          <AnimatePresence>
            <MockCard
              key={cardKey}
              job={MOCK_JOB}
              isDraggable
              x={x}
              rotate={rotate}
              likeOpacity={likeOpacity}
              nopeOpacity={nopeOpacity}
            />
          </AnimatePresence>
        </div>

        {/* Swipe buttons */}
        <div style={s.buttons}>
          <motion.button
            style={s.rejectBtn}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.88 }}
            onClick={() => swipeCard('left')}
          >
            <img src="/icons/x_icon.png" alt="Pass" style={s.swipeIcon} />
          </motion.button>
          <motion.button
            style={s.acceptBtn}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.88 }}
            onClick={() => swipeCard('right')}
          >
            <img src="/icons/heart_icon.png" alt="Like" style={s.swipeIcon} />
          </motion.button>
        </div>

        {/* Feedback toast */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              key={feedback + cardKey}
              style={s.feedbackToast}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {feedback === 'right' ? `💾 נשמר — ${MOCK_JOB.company}` : `👋 דולגה — ${MOCK_JOB.company}`}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom nav (visual only) */}
      <div style={s.navbar}>
        <button style={{ ...s.navBtn, color: '#6C4FD4' }}>
          <img src="/icons/jobs_icon.png" alt="" style={s.navIcon} />
          <span style={s.navLabel}>משרות</span>
        </button>
        <button style={s.navBtn}>
          <img src="/icons/applies_icon.png" alt="" style={s.navIcon} />
          <span style={s.navLabel}>הגשות</span>
        </button>
        <button style={s.navBtn}>
          <img src="/icons/profile_icon.png" alt="" style={s.navIcon} />
          <span style={s.navLabel}>פרופיל</span>
        </button>
      </div>
    </div>
  );
}

const s = {
  /* ── Page shell ─────────────────────────────────────────────── */
  page: {
    height: '100svh',
    backgroundImage: 'url(/icons/swipes_icons/screen_base_background.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  /* ── Top header ─────────────────────────────────────────────── */
  header: {
    position: 'fixed', top: 0, left: 0, right: 0,
    height: '56px',
    backgroundImage: 'url(/icons/swipes_icons/top_bar.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center bottom',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  logo: { height: '34px', objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(255,255,255,0.4))' },

  /* ── Scrollable content ─────────────────────────────────────── */
  content: {
    flex: 1,
    paddingTop: '68px',
    paddingBottom: '76px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    overflow: 'hidden',
    padding: '68px 16px 76px',
    boxSizing: 'border-box',
  },

  /* ── Quota bar ──────────────────────────────────────────────── */
  quotaBar: {
    width: 'min(360px, 95vw)',
    background: 'rgba(255,255,255,0.88)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '14px',
    padding: '10px 14px',
    boxShadow: '0 2px 16px rgba(108,79,212,0.12)',
    border: '1px solid rgba(237,233,254,0.7)',
  },
  quotaTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  quotaLabel: { fontSize: '12px', fontWeight: 700, color: '#6C4FD4' },
  quotaRefreshBtn: {
    width: '26px', height: '26px', borderRadius: '50%',
    border: '1.5px solid #6C4FD4', background: 'white',
    color: '#6C4FD4', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  quotaUpgradeBtn: {
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white',
    border: 'none', borderRadius: '20px', padding: '4px 11px',
    cursor: 'pointer', fontSize: '11px', fontWeight: 700,
  },
  quotaTrack: { height: '5px', borderRadius: '3px', background: '#EDE9FE', overflow: 'hidden' },
  quotaFill: { height: '100%', background: '#6C4FD4', borderRadius: '3px' },
  locationChip: {
    marginTop: '7px', display: 'flex', alignItems: 'center', gap: '4px',
    justifyContent: 'flex-end', fontSize: '11px', fontWeight: 600, color: '#2E7D32',
  },

  /* ── Card area ──────────────────────────────────────────────── */
  cardWrap: {
    position: 'relative',
    width: 'min(360px, 95vw)',
    flex: '1',
    minHeight: '280px',
    maxHeight: '520px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: '20px',
  },
  card: {
    width: 'min(360px, 95vw)',
    backgroundImage: 'url(/icons/swipes_icons/slider_background.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    borderRadius: '20px',
    padding: '16px 20px',
    boxShadow: '0 8px 40px rgba(108,79,212,0.18)',
    height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    cursor: 'grab',
    userSelect: 'none',
    position: 'absolute',
    overflow: 'hidden',
  },
  stamp: { position: 'absolute', zIndex: 10 },

  /* ── Card internals ─────────────────────────────────────────── */
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px', direction: 'ltr', textAlign: 'left' },
  logoBox: {
    width: '52px', height: '52px', borderRadius: '12px', flexShrink: 0,
    background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '24px', fontWeight: 700, color: 'white',
  },
  company: { fontSize: '18px', fontWeight: 700, color: '#1E2A4A', margin: 0 },
  distanceRow: { fontSize: '13px', fontWeight: 600, color: '#2E7D32', margin: '2px 0 0' },
  locationText: { fontSize: '11px', color: '#888', margin: '1px 0 0', direction: 'rtl', textAlign: 'right' },
  title: { fontSize: '19px', fontWeight: 700, color: '#6C4FD4', margin: 0 },
  summaryBlock: { flex: 1 },
  summaryTitle: { fontSize: '15px', fontWeight: 800, color: '#1E2A4A', margin: '0 0 4px' },
  summaryText: { fontSize: '13px', color: '#4B5563', lineHeight: 1.6, margin: 0 },
  techRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  techBadge: {
    background: 'rgba(108,79,212,0.08)', color: '#6C4FD4',
    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
    border: '1px solid rgba(108,79,212,0.18)',
  },
  tapHint: { display: 'flex', justifyContent: 'center', marginTop: 'auto', paddingTop: '8px' },

  /* ── Swipe buttons ──────────────────────────────────────────── */
  buttons: { display: 'flex', gap: '40px', flexShrink: 0 },
  rejectBtn: { width: '70px', height: '70px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  acceptBtn: { width: '70px', height: '70px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  swipeIcon: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },

  /* ── Feedback toast ─────────────────────────────────────────── */
  feedbackToast: {
    fontSize: '13px', fontWeight: 600, color: '#1E2A4A',
    background: 'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    padding: '5px 16px', borderRadius: '20px',
    boxShadow: '0 2px 8px rgba(108,79,212,0.1)',
  },

  /* ── Bottom navbar ──────────────────────────────────────────── */
  navbar: {
    position: 'fixed', bottom: 0, left: 0, right: 0, height: '64px',
    background: 'white',
    boxShadow: '0 -2px 12px rgba(108,79,212,0.12)',
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    zIndex: 100, direction: 'ltr',
  },
  navBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '2px', background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '8px 0', color: '#999',
  },
  navIcon: { width: '28px', height: '28px', objectFit: 'contain' },
  navLabel: { fontSize: '10px', fontWeight: 600 },
};
