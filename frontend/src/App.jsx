// JoBoss feature:
// - F-24: Account Suspension Screen

import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AnimatePresence, motion } from 'framer-motion';
import LoginPage from './pages/LoginPage.jsx';
import SwipePage from './pages/SwipePage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ApplicationsPage from './pages/ApplicationsPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import AuthExtensionPage from './pages/AuthExtensionPage.jsx';
import SwipeMockupPage from './pages/SwipeMockupPage.jsx';
import JobCardPreviewPage from './pages/JobCardPreviewPage.jsx';
import LegalPage from './pages/LegalPage.jsx';
import Navbar from './components/Navbar.jsx';
import PageTransition from './components/PageTransition.jsx';
import { createMyProfile, getSubscription } from './api';
import LanguageProvider from './i18n/LanguageProvider.jsx';
import './styles/global.css';

function SplashScreen({ ready, onDone }) {
  // Show for a short minimum (branding) but dismiss as soon as auth resolved —
  // no more fixed 2s wait on top of the actual loading time.
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), 900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready && minElapsed) onDone();
  }, [ready, minElapsed, onDone]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: 'fixed', inset: 0, overflow: 'hidden',
        background: 'linear-gradient(160deg, #241C56 0%, #4A35B8 55%, #7C5CFF 125%)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        zIndex: 9999, gap: '26px',
      }}
    >
      {/* Ambient blobs — same language as the app's aurora background. */}
      <motion.div
        aria-hidden
        animate={{ x: [0, 28, 0], y: [0, -22, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: '-14%', right: '-16%',
          width: '58vmin', height: '58vmin', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(157,124,255,0.55), transparent 68%)',
          filter: 'blur(50px)', pointerEvents: 'none',
        }}
      />
      <motion.div
        aria-hidden
        animate={{ x: [0, -24, 0], y: [0, 26, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', bottom: '-16%', left: '-14%',
          width: '52vmin', height: '52vmin', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,94,138,0.38), transparent 70%)',
          filter: 'blur(55px)', pointerEvents: 'none',
        }}
      />

      {/* The logo art is dark, so it washes out directly on the gradient.
          Seating it on a light tile keeps it legible and reads as an app icon. */}
      <motion.div
        initial={{ scale: 0.72, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <motion.div
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: 'rgba(255,255,255,0.96)',
            borderRadius: '34px',
            padding: '26px 34px',
            boxShadow: '0 26px 70px rgba(15,8,50,0.45), 0 0 0 1px rgba(255,255,255,0.25)',
          }}
        >
          <img src="/app_logo.png" alt="joBoss" style={{ width: '180px', display: 'block' }} />
        </motion.div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 0.92, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        style={{
          color: 'white', fontSize: '16px', fontWeight: 600, margin: 0,
          letterSpacing: '0.2px', zIndex: 1, textShadow: '0 2px 12px rgba(0,0,0,0.25)',
        }}
      >
        Find your next job, in a swipe
      </motion.p>

      {/* Indeterminate progress — signals work without faking a percentage. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        style={{
          position: 'relative', width: '132px', height: '4px', borderRadius: '999px',
          background: 'rgba(255,255,255,0.18)', overflow: 'hidden', zIndex: 1,
        }}
      >
        <motion.div
          animate={{ x: ['-100%', '260%'] }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: 0, width: '40%', borderRadius: '999px',
            background: 'linear-gradient(90deg, transparent, #FFFFFF, transparent)',
          }}
        />
      </motion.div>
    </motion.div>
  );
}

function AnimatedRoutes({ isLoggedIn, isAdmin, onboardingCompleted, onOnboardingComplete }) {
  const location = useLocation();

  const home = isLoggedIn ? (onboardingCompleted ? '/swipe' : '/onboarding') : '/login';

  // Logged in but needs onboarding — force redirect from any non-onboarding route.
  // Covers the case where OAuth callback lands the user on /swipe (stale URL) instead of /.
  // The extension auth bridge is exempt so it can complete regardless of onboarding.
  const needsOnboarding = isLoggedIn && !onboardingCompleted;
  if (needsOnboarding && location.pathname !== '/onboarding' && location.pathname !== '/auth-extension') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/auth-extension" element={<AuthExtensionPage />} />
        {/* Reachable signed-out too: consent links on the signup form point here. */}
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/legal/:doc" element={<LegalPage />} />
        <Route path="/swipe-mockup" element={<SwipeMockupPage />} />
        {import.meta.env.DEV && (
          <Route path="/job-card-preview" element={<JobCardPreviewPage />} />
        )}
        <Route path="/login" element={
          <PageTransition>
            {!isLoggedIn ? <LoginPage /> : <Navigate to={home} />}
          </PageTransition>
        } />
        <Route path="/onboarding" element={
          isLoggedIn
            ? (onboardingCompleted
                ? <Navigate to="/swipe" />
                : <OnboardingPage onComplete={onOnboardingComplete} />)
            : <Navigate to="/login" />
        } />
        <Route path="/swipe" element={
          <PageTransition>
            {isLoggedIn ? <SwipePage /> : <Navigate to="/login" />}
          </PageTransition>
        } />
        <Route path="/dashboard" element={
          <PageTransition>
            {isLoggedIn ? <DashboardPage /> : <Navigate to="/login" />}
          </PageTransition>
        } />
        <Route path="/profile" element={
          <PageTransition>
            {isLoggedIn ? <ProfilePage /> : <Navigate to="/login" />}
          </PageTransition>
        } />
        {/* Settings and Subscription are real screens, not in-page panels, so
            browser/hardware Back works and they are deep-linkable. Navbar keeps
            the Profile tab lit on both. */}
        <Route path="/settings" element={
          <PageTransition>
            {isLoggedIn ? <ProfilePage initialView="root" /> : <Navigate to="/login" />}
          </PageTransition>
        } />
        <Route path="/subscription" element={
          <PageTransition>
            {isLoggedIn ? <ProfilePage initialView="subscription" /> : <Navigate to="/login" />}
          </PageTransition>
        } />
        <Route path="/applications" element={
          <PageTransition>
            {isLoggedIn ? <ApplicationsPage /> : <Navigate to="/login" />}
          </PageTransition>
        } />
        <Route path="/admin" element={
          <PageTransition>
            {!isLoggedIn ? <Navigate to="/login" /> : isAdmin ? <AdminPage /> : <Navigate to="/swipe" />}
          </PageTransition>
        } />
        <Route path="/" element={<Navigate to={home} />} />
      </Routes>
    </AnimatePresence>
  );
}

