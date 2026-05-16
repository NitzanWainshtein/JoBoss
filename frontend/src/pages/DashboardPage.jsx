import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';

// Mock data זמני — יוחלף בAPI אמיתי אחר כך
const mockApplications = [
  { id: 1, company: 'Google', title: 'Frontend Developer', date: '15/05/2026', status: 'pending' },
  { id: 2, company: 'Microsoft', title: 'Full Stack Developer', date: '14/05/2026', status: 'accepted' },
  { id: 3, company: 'Monday.com', title: 'React Developer', date: '13/05/2026', status: 'rejected' },
  { id: 4, company: 'Wix', title: 'Software Engineer', date: '12/05/2026', status: 'pending' },
  { id: 5, company: 'Check Point', title: 'Backend Developer', date: '11/05/2026', status: 'accepted' },
];

const statusConfig = {
  accepted: { color: '#4CAF50', label: 'התקבלת' },
  pending:  { color: '#FFC107', label: 'ממתין' },
  rejected: { color: '#F44336', label: 'נדחה' },
};

// זמני — אחר כך יבוא מה-DB
const userPlan = 'free'; // 'free' | 'premium'
const DAILY_LIMIT = 10;
const swipesUsedToday = 3;

function DashboardPage() {
  const navigate = useNavigate();
  const [applications] = useState(mockApplications);

  const accepted = applications.filter(a => a.status === 'accepted').length;
  const rejected = applications.filter(a => a.status === 'rejected').length;
  const pending  = applications.filter(a => a.status === 'pending').length;
  const swipesLeft = userPlan === 'premium' ? '∞' : DAILY_LIMIT - swipesUsedToday;

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.logo}>jo<span style={styles.logoAccent}>Boss</span></h1>
        <div style={styles.headerButtons}>
          <button style={styles.swipeBtn} onClick={() => navigate('/swipe')}>⬅ חזור ל-Swipe</button>
          <button style={styles.logoutBtn} onClick={handleLogout}>התנתק</button>
        </div>
      </div>

      <div style={styles.content}>

        {/* סטטיסטיקות */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <p style={styles.statNumber}>{applications.length}</p>
            <p style={styles.statLabel}>סה"כ הגשות</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#4CAF50' }}>{accepted}</p>
            <p style={styles.statLabel}>התקבלו</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#FFC107' }}>{pending}</p>
            <p style={styles.statLabel}>ממתינות</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#F44336' }}>{rejected}</p>
            <p style={styles.statLabel}>נדחו</p>
          </div>
        </div>

        {/* הגשות שנותרו היום */}
        <div style={styles.quotaCard}>
          <div style={styles.quotaInfo}>
            <p style={styles.quotaTitle}>הגשות שנותרו היום</p>
            <p style={styles.quotaSubtitle}>
              {userPlan === 'premium' ? 'מנוי פרימיום — ללא הגבלה' : `מנוי חינמי — ${DAILY_LIMIT} הגשות ביום`}
            </p>
          </div>
          <div style={{ ...styles.quotaBadge, background: userPlan === 'premium' ? '#4CAF50' : swipesLeft > 3 ? '#4CAF50' : '#F44336' }}>
            <p style={styles.quotaNumber}>{swipesLeft}</p>
          </div>
        </div>

        {userPlan === 'free' && (
          <button style={styles.upgradeBtn}>
            ⭐ שדרג לפרימיום — הגשות ללא הגבלה
          </button>
        )}

        {/* היסטוריית הגשות */}
        <h2 style={styles.sectionTitle}>היסטוריית הגשות</h2>
        <div style={styles.applicationsList}>
          {applications.map((app) => (
            <div key={app.id} style={styles.applicationCard}>
              <div style={styles.appInfo}>
                <p style={styles.appCompany}>{app.company}</p>
                <p style={styles.appTitle}>{app.title}</p>
                <p style={styles.appDate}>{app.date}</p>
              </div>
              <div style={{ ...styles.statusBadge, background: statusConfig[app.status].color }}>
                {statusConfig[app.status].label}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column' },
  header: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  logo: { fontSize: '28px', fontWeight: 800, color: 'var(--primary)', margin: 0 },
  logoAccent: { color: 'var(--secondary)' },
  headerButtons: { display: 'flex', gap: '12px' },
  swipeBtn: { background: 'white', color: 'var(--primary)', border: '2px solid var(--primary)', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
  logoutBtn: { background: '#eee', color: '#666', border: 'none', borderRadius: '20px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
  content: { padding: '24px', maxWidth: '720px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' },
  statCard: { background: 'white', borderRadius: '16px', padding: '20px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  statNumber: { fontSize: '32px', fontWeight: 800, color: 'var(--primary)', margin: 0 },
  statLabel: { fontSize: '12px', color: 'var(--text-light)', margin: '4px 0 0 0' },
  quotaCard: { background: 'white', borderRadius: '16px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  quotaInfo: { display: 'flex', flexDirection: 'column', gap: '4px' },
  quotaTitle: { fontSize: '16px', fontWeight: 700, margin: 0 },
  quotaSubtitle: { fontSize: '13px', color: 'var(--text-light)', margin: 0 },
  quotaBadge: { width: '56px', height: '56px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  quotaNumber: { fontSize: '22px', fontWeight: 800, color: 'white', margin: 0 },
  upgradeBtn: { background: 'linear-gradient(135deg, var(--primary), var(--secondary))', color: 'white', border: 'none', borderRadius: '12px', padding: '14px', cursor: 'pointer', fontWeight: 700, fontSize: '15px' },
  sectionTitle: { fontSize: '18px', fontWeight: 700, margin: 0 },
  applicationsList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  applicationCard: { background: 'white', borderRadius: '16px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  appInfo: { display: 'flex', flexDirection: 'column', gap: '2px' },
  appCompany: { fontSize: '16px', fontWeight: 700, margin: 0 },
  appTitle: { fontSize: '14px', color: 'var(--text-light)', margin: 0 },
  appDate: { fontSize: '12px', color: '#bbb', margin: 0 },
  statusBadge: { padding: '6px 14px', borderRadius: '20px', color: 'white', fontSize: '13px', fontWeight: 600 },
};

export default DashboardPage;