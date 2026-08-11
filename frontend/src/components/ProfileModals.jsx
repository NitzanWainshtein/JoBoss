// JoBoss feature:
// - F-23: Edit Profile & Change Password

import { useState } from 'react';
import { updatePassword } from 'aws-amplify/auth';
import { updateMyProfile } from '../api';
import useTranslation from '../i18n/useTranslation';

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
  const { t } = useTranslation();
  const nameParts = (profile?.fullName || '').split(' ');
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName,  setLastName]  = useState(nameParts.slice(1).join(' ') || '');
  const [email,     setEmail]     = useState(profile?.email || '');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const handleSave = async () => {
    if (!firstName.trim()) { setError(t('pm.firstNameRequired')); return; }
    setSaving(true); setError('');
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      await updateMyProfile({ fullName, email: email.trim() });
      // עדכון גלובלי — כל הקומפוננטות שמציגות את השם (Navbar, ProfilePage,
      // ApplicationsPage) מאזינות לאירוע הזה ומתרעננות מיד, בלי ריפרש ידני.
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: { fullName, email: email.trim() } }));
      onSaved({ fullName, email: email.trim() });
      onClose();
    } catch {
      setError(t('pm.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.sheet} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.handle} />
        <h3 style={modalStyles.title}>{t('pm.editProfile')}</h3>

        <div style={modalStyles.field}>
          <label style={modalStyles.label}>{t('pm.firstName')}</label>
          <input style={modalStyles.input} value={firstName}
            onChange={e => { setFirstName(e.target.value); setError(''); }} placeholder={t('pm.firstName')} />
        </div>
        <div style={modalStyles.field}>
          <label style={modalStyles.label}>{t('pm.lastName')}</label>
          <input style={modalStyles.input} value={lastName}
            onChange={e => { setLastName(e.target.value); setError(''); }} placeholder={t('pm.lastName')} />
        </div>
        <div style={modalStyles.field}>
          <label style={modalStyles.label}>{t('pm.email')}</label>
          <input style={modalStyles.input} type="email" value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="example@email.com" />
        </div>

        {error && <p style={modalStyles.error}>{error}</p>}

        <div style={modalStyles.btnRow}>
          <button style={modalStyles.cancelBtn} onClick={onClose}>{t('pm.cancel')}</button>
          <button style={{ ...modalStyles.saveBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSave} disabled={saving}>
            {saving ? t('pm.saving') : t('pm.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────
export function ChangePasswordModal({ onClose }) {
  const { t } = useTranslation();
  const [oldPass,  setOldPass]  = useState('');
  const [newPass,  setNewPass]  = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const handleSave = async () => {
    if (!oldPass) { setError(t('pm.currentPassRequired')); return; }
    if (newPass.length < 8) { setError(t('pm.passTooShort')); return; }
    if (newPass !== confirm) { setError(t('pm.passMismatch')); return; }
    setSaving(true); setError('');
    try {
      await updatePassword({ oldPassword: oldPass, newPassword: newPass });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('Incorrect') || msg.includes('incorrect')) setError(t('pm.wrongPass'));
      else setError(t('pm.changePassError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.sheet} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.handle} />
        <h3 style={modalStyles.title}>{t('pm.changePassTitle')}</h3>

        <div style={modalStyles.field}>
          <label style={modalStyles.label}>{t('pm.currentPass')}</label>
          <input style={modalStyles.input} type="password" value={oldPass}
            onChange={e => { setOldPass(e.target.value); setError(''); }} placeholder="••••••••" />
        </div>
        <div style={modalStyles.field}>
          <label style={modalStyles.label}>{t('pm.newPass')}</label>
          <input style={modalStyles.input} type="password" value={newPass}
            onChange={e => { setNewPass(e.target.value); setError(''); }} placeholder={t('pm.min8')} />
        </div>
        <div style={modalStyles.field}>
          <label style={modalStyles.label}>{t('pm.confirmNewPass')}</label>
          <input style={modalStyles.input} type="password" value={confirm}
            onChange={e => { setConfirm(e.target.value); setError(''); }} placeholder={t('pm.repeatNewPass')} />
        </div>

        {error && <p style={modalStyles.error}>{error}</p>}
        {success && <p style={{ ...modalStyles.error, color: '#4CAF50' }}>{t('pm.passChanged')}</p>}

        <div style={modalStyles.btnRow}>
          <button style={modalStyles.cancelBtn} onClick={onClose}>{t('pm.cancel')}</button>
          <button style={{ ...modalStyles.saveBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSave} disabled={saving || success}>
            {saving ? t('pm.changing') : t('pm.changePass')}
          </button>
        </div>
      </div>
    </div>
  );
}
