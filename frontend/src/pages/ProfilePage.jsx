// JoBoss features:
// - F-10: Resume Upload & Management
// - F-11: Profile Image Upload & Removal
// - F-12: Subscription & Stripe Payment
// - F-23: Edit Profile & Change Password
// - F-28: Show All Jobs Toggle
// - F-29: GPS Location Auto-Detection

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ICON_SIZES from '../iconSizes';
import { getCurrentUser } from 'aws-amplify/auth';
import {
  getMyProfile,
  updateMyProfile,
  uploadResume,
  uploadProfileImage,
  removeProfileImage,
  getSubscription,
  getQuotaStatus,
  createCheckoutSession,
  cancelSubscription,
} from '../api';
import SubscriptionPage from './SubscriptionPage';
import LocationInput from '../components/LocationInput';
import { JOB_CATEGORIES } from '../data/jobCategories';
import { EditProfileModal, ChangePasswordModal } from '../components/ProfileModals';
import Icon from '../components/Icon';
import useTranslation from '../i18n/useTranslation';
import AvatarCropper from '../components/AvatarCropper';


// ── Settings list row ────────────────────────────────────────────────────────
// `trailing` decides the affordance: a chevron navigates, a switch flips in
// place. Single switches deliberately stay on the row — burying a setting the
// user flips often behind an extra tap is a regression, whatever the mockup does.
// Mock: the emoji the real rows pass are mapped onto the concept's line icons.
const ROW_ICONS = { '👤': 'profile', '🔑': 'key', '🎯': 'star', '📍': 'pin', '🤖': 'bolt', '📄': 'doc', '🌐': 'globe', '🔒': 'lock', '♿': 'a11y' };

function SettingsRow({ icon, title, subtitle, onClick, trailing, danger }) {
  return (
    <button type="button" onClick={onClick} style={{ ...rowStyles.row, cursor: onClick ? 'pointer' : 'default' }}>
      <span style={rowStyles.icon}><Icon name={ROW_ICONS[icon] || 'settings'} size={19} /></span>
      <span style={rowStyles.text}>
        <span style={{ ...rowStyles.title, color: danger ? '#FF4D67' : '#1E2A4A' }}>{title}</span>
        {subtitle && <span style={rowStyles.sub}>{subtitle}</span>}
      </span>
      {trailing === 'chevron'
        ? <span className="pro-chev" style={rowStyles.chev}><Icon name="chevron" size={18} /></span>
        : trailing}
    </button>
  );
}

function Switch({ on, disabled, onChange, label }) {
  const activate = (e) => { e.stopPropagation(); if (!disabled) onChange(); };
  return (
    <div
      role="switch"
      aria-checked={!!on}
      aria-disabled={disabled || undefined}
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      onClick={activate}
      // Space and Enter are what a real checkbox/switch responds to; without
      // this the control is unreachable for keyboard and switch-device users.
      onKeyDown={e => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); activate(e); }
      }}
      style={{
        width: 48, height: 27, borderRadius: 999, padding: 3, flexShrink: 0,
        background: on ? '#7C5CFF' : '#D9D4E6', opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background .2s',
        display: 'flex', alignItems: 'center', direction: 'ltr',
      }}
    >
      <div style={{
        width: 21, height: 21, borderRadius: '50%', background: 'white',
        boxShadow: '0 1px 4px rgba(30,20,70,0.3)',
        transform: on ? 'translateX(21px)' : 'translateX(0)', transition: 'transform .2s',
      }} />
    </div>
  );
}

const rowStyles = {
  row: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%',
    padding: '13px 16px', background: 'transparent', border: 'none',
    textAlign: 'start', direction: 'inherit', borderBottom: '1px solid #F0EDF6',
  },
  icon: { width: 36, height: 36, borderRadius: '50%', background: '#F4F0FF', color: '#5B3DF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: 600 },
  sub: { fontSize: 12.5, fontWeight: 400, color: '#7A7592' },
  chev: { flexShrink: 0, color: '#B4AFC6', display: 'flex' },
  group: { marginTop: 8 },
  groupTitle: {
    fontSize: 12, fontWeight: 700, color: '#9A95AC',
    margin: '0 4px 8px', letterSpacing: '.6px', textTransform: 'uppercase',
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0 6px',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: '50%', border: 'none',
    background: '#F4F2F9', cursor: 'pointer', fontSize: 18,
    color: '#1E2A4A', lineHeight: 1, flexShrink: 0,
  },
  panelTitle: { fontSize: 19, fontWeight: 800, color: '#1E2A4A', flex: 1, textAlign: 'center' },
};

