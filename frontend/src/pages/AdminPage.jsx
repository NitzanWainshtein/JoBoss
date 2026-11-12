// JoBoss features:
// - F-14: Admin Dashboard & Statistics
// - F-15: Admin User Management
// - F-16: Admin Job Management

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import {
  adminGetStats, adminGetUsers, adminGetJobs,
  adminUpdateUserPlan, adminResetUserQuota, adminBlockUser, adminDeleteUser,
  adminGrantAdmin, adminRevokeAdmin, adminToggleJob, adminTriggerImport,
  adminImportStatus, adminDeleteJobs, adminResetMyQuota, adminResetMySwipes,
  adminGetPendingReviewJobs, adminResolveJobReview, adminGetSupportUnread,
} from '../api';
import AdminSupportPanel from '../components/AdminSupportPanel';
import useTranslation from '../i18n/useTranslation';

const PLAN_ICONS  = { FREE: '/icons/free_members_icon.png', PREMIUM: '/icons/premium_member_icon.png', PREMIUM_PLUS: '/icons/plus_members_icon.png' };
// FREE was '#888': on the Badge component's own light tinted background
// (color + alpha suffix) that read as washed-out gray-on-near-white, next to
// PREMIUM/PREMIUM_PLUS which are fully saturated. Darker gray keeps it visually
// "neutral" while giving it real contrast.
const PLAN_COLORS = { FREE: '#5B6472', PREMIUM: '#6C4FD4', PREMIUM_PLUS: '#FF6B6B' };

function Badge({ text, color }) {
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
      {text}
    </span>
  );
}

function StatCard({ label, value, color = '#6C4FD4', sub }) {
  const isHebrew = /[֐-׿]/.test(label);
  return (
    <div style={{ background: '#F4F2F9', borderRadius: 14, padding: '16px 18px',
      flex: '1 1 132px', minWidth: 0,
      direction: isHebrew ? 'rtl' : 'ltr', textAlign: isHebrew ? 'right' : 'left' }}>
      <p style={{ fontSize: 28, fontWeight: 800, color, margin: 0, unicodeBidi: 'embed' }}>{value ?? '--'}</p>
      <p style={{ fontSize: 12, color: '#777', margin: '4px 0 0', fontWeight: 600, unicodeBidi: 'embed' }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: '#aaa', margin: '2px 0 0', unicodeBidi: 'embed' }}>{sub}</p>}
    </div>
  );
}

// F-18: translates the checker's internal reason codes (shared with
// backend/lambdas/jobs_status_checker/job_status_detector.py and
// backend/fargate/job-status-checker/check_jobs.py) into something an admin can
// act on without reading source code.
function reviewReasonLabel(reason, t) {
  if (!reason) return t('adm.reason.unknown');
  if (reason === 'no_apply_url') return t('adm.reason.noUrl');
  if (reason === 'empty_response') return t('adm.reason.empty');
  if (reason === 'playwright_timeout') return t('adm.reason.timeout');
  if (reason.startsWith('http_')) return t('adm.reason.http').replace('{code}', reason.slice(5));
  if (reason.startsWith('fetch_error:') || reason.startsWith('playwright_error:')) {
    return t('adm.reason.net').replace('{detail}', reason.split(':')[1] || reason);
  }
  return reason;
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{ background: color + '18', color, border: `1px solid ${color}44`,
        borderRadius: 10, padding: '5px 11px', cursor: 'pointer', fontWeight: 700, fontSize: 12,
        whiteSpace: 'nowrap', flexShrink: 0 }}>
      {label}
    </button>
  );
}

