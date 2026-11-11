import { useRef, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import { getMyProfile, uploadProfileImage, getMySupportTickets, adminGetSupportUnread } from '../api';
import { EditProfileModal, ChangePasswordModal } from './ProfileModals';
import useTranslation from '../i18n/useTranslation';
import AccessibilityMenu from './AccessibilityMenu';
import AvatarCropper from './AvatarCropper';
import Icon from './Icon';

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
  const { t, toggleLanguage, nextLanguage } = useTranslation();
  const menuRef   = useRef(null);
  const imgInputRef = useRef(null);

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
    { path: '/swipe',        icon: 'jobs', label: t('nav.jobs')         },
    { path: '/applications', icon: 'applications', label: t('nav.applications') },
    { path: '/profile',      icon: 'profile', label: t('nav.profile')      },
    ...(isAdmin ? [{ path: '/admin', icon: 'admin', label: t('nav.admin') }] : []),
  ];

  // /settings and /subscription are sub-screens of Profile, so the Profile tab
  // stays lit there — an exact match would leave no tab active at all.
  const PROFILE_SUB_ROUTES = ['/settings', '/subscription', '/support'];
  const matchesTab = (item) =>
    location.pathname === item.path ||
    (item.path === '/profile' && PROFILE_SUB_ROUTES.includes(location.pathname));

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

  // ── Support ("Contact us") notifications ──────────────────────────────
  // userUnread: team replies the user has not opened yet (menu + avatar dot).
  // adminUnread: new reports waiting for an admin (Admin tab badge + toast).
  const [userUnread, setUserUnread] = useState(0);
  const [adminUnread, setAdminUnread] = useState(0);
  const [adminToast, setAdminToast] = useState(null);
  const prevAdminUnread = useRef(null);

  useEffect(() => {
    let alive = true;
    const poll = () => {
      getMySupportTickets().then(d => { if (alive) setUserUnread(d?.unread || 0); }).catch(() => {});
      if (isAdmin) {
        adminGetSupportUnread().then(d => {
          if (!alive) return;
          const n = d?.unread || 0;
          const prev = prevAdminUnread.current;
          // Pop on first load if anything is waiting, and whenever the count grows.
          if (n > 0 && (prev === null || n > prev)) {
            setAdminToast(n);
            setTimeout(() => alive && setAdminToast(null), 7000);
          }
          prevAdminUnread.current = n;
          setAdminUnread(n);
        }).catch(() => {});
      }
    };
    poll();
    const id = setInterval(poll, 60000);
    window.addEventListener('support-updated', poll);
    return () => { alive = false; clearInterval(id); window.removeEventListener('support-updated', poll); };
  }, [isAdmin]);

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
    { icon: 'edit', label: t('menu.editProfile'), action: () => { setMenuOpen(false); setShowEdit(true); } },
    { icon: 'camera', label: uploadingImg ? t('menu.uploadingPhoto') : t('menu.uploadPhoto'), action: () => { setMenuOpen(false); imgInputRef.current?.click(); } },
    { icon: 'key', label: t('menu.changePassword'), action: () => { setMenuOpen(false); setShowChangePass(true); } },
    { icon: 'settings', label: t('settings.title'), action: () => { setMenuOpen(false); navigate('/settings'); } },
    { icon: 'crown', label: t('profile.subscription'), action: () => { setMenuOpen(false); navigate('/subscription'); } },
    { icon: 'mail', label: t('support.menu'), badge: userUnread, action: () => { setMenuOpen(false); navigate('/support'); } },
    { icon: 'globe', label: `${t('menu.language')} · ${nextLanguage.label}`, action: () => { toggleLanguage(); } },
    { icon: 'logout', label: t('menu.logout'), action: handleLogout, danger: true },
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

      <header className="pro-header">
        <img src={getHeaderLogo(isAdmin, planKey)} alt="joBoss" className="pro-header-logo" />

        <div className="pro-header-actions">
          <AccessibilityMenu />

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="pro-icon-btn" onClick={() => setMenuOpen(v => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t('nav.profile')}>
              <div className="pro-avatar-ring">
                <img src={profileImage || '/icons/panel_icons/male_profile.png'} alt="" />
              </div>
              {userUnread > 0 && <span className="pro-dot" aria-label={t('support.newReply')} />}
              {uploadingImg && <div style={styles.avatarSpinner} />}
            </button>

            {menuOpen && (
              <div className="pro-menu" role="menu">
                <div className="pro-menu-head"><p>{userName}</p></div>
                {menuItems.map((item, i) => (
                  <button key={i} role="menuitem" className={`pro-menu-item${item.danger ? ' danger' : ''}`} onClick={item.action}>
                    <Icon name={item.icon} size={19} />
                    {item.label}
                    {item.badge > 0 && <span className="pro-count">{item.badge}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={handleImageSelected} />

      <nav className="pro-nav">
        {navItems.map((item) => {
          const active = matchesTab(item);
          return (
            <button key={item.path} className={`pro-tab${active ? ' active' : ''}`}
              onClick={() => navigate(item.path)} aria-current={active ? 'page' : undefined}>
              <span className="pro-tab-ico">
                <Icon name={item.icon} size={25} strokeWidth={active ? 2.3 : 1.9}
                  fill={active ? 'rgba(124,92,255,0.16)' : 'none'} />
                {item.path === '/admin' && adminUnread > 0 && <span className="pro-count pro-tab-count">{adminUnread}</span>}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {adminToast && (
        <button type="button" className="pro-toast" onClick={() => { setAdminToast(null); navigate('/admin?tab=support'); }}>
          <Icon name="mail" size={18} />
          {adminToast === 1 ? t('support.adminToast') : `${adminToast} ${t('support.adminToastMany')}`}
        </button>
      )}

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
  avatarSpinner: {
    position: 'absolute', inset: 0, borderRadius: '50%',
    background: 'rgba(0,0,0,0.35)', animation: 'spin 1s linear infinite',
  },
};

export default Navbar;
