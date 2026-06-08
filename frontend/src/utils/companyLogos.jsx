// src/utils/companyLogos.jsx
import React, { useState } from 'react';

/**
 * מחזיר שרשרת URLs לטעינת לוגו חברה.
 *
 * רקע: בעבר השתמשנו ב-logo.dev (שה-token שלו פג ומחזיר 401 לכל בקשה) וב-Clearbit
 * (שהשירות החינמי שלו נסגר אחרי הרכישה ע"י HubSpot ומחזיר connection error). לכן
 * כל הלוגואים "נשברו". גם Google s2/favicons הישן בעייתי כי הוא מחזיר גלובוס גנרי
 * (HTTP 200) לחברה לא מוכרת, מה שמונע fallback לאות הראשונה.
 *
 * שני המקורות כאן שניהם: (א) מחזירים לוגו אמיתי באיכות טובה, (ב) מחזירים 404 אמיתי
 * כשאין לוגו — כך ש-onError של ה-<img> נורה ואפשר ליפול ל-fallback הבא ובסוף לאות.
 *
 * @param {string} company - שם החברה
 * @param {string} website - אתר החברה (אופציונלי, גובר על ניחוש הדומיין)
 * @returns {{ primary: string|null, fallbacks: string[] }}
 */
export const getCompanyLogoUrls = (company, website = null) => {
  if (!company) {
    return { primary: null, fallbacks: [] };
  }

  // ניחוש דומיין: אם יש website משתמשים בו, אחרת company-slug + .com.
  // מסירים כל תו שאינו אות/ספרה כדי ש-"Johnson&Johnson" → "johnsonjohnson"
  // ו-"monday.com" → "mondaycom" לא ישברו את ה-URL.
  let domain = '';
  if (website) {
    domain = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  }
  if (!domain) {
    const companySlug = company.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!companySlug) return { primary: null, fallbacks: [] };
    domain = `${companySlug}.com`;
  }

  const urls = [
    // 1. DuckDuckGo — אייקונים ברזולוציה גבוהה, מהיר ומוכמן ב-CDN, ומחזיר 404 אמיתי.
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,

    // 2. Google faviconV2 — מכסה חברות ש-DDG מפספס. עם fallback_opts הוא מחזיר 404
    //    אמיתי כשאין favicon (במקום הגלובוס הגנרי של ה-endpoint הישן s2/favicons).
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`,
  ];

  return { primary: urls[0], fallbacks: urls.slice(1) };
};

/**
 * React component לטעינת לוגו עם fallback אוטומטי.
 * עובר בין המקורות ב-onError, ובסוף מציג placeholder עם האות הראשונה של החברה.
 */
export const CompanyLogo = ({ company, website, style = {}, alt = '' }) => {
  const allUrls = React.useMemo(() => {
    const { primary, fallbacks } = getCompanyLogoUrls(company, website);
    return primary ? [primary, ...fallbacks] : fallbacks;
  }, [company, website]);

  const [idx, setIdx] = useState(0);

  // איפוס למקור הראשון (המהיר) כשהחברה משתנה — דפוס "התאמת state בזמן render"
  // המומלץ ב-React, במקום useEffect (שגם מפעיל render נוסף מיותר).
  const [prevKey, setPrevKey] = useState(company);
  if (company !== prevKey) {
    setPrevKey(company);
    setIdx(0);
  }

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
      key={currentUrl}
      src={currentUrl}
      alt={alt || company}
      style={style}
      onError={() => setIdx(i => i + 1)}
    />
  );
};

export default { getCompanyLogoUrls, CompanyLogo };
