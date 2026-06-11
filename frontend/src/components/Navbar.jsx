import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import ICON_SIZES from '../iconSizes';
import { getMyProfile, uploadProfileImage } from '../api';
import { EditProfileModal, ChangePasswordModal } from './ProfileModals';

const PLAN_LOGOS = {
  FREE:         '/icons/free_members_icon.png',
  PREMIUM:      '/icons/premium_member_icon.png',
  PREMIUM_PLUS: '/icons/plus_members_icon.png',
};

function getHeaderLogo(isAdmin, planKey) {
  if (isAdmin) return '/icons/admin_logo.png';
  return PLAN_LOGOS[planKey] || '/app_logo.png';
}

function Navbar({ isAdmin = false, planKey = '' }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const itemRefs  = useRef([]);
  const navRef    = useRef(null);
  const menuRef   = useRef(null);
  const imgInputRef = useRef(null);

  const [bubble, setBubble] = useState({ left: 0, width: 0 });
  const [ready,  setReady]  = useState(false);

  const [profileImage,   setProfileImage]   = useState(null);
  const [userName,       setUserName]       = useState('');
  const [profileData,    setProfileData]    = useState(null);
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [showEdit,       setShowEdit]       = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [uploadingImg,   setUploadingImg]   = useState(false);

  const navItems = [
    { path: '/swipe',        icon: '/icons/jobs_icon.png',       label: 'משרות'  },
    { path: '/applications', icon: '/icons/applies_icon.png',    label: 'הגשות'  },
    { path: '/profile',      icon: '/icons/profile_icon.png',    label: 'פרופיל' },
    ...(isAdmin ? [{ path: '/admin', icon: '/icons/admin_edit_icon.png', label: 'Admin' }] : []),
  ];

  const activeIndex = navItems.findIndex(item => location.pathname === item.path);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || activeIndex < 0) return;
    const navW    = nav.getBoundingClientRect().width;
    const padding = 4;
    const n       = navItems.length;
    const itemW   = (navW - padding * 2) / n;
    const bubbleW = itemW - 4;
    const bubbleLeft = padding + activeIndex * itemW + 2;
    setBubble({ left: bubbleLeft, width: bubbleW });
    setReady(true);
  }, [activeIndex, navItems.length]);

  useEffect(() => {
    getMyProfile().then(data => {
      const u = data?.user;
      if (!u) return;
      setProfileData(u);
      setUserName(u.fullName || u.email || '');
      if (u.profileImageUrl) setProfileImage(u.profileImageUrl);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await signOut();
    window.location.href = '/login';
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('התמונה גדולה מדי (מקסימום 5MB)'); return; }
    setProfileImage(URL.createObjectURL(file));
    setUploadingImg(true);
    setMenuOpen(false);
    try {
      const r = await uploadProfileImage(file);
      setProfileImage(r.imageUrl);
    } catch {
      alert('שגיאה בהעלאת התמונה');
      setProfileImage(profileData?.profileImageUrl || null);
    } finally {
      setUploadingImg(false);
    }
    e.target.value = '';
  };

  const menuItems = [
    { icon: '✏️', label: 'עריכת פרטים אישיים',  action: () => { setMenuOpen(false); setShowEdit(true); } },
    { icon: '📷', label: uploadingImg ? 'מעלה תמונה...' : 'העלאת תמונת פרופיל', action: () => { setMenuOpen(false); imgInputRef.current?.click(); } },
    { icon: '🔑', label: 'החלפת סיסמא',          action: () => { setMenuOpen(false); setShowChangePass(true); } },
    { icon: '🚪', label: 'התנתקות',               action: handleLogout, danger: true },
  ];

  const initial = (userName || '?').charAt(0).toUpperCase();

  return (
    <>
      <div style={styles.header}>
        <img src={getHeaderLogo(isAdmin, planKey)} alt="joBoss" style={styles.logo} />

        <div ref={menuRef} style={styles.avatarWrap}>
          <button style={styles.avatarBtn} onClick={() => setMenuOpen(v => !v)}>
            {profileImage ? (
              <img src={profileImage} alt="avatar" style={styles.avatarImg} />
            ) : (
              <img src="/icons/panel_icons/male_profile.png" alt="avatar" style={styles.avatarImg} />
            )}
            {uploadingImg && <div style={styles.avatarSpinner} />}
          </button>

          {menuOpen && (
            <div style={styles.dropdown}>
              <div style={styles.dropdownHeader}>
                <p style={styles.dropdownName}>{userName}</p>
              </div>
              {menuItems.map((item, i) => (
                <button key={i}
                  style={{ ...styles.dropdownItem, color: item.danger ? '#F44336' : '#1E2A4A' }}
                  onClick={item.action}>
                  <span style={styles.dropdownIcon}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={handleImageUpload} />

      <nav ref={navRef} style={styles.navbar}>
        {ready && activeIndex >= 0 && (
          <div style={{ ...styles.bubble, left: bubble.left, width: bubble.width }} />
        )}
        {navItems.map((item, i) => {
          const active = location.pathname === item.path;
          return (
            <button key={item.path} ref={el => (itemRefs.current[i] = el)}
              onClick={() => navigate(item.path)}
              style={{ ...styles.navBtn, color: active ? '#6C4FD4' : 'rgba(90,80,120,0.55)', fontWeight: active ? 700 : 500, transform: active ? 'translateY(-1px)' : 'none' }}>
              <img src={item.icon} alt={item.label}
                style={{ ...styles.iconImg, filter: active ? 'none' : 'grayscale(40%) opacity(0.6)' }} />
              <span style={styles.label}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {showEdit && (
        <EditProfileModal
          profile={profileData}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setUserName(updated.fullName);
            setProfileData(prev => ({ ...prev, ...updated }));
          }}
        />
      )}
      {showChangePass && (
        <ChangePasswordModal onClose={() => setShowChangePass(false)} />
      )}
    </>
  );
}

const styles = {
  header: {
    position: 'fixed', top: 0, left: 0, right: 0, height: '56px',
    backgroundImage: 'url(/icons/swipes_icons/top_bar.png)',
    backgroundSize: 'cover', backgroundPosition: 'center bottom',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200,
  },
  logo: { height: '44px', objectFit: 'contain', filter: 'drop-shadow(0 1px 3px rgba(255,255,255,0.4))' },

  avatarWrap: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' },
  avatarBtn: {
    width: '38px', height: '38px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.7)',
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
    cursor: 'pointer', padding: 0, overflow: 'hidden', position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(108,79,212,0.3)',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarSpinner: {
    position: 'absolute', inset: 0, borderRadius: '50%',
    background: 'rgba(0,0,0,0.35)', animation: 'spin 1s linear infinite',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 10px)', left: 0,
    background: 'white', borderRadius: '16px', minWidth: '220px',
    boxShadow: '0 8px 32px rgba(108,79,212,0.18), 0 2px 8px rgba(0,0,0,0.1)',
    border: '1px solid rgba(108,79,212,0.1)', overflow: 'hidden', zIndex: 300,
    animation: 'dropdownIn 0.18s ease',
  },
  dropdownHeader: {
    padding: '14px 16px 10px', borderBottom: '1px solid #F3F4F6',
    background: 'linear-gradient(135deg, rgba(108,79,212,0.06), rgba(30,42,74,0.04))',
  },
  dropdownName: { margin: 0, fontSize: '13px', fontWeight: 600, color: '#1E2A4A' },
  dropdownItem: {
    display: 'flex', alignItems: 'center', gap: '10px',
    width: '100%', padding: '13px 16px', background: 'transparent',
    border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
    textAlign: 'right', transition: 'background 0.15s',
  },
  dropdownIcon: { fontSize: '16px', flexShrink: 0 },

  navbar: {
    position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px',
    background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(18px)',
    borderTop: '1px solid rgba(130,90,255,0.12)',
    boxShadow: '0 -6px 24px rgba(110,80,220,0.09)',
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    zIndex: 100, direction: 'ltr', boxSizing: 'border-box',
    padding: '0 4px', overflow: 'hidden',
  },
  bubble: {
    position: 'absolute', top: '7px', height: '56px', borderRadius: '999px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(232,222,255,0.82))',
    border: '1px solid rgba(132,92,255,0.22)',
    boxShadow: '0 8px 24px rgba(126,87,255,0.16), inset 0 1px 0 rgba(255,255,255,0.85)',
    backdropFilter: 'blur(18px)', pointerEvents: 'none', zIndex: 0,
    transition: 'left 0.32s cubic-bezier(0.4,0,0.2,1), width 0.32s cubic-bezier(0.4,0,0.2,1)',
  },
  navBtn: {
    position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '3px', background: 'transparent', border: 'none',
    cursor: 'pointer', padding: '8px 0', transition: 'color 0.25s ease, transform 0.25s ease',
  },
  iconImg: {
    width: `${ICON_SIZES.navbar}px`, height: `${ICON_SIZES.navbar}px`,
    objectFit: 'contain', transition: 'filter 0.25s ease',
  },
  label: { fontSize: '10px' },
};

export default Navbar;
