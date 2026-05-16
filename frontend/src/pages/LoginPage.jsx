import React, { useState } from 'react';
import { signIn, signUp, confirmSignUp } from 'aws-amplify/auth';
import { useNavigate } from 'react-router-dom';

function LoginPage() {
  const [mode, setMode] = useState('login'); // login | register | confirm
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
  setLoading(true);
  setError('');
  try {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
    await signIn({ username: email, password });
    window.location.href = '/swipe';
  } catch (err) {
    setError(err.message);
  }
  setLoading(false);
};

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    try {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email, name } }
      });
      setMode('confirm');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      setMode('login');
      setError('האימות הצליח! התחבר עכשיו.');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>jo<span style={styles.logoAccent}>Boss</span></h1>
        <p style={styles.subtitle}>
          {mode === 'login' && 'התחבר לחשבונך'}
          {mode === 'register' && 'צור חשבון חדש'}
          {mode === 'confirm' && 'אמת את האימייל שלך'}
        </p>

        {mode === 'register' && (
          <input
            style={styles.input}
            placeholder="שם מלא"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}

        {mode !== 'confirm' && (
          <>
            <input
              style={styles.input}
              placeholder="אימייל"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="סיסמה"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}

        {mode === 'confirm' && (
          <input
            style={styles.input}
            placeholder="קוד אימות (נשלח לאימייל)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={styles.btn}
          onClick={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleConfirm}
          disabled={loading}
        >
          {loading ? 'טוען...' : mode === 'login' ? 'התחבר' : mode === 'register' ? 'הרשם' : 'אמת'}
        </button>

        <p style={styles.toggle}>
          {mode === 'login' ? (
            <>אין לך חשבון? <span style={styles.link} onClick={() => setMode('register')}>הרשם</span></>
          ) : (
            <>יש לך חשבון? <span style={styles.link} onClick={() => setMode('login')}>התחבר</span></>
          )}
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  card: { background: 'white', borderRadius: '24px', padding: '40px', width: '360px', boxShadow: '0 8px 32px rgba(255,107,107,0.15)', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' },
  logo: { fontSize: '36px', fontWeight: 800, color: 'var(--primary)', margin: 0 },
  logoAccent: { color: 'var(--secondary)' },
  subtitle: { color: 'var(--text-light)', fontSize: '14px', margin: 0 },
  input: { width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1.5px solid #eee', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', color: 'white', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer' },
  error: { color: 'var(--reject)', fontSize: '13px', margin: 0, textAlign: 'center' },
  toggle: { fontSize: '13px', color: 'var(--text-light)', margin: 0 },
  link: { color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }
};

export default LoginPage;