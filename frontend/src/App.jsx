import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getCurrentUser } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import awsConfig from './awsConfig';
import LoginPage from './pages/LoginPage.jsx';
import SwipePage from './pages/SwipePage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import Navbar from './components/Navbar.jsx';
import './styles/global.css';
import ProfilePage from './pages/ProfilePage.jsx';
import Spinner from './components/Spinner.jsx';

Amplify.configure(awsConfig);

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
      <Routes>
        <Route path="/login" element={!isLoggedIn ? <LoginPage /> : <Navigate to="/swipe" />} />
        <Route path="/swipe" element={isLoggedIn ? <SwipePage /> : <Navigate to="/login" />} />
        <Route path="/dashboard" element={isLoggedIn ? <DashboardPage /> : <Navigate to="/login" />} />
        <Route path="/" element={<Navigate to={isLoggedIn ? "/swipe" : "/login"} />} />
        <Route path="/profile" element={isLoggedIn ? <ProfilePage /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;