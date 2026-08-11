// JoBoss feature:
// - F-21: Personal Dashboard

import { useState, useEffect } from 'react';
import { getMyApplications, getQuotaStatus } from '../api';
import Spinner from '../components/Spinner';
import useTranslation from '../i18n/useTranslation';

// Status keys are whatever the backend has written over time — both the early
// lowercase set and the current uppercase one. Colour here, label via i18n.
const STATUS_COLORS = {
  accepted:  '#12A96F',
  pending:   '#F5A623',
  rejected:  '#FF4D67',
  SUBMITTED: '#F5A623',
  REVIEWED:  '#3D8BF5',
  INTERVIEW: '#9C4DD4',
  REJECTED:  '#FF4D67',
  ACCEPTED:  '#12A96F',
};

const STATUS_LABEL_KEYS = {
  accepted:  'dash.statusAccepted',
  pending:   'dash.statusPending',
  rejected:  'dash.statusRejected',
  SUBMITTED: 'dash.statusPending',
  REVIEWED:  'dash.statusReviewed',
  INTERVIEW: 'dash.statusInterview',
  REJECTED:  'dash.statusRejected',
  ACCEPTED:  'dash.statusAccepted',
};

function DashboardPage() {
  const { t } = useTranslation();
  const [applications, setApplications] = useState([]);
  // Quota comes from the API. It used to be a hardcoded `useState(3)` against a
  // DAILY_LIMIT of 10 — neither matched the real per-tier limits (5/30/∞), so
  // this card confidently displayed a number that was simply invented.
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getMyApplications(), getQuotaStatus()])
      .then(([appData, quotaData]) => {
        setApplications(appData.applications || []);
        setQuota(quotaData);
        setLoading(false);
      })
      .catch(() => {
        setError(t('dash.noConnection'));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accepted = applications.filter(a => ['accepted', 'ACCEPTED'].includes(a.status)).length;
  const rejected = applications.filter(a => ['rejected', 'REJECTED'].includes(a.status)).length;
  const pending  = applications.filter(a => ['pending', 'SUBMITTED', 'REVIEWED'].includes(a.status)).length;

  const isUnlimited = quota?.unlimited === true || quota?.limit === -1;
  const swipesLeft = isUnlimited ? '∞' : (quota?.remaining ?? 0);
  const isFreePlan = (quota?.plan || 'FREE') === 'FREE';

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Spinner text={t('dash.loading')} />
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
        {t('dash.retry')}
      </button>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.content}>

        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <p style={styles.statNumber}>{applications.length}</p>
            <p style={styles.statLabel}>{t('dash.totalApplications')}</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#12A96F' }}>{accepted}</p>
            <p style={styles.statLabel}>{t('dash.accepted')}</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#F5A623' }}>{pending}</p>
            <p style={styles.statLabel}>{t('dash.pending')}</p>
          </div>
          <div style={styles.statCard}>
            <p style={{ ...styles.statNumber, color: '#FF4D67' }}>{rejected}</p>
            <p style={styles.statLabel}>{t('dash.rejected')}</p>
          </div>
        </div>

        <div style={styles.quotaCard}>
          <div style={styles.quotaInfo}>
            <p style={styles.quotaTitle}>{t('dash.swipesLeftToday')}</p>
            <p style={styles.quotaSubtitle}>
              {isUnlimited
                ? t('dash.planUnlimited')
                : t('dash.planDailyLimit', { plan: quota?.plan || 'FREE', limit: quota?.limit ?? 0 })}
            </p>
          </div>
          <div style={{ ...styles.quotaBadge, background: isUnlimited || swipesLeft > 3 ? '#12A96F' : '#FF4D67' }}>
            <p style={styles.quotaNumber}>{swipesLeft}</p>
          </div>
        </div>

        {isFreePlan && (
          <button style={styles.upgradeBtn} onClick={() => { window.location.href = '/subscription'; }}>
            {t('dash.upgradeCta')}
          </button>
        )}

        <h2 style={styles.sectionTitle}>{t('dash.history')}</h2>

        {applications.length === 0 ? (
          <div style={styles.emptyApplications}>
            <p style={{ fontSize: '48px', margin: 0 }}>📋</p>
            <p style={styles.emptyTitle}>{t('dash.emptyTitle')}</p>
            <p style={styles.emptySubtitle}>{t('dash.emptySubtitle')}</p>
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
                <div style={{ ...styles.statusBadge, background: STATUS_COLORS[app.status] || '#F5A623' }}>
                  {t(STATUS_LABEL_KEYS[app.status] || 'dash.statusPending')}
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
