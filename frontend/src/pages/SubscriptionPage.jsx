import { useState, useEffect, useRef } from 'react';
import ICON_SIZES from '../iconSizes';
import { motion, AnimatePresence } from 'framer-motion';
import useTranslation from '../i18n/useTranslation';
import Icon from '../components/Icon';

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
    color: '#8B8299',
    gradient: 'linear-gradient(135deg, #2A2160, #4A35B8)',
    features: {
      daily_swipes: 'sub.FREE.daily_swipes',
      daily_applications: 'sub.FREE.daily_applications',
      ai_tailoring: 'sub.FREE.ai_tailoring',
      auto_apply: 'sub.FREE.auto_apply',
      analytics: 'sub.FREE.analytics',
      priority_matching: 'sub.FREE.priority_matching',
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
    color: '#7C5CFF',
    gradient: 'linear-gradient(90deg, #5B3DF5, #7C5CFF)',
    trial: 'sub.trial',
    features: {
      daily_swipes: 'sub.PREMIUM.daily_swipes',
      daily_applications: 'sub.PREMIUM.daily_applications',
      ai_tailoring: 'sub.PREMIUM.ai_tailoring',
      auto_apply: 'Auto Apply',
      analytics: 'sub.PREMIUM.analytics',
      priority_matching: 'sub.FREE.priority_matching',
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
    color: '#FF5E8A',
    gradient: 'linear-gradient(90deg, #7C5CFF, #FF5E8A)',
    trial: 'sub.trial',
    popular: true,
    features: {
      daily_swipes: 'sub.PREMIUM_PLUS.daily_swipes',
      daily_applications: 'sub.PREMIUM.daily_applications',
      ai_tailoring: 'sub.PREMIUM_PLUS.ai_tailoring',
      auto_apply: 'Auto Apply',
      analytics: 'sub.PREMIUM_PLUS.analytics',
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
  ACTIVE:         { labelKey: 'sub.status.ACTIVE',           color: '#12A96F', bg: '#EBFBF2' },
  TRIAL:          { labelKey: 'sub.status.TRIAL',    color: '#F5A623', bg: '#FFF3E0' },
  EXPIRED:        { labelKey: 'sub.status.EXPIRED',        color: '#FF4D67', bg: '#FFEBEE' },
  CANCELLED:      { labelKey: 'sub.status.CANCELLED',           color: '#8B8299', bg: '#F5F3FC' },
  CANCELLING:     { labelKey: 'sub.status.CANCELLING',          color: '#F5A623', bg: '#FFF4EC' },
  PAYMENT_FAILED: { labelKey: 'sub.status.PAYMENT_FAILED',     color: '#FF4D67', bg: '#FFEBEE' },
  BLOCKED:        { labelKey: 'sub.status.BLOCKED',           color: '#FF4D67', bg: '#FFEBEE' },
  FREE:           { labelKey: 'sub.status.FREE',          color: '#8B8299', bg: '#F5F3FC' },
};

const FEATURE_ROWS = [
  { key: 'daily_swipes',       labelKey: 'sub.row.daily_swipes',   icon: null, ico: 'jobs' },
  { key: 'daily_applications', labelKey: 'sub.row.daily_applications',    icon: null, ico: 'doc' },
  { key: 'ai_tailoring',       labelKey: 'sub.row.ai_tailoring',        icon: null, ico: 'sparkle' },
  { key: 'auto_apply',         labelKey: 'sub.row.auto_apply',      icon: null, ico: 'bolt' },
  { key: 'analytics',          labelKey: 'sub.row.analytics',       icon: null, ico: 'chart' },
  { key: 'priority_matching',  labelKey: 'sub.row.priority_matching',  icon: null, ico: 'target' },
];

export default function SubscriptionPage({ api }) {
  const { t, language } = useTranslation();
  const [subscription, setSubscription] = useState(null);
  const [planKey, setPlanKey] = useState('FREE');
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('overview'); // 'overview' | 'compare'
  const plansRef = useRef(null);
  // Set only on the Stripe success redirect, so the celebration shows once
  // per purchase rather than on every visit to the page.
  const [justUpgraded, setJustUpgraded] = useState(false);

  useEffect(() => {
    loadSubscription();
    // Handle success/cancelled from Stripe redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success') {
      setJustUpgraded(true);
      loadSubscription();
      // Drop the query param so a refresh does not replay the celebration.
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('subscription') === 'cancelled') {
      showToast(t('sub.toast.cancelledCheckout'), 'info');
    }
  }, []);

  const loadSubscription = async () => {
    setLoading(true);
    try {
      const data = await api('GET', '/subscriptions/me');
      const plan = data.planKey || 'FREE';
      setSubscription(data.subscription);
      setPlanKey(plan);
      // Tell the shell so the header plan badge updates without a reload.
      window.dispatchEvent(new CustomEvent('plan-updated', { detail: { planKey: plan } }));
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
    } catch {
      showToast(t('sub.toast.checkoutError'), 'error');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      await api('DELETE', '/subscriptions/me');
      showToast(t('sub.toast.willCancel'));
      loadSubscription();
    } catch {
      showToast(t('sub.toast.cancelError'), 'error');
    } finally {
      setCancelLoading(false);
      setConfirmCancel(false);
    }
  };

  const goToPlans = () => {
    setView('overview');
    setTimeout(() => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const currentPlan = PLANS[planKey] || PLANS.FREE;
  const status = subscription?.status || 'FREE';
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.FREE;
  const isActive = ['ACTIVE', 'TRIAL'].includes(status);
  // Stripe timestamps are seconds. Guard against sentinels (9999999999 = "never")
  // and zero/garbage, which otherwise render as real-looking far-future dates.
  const MAX_REAL_TS = 4102444800; // 2100-01-01
  const fmtTs = (v) => {
    const n = Number(v);
    if (!n || n <= 0 || n >= MAX_REAL_TS) return null;
    return new Date(n * 1000).toLocaleDateString(language === 'en' ? 'en-GB' : 'he-IL');
  };

  const trialEnd = fmtTs(subscription?.trialEndAt);
  const periodEnd = fmtTs(subscription?.currentPeriodEnd);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.root} dir={language === 'en' ? 'ltr' : 'rtl'}>
      {/* Toast */}
      <AnimatePresence>
        {justUpgraded && currentPlan && planKey !== 'FREE' && (
          <motion.div
            key="upgraded"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            style={styles.welcomeCard}
          >
            <p style={styles.welcomeTitle}>
              {t('sub.welcomeTitle').replace('{plan}', language === 'en' ? currentPlan.nameEn : currentPlan.name)}
            </p>
            <p style={styles.welcomeSub}>{t('sub.welcomeSub')}</p>

            <p style={styles.welcomeUnlocked}>{t('sub.featuresUnlocked')}</p>
            <div style={styles.welcomeList}>
              {/* Driven off featureFlags so this can never promise something the
                  plan does not actually grant. */}
              {FEATURE_ROWS.filter(row => currentPlan.featureFlags[row.key]).map(row => (
                <span key={row.key} style={styles.welcomeItem}>
                  ✓ {t(currentPlan.features[row.key])}
                </span>
              ))}
            </div>

            <button type="button" style={styles.welcomeBtn} onClick={() => setJustUpgraded(false)}>
              {t('sub.gotIt')}
            </button>
          </motion.div>
        )}

        {status === 'CANCELLING' && (
          <motion.div
            key="cancelling"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={styles.cancelCard}
          >
            <p style={styles.cancelTitle}>{t('sub.cancelledTitle')}</p>
            <p style={styles.cancelBody}>
              {periodEnd
                ? t('sub.cancelledUntil').replace('{date}', periodEnd)
                : t('sub.cancelledNoDate')}
            </p>
            <p style={styles.cancelHint}>{t('sub.resubscribe')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              ...styles.toast,
              background: toast.type === 'error' ? '#FF4D67' : toast.type === 'info' ? '#3D8BF5' : '#12A96F',
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current plan banner */}
      <div style={{ ...styles.currentPlanCard, background: currentPlan.gradient }}>
        <span aria-hidden="true" style={styles.bannerWave} />
        <div style={styles.currentPlanTop}>
          <span style={styles.crownTile}><Icon name="crown" size={34} fill="currentColor" strokeWidth={1.4} /></span>
          <div style={{ minWidth: 0, flex: '1 1 120px' }}>
            <p style={styles.currentPlanLabel}>{t('sub.currentPlan')}</p>
            <h2 style={styles.currentPlanName}>{language === 'en' ? currentPlan.nameEn : currentPlan.name}</h2>
          </div>
          {planKey !== 'PREMIUM_PLUS' && (
            <button type="button" style={styles.upgradeNowBtn} onClick={goToPlans}>
              {t('sub.upgradeNowBtn')}<Icon name="arrowUp" size={16} strokeWidth={2.6} />
            </button>
          )}
        </div>

        {status !== 'FREE' && (
          <div style={{ ...styles.statusBadge, color: statusInfo.color, background: statusInfo.bg, alignSelf: 'flex-start' }}>
            {t(statusInfo.labelKey)}
          </div>
        )}
        {status === 'TRIAL' && trialEnd && (
          <p style={styles.trialNote}>{t('sub.trialEndsOn')}{trialEnd}</p>
        )}
        {isActive && periodEnd && status !== 'TRIAL' && status !== 'CANCELLING' && (
          <p style={styles.trialNote}>{t('sub.renewsOn')}{periodEnd}</p>
        )}
        {subscription?.cancelAtPeriodEnd && (
          <p style={{ ...styles.trialNote, color: '#FFE49A' }}>
            {t('sub.endsOn')}{periodEnd}{t('sub.willNotRenew')}
          </p>
        )}

        {planKey !== 'FREE' && (
          <p style={styles.currentPrice}>${currentPlan.price} {t('sub.perMonthLong')}</p>
        )}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(view === 'overview' ? styles.tabActive : {}) }}
          onClick={() => setView('overview')}
        >
          {t('sub.tab.overview')}
        </button>
        <button
          style={{ ...styles.tab, ...(view === 'compare' ? styles.tabActive : {}) }}
          onClick={() => setView('compare')}
        >
          {t('sub.tab.compare')}
        </button>
      </div>

      {/* Overview tab */}
      {view === 'overview' && (
        <div style={styles.section}>
          {/* Feature list for current plan */}
          <div style={styles.featureCard}>
            <h3 style={styles.sectionTitle}>{t('sub.included')}</h3>
            {FEATURE_ROWS.map((row) => {
              const hasFeature = currentPlan.featureFlags[row.key];
              return (
                <div key={row.key} style={styles.featureRow}>
                  <span style={styles.featureIconBox}><Icon name={row.ico} size={22} /></span>
                  <span style={{ ...styles.featureText, color: hasFeature ? '#1E2A4A' : '#5F5A72' }}>
                    {t(currentPlan.features[row.key])}
                  </span>
                  <span style={{ color: hasFeature ? '#5B3DF5' : '#8F8AA3', display: 'flex' }}>
                    <Icon name={hasFeature ? 'check' : 'x'} size={20} strokeWidth={2.4} />
                  </span>
                </div>
              );
            })}
          </div>

          {/* Upgrade section for free users */}
          {planKey === 'FREE' && (
            <div style={styles.upgradeSection} ref={plansRef}>
              <UpgradeHeading text={t('sub.upgradeAll')} />
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
              <p style={styles.paymentMethods}>{t('sub.paymentMethods')}</p>
            </div>
          )}

          {/* Upgrade section for premium users */}
          {planKey === 'PREMIUM' && (
            <div style={styles.upgradeSection} ref={plansRef}>
              <UpgradeHeading text={t('sub.upgradePlus')} />
              <div style={styles.upgradeCards}>
                <UpgradeCard
                  plan={PLANS.PREMIUM_PLUS}
                  loading={checkoutLoading === 'PREMIUM_PLUS'}
                  onCheckout={() => handleCheckout('PREMIUM_PLUS')}
                />
              </div>
              <p style={styles.paymentMethods}>{t('sub.paymentMethods')}</p>
            </div>
          )}

          {/* Payment failed warning */}
          {status === 'PAYMENT_FAILED' && (
            <div style={styles.warningCard}>
              <p style={styles.warningTitle}>{t('sub.paymentFailedTitle')}</p>
              <p style={styles.warningText}>
                {t('sub.paymentFailedText')}
              </p>
              <button style={styles.primaryBtn} onClick={() => handleCheckout(planKey)}>
                {t('sub.updatePayment')}
              </button>
            </div>
          )}

          {/* Cancel section for active users */}
          {isActive && !subscription?.cancelAtPeriodEnd && (
            <div style={styles.cancelSection}>
              {!confirmCancel ? (
                <button style={styles.cancelBtn} onClick={() => setConfirmCancel(true)}>
                  {t('sub.cancelPlan')}
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={styles.confirmBox}
                >
                  <p style={styles.confirmText}>
                    {periodEnd ? `${t('sub.confirmCancelQ')}${periodEnd}.` : t('sub.confirmCancelNoDate')}
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      style={styles.confirmCancelBtn}
                      onClick={handleCancel}
                      disabled={cancelLoading}
                    >
                      {cancelLoading ? t('sub.cancelling') : t('sub.confirmCancel')}
                    </button>
                    <button style={styles.confirmKeepBtn} onClick={() => setConfirmCancel(false)}>
                      {t('sub.keepPlan')}
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

function UpgradeHeading({ text }) {
  return (
    <div style={styles.upgradeHead}>
      <span style={styles.upgradeLine} />
      <p style={styles.upgradeTitle}><Icon name="crown" size={22} />{text}</p>
      <span style={styles.upgradeLine} />
    </div>
  );
}

function UpgradeCard({ plan, loading, onCheckout }) {
  const { t, language } = useTranslation();
  const isPlus = plan.key === 'PREMIUM_PLUS';
  const name = language === 'en' ? plan.nameEn : plan.name;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      style={{
        ...styles.upgradeCard,
        border: isPlus ? '2px solid #8A6CFF' : '1.5px solid #E4DFF2',
        background: isPlus ? 'linear-gradient(180deg, #F6F1FF 0%, #FFFFFF 60%)' : '#fff',
        position: 'relative',
      }}
    >
      {plan.popular && (
        <div style={styles.popularBadge}>{t('sub.mostPopular')}</div>
      )}
      <div style={styles.planHeadRow}>
        <span style={{ ...styles.planTile, background: isPlus ? '#7C5CFF' : '#B7A5FF' }}>
          <Icon name={isPlus ? 'crown' : 'bolt'} size={24} strokeWidth={1.8} />
        </span>
        <p style={{ ...styles.upgradePlanName, color: isPlus ? '#5B3DF5' : '#6A4CF5' }}>{name}</p>
      </div>
      <p style={styles.upgradePrice}>
        <span dir="ltr">${plan.price}</span>
        <span style={styles.upgradePriceSub}> {t('sub.perMonth')}</span>
      </p>
      {plan.trial && (
        <p style={styles.trialTag}>✨ {t(plan.trial)}</p>
      )}
      <div style={styles.upgradeFeatures}>
        {FEATURE_ROWS.map((row) => {
          const has = plan.featureFlags[row.key];
          return (
            <p key={row.key} style={{ ...styles.upgradeFeature, color: has ? '#1E2A4A' : '#9A95AC' }}>
              <span style={{ color: has ? '#5B3DF5' : '#B9B4CC', display: 'inline-flex', flexShrink: 0 }}>
                <Icon name={has ? 'check' : 'x'} size={16} strokeWidth={2.6} />
              </span>
              <span>{t(plan.features[row.key])}</span>
            </p>
          );
        })}
      </div>
      <motion.button
        style={isPlus ? { ...styles.checkoutBtn, background: 'linear-gradient(90deg, #5B3DF5, #8A6CFF)', color: '#fff' }
                      : { ...styles.checkoutBtn, background: '#fff', color: '#5B3DF5', border: '1.5px solid #5B3DF5' }}
        whileTap={{ scale: 0.97 }}
        onClick={onCheckout}
        disabled={loading}
      >
        {loading ? (
          <div style={{ ...styles.spinner, width: '18px', height: '18px', borderWidth: '2px', borderTopColor: isPlus ? 'white' : '#5B3DF5' }} />
        ) : (
          `${t('sub.upgradeTo')}${name}`
        )}
      </motion.button>
      <p style={styles.billingNote}>
        {(plan.trialKey
          ? t('sub.disclosureTrial').replace('{days}', '7')
          : t('sub.disclosureNoTrial')
        ).replace('{price}', `$${plan.price}`)}
        {' '}
        {t('sub.disclosureCancel')}
      </p>
    </motion.div>
  );
}

const PLAN_RANK = { FREE: 0, PREMIUM: 1, PREMIUM_PLUS: 2 };

function CompareTable({ plans, currentPlanKey, checkoutLoading, onCheckout }) {
  const { t, language } = useTranslation();
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
                  {t('sub.mostPopular')}
                </div>
              ) : (
                <div style={{ height: '26px' }} />
              )}
              <img src={pk === 'FREE' ? '/icons/free_members_icon.png' : pk === 'PREMIUM' ? '/icons/premium_member_icon.png' : '/icons/plus_members_icon.png'} alt="" style={{ width: `${ICON_SIZES.planLogoTable}px`, height: `${ICON_SIZES.planLogoTable}px`, objectFit: 'contain', marginBottom: '4px' }} />
              <p style={{ ...styles.comparePlanName, color: plan.color }}>{language === 'en' ? plan.nameEn : plan.name}</p>
              <p style={styles.comparePlanPrice}>
                {plan.price === 0 ? t('sub.free') : `$${plan.price}${t('sub.perMonth')}`}
              </p>
              {isCurrent ? (
                <div style={styles.currentBadge}>{t('sub.yourPlan')}</div>
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
                      ? t('sub.upgrade')
                      : t('sub.changePlan')}
                </motion.button>
              ) : null}
            </div>
          );
        })}
      </div>

      <p style={{ ...styles.billingNote, padding: '0 16px 10px' }}>
        {t('sub.disclosureNoTrial').replace('{price}', '$9.99 / $19.99')}{' '}
        {t('sub.disclosureCancel')}
      </p>

      {/* Rows */}
      {FEATURE_ROWS.map((row, i) => (
        <div key={row.key} style={{ ...styles.compareRow, background: i % 2 === 0 ? '#F8F6FF' : 'white' }}>
          <div style={styles.compareFeatureCol}>
            <span style={styles.featureIcon}>{row.icon}</span>
            <span style={styles.compareFeatLabel}>{t(row.labelKey)}</span>
          </div>
          {planKeys.map((pk) => {
            const plan = plans[pk];
            const has = plan.featureFlags[row.key];
            return (
              <div key={pk} style={styles.comparePlanCol}>
                <div style={{ color: has ? plan.color : '#E7E3F0', fontWeight: 700, textAlign: 'center' }}>
                  {has ? '✓' : '✕'}
                </div>
                <div style={{ fontSize: '11px', color: '#6F6A84', textAlign: 'center', marginTop: '2px' }}>
                  {t(plan.features[row.key])}
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
    position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
    color: 'white', padding: '12px 24px', borderRadius: '999px',
    fontSize: '14px', fontWeight: 700, zIndex: 500,
    boxShadow: '0 1px 3px rgba(30,20,70,0.06)',
  },
  welcomeCard: {
    background: 'linear-gradient(135deg, #EBFBF2, #E6F7FF)',
    border: '1px solid #A9E9CB', borderRadius: '22px', padding: '20px',
    display: 'flex', flexDirection: 'column', gap: '8px',
    boxShadow: '0 1px 3px rgba(30,20,70,0.06)',
  },
  welcomeTitle: { margin: 0, fontSize: '18px', fontWeight: 900, color: '#0E7A52' },
  welcomeSub: { margin: 0, fontSize: '13px', fontWeight: 600, color: '#12A96F' },
  welcomeUnlocked: { margin: '6px 0 0', fontSize: '12px', fontWeight: 700, color: '#0E7A52' },
  welcomeList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  welcomeItem: { fontSize: '13px', fontWeight: 600, color: '#166534' },
  welcomeBtn: {
    marginTop: '8px', alignSelf: 'flex-start', border: 'none', borderRadius: '999px',
    background: '#12A96F', color: 'white', padding: '10px 20px',
    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
  },
  cancelCard: {
    background: '#FFF4EC', border: '1px solid #F7D9A8', borderRadius: '18px',
    padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '5px',
  },
  cancelTitle: { margin: 0, fontSize: '14px', fontWeight: 900, color: '#C2410C' },
  cancelBody: { margin: 0, fontSize: '13px', fontWeight: 600, color: '#8A4B1F', lineHeight: 1.6 },
  cancelHint: { margin: 0, fontSize: '12px', color: '#A9713F' },
  currentPlanCard: {
    borderRadius: '22px', padding: '18px', position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 14px 30px rgba(60,40,140,0.25)',
  },
  bannerWave: {
    position: 'absolute', insetInlineEnd: '-40px', bottom: '-70px', width: '260px', height: '170px', borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', pointerEvents: 'none',
  },
  crownTile: {
    width: '68px', height: '68px', borderRadius: '20px', flexShrink: 0, color: '#E7DDFF',
    background: 'linear-gradient(145deg, rgba(255,255,255,0.28), rgba(255,255,255,0.08))',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)',
  },
  upgradeNowBtn: {
    flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '8px', border: 'none', cursor: 'pointer',
    background: '#E9E3FF', color: '#4A2FD8', borderRadius: '999px', padding: '11px 18px', fontSize: '15px', fontWeight: 800,
  },
  currentPlanTop: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px 14px', position: 'relative' },
  currentPlanLabel: { fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: 0, whiteSpace: 'nowrap' },
  currentPlanName: { fontSize: '30px', fontWeight: 800, color: 'white', margin: 0, letterSpacing: '-0.3px' },
  statusBadge: {
    padding: '5px 13px', borderRadius: '999px',
    fontSize: '11.5px', fontWeight: 700,
  },
  trialNote: { fontSize: '13px', color: 'rgba(255,255,255,0.9)', margin: 0 },
  currentPrice: { fontSize: '15px', color: 'rgba(255,255,255,0.92)', margin: 0, fontWeight: 700 },
  tabs: { display: 'flex', borderBottom: '1px solid #E7E3F0' },
  tab: { flex: 1, padding: '10px 8px 12px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '15px', background: 'transparent', color: '#9A95AC', marginBottom: '-1px', borderBottom: '3px solid transparent' },
  tabActive: { color: '#1E2A4A', borderBottom: '3px solid #7C5CFF' },
  section: { display: 'flex', flexDirection: 'column', gap: '16px' },
  featureCard: { background: 'rgba(255,255,255,0.9)', border: '1px solid #E7E3F0', borderRadius: '22px', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: '2px' },
  sectionTitle: { fontSize: '20px', fontWeight: 800, margin: '0 0 6px', color: '#1E2A4A' },
  featureRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '11px 0', borderBottom: '1px solid #EFEBF8' },
  featureIcon: { fontSize: '18px', width: '24px', textAlign: 'center' },
  featureIconBox: {
    width: '46px', height: '46px', borderRadius: '14px', flexShrink: 0, background: '#ECE6FF', color: '#5B3DF5',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  featureText: { flex: 1, fontSize: '16px', fontWeight: 500 },
  upgradeSection: { display: 'flex', flexDirection: 'column', gap: '12px' },
  upgradeHead: { display: 'flex', alignItems: 'center', gap: '12px', margin: '6px 0 4px' },
  upgradeLine: { flex: 1, height: '1px', background: '#D9D2EE' },
  upgradeTitle: { fontSize: '18px', fontWeight: 800, color: '#1E2A4A', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px', textAlign: 'center' },
  upgradeCards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', paddingTop: '8px' },
  upgradeCard: { borderRadius: '22px', padding: '22px 14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 },
  popularBadge: { position: 'absolute', top: '-13px', insetInlineStart: '14px', background: '#8A3DD6', color: 'white', fontSize: '12px', fontWeight: 800, padding: '4px 12px', borderRadius: '999px', whiteSpace: 'nowrap' },
  upgradePlanName: { fontSize: '16px', fontWeight: 800, margin: 0, lineHeight: 1.15 },
  planHeadRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  planTile: { width: '46px', height: '46px', borderRadius: '14px', flexShrink: 0, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  upgradePrice: { fontSize: '26px', fontWeight: 800, color: '#1E2A4A', margin: 0, lineHeight: 1.1, whiteSpace: 'nowrap' },
  upgradePriceSub: { fontSize: '13px', fontWeight: 600, color: '#6F6A84' },
  trialTag: { fontSize: '12px', color: '#F5A623', fontWeight: 700, margin: 0 },
  upgradeFeatures: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, margin: '4px 0 6px' },
  upgradeFeature: { fontSize: '13.5px', margin: 0, display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: 1.35 },
  checkoutBtn: { width: '100%', padding: '13px 8px', borderRadius: '999px', border: 'none', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' },
  billingNote: {
    fontSize: '11px', lineHeight: 1.55, color: '#5F5A72',
    margin: '8px 0 0', textAlign: 'center',
  },
  paymentMethods: { fontSize: '12px', color: '#6F6A84', margin: '2px 0 0', textAlign: 'center' },
  warningCard: { background: '#FFF4EC', border: '2px solid #F5A623', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' },
  warningTitle: { fontSize: '15px', fontWeight: 700, color: '#C2410C', margin: 0 },
  warningText: { fontSize: '13px', color: '#7A7592', margin: 0 },
  primaryBtn: { background: '#F5A623', color: 'white', border: 'none', borderRadius: '999px', padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' },
  cancelSection: { display: 'flex', justifyContent: 'center', paddingTop: '8px' },
  cancelBtn: { background: 'transparent', border: 'none', color: '#FF4D67', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline', padding: '4px', fontWeight: 600 },
  confirmBox: { background: '#FFEBEE', borderRadius: '18px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' },
  confirmText: { fontSize: '14px', color: '#B71C1C', margin: 0, lineHeight: 1.5, textAlign: 'center' },
  confirmCancelBtn: { flex: 1, padding: '10px', background: '#FF4D67', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' },
  confirmKeepBtn: { flex: 1, padding: '10px', background: '#12A96F', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' },
  compareSection: { overflow: 'hidden' },
  compareTable: { display: 'flex', flexDirection: 'column', gap: '0', background: '#fff', border: '1px solid #E7E3F0', borderRadius: '18px', overflow: 'hidden' },
  compareHeader: { display: 'flex', padding: '16px', gap: '4px', background: 'white', borderBottom: '2px solid #F0EDF6' },
  compareFeatureCol: { flex: 1.2, display: 'flex', alignItems: 'center', gap: '8px' },
  comparePlanCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '4px', borderRadius: '12px' },
  comparePlanName: { fontSize: '13px', fontWeight: 700, margin: 0, textAlign: 'center' },
  comparePlanPrice: { fontSize: '11px', color: '#6F6A84', margin: 0, textAlign: 'center' },
  currentBadge: { background: '#EBFBF2', color: '#12A96F', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px' },
  compareCheckoutBtn: { color: 'white', border: 'none', borderRadius: '999px', padding: '6px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '11px' },
  compareRow: { display: 'flex', padding: '12px 16px', gap: '4px', alignItems: 'center' },
  compareFeatLabel: { fontSize: '13px', color: '#1E2A4A', fontWeight: 600 },
  spinner: { width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #E4DCFC', borderTop: '3px solid #7C5CFF', animation: 'spin 0.8s linear infinite' },
};

// Inject spin animation
const ss = document.createElement('style');
ss.innerHTML = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(ss);
