import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import SwipePage from './pages/SwipePage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import './styles/global.css';

function App() {
  // זמני — אחר כך יבוא מ-Cognito
  const isLoggedIn = true;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/swipe" element={isLoggedIn ? <SwipePage /> : <Navigate to="/login" />} />
        <Route path="/dashboard" element={isLoggedIn ? <DashboardPage /> : <Navigate to="/login" />} />
        <Route path="/" element={<Navigate to="/swipe" />} />
      </Routes>
    </Router>
  );
}

export default App;