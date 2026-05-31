import React, { useState, useEffect, useRef } from 'react';
import { getMyApplications, updateApplication, tailorCVForJob, getSubscription } from '../api';
import LimitModal from '../components/LimitModal';
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

const CONTACT_PATTERNS = {
  phone: /^\+?\d[\d\s\-()]{5,}/,
  email: /@\w+\.\w+/,
  location: /^[A-Za-z-￿].*,\s*[A-Za-z-￿]/,
};

function contactIcon(line) {
  const t = line.trim();
  if (CONTACT_PATTERNS.phone.test(t)) return '📞';
  if (CONTACT_PATTERNS.email.test(t)) return '✉️';
  if (CONTACT_PATTERNS.location.test(t)) return '📍';
  return null;
}

function CVRenderer({ text }) {
  const lines = (text || '').split('\n');
  const elements = [];
  let bulletBuffer = [];
  let contactBuffer = [];

  const flushBullets = (key) => {
    if (!bulletBuffer.length) return;
    elements.push(
      <ul key={`ul-${key}`} style={{ margin: '4px 0 8px 16px', padding: 0 }}>
        {bulletBuffer.map((b, bi) => (
          <li key={bi} style={{ fontSize: '13px', color: '#374151', lineHeight: 1.65, marginBottom: '2px' }}>
            {/github\.com/i.test(b)
              ? <span>🔗 <a href={b.trim().startsWith('http') ? b.trim() : `https://${b.trim()}`} target="_blank" rel="noreferrer" style={{ color: '#6C4FD4' }}>{b.trim()}</a></span>
              : b}
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  const flushContact = (key) => {
    if (!contactBuffer.length) return;
    elements.push(
      <div key={`contact-${key}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '13px', color: '#555', margin: '4px 0 10px' }}>
        {contactBuffer.map((c, ci) => {
          const icon = contactIcon(c);
          return <span key={ci}>{icon ? `${icon} ` : ''}{c.trim()}</span>;
        })}
      </div>
    );
    contactBuffer = [];
  };

  const SECTION_KEYWORDS = /^(SUMMARY|EDUCATION|EXPERIENCE|PROJECTS|SKILLS|TECHNICAL|PROFESSIONAL|CONTACT|OBJECTIVE)/i;

  lines.forEach((line, i) => {
    if (line.trim() === '---') { flushBullets(i); flushContact(i); return; }

    if (line.startsWith('# ')) {
      flushBullets(i); flushContact(i);
      elements.push(<h1 key={i} style={{ fontSize: '26px', fontWeight: 900, color: '#1E2A4A', margin: '0 0 2px', letterSpacing: '1px' }}>{line.slice(2)}</h1>);

    } else if (line.startsWith('## ')) {
      flushBullets(i); flushContact(i);
      const title = line.slice(3).trim();
      if (SECTION_KEYWORDS.test(title)) {
        elements.push(
          <div key={i} style={{ marginTop: '16px', marginBottom: '5px', borderBottom: '2px solid #6C4FD4', paddingBottom: '2px' }}>
            <h2 style={{ fontSize: '12px', fontWeight: 800, color: '#1E2A4A', margin: 0, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{title}</h2>
          </div>
        );
      } else {
        elements.push(<p key={i} style={{ fontSize: '14px', fontStyle: 'italic', color: '#555', margin: '2px 0 6px' }}>{title}</p>);
      }

    } else if (line.startsWith('- ')) {
      flushContact(i);
      bulletBuffer.push(line.slice(2));

    } else if (line.trim() === '') {
      flushBullets(i); flushContact(i);

    } else if (contactIcon(line.trim())) {
      flushBullets(i);
      contactBuffer.push(line.trim());

    } else if (/^\*\*[^*]+:?\*\*:?\s+\S/.test(line)) {
      flushBullets(i); flushContact(i);
      const m = line.match(/^\*\*([^*]+?)[:,]?\*\*:?\s*(.*)/);
      if (m) {
        const label = m[1].replace(/:$/, '');
        elements.push(<p key={i} style={{ fontSize: '13px', margin: '3px 0', color: '#374151' }}><strong style={{ color: '#1E2A4A' }}>{label}:</strong> {m[2]}</p>);
      }

    } else if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      flushBullets(i); flushContact(i);
      elements.push(<p key={i} style={{ fontWeight: 700, fontSize: '14px', color: '#1E2A4A', margin: '8px 0 1px' }}>{line.replace(/\*\*/g, '')}</p>);

    } else {
      flushBullets(i); flushContact(i);
      elements.push(<p key={i} style={{ fontSize: '13px', color: '#374151', margin: '2px 0', lineHeight: 1.65 }}>{line}</p>);
    }
  });
  flushBullets('end'); flushContact('end');

  return <div style={{ fontFamily: 'Arial, sans-serif', direction: 'ltr', textAlign: 'left' }}>{elements}</div>;
}

function buildCVHtml(text) {
  const lines = (text || '').split('\n');
  let html = '';
  let inList = false;
  let contactBuf = [];
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const SECTION_KW = /^(SUMMARY|EDUCATION|EXPERIENCE|PROJECTS|SKILLS|TECHNICAL|PROFESSIONAL|CONTACT|OBJECTIVE)/i;
  const isContact = t => /^\+?\d[\d\s\-()]{5,}/.test(t) || /@\w+\.\w+/.test(t) || (/^[A-Za-z][^,]{1,20},\s*[A-Za-z]/.test(t) && t.length < 50);
  const contactEmoji = t => /@/.test(t) ? '✉️' : /^\+?\d/.test(t) ? '📞' : '📍';

  const flushContact = () => {
    if (!contactBuf.length) return;
    const parts = contactBuf.flatMap(c => /\|/.test(c) ? c.split('|').map(p => p.trim()).filter(Boolean) : [c]);
    html += `<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:11.5px;color:#555;margin:3px 0 8px;">${parts.map(c => `<span>${contactEmoji(c)} ${esc(c)}</span>`).join('')}</div>`;
    contactBuf = [];
  };

  lines.forEach(line => {
    if (line.trim() === '---') { if (inList) { html += '</ul>'; inList = false; } flushContact(); return; }
    if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      html += `<h1 style="font-size:22px;font-weight:900;color:#1E2A4A;margin:0 0 2px;letter-spacing:0.5px;">${esc(line.slice(2))}</h1>`;
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      const title = line.slice(3).trim();
      if (SECTION_KW.test(title)) {
        html += `<div style="margin-top:12px;margin-bottom:4px;border-bottom:1.5px solid #6C4FD4;padding-bottom:2px;"><h2 style="font-size:9.5px;font-weight:800;color:#1E2A4A;margin:0;letter-spacing:1.5px;text-transform:uppercase;">${esc(title)}</h2></div>`;
      } else {
        html += `<p style="font-size:12px;font-style:italic;color:#555;margin:2px 0 3px;">${esc(title)}</p>`;
      }
    } else if (line.startsWith('- ')) {
      if (!inList) { html += '<ul style="margin:3px 0 5px 14px;padding:0;">'; inList = true; }
      const content = line.slice(2);
      const m = content.match(/^\*\*([^*]+?)[:,]?\*\*:?\s*(.*)/);
      if (m) {
        const label = m[1].replace(/:$/, '');
        html += `<li style="font-size:11px;color:#374151;line-height:1.45;margin-bottom:1px;"><strong style="color:#1E2A4A;">${esc(label)}:</strong> ${esc(m[2])}</li>`;
      } else if (/github\.com/.test(content)) {
        html += `<li style="font-size:11px;color:#374151;line-height:1.45;">🔗 <a href="${esc(content.trim())}" style="color:#6C4FD4;">${esc(content.trim())}</a></li>`;
      } else {
        html += `<li style="font-size:11px;color:#374151;line-height:1.45;margin-bottom:1px;">${esc(content)}</li>`;
      }
    } else if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
    } else if (isContact(line.trim())) {
      if (inList) { html += '</ul>'; inList = false; }
      contactBuf.push(line.trim());
    } else if (/^\*\*[^*]+:?\*\*:?\s+\S/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      const m = line.match(/^\*\*([^*]+?)[:,]?\*\*:?\s*(.*)/);
      if (m) html += `<p style="font-size:11px;margin:2px 0;color:#374151;"><strong style="color:#1E2A4A;">${esc(m[1].replace(/:$/,''))}:</strong> ${esc(m[2])}</p>`;
    } else if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      html += `<p style="font-weight:700;font-size:12.5px;color:#1E2A4A;margin:6px 0 1px;">${esc(line.replace(/\*\*/g,''))}</p>`;
    } else if (line.trim()) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      html += `<p style="font-size:11px;color:#374151;margin:2px 0;line-height:1.45;">${esc(line)}</p>`;
    }
  });
  if (inList) html += '</ul>'; flushContact();
  return html;
}

async function downloadCVAsPdf(text, company, jobTitle) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const m = 38;
  const maxW = W - m * 2;
  const lh = 12.5;
  let y = m;

  const newPage = () => { doc.addPage(); y = m; };
  const chk = (n = lh) => { if (y + n > H - m) newPage(); };
  const txt = (s, x, size, bold, r, g, b) => {
    doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(r, g, b);
    const lines = doc.splitTextToSize(String(s), maxW - (x - m));
    lines.forEach(l => { chk(); doc.text(l, x, y); y += lh; });
  };

  const SECTION = /^(SUMMARY|EDUCATION|EXPERIENCE|PROJECTS|SKILLS|TECHNICAL|PROFESSIONAL|CONTACT|OBJECTIVE)/i;
  const isContact = t => /^\+?\d[\d\s\-()]{5,}/.test(t) || /@\w+/.test(t) || (/^[A-Za-z][^,]{1,20},\s*[A-Za-z]/.test(t) && t.length < 50);
  const lines = (text || '').split('\n');
  let cBuf = [];

  const flushC = () => {
    if (!cBuf.length) return;
    const parts = cBuf.flatMap(c => /\|/.test(c) ? c.split('|').map(p => p.trim()).filter(Boolean) : [c]);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 90, 90);
    chk(12);
    doc.text(parts.join('  ·  '), m, y); y += 14;
    cBuf = [];
  };

  lines.forEach(line => {
    if (line.trim() === '---') { flushC(); return; }
    if (line.startsWith('# ')) {
      flushC(); chk(24);
      doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 42, 74);
      doc.text(line.slice(2), m, y); y += 20;
    } else if (line.startsWith('## ')) {
      flushC();
      const t = line.slice(3).trim();
      if (SECTION.test(t)) {
        chk(16); y += 5;
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 42, 74);
        doc.text(t.toUpperCase(), m, y);
        doc.setDrawColor(108, 79, 212); doc.setLineWidth(1.1);
        doc.line(m, y + 2, W - m, y + 2); y += 11;
      } else {
        chk(); doc.setFontSize(11.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 90, 90);
        doc.text(t, m, y); y += lh;
      }
    } else if (line.startsWith('- ')) {
      flushC();
      const content = line.slice(2);
      const bold = content.match(/^\*\*([^*]+?)[:,]?\*\*:?\s*(.*)/);
      if (bold) {
        const label = bold[1].replace(/:$/, '') + ': ';
        chk();
        doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
        doc.text('•', m + 3, y);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 42, 74);
        const lw = doc.getTextWidth(label);
        doc.text(label, m + 11, y);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
        const rest = doc.splitTextToSize(bold[2], maxW - 11 - lw);
        doc.text(rest[0] || '', m + 11 + lw, y); y += lh;
        rest.slice(1).forEach(r => { chk(); doc.text(r, m + 11 + lw, y); y += lh; });
      } else {
        chk(); doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
        doc.text('•', m + 3, y);
        const rest = doc.splitTextToSize(content, maxW - 11);
        rest.forEach((r, i) => { if (i > 0) chk(); doc.text(r, m + 11, y); y += lh; });
      }
    } else if (line.trim() === '') {
      flushC(); y += 1;
    } else if (isContact(line.trim())) {
      cBuf.push(line.trim());
    } else if (/^\*\*[^*]+:?\*\*:?\s+\S/.test(line)) {
      flushC();
      const mo = line.match(/^\*\*([^*]+?)[:,]?\*\*:?\s*(.*)/);
      if (mo) {
        const label = mo[1].replace(/:$/, '') + ': ';
        chk(); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 42, 74);
        const lw = doc.getTextWidth(label);
        doc.text(label, m, y);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
        const rest = doc.splitTextToSize(mo[2], maxW - lw);
        doc.text(rest[0] || '', m + lw, y); y += lh;
        rest.slice(1).forEach(r => { chk(); doc.text(r, m + lw, y); y += lh; });
      }
    } else if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      flushC(); chk();
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 42, 74);
      doc.text(line.replace(/\*\*/g, ''), m, y); y += lh;
    } else if (line.trim()) {
      flushC(); chk();
      doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
      const rest = doc.splitTextToSize(line, maxW);
      rest.forEach(r => { chk(); doc.text(r, m, y); y += lh; });
    }
  });
  flushC();

  doc.save(`CV-${company}-${jobTitle}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
}

function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [previewApplication, setPreviewApplication] = useState(null);
  const [tailoringJobId, setTailoringJobId] = useState(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const [clearedTailoring, setClearedTailoring] = useState(new Set());
  const [planKey, setPlanKey] = useState('FREE');
  const cvPreviewRef = useRef(null);
  const autoTailorCV = localStorage.getItem('autoTailorCV') === 'true';
  const canTailorCV = planKey !== 'FREE';
  const [tailoringJobs, setTailoringJobs] = useState(() => {
    const pending = JSON.parse(localStorage.getItem('tailoringPending') || '{}');
    return new Set(Object.keys(pending));
  });

  useEffect(() => {
    loadApplications();
    getSubscription()
      .then(sub => setPlanKey(sub?.planKey || 'FREE'))
      .catch(() => setPlanKey('FREE'));
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
                      style={canTailorCV ? styles.manualTailorBtn : styles.manualTailorBtnLocked}
                      disabled={tailoringJobId === app.jobId}
                      onClick={() => canTailorCV ? handleTailorCV(app) : setShowUpsell(true)}
                    >
                      {tailoringJobId === app.jobId ? '⏳ מתאים...' : canTailorCV ? '🤖 התאמת קורות חיים למשרה' : '🔒 התאמת קורות חיים — פרימיום בלבד'}
                    </button>
                  )}

                  {app.tailoredResumeUrl && !clearedTailoring.has(app.jobId) && (
                    <div style={styles.tailoredBox}>
                      <div style={{ flex: 1 }}>
                        <p style={styles.tailoredTitle}>קורות חיים מותאמים צורפו</p>
                        <p style={styles.tailoredSub}>
                          {app.tailoredResume ? 'ניתן לצפות בטיוטה או להוריד אותה כקובץ.' : 'הקובץ נשמר בענן.'}
                        </p>
                      </div>
                      <div style={styles.tailoredActions}>
                        {app.tailoredResume && (<>
                          <button type="button" style={styles.tailoredButton} onClick={() => setPreviewApplication(app)}>צפייה</button>
                          <button type="button" style={styles.tailoredButton} onClick={() => downloadCVAsPdf(app.tailoredResume, app.company, app.title)}>🖨️ PDF</button>
                        </>)}
                        <button
                          type="button"
                          title="בטל התאמה"
                          style={{ ...styles.tailoredButton, color: '#aaa', borderColor: '#ddd', padding: '7px 10px' }}
                          onClick={() => setClearedTailoring(prev => new Set([...prev, app.jobId]))}
                        >✕</button>
                      </div>
                    </div>
                  )}

                  {app.tailoredResumeUrl && clearedTailoring.has(app.jobId) && (
                    canTailorCV ? (
                      <button type="button" style={styles.manualTailorBtn} disabled={tailoringJobId === app.jobId} onClick={() => handleTailorCV(app)}>
                        {tailoringJobId === app.jobId ? '⏳ מתאים...' : '🔄 התאמת קורות חיים מחדש'}
                      </button>
                    ) : (
                      <button type="button" style={styles.manualTailorBtnLocked} onClick={() => setShowUpsell(true)}>
                        🔒 התאמת קורות חיים — פרימיום בלבד
                      </button>
                    )
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

      <LimitModal visible={showUpsell} mode="tailor" onClose={() => setShowUpsell(false)} />

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
            <div style={styles.previewText} ref={cvPreviewRef}>
              <CVRenderer text={previewApplication.tailoredResume} />
            </div>
            <button
              type="button"
              style={styles.downloadPreview}
              onClick={() => downloadCVAsPdf(previewApplication.tailoredResume, previewApplication.company, previewApplication.title)}
            >
              🖨️ הורד כ-PDF
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
  manualTailorBtnLocked: { width: '100%', padding: '10px', borderRadius: '12px', border: '1.5px dashed #ccc', background: '#F5F5F5', color: '#999', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
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