// Phones were scrolling sideways: nothing here capped the content width, so a
// single wide row dragged the whole page with it.
const PAGE_GUARD = { maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' };

export default function AdminPage() {
  const { t, language } = useTranslation();
  const dateLocale = language === 'en' ? 'en-GB' : 'he-IL';
  const dir = language === 'en' ? 'ltr' : 'rtl';
  // ?tab=support deep-links here from the navbar's "new report" toast.
  const [tab, setTab]     = useState(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    return ['stats', 'users', 'jobs', 'review', 'support', 'self'].includes(q) ? q : 'stats';
  });
  const [supportUnread, setSupportUnread] = useState(0);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [jobs, setJobs]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [myPlan, setMyPlan] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [userSort, setUserSort] = useState('date_desc');
  const [jobSort, setJobSort] = useState('date_desc');
  const [jobSource, setJobSource] = useState('all');
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  // Partial count while the run is still going; null when there is nothing to show.
  const [importProgress, setImportProgress] = useState(null);
  const [grantAdminTarget, setGrantAdminTarget] = useState(null); // { userId, email }
  const [grantAdminPass, setGrantAdminPass] = useState('');
  const [grantAdminLoading, setGrantAdminLoading] = useState(false);
  const [revokeAdminTarget, setRevokeAdminTarget] = useState(null); // { userId, email }
  const [revokeAdminPass, setRevokeAdminPass] = useState('');
  const [revokeAdminLoading, setRevokeAdminLoading] = useState(false);
  // F-18: jobs the daily automated closure checker couldn't resolve itself.
  // Loaded on mount (not just when the tab is opened) so the tab badge acts as
  // an actual notification — an admin who never clicks in still sees the count.
  const [pendingReview, setPendingReview] = useState([]);

  useEffect(() => {
    adminGetSupportUnread().then(d => setSupportUnread(d?.unread || 0)).catch(() => {});
  }, []);

  // The toast can link here while the admin is already on /admin.
  const { search } = useLocation();
  useEffect(() => {
    if (new URLSearchParams(search).get('tab') === 'support') setTab('support');
  }, [search]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'stats') {
        const d = await adminGetStats();
        setStats(d);
      } else if (tab === 'users') {
        const d = await adminGetUsers();
        setUsers(d.users || []);
      } else if (tab === 'jobs') {
        const d = await adminGetJobs();
        setJobs(d.jobs || []);
      } else if (tab === 'review') {
        const d = await adminGetPendingReviewJobs();
        setPendingReview(d.jobs || []);
      }
    } catch (e) {
      showToast(t('adm.loadErr') + (e.message || e.status || ''), false);
    } finally {
      setLoading(false);
    }
  }, [tab, t]);

  useEffect(() => { load(); }, [load]);

  // Runs once on mount, independent of which tab is active — this is what makes
  // the badge a notification rather than something only visible after clicking
  // into the review tab. A failure here is silent: the badge just stays at 0,
  // which is the same as "nothing pending" from the admin's point of view, and
  // load() above will report a real error if they do open the tab.
  useEffect(() => {
    adminGetPendingReviewJobs().then(d => setPendingReview(d.jobs || [])).catch(() => {});
  }, []);

  const doResolveReview = async (jobId, action) => {
    try {
      await adminResolveJobReview(jobId, action);
      showToast(action === 'delete' ? t('adm.toast.jobDeleted') : t('adm.toast.jobKept'));
      setPendingReview(prev => prev.filter(j => j.jobId !== jobId));
    } catch (e) {
      showToast(t('adm.errorColon') + (e?.data?.error || e.message || ''), false);
    }
  };

  const doUpdatePlan = async (uid, plan) => {
    try { await adminUpdateUserPlan(uid, plan); showToast(t('adm.toast.planUpdated')); load(); }
    catch { showToast(t('adm.error'), false); }
  };

  const doResetQuota = async (uid) => {
    try { await adminResetUserQuota(uid); showToast(t('adm.toast.quotaReset')); load(); }
    catch (e) {
      console.error('resetUserQuota failed:', e);
      showToast(`${t('adm.errorColon')}${e?.status || ''} ${e?.message || e?.code || 'unknown'}`, false);
    }
  };

  const doBlock = async (uid, block) => {
    try { await adminBlockUser(uid, block); showToast(block ? t('adm.toast.userBlocked') : t('adm.toast.userUnblocked')); load(); }
    catch { showToast(t('adm.error'), false); }
  };

  const doDelete = (uid, email) => {
    setConfirm({ type: 'delete-user', id: uid, label: t('adm.confirm.deleteUser').replace('{email}', email) });
  };

  const openRevokeAdmin = (uid, email) => {
    setRevokeAdminTarget({ userId: uid, email });
    setRevokeAdminPass('');
  };

  const submitRevokeAdmin = async () => {
    if (!revokeAdminTarget || !revokeAdminPass) return;
    setRevokeAdminLoading(true);
    try {
      await adminRevokeAdmin(revokeAdminTarget.userId, revokeAdminPass);
      showToast(t('adm.toast.adminRevoked').replace('{email}', revokeAdminTarget.email));
      setRevokeAdminTarget(null);
      setRevokeAdminPass('');
      load();
    } catch (e) {
      showToast(e?.data?.error || t('adm.error'), false);
    } finally {
      setRevokeAdminLoading(false);
    }
  };

  const openGrantAdmin = (uid, email) => {
    setGrantAdminTarget({ userId: uid, email });
    setGrantAdminPass('');
  };

  const submitGrantAdmin = async () => {
    if (!grantAdminTarget || !grantAdminPass) return;
    setGrantAdminLoading(true);
    try {
      await adminGrantAdmin(grantAdminTarget.userId, grantAdminPass);
      showToast(t('adm.toast.adminGranted').replace('{email}', grantAdminTarget.email));
      setGrantAdminTarget(null);
      setGrantAdminPass('');
    } catch (e) {
      showToast(e?.data?.error || t('adm.error'), false);
    } finally {
      setGrantAdminLoading(false);
    }
  };

  const doToggleJob = async (jid, cur) => {
    try { await adminToggleJob(jid, !cur); showToast(!cur ? t('adm.toast.jobEnabled') : t('adm.toast.jobDisabled')); load(); }
    catch { showToast(t('adm.error'), false); }
  };

  const doImport = async () => {
    if (importing) return;
    setImportResult(null);
    setImportProgress(null);
    setImporting(true);

    let since;
    try {
      const trigger = await adminTriggerImport();
      // Server timestamp, so a skewed browser clock cannot make the run look
      // empty. Falls back to local time only if the backend predates this field.
      since = trigger?.triggeredAt || new Date().toISOString();
    } catch (e) {
      setImporting(false);
      showToast(`${t('adm.errorColon')}${e?.status || ''} ${e?.message || 'unknown'}`, false);
      return;
    }

    // The importer is invoked async and cannot report back, so the count is read
    // off the createdAt of jobs inserted since `since`. It is reported while the
    // run is still going, which is why the panel shows a live count instead of an
    // opaque spinner.
    const startedAt = Date.now();
    const poll = async () => {
      if (Date.now() - startedAt > 6 * 60 * 1000) {
        setImporting(false);
        setImportProgress(null);
        showToast(t('adm.toast.importTimeout'), false);
        return;
      }
      try {
        const st = await adminImportStatus(since);
        if (st && !st.running) {
          setImporting(false);
          setImportProgress(null);
          setImportResult({ added: st.added ?? 0 });
          load();
          return;
        }
        if (st) setImportProgress(st.added ?? 0);
      } catch (e) {
        // A 400 means the request itself is wrong and retrying cannot fix it —
        // surface it instead of spinning for six minutes.
        if (e?.status === 400) {
          setImporting(false);
          setImportProgress(null);
          showToast(`${t('adm.toast.importStatusErr')}${e?.message || ''}`, false);
          return;
        }
        // Anything else is likely transient; keep polling.
      }
      setTimeout(poll, 5000);
    };
    setTimeout(poll, 6000);
  };

  const toggleJobSel = (jobId) => setSelectedJobs(prev => {
    const next = new Set(prev);
    if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
    return next;
  });

  const doDeleteJobs = async () => {
    if (selectedJobs.size === 0) return;
    if (!window.confirm(t('adm.confirm.deleteJobs').replace('{n}', selectedJobs.size))) return;
    try {
      const r = await adminDeleteJobs([...selectedJobs]);
      showToast(t('adm.toast.jobsDeleted').replace('{n}', r?.deleted ?? selectedJobs.size));
      setSelectedJobs(new Set());
      load();
    } catch (e) {
      showToast(`${t('adm.errorColon')}${e?.status || ''} ${e?.message || 'unknown'}`, false);
    }
  };

  const doResetMy = async () => {
    try {
      const r = await adminResetMyQuota(myPlan || undefined);
      showToast(t('adm.toast.myQuotaReset').replace('{plan}', r?.plan || myPlan || '?'));
      await load();
    } catch (e) {
      console.error('resetMyQuota failed:', e);
      showToast(`${t('adm.errorColon')}${e?.status || ''} ${e?.message || e?.code || 'unknown'}`, false);
    }
  };

  const confirmAction = async () => {
    if (!confirm) return;
    if (confirm.type === 'delete-user') {
      try { await adminDeleteUser(confirm.id); showToast(t('adm.toast.userDeleted')); load(); }
      catch { showToast(t('adm.error'), false); }
    }
    setConfirm(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FDFDFD', direction: 'rtl', ...PAGE_GUARD }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '8px 16px 40px', ...PAGE_GUARD }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.3px', color: '#1E2A4A', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/icons/admin_edit_icon.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            Admin Panel — JoBoss
          </h1>
            <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>{t('adm.subtitle')}</p>
          </div>
          <Badge text="ADMIN" color="#FF6B6B" />
        </div>

        <div style={{ display: 'flex', gap: 4, background: '#F4F2F9', padding: 5,
          borderRadius: 16, marginBottom: 18 }}>
          {[
            { key: 'stats',  icon: '/icons/stats_logo.png',      label: t('adm.tab.stats') },
            { key: 'users',  icon: '/icons/members_icon.png',    label: t('adm.tab.users') },
            { key: 'jobs',   icon: '/icons/jobs_icon.png',       label: t('adm.tab.jobs') },
            { key: 'review', icon: '/icons/process_icon.png',    label: t('adm.tab.review') },
            { key: 'support', icon: null,                         label: t('adm.tab.support') },
            { key: 'self',   icon: '/icons/admin_edit_icon.png', label: t('adm.tab.tools') },
          ].map(({ key, icon, label }) => (
            <button key={key}
              style={{ flex: 1, padding: '10px 4px', border: 'none', borderRadius: 12, cursor: 'pointer',
                fontWeight: 600, fontSize: 12, position: 'relative',
                background: tab === key ? '#1E2A4A' : 'transparent',
                color: tab === key ? 'white' : '#777',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              onClick={() => setTab(key)}>
              {icon
                ? <img src={icon} alt="" style={{ width: 22, height: 22, objectFit: 'contain',
                    filter: tab === key ? 'brightness(0) invert(1)' : 'none' }} />
                : <span style={{ fontSize: 18, lineHeight: '22px', height: 22 }}>✉️</span>}
              {label}
              {key === 'support' && supportUnread > 0 && (
                <span style={{
                  position: 'absolute', top: 2, insetInlineEnd: 10,
                  background: '#FF4D67', color: 'white', borderRadius: 999,
                  fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>
                  {supportUnread}
                </span>
              )}
              {key === 'review' && pendingReview.length > 0 && (
                <span style={{
                  position: 'absolute', top: 2, insetInlineEnd: 10,
                  background: '#FF4D67', color: 'white', borderRadius: 999,
                  fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  boxShadow: '0 1px 3px rgba(30,20,70,0.06)',
                }}>
                  {pendingReview.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* The Reports tab has its own refresh (it loads its own data). */}
        {tab !== 'support' && <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
          <button onClick={load}
            style={{ background: 'white', border: '1.5px solid #ddd', borderRadius: 20,
              padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#555',
              display: 'flex', alignItems: 'center', gap: 6 }}>
            <img src="/icons/refresh_icon.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
            {t('adm.refresh')}
          </button>
        </div>}

        {loading && <p style={{ textAlign: 'center', color: '#6C4FD4', padding: 40 }}>{t('adm.loading')}</p>}

        {/* STATS */}
        {!loading && tab === 'stats' && stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatCard label={t('adm.stat.users')} value={stats.totalUsers} />
              <StatCard label={t('adm.stat.appsToday')}    value={stats.appsToday}    color="#FF6B6B" />
              <StatCard label={t('adm.stat.appsMonth')}   value={stats.appsThisMonth} color="#4CAF50" />
              <StatCard label={t('adm.stat.swipes')}   value={stats.totalSwipes}   color="#FF9800" />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatCard label={t('adm.stat.likes')}        value={stats.totalLikes}        color="#6C4FD4" />
              <StatCard label={t('adm.stat.newUsers')} value={stats.newUsersThisWeek}  color="#00BCD4" />
              <StatCard label="AI Tailorings"        value={stats.aiTailoringsTotal} color="#9C27B0" />
              <StatCard label="Bedrock"
                value={stats.bedrockAvailable ? t('adm.stat.bedrockOk') : t('adm.stat.bedrockNo')}
                color={stats.bedrockAvailable ? '#4CAF50' : '#F44336'} />
            </div>
            <div style={{ background: 'white', border: '1px solid #E7E3F0', borderRadius: 16, padding: 20 }}>
              <p style={{ fontWeight: 700, color: '#1E2A4A', margin: '0 0 12px' }}>{t('adm.stat.planBreakdown')}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(stats.planBreakdown || {}).map(([plan, count]) => (
                  <div key={plan} style={{ background: (PLAN_COLORS[plan] || '#888') + '15',
                    borderRadius: 16, padding: '20px 32px', textAlign: 'center', flex: 1 }}>
                    {PLAN_ICONS[plan] && <img src={PLAN_ICONS[plan]} alt={t(`profile.plan.${plan}`)} style={{ width: 72, height: 72, objectFit: 'contain', display: 'block', margin: '0 auto 12px' }} />}
                    <p style={{ fontSize: 36, fontWeight: 700, color: PLAN_COLORS[plan] || '#888', margin: 0 }}>{count}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* USERS */}
        {!loading && tab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#777' }}>{t('adm.sortBy')}</span>
              <select value={userSort} onChange={e => setUserSort(e.target.value)}
                style={{ fontSize: 12, fontWeight: 600, borderRadius: 10, border: '1.5px solid #ddd',
                  padding: '6px 10px', cursor: 'pointer', background: 'white', color: '#1E2A4A',
                  outline: 'none' }}>
                <option value="date_desc">{t('adm.sort.dateDesc')}</option>
                <option value="date_asc">{t('adm.sort.dateAsc')}</option>
                <option value="plan">{t('adm.sort.plan')}</option>
                <option value="apps_desc">{t('adm.sort.apps')}</option>
                <option value="admin">{t('adm.sort.admin')}</option>
              </select>
            </div>
            {[...users].sort((a, b) => {
              if (userSort === 'date_desc') return (b.createdAt || '') > (a.createdAt || '') ? 1 : -1;
              if (userSort === 'date_asc')  return (a.createdAt || '') > (b.createdAt || '') ? 1 : -1;
              if (userSort === 'plan') {
                const rank = { PREMIUM_PLUS: 0, PREMIUM: 1, FREE: 2 };
                return (rank[a.plan] ?? 3) - (rank[b.plan] ?? 3);
              }
              if (userSort === 'apps_desc') return (b.appCount || 0) - (a.appCount || 0);
              if (userSort === 'admin') return (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0);
              return 0;
            }).map(u => (
              <div key={u.userId} style={{ background: 'white', border: '1px solid #E7E3F0', borderRadius: 16, padding: '14px 16px', opacity: u.blocked ? 0.65 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, direction: 'rtl' }}>
                  {/* buttons first in RTL flow = right side */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', direction: 'ltr', minWidth: 0, maxWidth: '100%' }}>
                    <select
                      defaultValue={u.plan}
                      onChange={e => doUpdatePlan(u.userId, e.target.value)}
                      style={{ fontSize: 12, borderRadius: 8, border: '1px solid #ddd', padding: '4px 8px', cursor: 'pointer' }}>
                      <option value="FREE">FREE</option>
                      <option value="PREMIUM">PREMIUM</option>
                      <option value="PREMIUM_PLUS">PREMIUM+</option>
                    </select>
                    <ActionBtn label="⟳ Quota" color="#2196F3" onClick={() => doResetQuota(u.userId)} />
                    <ActionBtn label={u.blocked ? t('adm.unblock') : t('adm.block')} color={u.blocked ? '#4CAF50' : '#FF9800'}
                      onClick={() => doBlock(u.userId, !u.blocked)} />
                    {u.isAdmin
                      ? <ActionBtn label={t('adm.revokeBtn')} color="#E91E63" onClick={() => openRevokeAdmin(u.userId, u.email)} />
                      : <ActionBtn label={t('adm.grantBtn')} color="#9C27B0" onClick={() => openGrantAdmin(u.userId, u.email)} />
                    }
                    <ActionBtn label="🗑" color="#F44336" onClick={() => doDelete(u.userId, u.email)} />
                  </div>
                  {/* info second in RTL flow = left side */}
                  <div style={{ flex: 1, minWidth: 0, direction: 'ltr', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: '#1E2A4A', margin: 0 }}>
                        {u.fullName || u.email}
                      </p>
                      {u.blocked && <Badge text={t('adm.blocked')} color="#F44336" />}
                      {u.isAdmin && <Badge text="👑 ADMIN" color="#9C27B0" />}
                      <Badge text={t(`profile.plan.${u.plan}`)} color={PLAN_COLORS[u.plan] || '#888'} />
                    </div>
                    <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>{u.email}</p>
                    <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0', direction: 'ltr', unicodeBidi: 'embed' }}>
                      {t('adm.apps')}: {u.appCount} | {t('adm.accepted')}: {u.acceptedCount} | {t('adm.rejected')}: {u.rejectedCount}
                      {u.aiTailoringsUsed ? ` | AI: ${u.aiTailoringsUsed}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {users.length === 0 && <p style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>{t('adm.noUsers')}</p>}
          </div>
        )}

        {/* JOBS */}
        {!loading && tab === 'jobs' && (() => {
          const visibleJobs = jobs
            .filter(j => jobSource === 'all' || j.source === jobSource)
            .slice()
            .sort((a, b) => {
              if (jobSort === 'company') return (a.company || '').localeCompare(b.company || '');
              if (jobSort === 'likes') return (b.likes || 0) - (a.likes || 0);
              if (jobSort === 'date_asc') return (a.createdAt || '') > (b.createdAt || '') ? 1 : -1;
              return (b.createdAt || '') > (a.createdAt || '') ? 1 : -1;
            });
          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Counted from the createdAt of jobs inserted since the run started.
                Deliberately says nothing about removals: the importer only ever
                inserts, so the old "הוסרו N משרות לא רלוונטיות" was reporting TTL
                expiry and closure-checker deletions that merely overlapped the run. */}
            {importResult && (
              <div style={{ background: '#EBFBF2', border: '1px solid #A9E9CB', borderRadius: 14,
                padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0E7A52' }}>
                  {importResult.added > 0
                    ? t('adm.import.added').replace('{n}', importResult.added)
                    : t('adm.import.none')}
                </span>
                <button onClick={() => setImportResult(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#0E7A52' }}>✕</button>
              </div>
            )}

            {/* While the run is going: a live count, so "0 so far" is visibly
                different from "finished with 0". */}
            {importing && (
              <div style={{ background: '#F3F0FE', border: '1px solid #D6CCFB', borderRadius: 14,
                padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#5B3DF5' }}>
                {importProgress === null
                  ? t('adm.import.running')
                  : t('adm.import.progress').replace('{n}', importProgress)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
              <select value={jobSort} onChange={e => setJobSort(e.target.value)}
                style={{ flex: '1 1 130px', minWidth: 0, padding: '7px 10px', borderRadius: 10,
                  border: '1.5px solid #E7E3F0', background: 'white', fontSize: 12, fontWeight: 600, color: '#5F5A72' }}>
                <option value="date_desc">{t('adm.jobSort.recent')}</option>
                <option value="date_asc">{t('adm.jobSort.oldest')}</option>
                <option value="company">{t('adm.jobSort.company')}</option>
                <option value="likes">{t('adm.jobSort.likes')}</option>
              </select>

              <select value={jobSource} onChange={e => setJobSource(e.target.value)}
                style={{ flex: '1 1 130px', minWidth: 0, padding: '7px 10px', borderRadius: 10,
                  border: '1.5px solid #E7E3F0', background: 'white', fontSize: 12, fontWeight: 600, color: '#5F5A72' }}>
                <option value="all">{t('adm.allSources')}</option>
                {[...new Set(jobs.map(j => j.source).filter(Boolean))].sort().map(src => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>

              {selectedJobs.size > 0 && (
                <button onClick={doDeleteJobs}
                  style={{ background: '#FF4D67', color: 'white', border: 'none', borderRadius: 999,
                    padding: '7px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                  🗑 {t('adm.delete')} ({selectedJobs.size})
                </button>
              )}

              <button onClick={doImport} disabled={importing}
                style={{ background: importing ? '#B9AEE8' : 'linear-gradient(135deg,#7C5CFF,#5B3DF5)', color: 'white',
                  border: 'none', borderRadius: 999, padding: '8px 16px',
                  cursor: importing ? 'default' : 'pointer', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                {importing ? t('adm.importing') : t('adm.runImporter')}
              </button>
            </div>

            {visibleJobs.map(j => (
              <div key={j.jobId} style={{ background: 'white', border: '1px solid #E7E3F0', borderRadius: 16, padding: '14px 16px', opacity: j.isActive === false ? 0.55 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, direction: 'rtl' }}>
                  {/* button first in RTL flow = right side */}
                  <input type="checkbox" checked={selectedJobs.has(j.jobId)}
                    onChange={() => toggleJobSel(j.jobId)}
                    style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                  <ActionBtn
                    label={j.isActive === false ? t('adm.enable') : t('adm.disable')}
                    color={j.isActive === false ? '#4CAF50' : '#FF9800'}
                    onClick={() => doToggleJob(j.jobId, j.isActive !== false)} />
                  {/* info second in RTL flow = left side, all LTR */}
                  <div style={{ flex: 1, minWidth: 0, direction: 'ltr', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: '#1E2A4A', margin: 0 }}>{j.company}</p>
                      <Badge text={j.isActive === false ? t('adm.inactive') : t('adm.active')}
                        color={j.isActive === false ? '#F44336' : '#4CAF50'} />
                    </div>
                    <p style={{ fontSize: 13, color: '#6C4FD4', fontWeight: 600, margin: '2px 0' }}>{j.title}</p>
                    <p style={{ fontSize: 11, color: '#999', margin: 0 }}>
                      👍 {j.likes || 0} · 👎 {j.passes || 0} · 📍 {j.location || ''}
                    </p>
                    <p style={{ fontSize: 11, color: '#7C5CFF', fontWeight: 600, margin: '3px 0 0' }}>
                      {j.source ? `🔗 ${j.source}` : '🔗 —'}
                      {j.createdAt ? ` · 📅 ${t('adm.scraped')} ${new Date(j.createdAt).toLocaleDateString(dateLocale)}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {visibleJobs.length === 0 && <p style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>{t('adm.noJobs')}</p>}
          </div>
          );
        })()}

        {/* REVIEW — F-18: jobs the daily automated closure checker (Tier 1 HTTP +
            Tier 2 Playwright) could not confidently classify after 2 consecutive
            attempts. Neither auto-deleted nor auto-kept — an admin decides. */}
        {!loading && tab === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingReview.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>
                {t('adm.review.none')}
              </p>
            ) : (
              pendingReview.map(j => (
                <div key={j.jobId} style={{ background: 'white', borderRadius: 16, padding: '14px 16px', border: '1.5px solid #FFD98A' }}>
                  <div style={{ direction: 'ltr', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: '#1E2A4A', margin: 0 }}>{j.company || '—'}</p>
                      <Badge text={t('adm.review.attempts').replace('{n}', j.checkFailCount ?? '?')} color="#F5A623" />
                    </div>
                    <p style={{ fontSize: 13, color: '#6C4FD4', fontWeight: 600, margin: '2px 0' }}>{j.title || '—'}</p>
                    {j.location && <p style={{ fontSize: 11, color: '#999', margin: 0 }}>📍 {j.location}</p>}
                  </div>
                  <p style={{ fontSize: 12, color: '#B45309', fontWeight: 700, margin: '8px 0 0',
                    direction: 'rtl', textAlign: 'right' }}>
                    ⚠️ {reviewReasonLabel(j.reviewReason, t)}
                  </p>
                  {j.applyUrl && (
                    <a href={j.applyUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#6C4FD4', fontWeight: 600, display: 'inline-block',
                        marginTop: 4, direction: 'rtl' }}>
                      {t('adm.review.open')}
                    </a>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, direction: 'rtl' }}>
                    <ActionBtn label={t('adm.review.stillOpen')} color="#4CAF50"
                      onClick={() => doResolveReview(j.jobId, 'keep')} />
                    <ActionBtn label={t('adm.review.closed')} color="#F44336"
                      onClick={() => doResolveReview(j.jobId, 'delete')} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SUPPORT — "Contact us" reports from users */}
        {tab === 'support' && (
          <AdminSupportPanel onToast={showToast} onUnreadChange={setSupportUnread} />
        )}

        {/* SELF */}
        {tab === 'self' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Switch Plan */}
            <div style={{ background: 'white', border: '1px solid #E7E3F0', borderRadius: 20, padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E2A4A', margin: '0 0 6px' }}>{t('adm.tools.switchTitle')}</h3>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 16px' }}>
                {t('adm.tools.switchDesc')}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { plan: 'FREE',         icon: '/icons/free_members_icon.png',    label: 'FREE',     sub: t('adm.tools.subFree'),        color: PLAN_COLORS.FREE },
                  { plan: 'PREMIUM',      icon: '/icons/premium_member_icon.png',  label: 'PREMIUM',  sub: t('adm.tools.subPremium'), color: '#6C4FD4' },
                  { plan: 'PREMIUM_PLUS', icon: '/icons/plus_members_icon.png',    label: 'PREMIUM+', sub: t('adm.tools.subPlus'),            color: '#FF6B6B' },
                ].map(({ plan, icon, label, sub, color }) => (
                  <button key={plan}
                    onClick={async () => {
                      setMyPlan(plan);
                      try {
                        await adminResetMyQuota(plan);
                        showToast(t('adm.toast.switched').replace('{plan}', plan));
                      } catch { showToast(t('adm.error'), false); }
                    }}
                    style={{ flex: '1 1 150px', minWidth: 0, padding: '14px 14px', borderRadius: 14,
                      border: `2px solid ${color}`, background: color + '10',
                      cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, direction: 'ltr' }}>
                      <p style={{ fontWeight: 700, fontSize: 15, color, margin: 0 }}>{label}</p>
                      <img src={icon} alt={label} style={{ height: 64, width: 'auto', maxWidth: 110, objectFit: 'contain', flexShrink: 0 }} />
                    </div>
                    <p style={{ fontSize: 11, color: '#777', margin: 0, textAlign: 'center' }}>{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Reset quota only */}
            <div style={{ background: 'white', border: '1px solid #E7E3F0', borderRadius: 20, padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E2A4A', margin: '0 0 8px' }}>{t('adm.tools.quotaTitle')}</h3>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 14px' }}>
                {t('adm.tools.quotaDesc')}
              </p>
              <button onClick={doResetMy}
                style={{ background: 'linear-gradient(135deg,#6C4FD4,#1E2A4A)', color: 'white',
                  border: 'none', borderRadius: 12, padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                {t('adm.tools.quotaBtn')}
              </button>
            </div>

            {/* Reset swipes */}
            <div style={{ background: 'white', border: '1px solid #E7E3F0', borderRadius: 20, padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E2A4A', margin: '0 0 8px' }}>{t('adm.tools.swipesTitle')}</h3>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 6px' }}>
                {t('adm.tools.swipesDesc1')}
              </p>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 14px' }}>
                {t('adm.tools.swipesDesc2')}
              </p>
              <button onClick={async () => {
                  try { const r = await adminResetMySwipes(); showToast(t('adm.toast.swipesReset').replace('{n}', r.deleted)); }
                  catch { showToast(t('adm.error'), false); }
                }}
                style={{ background: '#FF9800', color: 'white', border: 'none', borderRadius: 12,
                  padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                {t('adm.tools.swipesBtn')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
            background: toast.ok ? '#1E2A4A' : '#F44336', color: 'white',
            padding: '10px 24px', borderRadius: 20, fontWeight: 600, fontSize: 14,
            boxShadow: '0 1px 3px rgba(30,20,70,0.06)', zIndex: 999, whiteSpace: 'nowrap' }}>
          {toast.msg}
        </motion.div>
      )}

      {/* Confirm */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
          onClick={() => setConfirm(null)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 320, width: '90%', direction: dir }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#1E2A4A', margin: '0 0 10px' }}>{t('adm.dlg.confirmTitle')}</p>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 20px' }}>{confirm.label}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmAction}
                style={{ flex: 1, background: '#F44336', color: 'white', border: 'none',
                  borderRadius: 12, padding: 12, cursor: 'pointer', fontWeight: 700 }}>{t('adm.dlg.approve')}</button>
              <button onClick={() => setConfirm(null)}
                style={{ flex: 1, background: '#f5f5f5', color: '#333', border: 'none',
                  borderRadius: 12, padding: 12, cursor: 'pointer', fontWeight: 600 }}>{t('adm.dlg.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Admin */}
      {revokeAdminTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
          onClick={() => setRevokeAdminTarget(null)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 340, width: '90%', direction: dir }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, fontSize: 17, color: '#1E2A4A', margin: '0 0 8px' }}>{t('adm.dlg.revokeTitle')}</p>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 4px' }}>
              {t('adm.dlg.revokeAsk')}
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#E91E63', margin: '0 0 16px', wordBreak: 'break-all' }}>
              {revokeAdminTarget.email}
            </p>
            <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 14px' }}>{t('adm.dlg.continuePass')}</p>
            <input
              type="password"
              placeholder={t('adm.dlg.password')}
              value={revokeAdminPass}
              onChange={e => setRevokeAdminPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitRevokeAdmin()}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 12,
                border: '1.5px solid #ddd', fontSize: 14, marginBottom: 16, direction: 'ltr',
                outline: 'none', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submitRevokeAdmin} disabled={!revokeAdminPass || revokeAdminLoading}
                style={{ flex: 1, background: revokeAdminPass ? '#E91E63' : '#ddd', color: 'white', border: 'none',
                  borderRadius: 12, padding: 12, cursor: revokeAdminPass ? 'pointer' : 'not-allowed',
                  fontWeight: 700, fontSize: 14 }}>
                {revokeAdminLoading ? '...' : t('adm.dlg.revokeConfirm')}
              </button>
              <button onClick={() => setRevokeAdminTarget(null)}
                style={{ flex: 1, background: '#f5f5f5', color: '#333', border: 'none',
                  borderRadius: 12, padding: 12, cursor: 'pointer', fontWeight: 600 }}>{t('adm.dlg.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Grant Admin */}
      {grantAdminTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
          onClick={() => setGrantAdminTarget(null)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 340, width: '90%', direction: dir }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, fontSize: 17, color: '#1E2A4A', margin: '0 0 8px' }}>{t('adm.dlg.grantTitle')}</p>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 4px' }}>
              {t('adm.dlg.grantAsk')}
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#9C27B0', margin: '0 0 16px', wordBreak: 'break-all' }}>
              {grantAdminTarget.email}
            </p>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 6px' }}>{t('adm.dlg.grantTail')}</p>
            <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 14px' }}>{t('adm.dlg.continuePass')}</p>
            <input
              type="password"
              placeholder={t('adm.dlg.password')}
              value={grantAdminPass}
              onChange={e => setGrantAdminPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitGrantAdmin()}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 12,
                border: '1.5px solid #ddd', fontSize: 14, marginBottom: 16, direction: 'ltr',
                outline: 'none', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submitGrantAdmin} disabled={!grantAdminPass || grantAdminLoading}
                style={{ flex: 1, background: grantAdminPass ? '#9C27B0' : '#ddd', color: 'white', border: 'none',
                  borderRadius: 12, padding: 12, cursor: grantAdminPass ? 'pointer' : 'not-allowed',
                  fontWeight: 700, fontSize: 14 }}>
                {grantAdminLoading ? '...' : t('adm.dlg.approve')}
              </button>
              <button onClick={() => setGrantAdminTarget(null)}
                style={{ flex: 1, background: '#f5f5f5', color: '#333', border: 'none',
                  borderRadius: 12, padding: 12, cursor: 'pointer', fontWeight: 600 }}>{t('adm.dlg.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
