import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  adminGetStats, adminGetUsers, adminGetJobs,
  adminUpdateUserPlan, adminResetUserQuota, adminBlockUser, adminDeleteUser,
  adminToggleJob, adminTriggerImport, adminResetMyQuota, adminResetMySwipes,
} from '../api';

const PLAN_LABELS = { FREE: 'חינמי', PREMIUM: '⭐ פרימיום', PREMIUM_PLUS: '🔥 פרימיום+' };
const PLAN_COLORS = { FREE: '#888', PREMIUM: '#6C4FD4', PREMIUM_PLUS: '#FF6B6B' };

function Badge({ text, color }) {
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
      {text}
    </span>
  );
}

function StatCard({ label, value, color = '#6C4FD4', sub }) {
  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '16px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flex: 1, minWidth: 120 }}>
      <p style={{ fontSize: 26, fontWeight: 800, color, margin: 0 }}>{value ?? '--'}</p>
      <p style={{ fontSize: 12, color: '#777', margin: '4px 0 0', fontWeight: 600 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: '#aaa', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  );
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{ background: color + '18', color, border: `1px solid ${color}44`,
        borderRadius: 10, padding: '5px 11px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
      {label}
    </button>
  );
}

export default function AdminPage() {
  const [tab, setTab]     = useState('stats');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [jobs, setJobs]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [myPlan, setMyPlan] = useState('');
  const [confirm, setConfirm] = useState(null);

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
      }
    } catch (e) {
      showToast('שגיאה בטעינה: ' + (e.message || e.status || ''), false);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const doUpdatePlan = async (uid, plan) => {
    try { await adminUpdateUserPlan(uid, plan); showToast('Plan עודכן'); load(); }
    catch { showToast('שגיאה', false); }
  };

  const doResetQuota = async (uid) => {
    try { await adminResetUserQuota(uid); showToast('Quota אופס'); load(); }
    catch { showToast('שגיאה', false); }
  };

  const doBlock = async (uid, block) => {
    try { await adminBlockUser(uid, block); showToast(block ? 'משתמש נחסם' : 'משתמש שוחרר'); load(); }
    catch { showToast('שגיאה', false); }
  };

  const doDelete = (uid, email) => {
    setConfirm({ type: 'delete-user', id: uid, label: `מחיקת ${email} — לא ניתן לשחזר!` });
  };

  const doToggleJob = async (jid, cur) => {
    try { await adminToggleJob(jid, !cur); showToast(!cur ? 'משרה הופעלה' : 'משרה הושבתה'); load(); }
    catch { showToast('שגיאה', false); }
  };

  const doImport = async () => {
    try { await adminTriggerImport(); showToast('Importer הופעל ברקע'); }
    catch { showToast('שגיאה', false); }
  };

  const doResetMy = async () => {
    try {
      await adminResetMyQuota(myPlan || undefined);
      showToast('Quota שלך אופס' + (myPlan ? ` + Plan: ${myPlan}` : ''));
    } catch { showToast('שגיאה', false); }
  };

  const confirmAction = async () => {
    if (!confirm) return;
    if (confirm.type === 'delete-user') {
      try { await adminDeleteUser(confirm.id); showToast('משתמש נמחק'); load(); }
      catch { showToast('שגיאה', false); }
    }
    setConfirm(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2FF', direction: 'rtl' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 90px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E2A4A', margin: 0 }}>🛠️ Admin Panel — JoBoss</h1>
            <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>כל הפעולות נרשמות ב-CloudWatch</p>
          </div>
          <Badge text="ADMIN" color="#FF6B6B" />
        </div>

        <div style={{ display: 'flex', gap: 8, background: 'white', padding: 8,
          borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 20 }}>
          {[['stats','📊 סטטיסטיקות'], ['users','👥 משתמשים'], ['jobs','💼 משרות'], ['self','🔧 כלי Admin']].map(([key, label]) => (
            <button key={key}
              style={{ flex: 1, padding: '10px 4px', border: 'none', borderRadius: 12, cursor: 'pointer',
                fontWeight: 600, fontSize: 13,
                background: tab === key ? 'linear-gradient(135deg,#6C4FD4,#1E2A4A)' : 'transparent',
                color: tab === key ? 'white' : '#777' }}
              onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
          <button onClick={load}
            style={{ background: 'white', border: '1.5px solid #ddd', borderRadius: 20,
              padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#555' }}>
            🔄 רענן
          </button>
        </div>

        {loading && <p style={{ textAlign: 'center', color: '#6C4FD4', padding: 40 }}>טוען...</p>}

        {/* STATS */}
        {!loading && tab === 'stats' && stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatCard label="סה״כ משתמשים" value={stats.totalUsers} />
              <StatCard label="הגשות היום"    value={stats.appsToday}    color="#FF6B6B" />
              <StatCard label="הגשות החודש"   value={stats.appsThisMonth} color="#4CAF50" />
              <StatCard label="סה״כ Swipes"   value={stats.totalSwipes}   color="#FF9800" />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatCard label="Likes כלל הזמן"   value={stats.totalLikes}           color="#6C4FD4" />
              <StatCard label="Conversion Rate"   value={`${stats.conversionRate}%`}  color="#2196F3" sub="הגשות / Likes" />
              <StatCard label="AI Tailorings"     value={stats.aiTailoringsTotal}     color="#9C27B0" />
              <StatCard label="Bedrock"
                value={stats.bedrockAvailable ? '✓ זמין' : '✗ לא זמין'}
                color={stats.bedrockAvailable ? '#4CAF50' : '#F44336'} />
            </div>
            <div style={{ background: 'white', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontWeight: 700, color: '#1E2A4A', margin: '0 0 12px' }}>פילוח לפי Plan</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(stats.planBreakdown || {}).map(([plan, count]) => (
                  <div key={plan} style={{ background: (PLAN_COLORS[plan] || '#888') + '15',
                    borderRadius: 12, padding: '12px 24px', textAlign: 'center' }}>
                    <p style={{ fontSize: 24, fontWeight: 800, color: PLAN_COLORS[plan] || '#888', margin: 0 }}>{count}</p>
                    <p style={{ fontSize: 12, color: '#777', margin: '4px 0 0' }}>{PLAN_LABELS[plan] || plan}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* USERS */}
        {!loading && tab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {users.map(u => (
              <div key={u.userId} style={{ background: 'white', borderRadius: 16, padding: '14px 16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: u.blocked ? 0.65 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: '#1E2A4A', margin: 0 }}>
                        {u.fullName || u.email}
                      </p>
                      {u.blocked && <Badge text="חסום" color="#F44336" />}
                      <Badge text={PLAN_LABELS[u.plan] || u.plan} color={PLAN_COLORS[u.plan] || '#888'} />
                    </div>
                    <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>{u.email}</p>
                    <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>
                      הגשות: {u.appCount} | התקבל: {u.acceptedCount} | נדחה: {u.rejectedCount}
                      {u.aiTailoringsUsed ? ` | AI: ${u.aiTailoringsUsed}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      defaultValue={u.plan}
                      onChange={e => doUpdatePlan(u.userId, e.target.value)}
                      style={{ fontSize: 12, borderRadius: 8, border: '1px solid #ddd', padding: '4px 8px', cursor: 'pointer' }}>
                      <option value="FREE">FREE</option>
                      <option value="PREMIUM">PREMIUM</option>
                      <option value="PREMIUM_PLUS">PREMIUM+</option>
                    </select>
                    <ActionBtn label="⟳ Quota" color="#2196F3" onClick={() => doResetQuota(u.userId)} />
                    <ActionBtn label={u.blocked ? '🔓 שחרר' : '🔒 חסום'} color={u.blocked ? '#4CAF50' : '#FF9800'}
                      onClick={() => doBlock(u.userId, !u.blocked)} />
                    <ActionBtn label="🗑" color="#F44336" onClick={() => doDelete(u.userId, u.email)} />
                  </div>
                </div>
              </div>
            ))}
            {users.length === 0 && <p style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>אין משתמשים</p>}
          </div>
        )}

        {/* JOBS */}
        {!loading && tab === 'jobs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button onClick={doImport}
                style={{ background: 'linear-gradient(135deg,#6C4FD4,#1E2A4A)', color: 'white',
                  border: 'none', borderRadius: 20, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                ⚡ הפעל Importer
              </button>
            </div>
            {jobs.map(j => (
              <div key={j.jobId} style={{ background: 'white', borderRadius: 16, padding: '14px 16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: j.active === false ? 0.55 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: '#1E2A4A', margin: 0 }}>{j.company}</p>
                      <Badge text={j.active === false ? 'לא פעיל' : 'פעיל'}
                        color={j.active === false ? '#F44336' : '#4CAF50'} />
                    </div>
                    <p style={{ fontSize: 13, color: '#6C4FD4', fontWeight: 600, margin: '2px 0' }}>{j.title}</p>
                    <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>
                      👍 {j.likes || 0} · 👎 {j.passes || 0} · 📍 {j.location || ''}
                    </p>
                  </div>
                  <ActionBtn
                    label={j.active === false ? '▶ הפעל' : '⏸ השבת'}
                    color={j.active === false ? '#4CAF50' : '#FF9800'}
                    onClick={() => doToggleJob(j.jobId, j.active !== false)} />
                </div>
              </div>
            ))}
            {jobs.length === 0 && <p style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>אין משרות</p>}
          </div>
        )}

        {/* SELF */}
        {tab === 'self' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* What is Quota */}
            <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 16, padding: '14px 18px' }}>
              <p style={{ fontWeight: 700, color: '#F57F17', margin: '0 0 4px' }}>💡 מה זה Quota?</p>
              <p style={{ fontSize: 13, color: '#795548', margin: 0, lineHeight: 1.6 }}>
                Quota = המונה של כמה פעולות השתמשת היום/החודש.
                למשל: 5 swipes מתוך 5 = Quota מלא = לא ניתן להחליק יותר.
                <strong> איפוס Quota</strong> = האפס את המונה כדי שתוכל לבדוק שוב מההתחלה — ללא תשלום.
              </p>
            </div>

            {/* Switch Plan */}
            <div style={{ background: 'white', borderRadius: 20, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E2A4A', margin: '0 0 6px' }}>🔄 עבור בין מסלולים</h3>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 16px' }}>
                משנה את המסלול שלך לבדיקות — ללא תשלום. כל מסלול מגיע עם ההגבלות האמיתיות שלו.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { plan: 'FREE',         label: 'FREE',      sub: '5 swipes ביום · 0 AI',        color: '#888' },
                  { plan: 'PREMIUM',      label: '⭐ PREMIUM', sub: '30 swipes ביום · 10 AI/חודש', color: '#6C4FD4' },
                  { plan: 'PREMIUM_PLUS', label: '🔥 PREMIUM+',sub: 'ללא הגבלה בכל מה',            color: '#FF6B6B' },
                ].map(({ plan, label, sub, color }) => (
                  <button key={plan}
                    onClick={async () => {
                      setMyPlan(plan);
                      try {
                        await adminResetMyQuota(plan);
                        showToast(`עברת ל-${plan} + Quota אופס`);
                      } catch { showToast('שגיאה', false); }
                    }}
                    style={{ flex: 1, minWidth: 130, padding: '14px 10px', borderRadius: 14,
                      border: `2px solid ${color}`, background: color + '10',
                      cursor: 'pointer', textAlign: 'center' }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color, margin: '0 0 4px' }}>{label}</p>
                    <p style={{ fontSize: 11, color: '#777', margin: 0 }}>{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Reset quota only */}
            <div style={{ background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E2A4A', margin: '0 0 8px' }}>⟳ איפוס Quota בלבד</h3>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 14px' }}>
                אפס את המונה מבלי לשנות מסלול — כשהגעת ל-30 swipes ורוצה לבדוק שוב.
              </p>
              <button onClick={doResetMy}
                style={{ background: 'linear-gradient(135deg,#6C4FD4,#1E2A4A)', color: 'white',
                  border: 'none', borderRadius: 12, padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                ⟳ אפס Quota (שמור Plan נוכחי)
              </button>
            </div>

            {/* Reset swipes */}
            <div style={{ background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E2A4A', margin: '0 0 8px' }}>🔁 איפוס היסטוריית Swipes</h3>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 6px' }}>
                כשמוצגת "סיימת את כל המשרות" — פירושו שעברת על כל המשרות הקיימות, לא שהגעת למכסה.
              </p>
              <p style={{ fontSize: 13, color: '#777', margin: '0 0 14px' }}>
                לחיצה כאן מוחקת את כל ה-Swipes שלך → תוכל לראות את כל המשרות מחדש.
              </p>
              <button onClick={async () => {
                  try { const r = await adminResetMySwipes(); showToast(`Swipes אופסו (${r.deleted} נמחקו)`); }
                  catch { showToast('שגיאה', false); }
                }}
                style={{ background: '#FF9800', color: 'white', border: 'none', borderRadius: 12,
                  padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                🔁 אפס את כל ה-Swipes שלי
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
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 999, whiteSpace: 'nowrap' }}>
          {toast.msg}
        </motion.div>
      )}

      {/* Confirm */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}
          onClick={() => setConfirm(null)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 320, width: '90%', direction: 'rtl' }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#1E2A4A', margin: '0 0 10px' }}>אישור פעולה</p>
            <p style={{ fontSize: 13, color: '#666', margin: '0 0 20px' }}>{confirm.label}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmAction}
                style={{ flex: 1, background: '#F44336', color: 'white', border: 'none',
                  borderRadius: 12, padding: 12, cursor: 'pointer', fontWeight: 700 }}>אשר</button>
              <button onClick={() => setConfirm(null)}
                style={{ flex: 1, background: '#f5f5f5', color: '#333', border: 'none',
                  borderRadius: 12, padding: 12, cursor: 'pointer', fontWeight: 600 }}>בטל</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
