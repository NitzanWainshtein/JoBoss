// JoBoss features:
// - F-01: User Registration & Authentication
// - F-25: Password Reset Flow

import { useState } from 'react';
import { signIn, signUp, confirmSignUp, signInWithRedirect, fetchUserAttributes, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { getMyProfile, createMyProfile } from '../api';
import useTranslation from '../i18n/useTranslation';

function LoginPage() {
  const { t } = useTranslation();
  // Unticked by default and required before signup: pre-ticked consent is not consent.
  const [agreed, setAgreed] = useState(false);
  // One toggle covers both password fields — they are never on screen together.
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState('login'); // login | register | confirm | forgot | forgotConfirm
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (mode === 'confirm') {
      if (code.trim().length < 4) { setError(t('login.codeRequired')); return false; }
      return true;
    }
    if (mode === 'forgotConfirm') {
      if (code.trim().length < 4) { setError(t('login.codeInvalid')); return false; }
      if (newPassword.length < 8) { setError(t('login.passMin8')); return false; }
      return true;
    }
    if (!email.includes('@') || !email.includes('.')) { setError(t('login.emailInvalid')); return false; }
    if (mode === 'forgot') return true;
    if (password.length < 8) { setError(t('login.passMin8b')); return false; }
    if (mode === 'register' && name.trim().length < 2) { setError(t('login.nameRequired')); return false; }
    return true;
  };

  const ensureProfile = async () => {
    try { await getMyProfile(); }
    catch {
      let resolvedName = name.trim();
      if (!resolvedName) {
        try {
          const attrs = await fetchUserAttributes();
          resolvedName = (attrs.name || attrs.given_name || '').trim();
        } catch { /* ignore */ }
      }
      await createMyProfile({ fullName: resolvedName, email, plan: 'FREE', role: 'USER', autoApply: false, preferredLocation: '', desiredRole: '', experienceLevel: 'Junior' });
    }
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true); setError('');
    try {
      const { signOut } = await import('aws-amplify/auth');
      await signOut();
      await signIn({ username: email, password });
      await ensureProfile();
      const redirect = new URLSearchParams(window.location.search).get('redirect');
      window.location.href = redirect || '/swipe';
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true); setError('');
    try {
      await signUp({ username: email, password, options: { userAttributes: { email, name } } });
      setMode('confirm');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (!validate()) return;
    setLoading(true); setError('');
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      setMode('login'); setError(t('login.verified'));
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleForgot = async () => {
    if (!validate()) return;
    setLoading(true); setError('');
    try {
      await resetPassword({ username: email });
      setMode('forgotConfirm');
      setError(t('login.resetSent'));
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleForgotConfirm = async () => {
    if (!validate()) return;
    setLoading(true); setError('');
    try {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
      setMode('login');
      setError(t('login.passReset'));
      setCode(''); setNewPassword('');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithRedirect({ provider: 'Google' });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (mode === 'login')         return handleLogin();
    if (mode === 'register')      return handleRegister();
    if (mode === 'confirm')       return handleConfirm();
    if (mode === 'forgot')        return handleForgot();
    if (mode === 'forgotConfirm') return handleForgotConfirm();
  };

  const btnLabel = () => {
    if (loading) return t('login.loading');
    if (mode === 'login')         return t('login.signIn');
    if (mode === 'register')      return t('login.signUp');
    if (mode === 'confirm')       return t('login.verify');
    if (mode === 'forgot')        return t('login.sendResetCode');
    if (mode === 'forgotConfirm') return t('login.resetPass');
  };

  const subtitle = () => {
    if (mode === 'login')         return t('login.signInTitle');
    if (mode === 'register')      return t('login.signUpTitle');
    if (mode === 'confirm')       return t('login.verifyTitle');
    if (mode === 'forgot')        return t('login.forgotTitle');
    if (mode === 'forgotConfirm') return t('login.forgotSubtitle');
  };

  const isSuccess = [t('login.verified'), t('login.resetSent'), t('login.passReset')].includes(error);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/app_logo.png" alt="joBoss" style={{ width: '160px', marginBottom: '8px' }} />
        <p style={styles.subtitle}>{subtitle()}</p>

        {/* Google sign-in: only on login/register */}
        {(mode === 'login' || mode === 'register') && (
          <>
            <button style={styles.googleBtn} onClick={handleGoogleSignIn} disabled={loading}>
              <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: '18px', height: '18px' }} />
              {mode === 'login' ? t('login.googleContinue') : t('login.googleSignUp')}
            </button>
            <div style={styles.divider}>
              <span style={styles.dividerLine}></span>
              <span style={styles.dividerText}>{t('common.or')}</span>
              <span style={styles.dividerLine}></span>
            </div>
          </>
        )}

        {/* Name field: register only */}
        {mode === 'register' && (
          <input style={styles.input} placeholder={t('login.fullName')} value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }} />
        )}

        {/* Email field */}
        {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
          <input style={styles.input} placeholder={t('login.email')} type="email" value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }} />
        )}

        {/* Password field: login/register only */}
        {(mode === 'login' || mode === 'register') && (<>
          <input style={{ ...styles.input, fontSize: '12px' }}
            placeholder={t('login.passHint')}
            type={showPassword ? 'text' : 'password'} value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }} />
          <label style={styles.showPass}>
            <input type="checkbox" checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              style={{ width: 15, height: 15, cursor: 'pointer' }} />
            <span>{t('login.showPassword')}</span>
          </label>
        </>)}

        {/* Confirm/forgot code */}
        {(mode === 'confirm' || mode === 'forgotConfirm') && (
          <input style={styles.input} placeholder={t('login.codeSent')} value={code}
            onChange={(e) => { setCode(e.target.value); setError(''); }} />
        )}

        {/* New password for forgot */}
        {mode === 'forgotConfirm' && (<>
          <input style={styles.input} placeholder={t('login.newPassHint')}
            type={showPassword ? 'text' : 'password'}
            value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(''); }} />
          <label style={styles.showPass}>
            <input type="checkbox" checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              style={{ width: 15, height: 15, cursor: 'pointer' }} />
            <span>{t('login.showPassword')}</span>
          </label>
        </>)}

        {error && (
          <p style={{ ...styles.error, color: isSuccess ? '#12A96F' : '#FF4D67' }}>{error}</p>
        )}

        {mode === 'register' && (
          <label style={styles.consent}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => { setAgreed(e.target.checked); setError(''); }}
              style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, cursor: 'pointer' }}
            />
            <span>
              {t('login.agreePre')}{' '}
              <a href="/legal/terms" target="_blank" rel="noreferrer" style={styles.link}>{t('settings.terms')}</a>
              {' '}{t('login.agreeAnd')}{' '}
              <a href="/legal/privacy" target="_blank" rel="noreferrer" style={styles.link}>{t('settings.privacy')}</a>
            </span>
          </label>
        )}

        <button style={{ ...styles.btn, opacity: (loading || (mode === 'register' && !agreed)) ? 0.5 : 1 }}
          onClick={handleSubmit} disabled={loading || (mode === 'register' && !agreed)}>
          {btnLabel()}
        </button>

        {/* Footer links */}
        {(mode === 'login' || mode === 'register') && (
          <>
            <p style={styles.toggle}>
              {mode === 'login'
                ? <>{t('login.noAccount')} <span style={styles.link} onClick={() => { setMode('register'); setError(''); }}>{t('login.signUp')}</span></>
                : <>{t('login.haveAccount')} <span style={styles.link} onClick={() => { setMode('login'); setError(''); }}>{t('login.signIn')}</span></>}
            </p>
            {mode === 'login' && (
              <p style={styles.toggle}>
                <span style={styles.link} onClick={() => { setMode('forgot'); setError(''); }}>{t('login.forgotPass')}</span>
              </p>
            )}
          </>
        )}

        {(mode === 'forgot' || mode === 'forgotConfirm' || mode === 'confirm') && (
          <p style={styles.toggle}>
            <span style={styles.link} onClick={() => { setMode('login'); setError(''); }}>{t('login.backToSignIn')}</span>
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'linear-gradient(165deg, #F5F2FF 0%, #ECE6FF 45%, #F8F0FF 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' },
  card: { background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', borderRadius: '28px', padding: '40px', width: '100%', maxWidth: '360px', boxShadow: '0 24px 60px rgba(91,61,245,0.18)', border: '1px solid rgba(255,255,255,0.9)', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' },
  subtitle: { color: '#6B5E9E', fontSize: '14px', margin: 0, fontWeight: 600 },
  googleBtn: {
    width: '100%', padding: '12px', borderRadius: '14px', background: 'white',
    border: '1.5px solid #EDE8FC', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
    color: '#1E2A4A', transition: 'all 0.2s',
  },
  divider: { width: '100%', display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' },
  dividerLine: { flex: 1, height: '1px', background: '#EDE8FC' },
  dividerText: { fontSize: '13px', color: '#7D719F', fontWeight: 600 },
  input: { width: '100%', padding: '13px 16px', borderRadius: '14px', border: '1.5px solid #E9E4FB', background: '#F8F6FF', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '15px', borderRadius: '14px', background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', color: 'white', border: 'none', fontSize: '16px', fontWeight: 800, cursor: 'pointer', transition: 'opacity 0.2s', boxShadow: '0 12px 28px rgba(91,61,245,0.35)' },
  error: { fontSize: '13px', margin: 0, textAlign: 'center' },
  showPass: {
    display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
    marginTop: '-4px', fontSize: '12px', fontWeight: 600, color: '#5A5478', cursor: 'pointer',
  },
  consent: {
    display: 'flex', alignItems: 'flex-start', gap: '9px', width: '100%',
    fontSize: '12.5px', lineHeight: 1.55, color: '#5A5478', cursor: 'pointer',
  },
  toggle: { fontSize: '13px', color: '#6B5E9E', margin: 0, fontWeight: 600 },
  link: { color: '#5B3DF5', cursor: 'pointer', fontWeight: 800 },
};

export default LoginPage;
