import React, { useState, useEffect, useRef } from 'react';
import ICON_SIZES from '../iconSizes';
import { getCurrentUser } from 'aws-amplify/auth';
import {
  getMyProfile,
  updateMyProfile,
  uploadResume,
  uploadProfileImage,
  getSubscription,
  createCheckoutSession,
  cancelSubscription,
} from '../api';
import SubscriptionPage from './SubscriptionPage';
import LocationInput from '../components/LocationInput';
import { JOB_CATEGORIES } from '../data/jobCategories';

// ── Subscription badge for profile header ────────────────────────────────────
function PlanBadge({ planKey }) {
  const logoMap = {
    FREE: '/icons/free_members_icon.png',
    PREMIUM: '/icons/premium_member_icon.png',
    PREMIUM_PLUS: '/icons/plus_members_icon.png',
  };

  const logo = logoMap[planKey] || logoMap.FREE;

  return <img src={logo} alt={planKey} style={{ height: `${ICON_SIZES.planBadge}px`, objectFit: 'contain' }} />;
}

// ── Main ─────────────────────────────────────────────────────────────────────
function ProfilePage() {
  const [tab, setTab] = useState('profile'); // 'profile' | 'subscription'
  const [profileImage, setProfileImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
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
  const [planKey, setPlanKey] = useState('FREE');
  const [preferredRoles, setPreferredRoles] = useState([]);
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [experienceLevel, setExperienceLevel] = useState('');
  const [availability, setAvailability] = useState('');
  const [showAllJobs, setShowAllJobs] = useState(() => localStorage.getItem('showAllJobs') === 'true');
  const profileLoaded = useRef(false); // true after first successful load
  const pendingSaveRef = useRef(null); // latest unsaved payload (for unmount flush)

  // Handle ?tab=subscription from LimitModal redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'subscription') {
      setTab('subscription');
    }
  }, []);

  useEffect(() => {
    getCurrentUser().then(async (user) => {
      try {
        const { fetchAuthSession } = await import('aws-amplify/auth');
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.payload;
        setUserName(idToken?.name || idToken?.email || user.username);
      } catch {
        setUserName(user.username);
      }
    });

    Promise.all([getMyProfile(), getSubscription()])
      .then(([profileData, subData]) => {
        const user = profileData.user;

        console.log('LOADED:', user);

        setProfile(user);

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
      .catch(() => setLoadingProfile(false));
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

  const handleCvUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('יש להעלות קובץ PDF בלבד');
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

      alert('✅ קורות החיים הועלו בהצלחה!');
      setCvFile(null);
    } catch {
      alert('❌ שגיאה בהעלאה');
    }
  };

  const handleSetActive = async (resumeId) => {
    try {
      await updateMyProfile({ action: 'setActive', resumeId });

      const updated = await getMyProfile();
      setProfile(updated.user);
    } catch {
      alert('❌ שגיאה בעדכון');
    }
  };

  const handleDeleteResume = async (resumeId) => {
    if (!confirm('למחוק את הקובץ?')) return;

    try {
      await updateMyProfile({ action: 'delete', resumeId });

      const updated = await getMyProfile();
      setProfile(updated.user);
    } catch {
      alert('❌ שגיאה במחיקה');
    }
  };

  const handleLogout = async () => {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
    window.location.href = '/login';
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('הדפדפן לא תומך ב-GPS');
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
          setGpsError('לא הצלחנו לזהות את המיקום');
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(
          err.code === 1
            ? 'נדחתה הגישה למיקום — אשר הרשאה בהגדרות הדפדפן'
            : 'לא הצלחנו לאתר את המיקום'
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
        <p style={{ color: '#6C4FD4', fontWeight: 600 }}>טוען פרופיל...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Profile header card */}
        <div style={styles.card}>
          <div style={{ position: 'relative' }}>
            {profileImage ? (
              <img
                src={profileImage}
                alt="Profile"
                style={{ ...styles.avatar, opacity: uploadingImage ? 0.5 : 1 }}
              />
            ) : (
              <div style={styles.avatar}>{userName.charAt(0).toUpperCase()}</div>
            )}

            <label style={styles.cameraIcon}>
              {uploadingImage ? '⏳' : '📷'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files[0];

                  if (!file) return;

                  if (file.size > 5 * 1024 * 1024) {
                    alert('התמונה גדולה מדי (מקסימום 5MB)');
                    return;
                  }

                  setProfileImage(URL.createObjectURL(file));
                  setUploadingImage(true);

                  try {
                    const r = await uploadProfileImage(file);
                    setProfileImage(r.imageUrl);
                  } catch {
                    alert('שגיאה בהעלאת התמונה');
                    setProfileImage(null);
                  } finally {
                    setUploadingImage(false);
                  }
                }}
              />
            </label>
          </div>

          <h2 style={styles.username}>{userName}</h2>
          <PlanBadge planKey={planKey} />
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{
              ...styles.tabBtn,
              ...(tab === 'profile' ? styles.tabActive : {}),
            }}
            onClick={() => setTab('profile')}
          >
            <img src="/icons/profile_icon.png" alt="" style={{ width: `${ICON_SIZES.profileTab}px`, height: `${ICON_SIZES.profileTab}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '4px' }} />פרופיל
          </button>

          <button
            style={{
              ...styles.tabBtn,
              ...(tab === 'subscription' ? styles.tabActive : {}),
            }}
            onClick={() => setTab('subscription')}
          >
            <img src="/icons/premium_icon.png" alt="" style={{ width: `${ICON_SIZES.profileTab}px`, height: `${ICON_SIZES.profileTab}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '4px' }} />מנוי
          </button>
        </div>

        {/* Profile tab */}
        {tab === 'profile' && (
          <>
            {/* Location */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}><img src="/icons/location_icon.png" alt="" style={{ width: `${ICON_SIZES.profileCardTitle}px`, height: `${ICON_SIZES.profileCardTitle}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />העדפות מיקום</h3>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={styles.settingLabel}>מיקום מועדף</p>
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
                  <span style={{ fontSize: '12px', color: '#bbb' }}>או</span>
                  <div style={{ flex: 1, height: '1px', background: '#eee' }} />
                </div>

                <button
                  onClick={handleUseCurrentLocation}
                  disabled={gpsLoading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '8px', width: '100%', padding: '12px', borderRadius: '12px',
                    border: '1.5px solid #6C4FD4',
                    background: gpsLoading ? '#F0F2FF' : 'white',
                    color: '#6C4FD4', fontSize: '14px', fontWeight: 600,
                    cursor: gpsLoading ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  {gpsLoading ? 'מאתר מיקום... ⏳' : 'זהה מיקום נוכחי אוטומטית 🎯'}
                </button>

                {gpsError && (
                  <p style={{ fontSize: '12px', color: '#F44336', margin: 0 }}>{gpsError}</p>
                )}
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={styles.settingLabel}>רדיוס חיפוש</p>
                  <span style={styles.radiusBadge}>{radius} ק"מ</span>
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
                  <span style={styles.sliderLabel}>5 ק"מ</span>
                  <span style={styles.sliderLabel}>100 ק"מ</span>
                </div>
              </div>
            </div>

            {/* Auto apply */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}><img src="/icons/settings_icon.png" alt="" style={{ width: `${ICON_SIZES.profileCardTitle}px`, height: `${ICON_SIZES.profileCardTitle}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />הגדרות הגשה</h3>

              <div style={styles.settingRow}>
                <div>
                  <p style={styles.settingLabel}>הגשה אוטומטית</p>
                  <p style={styles.settingDesc}>
                    {autoApply ? 'CV יישלח אוטומטית לכל משרה' : 'כל הגשה תחכה לאישורך'}
                  </p>

                  {planKey === 'FREE' && (
                    <p style={{ fontSize: '11px', color: '#FF9800', margin: '4px 0 0 0' }}>
                      ⚠️ דורש מנוי פרימיום
                    </p>
                  )}
                </div>

                <div
                  style={{
                    ...styles.toggle,
                    background: autoApply && planKey !== 'FREE' ? '#4CAF50' : '#ccc',
                    opacity: planKey === 'FREE' ? 0.5 : 1,
                  }}
                  onClick={() => {
                    if (planKey !== 'FREE') {
                      const next = !autoApply;
                      setAutoApply(next);
                      localStorage.setItem('autoApply', next);
                      updateMyProfile({ autoApply: next }).catch(() => {});
                    } else {
                      setTab('subscription');
                    }
                  }}
                >
                  <div
                    style={{
                      ...styles.toggleCircle,
                      transform: autoApply && planKey !== 'FREE' ? 'translateX(24px)' : 'translateX(0)',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  ...styles.settingRow,
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid #F0F0F0',
                }}
              >
                <div>
                  <p style={styles.settingLabel}>התאמת קורות חיים אוטומטית</p>
                  <p style={styles.settingDesc}>
                    {autoTailorCV ? 'ה-AI יתאים את קורות החיים לכל משרה שתאשר' : 'התאמה ידנית מעמוד ההגשות'}
                  </p>

                  {planKey === 'FREE' && (
                    <p style={{ fontSize: '11px', color: '#FF9800', margin: '4px 0 0 0' }}>
                      ⚠️ דורש מנוי פרימיום
                    </p>
                  )}
                </div>

                <div
                  style={{
                    ...styles.toggle,
                    background: autoTailorCV && planKey !== 'FREE' ? '#6C4FD4' : '#ccc',
                    opacity: planKey === 'FREE' ? 0.5 : 1,
                  }}
                  onClick={() => {
                    if (planKey !== 'FREE') {
                      const next = !autoTailorCV;
                      setAutoTailorCV(next);
                      localStorage.setItem('autoTailorCV', next);
                      updateMyProfile({ autoTailorCV: next }).catch(() => {});
                    } else {
                      setTab('subscription');
                    }
                  }}
                >
                  <div
                    style={{
                      ...styles.toggleCircle,
                      transform: autoTailorCV && planKey !== 'FREE' ? 'translateX(24px)' : 'translateX(0)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Resumes */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}><img src="/icons/cv_icon.png" alt="" style={{ width: `${ICON_SIZES.profileCardTitle}px`, height: `${ICON_SIZES.profileCardTitle}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />קורות חיים</h3>
              <p style={styles.settingDesc}>העלה עד 3 קבצים — ה-AI יתאים את הפעיל לכל משרה</p>

              {planKey === 'FREE' && (
                <div style={styles.aiLockBanner}>
                  🤖 התאמת AI זמינה רק במנוי פרימיום
                  <button style={styles.aiUpgradeBtn} onClick={() => setTab('subscription')}>
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
                        background: resume.isActive ? '#F0F2FF' : '#F5F5F5',
                        borderRadius: '12px',
                        border: resume.isActive ? '2px solid #6C4FD4' : '1px solid #E0E0E0',
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
                            color: resume.isActive ? '#6C4FD4' : '#333',
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
                              background: '#6C4FD4',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                            onClick={() => handleSetActive(resume.resumeId)}
                          >
                            הפוך לפעיל
                          </button>
                        )}

                        <button
                          style={{
                            padding: '6px 12px',
                            background: 'transparent',
                            color: '#F44336',
                            border: '1px solid #F44336',
                            borderRadius: '8px',
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
                  {cvFile ? `✅ ${cvFile.name}` : '📎 העלה קורות חיים (PDF)'}
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleCvUpload} />
                </label>
              )}
            </div>

            {/* Experience & availability */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}><img src="/icons/search_icon.png" alt="" style={{ width: `${ICON_SIZES.profileCardTitle}px`, height: `${ICON_SIZES.profileCardTitle}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />העדפות חיפוש</h3>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={styles.settingLabel}>רמת ניסיון</p>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  style={{ ...styles.input, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="">בחר רמה...</option>
                  <option value="סטודנט">סטודנט</option>
                  <option value="Junior">ג'וניור (0-2 שנים)</option>
                  <option value="Mid">מיד (2-5 שנים)</option>
                  <option value="Senior">סניור (5+ שנים)</option>
                  <option value="Lead">לידרשיפ / ארכיטקט</option>
                </select>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={styles.settingLabel}>זמינות</p>
                <select
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  style={{ ...styles.input, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="">בחר זמינות...</option>
                  <option value="מיידי">מיידי</option>
                  <option value="תוך חודש">תוך חודש</option>
                  <option value="סתם מסתכל">סתם מסתכל</option>
                </select>
              </div>

              <div style={{ ...styles.settingRow, marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F0F0F0' }}>
                <div style={{ flex: 1 }}>
                  <p style={styles.settingLabel}>הצג את כל המשרות תמיד</p>
                  <p style={styles.settingDesc}>
                    {showAllJobs
                      ? 'מוצגות כל המשרות, כולל מחוץ לתחום שהגדרת'
                      : 'מוצגות קודם משרות מהתחום שלך — שאר המשרות זמינות בלחיצה'}
                  </p>
                  <p style={{ fontSize: '11px', color: '#888', margin: '3px 0 0 0', lineHeight: 1.4 }}>
                    {showAllJobs
                      ? '⚠️ ייתכן שתראה משרות פחות רלוונטיות לפרופיל שלך'
                      : '💡 ניתן להציג משרות נוספות זמנית (30 דקות) מהמסך הראשי'}
                  </p>
                </div>
                <div
                  style={{ ...styles.toggle, background: showAllJobs ? '#6C4FD4' : '#ccc', flexShrink: 0 }}
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
              <h3 style={styles.cardTitle}><img src="/icons/jobs_icon.png" alt="" style={{ width: `${ICON_SIZES.profileCardTitle}px`, height: `${ICON_SIZES.profileCardTitle}px`, objectFit: 'contain', verticalAlign: 'middle', marginLeft: '6px' }} />תפקידים מועדפים</h3>

              {preferredRoles.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                  {preferredRoles.map((role) => (
                    <span
                      key={role}
                      onClick={() => setPreferredRoles((prev) => prev.filter((r) => r !== role))}
                      style={{
                        padding: '6px 14px',
                        background: '#6C4FD4',
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
                <p style={styles.settingDesc}>לא נבחרו תפקידים עדיין</p>
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
                              border: `1px solid ${preferredRoles.includes(r) ? '#6C4FD4' : '#ddd'}`,
                              background: preferredRoles.includes(r) ? '#6C4FD4' : 'white',
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
                  background: '#F0EEFF',
                  color: '#6C4FD4',
                  border: 'none',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  alignSelf: 'flex-start',
                }}
              >
                {showRoleEditor ? '✓ סגור' : '✏️ ערוך תפקידים'}
              </button>
            </div>

            <button style={styles.logoutBtn} onClick={handleLogout}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}><img src="/icons/logout_icon.png" alt="" style={{ width: `${ICON_SIZES.logout}px`, height: `${ICON_SIZES.logout}px`, objectFit: 'contain' }} />התנתק</span>
            </button>
          </>
        )}

        {/* Subscription tab */}
        {tab === 'subscription' && <SubscriptionPage api={subApi} />}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--background)',
    display: 'flex',
    justifyContent: 'center',
  },
  content: {
    padding: '24px',
    maxWidth: '480px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  card: {
    background: 'white',
    borderRadius: '20px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(108,79,212,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '32px',
    fontWeight: 800,
    color: 'white',
    objectFit: 'cover',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: '#6C4FD4',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '14px',
    cursor: 'pointer',
    border: '3px solid white',
  },
  username: {
    fontSize: '20px',
    fontWeight: 700,
    margin: 0,
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    background: 'white',
    padding: '8px',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(108,79,212,0.08)',
  },
  tabBtn: {
    flex: 1,
    padding: '10px',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
    background: 'transparent',
    color: '#777',
  },
  tabActive: {
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
    color: 'white',
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
    color: '#777',
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
    accentColor: '#6C4FD4',
    cursor: 'pointer',
  },
  sliderLabel: {
    fontSize: '12px',
    color: '#999',
  },
  radiusBadge: {
    background: '#F0F2FF',
    color: '#6C4FD4',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: 700,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1.5px solid #eee',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  suggestionsBox: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
    zIndex: 100,
    overflow: 'hidden',
    marginTop: '4px',
  },
  suggestionItem: {
    padding: '12px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    borderBottom: '1px solid #f5f5f5',
  },
  uploadBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: '2px dashed #6C4FD4',
    color: '#6C4FD4',
    fontWeight: 600,
    fontSize: '15px',
    cursor: 'pointer',
    textAlign: 'center',
    background: '#F0F2FF',
  },
  aiLockBanner: {
    width: '100%',
    background: '#FFF3E0',
    border: '1px solid #FF9800',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#E65100',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 600,
  },
  aiUpgradeBtn: {
    background: '#FF9800',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },
  logoutBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    background: 'white',
    color: '#F44336',
    border: '2px solid #F44336',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

export default ProfilePage;