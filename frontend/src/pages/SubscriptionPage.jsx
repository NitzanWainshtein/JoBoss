import React, { useState, useEffect } from 'react';
import ICON_SIZES from '../iconSizes';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Feature #SUB-UI-001 — Subscription management page
 * Embedded inside ProfilePage under ?tab=subscription
 * Shows: current plan, plan comparison, checkout, cancellation, status
 */

const PLANS = {
  FREE: {
    key: 'FREE',
    name: 'חינמי',
    nameEn: 'Free',
    price: 0,
    color: '#888',
    gradient: 'linear-gradient(135deg, #888, #555)',
    features: {
      daily_swipes: '5 החלקות ביום',
      daily_applications: '5 הגשות ביום',
      ai_tailoring: 'ללא התאמת AI',
      auto_apply: 'ללא Auto Apply',
      analytics: 'ללא Analytics',
      priority_matching: 'ללא Priority Matching',
    },
    featureFlags: {
      daily_swipes: false,
      daily_applications: false,
      ai_tailoring: false,
      auto_apply: false,
      analytics: false,
      priority_matching: false,
    },
  },
  PREMIUM: {
    key: 'PREMIUM',
    name: 'פרימיום',
    nameEn: 'Premium',
    price: 9.99,
    color: '#6C4FD4',
    gradient: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
    trial: '7 ימי ניסיון חינם',
    features: {
      daily_swipes: '30 החלקות ביום',
      daily_applications: 'הגשות ללא הגבלה',
      ai_tailoring: '10 התאמות AI בחודש',
      auto_apply: 'Auto Apply',
      analytics: 'Analytics בסיסי',
      priority_matching: 'ללא Priority Matching',
    },
    featureFlags: {
      daily_swipes: true,
      daily_applications: true,
      ai_tailoring: true,
      auto_apply: true,
      analytics: true,
      priority_matching: false,
    },
  },
  PREMIUM_PLUS: {
    key: 'PREMIUM_PLUS',
    name: 'פרימיום+',
    nameEn: 'Premium+',
    price: 19.99,
    color: '#FF6B6B',
    gradient: 'linear-gradient(135deg, #FF6B6B, #C2185B)',
    trial: '7 ימי ניסיון חינם',
    popular: true,
    features: {
      daily_swipes: 'החלקות ללא הגבלה',
      daily_applications: 'הגשות ללא הגבלה',
      ai_tailoring: 'AI ללא הגבלה',
      auto_apply: 'Auto Apply',
      analytics: 'Analytics מתקדם',
      priority_matching: 'Priority Matching',
    },
    featureFlags: {
      daily_swipes: true,
      daily_applications: true,
      ai_tailoring: true,
      auto_apply: true,
      analytics: true,
      priority_matching: true,
    },
  },
};

const STATUS_MAP = {
  ACTIVE:         { label: 'פעיל',           color: '#4CAF50', bg: '#E8F5E9' },
  TRIAL:          { label: 'ניסיון חינם',    color: '#FF9800', bg: '#FFF3E0' },
  EXPIRED:        { label: 'פג תוקף',        color: '#F44336', bg: '#FFEBEE' },
  CANCELLED:      { label: 'בוטל',           color: '#9E9E9E', bg: '#F5F5F5' },
  PAYMENT_FAILED: { label: 'תשלום נכשל',     color: '#F44336', bg: '#FFEBEE' },
  BLOCKED:        { label: 'חסום',           color: '#F44336', bg: '#FFEBEE' },
  FREE:           { label: 'חינמי',          color: '#888',    bg: '#F5F5F5' },
};

const FEATURE_ROWS = [
  { key: 'daily_swipes',       label: 'החלקות יומיות',   icon: null, img: '/icons/jobs_icon.png' },
  { key: 'daily_applications', label: 'הגשות יומיות',    icon: null, img: '/icons/applies_icon.png' },
  { key: 'ai_tailoring',       label: 'התאמת AI',        icon: null, img: '/icons/robot_icon.png' },
  { key: 'auto_apply',         label: 'Auto Apply',      icon: null, img: '/icons/waiting_to_apply_icon.png' },
  { key: 'analytics',          label: 'Analytics',       icon: null, img: '/icons/process_icon.png' },
  { key: 'priority_matching',  label: 'Priority Match',  icon: null, img: '/icons/search_icon.png' },
];

