import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import ICON_SIZES from '../iconSizes';
import { getMyProfile, uploadProfileImage } from '../api';
import { EditProfileModal, ChangePasswordModal } from './ProfileModals';
import useTranslation from '../i18n/useTranslation';
import AccessibilityMenu from './AccessibilityMenu';
import AvatarCropper from './AvatarCropper';

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
  const { t, language, toggleLanguage, nextLanguage } = useTranslation();
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
  // Staged between picking a file and confirming the crop.
  const [pendingImage,   setPendingImage]   = useState(null);

  const navItems = [
    { path: '/swipe',        icon: '/icons/jobs_icon.png',       label: t('nav.jobs')         },
    { path: '/applications', icon: '/icons/applies_icon.png',    label: t('nav.applications') },
    { path: '/profile',      icon: '/icons/profile_icon.png',    label: t('nav.profile')      },
    ...(isAdmin ? [{ path: '/admin', icon: '/icons/admin_edit_icon.png', label: t('nav.admin') }] : []),
  ];

  // /settings and /subscription are sub-screens of Profile, so the Profile tab
  // stays lit there — an exact match would leave no tab active at all.
  const PROFILE_SUB_ROUTES = ['/settings', '/subscription'];
  const matchesTab = (item) =>
    location.pathname === item.path ||
    (item.path === '/profile' && PROFILE_SUB_ROUTES.includes(location.pathname));
  const activeIndex = navItems.findIndex(matchesTab);

  // Measure the active tab button directly rather than deriving it from the
  // nav width + a hardcoded padding — that derivation silently drifts whenever
  // the navbar's CSS padding changes, and never reflects the real button box.
  const measureBubble = useCallback(() => {
    const nav = navRef.current;
    const el  = itemRefs.current[activeIndex];
    if (!nav || !el || activeIndex < 0) return;
    const navRect = nav.getBoundingClientRect();
    const elRect  = el.getBoundingClientRect();
    if (!elRect.width) return;           // not laid out yet
    const INSET = 2;                      // keeps the bubble just inside the tab
    setBubble({ left: elRect.left - navRect.left + INSET, width: elRect.width - INSET * 2 });
    setReady(true);
  }, [activeIndex]);

  useEffect(() => {
    measureBubble();
    // Re-measure one frame after paint: web fonts and icon images can shift the
    // tab widths after the first layout pass. `language` is a dependency because
    // switching it swaps every tab label.
    const raf = requestAnimationFrame(measureBubble);
    return () => cancelAnimationFrame(raf);
  }, [measureBubble, navItems.length, language]);

  // Keep the bubble locked to the active tab across viewport/orientation changes.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureBubble);
    };

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(nav);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      ro?.disconnect();
    };
  }, [measureBubble]);

  useEffect(() => {
    getMyProfile().then(data => {
      const u = data?.user;
      if (!u) return;
      setProfileData(u);
      setUserName(u.fullName || u.email || '');
      if (u.profileImageUrl) setProfileImage(u.profileImageUrl);
    }).catch(() => {});

    // התעדכנות מיידית כשהפרטים נערכו מכל מקום באפליקציה (Navbar או ProfilePage).
    const onProfileUpdated = (e) => {
      const { fullName, email, profileImageUrl } = e.detail || {};
      if (fullName) setUserName(fullName);
      // profileImageUrl === null means "removed"; undefined means "not in this event".
      if (profileImageUrl !== undefined) setProfileImage(profileImageUrl);
      setProfileData(prev => prev ? { ...prev, ...(fullName && { fullName }), ...(email && { email }), ...(profileImageUrl !== undefined && { profileImageUrl }) } : prev);
    };
    window.addEventListener('profile-updated', onProfileUpdated);
    return () => window.removeEventListener('profile-updated', onProfileUpdated);
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

  // Picking a file only opens the cropper; nothing uploads until it is confirmed.
  const handleImageSelected = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert(t('alert.imageTooLarge')); return; }
    setMenuOpen(false);
    setPendingImage(file);
  };

  const handleImageUpload = async (file) => {
    if (!file) return;
    setPendingImage(null);
    setProfileImage(URL.createObjectURL(file));
    setUploadingImg(true);
    try {
      const r = await uploadProfileImage(file);
      setProfileImage(r.imageUrl);
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: { profileImageUrl: r.imageUrl } }));
    } catch {
      alert(t('alert.imageUploadError'));
      setProfileImage(profileData?.profileImageUrl || null);
    } finally {
      setUploadingImg(false);
    }
  };

  const menuItems = [
    { icon: '✏️', label: t('menu.editProfile'), action: () => { setMenuOpen(false); setShowEdit(true); } },
    { icon: '📷', label: uploadingImg ? t('menu.uploadingPhoto') : t('menu.uploadPhoto'), action: () => { setMenuOpen(false); imgInputRef.current?.click(); } },
    { icon: '🔑', label: t('menu.changePassword'), action: () => { setMenuOpen(false); setShowChangePass(true); } },
    { icon: '⚙️', label: t('settings.title'), action: () => { setMenuOpen(false); navigate('/settings'); } },
    { icon: '👑', label: t('profile.subscription'), action: () => { setMenuOpen(false); navigate('/subscription'); } },
    { icon: nextLanguage.flag, label: `${t('menu.language')} · ${nextLanguage.label}`, action: () => { toggleLanguage(); } },
    { icon: '🚪', label: t('menu.logout'), action: handleLogout, danger: true },
  ];

  return (
    <>
      {pendingImage && (
        <AvatarCropper
          file={pendingImage}
          onCancel={() => setPendingImage(null)}
          onConfirm={handleImageUpload}
        />
      )}

      <div style={styles.header}>
        <img src={getHeaderLogo(isAdmin, planKey)} alt="joBoss" style={styles.logo} />

        {/* Opposite the avatar, so neither crowds the logo. */}
        <AccessibilityMenu />

        <div ref={menuRef} style={styles.avatarWrap}>
          <button style={styles.avatarBtn} onClick={() => setMenuOpen(v => !v)}>
            <div style={styles.avatarRing}>
              {profileImage ? (
                <img src={profileImage} alt="avatar" style={styles.avatarImg} />
              ) : (
                <img src="/icons/panel_icons/male_profile.png" alt="avatar" style={styles.avatarImg} />
              )}
            </div>
            {uploadingImg && <div style={styles.avatarSpinner} />}
          </button>

          {menuOpen && (
            <div style={styles.dropdown}>
              <div style={styles.dropdownHeader}>
                <p style={styles.dropdownName}>{userName}</p>
              </div>
              {menuItems.map((item, i) => (
                <button key={i}
                  style={{ ...styles.dropdownItem, color: item.danger ? '#FF4D67' : '#1E2A4A' }}
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
        onChange={handleImageSelected} />

      <nav ref={navRef} style={styles.navbar}>
        {ready && activeIndex >= 0 && (
          <div style={{ ...styles.bubble, left: bubble.left, width: bubble.width }} />
        )}
        {navItems.map((item, i) => {
          const active = matchesTab(item);
          return (
            <button key={item.path} ref={el => (itemRefs.current[i] = el)}
              onClick={() => navigate(item.path)}
              style={{ ...styles.navBtn, color: active ? 'white' : 'rgba(90,80,120,0.55)', fontWeight: active ? 700 : 500 }}>
              <img src={item.icon} alt={item.label}
                style={{ ...styles.iconImg, filter: active ? 'brightness(0) invert(1)' : 'grayscale(40%) opacity(0.6)' }} />
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
    position: 'fixed', top: 0, left: 0, right: 0,
    height: 'calc(58px + env(safe-area-inset-top, 0px))',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(124,92,255,0.14)',
    borderRadius: '0 0 20px 20px',
    boxShadow: '0 6px 24px rgba(108,79,212,0.12)',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200,
  },
  logo: { height: '38px', objectFit: 'contain' },

  avatarWrap: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' },
  avatarBtn: {
    width: '40px', height: '40px', border: 'none', background: 'none',
    cursor: 'pointer', padding: 0, position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  avatarRing: {
    width: '100%', height: '100%', borderRadius: '50%', padding: '2.5px',
    background: 'linear-gradient(135deg, #7C5CFF, #FF5E8A)',
    boxShadow: '0 4px 12px rgba(108,79,212,0.35)', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', background: 'white' },
  avatarSpinner: {
    position: 'absolute', inset: 0, borderRadius: '50%',
    background: 'rgba(0,0,0,0.35)', animation: 'spin 1s linear infinite',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 10px)', left: 0,
    background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)',
    borderRadius: '18px', minWidth: '220px',
    boxShadow: '0 18px 50px rgba(70,45,160,0.25)',
    border: '1px solid rgba(124,92,255,0.12)', overflow: 'hidden', zIndex: 300,
    animation: 'dropdownIn 0.18s ease',
  },
  dropdownHeader: {
    padding: '14px 16px 10px', borderBottom: '1px solid #F1EEFC',
    background: 'linear-gradient(135deg, rgba(124,92,255,0.08), rgba(255,94,138,0.05))',
  },
  dropdownName: { margin: 0, fontSize: '13px', fontWeight: 700, color: '#1E2A4A' },
  dropdownItem: {
    display: 'flex', alignItems: 'center', gap: '10px',
    width: '100%', padding: '13px 16px', background: 'transparent',
    border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
    textAlign: 'right', transition: 'background 0.15s',
  },
  dropdownIcon: { fontSize: '16px', flexShrink: 0 },

  // Flush to the bottom edge: floating it left content visible in the gap and
  // around the rounded corners while scrolling. Only the top corners stay round,
  // and the safe-area inset is added to the height so the bar still clears the
  // home indicator on iOS instead of sitting under it.
  navbar: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    height: 'calc(66px + env(safe-area-inset-bottom, 0px))',
    background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)',
    borderTop: '1px solid rgba(124,92,255,0.14)',
    borderRadius: '22px 22px 0 0',
    boxShadow: '0 -8px 28px rgba(90,61,200,0.12)',
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    zIndex: 100, direction: 'ltr', boxSizing: 'border-box',
    // Single shorthand — a separate paddingBottom key would be overwritten by it.
    padding: '0 6px env(safe-area-inset-bottom, 0px)', overflow: 'hidden',
  },
  bubble: {
    position: 'absolute', top: '7px', height: '52px', borderRadius: '999px',
    background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)',
    boxShadow: '0 10px 24px rgba(91,61,245,0.4)',
    pointerEvents: 'none', zIndex: 0,
    transition: 'left 0.32s cubic-bezier(0.4,0,0.2,1), width 0.32s cubic-bezier(0.4,0,0.2,1)',
  },
  navBtn: {
    position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '3px', background: 'transparent', border: 'none',
    cursor: 'pointer', padding: '8px 0', transition: 'color 0.25s ease',
  },
  iconImg: {
    width: `${ICON_SIZES.navbar}px`, height: `${ICON_SIZES.navbar}px`,
    objectFit: 'contain', transition: 'filter 0.25s ease',
  },
  label: { fontSize: '10px' },
};

export default Navbar;
