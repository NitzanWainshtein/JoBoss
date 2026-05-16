import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getCurrentUser } from 'aws-amplify/auth';
import { AnimatePresence } from 'framer-motion';
import LoginPage from './pages/LoginPage.jsx';
import SwipePage from './pages/SwipePage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import Navbar from './components/Navbar.jsx';
import Spinner from './components/Spinner.jsx';
import PageTransition from './components/PageTransition.jsx';
import './styles/global.css';
import AdminPage from './pages/AdminPage.jsx';

function AnimatedRoutes({ isLoggedIn }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={
          <PageTransition>
            {!isLoggedIn ? <LoginPage /> : <Navigate to="/swipe" />}
          </PageTransition>
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
        <Route path="/" element={<Navigate to={isLoggedIn ? "/swipe" : "/login"} />} />
        <Route path="/admin" element={isLoggedIn ? <AdminPage /> : <Navigate to="/login" />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(() => setIsLoggedIn(true))
      .catch(() => setIsLoggedIn(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spinner text="טוען את joBoss..." />
    </div>
  );

  return (
    <Router>
      {isLoggedIn && <Navbar />}
      <AnimatedRoutes isLoggedIn={isLoggedIn} />
    </Router>
  );
}

export default App;