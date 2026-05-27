import React, { useState, useEffect } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { useNavigate } from 'react-router-dom';
import { getMyProfile, updateMyProfile, uploadResume, uploadProfileImage, getMySubscription } from '../api';
import { extractPdfText } from '../utils/pdfText';

function LocationInput({ value, onChange }) {
  const [inputVal, setInputVal] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [debounceTimer, setDebounceTimer] = useState(null);

  useEffect(() => {
    setInputVal(value || '');
  }, [value]);

  const fetchSuggestions = async (input) => {
    if (!input || input.length < 2) {
      setSuggestions([]);
      return;
    }
    
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&limit=5&featuretype=city&addressdetails=1&countrycodes=il`,
        { 
          headers: { 
            'Accept-Language': 'he', 
            'User-Agent': 'joBoss-app' 
          }
        }
      );
      
      if (!res.ok) {
        setSuggestions([]);
        return;
      }
      
      const data = await res.json();
      setSuggestions(data.map(item => ({
        place_id: item.place_id,
        description: item.display_name,
        latitude: item.lat,
        longitude: item.lon
      })));
    } catch (error) {
      console.error('שגיאה בחיפוש מיקום:', error);
      setSuggestions([]);
    }
  };

  const handleChange = (e) => {
    const newValue = e.target.value;
    setInputVal(newValue);

    // נקה את ה-timer הקודם
    if (debounceTimer) clearTimeout(debounceTimer);

    // חכה 500ms לפני הקריאה (Debounce)
    const timer = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 500);

    setDebounceTimer(timer);
  };

  const handleSelect = (suggestion) => {
    setInputVal(suggestion.description);
    onChange(suggestion.description);
    localStorage.setItem('jobLatitude', suggestion.latitude);
    localStorage.setItem('jobLongitude', suggestion.longitude);
    setSuggestions([]);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: '12px',
          border: '1.5px solid #eee',
          fontSize: '14px',
          outline: 'none',
          boxSizing: 'border-box'
        }}
        value={inputVal}
        onChange={handleChange}
        placeholder="הקלד עיר..."
      />
      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          zIndex: 100,
          overflow: 'hidden',
          marginTop: '4px'
        }}>
          {suggestions.map((s) => (
            <div
              key={s.place_id}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                borderBottom: '1px solid #f5f5f5'
              }}
              onClick={() => handleSelect(s)}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2FF'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
            >
              📍 {s.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfilePage() {
  const navigate = useNavigate();
  const [profileImage, setProfileImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [userName, setUserName] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [cvFile, setCvFile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(20);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const isPremium = (subscription?.plan || profile?.plan) === 'PREMIUM';

 useEffect(() => {
  getCurrentUser().then(async (user) => {
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.payload;
    
    // נסה לקחת שם מ-Google, אחרת email
    const displayName = idToken?.name || idToken?.email || user.username;
    setUserName(displayName);
  } catch {
    setUserName(user.username);
  }
});
    getMyProfile()
      .then((data) => {
        const user = data.user;
        setProfile(user);
        if (user?.preferredLocation) setLocation(user.preferredLocation);
        if (user?.searchRadius) setRadius(Number(user.searchRadius));
        if (user?.autoApply !== undefined) setAutoApply(user.autoApply);
        if (user?.profileImageUrl) setProfileImage(user.profileImageUrl);
        if (user?.latitude) localStorage.setItem('jobLatitude', user.latitude);
        if (user?.longitude) localStorage.setItem('jobLongitude', user.longitude);
        setLoadingProfile(false);
      })
      .catch(() => {
        const savedLocation = localStorage.getItem('jobLocation');
        const savedRadius = localStorage.getItem('jobRadius');
        if (savedLocation) setLocation(savedLocation);
        if (savedRadius) setRadius(Number(savedRadius));
        setLoadingProfile(false);
      });
    getMySubscription()
      .then((data) => setSubscription(data))
      .catch((error) => {
        console.warn('Failed to load subscription in profile:', error);
      });
  }, []);

  useEffect(() => {
    if (loadingProfile) return;

    const saveTimer = setTimeout(async () => {
      const latitude = localStorage.getItem('jobLatitude');
      const longitude = localStorage.getItem('jobLongitude');

      if (!latitude || !longitude || !location) return;

      localStorage.setItem('autoApply', autoApply);
      localStorage.setItem('jobLocation', location);
      localStorage.setItem('jobRadius', radius);

      try {
        await updateMyProfile({
          autoApply,
          preferredLocation: location,
          searchRadius: radius,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude)
        });
        console.log('✅ הגדרות נשמרו אוטומטית');
      } catch (e) {
        console.error('שגיאה בשמירה:', e);
      }
    }, 1000);

    return () => clearTimeout(saveTimer);
  }, [location, radius, autoApply, loadingProfile]);

  const handleCvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('יש להעלות קובץ PDF בלבד');
      return;
    }

    try {
      setCvFile(file);
      const resumeText = await extractPdfText(file);
      const result = await uploadResume(file);
      const resumeId = result.resumeId || `resume_${Date.now()}`;

      try {
        sessionStorage.setItem(`resumePreview:${resumeId}`, result.previewDataUrl);
        sessionStorage.setItem(`resumeText:${resumeId}`, resumeText);
      } catch (storageError) {
        console.warn('Could not store resume preview locally:', storageError);
      }

      await updateMyProfile({
        resumeData: {
          resumeId,
          resumeUrl: result.resumeUrl,
          fileName: result.fileName || file.name,
          uploadedAt: result.uploadedAt || new Date().toISOString()
        }
      });

      const updated = await getMyProfile();
      setProfile(updated.user);

      alert('✅ קורות החיים הועלו בהצלחה!');
      setCvFile(null);
    } catch (error) {
      console.error('שגיאה בהעלאת קורות חיים:', error);
      alert('❌ שגיאה בהעלאה');
    }
  };

  const handleSetActive = async (resumeId) => {
    try {
      await updateMyProfile({
        action: 'setActive',
        resumeId
      });

      const updated = await getMyProfile();
      setProfile(updated.user);

      alert('✅ קובץ הפעיל עודכן!');
    } catch (error) {
      console.error('שגיאה:', error);
      alert('❌ שגיאה בעדכון');
    }
  };

  const handleDeleteResume = async (resumeId) => {
    if (!confirm('למחוק את הקובץ?')) return;

    try {
      await updateMyProfile({
        action: 'delete',
        resumeId
      });

      const updated = await getMyProfile();
      setProfile(updated.user);

      alert('✅ הקובץ נמחק!');
    } catch (error) {
      console.error('שגיאה:', error);
      alert('❌ שגיאה במחיקה');
    }
  };

  const handleLogout = async () => {
    const { signOut } = await import('aws-amplify/auth');
    await signOut();
    window.location.href = '/login';
  };

  if (loadingProfile) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '80vh'
      }}>
        <p style={{ color: '#6C4FD4', fontWeight: 600 }}>טוען פרופיל...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.card}>
  <div style={{ position: 'relative' }}>
    {profileImage ? (
      <img src={profileImage} alt="Profile" style={{ ...styles.avatar, opacity: uploadingImage ? 0.5 : 1 }} />
    ) : (
      <div style={styles.avatar}>{userName.charAt(0).toUpperCase()}</div>
    )}
    {uploadingImage && (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
        <span style={{ fontSize: '20px' }}>⏳</span>
      </div>
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
            const result = await uploadProfileImage(file);
            setProfileImage(result.imageUrl);
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
  <span style={isPremium ? styles.planBadgePremium : styles.planBadge}>
    {isPremium ? 'Premium פעיל' : 'מנוי חינמי'}
  </span>
</div>

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

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>⚙️ הגדרות הגשה</h3>
          <div style={styles.settingRow}>
            <div>
              <p style={styles.settingLabel}>הגשה אוטומטית</p>
              <p style={styles.settingDesc}>
                {autoApply
                  ? 'CV יישלח אוטומטית לכל משרה שתחליק ימינה'
                  : 'כל הגשה תחכה לאישור שלך לפני השליחה'}
              </p>
            </div>
            <div
              style={{
                ...styles.toggle,
                background: autoApply ? '#4CAF50' : '#ccc'
              }}
              onClick={() => setAutoApply(!autoApply)}
            >
              <div
                style={{
                  ...styles.toggleCircle,
                  transform: autoApply ? 'translateX(24px)' : 'translateX(0)'
                }}
              />
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>📄 קורות חיים</h3>
          <p style={styles.settingDesc}>
            העלה עד 3 קבצי קורות חיים — ה-AI יתאים את הפעיל לכל משרה
          </p>

          {profile?.resumes?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', width: '100%' }}>
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
                    gap: '12px'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: resume.isActive ? 700 : 600,
                        color: resume.isActive ? '#6C4FD4' : '#333'
                      }}
                    >
                      {resume.isActive && '⭐ '}{resume.fileName}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                      הועלה: {new Date(resume.uploadedAt).toLocaleDateString('he-IL')}
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
                          fontWeight: 600
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
                        fontWeight: 600
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
              {cvFile ? `✅ ${cvFile.name}` : '📎 העלה קורות חיים'}
              <input
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={handleCvUpload}
              />
            </label>
          )}

          {profile?.resumes?.length >= 3 && (
            <p style={{ fontSize: '13px', color: '#F44336', textAlign: 'center', margin: 0 }}>
              הגעת למקסימום של 3 קבצים. מחק קובץ כדי להעלות חדש.
            </p>
          )}
        </div>

        {isPremium ? (
          <div style={styles.premiumCard}>
            <div>
              <p style={styles.upgradeTitle}>Premium פעיל</p>
              <p style={styles.upgradeDesc}>יש לך מכסה גבוהה יותר ויכולות AI tailoring מתקדמות.</p>
            </div>
          </div>
        ) : (
          <div style={styles.upgradeCard}>
            <div>
              <p style={styles.upgradeTitle}>שדרג לפרימיום</p>
              <p style={styles.upgradeDesc}>מכסה גבוהה יותר + AI tailoring מתקדם</p>
            </div>
            <button type="button" style={styles.upgradeBtn} onClick={() => navigate('/subscription')}>
              שדרג
            </button>
          </div>
        )}

        <button style={styles.logoutBtn} onClick={handleLogout}>
          🚪 התנתק
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--background)',
    display: 'flex',
    justifyContent: 'center'
  },
  content: {
    padding: '24px',
    maxWidth: '480px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  card: {
    background: 'white',
    borderRadius: '20px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(108,79,212,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px'
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
  objectFit: 'cover'
},
  cameraIcon: {
  position: 'absolute',
  bottom: '0',
  right: '0',
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
  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
},
  username: {
    fontSize: '20px',
    fontWeight: 700,
    margin: 0
  },
  planBadge: {
    background: '#F0F2FF',
    color: '#6C4FD4',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 600,
    border: '1px solid #6C4FD4'
  },
  planBadgePremium: {
    background: '#ECFDF5',
    color: '#047857',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 700,
    border: '1px solid #34D399'
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 700,
    margin: 0,
    alignSelf: 'flex-start'
  },
  settingRow: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px'
  },
  settingLabel: {
    fontSize: '15px',
    fontWeight: 600,
    margin: 0
  },
  settingDesc: {
    fontSize: '13px',
    color: '#777',
    margin: '4px 0 0 0'
  },
  toggle: {
    width: '52px',
    height: '28px',
    borderRadius: '14px',
    padding: '2px',
    cursor: 'pointer',
    transition: 'background 0.3s',
    flexShrink: 0,
    position: 'relative'
  },
  toggleCircle: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'white',
    transition: 'transform 0.3s',
    position: 'absolute',
    top: '2px',
    left: '2px'
  },
  slider: {
    width: '100%',
    accentColor: '#6C4FD4',
    cursor: 'pointer'
  },
  sliderLabel: {
    fontSize: '12px',
    color: '#999'
  },
  radiusBadge: {
    background: '#F0F2FF',
    color: '#6C4FD4',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: 700,
    border: '1px solid #6C4FD4'
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
    background: '#F0F2FF'
  },
  upgradeCard: {
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
    borderRadius: '20px',
    padding: '20px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  premiumCard: {
    background: 'linear-gradient(135deg, #059669, #1E2A4A)',
    borderRadius: '20px',
    padding: '20px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  upgradeTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'white',
    margin: 0
  },
  upgradeDesc: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.85)',
    margin: '4px 0 0 0'
  },
  upgradeBtn: {
    background: 'white',
    color: '#6C4FD4',
    border: 'none',
    borderRadius: '12px',
    padding: '10px 20px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
    flexShrink: 0
  },
  saveBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
    color: 'white',
    border: 'none',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer'
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
    cursor: 'pointer'
  }
};

export default ProfilePage;
