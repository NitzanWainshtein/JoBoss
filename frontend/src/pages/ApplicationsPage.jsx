import React, { useState, useEffect } from 'react';
import { getMyApplications, updateApplication, tailorCVForJob } from '../api';
import Spinner from '../components/Spinner';

const STATUS_CONFIG = {
  SUBMITTED: { color: '#FFC107', label: 'הוגש' },
  REVIEWED:  { color: '#2196F3', label: 'נסקר' },
  INTERVIEW: { color: '#9C27B0', label: 'ראיון' },
  ACCEPTED:  { color: '#4CAF50', label: 'התקבלת' },
  REJECTED:  { color: '#F44336', label: 'נדחה' },
  pending:   { color: '#FFC107', label: 'ממתין' },
  accepted:  { color: '#4CAF50', label: 'התקבלת' },
  rejected:  { color: '#F44336', label: 'נדחה' },
};

const FILTERS = [
  { key: 'all',      label: 'הכל' },
  { key: 'SUBMITTED',label: 'הוגש' },
  { key: 'REVIEWED', label: 'נסקר' },
  { key: 'INTERVIEW',label: 'ראיון' },
  { key: 'ACCEPTED', label: 'התקבלת' },
  { key: 'REJECTED', label: 'נדחה' },
];

const STATUS_ACTIONS = ['SUBMITTED', 'REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];

function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [previewApplication, setPreviewApplication] = useState(null);
  const [tailoringJobId, setTailoringJobId] = useState(null);
  const autoTailorCV = localStorage.getItem('autoTailorCV') === 'true';
  const [tailoringJobs, setTailoringJobs] = useState(() => {
    const pending = JSON.parse(localStorage.getItem('tailoringPending') || '{}');
    return new Set(Object.keys(pending));
  });

  useEffect(() => {
    loadApplications();
  }, []);

  useEffect(() => {
    const handleComplete = (e) => {
      const { jobId, tailoredResume, tailoredResumeUrl } = e.detail;
      setApplications(prev => prev.map(a =>
        a.jobId === jobId ? { ...a, tailoredResume, tailoredResumeUrl } : a
      ));
      setTailoringJobs(prev => { const s = new Set(prev); s.delete(jobId); return s; });
    };
    const handleError = (e) => {
      setTailoringJobs(prev => { const s = new Set(prev); s.delete(e.detail.jobId); return s; });
    };
    window.addEventListener('tailorComplete', handleComplete);
    window.addEventListener('tailorError', handleError);
    return () => {
      window.removeEventListener('tailorComplete', handleComplete);
      window.removeEventListener('tailorError', handleError);
    };
  }, []);

  const loadApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyApplications();
      const apps = data.applications || [];

      setTailoringJobs(prev => {
        const pending = JSON.parse(localStorage.getItem('tailoringPending') || '{}');
        const updated = new Set(prev);
        apps.forEach(app => {
          if (app.tailoredResumeUrl && updated.has(app.jobId)) {
            updated.delete(app.jobId);
            delete pending[app.jobId];
          }
        });
        localStorage.setItem('tailoringPending', JSON.stringify(pending));
        return updated;
      });

      setApplications(apps);
    } catch {
      setError('אין חיבור לשרת. אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (jobId, newStatus) => {
    setUpdating(jobId);
    try {
      await updateApplication(jobId, newStatus);
      setApplications(prev =>
        prev.map(a => a.jobId === jobId
          ? { ...a, status: newStatus, lastUpdated: new Date().toISOString() }
          : a
        )
      );
    } catch {
      alert('שגיאה בעדכון הסטטוס');
    } finally {
      setUpdating(null);
    }
  };

  const filtered = filter === 'all'
    ? applications
    : applications.filter(a => (a.status || '').toUpperCase() === filter.toUpperCase());

  const handleTailorCV = async (app) => {
    setTailoringJobId(app.jobId);
    try {
      const result = await tailorCVForJob(app.jobId);
      setApplications(prev => prev.map(a =>
        a.jobId === app.jobId
          ? { ...a, tailoredResumeUrl: result.tailoredResumeUrl, tailoredResume: result.tailoredResume }
          : a
      ));
    } catch {
      alert('שגיאה בהתאמת קורות החיים. ודא שיש קורות חיים פעילים בפרופיל.');
    } finally {
      setTailoringJobId(null);
    }
  };

  const downloadTailoredResume = (app) => {
    if (!app.tailoredResume) return;

    const fileName = `joboss-tailored-${app.company || 'company'}-${app.jobId || 'job'}.pdf`
      .replace(/[\\/:*?"<>|]/g, '-');
    const blob = buildSimplePdfBlob(app.tailoredResume);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Spinner text="טוען הגשות..." />
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', gap: '16px' }}>
      <p style={{ fontSize: '48px' }}>⚠️</p>
      <p style={{ fontSize: '18px', fontWeight: 700, color: '#F44336' }}>{error}</p>
      <button style={styles.retryBtn} onClick={loadApplications}>נסה שוב</button>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.content}>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' }}>
          <button style={styles.refreshBtn} onClick={loadApplications}>🔄 רענן</button>
        </div>

        <div style={styles.statsRow}>
          <div style={styles.stat}>
            <span style={styles.statNum}>{applications.length}</span>
            <span style={styles.statLabel}>סה"כ</span>
          </div>
          <div style={styles.stat}>
            <span style={{ ...styles.statNum, color: '#9C27B0' }}>
              {applications.filter(a => ['INTERVIEW', 'interview'].includes(a.status)).length}
            </span>
            <span style={styles.statLabel}>ראיונות</span>
          </div>
          <div style={styles.stat}>
            <span style={{ ...styles.statNum, color: '#4CAF50' }}>
              {applications.filter(a => ['ACCEPTED', 'accepted'].includes(a.status)).length}
            </span>
            <span style={styles.statLabel}>התקבלו</span>
          </div>
        </div>

        <div style={styles.filterRow}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              style={{ ...styles.filterBtn, ...(filter === f.key ? styles.filterActive : {}) }}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={styles.empty}>
            <p style={{ fontSize: '48px', margin: 0 }}>📋</p>
            <p style={styles.emptyTitle}>
              {filter === 'all' ? 'אין הגשות עדיין' : `אין הגשות בסטטוס "${FILTERS.find(f => f.key === filter)?.label}"`}
            </p>
            <p style={styles.emptySub}>החלק משרות כדי ליצור הגשות</p>
          </div>
        ) : (
          <div style={styles.list}>
            {filtered.map(app => {
              const cfg = STATUS_CONFIG[app.status] || { color: '#FFC107', label: 'ממתין' };
              const isUpdating = updating === app.jobId;
              return (
                <div key={app.jobId} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div style={styles.cardInfo}>
                      <p style={styles.company}>{app.company || app.jobId}</p>
                      <p style={styles.title}>{app.title || 'משרה'}</p>
                      <p style={styles.date}>
                        {app.createdAt ? new Date(app.createdAt).toLocaleDateString('he-IL') : ''}
                      </p>
                    </div>
                    <div style={{ ...styles.badge, background: cfg.color }}>
                      {cfg.label}
                    </div>
                  </div>

                  {tailoringJobs.has(app.jobId) && !app.tailoredResumeUrl && (
                    <div style={styles.tailoringBox}>
                      <span style={styles.tailoringSpinner}>⏳</span>
                      <div>
                        <p style={styles.tailoringTitle}>מתאים קורות חיים...</p>
                        <p style={styles.tailoringSub}>ה-AI עובד על זה, יעודכן אוטומטית</p>
                      </div>
                    </div>
                  )}

                  {!autoTailorCV && !app.tailoredResumeUrl && !tailoringJobs.has(app.jobId) && (
                    <button
                      type="button"
                      style={styles.manualTailorBtn}
                      disabled={tailoringJobId === app.jobId}
                      onClick={() => handleTailorCV(app)}
                    >
                      {tailoringJobId === app.jobId ? '⏳ מתאים...' : '🤖 התאמת קורות חיים למשרה'}
                    </button>
                  )}

                  {app.tailoredResumeUrl && (
                    <div style={styles.tailoredBox}>
                      <div>
                        <p style={styles.tailoredTitle}>קורות חיים מותאמים צורפו</p>
                        <p style={styles.tailoredSub}>
                          {app.tailoredResume
                            ? 'ניתן לצפות בטיוטה או להוריד אותה כקובץ.'
                            : 'הקובץ נשמר בענן. צפייה והורדה זמינות בהגשות חדשות.'}
                        </p>
                      </div>
                      {app.tailoredResume && (
                        <div style={styles.tailoredActions}>
                          <button
                            type="button"
                            style={styles.tailoredButton}
                            onClick={() => setPreviewApplication(app)}
                          >
                            צפייה
                          </button>
                          <button
                            type="button"
                            style={styles.tailoredButton}
                            onClick={() => downloadTailoredResume(app)}
                          >
                            הורדה
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={styles.actions}>
                    {STATUS_ACTIONS.map(s => (
                      <button
                        key={s}
                        disabled={isUpdating || app.status === s}
                        style={{
                          ...styles.actionBtn,
                          ...(app.status === s ? styles.actionActive : {}),
                          borderColor: STATUS_CONFIG[s]?.color || '#ccc',
                          color: app.status === s ? 'white' : STATUS_CONFIG[s]?.color || '#ccc',
                          background: app.status === s ? STATUS_CONFIG[s]?.color || '#ccc' : 'white',
                        }}
                        onClick={() => handleStatusChange(app.jobId, s)}
                      >
                        {isUpdating && app.status !== s ? '...' : STATUS_CONFIG[s]?.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewApplication && (
        <div style={styles.previewOverlay} onClick={() => setPreviewApplication(null)}>
          <div style={styles.previewModal} onClick={(event) => event.stopPropagation()}>
            <div style={styles.previewHeader}>
              <div>
                <p style={styles.previewTitle}>קורות חיים מותאמים</p>
                <p style={styles.previewSub}>
                  {previewApplication.company} · {previewApplication.title}
                </p>
              </div>
              <button
                type="button"
                style={styles.closePreview}
                onClick={() => setPreviewApplication(null)}
              >
                סגור
              </button>
            </div>
            <pre style={styles.previewText}>{previewApplication.tailoredResume}</pre>
            <button
              type="button"
              style={styles.downloadPreview}
              onClick={() => downloadTailoredResume(previewApplication)}
            >
              הורדה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const buildSimplePdfBlob = (text) => {
  const escapePdfText = (value) => value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

  const wrapLine = (line, maxChars = 82) => {
    const words = line.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    words.forEach((word) => {
      if ((current + ' ' + word).trim().length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = `${current} ${word}`.trim();
      }
    });

    if (current) lines.push(current);
    return lines.length ? lines : [''];
  };

  const lines = text
    .split('\n')
    .flatMap((line) => wrapLine(line))
    .slice(0, 52);

  const content = [
    'BT',
    '/F1 11 Tf',
    '50 790 Td',
    '14 TL',
    ...lines.flatMap((line, index) => [
      ...(index > 0 ? ['T*'] : []),
      `(${escapePdfText(line)}) Tj`,
    ]),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];

  objects.forEach((obj, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
};

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)' },
  content: { padding: '16px', maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' },
  statsRow: { display: 'flex', gap: '12px', justifyContent: 'center' },
  stat: { background: 'white', borderRadius: '16px', padding: '16px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  statNum: { fontSize: '28px', fontWeight: 800, color: '#6C4FD4' },
  statLabel: { fontSize: '12px', color: '#777' },
  filterRow: { display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' },
  filterBtn: { flexShrink: 0, padding: '8px 16px', borderRadius: '20px', border: '1.5px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#666', whiteSpace: 'nowrap' },
  filterActive: { background: '#6C4FD4', borderColor: '#6C4FD4', color: 'white' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: { background: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '12px' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 },
  company: { fontSize: '16px', fontWeight: 700, margin: 0, color: '#1E2A4A' },
  title: { fontSize: '13px', color: '#6C4FD4', fontWeight: 600, margin: 0 },
  date: { fontSize: '11px', color: '#bbb', margin: 0 },
  badge: { padding: '4px 12px', borderRadius: '20px', color: 'white', fontSize: '12px', fontWeight: 700, flexShrink: 0 },
  tailoredBox: { background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', direction: 'rtl' },
  tailoredTitle: { margin: 0, fontSize: '12px', fontWeight: 800, color: '#166534' },
  tailoredSub: { margin: '4px 0 0', fontSize: '11px', color: '#15803D' },
  tailoredActions: { display: 'flex', gap: '8px', flexShrink: 0 },
  tailoredButton: { border: '1px solid #86EFAC', borderRadius: '999px', background: 'white', color: '#166534', padding: '7px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' },
  tailoringBox: { background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: '12px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' },
  tailoringSpinner: { fontSize: '20px', animation: 'spin 1.5s linear infinite' },
  tailoringTitle: { margin: 0, fontSize: '13px', fontWeight: 700, color: '#F57F17' },
  tailoringSub: { margin: '2px 0 0', fontSize: '11px', color: '#F9A825' },
  manualTailorBtn: { width: '100%', padding: '10px', borderRadius: '12px', border: '1.5px dashed #6C4FD4', background: '#F8F6FF', color: '#6C4FD4', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
  actions: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  actionBtn: { padding: '5px 10px', borderRadius: '20px', border: '1.5px solid', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' },
  actionActive: {},
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '48px 24px', background: 'white', borderRadius: '16px', textAlign: 'center' },
  emptyTitle: { fontSize: '18px', fontWeight: 700, margin: 0 },
  emptySub: { fontSize: '14px', color: '#777', margin: 0 },
  retryBtn: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '12px 24px', cursor: 'pointer', fontWeight: 700 },
  refreshBtn: { background: 'white', border: '1.5px solid #ddd', borderRadius: '20px', padding: '6px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#555' },
  previewOverlay: { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 },
  previewModal: { width: 'min(760px, 96vw)', maxHeight: '86vh', background: 'white', borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 24px 80px rgba(15, 23, 42, 0.25)', direction: 'rtl' },
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' },
  previewTitle: { margin: 0, fontSize: '18px', fontWeight: 800, color: '#1E2A4A' },
  previewSub: { margin: '4px 0 0', fontSize: '13px', color: '#6C4FD4', fontWeight: 700 },
  closePreview: { border: '1px solid #E5E7EB', borderRadius: '999px', background: 'white', padding: '8px 12px', cursor: 'pointer', fontWeight: 800 },
  previewText: { margin: 0, padding: '16px', background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: 1.65, color: '#111827', direction: 'ltr', textAlign: 'left' },
  downloadPreview: { alignSelf: 'flex-start', border: 'none', borderRadius: '999px', background: '#166534', color: 'white', padding: '10px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' },
};

export default ApplicationsPage;
