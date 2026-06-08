import React, { useState, useEffect } from 'react';
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
import Navbar from './components/Navbar.jsx';
import PageTransition from './components/PageTransition.jsx';
import { createMyProfile } from './api';
import './styles/global.css';

function SplashScreen({ onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        zIndex: 9999, gap: '24px'
      }}
    >
      <motion.img
        src="/app_logo.png"
        alt="joBoss"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, type: 'spring' }}
        style={{ width: '200px', borderRadius: '32px' }}
      />
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        transition={{ delay: 0.6 }}
        style={{ color: 'white', fontSize: '16px', margin: 0 }}
      >
        Find your next job, in a swipe
      </motion.p>
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

export function isAdminUser(session) {
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
  const [loading, setLoading] = useState(true);
  // Skip the splash for the extension auth bridge so it resolves instantly.
  const isAuthExtRoute = typeof window !== 'undefined' && window.location.pathname === '/auth-extension';
  const [showSplash, setShowSplash] = useState(!isAuthExtRoute);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);

  const checkAuth = async () => {
    try {
      await getCurrentUser();
      const session = await fetchAuthSession();
      setIsLoggedIn(true);
      setIsAdmin(isAdminUser(session));
      // Check onboarding status — keep loading=true until we know
      try {
        const { getMyProfile } = await import('./api');
        const data = await getMyProfile();
        setOnboardingCompleted(data?.user?.onboardingCompleted === true);
      } catch (e) {
        if (e?.status === 403 && e?.data?.code === 'ACCOUNT_SUSPENDED') {
          setIsSuspended(true);
          setIsLoggedIn(false);
          return;
        }
        // 404 = new user, no profile yet → must go through onboarding
        // Any other error (network, 500) → assume done to not block returning users
        setOnboardingCompleted(e?.status !== 404);
      }
    } catch {
      setIsLoggedIn(false);
      setOnboardingCompleted(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    // האזן ל-OAuth callbacks
    const hubListenerCancelToken = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
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
    <>
      <AnimatePresence>
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      </AnimatePresence>

      {!showSplash && isSuspended && <SuspendedScreen />}

      {!showSplash && !isSuspended && (
        loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--background)' }}>
            <div style={{ textAlign: 'center' }}>
              <img src="/app_logo.png" alt="joBoss" style={{ width: '120px', marginBottom: '16px' }} />
              <p style={{ color: '#6C4FD4', fontWeight: 600 }}>טוען...</p>
            </div>
          </div>
        ) : (
          <Router>
            {isLoggedIn && onboardingCompleted && !isAuthExtRoute && <Navbar isAdmin={isAdmin} />}
            <div style={{ paddingBottom: isLoggedIn && onboardingCompleted && !isAuthExtRoute ? '64px' : '0', paddingTop: isLoggedIn && onboardingCompleted && !isAuthExtRoute ? '56px' : '0' }}>
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

    </>
  );
}

export default App;
