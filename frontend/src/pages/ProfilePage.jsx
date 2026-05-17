import React, { useState, useEffect } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';
import { getMyProfile, updateMyProfile } from '../api';

function LocationInput({ value, onChange }) {
  const [inputVal, setInputVal] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    setInputVal(value || '');
  }, [value]);

  const fetchSuggestions = async (input) => {
    if (!input || input.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&limit=5&featuretype=city&addressdetails=1`,
        { headers: { 'Accept-Language': 'he', 'User-Agent': 'joBoss-app' } }
      );
      const data = await res.json();
      setSuggestions(data.map(item => ({
        place_id: item.place_id,
        description: item.display_name
      })));
    } catch { setSuggestions([]); }
  };

  const handleChange = (e) => {
    setInputVal(e.target.value);
    fetchSuggestions(e.target.value);
  };

  const handleSelect = (description) => {
    setInputVal(description);
    onChange(description);
    setSuggestions([]);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1.5px solid #eee', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
        value={inputVal}
        onChange={handleChange}
        placeholder="הקלד עיר..."
      />
      {suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden', marginTop: '4px' }}>
          {suggestions.map((s) => (
            <div
              key={s.place_id}
              style={{ padding: '12px 16px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f5f5f5' }}
              onClick={() => handleSelect(s.description)}
              onMouseEnter={(e) => e.currentTarget.style.background = '#FFF5F5'}
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
  const [userName, setUserName] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [cvFile, setCvFile] = useState(null);
  const [saved, setSaved] = useState(false);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(20);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    getCurrentUser().then((user) => setUserName(user.username));

    getMyProfile().then((data) => {
      const user = data.user;
      if (user?.preferredLocation) setLocation(user.preferredLocation);
      if (user?.searchRadius) setRadius(Number(user.searchRadius));
      if (user?.autoApply !== undefined) setAutoApply(user.autoApply);
      setLoadingProfile(false);
    }).catch(() => {
      const savedLocation = localStorage.getItem('jobLocation');
      const savedRadius = localStorage.getItem('jobRadius');
      if (savedLocation) setLocation(savedLocation);
      if (savedRadius) setRadius(Number(savedRadius));
      setLoadingProfile(false);
    });
  }, []);

  const handleSave = async () => {
    localStorage.setItem('autoApply', autoApply);
    localStorage.setItem('jobLocation', location);
    localStorage.setItem('jobRadius', radius);

    try {
      await updateMyProfile({
        autoApply,
        preferredLocation: location,
        searchRadius: radius,
      });
    } catch (e) {
      console.error('שגיאה בשמירה:', e);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCvUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setCvFile(file);
    } else {
      alert('יש להעלות קובץ PDF בלבד');
    }
  };

  if (loadingProfile) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <p style={{ color: '#FF6B6B', fontWeight: 600 }}>טוען פרופיל...</p>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.content}>

        <div style={styles.card}>
          <div style={styles.avatar}>{userName.charAt(0).toUpperCase()}</div>
          <h2 style={styles.username}>{userName}</h2>
          <span style={styles.planBadge}>מנוי חינמי</span>
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
              type="range" min="5" max="100" step="5" value={radius}
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
                {autoApply ? 'CV יישלח אוטומטית לכל משרה שתחליק ימינה' : 'כל הגשה תחכה לאישור שלך לפני השליחה'}
              </p>
            </div>
            <div
              style={{ ...styles.toggle, background: autoApply ? '#4CAF50' : '#ccc' }}
              onClick={() => setAutoApply(!autoApply)}
            >
              <div style={{ ...styles.toggleCircle, transform: autoApply ? 'translateX(24px)' : 'translateX(0)' }} />
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>📄 קורות חיים</h3>
          <p style={styles.settingDesc}>העלה את קורות החיים שלך — ה-AI יתאים אותם לכל משרה</p>
          <label style={styles.uploadBtn}>
            {cvFile ? `✅ ${cvFile.name}` : '📎 העלה PDF'}
            <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleCvUpload} />
          </label>
        </div>

        <div style={styles.upgradeCard}>
          <div>
            <p style={styles.upgradeTitle}>⭐ שדרג לפרימיום</p>
            <p style={styles.upgradeDesc}>הגשות ללא הגבלה + AI tailoring מלא</p>
          </div>
          <button style={styles.upgradeBtn}>שדרג</button>
        </div>

        <button style={styles.saveBtn} onClick={handleSave}>
          {saved ? '✅ נשמר!' : 'שמור הגדרות'}
        </button>

      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', justifyContent: 'center' },
  content: { padding: '24px', maxWidth: '480px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' },
  card: { background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' },
  avatar: { width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '32px', fontWeight: 800, color: 'white' },
  username: { fontSize: '20px', fontWeight: 700, margin: 0 },
  planBadge: { background: '#FFF5F5', color: '#FF6B6B', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, border: '1px solid #FF6B6B' },
  cardTitle: { fontSize: '16px', fontWeight: 700, margin: 0, alignSelf: 'flex-start' },
  settingRow: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' },
  settingLabel: { fontSize: '15px', fontWeight: 600, margin: 0 },
  settingDesc: { fontSize: '13px', color: '#777', margin: '4px 0 0 0' },
  toggle: { width: '52px', height: '28px', borderRadius: '14px', padding: '2px', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0, position: 'relative' },
  toggleCircle: { width: '24px', height: '24px', borderRadius: '50%', background: 'white', transition: 'transform 0.3s', position: 'absolute', top: '2px', left: '2px' },
  slider: { width: '100%', accentColor: '#FF6B6B', cursor: 'pointer' },
  sliderLabel: { fontSize: '12px', color: '#999' },
  radiusBadge: { background: '#FFF5F5', color: '#FF6B6B', padding: '4px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 700, border: '1px solid #FF6B6B' },
  uploadBtn: { width: '100%', padding: '14px', borderRadius: '12px', border: '2px dashed #FF6B6B', color: '#FF6B6B', fontWeight: 600, fontSize: '15px', cursor: 'pointer', textAlign: 'center', background: '#FFF5F5' },
  upgradeCard: { background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', borderRadius: '20px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  upgradeTitle: { fontSize: '16px', fontWeight: 700, color: 'white', margin: 0 },
  upgradeDesc: { fontSize: '13px', color: 'rgba(255,255,255,0.85)', margin: '4px 0 0 0' },
  upgradeBtn: { background: 'white', color: '#FF6B6B', border: 'none', borderRadius: '12px', padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', flexShrink: 0 },
  saveBtn: { width: '100%', padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer' },
};

export default ProfilePage;