// ── Main ─────────────────────────────────────────────────────────────────────
function ProfilePage({ initialView = null }) {
  const { t, language, toggleLanguage, nextLanguage } = useTranslation();
  const navigate = useNavigate();
  // Derived from the route, not state: once /subscription became a real route
  // nothing sets this any more, and a setter nobody calls is dead weight.
  const tab = initialView === 'subscription' ? 'subscription' : 'profile';
  const [profileImage, setProfileImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [userName, setUserName] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [autoTailorCV, setAutoTailorCV] = useState(false);
  const [cvFile, setCvFile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(20);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [planKey, setPlanKey] = useState('FREE');
  const [preferredRoles, setPreferredRoles] = useState([]);
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [experienceLevel, setExperienceLevel] = useState('');
  const [availability, setAvailability] = useState('');
  const [showAllJobs, setShowAllJobs] = useState(() => localStorage.getItem('showAllJobs') === 'true');
  // Powers the "Auto Apply Credits" row; failure is non-fatal (row hides).
  const [quota, setQuota] = useState(null);
  // Top-level view comes from the route (/settings, /subscription); the
  // sub-panels below Settings stay local since they are one level deeper.
  const [settingsView, setSettingsView] = useState(initialView === 'subscription' ? null : initialView);
  const [avatarMenuOpen,   setAvatarMenuOpen]   = useState(false);
  const [showEditModal,    setShowEditModal]    = useState(false);
  const [showChangePass,   setShowChangePass]   = useState(false);
  const avatarMenuRef = useRef(null);
  const profileImgInputRef = useRef(null);
  const profileLoaded = useRef(false); // true after first successful load
  const pendingSaveRef = useRef(null); // latest unsaved payload (for unmount flush)

  useEffect(() => {
    getQuotaStatus().then(setQuota).catch(() => {});
  }, []);


  // Handle ?tab=subscription from LimitModal redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'subscription') {
      navigate('/subscription');
    }
  }, []);

  useEffect(() => {
    // Cognito הוא רק fallback — אם הפרופיל מהמאגר כבר סיפק fullName, לא דורסים אותו.
    getCurrentUser().then(async (user) => {
      try {
        const { fetchAuthSession } = await import('aws-amplify/auth');
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.payload;
        setUserName(prev => prev || idToken?.name || idToken?.email || user.username);
      } catch {
        setUserName(prev => prev || user.username);
      }
    });

    Promise.all([getMyProfile(), getSubscription()])
      .then(([profileData, subData]) => {
        const user = profileData.user;

        console.log('LOADED:', user);

        setProfile(user);
        // השם מהמאגר גובר על המייל/שם מהטוקן של Cognito.
        if (user?.fullName?.trim()) setUserName(user.fullName.trim());

        if (user?.preferredLocation) setLocation(user.preferredLocation);
        if (user?.searchRadius) setRadius(Number(user.searchRadius));
        if (user?.autoApply !== undefined) setAutoApply(user.autoApply);
        if (user?.autoTailorCV !== undefined) setAutoTailorCV(user.autoTailorCV);
        if (user?.showAllJobs !== undefined) { setShowAllJobs(user.showAllJobs); localStorage.setItem('showAllJobs', user.showAllJobs); }
        if (user?.profileImageUrl) setProfileImage(user.profileImageUrl);
        if (user?.latitude) localStorage.setItem('jobLatitude', user.latitude);
        if (user?.longitude) localStorage.setItem('jobLongitude', user.longitude);
        if (user?.preferredRoles?.length) setPreferredRoles(user.preferredRoles);

        // Normalize stored values to the exact option strings used by the selects.
        // Any unrecognised value (including garbled bytes from old onboarding) is
        // treated as empty so the select shows the placeholder instead of sending
        // garbage back to the API on the next unrelated save.
        const VALID_EXP   = new Set(['סטודנט', 'Junior', 'Mid', 'Senior', 'Lead']);
        const VALID_AVAIL = new Set(['מיידי', 'תוך חודש', 'סתם מסתכל']);

        const EXP_NORMALIZE = {
          student: 'סטודנט', junior: 'Junior', mid: 'Mid',
          senior: 'Senior', lead: 'Lead', manager: 'Lead',
        };
        const AVAIL_NORMALIZE = {
          'immediately': 'מיידי', 'מיידית': 'מיידי',
          '2 weeks': 'תוך חודש', '1 month': 'תוך חודש', '3 months': 'תוך חודש',
          'freelance': 'סתם מסתכל', 'student': 'סתם מסתכל',
        };

        const rawExp = user?.experienceLevel || '';
        const normExp = EXP_NORMALIZE[rawExp.toLowerCase()] ?? rawExp;
        setExperienceLevel(VALID_EXP.has(normExp) ? normExp : '');

        const rawAvail = user?.availability || '';
        const normAvail = AVAIL_NORMALIZE[rawAvail.toLowerCase()] ?? rawAvail;
        setAvailability(VALID_AVAIL.has(normAvail) ? normAvail : '');

        const plan = subData?.planKey || 'FREE';
        setPlanKey(plan);
        localStorage.setItem('planKey', plan);
        setLoadingProfile(false);
        // Mark as loaded after the state-setter batch has re-rendered, so the
        // save effect skips the initial population render and only fires on
        // genuine user changes.
        setTimeout(() => { profileLoaded.current = true; }, 0);
      })
      .catch(() => {
        setLoadingProfile(false);
        setProfileError(t('profile.loadError'));
      });
  }, []);

  useEffect(() => {
    // Don't save until the profile has been loaded from the API at least once,
    // and skip the very first render after load (profileLoaded just flipped).
    if (!profileLoaded.current) return;

    // Build the payload synchronously and stash it, so a debounced save that is
    // still pending when the user navigates away can be flushed on unmount.
    const lat = localStorage.getItem('jobLatitude');
    const lng = localStorage.getItem('jobLongitude');

    const profileUpdate = {
      autoApply,
      autoTailorCV,
      showAllJobs,
      preferredRoles,
      experienceLevel,
      availability,
    };

    if (location) {
      Object.assign(profileUpdate, {
        preferredLocation: location,
        searchRadius: radius,
      });
    }

    if (lat && lng) {
      Object.assign(profileUpdate, {
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
      });
    }

    pendingSaveRef.current = profileUpdate;

    const t = setTimeout(async () => {
      localStorage.setItem('autoApply', autoApply);
      localStorage.setItem('autoTailorCV', autoTailorCV);
      if (location) {
        localStorage.setItem('jobLocation', location);
        localStorage.setItem('jobRadius', radius);
      }

      const payload = pendingSaveRef.current;
      pendingSaveRef.current = null; // consumed by this debounced save

      console.log('SAVING:', { experienceLevel, availability });
      try {
        await updateMyProfile(payload);
      } catch {
        pendingSaveRef.current = payload; // restore so unmount flush can retry
      }
    }, 1000);

    return () => clearTimeout(t);
  }, [
    location,
    radius,
    autoApply,
    autoTailorCV,
    showAllJobs,
    preferredRoles,
    experienceLevel,
    availability,
  ]);

  // Flush a pending (still-debounced) save when the component unmounts, so
  // leaving the page within the 1s debounce window does not silently drop the
  // user's change. Fire-and-forget — the fetch goes out even as we unmount.
  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        updateMyProfile(pendingSaveRef.current).catch(() => {});
      }
    };
  }, []);

  // התעדכנות מיידית כשהפרטים נערכו מכל מקום באפליקציה (גם מה-Navbar).
  useEffect(() => {
    const onProfileUpdated = (e) => {
      const { fullName, email } = e.detail || {};
      if (fullName) setUserName(fullName);
      setProfile(prev => prev ? { ...prev, ...(fullName && { fullName }), ...(email && { email }) } : prev);
    };
    window.addEventListener('profile-updated', onProfileUpdated);
    return () => window.removeEventListener('profile-updated', onProfileUpdated);
  }, []);

  // Close avatar menu on outside click
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handler = (e) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target)) setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [avatarMenuOpen]);

  const handleAvatarImageSelected = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert(t('alert.imageTooLarge')); return; }
    setAvatarMenuOpen(false);
    setPendingImage(file);
  };

  const handleAvatarImageUpload = async (file) => {
    if (!file) return;
    setPendingImage(null);
    setProfileImage(URL.createObjectURL(file));
    setUploadingImage(true);
    try {
      const r = await uploadProfileImage(file);
      setProfileImage(r.imageUrl);
      // Tell the Navbar (and anyone else) to refresh its avatar live.
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: { profileImageUrl: r.imageUrl } }));
    } catch {
      alert(t('alert.imageUploadError'));
      setProfileImage(profile?.profileImageUrl || null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveProfileImage = async () => {
    setAvatarMenuOpen(false);
    if (!window.confirm(t('profile.confirmRemovePhoto'))) return;
    const previous = profileImage;
    setProfileImage(null);
    try {
      await removeProfileImage();
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: { profileImageUrl: null } }));
    } catch {
      setProfileImage(previous);
      alert(t('profile.removePhotoError'));
    }
  };

  const handleLogout = async () => {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
    window.location.href = '/login';
  };

  const handleCvUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert(t('profile.pdfOnly'));
      return;
    }

    try {
      setCvFile(file);

      const result = await uploadResume(file);

      await updateMyProfile({
        resumeData: {
          resumeId: result.resumeId || `resume_${Date.now()}`,
          resumeUrl: result.resumeUrl,
          fileName: result.fileName || file.name,
          uploadedAt: result.uploadedAt || new Date().toISOString(),
        },
      });

      const updated = await getMyProfile();
      setProfile(updated.user);

      alert(t('profile.resumeUploaded'));
      setCvFile(null);
    } catch {
      alert(t('profile.uploadError'));
    }
  };

  const handleSetActive = async (resumeId) => {
    try {
      await updateMyProfile({ action: 'setActive', resumeId });

      const updated = await getMyProfile();
      setProfile(updated.user);
    } catch {
      alert(t('profile.updateError'));
    }
  };

  const handleDeleteResume = async (resumeId) => {
    if (!confirm(t('profile.confirmDeleteFile'))) return;

    try {
      await updateMyProfile({ action: 'delete', resumeId });

      const updated = await getMyProfile();
      setProfile(updated.user);
    } catch {
      alert(t('profile.deleteError'));
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGpsError(t('profile.noGps'));
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
            { headers: { 'Accept-Language': 'he', 'User-Agent': 'joBoss-app' } }
          );
          const data = await res.json();
          const a = data.address || {};
          const city = a.city || a.town || a.village || a.municipality || a.suburb || '';
          const displayName = city || data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          setLocation(displayName);
          localStorage.setItem('jobLatitude', latitude);
          localStorage.setItem('jobLongitude', longitude);
        } catch {
          setGpsError(t('profile.gpsFailed'));
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(
          err.code === 1
            ? t('profile.gpsDenied')
            : t('profile.gpsNotFound')
        );
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  // Subscription API wrapper for SubscriptionPage
  const subApi = async (method, path, body) => {
    if (method === 'GET' && path === '/subscriptions/me') {
      return getSubscription();
    }

    if (method === 'POST' && path === '/subscriptions/checkout') {
      return createCheckoutSession(body?.plan);
    }

    if (method === 'DELETE' && path === '/subscriptions/me') {
      return cancelSubscription();
    }

    return {};
  };

  if (loadingProfile) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '80vh',
        }}
      >
        <p style={{ color: '#7C5CFF', fontWeight: 600 }}>{t('profile.loading')}</p>
      </div>
    );
  }

  if (profileError) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '80vh',
        }}
      >
        <p style={{ color: '#e53e3e', fontWeight: 600 }}>{profileError}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Profile header card */}
        {/* Identity card: profile screen only — it was stacking above Settings
            and Subscription, duplicating chrome on every visit. */}
        {!settingsView && tab === 'profile' && (
        <div style={styles.hero}>
          {/* Avatar with dropdown */}
          <div ref={avatarMenuRef} style={{ position: 'relative' }}>
            <div style={styles.avatarRing}>
              <button style={styles.avatarBtn} onClick={() => setAvatarMenuOpen(v => !v)}>
                <img
                  src={profileImage || '/icons/panel_icons/male_profile.png'}
                  alt="Profile"
                  style={{ ...styles.avatarImg, opacity: uploadingImage ? 0.5 : 1 }}
                />
                {uploadingImage && <div style={styles.avatarSpinner}>⏳</div>}
              </button>
            </div>
            <div role="button" tabIndex={0}
              aria-label={t('menu.uploadPhoto')}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAvatarMenuOpen(v => !v); } }}
              style={styles.avatarEditBadge} onClick={() => setAvatarMenuOpen(v => !v)}><Icon name="edit" size={16} /></div>
            <span style={styles.planPill}>{t(`profile.plan.${planKey}`)}</span>

            {avatarMenuOpen && (
              <div style={styles.avatarDropdown}>
                <div style={styles.dropdownHeader}>
                  <p style={styles.dropdownName}>{userName}</p>
                </div>
                {[
                  { icon: 'edit', label: t('menu.editProfile'), action: () => { setAvatarMenuOpen(false); setShowEditModal(true); } },
                  { icon: 'camera', label: uploadingImage ? t('menu.uploadingPhoto') : t('menu.uploadPhoto'), action: () => { setAvatarMenuOpen(false); profileImgInputRef.current?.click(); } },
                  ...(profileImage ? [{ icon: 'x', label: t('menu.removePhoto'), action: handleRemoveProfileImage, danger: true }] : []),
                  { icon: 'key', label: t('menu.changePassword'), action: () => { setAvatarMenuOpen(false); setShowChangePass(true); } },
                  { icon: 'logout', label: t('menu.logout'), action: handleLogout, danger: true },
                ].map((item, i) => (
                  <button key={i}
                    style={{ ...styles.dropdownItem, color: item.danger ? '#FF4D67' : '#1E2A4A' }}
                    onClick={item.action}>
                    <Icon name={item.icon} size={18} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hidden file input for profile image */}
          <input ref={profileImgInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={handleAvatarImageSelected} />

          <h2 style={styles.username}>{userName}</h2>
          {profile?.email && <p style={styles.heroEmail}>{profile.email}</p>}
        </div>
        )}

        {/* Profile body (also hosts the settings views) */}
        {tab === 'profile' && (
          <>
            {!settingsView && (
            <div style={styles.panel}>
              {/* Three quick tiles: plan, AI credits, settings. Plan and Settings
                  navigate exactly where the old list rows did. */}
              <div style={styles.tiles}>
                <button type="button" style={styles.tile} onClick={() => navigate('/subscription')}>
                  <span style={{ ...styles.tileIcon, color: '#F5A623' }}><Icon name="crown" size={22} fill="currentColor" strokeWidth={1.4} /></span>
                  <span style={styles.tileValue}>{t(`profile.plan.${planKey}`)}</span>
                  <span style={styles.tileLabel}>{t('profile.plan')}</span>
                </button>
                <div style={styles.tile}>
                  <span style={{ ...styles.tileIcon, color: '#7C5CFF' }}><Icon name="sparkle" size={22} fill="currentColor" strokeWidth={1.4} /></span>
                  <span style={styles.tileValue}>
                    {!quota ? '—' : quota.tailorLimit == null
                      ? t('profile.unlimited')
                      : `${Math.max(0, quota.tailorRemaining ?? 0)} ${t('profile.remaining')}`}
                  </span>
                  <span style={styles.tileLabel}>{t('profile.aiCredits')}</span>
                </div>
                <button type="button" style={styles.tile} onClick={() => navigate('/settings')}>
                  <span style={{ ...styles.tileIcon, color: '#FF5E8A' }}><Icon name="settings" size={22} /></span>
                  <span style={styles.tileValue}>{t('settings.title')}</span>
                  <span style={styles.tileLabel}>{t('settings.sub')}</span>
                </button>
              </div>

              {/* Subscription: one tappable box (title + explanation). */}
              <button type="button" style={styles.subBox} onClick={() => navigate('/subscription')}>
                <span style={styles.subBoxIcon}><Icon name="crown" size={20} fill="currentColor" strokeWidth={1.4} /></span>
                <span style={styles.navRowText}>
                  <span style={styles.navRowTitle}>{t('profile.subscription')}</span>
                  <span style={styles.navRowSub}>{t('profile.subscriptionSub')}</span>
                </span>
                <span style={styles.chevron} aria-hidden="true">›</span>
              </button>
            </div>
            )}

            {/* ── Settings panel header (shared by every settings view) ── */}
            {settingsView && (
              <div style={rowStyles.panelHeader}>
                <button
                  type="button"
                  style={rowStyles.backBtn}
                  aria-label={t('settings.back')}
                  onClick={() => (settingsView === 'root' ? navigate('/profile') : setSettingsView('root'))}
                >
                  {language === 'en' ? '←' : '→'}
                </button>
                <span style={rowStyles.panelTitle}>
                  {settingsView === 'root' ? t('settings.title')
                    : settingsView === 'jobPrefs' ? t('settings.jobPrefs')
                    : t('settings.locationSearch')}
                </span>
                <span style={{ width: 34, flexShrink: 0 }} />
              </div>
            )}

            {/* ── Settings root: categorised list ── */}
            {settingsView === 'root' && (<>
              <div style={rowStyles.group}>
                <p style={rowStyles.groupTitle}>{t('settings.cat.account')}</p>
                <div style={{ ...styles.card, padding: '4px 0', gap: 0 }}>
                  <SettingsRow icon="👤" title={t('settings.personal')} subtitle={t('settings.personalSub')}
                    trailing="chevron" onClick={() => setShowEditModal(true)} />
                  <SettingsRow icon="🔑" title={t('settings.password')} subtitle={t('settings.passwordSub')}
                    trailing="chevron" onClick={() => setShowChangePass(true)} />
                </div>
              </div>

              <div style={rowStyles.group}>
                <p style={rowStyles.groupTitle}>{t('settings.cat.preferences')}</p>
                <div style={{ ...styles.card, padding: '4px 0', gap: 0 }}>
                  <SettingsRow icon="🎯" title={t('settings.jobPrefs')} subtitle={t('settings.jobPrefsSub')}
                    trailing="chevron" onClick={() => setSettingsView('jobPrefs')} />
                  <SettingsRow icon="📍" title={t('settings.locationSearch')} subtitle={t('settings.locationSearchSub')}
                    trailing="chevron" onClick={() => setSettingsView('location')} />
                </div>
              </div>

              <div style={rowStyles.group}>
                <p style={rowStyles.groupTitle}>{t('settings.cat.applications')}</p>
                <div style={{ ...styles.card, padding: '4px 0', gap: 0 }}>
                  <SettingsRow
                    icon="🤖"
                    title={t('profile.autoApply')}
                    subtitle={planKey === 'FREE' ? t('profile.premiumRequired') : (autoApply ? t('profile.autoApplyOn') : t('profile.autoApplyOff'))}
                    trailing={<Switch label={t('profile.autoApply')} on={autoApply && planKey !== 'FREE'} disabled={planKey === 'FREE'} onChange={() => {
                      const next = !autoApply;
                      setAutoApply(next);
                      localStorage.setItem('autoApply', next);
                      updateMyProfile({ autoApply: next }).catch(() => {});
                    }} />}
                    onClick={planKey === 'FREE' ? () => navigate('/subscription') : undefined}
                  />
                  <SettingsRow
                    icon="📄"
                    title={t('profile.autoTailor')}
                    subtitle={planKey === 'FREE' ? t('profile.premiumRequired') : (autoTailorCV ? t('profile.autoTailorOn') : t('profile.autoTailorOff'))}
                    trailing={<Switch label={t('profile.autoTailor')} on={autoTailorCV && planKey !== 'FREE'} disabled={planKey === 'FREE'} onChange={() => {
                      const next = !autoTailorCV;
                      setAutoTailorCV(next);
                      localStorage.setItem('autoTailorCV', next);
                      updateMyProfile({ autoTailorCV: next }).catch(() => {});
                    }} />}
                    onClick={planKey === 'FREE' ? () => navigate('/subscription') : undefined}
                  />
                </div>
              </div>

              <div style={rowStyles.group}>
                <p style={rowStyles.groupTitle}>{t('settings.cat.general')}</p>
                <div style={{ ...styles.card, padding: '4px 0', gap: 0 }}>
                  <SettingsRow
                    icon="🌐"
                    title={t('profile.language')}
                    subtitle={t('profile.languageSub')}
                    trailing={<span style={styles.navRowBadge}>{nextLanguage.flag} {nextLanguage.label}</span>}
                    onClick={toggleLanguage}
                  />
                  <SettingsRow icon="✉️" title={t('support.title')} subtitle={t('support.settingsSub')}
                    trailing="chevron" onClick={() => navigate('/support')} />
                </div>
              </div>

              <div style={rowStyles.group}>
                <p style={rowStyles.groupTitle}>{t('settings.legal')}</p>
                <div style={{ ...styles.card, padding: '4px 0', gap: 0 }}>
                  <SettingsRow icon="📄" title={t('settings.terms')}
                    trailing="chevron" onClick={() => navigate('/legal/terms')} />
                  <SettingsRow icon="🔒" title={t('settings.privacy')}
                    trailing="chevron" onClick={() => navigate('/legal/privacy')} />
                  <SettingsRow icon="♿" title={t('settings.accessibility')}
                    trailing="chevron" onClick={() => navigate('/legal/accessibility')} />
                </div>
              </div>
            </>)}

            {settingsView === 'location' && (<>
            {/* Location */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}><img src="/icons/location_icon.png" alt="" style={{ width: `${ICON_SIZES.profileCardTitle}px`, height: `${ICON_SIZES.profileCardTitle}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />{t('profile.section.locationPrefs')}</h3>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={styles.settingLabel}>{t('profile.preferredLocation')}</p>
                <LocationInput
                  value={location}
                  onChange={setLocation}
                  onCoordinates={(lat, lng) => {
                    localStorage.setItem('jobLatitude', lat);
                    localStorage.setItem('jobLongitude', lng);
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '2px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: '#eee' }} />
                  <span style={{ fontSize: '12px', color: '#bbb' }}>{t('common.or')}</span>
                  <div style={{ flex: 1, height: '1px', background: '#eee' }} />
                </div>

                <button
                  onClick={handleUseCurrentLocation}
                  disabled={gpsLoading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '8px', width: '100%', padding: '12px', borderRadius: '999px',
                    border: '1.5px solid #7C5CFF',
                    background: gpsLoading ? '#F1ECFF' : 'white',
                    color: '#7C5CFF', fontSize: '14px', fontWeight: 700,
                    cursor: gpsLoading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  {gpsLoading ? t('profile.locating') : (
                    <>
                      {t('profile.useCurrentLocation')}
                      <img src="/icons/location_icon.png" alt="" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                    </>
                  )}
                </button>

                {gpsError && (
                  <p style={{ fontSize: '12px', color: '#FF4D67', margin: 0 }}>{gpsError}</p>
                )}
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={styles.settingLabel}>{t('profile.radius')}</p>
                  <span style={styles.radiusBadge}>{radius} {t('common.km')}</span>
                </div>

                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  style={styles.slider}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={styles.sliderLabel}>5 {t('common.km')}</span>
                  <span style={styles.sliderLabel}>100 {t('common.km')}</span>
                </div>
              </div>
            </div>
            </>)}

            {!settingsView && (<>
            {/* Resumes */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}><img src="/icons/cv_icon.png" alt="" style={{ width: `${ICON_SIZES.profileCardTitle}px`, height: `${ICON_SIZES.profileCardTitle}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />{t('profile.section.resumes')}</h3>
              <p style={styles.settingDesc}>{t('profile.resumeLimitNote')}</p>

              {planKey === 'FREE' && (
                <div style={styles.aiLockBanner}>
                  {t('profile.aiPremiumOnly')}
                  <button style={styles.aiUpgradeBtn} onClick={() => navigate('/subscription')}>
                    שדרג
                  </button>
                </div>
              )}

              {profile?.resumes?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  {profile.resumes.map((resume) => (
                    <div
                      key={resume.resumeId}
                      style={{
                        padding: '12px',
                        background: resume.isActive ? '#F1ECFF' : '#F5F3FC',
                        borderRadius: '16px',
                        border: resume.isActive ? '2px solid #7C5CFF' : '1px solid #E7E3F0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: resume.isActive ? 700 : 600,
                            color: resume.isActive ? '#7C5CFF' : '#333',
                          }}
                        >
                          {resume.isActive && '⭐ '}
                          {resume.fileName}
                        </div>

                        <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                          {new Date(resume.uploadedAt).toLocaleDateString('he-IL')}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        {!resume.isActive && (
                          <button
                            style={{
                              padding: '6px 12px',
                              background: 'linear-gradient(90deg, #5B3DF5 0%, #7C5CFF 48%, #FF5E8A 118%)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '999px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                            onClick={() => handleSetActive(resume.resumeId)}
                          >
                            {t('profile.setActive')}
                          </button>
                        )}

                        {/* View: opens the stored file itself in a new tab. The server returns a
                            short-lived link per CV (viewUrl); older responses only carry one for
                            the active CV, so fall back to that. Hidden when there is no link. */}
                        {(() => {
                          const viewUrl = resume.viewUrl || (resume.isActive ? profile?.resumePresignedUrl : '');
                          return viewUrl ? (
                            <a
                              href={viewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${t('profile.viewResume')}: ${resume.fileName}`}
                              title={t('profile.viewResume')}
                              style={{
                                padding: '6px 12px', background: '#fff', color: '#5B3DF5', border: '1px solid #5B3DF5',
                                borderRadius: '999px', fontSize: '12px', fontWeight: 700, textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                              }}
                            >
                              <Icon name="eye" size={15} />{t('profile.viewResume')}
                            </a>
                          ) : null;
                        })()}

                        <button
                          style={{
                            padding: '6px 12px',
                            background: 'transparent',
                            color: '#FF4D67',
                            border: '1px solid #FF4D67',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                          onClick={() => handleDeleteResume(resume.resumeId)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(!profile?.resumes || profile.resumes.length < 3) && (
                <label style={styles.uploadBtn}>
                  {cvFile ? `${cvFile.name} ✅` : t('profile.uploadResume')}
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleCvUpload} />
                </label>
              )}
            </div>
            </>)}

            {settingsView === 'jobPrefs' && (<>
            {/* Experience & availability */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}><img src="/icons/search_icon.png" alt="" style={{ width: `${ICON_SIZES.profileCardTitle}px`, height: `${ICON_SIZES.profileCardTitle}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />{t('profile.section.searchPrefs')}</h3>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={styles.settingLabel}>{t('profile.expLevel')}</p>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  style={{ ...styles.input, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="">{t('profile.expPlaceholder')}</option>
                  <option value="סטודנט">{t('profile.exp.student')}</option>
                  <option value="Junior">{t('profile.exp.junior')}</option>
                  <option value="Mid">{t('profile.exp.mid')}</option>
                  <option value="Senior">{t('profile.exp.senior')}</option>
                  <option value="Lead">{t('profile.exp.lead')}</option>
                </select>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={styles.settingLabel}>{t('profile.availability')}</p>
                <select
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  style={{ ...styles.input, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="">{t('profile.availPlaceholder')}</option>
                  <option value="מיידי">{t('profile.avail.immediate')}</option>
                  <option value="תוך חודש">{t('profile.avail.month')}</option>
                  <option value="סתם מסתכל">{t('profile.avail.browsing')}</option>
                </select>
              </div>

              <div style={{ ...styles.settingRow, marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F0F0F0' }}>
                <div style={{ flex: 1 }}>
                  <p style={styles.settingLabel}>{t('profile.showAllJobs')}</p>
                  <p style={styles.settingDesc}>
                    {showAllJobs
                      ? t('profile.showAllOn')
                      : t('profile.showAllOff')}
                  </p>
                  <p style={{ fontSize: '11px', color: '#888', margin: '3px 0 0 0', lineHeight: 1.4 }}>
                    {showAllJobs
                      ? t('profile.showAllWarn')
                      : t('profile.showAllHint')}
                  </p>
                </div>
                <div
                  style={{ ...styles.toggle, background: showAllJobs ? '#7C5CFF' : '#ccc', flexShrink: 0 }}
                  onClick={() => {
                    const next = !showAllJobs;
                    setShowAllJobs(next);
                    localStorage.setItem('showAllJobs', next);
                    if (!next) localStorage.removeItem('discoveryUntil');
                  }}
                >
                  <div style={{ ...styles.toggleCircle, transform: showAllJobs ? 'translateX(24px)' : 'translateX(0)' }} />
                </div>
              </div>
            </div>

            {/* Preferred roles */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}><img src="/icons/jobs_icon.png" alt="" style={{ width: `${ICON_SIZES.profileCardTitle}px`, height: `${ICON_SIZES.profileCardTitle}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />{t('profile.section.preferredRoles')}</h3>

              {preferredRoles.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                  {preferredRoles.map((role) => (
                    <span
                      key={role}
                      onClick={() => setPreferredRoles((prev) => prev.filter((r) => r !== role))}
                      style={{
                        padding: '6px 14px',
                        background: '#7C5CFF',
                        color: 'white',
                        borderRadius: 20,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {role} ×
                    </span>
                  ))}
                </div>
              ) : (
                <p style={styles.settingDesc}>{t('profile.noRoles')}</p>
              )}

              {showRoleEditor && (
                <div style={{ width: '100%', maxHeight: 280, overflowY: 'auto', marginTop: 8 }}>
                  {JOB_CATEGORIES.map((cat) => (
                    <div key={cat.group} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#777', marginBottom: 6 }}>
                        {cat.icon} {cat.group}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {cat.roles.map((r) => (
                          <button
                            key={r}
                            onClick={() =>
                              setPreferredRoles((prev) =>
                                prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
                              )
                            }
                            style={{
                              padding: '4px 12px',
                              borderRadius: 20,
                              fontSize: 12,
                              cursor: 'pointer',
                              border: `1px solid ${preferredRoles.includes(r) ? '#7C5CFF' : '#ddd'}`,
                              background: preferredRoles.includes(r) ? '#7C5CFF' : 'white',
                              color: preferredRoles.includes(r) ? 'white' : '#555',
                            }}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowRoleEditor(!showRoleEditor)}
                style={{
                  padding: '8px 16px',
                  background: '#F1ECFF',
                  color: '#7C5CFF',
                  border: 'none',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  alignSelf: 'flex-start',
                }}
              >
                {showRoleEditor ? t('profile.closeRoleEditor') : t('profile.editRoles')}
              </button>
            </div>
            </>)}

            {settingsView === 'root' && (
            <button style={styles.logoutBtn} onClick={handleLogout}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}><Icon name="logout" size={19} />{t('menu.logout')}</span>
            </button>
            )}
          </>
        )}

        {/* Subscription — its own screen, with the shared back header */}
        {tab === 'subscription' && (<>
          <div style={rowStyles.panelHeader}>
            <button
              type="button"
              style={rowStyles.backBtn}
              aria-label={t('settings.back')}
              onClick={() => navigate('/profile')}
            >
              {language === 'en' ? '←' : '→'}
            </button>
            <span style={rowStyles.panelTitle}>{t('profile.subscription')}</span>
            <span style={{ width: 34, flexShrink: 0 }} />
          </div>
          <SubscriptionPage api={subApi} />
        </>)}
      </div>

      {pendingImage && (
        <AvatarCropper
          file={pendingImage}
          onCancel={() => setPendingImage(null)}
          onConfirm={handleAvatarImageUpload}
        />
      )}

      {showEditModal && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setUserName(updated.fullName);
            setProfile(prev => ({ ...prev, ...updated }));
          }}
        />
      )}
      {showChangePass && (
        <ChangePasswordModal onClose={() => setShowChangePass(false)} />
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'transparent',
    display: 'flex',
    justifyContent: 'center',
  },
  content: {
    padding: '8px 16px 24px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  card: {
    background: '#fff',
    border: '1px solid #E7E3F0',
    borderRadius: '18px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    overflow: 'hidden',
  },
  avatarBtn: {
    width: '100%', height: '100%', borderRadius: '50%', padding: 0,
    border: '3px solid #fff', cursor: 'pointer',
    overflow: 'hidden', position: 'relative', background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarEditBadge: {
    position: 'absolute', top: '2px', insetInlineEnd: '-4px',
    width: '32px', height: '32px', borderRadius: '50%',
    background: '#fff', color: '#4A4560',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: '0 3px 10px rgba(30,20,70,0.22)',
  },
  avatarSpinner: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(0,0,0,0.35)', fontSize: '20px',
  },
  avatarDropdown: {
    position: 'absolute', top: 'calc(100% + 26px)', left: '50%',
    transform: 'translateX(-50%)',
    background: '#fff', borderRadius: '16px', minWidth: '232px',
    boxShadow: '0 14px 36px rgba(30,20,70,0.16)',
    border: '1px solid #E7E3F0', overflow: 'hidden', zIndex: 300,
    animation: 'dropdownIn 0.18s ease',
  },
  dropdownHeader: {
    padding: '14px 16px 12px', borderBottom: '1px solid #E7E3F0',
  },
  dropdownName: { margin: 0, fontSize: '13px', fontWeight: 700, color: '#1E2A4A' },
  dropdownItem: {
    display: 'flex', alignItems: 'center', gap: '12px',
    width: '100%', padding: '12px 16px', background: 'transparent',
    border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
    textAlign: 'start', transition: 'background 0.15s',
  },
  username: {
    fontSize: '20px',
    fontWeight: 800,
    margin: '16px 0 0',
    color: '#1E2A4A',
    letterSpacing: '-0.3px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 700,
    margin: 0,
    alignSelf: 'flex-start',
  },
  settingRow: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
  },
  settingLabel: {
    fontSize: '15px',
    fontWeight: 600,
    margin: 0,
  },
  settingDesc: {
    fontSize: '13px',
    color: '#6F6A84',
    margin: '4px 0 0 0',
  },
  toggle: {
    width: '52px',
    height: '28px',
    borderRadius: '14px',
    padding: '2px',
    cursor: 'pointer',
    transition: 'background 0.3s',
    flexShrink: 0,
    position: 'relative',
  },
  toggleCircle: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'white',
    transition: 'transform 0.3s',
    position: 'absolute',
    top: '2px',
    left: '2px',
  },
  slider: {
    width: '100%',
    accentColor: '#7C5CFF',
    cursor: 'pointer',
  },
  sliderLabel: {
    fontSize: '12px',
    color: '#8F8AA3',
  },
  radiusBadge: {
    background: '#F1ECFF',
    color: '#7C5CFF',
    padding: '4px 12px',
    borderRadius: '999px',
    fontSize: '14px',
    fontWeight: 700,
  },
  input: {
    width: '100%',
    padding: '13px 16px',
    borderRadius: '14px',
    border: '1.5px solid #E0DCEA',
    background: '#fff',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  suggestionsBox: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#fff',
    backdropFilter: 'blur(20px)',
    borderRadius: '16px',
    boxShadow: '0 1px 3px rgba(30,20,70,0.06)',
    zIndex: 100,
    overflow: 'hidden',
    marginTop: '4px',
  },
  suggestionItem: {
    padding: '12px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    borderBottom: '1px solid #F0EDF6',
  },
  uploadBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '999px',
    border: '1.5px dashed #7C5CFF',
    color: '#5B3DF5',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    textAlign: 'center',
    background: '#F7F4FF',
  },
  aiLockBanner: {
    width: '100%',
    background: '#FFF4EC',
    border: '1px solid #F5A623',
    borderRadius: '16px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#C2410C',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 600,
  },
  aiUpgradeBtn: {
    background: '#F5A623',
    color: 'white',
    border: 'none',
    borderRadius: '999px',
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },
  /* ── Account information rows ──────────────────────────────────────── */
  infoList: { width: '100%', display: 'flex', flexDirection: 'column' },
  infoRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '12px', padding: '11px 0', borderBottom: '1px solid #F0EDF6',
  },
  infoIcon: { width: '17px', height: '17px', objectFit: 'contain', flexShrink: 0 },
  infoLabel: {
    display: 'flex', alignItems: 'center', gap: '9px',
    fontSize: '13.5px', fontWeight: 600, color: '#7A7592', minWidth: 0,
  },
  infoValue: {
    fontSize: '13.5px', fontWeight: 700, color: '#1E2A4A',
    textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },

  /* ── Navigational list rows ────────────────────────────────────────── */
  navRow: {
    display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
    padding: '13px 18px', background: 'transparent', border: 'none',
    cursor: 'pointer', textAlign: 'start', direction: 'inherit',
  },
  navRowIcon: { width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 },
  navRowText: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 },
  navRowTitle: { fontSize: '14px', fontWeight: 700, color: '#1E2A4A' },
  navRowSub: { fontSize: '12px', fontWeight: 600, color: '#6F6A84' },
  navRowBadge: {
    flexShrink: 0, fontSize: '12.5px', fontWeight: 700, color: '#5B3DF5',
    background: '#F4F0FF', borderRadius: '999px', padding: '5px 12px',
  },
  // No transform: U+203A is bidi-mirrored, so it flips with the text direction on its own.
  chevron: { flexShrink: 0, fontSize: '22px', color: '#8F8AA3', lineHeight: 1 },

  hero: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0 6px' },
  avatarRing: {
    width: '112px', height: '112px', borderRadius: '50%', padding: '4px',
    background: 'linear-gradient(135deg, #5B3DF5 0%, #7C5CFF 45%, #FF5E8A 100%)',
  },
  planPill: {
    position: 'absolute', bottom: '-11px', left: '50%', transform: 'translateX(-50%)',
    minWidth: '96px', padding: '4px 14px', borderRadius: '999px', textAlign: 'center',
    background: 'linear-gradient(90deg, #5B3DF5 0%, #7C5CFF 48%, #FF5E8A 118%)',
    color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '.5px', whiteSpace: 'nowrap',
    textTransform: 'uppercase', boxShadow: '0 4px 12px rgba(91,61,245,0.3)',
  },
  heroEmail: { margin: '2px 0 0', fontSize: '12.5px', color: '#7A7592', direction: 'ltr' },
  panel: {
    background: 'transparent', margin: '6px 0 0', padding: '16px 0 20px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', width: '100%' },
  tile: {
    background: 'rgba(255,255,255,0.7)', border: '1.5px solid #DDD3F7', borderRadius: '18px', padding: '16px 6px 14px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    cursor: 'pointer', minWidth: 0, boxShadow: '0 1px 3px rgba(30,20,70,0.06)',
  },
  tileIcon: { display: 'flex', marginBottom: '2px' },
  tileValue: { fontSize: '13.5px', fontWeight: 700, color: '#1E2A4A', textAlign: 'center', lineHeight: 1.2 },
  tileLabel: {
    fontSize: '10.5px', fontWeight: 600, color: '#7A7592', textAlign: 'center', lineHeight: 1.25,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  subBox: {
    display: 'flex', alignItems: 'center', gap: '12px', width: '100%', marginTop: '14px',
    padding: '14px 16px', background: 'rgba(255,255,255,0.7)', border: '1.5px solid #DDD3F7', borderRadius: '18px',
    boxShadow: 'none', cursor: 'pointer', textAlign: 'start', direction: 'inherit',
  },
  subBoxIcon: {
    width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0, color: '#F5A623',
    background: '#FFF6E5', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  upsellTitle: { margin: '22px 0 0', fontSize: '17px', fontWeight: 800, color: '#1E2A4A' },
  upsellSub: { margin: '4px 0 14px', fontSize: '14px', color: '#5F5A72', textAlign: 'center' },
  upsellBtn: { padding: '12px 40px', fontSize: '15px', minWidth: '238px' },
  logoutBtn: {
    width: '100%',
    padding: '15px',
    borderRadius: '999px',
    background: 'white',
    color: '#1E2A4A',
    border: '1.5px solid #CFCADD',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '10px',
  },
};

export default ProfilePage;