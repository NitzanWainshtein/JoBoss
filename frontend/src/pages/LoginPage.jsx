// JoBoss features:
// - F-01: User Registration & Authentication
// - F-25: Password Reset Flow

import { useState } from 'react';
import { signIn, signUp, confirmSignUp, signInWithRedirect, fetchUserAttributes, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { getMyProfile, createMyProfile } from '../api';
import useTranslation from '../i18n/useTranslation';
import Icon from '../components/Icon';

function LoginPage() {
  const { t, language, toggleLanguage, nextLanguage } = useTranslation();
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

  const isAuthForm = mode === 'login' || mode === 'register';

  const PassToggle = (
    <label style={styles.showPass}>
      <input type="checkbox" checked={showPassword}
        onChange={(e) => setShowPassword(e.target.checked)}
        style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#5B3DF5' }} />
      <span>{t('login.showPassword')}</span>
    </label>
  );

  return (
    <div style={styles.container}>
      <span aria-hidden="true" style={styles.blobTop} />
      <span aria-hidden="true" style={styles.blobBottom} />

      {/* Language switch is available before sign-in. */}
      <button type="button" style={styles.langBtn} onClick={toggleLanguage}
        aria-label={`${t('menu.language')}: ${nextLanguage.label}`}>
        <Icon name="globe" size={18} />{nextLanguage.label}
      </button>

      <div style={styles.card}>
        <img src="/app_logo.png" alt="joBoss" style={styles.logo} />

        <h1 style={styles.title}>{mode === 'login' ? t('login.welcome') : subtitle()}</h1>
        {mode === 'login' && <p style={styles.sub}>{t('login.welcomeSub')}</p>}

        <div style={styles.form}>
          {/* Name field: register only */}
          {mode === 'register' && (
            <div style={styles.field}>
              <span style={styles.fieldIcon}><Icon name="profile" size={20} /></span>
              <input style={styles.input} placeholder={t('login.fullName')} value={name} autoComplete="name"
                onChange={(e) => { setName(e.target.value); setError(''); }} />
            </div>
          )}

          {/* Email field */}
          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <div style={styles.field}>
              <span style={styles.fieldIcon}><Icon name="mail" size={20} /></span>
              <input style={styles.input} placeholder={t('login.email')} type="email" value={email} autoComplete="email"
                onChange={(e) => { setEmail(e.target.value); setError(''); }} />
            </div>
          )}

          {/* Password field: login/register only */}
          {isAuthForm && (<>
            <div style={styles.field}>
              <span style={styles.fieldIcon}><Icon name="lock" size={20} /></span>
              <input style={styles.input}
                placeholder={mode === 'login' ? t('login.password') : t('login.passHint')}
                type={showPassword ? 'text' : 'password'} value={password}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                onChange={(e) => { setPassword(e.target.value); setError(''); }} />
            </div>
            <div style={styles.rowBetween}>
              {PassToggle}
              {mode === 'login' && (
                <span style={styles.link} role="button" tabIndex={0}
                  onClick={() => { setMode('forgot'); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setMode('forgot'); setError(''); } }}>
                  {t('login.forgotPass')}
                </span>
              )}
            </div>
          </>)}

          {/* Confirm/forgot code */}
          {(mode === 'confirm' || mode === 'forgotConfirm') && (
            <div style={styles.field}>
              <span style={styles.fieldIcon}><Icon name="key" size={20} /></span>
              <input style={styles.input} placeholder={t('login.codeSent')} value={code} inputMode="numeric"
                onChange={(e) => { setCode(e.target.value); setError(''); }} />
            </div>
          )}

          {/* New password for forgot */}
          {mode === 'forgotConfirm' && (<>
            <div style={styles.field}>
              <span style={styles.fieldIcon}><Icon name="lock" size={20} /></span>
              <input style={styles.input} placeholder={t('login.newPassHint')}
                type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(''); }} />
            </div>
            <div style={styles.rowBetween}>{PassToggle}</div>
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
                style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, cursor: 'pointer', accentColor: '#5B3DF5' }}
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
            {!loading && <span aria-hidden="true" style={styles.btnArrow}>{language === 'en' ? '→' : '←'}</span>}
          </button>
        </div>

        {/* Google sign-in: only on login/register */}
        {isAuthForm && (
          <>
            <div style={styles.divider}>
              <span style={styles.dividerLine}></span>
              <span style={styles.dividerText}>{t('common.or')}</span>
              <span style={styles.dividerLine}></span>
            </div>
            <button style={styles.googleBtn} onClick={handleGoogleSignIn} disabled={loading}>
              <GoogleMark />
              {mode === 'login' ? t('login.googleContinue') : t('login.googleSignUp')}
            </button>
          </>
        )}

        {/* Footer links */}
        {isAuthForm && (
          <p style={styles.toggle}>
            {mode === 'login'
              ? <>{t('login.noAccount')} <span style={styles.link} role="button" tabIndex={0} onClick={() => { setMode('register'); setError(''); }}>{t('login.signUp')}</span></>
              : <>{t('login.haveAccount')} <span style={styles.link} role="button" tabIndex={0} onClick={() => { setMode('login'); setError(''); }}>{t('login.signIn')}</span></>}
          </p>
        )}

        {(mode === 'forgot' || mode === 'forgotConfirm' || mode === 'confirm') && (
          <p style={styles.toggle}>
            <span style={styles.link} role="button" tabIndex={0} onClick={() => { setMode('login'); setError(''); }}>{t('login.backToSignIn')}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// Google's four-colour "G" (inline so there is no extra request).
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

const styles = {
  container: {
    minHeight: '100svh', background: '#F4F3FB', position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', boxSizing: 'border-box',
  },
  blobTop: {
    position: 'absolute', top: '-120px', insetInlineStart: '-90px', width: '300px', height: '300px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #7C7CF0, #9B8CF5)', opacity: 0.85, pointerEvents: 'none',
  },
  blobBottom: {
    position: 'absolute', bottom: '-130px', insetInlineEnd: '-100px', width: '320px', height: '320px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #C9C6F7, #DAD6FB)', pointerEvents: 'none',
  },
  langBtn: {
    position: 'absolute', top: '16px', insetInlineEnd: '16px', zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: '7px',
    padding: '8px 14px', borderRadius: '999px', border: '1px solid rgba(124,92,255,0.25)', background: 'rgba(255,255,255,0.92)',
    color: '#3A3552', fontSize: '14px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(60,50,140,0.12)',
  },
  card: {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: '440px', boxSizing: 'border-box',
    background: '#FDFDFF', borderRadius: '28px', padding: 'clamp(24px, 5vw, 40px) clamp(20px, 5vw, 36px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
    boxShadow: '0 24px 60px rgba(60,50,140,0.14)', border: '1px solid rgba(124,92,255,0.08)',
  },
  logo: { width: 'clamp(150px, 46%, 200px)', display: 'block', margin: '0 0 6px' },
  title: { color: '#1E2A4A', fontSize: 'clamp(22px, 5.5vw, 28px)', margin: '6px 0 0', fontWeight: 800, letterSpacing: '-0.3px', textAlign: 'center' },
  sub: { color: '#6F6A84', fontSize: '15px', margin: '-6px 0 8px', textAlign: 'center', lineHeight: 1.5 },
  form: { width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' },
  field: { position: 'relative', width: '100%' },
  fieldIcon: {
    position: 'absolute', insetInlineEnd: '18px', top: '50%', transform: 'translateY(-50%)',
    color: '#6F6A84', display: 'flex', pointerEvents: 'none',
  },
  input: {
    width: '100%', height: '52px', padding: '0 18px', paddingInlineEnd: '50px', borderRadius: '999px',
    border: '1.5px solid #E2DEF0', background: '#fff', fontSize: '15px', outline: 'none', boxSizing: 'border-box', color: '#1E2A4A',
  },
  rowBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%', marginTop: '-2px' },
  showPass: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 600, color: '#3A3552', cursor: 'pointer' },
  btn: {
    width: '100%', height: '54px', borderRadius: '999px', border: 'none', cursor: 'pointer',
    background: 'linear-gradient(90deg, #4F4AF0 0%, #6B5CF6 55%, #9B5CE0 118%)', color: 'white',
    fontSize: '17px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
    transition: 'opacity 0.2s', boxShadow: '0 12px 26px rgba(91,61,245,0.30)',
  },
  btnArrow: { fontSize: '20px', lineHeight: 1 },
  error: { fontSize: '13px', margin: 0, textAlign: 'center' },
  divider: { width: '100%', display: 'flex', alignItems: 'center', gap: '14px', margin: '4px 0' },
  dividerLine: { flex: 1, height: '1px', background: '#E4E0F0' },
  dividerText: { fontSize: '14px', color: '#6F6A84', fontWeight: 700 },
  googleBtn: {
    width: '100%', height: '52px', borderRadius: '999px', background: 'white',
    border: '1.5px solid #D5D0E4', fontSize: '15.5px', fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#1E2A4A',
  },
  consent: { display: 'flex', alignItems: 'flex-start', gap: '9px', width: '100%', fontSize: '12.5px', lineHeight: 1.55, color: '#5F5A72', cursor: 'pointer' },
  toggle: { fontSize: '14px', color: '#6F6A84', margin: '6px 0 0', fontWeight: 500, textAlign: 'center' },
  link: { color: '#5B3DF5', cursor: 'pointer', fontWeight: 700, fontSize: 'inherit' },
};

export default LoginPage;
