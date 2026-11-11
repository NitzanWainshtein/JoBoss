// JoBoss features:
// - F-19: Chrome Extension - ATS Auto-Fill
// - F-31: Chrome Extension - SSO Auth Bridge

import { useEffect, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import useTranslation from '../i18n/useTranslation';
import awsConfig from '../awsConfig';
import {
  parseAllowedExtensionIds,
  isAllowedExtensionId,
  findAmplifyIdToken,
} from '../utils/extensionAuth';

// Bridge page for the Chrome extension's "התחבר דרך JoBoss" flow.
// The extension opens this page with ?ext=<extensionId>. If the user has a live
// JoBoss session, we hand the Cognito idToken to the extension and close. If not,
// we bounce to /login and come straight back here afterward.
export default function AuthExtensionPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('checking'); // checking | sent | error

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const extId = params.get('ext');

      // 1. Decide whether we are willing to talk to this extension at all, and
      //    do it FIRST. Resolving the token before checking the target would
      //    mean an unauthorised id had already caused a live credential to be
      //    read into the page; refusing up front keeps it untouched.
      const allowed = parseAllowedExtensionIds(import.meta.env.VITE_EXTENSION_IDS);
      if (!isAllowedExtensionId(extId, allowed)) {
        console.error(
          '[auth-extension] refusing to hand a token to extension id %o. ' +
          'Allowlist has %d entr%s — set VITE_EXTENSION_IDS at build time.',
          extId, allowed.length, allowed.length === 1 ? 'y' : 'ies',
        );
        setStatus('error');
        return;
      }

      const runtime = window.chrome?.runtime;
      if (!runtime?.sendMessage) {
        // Not a Chromium browser, or the page was opened outside the extension
        // flow. Nothing to deliver to.
        setStatus('error');
        return;
      }

      // 2. Resolve the current idToken (Amplify first, then Amplify's own stored
      //    key for this user pool client — see findAmplifyIdToken).
      let token = null;
      try {
        const session = await fetchAuthSession();
        token = session?.tokens?.idToken?.toString() || null;
      } catch { /* no session */ }

      if (!token) {
        token = findAmplifyIdToken(window.localStorage,
                                   awsConfig.Auth.Cognito.userPoolClientId);
      }

      // 3. Not logged in → go log in, then return to this exact page (keep ext).
      if (!token) {
        const back = `/auth-extension?ext=${encodeURIComponent(extId)}`;
        window.location.href = `/login?redirect=${encodeURIComponent(back)}`;
        return;
      }

      // 4. Hand the token over, and believe the result rather than assuming it.
      //    lastError used to be read and discarded, so a delivery that never
      //    reached the extension still showed the user a green "connected" and
      //    closed the tab — leaving them to find out later that it had not
      //    worked, with no error anywhere.
      runtime.sendMessage(extId, { type: 'JOBOSS_AUTH', token }, () => {
        const lastError = window.chrome?.runtime?.lastError;
        if (lastError) {
          console.error('[auth-extension] delivery failed: %s', lastError.message);
          setStatus('error');
          return;
        }
        setStatus('sent');
        setTimeout(() => window.close(), 2000);
      });
    })();
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src="/app_logo.png" alt="JoBoss" style={{ width: 120, marginBottom: 18 }} />
        {status === 'checking' && (
          <>
            <div style={styles.spinner}>⏳</div>
            <p style={styles.title}>{t('authExt.connecting')}</p>
          </>
        )}
        {status === 'sent' && (
          <>
            <div style={styles.check}>✅</div>
            <p style={styles.title}>{t('authExt.connected')}</p>
            <p style={styles.sub}>{t('authExt.closing')}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={styles.check}>⚠️</div>
            <p style={styles.title}>{t('authExt.failedTitle')}</p>
            <p style={styles.sub}>{t('authExt.failedBody')}</p>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', direction: 'inherit', padding: 20,
  },
  card: {
    background: 'white', borderRadius: 24, padding: '40px 32px', textAlign: 'center',
    boxShadow: '0 1px 3px rgba(30,20,70,0.06)', maxWidth: 360, width: '100%',
  },
  spinner: { fontSize: 44, animation: 'spin 1.5s linear infinite' },
  check: { fontSize: 52 },
  title: { fontSize: 20, fontWeight: 700, color: '#1E2A4A', margin: '12px 0 4px' },
  sub: { fontSize: 14, color: '#777', margin: 0, lineHeight: 1.6 },
};
