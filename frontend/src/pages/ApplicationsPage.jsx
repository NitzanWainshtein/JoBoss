// JoBoss features:
// - F-07: Application Tracking (Dual-Track Status)
// - F-09: AI Resume Tailoring

import { useState, useEffect } from 'react';
import ICON_SIZES from '../iconSizes';
import { CompanyLogo } from '../utils/companyLogos';
import useTranslation from '../i18n/useTranslation';
import { getMyApplications, updateApplication, tailorCVForJob, getSubscription, clearApplicationTailoring, explainFailure, deleteApplications, getMyProfile } from '../api';
import LimitModal from '../components/LimitModal';
import MismatchWarningModal from '../components/MismatchWarningModal';
import Spinner from '../components/Spinner';

// ── Track B: user-set funnel status ──────────────────────────────────────────
const STATUS_CONFIG = {
  SUBMITTED: { color: '#F5A623', labelKey: 'app.tab.pending' },
  REVIEWED:  { color: '#3D8BF5', labelKey: 'app.status.REVIEWED' },
  INTERVIEW: { color: '#9C4DD4', labelKey: 'app.status.INTERVIEW' },
  ACCEPTED:  { color: '#12A96F', labelKey: 'app.status.ACCEPTED' },
  REJECTED:  { color: '#FF4D67', labelKey: 'app.status.REJECTED' },
};

