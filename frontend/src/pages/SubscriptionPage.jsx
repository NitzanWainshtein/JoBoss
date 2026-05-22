import React, { useEffect, useMemo, useState } from 'react';
import { cancelSubscription, checkoutSubscription, getMySubscription } from '../api';

function SubscriptionPage() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isPremium = subscription?.plan === 'PREMIUM';
  const used = subscription?.used ?? 0;
  const dailyLimit = subscription?.dailyLimit ?? 5;
  const resetAt = subscription?.resetAt;

  const usagePercent = Math.min(
    100,
    Math.round((used / Math.max(dailyLimit, 1)) * 100)
  );

  const benefits = useMemo(() => {
    if (isPremium) {
      return [
        'עד 50 הגשות ביום',
        'גישה להתאמת קורות חיים מבוססת AI',
        'עדיפות לפיצ׳רים מתקדמים',
        'מתאים למשתמשים שמגישים להרבה משרות'
      ];
    }

    return [
      'עד 5 הגשות ביום',
      'גישה בסיסית למשרות ולמערכת ה־Swipe',
      'אפשרות לשדרג בכל שלב',
      'מתאים להתנסות ראשונית במערכת'
    ];
  }, [isPremium]);

  const loadSubscription = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getMySubscription();
      setSubscription(data);
    } catch (err) {
      console.error('Failed to load subscription:', err);
      setError('לא הצלחנו לטעון את פרטי המנוי. נסה שוב בעוד רגע.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  const handleUpgrade = async () => {
    setSaving(true);
    setError('');

    try {
      await checkoutSubscription();
      await loadSubscription();
    } catch (err) {
      console.error('Failed to upgrade subscription:', err);
      setError('השדרוג נכשל. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setSaving(true);
    setError('');

    try {
      await cancelSubscription();
      await loadSubscription();
    } catch (err) {
      console.error('Failed to cancel subscription:', err);
      setError('ביטול המנוי נכשל. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main style={styles.page} dir="rtl">
        <section style={styles.card}>
          <p style={styles.loadingText}>טוען את פרטי המנוי...</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page} dir="rtl">
      <section style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>המנוי שלי</p>
          <h1 style={styles.title}>
            {isPremium ? 'מסלול Premium פעיל' : 'מסלול Free פעיל'}
          </h1>
          <p style={styles.subtitle}>
            כאן אפשר לראות את מצב המנוי, מכסת ההגשות היומית, ולשדרג או לבטל מנוי.
          </p>
        </div>

        <div style={isPremium ? styles.planBadgePremium : styles.planBadgeFree}>
          {isPremium ? 'PREMIUM' : 'FREE'}
        </div>
      </section>

      {error && (
        <section style={styles.errorBox}>
          {error}
        </section>
      )}

      <section style={styles.grid}>
        <article style={styles.card}>
          <h2 style={styles.cardTitle}>שימוש יומי</h2>

          <div style={styles.usageRow}>
            <span style={styles.usageLabel}>הגשות שבוצעו היום</span>
            <strong style={styles.usageCounter}>
              {used} / {dailyLimit}
            </strong>
          </div>

          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${usagePercent}%`
              }}
            />
          </div>

          <p style={styles.helpText}>
            {resetAt
              ? `המכסה מתאפסת ב־${formatResetDate(resetAt)}`
              : 'המכסה מתאפסת אחת ליום.'}
          </p>
        </article>

        <article style={styles.card}>
          <h2 style={styles.cardTitle}>פעולות מנוי</h2>

          {isPremium ? (
            <>
              <p style={styles.helpText}>
                אתה נמצא כרגע במסלול Premium. ניתן לבטל ולחזור למסלול Free.
              </p>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={handleCancel}
                disabled={saving}
              >
                {saving ? 'מבטל...' : 'בטל מנוי'}
              </button>
            </>
          ) : (
            <>
              <p style={styles.helpText}>
                שדרוג ל־Premium יגדיל את מכסת ההגשות היומית ויפתח יכולות מתקדמות.
              </p>

              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleUpgrade}
                disabled={saving}
              >
                {saving ? 'משדרג...' : 'שדרג ל־Premium'}
              </button>
            </>
          )}
        </article>
      </section>

      <section style={styles.card}>
        <h2 style={styles.cardTitle}>
          {isPremium ? 'מה כלול ב־Premium?' : 'מה כלול במסלול Free?'}
        </h2>

        <ul style={styles.benefitsList}>
          {benefits.map((benefit) => (
            <li key={benefit} style={styles.benefitItem}>
              <span style={styles.checkIcon}>✓</span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function formatResetDate(value) {
  try {
    return new Date(value).toLocaleString('he-IL', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch {
    return value;
  }
}

const styles = {
  page: {
    minHeight: '100vh',
    padding: '40px 24px',
    background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 45%, #ffffff 100%)',
    color: '#111827',
    fontFamily: 'Arial, sans-serif'
  },
  hero: {
    maxWidth: '1050px',
    margin: '0 auto 24px',
    padding: '28px',
    borderRadius: '28px',
    background: '#ffffff',
    boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '24px'
  },
  eyebrow: {
    margin: '0 0 8px',
    color: '#4f46e5',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase'
  },
  title: {
    margin: 0,
    fontSize: '34px',
    lineHeight: 1.2
  },
  subtitle: {
    margin: '12px 0 0',
    maxWidth: '650px',
    color: '#6b7280',
    fontSize: '16px',
    lineHeight: 1.7
  },
  planBadgeFree: {
    padding: '12px 18px',
    borderRadius: '999px',
    background: '#e0f2fe',
    color: '#0369a1',
    fontWeight: 800,
    letterSpacing: '0.08em'
  },
  planBadgePremium: {
    padding: '12px 18px',
    borderRadius: '999px',
    background: '#ede9fe',
    color: '#5b21b6',
    fontWeight: 800,
    letterSpacing: '0.08em'
  },
  grid: {
    maxWidth: '1050px',
    margin: '0 auto 24px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px'
  },
  card: {
    maxWidth: '1050px',
    margin: '0 auto 24px',
    padding: '26px',
    borderRadius: '24px',
    background: '#ffffff',
    boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)'
  },
  cardTitle: {
    margin: '0 0 18px',
    fontSize: '22px'
  },
  usageRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '12px'
  },
  usageLabel: {
    color: '#6b7280'
  },
  usageCounter: {
    fontSize: '24px',
    color: '#111827'
  },
  progressTrack: {
    width: '100%',
    height: '12px',
    borderRadius: '999px',
    background: '#e5e7eb',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: '999px',
    background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
    transition: 'width 0.25s ease'
  },
  helpText: {
    margin: '14px 0 0',
    color: '#6b7280',
    lineHeight: 1.7
  },
  primaryButton: {
    width: '100%',
    marginTop: '20px',
    padding: '14px 18px',
    border: 'none',
    borderRadius: '16px',
    background: '#4f46e5',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer'
  },
  secondaryButton: {
    width: '100%',
    marginTop: '20px',
    padding: '14px 18px',
    border: '1px solid #fecaca',
    borderRadius: '16px',
    background: '#fff1f2',
    color: '#be123c',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer'
  },
  benefitsList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'grid',
    gap: '12px'
  },
  benefitItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#374151',
    fontSize: '16px'
  },
  checkIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '999px',
    background: '#dcfce7',
    color: '#15803d',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800
  },
  errorBox: {
    maxWidth: '1050px',
    margin: '0 auto 24px',
    padding: '16px 20px',
    borderRadius: '16px',
    background: '#fef2f2',
    color: '#b91c1c',
    border: '1px solid #fecaca'
  },
  loadingText: {
    margin: 0,
    color: '#6b7280'
  }
};

export default SubscriptionPage;