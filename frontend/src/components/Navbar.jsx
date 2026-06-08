import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import ICON_SIZES from '../iconSizes';

function Navbar({ isAdmin = false }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <div style={styles.header}>
        <img src="/app_logo.png" alt="joBoss" style={styles.logo} />
      </div>
      <div style={styles.navbar}>
        <button style={{ ...styles.navBtn, ...(isActive('/swipe') ? styles.active : {}) }} onClick={() => navigate('/swipe')}>
          <img src="/icons/jobs_icon.png" alt="משרות" style={styles.iconImg} />
          <span style={styles.label}>משרות</span>
        </button>
        <button style={{ ...styles.navBtn, ...(isActive('/applications') ? styles.active : {}) }} onClick={() => navigate('/applications')}>
          <img src="/icons/applies_icon.png" alt="הגשות" style={styles.iconImg} />
          <span style={styles.label}>הגשות</span>
        </button>
        <button style={{ ...styles.navBtn, ...(isActive('/profile') ? styles.active : {}) }} onClick={() => navigate('/profile')}>
          <img src="/icons/profile_icon.png" alt="פרופיל" style={styles.iconImg} />
          <span style={styles.label}>פרופיל</span>
        </button>
        {isAdmin && (
          <button style={{ ...styles.navBtn, ...(isActive('/admin') ? styles.active : {}), color: isActive('/admin') ? '#FF6B6B' : '#FF9800' }}
            onClick={() => navigate('/admin')}>
            <span style={styles.icon}>🛠️</span>
            <span style={styles.label}>Admin</span>
          </button>
        )}
      </div>
    </>
  );
}

const styles = {
  header: {
    position: 'fixed', top: 0, left: 0, right: 0, height: '56px',
    backgroundImage: 'url(/icons/swipes_icons/top_bar.png)',
    backgroundSize: 'cover', backgroundPosition: 'center bottom',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100,
  },
  logo: { height: '36px', objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(255,255,255,0.4))' },
  navbar: {
    position: 'fixed', bottom: 0, left: 0, right: 0, height: '64px',
    background: 'white', boxShadow: '0 -2px 12px rgba(108,79,212,0.12)',
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    zIndex: 100, boxSizing: 'border-box', direction: 'ltr',
  },
  navBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '2px', background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '8px 0', color: '#999',
  },
  active: { color: '#6C4FD4' },
  iconImg: { width: `${ICON_SIZES.navbar}px`, height: `${ICON_SIZES.navbar}px`, objectFit: 'contain' },
  label: { fontSize: '10px', fontWeight: 600 },
};

export default Navbar;