export default function SubscriptionPage({ api }) {
  const [subscription, setSubscription] = useState(null);
  const [planKey, setPlanKey] = useState('FREE');
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('overview'); // 'overview' | 'compare'

  useEffect(() => {
    loadSubscription();
    // Handle success/cancelled from Stripe redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success') {
      showToast('🎉 המנוי הופעל בהצלחה!', 'success');
      loadSubscription();
    } else if (params.get('subscription') === 'cancelled') {
      showToast('החיוב בוטל. תמיד תוכל לשדרג שוב.', 'info');
    }
  }, []);

  const loadSubscription = async () => {
    setLoading(true);
    try {
      const data = await api('GET', '/subscriptions/me');
      setSubscription(data.subscription);
      setPlanKey(data.planKey || 'FREE');
    } catch {
      setSubscription(null);
      setPlanKey('FREE');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCheckout = async (targetPlan) => {
    setCheckoutLoading(targetPlan);
    try {
      const data = await api('POST', '/subscriptions/checkout', { plan: targetPlan });
      window.location.href = data.checkoutUrl;
    } catch (e) {
      showToast('שגיאה בפתיחת עמוד התשלום. נסה שוב.', 'error');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      await api('DELETE', '/subscriptions/me');
      showToast('המנוי יבוטל בסוף תקופת החיוב הנוכחית.');
      loadSubscription();
    } catch {
      showToast('שגיאה בביטול. פנה לתמיכה.', 'error');
    } finally {
      setCancelLoading(false);
      setConfirmCancel(false);
    }
  };

  const currentPlan = PLANS[planKey] || PLANS.FREE;
  const status = subscription?.status || 'FREE';
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.FREE;
  const isActive = ['ACTIVE', 'TRIAL'].includes(status);
  const trialEnd = subscription?.trialEndAt
    ? new Date(Number(subscription.trialEndAt) * 1000).toLocaleDateString('he-IL')
    : null;
  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(Number(subscription.currentPeriodEnd) * 1000).toLocaleDateString('he-IL')
    : null;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.root} dir="rtl">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              ...styles.toast,
              background: toast.type === 'error' ? '#F44336' : toast.type === 'info' ? '#2196F3' : '#4CAF50',
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current plan header */}
      <div style={{ ...styles.currentPlanCard, background: currentPlan.gradient }}>
        <div style={styles.currentPlanTop}>
          <div>
            <p style={styles.currentPlanLabel}>המנוי הנוכחי שלך</p>
            <h2 style={styles.currentPlanName}>{currentPlan.name}</h2>
          </div>
          <div style={{ ...styles.statusBadge, color: statusInfo.color, background: statusInfo.bg }}>
            {statusInfo.label}
          </div>
        </div>

        {status === 'TRIAL' && trialEnd && (
          <p style={styles.trialNote}>🎁 תקופת ניסיון — פג ב-{trialEnd}</p>
        )}
        {isActive && periodEnd && status !== 'TRIAL' && (
          <p style={styles.trialNote}>📅 חידוש אוטומטי ב-{periodEnd}</p>
        )}
        {subscription?.cancelAtPeriodEnd && (
          <p style={{ ...styles.trialNote, color: '#FFD54F' }}>
            ⚠️ המנוי יסתיים ב-{periodEnd} ולא יחודש
          </p>
        )}

        {planKey !== 'FREE' && (
          <p style={styles.currentPrice}>${currentPlan.price} / לחודש</p>
        )}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(view === 'overview' ? styles.tabActive : {}) }}
          onClick={() => setView('overview')}
        >
          סקירה כללית
        </button>
        <button
          style={{ ...styles.tab, ...(view === 'compare' ? styles.tabActive : {}) }}
          onClick={() => setView('compare')}
        >
          השוואת תוכניות
        </button>
      </div>

      {/* Overview tab */}
      {view === 'overview' && (
        <div style={styles.section}>
          {/* Feature list for current plan */}
          <div style={styles.featureCard}>
            <h3 style={styles.sectionTitle}>מה כלול במנוי שלך</h3>
            {FEATURE_ROWS.map((row) => {
              const hasFeature = currentPlan.featureFlags[row.key];
              return (
                <div key={row.key} style={styles.featureRow}>
                  <span style={styles.featureIcon}>{row.img ? <img src={row.img} alt="" style={{ width: `${ICON_SIZES.featureRow}px`, height: `${ICON_SIZES.featureRow}px`, objectFit: 'contain' }} /> : row.icon}</span>
                  <span style={{ ...styles.featureText, color: hasFeature ? '#1E2A4A' : '#bbb' }}>
                    {currentPlan.features[row.key]}
                  </span>
                  <span style={{ color: hasFeature ? '#4CAF50' : '#ddd', fontSize: '18px' }}>
                    {hasFeature ? '✓' : '✕'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Upgrade section for free users */}
          {planKey === 'FREE' && (
            <div style={styles.upgradeSection}>
              <p style={styles.upgradeTitle}>שדרג ותקבל גישה לכל הפיצ׳רים</p>
              <div style={styles.upgradeCards}>
                {['PREMIUM', 'PREMIUM_PLUS'].map((pk) => (
                  <UpgradeCard
                    key={pk}
                    plan={PLANS[pk]}
                    loading={checkoutLoading === pk}
                    onCheckout={() => handleCheckout(pk)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upgrade section for premium users */}
          {planKey === 'PREMIUM' && (
            <div style={styles.upgradeSection}>
              <p style={styles.upgradeTitle}>שדרג לפרימיום+ — ללא הגבלות</p>
              <div style={styles.upgradeCards}>
                <UpgradeCard
                  plan={PLANS.PREMIUM_PLUS}
                  loading={checkoutLoading === 'PREMIUM_PLUS'}
                  onCheckout={() => handleCheckout('PREMIUM_PLUS')}
                />
              </div>
            </div>
          )}

          {/* Payment failed warning */}
          {status === 'PAYMENT_FAILED' && (
            <div style={styles.warningCard}>
              <p style={styles.warningTitle}>⚠️ התשלום האחרון שלך נכשל</p>
              <p style={styles.warningText}>
                עדכן את פרטי התשלום שלך כדי לשמור על המנוי הפעיל.
              </p>
              <button style={styles.primaryBtn} onClick={() => handleCheckout(planKey)}>
                עדכן פרטי תשלום
              </button>
            </div>
          )}

          {/* Cancel section for active users */}
          {isActive && !subscription?.cancelAtPeriodEnd && (
            <div style={styles.cancelSection}>
              {!confirmCancel ? (
                <button style={styles.cancelBtn} onClick={() => setConfirmCancel(true)}>
                  ביטול מנוי
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={styles.confirmBox}
                >
                  <p style={styles.confirmText}>
                    בטוח שברצונך לבטל? תמשיך ליהנות מהמנוי עד {periodEnd}.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      style={styles.confirmCancelBtn}
                      onClick={handleCancel}
                      disabled={cancelLoading}
                    >
                      {cancelLoading ? 'מבטל...' : 'כן, בטל'}
                    </button>
                    <button style={styles.confirmKeepBtn} onClick={() => setConfirmCancel(false)}>
                      שמור מנוי
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compare tab */}
      {view === 'compare' && (
        <div style={styles.compareSection}>
          <CompareTable
            plans={PLANS}
            currentPlanKey={planKey}
            checkoutLoading={checkoutLoading}
            onCheckout={handleCheckout}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UpgradeCard({ plan, loading, onCheckout }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      style={{
        ...styles.upgradeCard,
        border: `2px solid ${plan.color}`,
        position: 'relative',
      }}
    >
      {plan.popular && (
        <div style={{ ...styles.popularBadge, background: plan.color }}>🔥 הכי פופולרי</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
        <img src={plan.key === 'FREE' ? '/icons/free_members_icon.png' : plan.key === 'PREMIUM' ? '/icons/premium_member_icon.png' : '/icons/plus_members_icon.png'} alt="" style={{ width: `${ICON_SIZES.planLogoCard}px`, height: `${ICON_SIZES.planLogoCard}px`, objectFit: 'contain' }} />
        <p style={{ ...styles.upgradePlanName, color: plan.color, margin: 0 }}>{plan.name}</p>
      </div>
      <p style={styles.upgradePrice}>
        ${plan.price}
        <span style={styles.upgradePriceSub}> / חודש</span>
      </p>
      {plan.trial && (
        <p style={styles.trialTag}>✨ {plan.trial}</p>
      )}
      <div style={styles.upgradeFeatures}>
        {FEATURE_ROWS.map((row) => (
          <p key={row.key} style={{ ...styles.upgradeFeature, color: plan.featureFlags[row.key] ? '#333' : '#ccc' }}>
            {plan.featureFlags[row.key] ? '✓' : '✕'} {plan.features[row.key]}
          </p>
        ))}
      </div>
      <motion.button
        style={{ ...styles.checkoutBtn, background: plan.gradient }}
        whileHover={{ opacity: 0.9 }}
        whileTap={{ scale: 0.97 }}
        onClick={onCheckout}
        disabled={loading}
      >
        {loading ? (
          <div style={{ ...styles.spinner, width: '18px', height: '18px', borderWidth: '2px', borderTopColor: 'white' }} />
        ) : (
          `שדרג ל-${plan.name}`
        )}
      </motion.button>
      <p style={styles.paymentMethods}>
        💳 Apple Pay · Google Pay · כרטיס אשראי
      </p>
    </motion.div>
  );
}

const PLAN_RANK = { FREE: 0, PREMIUM: 1, PREMIUM_PLUS: 2 };

function CompareTable({ plans, currentPlanKey, checkoutLoading, onCheckout }) {
  const planKeys = ['FREE', 'PREMIUM', 'PREMIUM_PLUS'];

  return (
    <div style={styles.compareTable}>
      {/* Headers */}
      <div style={{ ...styles.compareHeader, justifyContent: 'center' }}>
        <div style={{ ...styles.compareFeatureCol, visibility: 'hidden' }} />
        {planKeys.map((pk) => {
          const plan = plans[pk];
          const isCurrent = pk === currentPlanKey;
          return (
            <div key={pk} style={{ ...styles.comparePlanCol, borderColor: plan.color }}>
              {plan.popular ? (
                <div style={{ ...styles.popularBadge, background: plan.color, position: 'static', marginBottom: '4px' }}>
                  🔥 הכי פופולרי
                </div>
              ) : (
                <div style={{ height: '26px' }} />
              )}
              <img src={pk === 'FREE' ? '/icons/free_members_icon.png' : pk === 'PREMIUM' ? '/icons/premium_member_icon.png' : '/icons/plus_members_icon.png'} alt="" style={{ width: `${ICON_SIZES.planLogoTable}px`, height: `${ICON_SIZES.planLogoTable}px`, objectFit: 'contain', marginBottom: '4px' }} />
              <p style={{ ...styles.comparePlanName, color: plan.color }}>{plan.name}</p>
              <p style={styles.comparePlanPrice}>
                {plan.price === 0 ? 'חינם' : `$${plan.price}/חודש`}
              </p>
              {isCurrent ? (
                <div style={styles.currentBadge}>המנוי שלך</div>
              ) : pk !== 'FREE' ? (
                <motion.button
                  style={{ ...styles.compareCheckoutBtn, background: plan.gradient }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onCheckout(pk)}
                  disabled={checkoutLoading === pk}
                >
                  {checkoutLoading === pk
                    ? '...'
                    : PLAN_RANK[pk] > PLAN_RANK[currentPlanKey]
                      ? 'שדרג'
                      : 'שנה תוכנית'}
                </motion.button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Rows */}
      {FEATURE_ROWS.map((row, i) => (
        <div key={row.key} style={{ ...styles.compareRow, background: i % 2 === 0 ? '#F8F8FF' : 'white' }}>
          <div style={styles.compareFeatureCol}>
            <span style={styles.featureIcon}>{row.icon}</span>
            <span style={styles.compareFeatLabel}>{row.label}</span>
          </div>
          {planKeys.map((pk) => {
            const plan = plans[pk];
            const has = plan.featureFlags[row.key];
            return (
              <div key={pk} style={styles.comparePlanCol}>
                <div style={{ color: has ? plan.color : '#ddd', fontWeight: 700, textAlign: 'center' }}>
                  {has ? '✓' : '✕'}
                </div>
                <div style={{ fontSize: '11px', color: '#888', textAlign: 'center', marginTop: '2px' }}>
                  {plan.features[row.key]}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', padding: '0 0 24px 0' },
  toast: {
    position: 'fixed', top: '72px', left: '50%', transform: 'translateX(-50%)',
    color: 'white', padding: '12px 24px', borderRadius: '20px',
    fontSize: '14px', fontWeight: 600, zIndex: 500,
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
  },
  currentPlanCard: {
    borderRadius: '20px', padding: '24px',
    display: 'flex', flexDirection: 'column', gap: '8px',
  },
  currentPlanTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  currentPlanLabel: { fontSize: '12px', color: 'rgba(255,255,255,0.7)', margin: 0 },
  currentPlanName: { fontSize: '26px', fontWeight: 800, color: 'white', margin: 0 },
  statusBadge: {
    padding: '4px 12px', borderRadius: '20px',
    fontSize: '12px', fontWeight: 700,
  },
  trialNote: { fontSize: '13px', color: 'rgba(255,255,255,0.85)', margin: 0 },
  currentPrice: { fontSize: '15px', color: 'rgba(255,255,255,0.9)', margin: 0, fontWeight: 600 },
  tabs: { display: 'flex', gap: '8px', background: 'white', padding: '8px', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  tab: { flex: 1, padding: '10px', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', background: 'transparent', color: '#777' },
  tabActive: { background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)', color: 'white' },
  section: { display: 'flex', flexDirection: 'column', gap: '16px' },
  featureCard: { background: 'white', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  sectionTitle: { fontSize: '16px', fontWeight: 700, margin: 0, color: '#1E2A4A' },
  featureRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid #f5f5f5' },
  featureIcon: { fontSize: '18px', width: '24px', textAlign: 'center' },
  featureText: { flex: 1, fontSize: '14px', fontWeight: 500 },
  upgradeSection: { display: 'flex', flexDirection: 'column', gap: '12px' },
  upgradeTitle: { fontSize: '16px', fontWeight: 700, color: '#1E2A4A', margin: 0, textAlign: 'center' },
  upgradeCards: { display: 'flex', gap: '12px' },
  upgradeCard: { flex: 1, background: 'white', borderRadius: '20px', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' },
  popularBadge: { position: 'absolute', top: '12px', left: '12px', color: 'white', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px' },
  upgradePlanName: { fontSize: '17px', fontWeight: 800, margin: 0 },
  upgradePrice: { fontSize: '22px', fontWeight: 800, color: '#1E2A4A', margin: 0 },
  upgradePriceSub: { fontSize: '13px', fontWeight: 500, color: '#888' },
  trialTag: { fontSize: '12px', color: '#FF9800', fontWeight: 600, margin: 0 },
  upgradeFeatures: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 },
  upgradeFeature: { fontSize: '12px', margin: 0 },
  checkoutBtn: { width: '100%', padding: '12px', borderRadius: '12px', border: 'none', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' },
  paymentMethods: { fontSize: '10px', color: '#aaa', margin: 0, textAlign: 'center' },
  warningCard: { background: '#FFF3E0', border: '2px solid #FF9800', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' },
  warningTitle: { fontSize: '15px', fontWeight: 700, color: '#E65100', margin: 0 },
  warningText: { fontSize: '13px', color: '#666', margin: 0 },
  primaryBtn: { background: '#FF9800', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' },
  cancelSection: { display: 'flex', justifyContent: 'center', paddingTop: '8px' },
  cancelBtn: { background: 'transparent', border: 'none', color: '#F44336', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline', padding: '4px' },
  confirmBox: { background: '#FFEBEE', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' },
  confirmText: { fontSize: '14px', color: '#B71C1C', margin: 0, lineHeight: 1.5, textAlign: 'center' },
  confirmCancelBtn: { flex: 1, padding: '10px', background: '#F44336', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' },
  confirmKeepBtn: { flex: 1, padding: '10px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' },
  compareSection: { overflow: 'hidden' },
  compareTable: { display: 'flex', flexDirection: 'column', gap: '0', background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  compareHeader: { display: 'flex', padding: '16px', gap: '4px', background: 'white', borderBottom: '2px solid #f0f0f0' },
  compareFeatureCol: { flex: 1.2, display: 'flex', alignItems: 'center', gap: '8px' },
  comparePlanCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '4px', borderRadius: '12px' },
  comparePlanName: { fontSize: '13px', fontWeight: 800, margin: 0, textAlign: 'center' },
  comparePlanPrice: { fontSize: '11px', color: '#888', margin: 0, textAlign: 'center' },
  currentBadge: { background: '#E8F5E9', color: '#4CAF50', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px' },
  compareCheckoutBtn: { color: 'white', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' },
  compareRow: { display: 'flex', padding: '12px 16px', gap: '4px', alignItems: 'center' },
  compareFeatLabel: { fontSize: '13px', color: '#333', fontWeight: 500 },
  spinner: { width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #D4CCFF', borderTop: '3px solid #6C4FD4', animation: 'spin 0.8s linear infinite' },
};

// Inject spin animation
const ss = document.createElement('style');
ss.innerHTML = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(ss);
