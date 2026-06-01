import React, { useState } from 'react';
import { signIn, signUp, confirmSignUp, signInWithRedirect, fetchUserAttributes } from 'aws-amplify/auth';
import { getMyProfile, createMyProfile } from '../api';

function LoginPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (mode !== 'confirm') {
      if (!email.includes('@') || !email.includes('.')) { setError('כתובת אימייל לא תקינה'); return false; }
      if (password.length < 8) { setError('סיסמה חייבת להיות לפחות 8 תווים'); return false; }
    }
    if (mode === 'register' && name.trim().length < 2) { setError('יש להזין שם מלא'); return false; }
    if (mode === 'confirm' && code.trim().length < 4) { setError('יש להזין קוד אימות תקין'); return false; }
    return true;
  };

  const ensureProfile = async () => {
    try { await getMyProfile(); }
    catch {
      // Resolve the real name from Cognito (set during signUp). The local `name`
      // state is empty on the login form, so never fall back to email for fullName.
      let resolvedName = name.trim();
      if (!resolvedName) {
        try {
          const attrs = await fetchUserAttributes();
          resolvedName = (attrs.name || attrs.given_name || '').trim();
        } catch { /* ignore — leave empty rather than storing email */ }
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
      // Honor a post-login redirect (e.g. the extension auth bridge), else /swipe.
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
      setMode('login'); setError('האימות הצליח! התחבר עכשיו.');
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

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/app_logo.png" alt="joBoss" style={{ width: '160px', marginBottom: '8px' }} />
        <p style={styles.subtitle}>
          {mode === 'login' && 'התחבר לחשבונך'}
          {mode === 'register' && 'צור חשבון חדש'}
          {mode === 'confirm' && 'אמת את האימייל שלך'}
        </p>

        {mode !== 'confirm' && (
          <>
            <button style={styles.googleBtn} onClick={handleGoogleSignIn} disabled={loading}>
              <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: '18px', height: '18px' }} />
              {mode === 'login' ? 'המשך עם Google' : 'הרשם עם Google'}
            </button>
            
            <div style={styles.divider}>
              <span style={styles.dividerLine}></span>
              <span style={styles.dividerText}>או</span>
              <span style={styles.dividerLine}></span>
            </div>
          </>
        )}

        {mode === 'register' && (
          <input style={styles.input} placeholder="שם מלא" value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }} />
        )}

        {mode !== 'confirm' && (
          <>
            <input style={styles.input} placeholder="אימייל" type="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }} />
            <input style={styles.input} placeholder="סיסמה (לפחות 8 תווים, אות גדולה ומספר)" type="password" value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }} />
          </>
        )}

        {mode === 'confirm' && (
          <input style={styles.input} placeholder="קוד אימות (נשלח לאימייל)" value={code}
            onChange={(e) => { setCode(e.target.value); setError(''); }} />
        )}

        {error && (
          <p style={{ ...styles.error, color: error.includes('הצליח') ? '#4CAF50' : '#F44336' }}>{error}</p>
        )}

        <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
          onClick={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleConfirm}
          disabled={loading}>
          {loading ? 'טוען...' : mode === 'login' ? 'התחבר' : mode === 'register' ? 'הרשם' : 'אמת'}
        </button>

        {mode !== 'confirm' && (
          <p style={styles.toggle}>
            {mode === 'login'
              ? <>אין לך חשבון? <span style={styles.link} onClick={() => { setMode('register'); setError(''); }}>הרשם</span></>
              : <>יש לך חשבון? <span style={styles.link} onClick={() => { setMode('login'); setError(''); }}>התחבר</span></>}
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' },
  card: { background: 'white', borderRadius: '24px', padding: '40px', width: '100%', maxWidth: '360px', boxShadow: '0 8px 32px rgba(108,79,212,0.15)', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' },
  subtitle: { color: '#6B7280', fontSize: '14px', margin: 0 },
  googleBtn: { 
    width: '100%', 
    padding: '12px', 
    borderRadius: '12px', 
    background: 'white', 
    border: '1.5px solid #eee', 
    fontSize: '15px', 
    fontWeight: 600, 
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    color: '#333',
    transition: 'all 0.2s'
  },
  divider: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '4px 0'
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#eee'
  },
  dividerText: {
    fontSize: '13px',
    color: '#999',
    fontWeight: 500
  },
  input: { width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1.5px solid #eee', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s' },
  error: { fontSize: '13px', margin: 0, textAlign: 'center' },
  toggle: { fontSize: '13px', color: '#6B7280', margin: 0 },
  link: { color: '#6C4FD4', cursor: 'pointer', fontWeight: 600 }
};

export default LoginPage;