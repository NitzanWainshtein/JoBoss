import React, { useState, useEffect } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { getMyProfile, updateMyProfile, uploadResume, uploadProfileImage, getSubscription, createCheckoutSession, cancelSubscription } from '../api';
import SubscriptionPage from './SubscriptionPage';

// ── Location autocomplete ─────────────────────────────────────────────────────
function LocationInput({ value, onChange }) {
  const [inputVal, setInputVal] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [timer, setTimer] = useState(null);

  useEffect(() => { setInputVal(value || ''); }, [value]);

  const fetchSuggestions = async (input) => {
    if (!input || input.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&limit=5&countrycodes=il`,
        { headers: { 'Accept-Language': 'he', 'User-Agent': 'joBoss-app' } }
      );
      const data = await res.json();
      setSuggestions(data.map(i => ({ place_id: i.place_id, description: i.display_name, latitude: i.lat, longitude: i.lon })));
    } catch { setSuggestions([]); }
  };

  const handleChange = (e) => {
    setInputVal(e.target.value);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => fetchSuggestions(e.target.value), 500));
  };

  const handleSelect = (s) => {
    setInputVal(s.description);
    onChange(s.description);
    localStorage.setItem('jobLatitude', s.latitude);
    localStorage.setItem('jobLongitude', s.longitude);
    setSuggestions([]);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input style={styles.input} value={inputVal} onChange={handleChange} placeholder="הקלד עיר..." />
      {suggestions.length > 0 && (
        <div style={styles.suggestionsBox}>
          {suggestions.map(s => (
            <div key={s.place_id} style={styles.suggestionItem} onClick={() => handleSelect(s)}
              onMouseEnter={e => e.currentTarget.style.background = '#F0F2FF'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              📍 {s.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Subscription badge for profile header ────────────────────────────────────
function PlanBadge({ planKey }) {
  const map = {
    FREE:         { label: 'חינמי',    bg: '#F0F2FF', color: '#6C4FD4' },
    PREMIUM:      { label: '⭐ פרימיום',  bg: '#6C4FD4', color: 'white' },
    PREMIUM_PLUS: { label: '🔥 פרימיום+', bg: '#FF6B6B', color: 'white' },
  };
  const p = map[planKey] || map.FREE;
  return (
    <span style={{ background: p.bg, color: p.color, padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 700, border: planKey === 'FREE' ? '1px solid #6C4FD4' : 'none' }}>
      {p.label}
    </span>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
function ProfilePage() {
  const [tab, setTab] = useState('profile');   // 'profile' | 'subscription'
  const [profileImage, setProfileImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [userName, setUserName] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [cvFile, setCvFile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(20);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [planKey, setPlanKey] = useState('FREE');

  // Handle ?tab=subscription from LimitModal redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'subscription') setTab('subscription');
  }, []);

  useEffect(() => {
    getCurrentUser().then(async (user) => {
      try {
        const { fetchAuthSession } = await import('aws-amplify/auth');
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.payload;
        setUserName(idToken?.name || idToken?.email || user.username);
      } catch { setUserName(user.username); }
    });

    Promise.all([getMyProfile(), getSubscription()]).then(([profileData, subData]) => {
      const user = profileData.user;
      setProfile(user);
      if (user?.preferredLocation) setLocation(user.preferredLocation);
      if (user?.searchRadius) setRadius(Number(user.searchRadius));
      if (user?.autoApply !== undefined) setAutoApply(user.autoApply);
      if (user?.profileImageUrl) setProfileImage(user.profileImageUrl);
      if (user?.latitude) localStorage.setItem('jobLatitude', user.latitude);
      if (user?.longitude) localStorage.setItem('jobLongitude', user.longitude);
      setPlanKey(subData?.planKey || 'FREE');
      setLoadingProfile(false);
    }).catch(() => setLoadingProfile(false));
  }, []);

  useEffect(() => {
    if (loadingProfile) return;
    const t = setTimeout(async () => {
      const lat = localStorage.getItem('jobLatitude');
      const lng = localStorage.getItem('jobLongitude');
      if (!lat || !lng || !location) return;
      localStorage.setItem('autoApply', autoApply);
      localStorage.setItem('jobLocation', location);
      localStorage.setItem('jobRadius', radius);
      try {
        await updateMyProfile({ autoApply, preferredLocation: location, searchRadius: radius, latitude: parseFloat(lat), longitude: parseFloat(lng) });
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [location, radius, autoApply, loadingProfile]);

  const handleCvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { alert('יש להעלות קובץ PDF בלבד'); return; }
    try {
      setCvFile(file);
      const result = await uploadResume(file);
      await updateMyProfile({ resumeData: { resumeId: result.resumeId || `resume_${Date.now()}`, resumeUrl: result.resumeUrl, fileName: result.fileName || file.name, uploadedAt: result.uploadedAt || new Date().toISOString() } });
      const updated = await getMyProfile();
      setProfile(updated.user);
      alert('✅ קורות החיים הועלו בהצלחה!');
      setCvFile(null);
    } catch { alert('❌ שגיאה בהעלאה'); }
  };

  const handleSetActive = async (resumeId) => {
    try {
      await updateMyProfile({ action: 'setActive', resumeId });
      const updated = await getMyProfile();
      setProfile(updated.user);
    } catch { alert('❌ שגיאה בעדכון'); }
  };

  const handleDeleteResume = async (resumeId) => {
    if (!confirm('למחוק את הקובץ?')) return;
    try {
      await updateMyProfile({ action: 'delete', resumeId });
      const updated = await getMyProfile();
      setProfile(updated.user);
    } catch { alert('❌ שגיאה במחיקה'); }
  };

  const handleLogout = async () => {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
    window.location.href = '/login';
  };

  // Subscription API wrapper for SubscriptionPage
  const subApi = async (method, path, body) => {
    const { apiCall } = await import('../api').catch(() => ({}));
    if (method === 'GET' && path === '/subscriptions/me') return getSubscription();
    if (method === 'POST' && path === '/subscriptions/checkout') return createCheckoutSession(body?.plan);
    if (method === 'DELETE' && path === '/subscriptions/me') return cancelSubscription();
    return {};
  };

  if (loadingProfile) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <p style={{ color: '#6C4FD4', fontWeight: 600 }}>טוען פרופיל...</p>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.content}>

        {/* Profile header card */}
        <div style={styles.card}>
          <div style={{ position: 'relative' }}>
            {profileImage
              ? <img src={profileImage} alt="Profile" style={{ ...styles.avatar, opacity: uploadingImage ? 0.5 : 1 }} />
              : <div style={styles.avatar}>{userName.charAt(0).toUpperCase()}</div>
            }
            <label style={styles.cameraIcon}>
              {uploadingImage ? '⏳' : '📷'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { alert('התמונה גדולה מדי (מקסימום 5MB)'); return; }
                setProfileImage(URL.createObjectURL(file));
                setUploadingImage(true);
                try { const r = await uploadProfileImage(file); setProfileImage(r.imageUrl); }
                catch { alert('שגיאה בהעלאת התמונה'); setProfileImage(null); }
                finally { setUploadingImage(false); }
              }} />
            </label>
          </div>
          <h2 style={styles.username}>{userName}</h2>
          <PlanBadge planKey={planKey} />
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button style={{ ...styles.tabBtn, ...(tab === 'profile' ? styles.tabActive : {}) }} onClick={() => setTab('profile')}>
            👤 פרופיל
          </button>
          <button style={{ ...styles.tabBtn, ...(tab === 'subscription' ? styles.tabActive : {}) }} onClick={() => setTab('subscription')}>
            ⭐ מנוי
          </button>
        </div>

        {/* Profile tab */}
        {tab === 'profile' && (
          <>
            {/* Location */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>📍 העדפות מיקום</h3>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={styles.settingLabel}>מיקום מועדף</p>
                <LocationInput value={location} onChange={setLocation} />
              </div>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={styles.settingLabel}>רדיוס חיפוש</p>
                  <span style={styles.radiusBadge}>{radius} ק"מ</span>
                </div>
                <input type="range" min="5" max="100" step="5" value={radius} onChange={e => setRadius(Number(e.target.value))} style={styles.slider} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={styles.sliderLabel}>5 ק"מ</span>
                  <span style={styles.sliderLabel}>100 ק"מ</span>
                </div>
              </div>
            </div>

            {/* Auto apply */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>⚙️ הגדרות הגשה</h3>
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
                  style={{ ...styles.toggle, background: autoApply && planKey !== 'FREE' ? '#4CAF50' : '#ccc', opacity: planKey === 'FREE' ? 0.5 : 1 }}
                  onClick={() => { if (planKey !== 'FREE') setAutoApply(!autoApply); else setTab('subscription'); }}
                >
                  <div style={{ ...styles.toggleCircle, transform: autoApply && planKey !== 'FREE' ? 'translateX(24px)' : 'translateX(0)' }} />
                </div>
              </div>
            </div>

            {/* Resumes */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>📄 קורות חיים</h3>
              <p style={styles.settingDesc}>העלה עד 3 קבצים — ה-AI יתאים את הפעיל לכל משרה</p>
              {(planKey === 'FREE') && (
                <div style={styles.aiLockBanner}>
                  🤖 התאמת AI זמינה רק במנוי פרימיום
                  <button style={styles.aiUpgradeBtn} onClick={() => setTab('subscription')}>שדרג</button>
                </div>
              )}
              {profile?.resumes?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                  {profile.resumes.map(resume => (
                    <div key={resume.resumeId} style={{ padding: '12px', background: resume.isActive ? '#F0F2FF' : '#F5F5F5', borderRadius: '12px', border: resume.isActive ? '2px solid #6C4FD4' : '1px solid #E0E0E0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: resume.isActive ? 700 : 600, color: resume.isActive ? '#6C4FD4' : '#333' }}>
                          {resume.isActive && '⭐ '}{resume.fileName}
                        </div>
                        <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                          {new Date(resume.uploadedAt).toLocaleDateString('he-IL')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {!resume.isActive && <button style={{ padding: '6px 12px', background: '#6C4FD4', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }} onClick={() => handleSetActive(resume.resumeId)}>הפוך לפעיל</button>}
                        <button style={{ padding: '6px 12px', background: 'transparent', color: '#F44336', border: '1px solid #F44336', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }} onClick={() => handleDeleteResume(resume.resumeId)}>🗑️</button>
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

            <button style={styles.logoutBtn} onClick={handleLogout}>🚪 התנתק</button>
          </>
        )}

        {/* Subscription tab */}
        {tab === 'subscription' && (
          <SubscriptionPage api={subApi} />
        )}

      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', justifyContent: 'center' },
  content: { padding: '24px', maxWidth: '480px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' },
  card: { background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 2px 8px rgba(108,79,212,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' },
  avatar: { width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '32px', fontWeight: 800, color: 'white', objectFit: 'cover' },
  cameraIcon: { position: 'absolute', bottom: 0, right: 0, width: '28px', height: '28px', borderRadius: '50%', background: '#6C4FD4', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '14px', cursor: 'pointer', border: '3px solid white' },
  username: { fontSize: '20px', fontWeight: 700, margin: 0 },
  tabs: { display: 'flex', gap: '8px', background: 'white', padding: '8px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(108,79,212,0.08)' },
  tabBtn: { flex: 1, padding: '10px', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', background: 'transparent', color: '#777' },
  tabActive: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white' },
  cardTitle: { fontSize: '16px', fontWeight: 700, margin: 0, alignSelf: 'flex-start' },
  settingRow: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' },
  settingLabel: { fontSize: '15px', fontWeight: 600, margin: 0 },
  settingDesc: { fontSize: '13px', color: '#777', margin: '4px 0 0 0' },
  toggle: { width: '52px', height: '28px', borderRadius: '14px', padding: '2px', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0, position: 'relative' },
  toggleCircle: { width: '24px', height: '24px', borderRadius: '50%', background: 'white', transition: 'transform 0.3s', position: 'absolute', top: '2px', left: '2px' },
  slider: { width: '100%', accentColor: '#6C4FD4', cursor: 'pointer' },
  sliderLabel: { fontSize: '12px', color: '#999' },
  radiusBadge: { background: '#F0F2FF', color: '#6C4FD4', padding: '4px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 700 },
  input: { width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1.5px solid #eee', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  suggestionsBox: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden', marginTop: '4px' },
  suggestionItem: { padding: '12px 16px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f5f5f5' },
  uploadBtn: { width: '100%', padding: '14px', borderRadius: '12px', border: '2px dashed #6C4FD4', color: '#6C4FD4', fontWeight: 600, fontSize: '15px', cursor: 'pointer', textAlign: 'center', background: '#F0F2FF' },
  aiLockBanner: { width: '100%', background: '#FFF3E0', border: '1px solid #FF9800', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', color: '#E65100', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 },
  aiUpgradeBtn: { background: '#FF9800', color: 'white', border: 'none', borderRadius: '8px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 },
  logoutBtn: { width: '100%', padding: '14px', borderRadius: '12px', background: 'white', color: '#F44336', border: '2px solid #F44336', fontSize: '16px', fontWeight: 700, cursor: 'pointer' },
};

export default ProfilePage;
