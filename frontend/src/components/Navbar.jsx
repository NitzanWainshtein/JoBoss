import React from 'react';
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
      <h1 style={styles.logo} onClick={() => navigate('/swipe')}>
        jo<span style={styles.logoAccent}>Boss</span>
      </h1>

      <div style={styles.navLinks}>
        <button
          style={{ ...styles.navBtn, ...(isActive('/swipe') ? styles.navBtnActive : {}) }}
          onClick={() => navigate('/swipe')}
        >
          🔥 משרות
        </button>
        <button
          style={{ ...styles.navBtn, ...(isActive('/dashboard') ? styles.navBtnActive : {}) }}
          onClick={() => navigate('/dashboard')}
        >
          📋 הגשות
        </button>
        <button
          style={{ ...styles.navBtn, ...(isActive('/profile') ? styles.navBtnActive : {}) }}
          onClick={() => navigate('/profile')}
        >
          👤 פרופיל
        </button>
      </div>

      <button style={styles.logoutBtn} onClick={handleLogout}>
        התנתק
      </button>
      <button
  style={{ ...styles.navBtn }}
  onClick={() => navigate('/admin')}
>
  🛠️ ניהול
</button>
    </div>
  );
}

const styles = {
  navbar: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', position: 'sticky', top: 0, zIndex: 100 },
  logo: { fontSize: '24px', fontWeight: 800, color: 'var(--primary)', margin: 0, cursor: 'pointer' },
  logoAccent: { color: 'var(--secondary)' },
  navLinks: { display: 'flex', gap: '8px' },
  navBtn: { background: 'transparent', border: 'none', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', color: 'var(--text-light)', transition: 'all 0.2s' },
  navBtnActive: { background: 'var(--background)', color: 'var(--primary)' },
  logoutBtn: { background: '#eee', color: '#666', border: 'none', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
};

export default Navbar;