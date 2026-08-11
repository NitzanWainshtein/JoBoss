// JoBoss feature:
// - F-21: Personal Dashboard

import { useState, useEffect } from 'react';
import { getMyApplications, getMyProfile } from '../api';
import Spinner from '../components/Spinner';

const statusConfig = {
  accepted:  { color: '#12A96F', label: 'התקבלת' },
  pending:   { color: '#F5A623', label: 'ממתין' },
  rejected:  { color: '#FF4D67', label: 'נדחה' },
  SUBMITTED: { color: '#F5A623', label: 'ממתין' },
  REVIEWED:  { color: '#3D8BF5', label: 'נסקר' },
  INTERVIEW: { color: '#9C4DD4', label: 'ראיון' },
  REJECTED:  { color: '#FF4D67', label: 'נדחה' },
  ACCEPTED:  { color: '#12A96F', label: 'התקבלת' },
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
      <p style={{ fontSize: '18px', fontWeight: 700, color: '#FF4D67' }}>{error}</p>
      <button
        style={{ background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', color: 'white', border: 'none', borderRadius: '999px', padding: '12px 24px', cursor: 'pointer', fontWeight: 800, boxShadow: '0 12px 28px rgba(91,61,245,0.35)' }}
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
            <p style={{ ...styles.statNumber, color: '#12A96F' }}>{accepted}</p>
            <p style={styles.statLabel}>התקבלו</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#F5A623' }}>{pending}</p>
            <p style={styles.statLabel}>ממתינות</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#FF4D67' }}>{rejected}</p>
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
          <div style={{ ...styles.quotaBadge, background: userPlan === 'premium' ? '#12A96F' : swipesLeft > 3 ? '#12A96F' : '#FF4D67' }}>
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
                <div style={{ ...styles.statusBadge, background: statusConfig[app.status]?.color || '#F5A623' }}>
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
  container: { minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column' },
  content: { padding: '16px', maxWidth: '720px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' },
  statCard: { background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: '18px', padding: '18px', textAlign: 'center', boxShadow: '0 6px 20px rgba(108,79,212,0.08)' },
  statNumber: { fontSize: '30px', fontWeight: 900, color: '#5B3DF5', margin: 0 },
  statLabel: { fontSize: '12px', color: '#6B5E9E', margin: '4px 0 0 0', fontWeight: 700 },
  quotaCard: { background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: '18px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 6px 20px rgba(108,79,212,0.08)' },
  quotaInfo: { display: 'flex', flexDirection: 'column', gap: '4px' },
  quotaTitle: { fontSize: '15px', fontWeight: 800, margin: 0, color: '#1E2A4A' },
  quotaSubtitle: { fontSize: '12px', color: '#6B5E9E', margin: 0, fontWeight: 600 },
  quotaBadge: { width: '54px', height: '54px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 6px 16px rgba(0,0,0,0.12)' },
  quotaNumber: { fontSize: '20px', fontWeight: 900, color: 'white', margin: 0 },
  upgradeBtn: { background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', color: 'white', border: 'none', borderRadius: '14px', padding: '14px', cursor: 'pointer', fontWeight: 800, fontSize: '15px', boxShadow: '0 12px 28px rgba(91,61,245,0.35)' },
  sectionTitle: { fontSize: '17px', fontWeight: 900, margin: 0, color: '#1E2A4A' },
  applicationsList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  applicationCard: { background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: '18px', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 6px 20px rgba(108,79,212,0.08)' },
  appInfo: { display: 'flex', flexDirection: 'column', gap: '2px' },
  appCompany: { fontSize: '15px', fontWeight: 800, margin: 0, color: '#1E2A4A' },
  appTitle: { fontSize: '13px', color: '#7C5CFF', margin: 0, fontWeight: 700 },
  appDate: { fontSize: '11px', color: '#7D719F', margin: 0 },
  statusBadge: { padding: '6px 14px', borderRadius: '999px', color: 'white', fontSize: '12px', fontWeight: 800 },
  emptyApplications: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '40px', background: 'rgba(255,255,255,0.85)', borderRadius: '18px', textAlign: 'center' },
  emptyTitle: { fontSize: '17px', fontWeight: 800, margin: 0, color: '#1E2A4A' },
  emptySubtitle: { fontSize: '13px', color: '#6B5E9E', margin: 0 },
};

export default DashboardPage;
