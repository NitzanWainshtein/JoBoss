import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

function LimitModal({ visible, resetAt, used, limit, plan = 'FREE', onClose, mode = 'swipe' }) {
  const isTailorMode = mode === 'tailor';
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!visible || !resetAt) return;

    const tick = () => {
      const now = Date.now();
      const reset = new Date(resetAt).getTime();
      const diff = Math.max(0, reset - now);
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setTimeLeft(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [visible, resetAt]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={styles.overlay}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            style={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.iconWrap}>
              <span style={styles.icon}>🔒</span>
            </div>

            <h2 style={styles.title}>
              {isTailorMode ? 'התאמת קורות חיים' : 'הגעת למגבלת ההחלקות היומית'}
            </h2>
            <p style={styles.sub}>
              {isTailorMode ? (
                <>פיצ'ר התאמת קורות חיים חכמה על ידי AI זמין <strong>למנויי פרימיום בלבד</strong>.</>
              ) : plan === 'FREE' ? (
                <>השתמשת ב-<strong>{used}</strong> מתוך <strong>{limit}</strong> ההחלקות החינמיות שלך להיום.</>
              ) : (
                <>השתמשת בכל <strong>{limit}</strong> ההחלקות היומיות שלך במסלול פרימיום.</>
              )}
            </p>

            {!isTailorMode && (
              <div style={styles.countdownBox}>
                <p style={styles.countdownLabel}>המגבלה מתאפסת בעוד</p>
                <p style={styles.countdown}>{timeLeft || '--:--:--'}</p>
              </div>
            )}

            <div style={styles.plansRow}>
              {plan !== 'PREMIUM' && (
                <PlanCard
                  name="פרימיום"
                  price="₪36"
                  perMonth="לחודש"
                  features={['30 החלקות ביום', '10 התאמות AI לחודש', 'Auto Apply']}
                  color="#6C4FD4"
                  onClick={() => { onClose(); navigate('/profile?tab=subscription'); }}
                />
              )}
              <PlanCard
                name="פרימיום+"
                price="₪72"
                perMonth="לחודש"
                features={['החלקות ללא הגבלה', 'AI ללא הגבלה', 'Priority Matching', 'Analytics מתקדם']}
                color="#FF6B6B"
                highlight
                onClick={() => { onClose(); navigate('/profile?tab=subscription'); }}
              />
            </div>

            <button style={styles.laterBtn} onClick={onClose}>
              אחר כך
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PlanCard({ name, price, perMonth, features, color, highlight, onClick }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      style={{
        ...styles.planCard,
        border: `2px solid ${color}`,
        background: highlight ? color : 'white',
        color: highlight ? 'white' : '#1E2A4A',
      }}
      onClick={onClick}
    >
      {highlight && <div style={styles.hotBadge}>🔥 הכי פופולרי</div>}
      <p style={{ ...styles.planName, color: highlight ? 'white' : color }}>{name}</p>
      <p style={styles.planPrice}>
        {price}
        <span style={{ fontSize: '12px', fontWeight: 500, opacity: 0.7 }}> / {perMonth}</span>
      </p>
      <div style={styles.featureList}>
        {features.map((f) => (
          <p key={f} style={{ ...styles.feature, color: highlight ? 'rgba(255,255,255,0.9)' : '#555' }}>
            ✓ {f}
          </p>
        ))}
      </div>
      <div style={{
        marginTop: '12px', padding: '8px', borderRadius: '10px',
        background: highlight ? 'rgba(255,255,255,0.25)' : color,
        color: 'white', fontSize: '13px', fontWeight: 700,
      }}>
        שדרג עכשיו
      </div>
    </motion.button>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    zIndex: 300, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px',
  },
  modal: {
    background: 'white', borderRadius: '24px', padding: '32px 24px',
    maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '16px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
  },
  iconWrap: {
    width: '72px', height: '72px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
  },
  icon: { fontSize: '32px' },
  title: { fontSize: '22px', fontWeight: 800, margin: 0, color: '#1E2A4A', textAlign: 'center' },
  sub: { fontSize: '14px', color: '#666', margin: 0, textAlign: 'center', lineHeight: 1.6 },
  countdownBox: { background: '#F0F2FF', borderRadius: '16px', padding: '16px 32px', textAlign: 'center', width: '100%' },
  countdownLabel: { fontSize: '12px', color: '#6C4FD4', fontWeight: 600, margin: '0 0 4px 0' },
  countdown: { fontSize: '32px', fontWeight: 800, color: '#1E2A4A', margin: 0, letterSpacing: '2px', fontVariantNumeric: 'tabular-nums' },
  plansRow: { display: 'flex', gap: '12px', width: '100%' },
  planCard: {
    flex: 1, borderRadius: '16px', padding: '16px 12px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: '4px',
    position: 'relative', overflow: 'hidden', textAlign: 'right',
    border: 'none',
  },
  hotBadge: {
    position: 'absolute', top: '8px', left: '8px',
    background: 'rgba(255,255,255,0.3)', fontSize: '10px', fontWeight: 700,
    padding: '2px 8px', borderRadius: '20px', color: 'white',
  },
  planName: { fontSize: '15px', fontWeight: 800, margin: 0 },
  planPrice: { fontSize: '20px', fontWeight: 800, margin: '4px 0 0 0' },
  featureList: { display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px' },
  feature: { fontSize: '11px', margin: 0 },
  laterBtn: {
    background: 'transparent', border: 'none', color: '#999',
    fontSize: '14px', cursor: 'pointer', padding: '4px', textDecoration: 'underline',
  },
};

export default LimitModal;
