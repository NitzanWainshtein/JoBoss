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

function AnimatedRoutes({ isLoggedIn, onboardingCompleted, onOnboardingComplete }) {
  const location = useLocation();

  const home = isLoggedIn ? (onboardingCompleted ? '/swipe' : '/onboarding') : '/login';

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
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
            {isLoggedIn ? <AdminPage /> : <Navigate to="/login" />}
          </PageTransition>
        } />
        <Route path="/" element={<Navigate to={home} />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);

  const checkAuth = async () => {
    try {
      await getCurrentUser();
      await fetchAuthSession();
      setIsLoggedIn(true);
      // Check onboarding status — keep loading=true until we know
      try {
        const { getMyProfile } = await import('./api');
        const data = await getMyProfile();
        setOnboardingCompleted(data?.user?.onboardingCompleted === true);
      } catch {
        setOnboardingCompleted(true); // If profile fetch fails, don't block
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

      {!showSplash && (
        loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--background)' }}>
            <div style={{ textAlign: 'center' }}>
              <img src="/app_logo.png" alt="joBoss" style={{ width: '120px', marginBottom: '16px' }} />
              <p style={{ color: '#6C4FD4', fontWeight: 600 }}>טוען...</p>
            </div>
          </div>
        ) : (
          <Router>
            {isLoggedIn && onboardingCompleted && <Navbar />}
            <div style={{ paddingBottom: isLoggedIn && onboardingCompleted ? '64px' : '0', paddingTop: isLoggedIn && onboardingCompleted ? '56px' : '0' }}>
              <AnimatedRoutes
                isLoggedIn={isLoggedIn}
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
