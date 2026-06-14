// JoBoss features:
// - F-03: Job Discovery & Swipe Interface
// - F-05: Swipe Recording - Like & Pass
// - F-06: Undo Last Swipe
// - F-09: AI Resume Tailoring
// - F-13: Daily Swipe Quota Enforcement
// - F-22: Preference Mismatch Warning Modal
// - F-26: Discovery Mode - 30-Minute Window
// - F-27: Match Score Breakdown Modal
// - F-28: Show All Jobs Toggle

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ICON_SIZES from '../iconSizes';
import { CompanyLogo } from '../utils/companyLogos';
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimationControls } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';
import LimitModal from '../components/LimitModal';
import { getJobs, createSwipe, createApplication, updateMyProfile, getMySwipes, undoSwipe, getQuotaStatus, tailorCVForJob } from '../api';

const DESCRIPTION_SECTION_TITLES = new Set([
  'summary',
  'responsibilities',
  'requirements',
  'nice to have',
  'technologies',
]);

function parseJobDescription(description = '') {
  const sections = [];
  let currentSection = null;

  description
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const normalized = line.toLowerCase();

      if (DESCRIPTION_SECTION_TITLES.has(normalized)) {
        currentSection = { title: line, items: [] };
        sections.push(currentSection);
        return;
      }

      if (!currentSection) {
        currentSection = { title: 'Summary', items: [] };
        sections.push(currentSection);
      }

      currentSection.items.push(line.replace(/^[-•]\s*/, ''));
    });

  return sections;
}

function getJobSummary(description = '') {
  const summary = parseJobDescription(description)
    .find(section => section.title.toLowerCase() === 'summary');

  return summary?.items?.join(' ') || description;
}

// Trim a long Nominatim address ("street, neighborhood, city, district, ...,
// postcode, country") down to "street, city". Keeps already-short values as-is.
function shortenLocation(name = '') {
  const NOISE = /נפ[הת]|מחוז|מועצה|אזורית|ישראל|israel/i;
  const parts = name.split(',')
    .map(p => p.trim())
    .filter(p => p && !NOISE.test(p) && !/^\d{4,}$/.test(p));
  if (parts.length <= 2) return parts.join(', ');
  // First = street, last = city; drop the middle (neighborhood/county noise).
  return `${parts[0]}, ${parts[parts.length - 1]}`;
}

