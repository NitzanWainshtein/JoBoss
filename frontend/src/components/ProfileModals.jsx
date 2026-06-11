import React, { useState } from 'react';
import { updatePassword } from 'aws-amplify/auth';
import { updateMyProfile } from '../api';

// ── Shared modal styles ───────────────────────────────────────────────────────
export const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(4px)',
  },
  sheet: {
    background: 'white', borderRadius: '24px 24px 0 0',
    padding: '16px 24px 40px', width: '100%', maxWidth: '480px',
    display: 'flex', flexDirection: 'column', gap: '14px',
    boxShadow: '0 -8px 32px rgba(108,79,212,0.18)',
  },
  handle: {
    width: '40px', height: '4px', borderRadius: '99px',
    background: '#E0D9FF', margin: '0 auto 4px',
  },
  title: { fontSize: '18px', fontWeight: 700, color: '#1E2A4A', margin: 0, textAlign: 'center' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#6B7280' },
  input: {
    padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #E5E7EB',
    fontSize: '14px', outline: 'none', background: '#FAFAFA',
  },
  error: { fontSize: '13px', color: '#F44336', margin: 0, textAlign: 'center' },
  btnRow: { display: 'flex', gap: '10px', marginTop: '4px' },
  cancelBtn: {
    flex: 1, padding: '13px', borderRadius: '12px', border: '1.5px solid #E5E7EB',
    background: 'white', color: '#6B7280', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
  },
  saveBtn: {
    flex: 2, padding: '13px', borderRadius: '12px', border: 'none',
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
    color: 'white', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
};

// ── Edit Profile Modal ────────────────────────────────────────────────────────
export function EditProfileModal({ profile, onClose, onSaved }) {
  const nameParts = (profile?.fullName || '').split(' ');
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName,  setLastName]  = useState(nameParts.slice(1).join(' ') || '');
  const [email,     setEmail]     = useState(profile?.email || '');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const handleSave = async () => {
    if (!firstName.trim()) { setError('יש להזין שם פרטי'); return; }
    setSaving(true); setError('');
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      await updateMyProfile({ fullName, email: email.trim() });
      onSaved({ fullName, email: email.trim() });
      onClose();
    } catch {
      setError('שגיאה בשמירה, נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.sheet} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.handle} />
        <h3 style={modalStyles.title}>עריכת פרטים אישיים</h3>

        <div style={modalStyles.field}>
          <label style={modalStyles.label}>שם פרטי</label>
          <input style={modalStyles.input} value={firstName}
            onChange={e => { setFirstName(e.target.value); setError(''); }} placeholder="שם פרטי" />
        </div>
        <div style={modalStyles.field}>
          <label style={modalStyles.label}>שם משפחה</label>
          <input style={modalStyles.input} value={lastName}
            onChange={e => { setLastName(e.target.value); setError(''); }} placeholder="שם משפחה" />
        </div>
        <div style={modalStyles.field}>
          <label style={modalStyles.label}>כתובת מייל</label>
          <input style={modalStyles.input} type="email" value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="example@email.com" />
        </div>

        {error && <p style={modalStyles.error}>{error}</p>}

        <div style={modalStyles.btnRow}>
          <button style={modalStyles.cancelBtn} onClick={onClose}>ביטול</button>
          <button style={{ ...modalStyles.saveBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSave} disabled={saving}>
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────
export function ChangePasswordModal({ onClose }) {
  const [oldPass,  setOldPass]  = useState('');
  const [newPass,  setNewPass]  = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const handleSave = async () => {
    if (!oldPass) { setError('יש להזין סיסמה נוכחית'); return; }
    if (newPass.length < 8) { setError('הסיסמה החדשה חייבת להיות לפחות 8 תווים'); return; }
    if (newPass !== confirm) { setError('הסיסמאות אינן תואמות'); return; }
    setSaving(true); setError('');
    try {
      await updatePassword({ oldPassword: oldPass, newPassword: newPass });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('Incorrect') || msg.includes('incorrect')) setError('הסיסמה הנוכחית שגויה');
      else setError('שגיאה בשינוי הסיסמה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.sheet} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.handle} />
        <h3 style={modalStyles.title}>החלפת סיסמא</h3>

        <div style={modalStyles.field}>
          <label style={modalStyles.label}>סיסמה נוכחית</label>
          <input style={modalStyles.input} type="password" value={oldPass}
            onChange={e => { setOldPass(e.target.value); setError(''); }} placeholder="••••••••" />
        </div>
        <div style={modalStyles.field}>
          <label style={modalStyles.label}>סיסמה חדשה</label>
          <input style={modalStyles.input} type="password" value={newPass}
            onChange={e => { setNewPass(e.target.value); setError(''); }} placeholder="לפחות 8 תווים" />
        </div>
        <div style={modalStyles.field}>
          <label style={modalStyles.label}>אימות סיסמה חדשה</label>
          <input style={modalStyles.input} type="password" value={confirm}
            onChange={e => { setConfirm(e.target.value); setError(''); }} placeholder="חזור על הסיסמה החדשה" />
        </div>

        {error && <p style={modalStyles.error}>{error}</p>}
        {success && <p style={{ ...modalStyles.error, color: '#4CAF50' }}>הסיסמה שונתה בהצלחה!</p>}

        <div style={modalStyles.btnRow}>
          <button style={modalStyles.cancelBtn} onClick={onClose}>ביטול</button>
          <button style={{ ...modalStyles.saveBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSave} disabled={saving || success}>
            {saving ? 'מחליף...' : 'שנה סיסמה'}
          </button>
        </div>
      </div>
    </div>
  );
}