function isAdminUser(session) {
  try {
    const token = session?.tokens?.idToken?.toString();
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const groups = payload['cognito:groups'] || [];
    return Array.isArray(groups) ? groups.includes('ADMIN') : groups.split(',').includes('ADMIN');
  } catch { return false; }
}

function SuspendedScreen() {
  const handleSignOut = async () => {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
    window.location.href = '/login';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 32, textAlign: 'center', background: 'var(--background)' }}>
      <img src="/app_logo.png" alt="JoBoss" style={{ width: 90, marginBottom: 24 }} />
      <h2 style={{ color: '#1E2A4A', fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>חשבונך הושהה</h2>
      <p style={{ color: '#555', fontSize: 15, maxWidth: 320, lineHeight: 1.6, margin: '0 0 4px' }}>
        נחסמת על ידי צוות JoBoss.
      </p>
      <p style={{ color: '#555', fontSize: 15, maxWidth: 320, lineHeight: 1.6, margin: '0 0 4px' }}>
        לפרטים ניתן לפנות לצוות:
      </p>
      <a href="mailto:joboss.appteam@gmail.com" style={{ color: '#6C4FD4', fontWeight: 600, fontSize: 15, margin: '0 0 28px' }}>
        joboss.appteam@gmail.com
      </a>
      <button onClick={handleSignOut} style={{ background: '#1E2A4A', color: 'white', border: 'none', borderRadius: 12, padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        התנתק
      </button>
    </div>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin]       = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [planKey, setPlanKey] = useState(() => localStorage.getItem('planKey') || '');

  // The plan badge in the header is driven from here, but this only loads once
  // at startup — so after an upgrade or cancellation it stayed stale until a
  // manual refresh. SubscriptionPage fires this whenever the plan changes.
  useEffect(() => {
    const onPlanChanged = (e) => {
      const plan = e.detail?.planKey;
      if (!plan) return;
      setPlanKey(plan);
      localStorage.setItem('planKey', plan);
    };
    window.addEventListener('plan-updated', onPlanChanged);
    return () => window.removeEventListener('plan-updated', onPlanChanged);
  }, []);
  const [loading, setLoading] = useState(true);
  // Skip the splash for the extension auth bridge so it resolves instantly.
  const isAuthExtRoute = typeof window !== 'undefined' && window.location.pathname === '/auth-extension';
  const [showSplash, setShowSplash] = useState(!isAuthExtRoute);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);

  const checkAuth = async () => {
    try {
      await getCurrentUser();
      // No forceRefresh — Amplify refreshes expired tokens on its own, and the
      // admin-group fallback below covers stale group claims. Saves a network
      // round-trip to Cognito on every app load.
      const session = await fetchAuthSession();
      setIsLoggedIn(true);
      // Primary: read from JWT. Fallback: probe the backend (handles cases where
      // group membership was updated after the last token was issued).
      const jwtAdmin = isAdminUser(session);
      let adminStatus = jwtAdmin;
      if (!jwtAdmin) {
        try {
          const { adminPing } = await import('./api');
          await adminPing();
          adminStatus = true;
        } catch { /* 403 = not admin, any other error = ignore */ }
      }
      setIsAdmin(adminStatus);
      // Check onboarding status — keep loading=true until we know
      try {
        const { getMyProfile } = await import('./api');
        const data = await getMyProfile();
        setOnboardingCompleted(data?.user?.onboardingCompleted === true);
        try {
          const subData = await getSubscription();
          const plan = subData?.planKey || 'FREE';
          setPlanKey(plan);
          localStorage.setItem('planKey', plan);
        } catch { /* subscription fetch failure is non-fatal */ }
      } catch (e) {
        if (e?.status === 403 && e?.data?.code === 'ACCOUNT_SUSPENDED') {
          setIsSuspended(true);
          setIsLoggedIn(false);
          return;
        }
        // 404 = no profile record → create one right away so the user exists
        // in the system (and is visible to admin) even if they abandon
        // onboarding. Normally the Cognito Post Confirmation trigger already
        // created it; this covers legacy/edge cases.
        if (e?.status === 404) {
          try {
            const { fetchUserAttributes } = await import('aws-amplify/auth');
            const attrs = await fetchUserAttributes().catch(() => ({}));
            await createMyProfile({
              fullName: (attrs.name || attrs.given_name || '').trim(),
              email: attrs.email || '',
            });
          } catch { /* backend trigger/backfill is the primary path */ }
          setOnboardingCompleted(false);
        } else {
          // Any other error (network, 500) → assume done to not block returning users
          setOnboardingCompleted(true);
        }
      }
    } catch {
      setIsLoggedIn(false);
      setOnboardingCompleted(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // One-time auth bootstrap: checkAuth is async, so its setStates run after
    // network awaits (not synchronously in the effect body) — the lint rule
    // can't see through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAuth();

    // האזן ל-OAuth callbacks
    const hubListenerCancelToken = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
        case 'signInWithRedirect':
          checkAuth();
          break;
        case 'signInWithRedirect_failure':
          console.error('OAuth sign in failed:', payload.data);
          setLoading(false);
          break;
        case 'customOAuthState':
          // טיפול ב-custom state אם צריך
          break;
      }
    });

    return () => hubListenerCancelToken();
  }, []);

  return (
    <LanguageProvider>
      <AnimatePresence>
        {showSplash && <SplashScreen ready={!loading} onDone={() => setShowSplash(false)} />}
      </AnimatePresence>

      {!showSplash && isSuspended && <SuspendedScreen />}

      {!showSplash && !isSuspended && (
        loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'transparent' }}>
            <div style={{ textAlign: 'center' }}>
              <img src="/app_logo.png" alt="joBoss" style={{ width: '120px', marginBottom: '16px' }} />
              <p style={{ color: '#7C5CFF', fontWeight: 600 }}>טוען...</p>
            </div>
          </div>
        ) : (
          <Router>
            {isLoggedIn && onboardingCompleted && !isAuthExtRoute && <Navbar isAdmin={isAdmin} planKey={planKey} />}
            <div style={{ paddingBottom: isLoggedIn && onboardingCompleted && !isAuthExtRoute ? 'calc(72px + env(safe-area-inset-bottom, 0px))' : '0', paddingTop: isLoggedIn && onboardingCompleted && !isAuthExtRoute ? 'calc(66px + env(safe-area-inset-top, 0px))' : '0' }}>
              <AnimatedRoutes
                isLoggedIn={isLoggedIn}
                isAdmin={isAdmin}
                onboardingCompleted={onboardingCompleted}
                onOnboardingComplete={() => setOnboardingCompleted(true)}
              />
            </div>
          </Router>
        )
      )}

    </LanguageProvider>
  );
}

export default App;
