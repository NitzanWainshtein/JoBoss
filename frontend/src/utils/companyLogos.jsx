// src/utils/companyLogos.jsx
import React, { useState } from 'react';

/**
 * מחזיר שרשרת מקורות לטעינת לוגו חברה.
 *
 * רקע: logo.dev (ה-token פג — 401) ו-Clearbit (נסגר אחרי רכישת HubSpot) ירדו.
 * נשארו שני מקורות חינמיים בלי key:
 *   1. Google gstatic faviconV2 — איכותי ומהיר, אבל לדומיין בלי favicon מחזיר
 *      404 *עם גלובוס 16x16 בגוף התשובה*. דפדפנים מרנדרים גוף תקין גם ב-404
 *      (onLoad נורה, לא onError!) — לכן חייבים לבדוק naturalWidth.
 *   2. DuckDuckGo icons — עוקב אחרי redirects בצד שרת (johnsonjohnson.com →
 *      jnj.com → הלוגו האמיתי!), אבל לדומיין מת מחזיר placeholder 48x48.
 *
 * לכן כל מקור נושא minSize: תמונה שנטענה קטנה מהסף = אייקון גנרי → מדלגים
 * למקור הבא, ובסוף נופלים לאות הראשונה של החברה.
 *
 * @param {string} company - שם החברה
 * @param {string} website - אתר החברה (אופציונלי, גובר על ניחוש הדומיין)
 * @returns {Array<{src: string, minSize: number}>}
 */
export const getCompanyLogoSources = (company, website = null) => {
  if (!company) return [];

  // ניחוש דומיינים: website אם יש; אחרת השם המלא כ-slug ("Johnson&Johnson" →
  // johnsonjohnson.com) וגם המילה הראשונה ("Johnson" → johnson.com), אחרי
  // ניקוי סיומות תאגידיות שמקלקלות את הניחוש (Ltd, Inc, Technologies...).
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

  const unique = [...new Set(domains)];
  if (unique.length === 0) return [];

  return [
    // gstatic — הגלובוס הגנרי שלו הוא 16px, לוגו אמיתי גדול יותר.
    ...unique.map(d => ({
      src: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${d}&size=128`,
      minSize: 17,
    })),
    // DDG — ה-placeholder שלו הוא 48px; לוגו אמיתי שנקבל ממנו הוא 64+ לרוב.
    ...unique.map(d => ({
      src: `https://icons.duckduckgo.com/ip3/${d}.ico`,
      minSize: 49,
    })),
  ];
};

// תאימות לאחור למי שמייבא את ה-API הישן.
export const getCompanyLogoUrls = (company, website = null) => {
  const sources = getCompanyLogoSources(company, website);
  const urls = sources.map(s => s.src);
  return { primary: urls[0] || null, fallbacks: urls.slice(1) };
};

/**
 * React component לטעינת לוגו עם fallback אוטומטי.
 * עובר בין המקורות ב-onError וגם ב-onLoad כשהתמונה קטנה מדי (= אייקון גנרי),
 * ובסוף מציג placeholder עם האות הראשונה של החברה.
 */
export const CompanyLogo = ({ company, website, style = {}, alt = '' }) => {
  const sources = React.useMemo(
    () => getCompanyLogoSources(company, website),
    [company, website]
  );

  const [idx, setIdx] = useState(0);

  // איפוס למקור הראשון (המהיר) כשהחברה משתנה — דפוס "התאמת state בזמן render"
  // המומלץ ב-React, במקום useEffect (שגם מפעיל render נוסף מיותר).
  const [prevKey, setPrevKey] = useState(company);
  if (company !== prevKey) {
    setPrevKey(company);
    setIdx(0);
  }

  const current = sources[idx] ?? null;

  if (!current) {
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
      key={current.src}
      src={current.src}
      alt={alt || company}
      style={style}
      onError={() => setIdx(i => i + 1)}
      onLoad={(e) => {
        // תמונה קטנה מהסף של המקור = האייקון הגנרי שלו (גלובוס/placeholder),
        // לא לוגו אמיתי — מדלגים למקור הבא (ובסוף לאות הראשונה).
        if (e.target.naturalWidth < current.minSize) setIdx(i => i + 1);
      }}
    />
  );
};

export default { getCompanyLogoUrls, getCompanyLogoSources, CompanyLogo };