function JobDescription({ description }) {
  const sections = parseJobDescription(description);

  if (!sections.length) return null;

  return (
    <div style={modal.descriptionPanel}>
      {sections.map((section) => {
        const normalizedTitle = section.title.toLowerCase();
        const isBulletSection = ['responsibilities', 'requirements', 'nice to have'].includes(normalizedTitle);
        const isTechnologySection = normalizedTitle === 'technologies';

        return (
          <div key={section.title} style={modal.descriptionSection}>
            <h4 style={modal.descriptionHeading}>{section.title}</h4>

            {isTechnologySection ? (
              <div style={modal.techList}>
                {section.items.join(', ').split(',').map(item => item.trim()).filter(Boolean).map(item => (
                  <span key={item} style={modal.techPill}>{item}</span>
                ))}
              </div>
            ) : isBulletSection ? (
              <ul style={modal.bulletList}>
                {section.items.map((item, index) => (
                  <li key={`${section.title}-${index}`} style={modal.bulletItem}>{item}</li>
                ))}
              </ul>
            ) : (
              <p style={modal.descriptionText}>{section.items.join(' ')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Job detail modal (unchanged) ────────────────────────────────────────────
function JobDetailModal({ job, onClose }) {

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} style={modal.overlay} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.22, ease: 'easeIn' } }}
        transition={{ type: 'spring', damping: 32, stiffness: 280 }}
        style={modal.sheet} onClick={(e) => e.stopPropagation()}
      >
        {/* ── Sticky header ── */}
        <div style={modal.stickyHeader}>
          <div style={modal.dragHandle} />
          <div style={modal.header}>
            <CompanyLogo company={job.company} style={modal.logo} />
            <div style={{ flex: 1 }}>
              <h2 style={modal.title}>{job.title}</h2>
              <p style={modal.company}>{job.company}</p>
            </div>
            <button style={modal.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div style={modal.meta}>
            <span style={modal.metaItem}>📍 {job.location}</span>
            {job.distanceKm != null && (
              <span style={{ ...modal.metaItem, background: '#E8F5E9', color: '#2E7D32' }}>🗺 {job.distanceKm.toFixed(1)} ק"מ</span>
            )}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={modal.scrollBody}>
          {(job.technologies || job.requirements)?.length > 0 && (
            <div style={modal.section}>
              <p style={modal.sectionTitle}>טכנולוגיות נדרשות</p>
              <div style={modal.tags}>
                {(job.technologies || job.requirements).map(t => <span key={t} style={modal.tag}>{t}</span>)}
              </div>
            </div>
          )}
          {job.description && (
            <div style={modal.section}>
              <p style={modal.sectionTitle}>תיאור המשרה</p>
              <JobDescription description={job.description} />
            </div>
          )}
          {job.applyUrl && (
            <div style={modal.section}>
              <a href={job.applyUrl} target="_blank" rel="noreferrer" style={modal.applyLink}>🔗 לינק למשרה המקורית</a>
            </div>
          )}
        </div>

        {/* ── Sticky footer ── */}
        <div style={modal.stickyFooter}>
          <button style={modal.passBtn} onClick={onClose}>דלג ✕</button>
          <button style={modal.applyBtn} onClick={() => onClose('apply')}>הגש ♥</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Domain / level helpers ────────────────────────────────────────────────────
const DOMAIN_HE = {
  'frontend developer':  'פרונטאנד',
  'backend developer':   'בקאנד',
  'full stack developer':'פול-סטאק',
  'mobile developer':    'מובייל',
  'devops':              'DevOps',
  'data scientist':      'Data Science',
  'data engineer':       'Data Eng',
  'qa engineer':         'QA',
  'security engineer':   'סייבר',
  'product manager':     'PM',
  'designer':            'עיצוב',
  'embedded':            'Embedded',
  'ai engineer':         'AI',
};
const LEVEL_HE = { junior: 'Junior', mid: 'Mid', senior: 'Senior', student: 'סטודנט' };

function DomainTags({ domains = [], levels = [] }) {
  const tags = [
    ...domains.slice(0, 2).map(d => ({ label: DOMAIN_HE[d] || d, color: '#6C4FD4', bg: '#F0EEFF' })),
    ...levels.slice(0, 1).map(l => ({ label: LEVEL_HE[l] || l, color: '#2E7D32', bg: '#E8F5E9' })),
  ];
  if (!tags.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
      {tags.map(t => (
        <span key={t.label} style={{ fontSize: '11px', fontWeight: 700, color: t.color,
          background: t.bg, border: `1px solid ${t.color}30`,
          padding: '2px 8px', borderRadius: 20 }}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

function DiscoveryPreview({ jobs }) {
  if (!jobs.length) return null;
  const allDomains = [...new Set(jobs.flatMap(j => j.jobDomains || []))].slice(0, 6);
  const allLevels  = [...new Set(jobs.flatMap(j => j.jobLevel || []))].slice(0, 2);
  return (
    <div style={{ width: '100%', background: '#FFF8F0', border: '1px solid #FFD0A0', borderRadius: 16,
                  padding: 'clamp(8px, 1.5svh, 14px) 16px', marginTop: 0, textAlign: 'right' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#E65100', marginBottom: 6 }}>כוללות תחומים כגון:</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {allDomains.map(d => (
          <span key={d} style={{ fontSize: 12, fontWeight: 600, color: '#6C4FD4',
            background: '#F0EEFF', border: '1px solid #6C4FD430',
            padding: '3px 10px', borderRadius: 20 }}>
            {DOMAIN_HE[d] || d}
          </span>
        ))}
        {allLevels.map(l => (
          <span key={l} style={{ fontSize: 12, fontWeight: 600, color: '#2E7D32',
            background: '#E8F5E9', border: '1px solid #2E7D3230',
            padding: '3px 10px', borderRadius: 20 }}>
            {LEVEL_HE[l] || l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Match score breakdown modal ───────────────────────────────────────────────
function MatchModal({ score, breakdown, onClose }) {
  const { roleScore=0, expScore=0, distScore=0,
          matchedRoles=[], unmatchedRoles=[], cvHintKeywords=[],
          userLevel='', detectedLevels=[], distanceKm, isRemote } = breakdown || {};

  const Row = ({ label, score, max, children }) => {
    const pct = Math.round((score / max) * 100);
    const barColor = pct >= 70 ? '#4CAF50' : pct >= 40 ? '#FF9800' : '#F44336';
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1E2A4A' }}>{label}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: barColor }}>{score}/{max}</span>
        </div>
        <div style={{ height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
        </div>
        {children}
      </div>
    );
  };

  const Chip = ({ label, color, bg }) => (
    <span style={{ fontSize: 12, fontWeight: 600, color, background: bg,
                   border: `1px solid ${color}30`, padding: '2px 10px',
                   borderRadius: 20, display: 'inline-block' }}>{label}</span>
  );

  const levelHe = { junior: 'Junior', mid: 'Mid', senior: 'Senior', student: 'סטודנט' };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={modal.overlay}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          style={{ ...modal.sheet, direction: 'rtl', gap: 0 }}
          onClick={e => e.stopPropagation()}
        >

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1E2A4A' }}>פירוט ציון התאמה</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800,
                             color: score >= 70 ? '#2E7D32' : score >= 50 ? '#E65100' : '#757575' }}>
                {score}%
              </span>
              <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', borderRadius: '50%',
                                                  width: 30, height: 30, cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* Role */}
          <Row label="🎯 התאמת תפקיד" score={roleScore} max={50}>
            {matchedRoles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
                {matchedRoles.map(r => <Chip key={r} label={`✓ ${DOMAIN_HE[r] || r}`} color="#2E7D32" bg="#E8F5E9" />)}
              </div>
            )}
            {unmatchedRoles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
                {unmatchedRoles.map(r => <Chip key={r} label={`✗ ${DOMAIN_HE[r] || r}`} color="#c62828" bg="#FFEBEE" />)}
              </div>
            )}
            {cvHintKeywords.length > 0 && (
              <div style={{ marginTop: 6, padding: '8px 12px', background: '#FFF8E1',
                            borderRadius: 10, border: '1px solid #FFD54F' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#F57F17', marginBottom: 4 }}>
                  💡 הוסף לקורות חיים כדי לשפר את הציון:
                </div>
                <div style={{ fontSize: 12, color: '#555', direction: 'ltr', textAlign: 'left' }}>
                  {cvHintKeywords.join(' · ')}
                </div>
              </div>
            )}
          </Row>

          {/* Experience */}
          <Row label="🎓 רמת ניסיון" score={expScore} max={30}>
            {userLevel && (
              <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                הרמה שהגדרת: <strong>{levelHe[userLevel] || userLevel}</strong>
                {detectedLevels.length > 0 && (
                  <> · המשרה מחפשת: <strong>{detectedLevels.map(l => levelHe[l] || l).join(', ')}</strong></>
                )}
              </div>
            )}
            {expScore === 0 && userLevel && detectedLevels.length > 0 && (
              <div style={{ fontSize: 12, padding: '6px 10px', background: '#FFEBEE',
                            borderRadius: 8, color: '#c62828' }}>
                💡 הדגש בקורות חיים ניסיון המתאים לרמת {detectedLevels.map(l => levelHe[l] || l).join('/')}
              </div>
            )}
          </Row>

          {/* Distance */}
          <Row label="📍 מרחק" score={distScore} max={20}>
            <div style={{ fontSize: 12, color: '#555' }}>
              {isRemote ? 'עבודה מרחוק — ניקוד מלא'
                : distanceKm != null ? `${distanceKm} ק"מ ממיקומך`
                : 'לא נמצא מיקום למשרה'}
            </div>
          </Row>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Match score badge (stateless — parent controls open) ─────────────────────
function MatchBadge({ score, onClick }) {
  const color = score >= 70 ? '#2E7D32' : score >= 50 ? '#E65100' : '#757575';
  const bg    = score >= 70 ? '#E8F5E9' : score >= 50 ? '#FFF3E0' : '#F5F5F5';
  return (
    <div
      onClick={onClick}
      style={{ fontSize: '12px', fontWeight: 700, color, background: bg,
               border: `1px solid ${color}40`, padding: '4px 10px',
               borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0,
               cursor: 'pointer', userSelect: 'none' }}
    >
      {score}% התאמה ℹ️
    </div>
  );
}

// ── Job card ─────────────────────────────────────────────────────────────────
// ── Job background image mapping ─────────────────────────────────────────────
const JOB_BG_IMAGES = {
  frontend:   'https://images.unsplash.com/photo-1547658719-da2b51169166?w=480&auto=format&q=75',
  backend:    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=480&auto=format&q=75',
  fullstack:  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=480&auto=format&q=75',
  mobile:     'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=480&auto=format&q=75',
  data:       'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=480&auto=format&q=75',
  ai:         'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=480&auto=format&q=75',
  devops:     'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=480&auto=format&q=75',
  design:     'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=480&auto=format&q=75',
  marketing:  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=480&auto=format&q=75',
  management: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=480&auto=format&q=75',
  finance:    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=480&auto=format&q=75',
  security:   'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=480&auto=format&q=75',
  sales:      'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=480&auto=format&q=75',
  hr:         'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=480&auto=format&q=75',
  qa:         'https://images.unsplash.com/photo-1518349619113-03114f06ac3a?w=480&auto=format&q=75',
  default:    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=480&auto=format&q=75',
};

function getJobBgImage(title = '', tech = []) {
  const t = (title + ' ' + tech.join(' ')).toLowerCase();
  if (/front.?end|ui.?dev|react|vue|angular|css|html|svelte/.test(t))          return JOB_BG_IMAGES.frontend;
  if (/back.?end|node|python|java |spring|\.net|ruby|php|api.?dev|server/.test(t)) return JOB_BG_IMAGES.backend;
  if (/full.?stack/.test(t))                                                    return JOB_BG_IMAGES.fullstack;
  if (/mobile|android|ios|flutter|swift|kotlin|react.?native/.test(t))         return JOB_BG_IMAGES.mobile;
  if (/\bdata\b|analyst|bi |sql|spark|hadoop|tableau|power.?bi/.test(t))        return JOB_BG_IMAGES.data;
  if (/\bai\b|ml |machine.?learn|deep.?learn|nlp|llm|computer.?vision/.test(t)) return JOB_BG_IMAGES.ai;
  if (/devops|sre|cloud|aws|azure|gcp|kubernetes|docker|infra|platform/.test(t)) return JOB_BG_IMAGES.devops;
  if (/design|ux|ui\/ux|product.?design|figma|sketch|creative/.test(t))        return JOB_BG_IMAGES.design;
  if (/market|growth|seo|content|brand|social.?media|digital/.test(t))         return JOB_BG_IMAGES.marketing;
  if (/manag|lead|director|\bvp\b|head of|cto|cpo|coo|scrum|agile|product/.test(t)) return JOB_BG_IMAGES.management;
  if (/financ|account|invest|trading|quant|fintech|audit/.test(t))             return JOB_BG_IMAGES.finance;
  if (/security|cyber|pentest|soc|infosec|cryptograph/.test(t))                return JOB_BG_IMAGES.security;
  if (/sales|account.?exec|bdr|sdr|business.?dev/.test(t))                     return JOB_BG_IMAGES.sales;
  if (/\bhr\b|human.?resource|recruit|talent|people.?ops/.test(t))             return JOB_BG_IMAGES.hr;
  if (/qa|quality|test.?eng|automation.?test/.test(t))                         return JOB_BG_IMAGES.qa;
  return JOB_BG_IMAGES.default;
}

function JobCard({ job, onSwipe, onOpenDetail, locked, locationFilter }) {
  const [isDragging, setIsDragging] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const matchTapRef = useRef(false);
  const cardControls = useAnimationControls();  // blocks card onTap when badge was clicked
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragEnd = (_, info) => {
    if (locked) return;
    if (info.offset.x > 100) onSwipe('right');
    else if (info.offset.x < -100) onSwipe('left');
    setTimeout(() => setIsDragging(false), 150);
  };

  const handleBadgeClick = (e) => {
    e.stopPropagation();
    matchTapRef.current = true;
    setMatchOpen(true);
  };

  return (
    <>
    <motion.div
      animate={cardControls}
      style={{ x, rotate, opacity, ...styles.card, zIndex: 1, filter: locked ? 'blur(4px)' : 'none' }}
      drag={locked ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      onDragStart={() => !locked && setIsDragging(true)}
      onDragEnd={handleDragEnd}
      onTap={async () => {
        if (matchTapRef.current) { matchTapRef.current = false; return; }
        if (locked || isDragging) return;
        await cardControls.start({
          scale: [1, 1.03, 1],
          y: [0, -8, 0],
          transition: { duration: 0.25, ease: 'easeInOut' },
        });
        onOpenDetail();
      }}
      whileTap={locked ? {} : { cursor: 'grabbing' }}
    >
      {!locked && <motion.div style={{ ...styles.stamp, ...styles.likeStamp, opacity: likeOpacity, pointerEvents: 'none' }}><img src="/icons/yes_icon.png" alt="YES" draggable="false" style={{ height: `${ICON_SIZES.stampYes}px`, objectFit: 'contain' }} /></motion.div>}
      {!locked && <motion.div style={{ ...styles.stamp, ...styles.nopeStamp, opacity: nopeOpacity, pointerEvents: 'none' }}><img src="/icons/nope_icon.png" alt="NOPE" draggable="false" style={{ height: `${ICON_SIZES.stampNope}px`, objectFit: 'contain' }} /></motion.div>}

      {/* Hero — full-image with overlaid content */}
      <div style={styles.cardHero}>
        <img
          src={getJobBgImage(job.title, job.technologies || job.requirements || [])}
          alt=""
          style={styles.cardHeroImg}
          draggable="false"
          loading="lazy"
        />
        <div style={styles.cardHeroOverlay} />

        {/* Top-left: match badge */}
        {job.matchScore != null && (
          <div style={styles.cardHeroMatchBadge}>
            <MatchBadge score={job.matchScore} onClick={handleBadgeClick} />
          </div>
        )}

        {/* Bottom row: title+location on left, company chip on right */}
        <div style={styles.cardHeroBottom}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={styles.cardHeroTitle}>{job.title}</h3>
            <p style={styles.cardHeroMeta}>📍 {job.location}</p>
            {job.distanceKm != null && (
              <p style={styles.cardHeroDistance} dir="rtl">
                🚗 <span dir="ltr">{job.distanceKm.toFixed(1)}</span> ק״מ ממך
              </p>
            )}
          </div>
          <div style={styles.cardHeroLogoWrap}>
            <span style={styles.cardHeroCompany}>{job.company}</span>
            <div style={styles.cardHeroLogoChip}>
              <CompanyLogo company={job.company} style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'contain', background: 'white', flexShrink: 0 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Card body — chips + description + tech */}
      <div style={styles.cardBody}>
        {job.matchesPreferences === false && (
          <DomainTags domains={job.jobDomains} levels={job.jobLevel} />
        )}
        <p style={styles.description}>{job.shortDescription || getJobSummary(job.description)}</p>
        <div style={styles.techContainer}>
          {(job.technologies || job.requirements || []).slice(0, 4).map(t => <span key={t} style={styles.techBadge}>{t}</span>)}
        </div>
        {!locked && (
          <div style={styles.tapHint}>
            <motion.img
              src="/icons/clickHere_icon.png"
              alt="לחץ לפרטים נוספים"
              style={{ width: 'min(200px, 65%)', height: 'auto', objectFit: 'contain' }}
              draggable="false"
              animate={!isDragging ? { y: [0, -5, 0], opacity: [0.85, 1, 0.85] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        )}
      </div>
    </motion.div>
    {matchOpen && job.matchBreakdown && (
      <MatchModal score={job.matchScore} breakdown={job.matchBreakdown} onClose={() => setMatchOpen(false)} />
    )}
    </>
  );
}

// ── Quota counter bar ────────────────────────────────────────────────────────
function QuotaBar({ quota, onUpgradeClick, onRefresh }) {
  // PREMIUM_PLUS is unlimited — no counter needed.
  // FREE and PREMIUM both have a finite daily limit: show the bar for both.
  if (!quota || quota.unlimited) return null;

  const plan = quota.plan || 'FREE';
  const pct = Math.min(100, Math.round(((quota.used ?? 0) / quota.limit) * 100));
  const barColor = pct >= 100 ? '#F44336' : pct >= 80 ? '#FF9800' : '#6C4FD4';

  return (
    <motion.div
      style={styles.quotaBar}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div style={styles.quotaBarTop}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#6C4FD4' }}>
          {quota.remaining === 0
            ? '🔒 הגעת למגבלה'
            : <><span dir="ltr">{quota.used ?? 0} / {quota.limit}</span> החלקות היום</>}
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button style={styles.quotaRefreshBtn} onClick={onRefresh} title="רענן משרות">
            <img src="/icons/refresh_icon.png" alt="רענן" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
          </button>
          {plan === 'FREE' && (
            <button style={styles.quotaUpgradeBtn} onClick={onUpgradeClick}>שדרג ⭐</button>
          )}
        </div>
      </div>
      <div style={styles.quotaBarBg}>
        <motion.div
          style={{ ...styles.quotaBarFill, background: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {plan === 'PREMIUM' && quota.tailorLimit != null && (
        <div style={styles.tailorQuotaRow}>
          <span style={styles.tailorQuotaLabel}>
            <img src="/icons/robot_icon.png" alt="" style={{ width: '13px', height: '13px', objectFit: 'contain', verticalAlign: 'middle' }} />
            {' '}התאמות AI החודש
          </span>
          <span style={{
            ...styles.tailorQuotaCount,
            color: quota.tailorRemaining === 0 ? '#F44336' : quota.tailorRemaining <= 2 ? '#FF9800' : '#6C4FD4',
          }}>
            <span dir="ltr">{quota.tailorUsed} / {quota.tailorLimit}</span>
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function SwipePage() {
  const [jobs, setJobs] = useState([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSwipe, setLastSwipe] = useState(null);
  const [showUndo, setShowUndo] = useState(false);
  const undoTimerRef = useRef(null);
  const [swipedRight, setSwipedRight] = useState(0);
  const [selectedJob, setSelectedJob] = useState(null);
  const [locationFilter, setLocationFilter] = useState(null);
  const [locationFilterFailed, setLocationFilterFailed] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const [swipedJobs, setSwipedJobs] = useState(new Set());
  const [quota, setQuota] = useState(null);          // { plan, limit, used, remaining, unlimited, resetAt }
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [limitModal, setLimitModal] = useState(false);
  const [tailorLimitToast, setTailorLimitToast] = useState(false);
  const [activeTailorJobs, setActiveTailorJobs] = useState([]); // [{ jobId, company }]
  const autoTailorCV = localStorage.getItem('autoTailorCV') === 'true' && quota?.plan !== 'FREE';
  const showAllJobsPref = localStorage.getItem('showAllJobs') === 'true';
  const [discoveryUntil, setDiscoveryUntil] = useState(() => {
    const saved = Number(localStorage.getItem('discoveryUntil') || 0);
    return saved > Date.now() ? saved : null;
  });
  const [nowTick, setNowTick] = useState(Date.now());
  const navigate = useNavigate();

  // Auto-expire discovery mode
  useEffect(() => {
    if (!discoveryUntil) return;
    const remaining = discoveryUntil - Date.now();
    if (remaining <= 0) { setDiscoveryUntil(null); localStorage.removeItem('discoveryUntil'); return; }
    const expire = setTimeout(() => { setDiscoveryUntil(null); localStorage.removeItem('discoveryUntil'); }, remaining);
    // Update minute display every 60s
    const tick = setInterval(() => setNowTick(Date.now()), 60000);
    return () => { clearTimeout(expire); clearInterval(tick); };
  }, [discoveryUntil]);

  const discoveryActive = showAllJobsPref || (discoveryUntil && nowTick < discoveryUntil);

  const activateDiscovery = () => {
    if (showAllJobsPref) return; // already permanent
    const until = Date.now() + 30 * 60 * 1000;
    setDiscoveryUntil(until);
    setNowTick(Date.now());
    localStorage.setItem('discoveryUntil', String(until));
  };

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getJobs();
      const jobList = data.jobs || [];
      setJobs(jobList);
      setTotalJobs(jobList.length);
      setLocationFilterFailed(data.locationFilterFailed === true);
      const lat = localStorage.getItem('jobLatitude');
      const lng = localStorage.getItem('jobLongitude');
      const radius = localStorage.getItem('jobRadius');
      if (lat && lng && radius && !data.locationFilterFailed) {
        setLocationFilter({ name: localStorage.getItem('jobLocation') || 'מיקום נוכחי', radius: Number(radius) });
      }
    } catch {
      setError('אין חיבור לשרת. אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, []);

  const getResetTime = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  };

  const loadQuota = useCallback(async () => {
    setQuotaLoading(true);
    try {
      const q = await getQuotaStatus();
      setQuota(q);
    } catch (e) {
      console.error('QUOTA LOAD FAILED:', e?.message, e?.status);
      // On any failure, assume limit is reached — prevents bypass if backend is unreachable
      setQuota({ plan: 'FREE', limit: 5, used: 5, remaining: 0, unlimited: false, resetAt: getResetTime() });
    } finally {
      setQuotaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    loadQuota();
  }, [loadJobs, loadQuota]);

  useEffect(() => {
    const loadSwipes = async () => {
      try {
        const data = await getMySwipes();
        const swipes = data.swipes || [];
        setSwipedJobs(new Set(swipes.map(s => s.jobId)));
        // Seed the "applied" counter from persisted LIKE swipes so it reflects
        // past right-swipes (not just the current session). It then keeps
        // incrementing/decrementing via handleSwipe/handleUndo.
        setSwipedRight(swipes.filter(s => s.decision === 'LIKE').length);
      } catch {}
    };
    loadSwipes();
  }, []);

  const allUnseen = jobs.filter(j => !swipedJobs.has(j.jobId));
  const primaryJobs   = allUnseen.filter(j => j.matchesPreferences !== false);
  const discoveryJobs = allUnseen.filter(j => j.matchesPreferences === false);
  const filteredJobs  = discoveryActive ? allUnseen : primaryJobs;
  const currentJob = filteredJobs[filteredJobs.length - 1];
  const nextJob = filteredJobs[filteredJobs.length - 2];

  // Only lock when quota is confirmed from backend — never while loading
  const isLocked = !quotaLoading && quota && !quota.unlimited && quota.remaining <= 0;
  // Blocks all swipe interactions: confirmed locked OR still loading
  const isBlocked = quotaLoading || isLocked;

  const handleSwipe = async (direction) => {
    if (!currentJob) return;
    if (quotaLoading) return;  // never swipe before quota is confirmed

    if (direction === 'right') {
      if (isLocked) {
        setLimitModal(true);
        return;
      }
      // Optimistic update so rapid taps see the new remaining before API responds
      if (quota && !quota.unlimited) {
        setQuota(q => ({
          ...q,
          remaining: Math.max(0, (q.remaining ?? 0) - 1),
          used: (q.used || 0) + 1,
        }));
      }
    }

    setLastSwipe({ direction, job: currentJob });
    setSwipedJobs(prev => new Set([...prev, currentJob.jobId]));
    if (direction === 'right') setSwipedRight(p => p + 1);
    setShowUndo(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setShowUndo(false), 5000);
    setJobs(prev => prev.slice(0, -1));

    try {
      const result = await createSwipe(currentJob.jobId, direction === 'right' ? 'LIKE' : 'PASS', {
        company: currentJob.company,
        title: currentJob.title,
      });

      // Authoritative quota from server replaces optimistic value
      if (result?.quota) {
        setQuota(q => ({ ...q, ...result.quota, unlimited: result.quota.unlimited ?? q?.unlimited }));
      }

      if (direction === 'right' && autoTailorCV) {
        const tailorJob = { jobId: currentJob.jobId, company: currentJob.company };
        setActiveTailorJobs(prev => [...prev, tailorJob]);

        tailorCVForJob(currentJob.jobId, true)
          .then(result => {
            setActiveTailorJobs(prev => prev.filter(j => j.jobId !== currentJob.jobId));
            window.dispatchEvent(new CustomEvent('tailorComplete', {
              detail: { jobId: currentJob.jobId, tailoredResume: result.tailoredResume, tailoredResumeUrl: result.tailoredResumeUrl }
            }));
          })
          .catch((err) => {
            setActiveTailorJobs(prev => prev.filter(j => j.jobId !== currentJob.jobId));
            window.dispatchEvent(new CustomEvent('tailorError', { detail: { jobId: currentJob.jobId } }));
            if (err?.code === 'AI_LIMIT_REACHED' || err?.status === 429) {
              setTailorLimitToast(true);
              setTimeout(() => setTailorLimitToast(false), 5000);
            }
          });
      }
    } catch (err) {
      if (err.status === 429 || err.code === 'LIMIT_REACHED') {
        setSwipedJobs(prev => { const s = new Set(prev); s.delete(currentJob.jobId); return s; });
        setJobs(prev => [...prev, currentJob]);
        if (direction === 'right') setSwipedRight(p => Math.max(0, p - 1));
        setLastSwipe(null);
        setLimitModal(true);
        if (err.data) setQuota(err.data);
      } else if (direction === 'right' && quota && !quota.unlimited) {
        // Roll back optimistic update on non-429 errors
        setQuota(q => ({
          ...q,
          remaining: (q.remaining ?? 0) + 1,
          used: Math.max(0, (q.used || 0) - 1),
        }));
      }
    }
  };

  const handleUndo = async () => {
    if (!lastSwipe) return;
    setShowUndo(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    try {
      await undoSwipe(lastSwipe.job.jobId);
      setSwipedJobs(prev => { const s = new Set(prev); s.delete(lastSwipe.job.jobId); return s; });
      setJobs(prev => [...prev, lastSwipe.job]);
      if (lastSwipe.direction === 'right') {
        setSwipedRight(p => Math.max(0, p - 1));
        setQuota(q => q ? { ...q, used: Math.max(0, (q.used || 0) - 1), remaining: q.limit === -1 ? -1 : (q.remaining || 0) + 1 } : q);
      }
      setLastSwipe(null);
    } catch (e) {
      if (e?.code === 'ALREADY_APPLIED') {
        alert('המועמדות כבר נשלחה על ידי Auto Apply ולא ניתן לבטל אותה');
      } else {
        alert('❌ שגיאה בביטול Swipe');
      }
    }
  };

  const handleModalClose = (action) => {
    if (action === 'apply') handleSwipe('right');
    setSelectedJob(null);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <Spinner text="טוען משרות..." />
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', gap: '16px' }}>
      <p style={{ fontSize: '48px' }}>⚠️</p>
      <p style={{ fontSize: '18px', fontWeight: 700, color: '#F44336' }}>{error}</p>
      <button style={{ background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white', border: 'none', borderRadius: '20px', padding: '12px 24px', cursor: 'pointer', fontWeight: 700 }} onClick={loadJobs}>נסה שוב</button>
    </div>
  );

  // Upgrade prompt overlaid on top of the (blurred) cards when the daily limit
  // is reached. Shared between the "jobs remaining" and "feed exhausted" cases.
  const lockedOverlay = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={styles.lockedOverlay}
      onClick={() => setLimitModal(true)}
    >
      <div style={styles.lockedContent}>
        <span style={{ fontSize: '40px' }}>🔒</span>
        <p style={styles.lockedTitle}>הגעת למגבלה היומית</p>
        <p style={styles.lockedSub}>שדרג כדי להמשיך</p>
        <button style={styles.lockedBtn}>שדרג עכשיו ⭐</button>
      </div>
    </motion.div>
  );

  return (
    <div style={styles.container}>
      {/* Quota bar */}
      <QuotaBar quota={quota} onUpgradeClick={() => navigate('/profile?tab=subscription')} onRefresh={loadJobs} />

      {/* Location filter fell back to unfiltered results — let the user know */}
      {locationFilterFailed && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                   fontSize: 12, fontWeight: 600, color: '#B45309',
                   background: '#FFF8E1', border: '1px solid #FFE082',
                   borderRadius: 10, padding: '6px 12px', marginBottom: 6,
                   maxWidth: 'min(360px, 95vw)' }}
        >
          ⚠️ סינון לפי מיקום לא זמין כרגע — מוצגות משרות מכל הארץ
        </motion.div>
      )}

      {/* Discovery mode active banner */}
      {!showAllJobsPref && discoveryUntil && nowTick < discoveryUntil && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                   fontSize: 12, fontWeight: 600, color: '#E65100',
                   background: '#FFF3E0', border: '1px solid #FFB74D',
                   borderRadius: 20, padding: '4px 14px', alignSelf: 'center' }}
        >
          🔍 מציג כל המשרות · נגמר בעוד {Math.max(1, Math.ceil((discoveryUntil - nowTick) / 60000))} דק'
        </motion.div>
      )}

      {/* Auto-tailor progress indicator */}
      <AnimatePresence>
        {activeTailorJobs.length > 0 && (
          <motion.div
            key="tailor-progress"
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.2 }}
            style={styles.tailorProgressBanner}
          >
            {activeTailorJobs.map(job => (
              <div key={job.jobId} style={styles.tailorProgressRow}>
                <motion.img
                  src="/icons/robot_icon.png"
                  alt=""
                  style={styles.tailorProgressIcon}
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span style={styles.tailorProgressText}>מתאים CV ל-{job.company}...</span>
                <motion.div
                  style={styles.tailorProgressDots}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  ●●●
                </motion.div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={styles.cardContainer}>
        {filteredJobs.length > 0 ? (
          <>
            {/* Next card preview */}
            {nextJob && (
              <motion.div style={{ ...styles.card, position: 'absolute', zIndex: 0, top: '10px', filter: 'blur(1.5px)', opacity: 0.6, transform: 'scale(0.95)', pointerEvents: 'none' }}>
                <div style={styles.cardHero}>
                  <img src={getJobBgImage(nextJob.title, nextJob.technologies || nextJob.requirements || [])} alt="" style={styles.cardHeroImg} draggable="false" />
                  <div style={styles.cardHeroOverlay} />
                  <div style={styles.cardHeroBottom}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={styles.cardHeroTitle}>{nextJob.title}</h3>
                      <p style={styles.cardHeroMeta}>📍 {nextJob.location}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <AnimatePresence>
              <JobCard
                key={currentJob.jobId}
                job={currentJob}
                onSwipe={handleSwipe}
                onOpenDetail={() => !isBlocked && setSelectedJob(currentJob)}
                locked={isBlocked}
                locationFilter={locationFilter}
              />
            </AnimatePresence>

            {/* Locked overlay (limit reached, jobs still in feed = blurred teaser) */}
            {isLocked && lockedOverlay}
          </>
        ) : isLocked ? (
          // Daily limit reached AND the visible feed is exhausted: still show the
          // limit UI (blurred placeholder teaser + upgrade overlay), NOT the
          // "all done" empty state.
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ ...styles.card, filter: 'blur(5px)', opacity: 0.5, pointerEvents: 'none' }}
            >
              <div style={styles.cardHeader}>
                <div style={{ ...styles.logo_placeholder }}>★</div>
                <div><h2 style={styles.company}>משרה נוספת</h2><p style={styles.location}>📍  זמין אחרי שדרוג</p></div>
              </div>
              <h3 style={styles.title}>משרה מחכה לך</h3>
              <p style={styles.salary}>💰 ———</p>
            </motion.div>
            {lockedOverlay}
          </>
        ) : !discoveryActive && discoveryJobs.length > 0 ? (
          // Primary deck exhausted but discovery jobs available
          <motion.div style={{ ...styles.emptyState, height: '100%', justifyContent: 'center', gap: 'clamp(6px, 1.6svh, 14px)', padding: 'clamp(8px, 2svh, 24px) 16px' }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <motion.p style={{ fontSize: 'clamp(34px, 7svh, 64px)', margin: 0, lineHeight: 1 }} animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 1, delay: 0.2 }}>🔍</motion.p>
            <p style={{ ...styles.emptyTitle, fontSize: 'clamp(17px, 2.6svh, 24px)' }}>סיימת את המשרות בתחומך</p>
            <p style={{ ...styles.emptySubtitle, fontSize: 'clamp(12px, 1.7svh, 14px)' }}>יש עוד {discoveryJobs.length} משרות מתחומים אחרים</p>
            <DiscoveryPreview jobs={discoveryJobs.slice(0, 5)} />
            <motion.button
              style={{ ...styles.emptyBtn, background: 'linear-gradient(135deg, #FF6B6B, #E65100)', marginTop: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: 'clamp(8px, 1.4svh, 14px) 28px', fontSize: 'clamp(13px, 1.9svh, 16px)' }}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={activateDiscovery}
            >
              <span>הצג משרות מחוץ לתחומך</span>
              <span style={{ fontSize: 'clamp(10px, 1.4svh, 11px)', fontWeight: 500, opacity: 0.9 }}>ההצגה תהיה פעילה למשך 30 דקות</span>
            </motion.button>
            <motion.button style={{ ...styles.emptyBtn, background: 'transparent', color: '#6C4FD4', border: '1px solid #6C4FD4', marginTop: 0, padding: 'clamp(8px, 1.4svh, 14px) 28px', fontSize: 'clamp(13px, 1.9svh, 16px)' }}
              whileHover={{ scale: 1.03 }} onClick={() => navigate('/applications')}>📋 ראה הגשות</motion.button>
          </motion.div>
        ) : (
          // Genuinely out of all jobs — the "all done" celebration.
          <motion.div style={styles.emptyState} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <motion.p style={{ fontSize: '80px', margin: 0 }} animate={{ rotate: [0, 10, -10, 10, 0] }} transition={{ duration: 1, delay: 0.3 }}>🎉</motion.p>
            <p style={styles.emptyTitle}>סיימת את כל המשרות!</p>
            <p style={styles.emptySubtitle}>חזור מחר למשרות חדשות</p>
            <div style={styles.emptyStats}>
              <div style={styles.emptyStatItem}><p style={styles.emptyStatNumber}>{totalJobs}</p><p style={styles.emptyStatLabel}>נסקרו</p></div>
              <div style={styles.emptyStatDivider} />
              <div style={styles.emptyStatItem}><p style={styles.emptyStatNumber}>{swipedRight}</p><p style={styles.emptyStatLabel}>הוגשו</p></div>
            </div>
            <motion.button style={styles.emptyBtn} whileHover={{ scale: 1.05 }} onClick={() => navigate('/applications')}>📋 ראה הגשות</motion.button>
          </motion.div>
        )}
      </div>

      {/* Action buttons — hidden while loading quota or confirmed locked */}
      {filteredJobs.length > 0 && !isBlocked && (
        <div style={styles.buttons}>
          <motion.button style={styles.rejectBtn} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleSwipe('left')}><img src="/icons/x_icon.png" alt="Pass" style={styles.swipeIcon} /></motion.button>

          {/* Undo — always takes the same space so X/heart never shift */}
          <div style={styles.undoBtnSlot}>
            <AnimatePresence>
              {showUndo && lastSwipe && (
                <motion.button
                  style={styles.undoBtn}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={handleUndo}
                  aria-label="בטל Swipe"
                >
                  {/* Countdown ring */}
                  <svg style={{ position: 'absolute', inset: '-4px', width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', overflow: 'visible', pointerEvents: 'none' }}>
                    <motion.circle
                      key={lastSwipe.job.jobId}
                      cx="50%" cy="50%" r="50%"
                      fill="none"
                      stroke="#6C4FD4"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      style={{ rotate: -90, transformOrigin: '50% 50%' }}
                      strokeDasharray={`${2 * Math.PI * 35}`}
                      initial={{ strokeDashoffset: 0 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 35 }}
                      transition={{ duration: 5, ease: 'linear' }}
                    />
                  </svg>
                  <img src="/icons/undo_icon.png" alt="undo" style={{ width: '54px', height: '54px', objectFit: 'contain', position: 'relative', zIndex: 1 }} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <motion.button style={styles.acceptBtn} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleSwipe('right')}><img src="/icons/heart_icon.png" alt="Like" style={styles.swipeIcon} /></motion.button>
        </div>
      )}

      {/* Locked action buttons hint */}
      {filteredJobs.length > 0 && isLocked && (
        <motion.button
          style={styles.unlockBtn}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setLimitModal(true)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          🔓 שדרג להמשיך להחליק
        </motion.button>
      )}

      {tailorLimitToast && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={styles.tailorLimitToast}
        >
          ⚠️ הגעת למגבלת 10 ההתאמות החודשיות — ה-CV לא יותאם למשרה זו
        </motion.div>
      )}

      {lastSwipe && filteredJobs.length > 0 && !isBlocked && (
        <motion.p key={lastSwipe.job.jobId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={styles.feedback}>
          {lastSwipe.direction === 'right'
            ? activeTailorJobs.some(j => j.jobId === lastSwipe.job.jobId)
              ? `⏳ הגשה אוטומטית תתבצע לאחר סיום התאמת קורות החיים`
              : autoApply ? `✅ CV נשלח ל-${lastSwipe.job.company}!` : `💾 נשמר — ${lastSwipe.job.company}`
            : `👋 דולגה — ${lastSwipe.job.company}`}
        </motion.p>
      )}

      {/* Limit modal */}
      <LimitModal
        visible={limitModal}
        resetAt={quota?.resetAt}
        used={quota?.used || 0}
        limit={quota?.limit || 5}
        plan={quota?.plan || 'FREE'}
        onClose={() => setLimitModal(false)}
      />

      <AnimatePresence mode="wait">
        {selectedJob && <JobDetailModal job={selectedJob} onClose={handleModalClose} />}
      </AnimatePresence>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  container: { height: 'calc(100svh - 126px)', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '8px', paddingBottom: '4px', boxSizing: 'border-box', overflow: 'hidden' },
  quotaBar: { width: 'min(360px, 95vw)', marginBottom: '6px', background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 2px 12px rgba(108,79,212,0.15)', border: '1px solid rgba(237,233,254,0.7)' },
  quotaBarTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  quotaUpgradeBtn: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 },
  quotaRefreshBtn: { width: '28px', height: '28px', borderRadius: '50%', border: '1.5px solid #6C4FD4', background: 'white', color: '#6C4FD4', fontSize: '16px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  quotaBarBg: { height: '5px', borderRadius: '3px', background: '#EDE9FE', overflow: 'hidden' },
  quotaBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.5s ease' },
  tailorQuotaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '7px', paddingTop: '6px', borderTop: '1px solid #EDE9FE' },
  tailorQuotaLabel: { fontSize: '11px', fontWeight: 600, color: '#888', display: 'flex', alignItems: 'center', gap: '4px' },
  tailorQuotaCount: { fontSize: '12px', fontWeight: 800 },
  locationFilter: { fontSize: '12px', fontWeight: 600, color: '#2E7D32', margin: 0, textAlign: 'right' },
  cardContainer: { position: 'relative', zIndex: 1, width: 'min(360px, 95vw)', flex: '1', minHeight: '0', maxHeight: 'min(480px, calc(100svh - 280px))', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRadius: '20px' },
  card: { width: 'min(360px, 95vw)', background: 'white', borderRadius: '20px', padding: 0, boxShadow: '0 8px 40px rgba(108,79,212,0.18)', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', cursor: 'grab', userSelect: 'none', position: 'absolute', overflow: 'hidden' },
  cardHero: { width: '100%', height: 'clamp(150px, 34svh, 210px)', position: 'relative', overflow: 'hidden', flexShrink: 0 },
  cardHeroImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  cardHeroOverlay: { position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 28%, rgba(0,0,0,0.52) 62%, rgba(0,0,0,0.84) 100%)' },
  cardHeroMatchBadge: { position: 'absolute', top: '12px', left: '12px', zIndex: 2 },
  cardHeroBottom: { position: 'absolute', bottom: '12px', left: '12px', right: '12px', display: 'flex', alignItems: 'flex-end', gap: '10px', zIndex: 2, direction: 'ltr' },
  cardHeroLogoWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', flexShrink: 0 },
  cardHeroLogoChip: { width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '16px', flexShrink: 0 },
  cardHeroCompany: { color: 'white', fontSize: '12px', fontWeight: 700, maxWidth: '100px', textAlign: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.6)', lineHeight: 1.2, wordBreak: 'break-word' },
  cardHeroTitle: { color: 'white', fontSize: '18px', fontWeight: 800, margin: '0 0 4px', lineHeight: 1.2, textShadow: '0 1px 6px rgba(0,0,0,0.5)', direction: 'ltr', textAlign: 'left' },
  cardHeroMeta: { color: 'rgba(255,255,255,0.88)', fontSize: '12px', fontWeight: 500, margin: 0, direction: 'ltr', textAlign: 'left' },
  cardHeroDistance: { display: 'inline-block', color: 'white', fontSize: '11px', fontWeight: 600, margin: '4px 0 0', padding: '2px 8px', background: 'rgba(0,0,0,0.35)', borderRadius: '8px', lineHeight: 1.4 },
  cardBody: { padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: '7px', flex: 1, overflow: 'hidden', minHeight: 0 },
  stamp: { position: 'absolute', top: '24px', zIndex: 10 },
  likeStamp: { right: '24px', transform: 'rotate(15deg)' },
  nopeStamp: { left: '24px', transform: 'rotate(-15deg)' },
  stampIcon: { height: '120px', objectFit: 'contain' },
  // LTR + left-aligned so the logo sits on the left and the (Latin) company
  // name + location align left, instead of being flipped right by the global RTL.
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px', direction: 'ltr', textAlign: 'left' },
  logo_img: { width: '52px', height: '52px', borderRadius: '12px', objectFit: 'contain', border: '1px solid #eee' },
  logo_placeholder: { width: '52px', height: '52px', borderRadius: '12px', background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 700, color: 'white' },
  company: { fontSize: '18px', fontWeight: 700, color: 'var(--text-dark)', margin: 0 },
  location: { color: 'var(--text-light)', fontSize: '13px', margin: 0 },
  title: { fontSize: '20px', fontWeight: 700, color: 'var(--primary)', margin: 0 },
  salary: { fontSize: '15px', fontWeight: 600, color: 'var(--secondary)', margin: 0 },
  distance: { fontSize: '13px', fontWeight: 600, color: '#2E7D32', margin: 0 },
  shortSummaryBlock: { marginTop: '4px' },
  shortSummaryTitle: { fontSize: '17px', fontWeight: 800, color: '#1E2A4A', margin: '0 0 4px'},
  description: { fontSize: '14px', color: 'var(--text-light)', lineHeight: 1.6, margin: 0 },
  techContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  techBadge: { background: 'var(--background)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--primary)' },
  tapHint: { display: 'flex', justifyContent: 'center', marginTop: 'auto', paddingTop: '12px' },
  lockedOverlay: { position: 'absolute', inset: 0, borderRadius: '20px', background: 'rgba(255,255,255,0.15)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 5, cursor: 'pointer' },
  lockedContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center', padding: '24px' },
  lockedTitle: { fontSize: '18px', fontWeight: 800, color: '#1E2A4A', margin: 0 },
  lockedSub: { fontSize: '13px', color: '#666', margin: 0 },
  lockedBtn: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' },
  buttons: { display: 'flex', gap: '24px', marginTop: '8px', flexShrink: 0, alignItems: 'center', direction: 'ltr' },
  rejectBtn: { width: `${ICON_SIZES.swipeButton}px`, height: `${ICON_SIZES.swipeButton}px`, background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  acceptBtn: { width: `${ICON_SIZES.swipeButton}px`, height: `${ICON_SIZES.swipeButton}px`, background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  swipeIcon: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  undoBtnSlot: { width: `${ICON_SIZES.swipeButton}px`, height: `${ICON_SIZES.swipeButton}px`, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  undoBtn: { width: `${ICON_SIZES.swipeButton}px`, height: `${ICON_SIZES.swipeButton}px`, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  unlockBtn: { marginTop: '24px', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '24px', padding: '14px 28px', cursor: 'pointer', fontSize: '15px', fontWeight: 700 },
  tailorLimitToast: { marginTop: '6px', background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: '12px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: '#B45309', textAlign: 'center', maxWidth: 'min(360px, 95vw)' },
  tailorProgressBanner: { width: 'min(360px, 95vw)', marginBottom: '6px', background: 'rgba(108,79,212,0.10)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '10px', padding: '7px 12px', border: '1px solid rgba(108,79,212,0.2)', overflow: 'hidden' },
  tailorProgressRow: { display: 'flex', alignItems: 'center', gap: '7px', direction: 'rtl' },
  tailorProgressIcon: { width: '15px', height: '15px', objectFit: 'contain', flexShrink: 0 },
  tailorProgressText: { fontSize: '12px', fontWeight: 600, color: '#6C4FD4', flex: 1 },
  tailorProgressDots: { fontSize: '8px', color: '#6C4FD4', letterSpacing: '2px', flexShrink: 0 },
  feedback: { marginTop: '16px', fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', padding: '24px' },
  emptyTitle: { fontSize: '24px', fontWeight: 800, margin: 0 },
  emptySubtitle: { fontSize: '14px', color: '#777', margin: 0 },
  emptyStats: { display: 'flex', alignItems: 'center', gap: '24px', background: 'white', borderRadius: '20px', padding: '20px 32px', boxShadow: '0 4px 16px rgba(108,79,212,0.1)' },
  emptyStatItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  emptyStatNumber: { fontSize: '28px', fontWeight: 800, color: '#6C4FD4', margin: 0 },
  emptyStatLabel: { fontSize: '12px', color: '#777', margin: 0 },
  emptyStatDivider: { width: '1px', height: '40px', background: '#eee' },
  emptyBtn: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', border: 'none', borderRadius: '20px', padding: '14px 28px', cursor: 'pointer', fontWeight: 700, fontSize: '16px' },
};

const modal = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' },
  sheet: { background: 'white', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: '480px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  dragHandle: { width: '40px', height: '4px', background: '#E0E0E0', borderRadius: '2px', alignSelf: 'center', marginBottom: '12px', flexShrink: 0 },
  stickyHeader: { padding: '12px 24px 0', flexShrink: 0, borderBottom: '1px solid #F3F4F6' },
  scrollBody: { flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  stickyFooter: { display: 'flex', gap: '12px', padding: '12px 24px 32px', flexShrink: 0, borderTop: '1px solid #F3F4F6', background: 'white' },
  header: { display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px' },
  logo: { width: '56px', height: '56px', borderRadius: '14px', objectFit: 'contain', border: '1px solid #eee', flexShrink: 0 },
  logo_placeholder: { width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, #6C4FD4, #4A90E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 700, color: 'white', flexShrink: 0 },
  title: { fontSize: '20px', fontWeight: 800, color: '#1E2A4A', margin: 0 },
  company: { fontSize: '14px', color: '#6C4FD4', fontWeight: 600, margin: 0 },
  closeBtn: { background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '14px', flexShrink: 0, marginRight: 'auto' },
  meta: { display: 'flex', gap: '12px', flexWrap: 'wrap', paddingBottom: '12px' },
  metaItem: { background: '#F0F2FF', color: '#6C4FD4', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 },
  section: { display: 'flex', flexDirection: 'column', gap: '8px' },
  sectionTitle: { fontSize: '14px', fontWeight: 700, color: '#1E2A4A', margin: 0 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  tag: { background: '#F0F2FF', color: '#6C4FD4', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 },
  description: { fontSize: '14px', color: '#6B7280', lineHeight: 1.7, margin: 0 },
  descriptionPanel: { display: 'flex', flexDirection: 'column', gap: '14px' },
  descriptionSection: { background: '#F8FAFC', border: '1px solid #EEF2F7', borderRadius: '14px', padding: '14px' },
  descriptionHeading: { fontSize: '14px', fontWeight: 800, color: '#1E2A4A', margin: '0 0 8px' },
  descriptionText: { fontSize: '14px', color: '#5F6675', lineHeight: 1.65, margin: 0 },
  bulletList: { margin: 0, paddingInlineStart: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px', direction: 'ltr', textAlign: 'left' },
  bulletItem: { fontSize: '14px', color: '#5F6675', lineHeight: 1.55 },
  techList: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  techPill: { background: 'white', color: '#6C4FD4', border: '1px solid #DDD6FE', borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: 700 },  applyLink: { color: '#6C4FD4', fontSize: '14px', fontWeight: 600 },
  footer: { display: 'flex', gap: '12px', paddingTop: '8px' },
  passBtn: { flex: 1, padding: '14px', borderRadius: '14px', border: '2px solid #F44336', background: 'white', color: '#F44336', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
  applyBtn: { flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
};

export default SwipePage;
