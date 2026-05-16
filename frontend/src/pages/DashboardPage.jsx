import React, { useState, useEffect } from 'react';
import { getMyApplications, getMyProfile } from '../api';
import Spinner from '../components/Spinner';

const statusConfig = {
  accepted:  { color: '#4CAF50', label: 'התקבלת' },
  pending:   { color: '#FFC107', label: 'ממתין' },
  rejected:  { color: '#F44336', label: 'נדחה' },
  SUBMITTED: { color: '#FFC107', label: 'ממתין' },
  REVIEWED:  { color: '#2196F3', label: 'נסקר' },
  INTERVIEW: { color: '#9C27B0', label: 'ראיון' },
  REJECTED:  { color: '#F44336', label: 'נדחה' },
  ACCEPTED:  { color: '#4CAF50', label: 'התקבלת' },
};

const DAILY_LIMIT = 10;

function DashboardPage() {
  const [applications, setApplications] = useState([]);
  const [userPlan, setUserPlan] = useState('free');
  const [swipesUsedToday] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getMyApplications(), getMyProfile()])
      .then(([appData, profileData]) => {
        setApplications(appData.applications || []);
        setUserPlan(profileData.user?.plan?.toLowerCase() || 'free');
        setLoading(false);
      })
      .catch(() => {
        setError('אין חיבור לשרת. אנא נסה שוב מאוחר יותר.');
        setLoading(false);
      });
  }, []);

  const accepted = applications.filter(a => ['accepted', 'ACCEPTED'].includes(a.status)).length;
  const rejected = applications.filter(a => ['rejected', 'REJECTED'].includes(a.status)).length;
  const pending  = applications.filter(a => ['pending', 'SUBMITTED', 'REVIEWED'].includes(a.status)).length;
  const swipesLeft = userPlan === 'premium' ? '∞' : DAILY_LIMIT - swipesUsedToday;

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Spinner text="טוען נתונים..." />
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', gap: '16px' }}>
      <p style={{ fontSize: '48px' }}>⚠️</p>
      <p style={{ fontSize: '18px', fontWeight: 700, color: '#F44336' }}>{error}</p>
      <button
        style={{ background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white', border: 'none', borderRadius: '20px', padding: '12px 24px', cursor: 'pointer', fontWeight: 700 }}
        onClick={() => window.location.reload()}
      >
        נסה שוב
      </button>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.content}>

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
          <button style={styles.upgradeBtn}>⭐ שדרג לפרימיום — הגשות ללא הגבלה</button>
        )}

        <h2 style={styles.sectionTitle}>היסטוריית הגשות</h2>

        {applications.length === 0 ? (
          <div style={styles.emptyApplications}>
            <p style={{ fontSize: '48px', margin: 0 }}>📋</p>
            <p style={styles.emptyTitle}>אין הגשות עדיין</p>
            <p style={styles.emptySubtitle}>התחל להחליק משרות כדי לראות אותן כאן</p>
          </div>
        ) : (
          <div style={styles.applicationsList}>
            {applications.map((app, index) => (
              <div key={app.jobId || app.id || index} style={styles.applicationCard}>
                <div style={styles.appInfo}>
                  <p style={styles.appCompany}>{app.company}</p>
                  <p style={styles.appTitle}>{app.title}</p>
                  <p style={styles.appDate}>{app.createdAt?.slice(0, 10) || app.date || ''}</p>
                </div>
                <div style={{ ...styles.statusBadge, background: statusConfig[app.status]?.color || '#FFC107' }}>
                  {statusConfig[app.status]?.label || 'ממתין'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column' },
  content: { padding: '24px', maxWidth: '720px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' },
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
  emptyApplications: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '40px', background: 'white', borderRadius: '16px', textAlign: 'center' },
  emptyTitle: { fontSize: '18px', fontWeight: 700, margin: 0 },
  emptySubtitle: { fontSize: '14px', color: '#777', margin: 0 },
};

export default DashboardPage;