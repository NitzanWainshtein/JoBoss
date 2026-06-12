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

  // ניחוש דומיינים: אם יש website משתמשים בו; אחרת מנסים כמה וריאציות —
  // השם המלא כ-slug ("Johnson&Johnson" → johnsonjohnson.com) וגם המילה
  // הראשונה בלבד ("Johnson" → johnson.com). כל מועמד הוא URL נוסף בשרשרת
  // ה-fallback, כך שאם הראשון מחזיר גלובוס/404 ננסה את הבא.
  const domains = [];
  if (website) {
    const d = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
    if (d) domains.push(d);
  }
  const name = company.toLowerCase()
    .replace(/\b(ltd|inc|llc|corp|corporation|technologies|technology|software|group|israel)\b/g, '')
    .trim();
  const fullSlug  = name.replace(/[^a-z0-9]/g, '');
  const firstWord = (name.split(/[\s&,.-]+/)[0] || '').replace(/[^a-z0-9]/g, '');
  if (fullSlug) domains.push(`${fullSlug}.com`);
  if (firstWord && firstWord !== fullSlug) domains.push(`${firstWord}.com`);

  if (domains.length === 0) return { primary: null, fallbacks: [] };

  // gstatic עם URL — עוקב אחרי redirects (למשל johnsonjohnson.com → jnj.com).
  // הערה: לדומיין בלי favicon הוא לפעמים מחזיר 200 עם גלובוס גנרי 16x16 במקום
  // 404 — לכן ה-component בודק גם naturalWidth ב-onLoad ולא סומך רק על onError.
  const urls = [...new Set(domains)].map(d =>
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${d}&size=128`
  );

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
      onLoad={(e) => {
        // gstatic מחזיר גלובוס גנרי בגודל 16x16 (HTTP 200) כשאין favicon אמיתי,
        // למרות שביקשנו size=128. לוגו אמיתי חוזר 32px ומעלה — אז תמונה קטנטנה
        // היא הגלובוס, ומדלגים למקור הבא (ובסוף לאות הראשונה).
        if (e.target.naturalWidth <= 16) setIdx(i => i + 1);
      }}
    />
  );
};

export default { getCompanyLogoUrls, CompanyLogo };
