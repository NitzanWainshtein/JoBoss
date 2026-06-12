import React, { useState, useEffect } from 'react';
import ICON_SIZES from '../iconSizes';
import { CompanyLogo } from '../utils/companyLogos';
import { getMyApplications, updateApplication, tailorCVForJob, getSubscription, clearApplicationTailoring, explainFailure, deleteApplications, getMyProfile } from '../api';
import LimitModal from '../components/LimitModal';
import MismatchWarningModal from '../components/MismatchWarningModal';
import Spinner from '../components/Spinner';

// ── Track B: user-set funnel status ──────────────────────────────────────────
const STATUS_CONFIG = {
  SUBMITTED: { color: '#FF9800', label: 'ממתין להגשה' },
  REVIEWED:  { color: '#2196F3', label: 'הוגש' },
  INTERVIEW: { color: '#9C27B0', label: 'בתהליך' },
  ACCEPTED:  { color: '#4CAF50', label: 'התקבלת' },
  REJECTED:  { color: '#F44336', label: 'נדחה' },
};

// ── Track A: system-set auto-apply result ────────────────────────────────────
const AUTO_APPLY_CONFIG = {
  manual:           { color: '#FF9800', label: 'יש להגיש ידנית',          bg: '#FFF8E1', border: '#FFE082', text: '#B45309' },
  pending_tailoring:{ color: '#7C3AED', label: 'מתאים קורות חיים...',      bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
  pending:          { color: '#7C3AED', label: 'הגשה אוטומטית בתהליך',    bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
  success:          { color: '#4CAF50', label: 'הוגש אוטומטית בהצלחה',    bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  failed:           { color: '#FF9800', label: 'נכשלה הגשה אוטומטית',     bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
};

// Level-1 primary tabs (always visible).
const PRIMARY_TABS = [
  { key: 'all',     label: 'הכל' },
  { key: 'pending', label: 'ממתין להגשה' },
  { key: 'success', label: 'הוגש בהצלחה' },
  { key: 'candidacy', label: 'סטטוס מועמדות' },
];

// Level-2 sub-tabs (only under "סטטוס מועמדות"). null = all candidacy statuses.
const CANDIDACY_STATUSES = ['REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];
const SUB_TABS = [
  { key: 'REVIEWED', label: 'הוגש' },
  { key: 'INTERVIEW', label: 'בתהליך' },
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
  if (t.length < 55 && CONTACT_PATTERNS.location.test(t)) return '📍';
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
    const parts = contactBuffer.flatMap(c =>
      c.includes('·') ? c.split('·').map(p => p.trim()).filter(Boolean) : [c]
    );
    elements.push(
      <div key={`contact-${key}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '13px', color: '#555', margin: '4px 0 10px' }}>
        {parts.map((c, ci) => {
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
    const parts = contactBuf.flatMap(c =>
      /[·|]/.test(c) ? c.split(/[·|]/).map(p => p.trim()).filter(Boolean) : [c]
    );
    html += `<div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:#555;margin:4px 0 10px;">${parts.map(c => `<span>${contactEmoji(c)} ${esc(c)}</span>`).join('')}</div>`;
    contactBuf = [];
  };

  lines.forEach(line => {
    if (line.trim() === '---') { if (inList) { html += '</ul>'; inList = false; } flushContact(); return; }
    if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      html += `<h1 style="font-size:26px;font-weight:900;color:#1E2A4A;margin:0 0 2px;letter-spacing:1px;">${esc(line.slice(2))}</h1>`;
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      const title = line.slice(3).trim();
      if (SECTION_KW.test(title)) {
        html += `<div style="margin-top:16px;margin-bottom:5px;border-bottom:2px solid #6C4FD4;padding-bottom:2px;"><h2 style="font-size:12px;font-weight:800;color:#1E2A4A;margin:0;letter-spacing:1.5px;text-transform:uppercase;">${esc(title)}</h2></div>`;
      } else {
        html += `<p style="font-size:14px;font-style:italic;color:#555;margin:2px 0 6px;">${esc(title)}</p>`;
      }
    } else if (line.startsWith('- ')) {
      flushContact();
      if (!inList) { html += '<ul style="margin:4px 0 8px 16px;padding:0;">'; inList = true; }
      const content = line.slice(2);
      const m = content.match(/^\*\*([^*]+?)[:,]?\*\*:?\s*(.*)/);
      if (m) {
        const label = m[1].replace(/:$/, '');
        html += `<li style="font-size:13px;color:#374151;line-height:1.65;margin-bottom:2px;"><strong style="color:#1E2A4A;">${esc(label)}:</strong> ${esc(m[2])}</li>`;
      } else if (/github\.com/i.test(content)) {
        const url = content.trim().startsWith('http') ? content.trim() : `https://${content.trim()}`;
        html += `<li style="font-size:13px;color:#374151;line-height:1.65;">🔗 <a href="${esc(url)}" style="color:#6C4FD4;">${esc(content.trim())}</a></li>`;
      } else {
        html += `<li style="font-size:13px;color:#374151;line-height:1.65;margin-bottom:2px;">${esc(content)}</li>`;
      }
    } else if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
    } else if (isContact(line.trim())) {
      if (inList) { html += '</ul>'; inList = false; }
      contactBuf.push(line.trim());
    } else if (/^\*\*[^*]+:?\*\*:?\s+\S/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      const m = line.match(/^\*\*([^*]+?)[:,]?\*\*:?\s*(.*)/);
      if (m) html += `<p style="font-size:13px;margin:3px 0;color:#374151;"><strong style="color:#1E2A4A;">${esc(m[1].replace(/:$/,''))}:</strong> ${esc(m[2])}</p>`;
    } else if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      html += `<p style="font-weight:700;font-size:14px;color:#1E2A4A;margin:8px 0 1px;">${esc(line.replace(/\*\*/g,''))}</p>`;
    } else if (line.trim()) {
      if (inList) { html += '</ul>'; inList = false; } flushContact();
      html += `<p style="font-size:13px;color:#374151;margin:2px 0;line-height:1.65;">${esc(line)}</p>`;
    }
  });
  if (inList) html += '</ul>'; flushContact();
  return html;
}

async function downloadCVAsPdf(text, company, jobTitle) {
  const html2pdf = (await import('html2pdf.js')).default;
  const fileName = `CV-${company || 'Company'}-${jobTitle || 'Job'}`.replace(/[\\/:*?"<>|]/g, '-');

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'width:210mm;padding:12mm 15mm;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;direction:ltr;text-align:left;background:#fff;';
  wrapper.innerHTML = buildCVHtml(text);

  await html2pdf()
    .set({
      margin: 0,
      filename: `${fileName}.pdf`,
      html2canvas: { scale: 2, useCORS: false, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css'] },
    })
    .from(wrapper)
    .save();
}

// ── Auto-apply result block (4 states: manual / pending / success / failed) ───
function AutoApplyResult({ app, planKey, canExplain, isActiveTailoring }) {
  const cfg = AUTO_APPLY_CONFIG[app.autoApplyStatus];
  const [explanation, setExplanation] = useState(app.failExplanation || null);
  const [loadingExp, setLoadingExp] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  if (!cfg) return null;

  // The manual-apply label is ALWAYS derived from the current plan — never from
  // any per-application field — so it's consistent across every card.
  const isPremium = planKey !== 'FREE';
  const manualLabel = isPremium ? 'הגש עם תוסף הכרום 🧩' : 'הגש ישירות באתר 🌐';
  const jobUrl = app.jobApplyUrl || app.applyUrl || app.jobUrl || '';
  const openJob = () => { if (jobUrl) window.open(jobUrl, '_blank', 'noopener'); };

  // ── manual: auto-apply was off for this job ────────────────────────────────
  if (app.autoApplyStatus === 'manual') {
    if (!isPremium) {
      return (
        <div style={{ ...styles.autoBoxCol, background: '#F5F5F5', borderColor: '#ccc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/icons/waiting_to_apply_icon.png" alt="" style={{ width: `${ICON_SIZES.manualBlock}px`, height: `${ICON_SIZES.manualBlock}px`, objectFit: 'contain' }} />
            <p style={{ ...styles.autoTitle, color: '#999', margin: 0 }}>הגשת משרה אוטומטית — פרימיום בלבד 🔒</p>
          </div>
          {jobUrl && (
            <button type="button" style={{ ...styles.failActionBtn, alignSelf: 'flex-start', marginTop: '10px' }} onClick={openJob}>{manualLabel}</button>
          )}
        </div>
      );
    }
    return (
      <div style={{ ...styles.autoBoxCol, background: cfg.bg, borderColor: cfg.border }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/icons/waiting_to_apply_icon.png" alt="" style={{ width: `${ICON_SIZES.manualBlock}px`, height: `${ICON_SIZES.manualBlock}px`, objectFit: 'contain' }} />
          <p style={{ ...styles.autoTitle, color: cfg.text, margin: 0 }}>{cfg.label}</p>
        </div>
        <p style={{ ...styles.autoSub, color: cfg.text, marginTop: '4px' }}>לא הופעלה הגשה אוטומטית למשרה זו</p>
        {jobUrl && (
          <button type="button" style={{ ...styles.failActionBtn, alignSelf: 'flex-start', marginTop: '10px' }} onClick={openJob}>{manualLabel}</button>
        )}
      </div>
    );
  }

  // ── pending_tailoring: AI tailoring in progress before Fargate launch ────────
  // isActiveTailoring is derived from the server record (pending_tailoring +
  // recent updatedAt); stale records simply don't render a spinner.
  if (app.autoApplyStatus === 'pending_tailoring') {
    if (app.tailoredResumeUrl) return null; // already completed
    if (!isActiveTailoring) return null;    // stale / not tracked locally
    return (
      <div style={{ ...styles.autoBox, background: cfg.bg, borderColor: cfg.border }}>
        <img src="/icons/robot_icon.png" alt="" style={{ width: `${ICON_SIZES.autoApplyBlock}px`, height: `${ICON_SIZES.autoApplyBlock}px`, objectFit: 'contain' }} />
        <div>
          <p style={{ ...styles.autoTitle, color: cfg.text }}>{cfg.label}</p>
          <p style={{ ...styles.autoSub, color: cfg.text }}>ה-AI מתאים את קורות החיים למשרה לפני ההגשה</p>
        </div>
      </div>
    );
  }

  // ── pending: Fargate is running ────────────────────────────────────────────
  if (app.autoApplyStatus === 'pending') {
    return (
      <div style={{ ...styles.autoBox, background: cfg.bg, borderColor: cfg.border }}>
        <img src="/icons/process_icon.png" alt="" style={{ width: `${ICON_SIZES.autoApplyBlock}px`, height: `${ICON_SIZES.autoApplyBlock}px`, objectFit: 'contain' }} />
        <div>
          <p style={{ ...styles.autoTitle, color: cfg.text }}>{cfg.label}</p>
          <p style={{ ...styles.autoSub, color: cfg.text }}>הבוט מגיש את המשרה עבורך — יעודכן אוטומטית</p>
        </div>
      </div>
    );
  }

  // ── success: submitted ─────────────────────────────────────────────────────
  if (app.autoApplyStatus === 'success') {
    return (
      <div style={{ ...styles.autoBox, background: cfg.bg, borderColor: cfg.border }}>
        <img src="/icons/accepted_icon.png" alt="" style={{ width: `${ICON_SIZES.autoApplyBlock}px`, height: `${ICON_SIZES.autoApplyBlock}px`, objectFit: 'contain' }} />
        <div>
          <p style={{ ...styles.autoTitle, color: cfg.text }}>{cfg.label}</p>
          <p style={{ ...styles.autoSub, color: cfg.text }}>
            {app.updatedAt ? `הוגש ב-${new Date(app.updatedAt).toLocaleDateString('he-IL')}` : 'ההגשה בוצעה'}
          </p>
        </div>
      </div>
    );
  }

  // ── failed: compact title + [פירוט] [manual apply], collapsible explanation ─
  const toggleDetail = () => {
    const next = !showDetail;
    setShowDetail(next);
    // Lazy-load the Bedrock explanation the first time the panel is opened.
    if (next && !explanation && !loadingExp && canExplain) {
      setLoadingExp(true);
      explainFailure(app.jobId)
        .then(res => { if (res?.explanation) setExplanation(res.explanation); })
        .catch(() => {})
        .finally(() => setLoadingExp(false));
    }
  };

  return (
    <div style={{ ...styles.autoBoxCol, background: cfg.bg, borderColor: cfg.border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img src="/icons/waiting_to_apply_icon.png" alt="" style={{ width: `${ICON_SIZES.manualBlock}px`, height: `${ICON_SIZES.manualBlock}px`, objectFit: 'contain' }} />
        <p style={{ ...styles.autoTitle, color: cfg.text }}>לא ניתן היה להגיש אוטומטית למשרה זו</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button
          type="button"
          style={{ ...styles.detailBtn, color: cfg.text, borderColor: cfg.border }}
          onClick={toggleDetail}
        >
          פירוט 🔍 {showDetail ? '▲' : '▼'}
        </button>
        {jobUrl && (
          <button type="button" style={styles.failActionBtn} onClick={openJob}>
            {manualLabel}
          </button>
        )}
      </div>

      {/* Collapsible explanation panel — animates via max-height. */}
      <div style={{ ...styles.detailPanel, maxHeight: showDetail ? '400px' : '0', opacity: showDetail ? 1 : 0 }}>
        <div style={styles.detailInner}>
          {loadingExp ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={styles.tailoringSpinner}>⏳</span>
              <p style={{ ...styles.autoSub, color: cfg.text }}>🤖 מנתח את סיבת הכישלון...</p>
            </div>
          ) : explanation ? (
            <>
              {explanation.title && (
                <p style={{ ...styles.autoTitle, color: cfg.text }}>{explanation.title}</p>
              )}
              <p style={{ ...styles.autoSub, color: cfg.text, lineHeight: 1.65, marginTop: '4px' }}>
                {explanation.summary}
              </p>
            </>
          ) : (
            <p style={{ ...styles.autoSub, color: cfg.text }}>
              {canExplain ? 'אין פירוט זמין כרגע.' : 'פירוט סיבת הכישלון זמין למנויי פרימיום.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Confirm delete modal ──────────────────────────────────────────────────────
function ConfirmDeleteModal({ count, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '28px 24px', width: 'min(340px, 95vw)', display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
          <span style={{ fontSize: '40px' }}>🗑</span>
          <p style={{ fontSize: '17px', fontWeight: 800, color: '#1E2A4A', margin: 0 }}>מחיקת הגשות</p>
          <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
            האם למחוק <strong>{count}</strong> {count === 1 ? 'הגשה' : 'הגשות'} לצמיתות?<br />
            <span style={{ fontSize: '12px', color: '#F44336' }}>לא ניתן לשחזר פעולה זו</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#F44336', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
            onClick={onConfirm}
          >
            מחק
          </button>
          <button
            style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1.5px solid #e0e0e0', background: 'white', color: '#555', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
            onClick={onCancel}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Panel tab ─────────────────────────────────────────────────────────────────
function PanelTab({ applications, planKey, userName }) {
  const total        = applications.length;
  const manualPending = applications.filter(a => a.autoApplyStatus === 'manual').length;
  const inProgress   = applications.filter(a => a.autoApplyStatus === 'pending' || a.autoApplyStatus === 'pending_tailoring').length;
  const autoSuccess  = applications.filter(a => a.autoApplyStatus === 'success').length;
  const failed       = applications.filter(a => a.autoApplyStatus === 'failed').length;
  const reviewed     = applications.filter(a => a.status === 'REVIEWED').length;
  const interviews   = applications.filter(a => a.status === 'INTERVIEW').length;
  const accepted     = applications.filter(a => a.status === 'ACCEPTED').length;
  const rejected     = applications.filter(a => a.status === 'REJECTED').length;

  const interviewRate = total > 0 ? Math.round((interviews / total) * 100) : 0;
  const recent = [...applications].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6);

  const StatCard = ({ icon, value, label, color, bg }) => (
    <div style={{ background: bg || '#F8F6FF', borderRadius: '14px', padding: '14px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: '1 1 calc(33% - 6px)', minWidth: '85px' }}>
      <img src={icon} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
      <span style={{ fontSize: '22px', fontWeight: 900, color: color || '#6C4FD4', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '10px', color: '#888', fontWeight: 600, textAlign: 'center' }}>{label}</span>
    </div>
  );


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Hero card */}
      <div style={{ background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', borderRadius: '18px', padding: '18px 20px', color: 'white', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, opacity: 0.85, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <img src="/icons/panel_icons/wave_icon.png" alt="" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
            שלום, {userName ? userName.split(' ')[0] : ''}!
          </p>
          <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>
            הפאנל שלך
          </p>
        </div>
        <div style={{ width: '52px', height: '52px', borderRadius: '14px', overflow: 'hidden', background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src="/icons/panel_icons/male_profile.png" alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <StatCard icon="/icons/panel_icons/waiting_for_apply_icon.png" value={manualPending} label="ממתין להגשה ידנית" color="#E65100" bg="#FFF8F0" />
        <StatCard icon="/icons/panel_icons/inproccess_icon.png"        value={inProgress}    label="בתהליך הגשה"      color="#7C3AED" bg="#F5F3FF" />
        <StatCard icon="/icons/panel_icons/auto_applied_icon.png"      value={autoSuccess}   label="הוגש אוטומטית"    color="#166534" bg="#F0FDF4" />
        <StatCard icon="/icons/panel_icons/viewd_icon.png"             value={reviewed}      label="נסקר"             color="#1565C0" bg="#EFF6FF" />
        <StatCard icon="/icons/panel_icons/interviews_icon.png"        value={interviews}    label="ראיונות"          color="#9C27B0" bg="#FDF4FF" />
        <StatCard icon="/icons/panel_icons/approved_icon.png"          value={accepted}      label="התקבלת"           color="#2E7D32" bg="#F0FDF4" />
      </div>


      {/* Recent applications */}
      {recent.length > 0 && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', direction: 'rtl', boxShadow: '0 1px 5px rgba(0,0,0,0.07)' }}>
          <p style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#1E2A4A' }}>הגשות אחרונות</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recent.map(app => {
              const isPendingManual = app.autoApplyStatus === 'manual';
              const badgeCfg = isPendingManual
                ? { label: 'ממתין להגשה', color: '#FF9800' }
                : (STATUS_CONFIG[app.status] || { label: 'הוגש', color: '#FFC107' });
              return (
                <div key={app.jobId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F5F5F5' }}>
                  <CompanyLogo company={app.company} style={{ width: '36px', height: '36px', borderRadius: '9px', objectFit: 'contain', border: '1px solid #eee', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1E2A4A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.company}</p>
                    <p style={{ margin: 0, fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.title}</p>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: badgeCfg.color, background: `${badgeCfg.color}18`, padding: '3px 8px', borderRadius: '20px', flexShrink: 0 }}>
                    {badgeCfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {total === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '40px 24px', background: 'white', borderRadius: '14px', textAlign: 'center' }}>
          <p style={{ fontSize: '48px', margin: 0 }}>📊</p>
          <p style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>אין נתונים עדיין</p>
          <p style={{ fontSize: '14px', color: '#777', margin: 0 }}>החלק משרות כדי לראות סטטיסטיקות</p>
        </div>
      )}
    </div>
  );
}

function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [pageTab, setPageTab] = useState('my-applications');
  const [primaryTab, setPrimaryTab] = useState('all');
  const [subTab, setSubTab] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sortBy, setSortBy] = useState('date_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [previewApplication, setPreviewApplication] = useState(null);
  const [tailoringJobId, setTailoringJobId] = useState(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const [premiumAtLimit, setPremiumAtLimit] = useState(false);
  const [clearedTailoring, setClearedTailoring] = useState(new Set());
  const [mismatchState, setMismatchState] = useState(null);
  const [planKey, setPlanKey] = useState('FREE');
  const [userName, setUserName] = useState('');
  const autoTailorCV = localStorage.getItem('autoTailorCV') === 'true';
  const canTailorCV = planKey !== 'FREE';
  // Derived from the server (autoApplyStatus === 'pending_tailoring') on load,
  // updated live via tailorComplete/tailorError events. No localStorage — the
  // state survives device/browser switches and can't go stale locally.
  const [tailoringJobs, setTailoringJobs] = useState(new Set());

  useEffect(() => {
    loadApplications();
    getSubscription()
      .then(sub => setPlanKey(sub?.planKey || 'FREE'))
      .catch(() => setPlanKey('FREE'));
    getMyProfile()
      .then(p => setUserName(p?.user?.fullName || p?.user?.email || ''))
      .catch(() => {});

    // התעדכנות מיידית כשהשם נערך מה-Navbar/פרופיל, בלי ריפרש.
    const onProfileUpdated = (e) => {
      if (e.detail?.fullName) setUserName(e.detail.fullName);
    };
    window.addEventListener('profile-updated', onProfileUpdated);
    return () => window.removeEventListener('profile-updated', onProfileUpdated);
  }, []);

  useEffect(() => {
    const handleComplete = (e) => {
      const { jobId, tailoredResume, tailoredResumeUrl } = e.detail;
      setApplications(prev => prev.map(a =>
        a.jobId === jobId
          ? {
              ...a,
              tailoredResume,
              tailoredResumeUrl,
              // When Auto Apply is on, tailoring completion moves the server
              // record to 'pending' (dispatched to the apply bot). Mirror that
              // locally so "הגשה אוטומטית בתהליך" shows without a refresh.
              autoApplyStatus: a.autoApplyStatus === 'pending_tailoring' ? 'pending' : a.autoApplyStatus,
            }
          : a
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

  // Live progress: while any application is still being tailored or submitted
  // by the bot, silently re-fetch every 20s so statuses advance without F5.
  // Keyed on a boolean (not the array) so the interval is stable, and the
  // fetch only commits state when something meaningful actually changed.
  const hasInFlight = applications.some(a =>
    a.autoApplyStatus === 'pending' || a.autoApplyStatus === 'pending_tailoring');

  useEffect(() => {
    if (!hasInFlight) return;
    const timer = setInterval(() => loadApplications(true), 20000);
    return () => clearInterval(timer);
  }, [hasInFlight]);

  const loadApplications = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await getMyApplications();
      const apps = data.applications || [];

      // Server is the source of truth: a tailoring is "active" if the record
      // says pending_tailoring, has no result yet, and started recently.
      // Older pending_tailoring records are stale (tailor Lambda died) and
      // shouldn't show an infinite spinner.
      const TAILORING_ACTIVE_WINDOW_MS = 15 * 60 * 1000;
      const now = Date.now();
      const nextTailoring = new Set(
        apps
          .filter(app =>
            app.autoApplyStatus === 'pending_tailoring' &&
            !app.tailoredResumeUrl &&
            now - new Date(app.updatedAt || app.createdAt || 0).getTime() < TAILORING_ACTIVE_WINDOW_MS)
          .map(app => app.jobId)
      );
      setTailoringJobs(prev =>
        (prev.size === nextTailoring.size && [...nextTailoring].every(id => prev.has(id)))
          ? prev
          : nextTailoring
      );

      // Presigned URLs regenerate on every fetch — comparing without them
      // prevents silent polls from re-rendering (and visually "refreshing")
      // the page when nothing actually changed.
      const fingerprint = (list) => JSON.stringify(
        list.map(({ tailoredResumePresignedUrl, jobApplyUrl, ...rest }) => rest)
      );
      setApplications(prev => (silent && fingerprint(prev) === fingerprint(apps)) ? prev : apps);
    } catch (err) {
      console.error('loadApplications failed:', err);
      if (err?.status === 401 || err?.message?.includes('auth') || err?.message?.includes('token')) {
        setError('פג תוקף ההתחברות. רענן את הדף.');
      } else if (err?.status >= 500) {
        setError('שגיאת שרת. אנא נסה שוב.');
      } else {
        setError('אין חיבור לשרת. אנא נסה שוב.');
      }
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

  const filtered = applications.filter(a => {
    const auto = a.autoApplyStatus;
    const status = (a.status || '').toUpperCase();
    switch (primaryTab) {
      case 'pending':   return auto === 'manual' || auto === 'pending' || auto === 'pending_tailoring' || auto === 'failed';
      case 'success':   return auto === 'success';
      case 'candidacy': return CANDIDACY_STATUSES.includes(status) && (!subTab || status === subTab);
      case 'all':
      default:          return true;
    }
  });

  const STATUS_ORDER = { SUBMITTED: 0, REVIEWED: 1, INTERVIEW: 2, ACCEPTED: 3, REJECTED: 4 };
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'date_asc':    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      case 'company':     return (a.company || '').localeCompare(b.company || '');
      case 'status':      return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      case 'date_desc':
      default:            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage   = Math.min(currentPage, totalPages);
  const paginated  = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectPrimary = (key) => { setPrimaryTab(key); setSubTab(null); setCurrentPage(1); };

  const toggleSelect = (jobId) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(jobId) ? s.delete(jobId) : s.add(jobId);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) setSelected(new Set());
    else setSelected(new Set(paginated.map(a => a.jobId)));
  };

  const handleDelete = () => {
    if (!selected.size) return;
    setConfirmDelete(true);
  };

  const confirmAndDelete = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await deleteApplications([...selected]);
      setApplications(prev => prev.filter(a => !selected.has(a.jobId)));
      setSelected(new Set());
      setEditMode(false);
    } catch {
      alert('שגיאה במחיקה');
    } finally {
      setDeleting(false);
    }
  };

  const handleTailorCV = async (app, force = false) => {
    setTailoringJobId(app.jobId);
    try {
      const result = await tailorCVForJob(app.jobId, force);

      if (result.isRelevant === false) {
        setMismatchState({ app, reason: result.reason });
        return;
      }

      setApplications(prev => prev.map(a =>
        a.jobId === app.jobId
          ? { ...a, tailoredResumeUrl: result.tailoredResumeUrl, tailoredResume: result.tailoredResume }
          : a
      ));
    } catch (err) {
      if (err?.code === 'AI_LIMIT_REACHED' || err?.status === 429) {
        if (planKey !== 'FREE') {
          setPremiumAtLimit(true);
        } else {
          setShowUpsell(true);
        }
      } else if (err?.code === 'AI_NOT_AVAILABLE' || err?.status === 403) {
        setShowUpsell(true);
      } else {
        alert('שגיאה בהתאמת קורות החיים. ודא שיש קורות חיים פעילים בפרופיל.');
      }
    } finally {
      setTailoringJobId(null);
    }
  };

  useEffect(() => {
    if (tailoringJobs.size === 0) return;
    const interval = setInterval(loadApplications, 6000);
    return () => clearInterval(interval);
  }, [tailoringJobs.size]);

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

        {/* Page header */}
        <div style={styles.pageHeader}>
          <span style={styles.pageTitle}>הגשות</span>
          <button style={styles.refreshBtn} onClick={loadApplications}>
            <img src="/icons/refresh_icon.png" alt="" style={{ width: `${ICON_SIZES.cvButton}px`, height: `${ICON_SIZES.cvButton}px`, objectFit: 'contain' }} />
            רענן
          </button>
        </div>

        {/* Top-level page tabs */}
        <div style={styles.pageTabs}>
          <button
            style={{ ...styles.pageTabBtn, ...(pageTab === 'my-applications' ? styles.pageTabActive : {}) }}
            onClick={() => setPageTab('my-applications')}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <img src="/icons/applies_icon.png" alt="" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
              ההגשות שלי
            </span>
          </button>
          <button
            style={{ ...styles.pageTabBtn, ...(pageTab === 'panel' ? styles.pageTabActive : {}) }}
            onClick={() => setPageTab('panel')}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <img src="/icons/panel_icons/panel_icon.png" alt="" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
              פאנל ההגשות
            </span>
          </button>
        </div>

        {/* ── Panel tab ── */}
        {pageTab === 'panel' && (
          <PanelTab applications={applications} planKey={planKey} userName={userName} />
        )}

        {/* ── My applications tab ── */}
        {pageTab === 'my-applications' && (<>

        {/* Sort + Edit toolbar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', direction: 'rtl' }}>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
            style={styles.sortSelect}
          >
            <option value="date_desc">תאריך הוספה — חדש לישן</option>
            <option value="date_asc">תאריך הוספה — ישן לחדש</option>
            <option value="company">שם חברה</option>
            <option value="status">סטטוס הגשה</option>
          </select>
          {!editMode ? (
            <button style={styles.editBtn} onClick={() => { setEditMode(true); setSelected(new Set()); }}>
              ✏️ ערוך
            </button>
          ) : (
            <>
              <button
                style={{ ...styles.editBtn, background: '#F44336', color: 'white', borderColor: '#F44336' }}
                disabled={deleting || selected.size === 0}
                onClick={handleDelete}
              >
                {deleting ? '...' : `🗑 מחק (${selected.size})`}
              </button>
              <button style={styles.editBtn} onClick={() => { setEditMode(false); setSelected(new Set()); }}>
                ביטול
              </button>
            </>
          )}
        </div>

        {/* Level 1 — primary tabs */}
        <div style={styles.filterRow}>
          {PRIMARY_TABS.map(t => (
            <button
              key={t.key}
              style={{ ...styles.filterBtn, ...(primaryTab === t.key ? styles.filterActive : {}) }}
              onClick={() => selectPrimary(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Level 2 — sub-tabs (only under "סטטוס מועמדות") */}
        {primaryTab === 'candidacy' && (
          <div style={styles.subFilterRow}>
            {SUB_TABS.map(t => (
              <button
                key={t.key}
                style={{ ...styles.subFilterBtn, ...(subTab === t.key ? styles.subFilterActive : {}) }}
                onClick={() => setSubTab(subTab === t.key ? null : t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {sorted.length === 0 ? (
          <div style={styles.empty}>
            <p style={{ fontSize: '48px', margin: 0 }}>📋</p>
            <p style={styles.emptyTitle}>
              {primaryTab === 'all' ? 'אין הגשות עדיין' : 'אין הגשות בקטגוריה זו'}
            </p>
            <p style={styles.emptySub}>החלק משרות כדי ליצור הגשות</p>
          </div>
        ) : (
          <>
          {/* Select-all row (edit mode only) */}
          {editMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', direction: 'rtl', padding: '4px 2px' }}>
              <input type="checkbox" checked={selected.size === paginated.length && paginated.length > 0} onChange={toggleSelectAll} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
              <span style={{ fontSize: '13px', color: '#666', fontWeight: 600 }}>בחר הכל בדף</span>
              {selected.size > 0 && <span style={{ fontSize: '12px', color: '#F44336', fontWeight: 700 }}>{selected.size} נבחרו</span>}
            </div>
          )}
          <div style={styles.list}>
            {paginated.map(app => {
              const isPendingManual = (app.autoApplyStatus === 'manual' || app.autoApplyStatus === 'pending' || app.autoApplyStatus === 'failed') && app.status === 'SUBMITTED';
              const cfg = isPendingManual
                ? { color: '#FF9800', label: 'ממתין להגשה' }
                : (STATUS_CONFIG[app.status] || { color: '#FFC107', label: 'ממתין' });
              const isUpdating = updating === app.jobId;
              const isSelected = selected.has(app.jobId);
              return (
                <div
                  key={app.jobId}
                  style={{ ...styles.card, ...(isSelected ? { outline: '2px solid #6C4FD4', outlineOffset: '1px' } : {}) }}
                  onClick={editMode ? () => toggleSelect(app.jobId) : undefined}
                >
                  <div style={{ ...styles.cardTop, direction: 'ltr' }}>
                    {editMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(app.jobId)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0, marginLeft: '6px' }}
                      />
                    )}
                    <div style={{ ...styles.cardInfo, direction: 'rtl' }}>
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

                  {app.autoApplyStatus && (
                    <AutoApplyResult
                      app={app}
                      planKey={planKey}
                      canExplain={canTailorCV}
                      isActiveTailoring={tailoringJobs.has(app.jobId)}
                    />
                  )}

                  {tailoringJobs.has(app.jobId) && !app.tailoredResumeUrl && app.autoApplyStatus !== 'pending_tailoring' && (
                    <div style={styles.tailoringBox}>
                      <img src="/icons/robot_icon.png" alt="" style={{ width: `${ICON_SIZES.autoApplyBlock}px`, height: `${ICON_SIZES.autoApplyBlock}px`, objectFit: 'contain' }} />
                      <div>
                        <p style={styles.tailoringTitle}>מתאים קורות חיים...</p>
                        <p style={styles.tailoringSub}>ה-AI עובד על זה, יעודכן אוטומטית</p>
                      </div>
                    </div>
                  )}

                  {!app.tailoredResumeUrl && !tailoringJobs.has(app.jobId) && (
                    <button
                      type="button"
                      style={canTailorCV ? styles.manualTailorBtn : styles.manualTailorBtnLocked}
                      disabled={tailoringJobId === app.jobId}
                      onClick={() => canTailorCV ? handleTailorCV(app) : setShowUpsell(true)}
                    >
                      {tailoringJobId === app.jobId ? '⏳ מתאים...' : canTailorCV
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}><img src="/icons/robot_icon.png" alt="" style={{ width: `${ICON_SIZES.tailorButton}px`, height: `${ICON_SIZES.tailorButton}px`, objectFit: 'contain' }} />התאמת קורות חיים למשרה</span>
                        : 'התאמת קורות חיים — פרימיום בלבד 🔒'}
                    </button>
                  )}

                  {app.tailoredResumeUrl && !clearedTailoring.has(app.jobId) && (
                    <div style={styles.tailoredBox}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img src="/icons/cv_icon.png" alt="" style={{ width: `${ICON_SIZES.tailoredCvHeader}px`, height: `${ICON_SIZES.tailoredCvHeader}px`, objectFit: 'contain', flexShrink: 0 }} />
                        <p style={styles.tailoredTitle}>קורות חיים מותאמים צורפו</p>
                        <p style={styles.tailoredSub}>
                          {app.tailoredResume ? 'ניתן לצפות בטיוטה או להוריד אותה כקובץ.' : 'הקובץ נשמר בענן.'}
                        </p>
                      </div>
                      <div style={styles.tailoredActions}>
                        {app.tailoredResume && (<>
                          <button type="button" style={styles.tailoredButton} onClick={() => setPreviewApplication(app)}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><img src="/icons/watch_cv_icon.png" alt="" style={{ width: `${ICON_SIZES.cvButton}px`, height: `${ICON_SIZES.cvButton}px`, objectFit: 'contain' }} />צפייה</span>
                          </button>
                          <button type="button" style={styles.tailoredButton} onClick={() => downloadCVAsPdf(app.tailoredResume, app.company, app.title)}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><img src="/icons/download_cv_icon.png" alt="" style={{ width: `${ICON_SIZES.cvButton}px`, height: `${ICON_SIZES.cvButton}px`, objectFit: 'contain' }} />PDF</span>
                          </button>
                        </>)}
                        <button
                          type="button"
                          title="בטל התאמה"
                          style={{ ...styles.tailoredButton, color: '#aaa', borderColor: '#ddd', padding: '7px 10px' }}
                          onClick={async () => {
                            await clearApplicationTailoring(app.jobId).catch(() => {});
                            setApplications(prev => prev.map(a =>
                              a.jobId === app.jobId ? { ...a, tailoredResumeUrl: null, tailoredResume: null } : a
                            ));
                          }}
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
                        התאמת קורות חיים — פרימיום בלבד 🔒
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                style={{ ...styles.pageBtn, opacity: safePage <= 1 ? 0.3 : 1 }}
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >→</button>
              <span style={styles.pageInfo}>{safePage} / {totalPages}</span>
              <button
                style={{ ...styles.pageBtn, opacity: safePage >= totalPages ? 0.3 : 1 }}
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >←</button>
            </div>
          )}
          </>
        )}
        </>)}
      </div>

      {confirmDelete && (
        <ConfirmDeleteModal
          count={selected.size}
          onConfirm={confirmAndDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <LimitModal
        visible={showUpsell || premiumAtLimit}
        mode="tailor"
        plan={planKey}
        premiumAtLimit={premiumAtLimit}
        onClose={() => { setShowUpsell(false); setPremiumAtLimit(false); }}
      />

      <MismatchWarningModal
        visible={!!mismatchState}
        reason={mismatchState?.reason}
        onCancel={() => setMismatchState(null)}
        onContinue={() => {
          const app = mismatchState.app;
          setMismatchState(null);
          handleTailorCV(app, true);
        }}
      />

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
            <div style={styles.previewText}>
              <CVRenderer text={previewApplication.tailoredResume} />
            </div>
            <button
              type="button"
              style={styles.downloadPreview}
              onClick={() => downloadCVAsPdf(previewApplication.tailoredResume, previewApplication.company, previewApplication.title)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}><img src="/icons/download_cv_icon.png" alt="" style={{ width: `${ICON_SIZES.downloadModal}px`, height: `${ICON_SIZES.downloadModal}px`, objectFit: 'contain' }} />הורד כ-PDF</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: 'var(--background)' },
  content: { padding: '12px 16px', maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' },

  /* Page header */
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: '20px', fontWeight: 800, color: '#1E2A4A' },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: '5px', background: 'white', border: '1.5px solid #e0e0e0', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#555', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },

  /* Page-level tabs */
  pageTabs: { display: 'flex', background: 'white', borderRadius: '14px', padding: '4px', gap: '4px', boxShadow: '0 1px 5px rgba(0,0,0,0.07)' },
  pageTabBtn: { flex: 1, padding: '9px 8px', borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#888', transition: 'all 0.15s' },
  pageTabActive: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', boxShadow: '0 2px 8px rgba(108,79,212,0.3)' },

  /* Compact stats strip (kept for possible future use) */
  statsStrip: { display: 'flex', background: 'white', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' },
  statChip: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', gap: '3px' },
  statChipNum: { fontSize: '20px', fontWeight: 800, lineHeight: 1.1 },
  statChipIcon: { width: '13px', height: '13px', objectFit: 'contain' },
  statChipLabel: { fontSize: '9px', color: '#aaa', fontWeight: 600, textAlign: 'center' },
  statChipDiv: { width: '1px', background: '#F0F0F0', alignSelf: 'stretch', flexShrink: 0 },

  autoBox: { borderRadius: '12px', border: '1px solid', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', direction: 'rtl' },
  autoBoxCol: { borderRadius: '12px', border: '1px solid', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '2px', direction: 'rtl' },
  autoTitle: { margin: 0, fontSize: '13px', fontWeight: 800 },
  autoSub: { margin: '2px 0 0', fontSize: '12px' },
  failActionBtn: { border: 'none', borderRadius: '999px', background: '#1E2A4A', color: 'white', padding: '8px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' },
  detailBtn: { border: '1.5px solid', borderRadius: '999px', background: 'white', padding: '8px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' },
  detailPanel: { overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.3s ease' },
  detailInner: { paddingTop: '10px' },
  sortSelect: { flex: 1, padding: '7px 10px', borderRadius: '10px', border: '1.5px solid #e0e0e0', background: 'white', fontSize: '12px', fontWeight: 600, color: '#555', cursor: 'pointer', direction: 'rtl' },
  editBtn: { flexShrink: 0, padding: '7px 14px', borderRadius: '10px', border: '1.5px solid #e0e0e0', background: 'white', fontSize: '12px', fontWeight: 700, color: '#555', cursor: 'pointer', whiteSpace: 'nowrap' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', paddingTop: '4px' },
  pageBtn: { width: '34px', height: '34px', borderRadius: '50%', border: '1.5px solid #e0e0e0', background: 'white', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pageInfo: { fontSize: '13px', fontWeight: 700, color: '#555', minWidth: '50px', textAlign: 'center' },
  filterRow: { display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '3px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' },
  filterBtn: { flexShrink: 0, padding: '7px 15px', borderRadius: '20px', border: '1.5px solid #e0e0e0', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#666', whiteSpace: 'nowrap' },
  filterActive: { background: '#6C4FD4', borderColor: '#6C4FD4', color: 'white' },
  subFilterRow: { display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', marginTop: '-4px', paddingRight: '4px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' },
  subFilterBtn: { flexShrink: 0, padding: '5px 13px', borderRadius: '16px', border: '1px solid #E5E0F5', background: '#F8F6FF', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#6C4FD4', whiteSpace: 'nowrap' },
  subFilterActive: { background: '#1E2A4A', borderColor: '#1E2A4A', color: 'white' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  card: { background: 'white', borderRadius: '14px', padding: '14px', boxShadow: '0 1px 5px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', gap: '10px' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' },
  cardInfo: { display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 },
  company: { fontSize: '15px', fontWeight: 700, margin: 0, color: '#1E2A4A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  title: { fontSize: '12px', color: '#6C4FD4', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  date: { fontSize: '10px', color: '#ccc', margin: 0 },
  badge: { padding: '3px 10px', borderRadius: '20px', color: 'white', fontSize: '11px', fontWeight: 700, flexShrink: 0, marginTop: '1px' },
  tailoredBox: { background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '9px 11px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', direction: 'rtl' },
  tailoredTitle: { margin: 0, fontSize: '12px', fontWeight: 800, color: '#166534' },
  tailoredSub: { margin: '3px 0 0', fontSize: '11px', color: '#15803D' },
  tailoredActions: { display: 'flex', gap: '6px', flexShrink: 0 },
  tailoredButton: { border: '1px solid #86EFAC', borderRadius: '999px', background: 'white', color: '#166534', padding: '5px 11px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' },
  tailoringBox: { background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: '10px', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px' },
  tailoringSpinner: { fontSize: '20px', animation: 'spin 1.5s linear infinite' },
  tailoringTitle: { margin: 0, fontSize: '13px', fontWeight: 700, color: '#F57F17' },
  tailoringSub: { margin: '2px 0 0', fontSize: '11px', color: '#F9A825' },
  manualTailorBtn: { width: '100%', padding: '9px', borderRadius: '10px', border: '1.5px dashed #6C4FD4', background: '#F8F6FF', color: '#6C4FD4', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
  manualTailorBtnLocked: { width: '100%', padding: '9px', borderRadius: '10px', border: '1.5px dashed #ccc', background: '#F5F5F5', color: '#999', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
  actions: { display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-start' },
  actionBtn: { padding: '5px 11px', borderRadius: '20px', border: '1.5px solid', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', minHeight: '30px' },
  actionActive: {},
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '48px 24px', background: 'white', borderRadius: '14px', textAlign: 'center' },
  emptyTitle: { fontSize: '18px', fontWeight: 700, margin: 0 },
  emptySub: { fontSize: '14px', color: '#777', margin: 0 },
  retryBtn: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '12px 24px', cursor: 'pointer', fontWeight: 700 },
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