// ── Track A: system-set auto-apply result ────────────────────────────────────
const AUTO_APPLY_CONFIG = {
  manual:           { color: '#F5A623', labelKey: 'app.auto.manual',          bg: '#FFF8E1', border: '#FFE082', text: '#B45309' },
  pending_tailoring:{ color: '#7C3AED', labelKey: 'app.auto.pending_tailoring',      bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
  pending:          { color: '#7C3AED', labelKey: 'app.auto.pending',    bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
  success:          { color: '#12A96F', labelKey: 'app.auto.success',    bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  failed:           { color: '#F5A623', labelKey: 'app.auto.failed',     bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
};

// Level-1 primary tabs (always visible).
const PRIMARY_TABS = [
  { key: 'all', labelKey: 'app.tab.all' },
  { key: 'pending', labelKey: 'app.tab.pending' },
  { key: 'success', labelKey: 'app.tab.success' },
  { key: 'candidacy', labelKey: 'app.tab.candidacy' },
];

// Level-2 sub-tabs (only under "סטטוס מועמדות"). null = all candidacy statuses.
const CANDIDACY_STATUSES = ['REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];
const SUB_TABS = [
  { key: 'REVIEWED', labelKey: 'app.status.REVIEWED' },
  { key: 'INTERVIEW', labelKey: 'app.status.INTERVIEW' },
  { key: 'ACCEPTED', labelKey: 'app.status.ACCEPTED' },
  { key: 'REJECTED', labelKey: 'app.status.REJECTED' },
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
              ? <span>🔗 <a href={b.trim().startsWith('http') ? b.trim() : `https://${b.trim()}`} target="_blank" rel="noreferrer" style={{ color: '#7C5CFF' }}>{b.trim()}</a></span>
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
          <div key={i} style={{ marginTop: '16px', marginBottom: '5px', borderBottom: '2px solid #7C5CFF', paddingBottom: '2px' }}>
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
        html += `<div style="margin-top:16px;margin-bottom:5px;border-bottom:2px solid #7C5CFF;padding-bottom:2px;"><h2 style="font-size:12px;font-weight:800;color:#1E2A4A;margin:0;letter-spacing:1.5px;text-transform:uppercase;">${esc(title)}</h2></div>`;
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
        html += `<li style="font-size:13px;color:#374151;line-height:1.65;">🔗 <a href="${esc(url)}" style="color:#7C5CFF;">${esc(content.trim())}</a></li>`;
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
function AutoApplyResult({ app, planKey, canExplain }) {
  const { t } = useTranslation();
  const cfg = AUTO_APPLY_CONFIG[app.autoApplyStatus];
  const [explanation, setExplanation] = useState(app.failExplanation || null);
  const [loadingExp, setLoadingExp] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  if (!cfg) return null;

  // The manual-apply label is ALWAYS derived from the current plan — never from
  // any per-application field — so it's consistent across every card.
  const isPremium = planKey !== 'FREE';
  const manualLabel = isPremium ? t('app.applyExtension') : t('app.applyDirect');
  const jobUrl = app.jobApplyUrl || app.applyUrl || app.jobUrl || '';
  const openJob = () => { if (jobUrl) window.open(jobUrl, '_blank', 'noopener'); };

  // ── manual: auto-apply was off for this job ────────────────────────────────
  if (app.autoApplyStatus === 'manual') {
    if (!isPremium) {
      return (
        <div style={{ ...styles.autoBoxCol, background: '#F5F5F5', borderColor: '#ccc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/icons/waiting_to_apply_icon.png" alt="" style={{ width: `${ICON_SIZES.manualBlock}px`, height: `${ICON_SIZES.manualBlock}px`, objectFit: 'contain' }} />
            <p style={{ ...styles.autoTitle, color: '#999', margin: 0 }}>{t('app.autoApplyPremium')}</p>
          </div>
          {jobUrl && (
            <button type="button" style={{ ...styles.failActionBtn, alignSelf: 'flex-start', marginTop: '10px' }} onClick={openJob}>{manualLabel}</button>
          )}
        </div>
      );
    }
    return (
      <div style={{ ...styles.autoBox, background: cfg.bg, borderColor: cfg.border, flexWrap: 'wrap' }}>
        <img src="/icons/waiting_to_apply_icon.png" alt="" style={{ width: `${ICON_SIZES.manualBlock}px`, height: `${ICON_SIZES.manualBlock}px`, objectFit: 'contain', flexShrink: 0 }} />
        <div style={styles.autoTextRow}>
          <p style={{ ...styles.autoTitle, color: cfg.text }}>{t(cfg.labelKey)}</p>
          <p style={{ ...styles.autoSub, color: cfg.text }}>{t('app.autoOffForJob')}</p>
        </div>
        {jobUrl && (
          <button type="button" style={{ ...styles.failActionBtn, flexShrink: 0 }} onClick={openJob}>{manualLabel}</button>
        )}
      </div>
    );
  }

  // ── pending_tailoring: AI tailoring in progress before Fargate launch ────────
  // Staleness is derived directly from the server record's timestamp — no
  // dependency on the tailoringJobs set so the spinner shows on first render.
  if (app.autoApplyStatus === 'pending_tailoring') {
    if (app.tailoredResumeUrl) return null;
    const TAILORING_ACTIVE_WINDOW_MS = 15 * 60 * 1000;
    const startedAt = new Date(app.updatedAt || app.createdAt || 0).getTime();
    if (Date.now() - startedAt >= TAILORING_ACTIVE_WINDOW_MS) return null;
    return (
      <div style={{ ...styles.autoBox, background: cfg.bg, borderColor: cfg.border }}>
        <img src="/icons/robot_icon.png" alt="" style={{ width: `${ICON_SIZES.autoApplyBlock}px`, height: `${ICON_SIZES.autoApplyBlock}px`, objectFit: 'contain' }} />
        <div style={styles.autoTextRow}>
          <p style={{ ...styles.autoTitle, color: cfg.text }}>{t(cfg.labelKey)}</p>
          <p style={{ ...styles.autoSub, color: cfg.text }}>{t('app.tailoringBefore')}</p>
        </div>
      </div>
    );
  }

  // ── pending: Fargate is running ────────────────────────────────────────────
  if (app.autoApplyStatus === 'pending') {
    return (
      <div style={{ ...styles.autoBox, background: cfg.bg, borderColor: cfg.border }}>
        <img src="/icons/process_icon.png" alt="" style={{ width: `${ICON_SIZES.autoApplyBlock}px`, height: `${ICON_SIZES.autoApplyBlock}px`, objectFit: 'contain' }} />
        <div style={styles.autoTextRow}>
          <p style={{ ...styles.autoTitle, color: cfg.text }}>{t(cfg.labelKey)}</p>
          <p style={{ ...styles.autoSub, color: cfg.text }}>{t('app.botSubmitting')}</p>
        </div>
      </div>
    );
  }

  // ── success: submitted ─────────────────────────────────────────────────────
  if (app.autoApplyStatus === 'success') {
    return (
      <div style={{ ...styles.autoBox, background: cfg.bg, borderColor: cfg.border }}>
        <img src="/icons/accepted_icon.png" alt="" style={{ width: `${ICON_SIZES.autoApplyBlock}px`, height: `${ICON_SIZES.autoApplyBlock}px`, objectFit: 'contain' }} />
        <div style={styles.autoTextRow}>
          <p style={{ ...styles.autoTitle, color: cfg.text }}>{t(cfg.labelKey)}</p>
          <p style={{ ...styles.autoSub, color: cfg.text }}>
            {app.updatedAt ? `${t('app.submittedOn')}${new Date(app.updatedAt).toLocaleDateString()}` : t('app.submitted')}
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
        <p style={{ ...styles.autoTitle, color: cfg.text }}>{t('app.autoFailed')}</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button
          type="button"
          style={{ ...styles.detailBtn, color: cfg.text, borderColor: cfg.border }}
          onClick={toggleDetail}
        >
          {t('app.detailToggle')} 🔍 {showDetail ? '▲' : '▼'}
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
              <p style={{ ...styles.autoSub, color: cfg.text }}>{t('app.analysing')}</p>
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
              {canExplain ? t('app.noDetail') : t('app.detailPremium')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Confirm delete modal ──────────────────────────────────────────────────────
function ConfirmDeleteModal({ count, onConfirm, onCancel }) {
  const { t } = useTranslation();
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: '24px', padding: '28px 24px', width: 'min(340px, 95vw)', display: 'flex', flexDirection: 'column', gap: '16px', direction: 'inherit', boxShadow: '0 24px 60px rgba(30,20,70,0.28)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
          <span style={{ fontSize: '40px' }}>🗑</span>
          <p style={{ fontSize: '17px', fontWeight: 800, color: '#1E2A4A', margin: 0 }}>{t('app.deleteTitle')}</p>
          <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
            {t('app.deleteQ2')} <strong>{count}</strong> {count === 1 ? t('app.one') : t('app.many')} {t('app.permanently')}<br />
            <span style={{ fontSize: '12px', color: '#FF4D67' }}>{t('app.deleteIrreversible')}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            style={{ flex: 1, padding: '12px', borderRadius: '999px', border: 'none', background: '#FF4D67', color: 'white', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}
            onClick={onConfirm}
          >
            מחק
          </button>
          <button
            style={{ flex: 1, padding: '12px', borderRadius: '999px', border: '1.5px solid #E9E4FB', background: 'white', color: '#5A5478', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}
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
function PanelTab({ applications, userName, userImage }) {
  const { t } = useTranslation();
  const total        = applications.length;
  const manualPending = applications.filter(a => a.autoApplyStatus === 'manual').length;
  const inProgress   = applications.filter(a => a.autoApplyStatus === 'pending' || a.autoApplyStatus === 'pending_tailoring').length;
  const autoSuccess  = applications.filter(a => a.autoApplyStatus === 'success').length;
  const reviewed     = applications.filter(a => a.status === 'REVIEWED').length;
  const interviews   = applications.filter(a => a.status === 'INTERVIEW').length;
  const accepted     = applications.filter(a => a.status === 'ACCEPTED').length;

  const recent = [...applications].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6);

  const StatCard = ({ icon, value, label, color, bg }) => (
    <div style={{ background: bg || '#F8F6FF', borderRadius: '18px', padding: '14px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: '1 1 calc(33% - 6px)', minWidth: '85px' }}>
      <img src={icon} alt="" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
      <span style={{ fontSize: '22px', fontWeight: 900, color: color || '#7C5CFF', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '10px', color: '#888', fontWeight: 600, textAlign: 'center' }}>{label}</span>
    </div>
  );


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Hero card */}
      <div style={{ background: 'linear-gradient(135deg, #5B3DF5 0%, #7C5CFF 60%, #9B7BFF 120%)', borderRadius: '24px', boxShadow: '0 16px 40px rgba(91,61,245,0.32)', padding: '18px 20px', color: 'white', direction: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, opacity: 0.85, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <img src="/icons/panel_icons/wave_icon.png" alt="" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
            {t('app.hello')}, {userName ? userName.split(' ')[0] : ''}!
          </p>
          <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, letterSpacing: '-0.3px' }}>
            {t('app.yourPanel')}
          </p>
        </div>
        <div style={{ width: '52px', height: '52px', borderRadius: '14px', overflow: 'hidden', background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={userImage || "/icons/panel_icons/male_profile.png"} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <StatCard icon="/icons/panel_icons/waiting_for_apply_icon.png" value={manualPending} label={t('app.stat.manualPending')} color="#C2410C" bg="#FFF8F0" />
        <StatCard icon="/icons/panel_icons/inproccess_icon.png"        value={inProgress}    label={t('app.stat.inProgress')}      color="#7C3AED" bg="#F5F3FF" />
        <StatCard icon="/icons/panel_icons/auto_applied_icon.png"      value={autoSuccess}   label={t('app.stat.autoApplied')}    color="#166534" bg="#F0FDF4" />
        <StatCard icon="/icons/panel_icons/viewd_icon.png"             value={reviewed}      label={t('app.stat.reviewed')}             color="#1565C0" bg="#EFF6FF" />
        <StatCard icon="/icons/panel_icons/interviews_icon.png"        value={interviews}    label={t('app.stat.interviews')}          color="#9C4DD4" bg="#FDF4FF" />
        <StatCard icon="/icons/panel_icons/approved_icon.png"          value={accepted}      label={t('app.stat.accepted')}           color="#12A96F" bg="#F0FDF4" />
      </div>


      {/* Recent applications */}
      {recent.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 6px 20px rgba(108,79,212,0.08)', borderRadius: '20px', padding: '16px', direction: 'inherit' }}>
          <p style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#1E2A4A' }}>{t('app.recent')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recent.map(app => {
              const isPendingManual = app.autoApplyStatus === 'manual';
              const badgeCfg = isPendingManual
                ? { labelKey: 'app.tab.pending', color: '#F5A623' }
                : (STATUS_CONFIG[app.status] || { labelKey: 'app.status.REVIEWED', color: '#FFC107' });
              return (
                <div key={app.jobId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F5F5F5' }}>
                  <CompanyLogo company={app.company} style={{ width: '36px', height: '36px', borderRadius: '9px', objectFit: 'contain', border: '1px solid #eee', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1E2A4A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.company}</p>
                    <p style={{ margin: 0, fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.title}</p>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: badgeCfg.color, background: `${badgeCfg.color}18`, padding: '3px 8px', borderRadius: '999px', flexShrink: 0 }}>
                    {t(badgeCfg.labelKey)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {total === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '40px 24px', background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 6px 20px rgba(108,79,212,0.08)', borderRadius: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: '48px', margin: 0 }}>📊</p>
          <p style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{t('app.noData')}</p>
          <p style={{ fontSize: '14px', color: '#777', margin: 0 }}>{t('app.swipeForStats')}</p>
        </div>
      )}
    </div>
  );
}

function ApplicationsPage() {
  const { t } = useTranslation();
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
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [openRowMenu, setOpenRowMenu] = useState(null);   // jobId whose ⋮ menu is open
  // Wide layout gets the full 5-column table from the design; narrow folds the
  // date under the role so the row still fits a phone.
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 480px)').matches
  );
  const PAGE_SIZE = 10;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [previewApplication, setPreviewApplication] = useState(null);
  const [tailoringJobId, setTailoringJobId] = useState(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const [premiumAtLimit, setPremiumAtLimit] = useState(false);
  const [clearedTailoring] = useState(new Set());
  const [mismatchState, setMismatchState] = useState(null);
  const [planKey, setPlanKey] = useState('FREE');
  const [userName, setUserName] = useState('');
  const [userImage, setUserImage] = useState(null);
  const canTailorCV = planKey !== 'FREE';
  // Derived from the server (autoApplyStatus === 'pending_tailoring') on load,
  // updated live via tailorComplete/tailorError events. No localStorage — the
  // state survives device/browser switches and can't go stale locally.
  const [tailoringJobs, setTailoringJobs] = useState(new Set());

  // Track manual tailoring across page navigation via sessionStorage.
  // Key: 'tailoringInProgress', Value: JSON array of { jobId, startedAt }
  const TAILOR_SESSION_KEY = 'tailoringInProgress';
  const TAILOR_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

  const addTailoringToSession = (jobId) => {
    try {
      const existing = JSON.parse(sessionStorage.getItem(TAILOR_SESSION_KEY) || '[]');
      const now = Date.now();
      const updated = existing.filter(e => now - e.startedAt < TAILOR_MAX_AGE_MS);
      if (!updated.find(e => e.jobId === jobId)) updated.push({ jobId, startedAt: now });
      sessionStorage.setItem(TAILOR_SESSION_KEY, JSON.stringify(updated));
    } catch {}
  };

  const removeTailoringFromSession = (jobId) => {
    try {
      const existing = JSON.parse(sessionStorage.getItem(TAILOR_SESSION_KEY) || '[]');
      sessionStorage.setItem(TAILOR_SESSION_KEY, JSON.stringify(existing.filter(e => e.jobId !== jobId)));
    } catch {}
  };

  const getPendingTailoringFromSession = () => {
    try {
      const now = Date.now();
      return JSON.parse(sessionStorage.getItem(TAILOR_SESSION_KEY) || '[]')
        .filter(e => now - e.startedAt < TAILOR_MAX_AGE_MS)
        .map(e => e.jobId);
    } catch { return []; }
  };

  useEffect(() => {
    loadApplications();
    getSubscription()
      .then(sub => setPlanKey(sub?.planKey || 'FREE'))
      .catch(() => setPlanKey('FREE'));
    getMyProfile()
      .then(p => {
        setUserName(p?.user?.fullName || p?.user?.email || '');
        setUserImage(p?.user?.profileImageUrl || null);
      })
      .catch(() => {});

    // התעדכנות מיידית כשהשם נערך מה-Navbar/פרופיל, בלי ריפרש.
    const onProfileUpdated = (e) => {
      if (e.detail?.fullName) setUserName(e.detail.fullName);
      // null means "removed", undefined means "not part of this event".
      if (e.detail?.profileImageUrl !== undefined) setUserImage(e.detail.profileImageUrl);
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
      // Include both server-tracked (pending_tailoring) and client-tracked
      // (sessionStorage) tailoring jobs. loadApplications must never evict a
      // sessionStorage job just because the server record says 'manual' —
      // that status means autoApply is off, not that tailoring isn't running.
      const sessionIds = getPendingTailoringFromSession();
      const nextTailoring = new Set([
        ...apps
          .filter(app =>
            app.autoApplyStatus === 'pending_tailoring' &&
            !app.tailoredResumeUrl &&
            now - new Date(app.updatedAt || app.createdAt || 0).getTime() < TAILORING_ACTIVE_WINDOW_MS)
          .map(app => app.jobId),
        ...sessionIds.filter(id => {
          const app = apps.find(a => a.jobId === id);
          return !app || !app.tailoredResumeUrl;
        }),
      ]);
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
        setError(t('app.err.auth'));
      } else if (err?.status >= 500) {
        setError(t('app.err.server'));
      } else {
        setError(t('app.err.network'));
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
      alert(t('app.err.status'));
    } finally {
      setUpdating(null);
    }
  };

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 480px)');
    const onChange = e => setIsWide(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Close an open row menu on any outside click.
  useEffect(() => {
    if (!openRowMenu) return;
    const close = () => setOpenRowMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openRowMenu]);

  // Manual refresh gets its own state rather than reusing `loading`: `loading`
  // blanks the whole list for a spinner, which is too heavy for a refresh tap.
  // Refetches silently (list stays on screen) and spins the button icon instead.
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadApplications(true);
    } finally {
      setRefreshing(false);
    }
  };

  const searchTerm = search.trim().toLowerCase();

  const filtered = applications.filter(a => {
    const auto = a.autoApplyStatus;
    const status = (a.status || '').toUpperCase();

    if (searchTerm) {
      const haystack = `${a.company || ''} ${a.title || ''}`.toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }

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
      alert(t('app.err.delete'));
    } finally {
      setDeleting(false);
    }
  };

  const handleTailorCV = async (app, force = false) => {
    setTailoringJobId(app.jobId);
    addTailoringToSession(app.jobId);
    try {
      const result = await tailorCVForJob(app.jobId, force);

      if (result.isRelevant === false) {
        removeTailoringFromSession(app.jobId);
        setMismatchState({ app, reason: result.reason });
        return;
      }

      removeTailoringFromSession(app.jobId);
      setApplications(prev => prev.map(a =>
        a.jobId === app.jobId
          ? { ...a, tailoredResumeUrl: result.tailoredResumeUrl, tailoredResume: result.tailoredResume }
          : a
      ));
    } catch (err) {
      removeTailoringFromSession(app.jobId);
      if (err?.code === 'AI_LIMIT_REACHED' || err?.status === 429) {
        if (planKey !== 'FREE') {
          setPremiumAtLimit(true);
        } else {
          setShowUpsell(true);
        }
      } else if (err?.code === 'AI_NOT_AVAILABLE' || err?.status === 403) {
        setShowUpsell(true);
      } else if (err?.status === 404) {
        // The backend distinguishes what exactly is missing — showing the
        // resumes message for a deleted job used to mislead users who had
        // perfectly valid resumes.
        if (err?.code === 'JOB_NOT_FOUND') {
          alert(t('app.err.jobGone'));
        } else if (err?.code === 'RESUME_NOT_FOUND') {
          alert(t('app.err.noResume'));
        } else {
          alert(t('app.err.tailorData'));
        }
      } else {
        const detail = err?.data?.details || err?.data?.error || '';
        alert(`שגיאה בהתאמת קורות החיים.${detail ? `\n${detail}` : ' נסה שוב או פנה לתמיכה.'}`);
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

  // When navigating back to this page, pick up tailoring jobs that were started
  // in SwipePage (or earlier on this page) and haven't finished yet.
  useEffect(() => {
    const pendingJobIds = getPendingTailoringFromSession();
    if (!pendingJobIds.length) return;

    // Add them to tailoringJobs immediately so the button is hidden and the
    // in-progress indicator shows without waiting for the first poll.
    setTailoringJobs(prev => {
      const next = new Set(prev);
      pendingJobIds.forEach(id => next.add(id));
      return next;
    });

    const interval = setInterval(async () => {
      await loadApplications(true);
      setApplications(prev => {
        const stillPending = pendingJobIds.filter(jid => {
          const app = prev.find(a => a.jobId === jid);
          return app && !app.tailoredResumeUrl;
        });
        if (!stillPending.length) {
          clearInterval(interval);
          pendingJobIds.forEach(jid => removeTailoringFromSession(jid));
          setTailoringJobs(prev2 => {
            const next = new Set(prev2);
            pendingJobIds.forEach(id => next.delete(id));
            return next;
          });
        }
        return prev;
      });
    }, 4000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Spinner text={t('app.loading')} />
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', gap: '16px' }}>
      <p style={{ fontSize: '48px' }}>⚠️</p>
      <p style={{ fontSize: '18px', fontWeight: 700, color: '#FF4D67' }}>{error}</p>
      <button style={styles.retryBtn} onClick={() => loadApplications()}>{t('app.retry')}</button>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.content}>

        {/* Page header */}
        <div style={styles.pageHeader}>
          <span style={styles.pageTitle}>{t('app.title')}</span>
          <button
            style={{ ...styles.refreshBtn, opacity: refreshing ? 0.65 : 1, cursor: refreshing ? 'default' : 'pointer' }}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <img
              src="/icons/refresh_icon.png"
              alt=""
              style={{
                width: `${ICON_SIZES.cvButton}px`, height: `${ICON_SIZES.cvButton}px`, objectFit: 'contain',
                animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
              }}
            />
            {refreshing ? t('app.refreshing') : t('app.refresh')}
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
              {t('app.myApplications')}
            </span>
          </button>
          <button
            style={{ ...styles.pageTabBtn, ...(pageTab === 'panel' ? styles.pageTabActive : {}) }}
            onClick={() => setPageTab('panel')}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <img src="/icons/panel_icons/panel_icon.png" alt="" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
              {t('app.panel')}
            </span>
          </button>
        </div>

        {/* ── Panel tab ── */}
        {pageTab === 'panel' && (
          <PanelTab applications={applications} userName={userName} userImage={userImage} />
        )}

        {/* ── My applications tab ── */}
        {pageTab === 'my-applications' && (<>

        {/* Level 1 — primary tabs, with the edit controls sharing the row.
            RTL: the first child renders rightmost, so ערוך sits on the right and
            the pills scroll independently beside it. */}
        <div style={styles.filterBar}>
          {!editMode ? (
            <button style={styles.editBtn} onClick={() => { setEditMode(true); setSelected(new Set()); }}>
              {t('app.edit')}
            </button>
          ) : (
            <>
              <button
                style={{ ...styles.editBtn, background: '#FF4D67', color: 'white', borderColor: '#FF4D67' }}
                disabled={deleting || selected.size === 0}
                onClick={handleDelete}
              >
                {deleting ? '...' : `🗑 ${t('app.delete')} (${selected.size})`}
              </button>
              <button style={styles.editBtn} onClick={() => { setEditMode(false); setSelected(new Set()); }}>
                {t('app.cancel')}
              </button>
            </>
          )}

          <div style={styles.filterRow}>
            {PRIMARY_TABS.map(tab => (
              <button
                key={tab.key}
                style={{ ...styles.filterBtn, ...(primaryTab === tab.key ? styles.filterActive : {}) }}
                onClick={() => selectPrimary(tab.key)}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Search + sort trigger */}
        <div style={styles.searchRow}>
          <div style={styles.searchBox}>
            <img src="/icons/search_icon.png" alt="" style={styles.searchIcon} />
            <input
              type="search"
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder={t('app.searchPlaceholder')}
              style={styles.searchInput}
            />
          </div>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
            style={styles.sortPill}
            aria-label={t('app.sort')}
          >
            <option value="date_desc">{t('app.sort.dateDesc')}</option>
            <option value="date_asc">{t('app.sort.dateAsc')}</option>
            <option value="company">{t('app.sort.company')}</option>
            <option value="status">{t('app.sort.status')}</option>
          </select>
        </div>

        {/* Level 2 — sub-tabs (only under "סטטוס מועמדות") */}
        {primaryTab === 'candidacy' && (
          <div style={styles.subFilterRow}>
            {SUB_TABS.map(tab => (
              <button
                key={tab.key}
                style={{ ...styles.subFilterBtn, ...(subTab === tab.key ? styles.subFilterActive : {}) }}
                onClick={() => setSubTab(subTab === tab.key ? null : tab.key)}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        )}

        {sorted.length === 0 ? (
          <div style={styles.empty}>
            <p style={{ fontSize: '48px', margin: 0 }}>📋</p>
            <p style={styles.emptyTitle}>
              {primaryTab === 'all' ? t('app.emptyTitle') : t('app.emptyCategory')}
            </p>
            <p style={styles.emptySub}>{t('app.swipeToCreate')}</p>
          </div>
        ) : (
          <>
          {/* Select-all row (edit mode only) */}
          {editMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', direction: 'inherit', padding: '4px 2px' }}>
              <input type="checkbox" checked={selected.size === paginated.length && paginated.length > 0} onChange={toggleSelectAll} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
              <span style={{ fontSize: '13px', color: '#666', fontWeight: 600 }}>{t('app.selectAll')}</span>
              {selected.size > 0 && <span style={{ fontSize: '12px', color: '#FF4D67', fontWeight: 700 }}>{selected.size} נבחרו</span>}
            </div>
          )}
          <div style={styles.table}>
            {/* Column headers — the design's table head. Hidden on narrow
                screens, where the row folds into two lines. */}
            {isWide && (
              <div style={styles.tableHead}>
                <span style={{ ...styles.headCell, flex: '1 1 34%' }}>{t('app.col.company')}</span>
                <span style={{ ...styles.headCell, flex: '1 1 38%' }}>{t('app.col.role')}</span>
                <span style={{ ...styles.headCell, flex: '0 0 96px', textAlign: 'center' }}>{t('app.col.status')}</span>
                <span style={{ ...styles.headCell, flex: '0 0 72px', textAlign: 'center' }}>{t('app.col.updated')}</span>
                <span style={{ flex: '0 0 28px' }} />
              </div>
            )}
            {paginated.map(app => {
              const isPendingManual = (app.autoApplyStatus === 'manual' || app.autoApplyStatus === 'pending' || app.autoApplyStatus === 'failed') && app.status === 'SUBMITTED';
              const cfg = isPendingManual
                ? { color: '#F5A623', labelKey: 'app.tab.pending' }
                : (STATUS_CONFIG[app.status] || { color: '#FFC107', labelKey: 'app.pending' });
              const isUpdating = updating === app.jobId;
              const isSelected = selected.has(app.jobId);
              return (
                <div
                  key={app.jobId}
                  style={{ ...styles.rowGroup, ...(isSelected ? { background: 'rgba(124,92,255,0.06)' } : {}) }}
                  onClick={editMode ? () => toggleSelect(app.jobId) : undefined}
                >
                  {/* ── Table row ── */}
                  <div style={styles.row}>
                    {editMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(app.jobId)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
                      />
                    )}

                    {/* Company: logo + name, same logo component the swipe screen uses */}
                    <div style={{ ...styles.cellCompany, flex: isWide ? '1 1 34%' : '0 0 auto' }}>
                      <CompanyLogo company={app.company} style={styles.rowLogo} />
                      {isWide && <span style={styles.companyName}>{app.company || app.jobId}</span>}
                    </div>

                    {/* Role (+ company and date folded in on narrow screens) */}
                    <div style={{ ...styles.cellRole, flex: isWide ? '1 1 38%' : '1 1 auto' }}>
                      {!isWide && <span style={styles.companyName}>{app.company || app.jobId}</span>}
                      <span style={styles.roleText}>{app.title || t('app.job')}</span>
                      {!isWide && (
                        <span style={styles.dateText}>
                          {app.createdAt ? new Date(app.createdAt).toLocaleDateString('he-IL') : ''}
                        </span>
                      )}
                    </div>

                    {/* Status pill — soft tint instead of a solid fill */}
                    <div style={{ ...styles.cellStatus, flex: isWide ? '0 0 96px' : '0 0 auto' }}>
                      <span style={{ ...styles.statusPill, color: cfg.color, background: `${cfg.color}1A`, borderColor: `${cfg.color}33` }}>
                        {t(cfg.labelKey)}
                      </span>
                    </div>

                    {isWide && (
                      <div style={{ ...styles.cellDate, flex: '0 0 72px' }}>
                        {app.createdAt ? new Date(app.createdAt).toLocaleDateString('he-IL') : ''}
                      </div>
                    )}

                    {/* Row menu — status changes live here to keep the row clean */}
                    <div style={styles.cellMenu} onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={t('app.actions')}
                        style={styles.kebabBtn}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => setOpenRowMenu(openRowMenu === app.jobId ? null : app.jobId)}
                      >
                        ⋮
                      </button>
                      {openRowMenu === app.jobId && (
                        <div style={styles.rowMenu} onMouseDown={e => e.stopPropagation()}>
                          <p style={styles.rowMenuTitle}>{t('app.updateStatus')}</p>
                          {STATUS_ACTIONS.map(s => (
                            <button
                              key={s}
                              type="button"
                              disabled={isUpdating}
                              style={{
                                ...styles.rowMenuItem,
                                color: app.status === s ? '#fff' : STATUS_CONFIG[s]?.color || '#5A5478',
                                background: app.status === s ? STATUS_CONFIG[s]?.color || '#7C5CFF' : 'transparent',
                              }}
                              onClick={() => { handleStatusChange(app.jobId, s); setOpenRowMenu(null); }}
                            >
                              {isUpdating && app.status !== s ? '...' : t(STATUS_CONFIG[s]?.labelKey)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Always-visible extras: auto-apply note + CV tailoring ── */}
                  <div style={styles.rowExtras}>

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
                      <div style={styles.autoTextRow}>
                        <p style={styles.tailoringTitle}>{t('app.auto.pending_tailoring')}</p>
                        <p style={styles.tailoringSub}>{t('app.aiWorking')}</p>
                      </div>
                    </div>
                  )}

                  {!app.tailoredResumeUrl && !tailoringJobs.has(app.jobId) && app.autoApplyStatus !== 'pending_tailoring' && (
                    <button
                      type="button"
                      style={canTailorCV ? styles.manualTailorBtn : styles.manualTailorBtnLocked}
                      disabled={tailoringJobId === app.jobId}
                      onClick={() => canTailorCV ? handleTailorCV(app) : setShowUpsell(true)}
                    >
                      {tailoringJobId === app.jobId ? t('app.tailoring') : canTailorCV
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}><img src="/icons/robot_icon.png" alt="" style={{ width: `${ICON_SIZES.tailorButton}px`, height: `${ICON_SIZES.tailorButton}px`, objectFit: 'contain' }} />{t('app.tailorForJob')}</span>
                        : t('app.tailorPremium')}
                    </button>
                  )}

                  {app.tailoredResumeUrl && !clearedTailoring.has(app.jobId) && (
                    <div style={styles.tailoredBox}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img src="/icons/cv_icon.png" alt="" style={{ width: `${ICON_SIZES.tailoredCvHeader}px`, height: `${ICON_SIZES.tailoredCvHeader}px`, objectFit: 'contain', flexShrink: 0 }} />
                        <p style={styles.tailoredTitle}>{t('app.tailoredAttached')}</p>
                        <p style={styles.tailoredSub}>
                          {app.tailoredResume ? t('app.previewOrDownload') : t('app.savedToCloud')}
                        </p>
                      </div>
                      <div style={styles.tailoredActions}>
                        {app.tailoredResume && (<>
                          <button type="button" style={styles.tailoredButton} onClick={() => setPreviewApplication(app)}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><img src="/icons/watch_cv_icon.png" alt="" style={{ width: `${ICON_SIZES.cvButton}px`, height: `${ICON_SIZES.cvButton}px`, objectFit: 'contain' }} />{t('app.view')}</span>
                          </button>
                          <button type="button" style={styles.tailoredButton} onClick={() => downloadCVAsPdf(app.tailoredResume, app.company, app.title)}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><img src="/icons/download_cv_icon.png" alt="" style={{ width: `${ICON_SIZES.cvButton}px`, height: `${ICON_SIZES.cvButton}px`, objectFit: 'contain' }} />PDF</span>
                          </button>
                        </>)}
                        <button
                          type="button"
                          title={t('app.clearTailoring')}
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
                        {tailoringJobId === app.jobId ? t('app.tailoring') : t('app.retailor')}
                      </button>
                    ) : (
                      <button type="button" style={styles.manualTailorBtnLocked} onClick={() => setShowUpsell(true)}>
                        {t('app.tailorPremium')}
                      </button>
                    )
                  )}

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
              <span style={styles.pageInfo}>
                <span dir="ltr">{(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, sorted.length)}</span>
                {' '}{t('app.outOf')} {sorted.length}
              </span>
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
                <p style={styles.previewTitle}>{t('app.tailoredResume')}</p>
                <p style={styles.previewSub}>
                  {previewApplication.company} · {previewApplication.title}
                </p>
              </div>
              <button
                type="button"
                style={styles.closePreview}
                onClick={() => setPreviewApplication(null)}
              >
                {t('app.close')}
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
  container: { minHeight: '100vh', background: 'transparent' },
  content: { padding: '12px 16px', maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' },

  /* Page header */
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: '20px', fontWeight: 800, color: '#1E2A4A' },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(255,255,255,0.9)', borderRadius: '999px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#5A5478', boxShadow: '0 6px 20px rgba(108,79,212,0.08)' },

  /* Page-level tabs */
  pageTabs: { display: 'flex', background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 6px 20px rgba(108,79,212,0.08)', borderRadius: '18px', padding: '5px', gap: '4px' },
  pageTabBtn: { flex: 1, padding: '9px 8px', borderRadius: '14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#8B82B8', transition: 'all 0.15s' },
  pageTabActive: { background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', color: 'white', boxShadow: '0 6px 16px rgba(91,61,245,0.35)' },

  /* Compact stats strip (kept for possible future use) */
  statsStrip: { display: 'flex', background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 6px 20px rgba(108,79,212,0.08)', borderRadius: '18px', overflow: 'hidden' },
  statChip: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', gap: '3px' },
  statChipNum: { fontSize: '20px', fontWeight: 800, lineHeight: 1.1 },
  statChipIcon: { width: '13px', height: '13px', objectFit: 'contain' },
  statChipLabel: { fontSize: '9px', color: '#6B5E9E', fontWeight: 700, textAlign: 'center' },
  statChipDiv: { width: '1px', background: '#EDE8FC', alignSelf: 'stretch', flexShrink: 0 },

  autoBox: { borderRadius: '14px', border: '1px solid', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '9px', direction: 'inherit' },
  autoBoxCol: { borderRadius: '14px', border: '1px solid', padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: '2px', direction: 'inherit' },
  // Title and its explanatory line share one baseline-aligned row, wrapping only
  // when there genuinely isn't room — keeps these notes one line tall.
  autoTextRow: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: 0 },
  autoTitle: { margin: 0, fontSize: '13px', fontWeight: 800 },
  autoSub: { margin: 0, fontSize: '12px', opacity: 0.85 },
  failActionBtn: { border: 'none', borderRadius: '999px', background: '#1E2A4A', color: 'white', padding: '8px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' },
  detailBtn: { border: '1.5px solid', borderRadius: '999px', background: 'white', padding: '8px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' },
  detailPanel: { overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.3s ease' },
  detailInner: { paddingTop: '10px' },
  editBtn: { flexShrink: 0, padding: '7px 14px', borderRadius: '999px', border: '1.5px solid #E9E4FB', background: 'white', fontSize: '12px', fontWeight: 700, color: '#5A5478', cursor: 'pointer', whiteSpace: 'nowrap' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', paddingTop: '4px' },
  pageBtn: { width: '34px', height: '34px', borderRadius: '50%', border: '1.5px solid #E9E4FB', background: 'white', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pageInfo: { fontSize: '13px', fontWeight: 700, color: '#5A5478', minWidth: '50px', textAlign: 'center' },
  // Edit controls stay put; only the pills scroll when they overflow.
  filterBar: { display: 'flex', gap: '8px', alignItems: 'center', direction: 'inherit' },
  filterRow: { flex: 1, minWidth: 0, display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '3px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' },
  filterBtn: { flexShrink: 0, padding: '7px 15px', borderRadius: '999px', border: '1.5px solid #E9E4FB', background: 'rgba(255,255,255,0.9)', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#5A5478', whiteSpace: 'nowrap' },
  filterActive: { background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', borderColor: 'transparent', color: 'white', boxShadow: '0 6px 16px rgba(91,61,245,0.3)' },
  subFilterRow: { display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', marginTop: '-4px', paddingRight: '4px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' },
  subFilterBtn: { flexShrink: 0, padding: '5px 13px', borderRadius: '999px', border: '1px solid #E9E4FB', background: '#F1ECFF', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#7C5CFF', whiteSpace: 'nowrap' },
  subFilterActive: { background: '#1E2A4A', borderColor: 'transparent', color: 'white' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },

  /* ── Applications table (design-matched) ───────────────────────────────── */
  searchRow: { display: 'flex', gap: '8px', alignItems: 'center', direction: 'inherit' },
  searchBox: {
    flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
    background: 'rgba(255,255,255,0.9)', border: '1px solid #E9E4FB',
    borderRadius: '999px', padding: '9px 14px',
    boxShadow: '0 4px 14px rgba(108,79,212,0.06)',
  },
  searchIcon: { width: '15px', height: '15px', objectFit: 'contain', opacity: 0.5, flexShrink: 0 },
  searchInput: {
    flex: 1, border: 'none', outline: 'none', background: 'transparent',
    fontSize: '13px', fontWeight: 600, color: '#1E2A4A', minWidth: 0,
  },
  sortPill: {
    flexShrink: 0, border: '1px solid #E9E4FB', borderRadius: '999px',
    background: 'rgba(255,255,255,0.9)', padding: '9px 14px', cursor: 'pointer',
    fontSize: '12px', fontWeight: 700, color: '#5A5478', direction: 'inherit',
    boxShadow: '0 4px 14px rgba(108,79,212,0.06)',
  },

  table: {
    background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.9)', borderRadius: '20px',
    boxShadow: '0 6px 20px rgba(108,79,212,0.08)',
    overflow: 'hidden', direction: 'inherit',
  },
  tableHead: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 16px', borderBottom: '1px solid #EFEBFB',
    background: 'rgba(248,246,255,0.6)',
  },
  headCell: { fontSize: '11px', fontWeight: 800, color: '#6B5E9E' },

  // One application = row + its always-visible note / CV blocks.
  // Separator between applications is deliberately stronger than any divider
  // inside a row, so the eye groups each job as one block.
  rowGroup: { borderBottom: '2px solid #DFD5F7', paddingBottom: '10px', marginBottom: '4px', transition: 'background 0.15s' },
  row: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px' },
  cellCompany: { display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 },
  rowLogo: {
    width: '38px', height: '38px', borderRadius: '11px', objectFit: 'contain',
    background: 'white', border: '1px solid #EFEBFB', flexShrink: 0,
  },
  companyName: {
    fontSize: '14px', fontWeight: 800, color: '#1E2A4A',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    direction: 'ltr', textAlign: 'right', unicodeBidi: 'plaintext',
  },
  cellRole: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  roleText: {
    fontSize: '12.5px', fontWeight: 600, color: '#6F6790', lineHeight: 1.35,
    direction: 'ltr', textAlign: 'right', unicodeBidi: 'plaintext',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  dateText: { fontSize: '10.5px', color: '#7D719F', fontWeight: 600 },
  cellStatus: { display: 'flex', justifyContent: 'center', minWidth: 0 },
  statusPill: {
    fontSize: '10.5px', fontWeight: 800, padding: '5px 10px', borderRadius: '999px',
    border: '1px solid', textAlign: 'center', lineHeight: 1.3, display: 'inline-block',
  },
  cellDate: { fontSize: '11px', color: '#6B5E9E', fontWeight: 600, textAlign: 'center' },
  cellMenu: { flex: '0 0 28px', position: 'relative', display: 'flex', justifyContent: 'center' },
  kebabBtn: {
    width: '28px', height: '28px', borderRadius: '50%', border: 'none',
    background: 'transparent', cursor: 'pointer', fontSize: '17px',
    color: '#6B5E9E', lineHeight: 1, padding: 0,
  },
  rowMenu: {
    position: 'absolute', top: 'calc(100% + 6px)', insetInlineEnd: 0, zIndex: 50,
    background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(20px)',
    border: '1px solid rgba(124,92,255,0.12)', borderRadius: '14px',
    boxShadow: '0 18px 44px rgba(70,45,160,0.22)', padding: '6px', minWidth: '150px',
  },
  rowMenuTitle: { margin: '4px 8px 6px', fontSize: '10px', fontWeight: 800, color: '#7D719F' },
  rowMenuItem: {
    display: 'block', width: '100%', textAlign: 'right', border: 'none',
    borderRadius: '9px', padding: '8px 10px', fontSize: '12.5px', fontWeight: 700,
    cursor: 'pointer', background: 'transparent',
  },
  rowExtras: { padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: '8px' },
  tailoredBox: { background: '#EBFBF2', border: '1px solid #A9E9CB', borderRadius: '14px', padding: '9px 11px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', direction: 'inherit' },
  tailoredTitle: { margin: 0, fontSize: '12px', fontWeight: 800, color: '#166534' },
  tailoredSub: { margin: 0, fontSize: '11px', color: '#15803D' },
  tailoredActions: { display: 'flex', gap: '6px', flexShrink: 0 },
  tailoredButton: { border: '1px solid #86EFAC', borderRadius: '999px', background: 'white', color: '#166534', padding: '5px 11px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' },
  tailoringBox: { background: '#FFF4EC', border: '1px solid #F7D9A8', borderRadius: '14px', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px' },
  tailoringSpinner: { fontSize: '20px', animation: 'spin 1.5s linear infinite' },
  tailoringTitle: { margin: 0, fontSize: '13px', fontWeight: 700, color: '#F57F17' },
  tailoringSub: { margin: 0, fontSize: '11px', color: '#F9A825' },
  manualTailorBtn: { width: '100%', padding: '9px', borderRadius: '999px', border: '1.5px dashed #7C5CFF', background: '#F1ECFF', color: '#7C5CFF', fontSize: '13px', fontWeight: 800, cursor: 'pointer' },
  manualTailorBtnLocked: { width: '100%', padding: '9px', borderRadius: '999px', border: '1.5px dashed #D5CEE8', background: '#F5F3FC', color: '#6B5E9E', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '48px 24px', background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 6px 20px rgba(108,79,212,0.08)', borderRadius: '20px', textAlign: 'center' },
  emptyTitle: { fontSize: '18px', fontWeight: 700, margin: 0 },
  emptySub: { fontSize: '14px', color: '#6B5E9E', margin: 0 },
  retryBtn: { background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', color: 'white', border: 'none', borderRadius: '999px', padding: '12px 24px', cursor: 'pointer', fontWeight: 800, boxShadow: '0 12px 28px rgba(91,61,245,0.35)' },
  previewOverlay: { position: 'fixed', inset: 0, background: 'rgba(30,20,70,0.42)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 },
  previewModal: { width: 'min(760px, 96vw)', maxHeight: '86vh', background: 'rgba(255,255,255,0.97)', borderRadius: '24px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 24px 80px rgba(15, 23, 42, 0.25)', direction: 'inherit' },
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' },
  previewTitle: { margin: 0, fontSize: '18px', fontWeight: 800, color: '#1E2A4A' },
  previewSub: { margin: '4px 0 0', fontSize: '13px', color: '#7C5CFF', fontWeight: 700 },
  closePreview: { border: '1px solid #E9E4FB', borderRadius: '999px', background: 'white', padding: '8px 12px', cursor: 'pointer', fontWeight: 800 },
  previewText: { margin: 0, padding: '16px', background: '#F8F6FF', border: '1px solid #EDE8FC', borderRadius: '16px', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: 1.65, color: '#111827', direction: 'ltr', textAlign: 'left' },
  downloadPreview: { alignSelf: 'flex-start', border: 'none', borderRadius: '999px', background: '#12A96F', color: 'white', padding: '10px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' },
};

export default ApplicationsPage;

