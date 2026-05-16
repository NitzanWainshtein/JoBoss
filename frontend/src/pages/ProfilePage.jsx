import React, { useState, useEffect } from 'react';
import { getCurrentUser } from 'aws-amplify/auth';

function ProfilePage() {
  const [userName, setUserName] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [cvFile, setCvFile] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getCurrentUser().then((user) => {
      setUserName(user.username);
    });
  }, []);

  const handleSave = () => {
    localStorage.setItem('autoApply', autoApply);
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

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.card}>
          <div style={styles.avatar}>{userName.charAt(0).toUpperCase()}</div>
          <h2 style={styles.username}>{userName}</h2>
          <span style={styles.planBadge}>מנוי חינמי</span>
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
  uploadBtn: { width: '100%', padding: '14px', borderRadius: '12px', border: '2px dashed #FF6B6B', color: '#FF6B6B', fontWeight: 600, fontSize: '15px', cursor: 'pointer', textAlign: 'center', background: '#FFF5F5' },
  upgradeCard: { background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', borderRadius: '20px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  upgradeTitle: { fontSize: '16px', fontWeight: 700, color: 'white', margin: 0 },
  upgradeDesc: { fontSize: '13px', color: 'rgba(255,255,255,0.85)', margin: '4px 0 0 0' },
  upgradeBtn: { background: 'white', color: '#FF6B6B', border: 'none', borderRadius: '12px', padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '14px', flexShrink: 0 },
  saveBtn: { width: '100%', padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer' },
};

export default ProfilePage;