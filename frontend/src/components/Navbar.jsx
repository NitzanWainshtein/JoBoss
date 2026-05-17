import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div style={styles.navbar}>
      <img
        src="/app_logo.png"
        alt="joBoss"
        onClick={() => navigate('/swipe')}
        style={{ height: '32px', cursor: 'pointer', flexShrink: 0 }}
      />

      <div style={styles.navLinks}>
        <button
          style={{ ...styles.navBtn, ...(isActive('/swipe') ? styles.navBtnActive : {}) }}
          onClick={() => navigate('/swipe')}
        >
          🔥
          <span style={styles.navLabel}>משרות</span>
        </button>
        <button
          style={{ ...styles.navBtn, ...(isActive('/dashboard') ? styles.navBtnActive : {}) }}
          onClick={() => navigate('/dashboard')}
        >
          📋
          <span style={styles.navLabel}>הגשות</span>
        </button>
        <button
          style={{ ...styles.navBtn, ...(isActive('/profile') ? styles.navBtnActive : {}) }}
          onClick={() => navigate('/profile')}
        >
          👤
          <span style={styles.navLabel}>פרופיל</span>
        </button>
      </div>

      <button style={styles.logoutBtn} onClick={handleLogout}>
        יציאה
      </button>
    </div>
  );
}

const styles = {
  navbar: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    background: 'white',
    boxShadow: '0 2px 8px rgba(108,79,212,0.1)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxSizing: 'border-box'
  },
  navLinks: { display: 'flex', gap: '4px' },
  navBtn: {
    background: 'transparent',
    border: 'none',
    borderRadius: '16px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--text-light)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px'
  },
  navBtnActive: { background: '#F0F2FF', color: '#6C4FD4' },
  navLabel: { fontSize: '10px' },
  logoutBtn: {
    background: '#eee',
    color: '#666',
    border: 'none',
    borderRadius: '16px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '12px',
    flexShrink: 0
  },
};

export default Navbar;