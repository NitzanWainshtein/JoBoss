import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function MismatchWarningModal({ visible, reason, onCancel, onContinue }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={styles.overlay}
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            style={styles.modal}
            onClick={e => e.stopPropagation()}
          >
            <div style={styles.iconWrap}>
              <span style={{ fontSize: '32px' }}>⚠️</span>
            </div>

            <h2 style={styles.title}>המשרה אולי לא מתאימה</h2>

            <p style={styles.body}>
              {reason || 'ה-AI זיהה פערים משמעותיים בין הרקע שלך לדרישות המשרה.'}
            </p>

            <p style={styles.sub}>
              תוכל להמשיך בכל זאת ולקבל קורות חיים מותאמים ככל האפשר.
            </p>

            <div style={styles.actions}>
              <button style={styles.cancelBtn} onClick={onCancel}>בטל</button>
              <button style={styles.continueBtn} onClick={onContinue}>המשך בכל זאת</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    zIndex: 400, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px',
  },
  modal: {
    background: 'white', borderRadius: '24px', padding: '32px 24px',
    maxWidth: '380px', width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '14px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
    direction: 'rtl', textAlign: 'center',
  },
  iconWrap: {
    width: '68px', height: '68px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #FFF3CD, #FFC107)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: '20px', fontWeight: 800, margin: 0, color: '#1E2A4A' },
  body: { fontSize: '14px', color: '#374151', margin: 0, lineHeight: 1.65 },
  sub: { fontSize: '12px', color: '#9CA3AF', margin: 0 },
  actions: { display: 'flex', gap: '10px', width: '100%', marginTop: '4px' },
  cancelBtn: {
    flex: 1, padding: '12px', borderRadius: '14px',
    border: '1.5px solid #E5E7EB', background: 'white',
    color: '#374151', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
  },
  continueBtn: {
    flex: 1, padding: '12px', borderRadius: '14px',
    border: 'none', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
    color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
  },
};

export default MismatchWarningModal;
