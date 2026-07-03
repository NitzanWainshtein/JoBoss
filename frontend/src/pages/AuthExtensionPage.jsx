// JoBoss features:
// - F-19: Chrome Extension - ATS Auto-Fill
// - F-31: Chrome Extension - SSO Auth Bridge

import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

// Bridge page for the Chrome extension's "התחבר דרך JoBoss" flow.
// The extension opens this page with ?ext=<extensionId>. If the user has a live
// JoBoss session, we hand the Cognito idToken to the extension and close. If not,
// we bounce to /login and come straight back here afterward.
export default function AuthExtensionPage() {
  const [status, setStatus] = useState('checking'); // checking | sent | error

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const extId = params.get('ext');

      // 1. Resolve the current idToken (Amplify first, localStorage fallback).
      let token = null;
      try {
        const session = await fetchAuthSession();
        token = session?.tokens?.idToken?.toString() || null;
      } catch { /* no session */ }

      if (!token) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('idToken')) { token = localStorage.getItem(key); break; }
        }
      }

      // 2. Not logged in → go log in, then return to this exact page (keep ext).
      if (!token) {
        const back = '/auth-extension' + (extId ? `?ext=${encodeURIComponent(extId)}` : '');
        window.location.href = `/login?redirect=${encodeURIComponent(back)}`;
        return;
      }

      // 3. Hand the token to the extension.
      const runtime = window.chrome?.runtime;
      if (extId && runtime?.sendMessage) {
        runtime.sendMessage(extId, { type: 'JOBOSS_AUTH', token }, () => {
          // Ignore lastError — even if the response is missing, the token was sent.
          void window.chrome.runtime.lastError;
          setStatus('sent');
          setTimeout(() => window.close(), 2000);
        });
      } else {
        setStatus('error');
      }
    })();
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src="/app_logo.png" alt="JoBoss" style={{ width: 120, marginBottom: 18 }} />
        {status === 'checking' && (
          <>
            <div style={styles.spinner}>⏳</div>
            <p style={styles.title}>מתחבר לתוסף...</p>
          </>
        )}
        {status === 'sent' && (
          <>
            <div style={styles.check}>✅</div>
            <p style={styles.title}>מחובר!</p>
            <p style={styles.sub}>אפשר לסגור את החלון — הוא ייסגר אוטומטית.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={styles.check}>⚠️</div>
            <p style={styles.title}>לא ניתן להתחבר לתוסף</p>
            <p style={styles.sub}>ודא שתוסף JoBoss מותקן ופתח את החלון מתוך התוסף.</p>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', direction: 'rtl', padding: 20,
  },
  card: {
    background: 'white', borderRadius: 24, padding: '40px 32px', textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxWidth: 360, width: '100%',
  },
  spinner: { fontSize: 44, animation: 'spin 1.5s linear infinite' },
  check: { fontSize: 52 },
  title: { fontSize: 20, fontWeight: 800, color: '#1E2A4A', margin: '12px 0 4px' },
  sub: { fontSize: 14, color: '#777', margin: 0, lineHeight: 1.6 },
};
