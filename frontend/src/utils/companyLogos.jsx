// src/utils/companyLogos.js
import React, { useState } from 'react';
const S3_BUCKET = 'joboss-company-logos-171109860478';
const S3_BASE_URL = `https://${S3_BUCKET}.s3.amazonaws.com`;

// מיפוי ידני לחברות ישראליות מובילות (להוסיף לפי הצורך)
const MANUAL_MAPPING = {
  'google': 'google.png',
  'microsoft': 'microsoft.png',
  'apple': 'apple.png',
  'amazon': 'amazon.png',
  'meta': 'meta.png',
  'facebook': 'meta.png',
  'wix': 'wix.png',
  'monday.com': 'monday.png',
  'ironSource': 'ironsource.png',
  'checkmarx': 'checkmarx.png',
  'playtika': 'playtika.png',
  'nvidia': 'nvidia.png',
  'intel': 'intel.png',
  'paypal': 'paypal.png',
  'oracle': 'oracle.png',
  'sap': 'sap.png',
  'redis': 'redis.png',
  'mobileye': 'mobileye.png',
  'fiverr': 'fiverr.png',
  'taboola': 'taboola.png',
  'outbrain': 'outbrain.png',
  'sisense': 'sisense.png',
  'gett': 'gett.png',
  'rapyd': 'rapyd.png',
};

/**
 * מחזיר URL של לוגו חברה עם fallback chain חכם
 * @param {string} company - שם החברה
 * @param {string} website - אתר החברה (אופציונלי)
 * @returns {object} { primary, fallbacks }
 */
export const getCompanyLogoUrls = (company, website = null) => {
  if (!company) {
    return {
      primary: null,
      fallbacks: []
    };
  }

  const normalizedCompany = company.toLowerCase().trim().replace(/\s+/g, '-');
  const companySlug = company.toLowerCase().replace(/\s+/g, '');

  const urls = [];

  // 1. logo.dev — אמין, מחזיר 404 אמיתי כשלא מוצא
  urls.push(`https://img.logo.dev/${companySlug}.com?token=pk_X-FzHLV7QemKeyVvoXFHAQ`);

  // 2. Clearbit — fallback (לפעמים לא זמין אחרי הרכישה ע"י HubSpot)
  urls.push(`https://logo.clearbit.com/${companySlug}.com`);

  // Google Favicon מוסר בכוונה: מחזיר גלובוס גנרי (לא 404) לדומיינים לא מוכרים,
  // כך שה-onError לא מופעל ונתקעים על הגלובוס במקום האות הראשונה.

  return {
    primary: urls[0],
    fallbacks: urls.slice(1)
  };
};

/**
 * React component לטעינת לוגו עם fallback אוטומטי
 */
export const CompanyLogo = ({ company, website, style = {}, alt = '' }) => {
  const allUrls = React.useMemo(() => {
    const { primary, fallbacks } = getCompanyLogoUrls(company, website);
    return primary ? [primary, ...fallbacks] : fallbacks;
  }, [company, website]);

  const [idx, setIdx] = useState(0);

  const handleError = () => setIdx(i => i + 1);

  const currentUrl = allUrls[idx] ?? null;

  if (!currentUrl) {
    // Placeholder - אות ראשונה של החברה
    return (
      <div style={{
        ...style,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #6C4FD4, #1E2A4A)',
        color: 'white',
        fontWeight: 700,
        fontSize: style.width ? `${parseInt(style.width) * 0.4}px` : '20px',
        borderRadius: style.borderRadius || '12px'
      }}>
        {company?.charAt(0).toUpperCase() || '?'}
      </div>
    );
  }

  return (
    <img
      src={currentUrl}
      alt={alt || company}
      style={style}
      onError={handleError}
    />
  );
};

export default { getCompanyLogoUrls, CompanyLogo };
