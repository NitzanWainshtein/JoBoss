// JoBoss legal pages: Terms of Use, Privacy Policy, Accessibility Statement.
//
// ⚠️  THESE ARE DRAFTS, NOT LEGAL ADVICE. They were written to give a lawyer a
//     concrete starting point that already reflects what the product actually
//     does — stores CVs, processes them with AI, submits applications to third
//     parties on the user's behalf, and bills a recurring subscription.
//     Every BRACKETED field must be filled in, and the whole text must be
//     reviewed by an Israeli lawyer before it is relied on.
//
// Israeli context these were drafted against:
//   • חוק הגנת הפרטיות + תיקון 13 (in force Aug 2025) and תקנות אבטחת מידע 2017
//   • חוק הגנת הצרכן — עסקה מתמשכת (trial → auto-renewal disclosure, cancellation)
//   • תקנות נגישות השירות → ת"י 5568 (≈ WCAG 2.0 AA)

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useTranslation from '../i18n/useTranslation';

const COMPANY = {
  name: 'joBoss Ltd.',
  id: '###',
  address: '###',
  email: 'joboss.appteam@gmail.com',
  a11yContact: 'רונן צרשניה',
};

const DOCS = {
  terms: {
    he: {
      title: 'תנאי שימוש',
      updated: 'עודכן לאחרונה: 11/08/2026',
      sections: [
        ['כללי', `השימוש בשירות JoBoss ("השירות"), המופעל על ידי ${COMPANY.name} (ח.פ. ${COMPANY.id}), כפוף לתנאים אלה. השימוש בשירות מהווה הסכמה מלאה להם. אם אינך מסכים — אין לעשות שימוש בשירות.`],
        ['מהות השירות', 'השירות מציג משרות ממקורות שונים, מאפשר סימון משרות, ומתאים קורות חיים באמצעות בינה מלאכותית. השירות אינו סוכנות השמה ואינו מתחייב למציאת עבודה, לזימון לראיון או לכל תוצאה תעסוקתית אחרת.'],
        ['הגשה אוטומטית בשמך', 'ככל שתפעיל את התכונה, אתה מסמיך אותנו במפורש להגיש מועמדות בשמך למשרות שסימנת, ולהעביר לצורך כך את קורות החיים ופרטיך למעסיקים ולצדדים שלישיים המפעילים את הליכי הגיוס. ההסמכה ניתנת לביטול בכל עת מתוך הגדרות החשבון. אינך רשאי להשתמש בתכונה זו כדי להגיש מידע כוזב או מטעה.'],
        ['התאמת קורות חיים ב-AI', 'התאמת קורות החיים נעשית באמצעים אוטומטיים ועלולה להכיל שגיאות. האחריות לבדוק את התוכן לפני שליחתו ולוודא את נכונותו מוטלת עליך בלבד. אין להשתמש בשירות כדי ליצור מצגי שווא לגבי השכלה, ניסיון או כישורים.'],
        ['תוכן המשרות', 'פרטי המשרות מגיעים ממקורות חיצוניים ומוצגים כפי שהם. איננו אחראים לדיוקם, לעדכניותם, לזמינות המשרה או להתנהלות המעסיק. ייתכנו משרות שפרטיהן חסרים או שאינן פעילות עוד.'],
        ['חשבון ואבטחה', 'אתה אחראי לשמירת סודיות פרטי הגישה לחשבונך ולכל פעולה שתבוצע בו. יש להודיע לנו מיידית על חשד לשימוש לא מורשה.'],
        ['מנוי ותשלום', 'חלק מהתכונות ניתנות במסלול בתשלום. תנאי החיוב, תקופת הניסיון והחידוש האוטומטי מפורטים במסך המנוי ומוצגים לפני ביצוע העסקה. ניתן לבטל את המנוי בכל עת מתוך האפליקציה; הביטול ייכנס לתוקף בתום תקופת החיוב הנוכחית, בכפוף לדין.'],
        ['קניין רוחני', 'כל הזכויות בשירות, לרבות עיצוב, קוד ולוגו, שמורות לנו. אין להעתיק, לשכפל, לבצע הנדסה לאחור או לעשות שימוש מסחרי בשירות ללא אישור בכתב.'],
        ['שימוש אסור', 'אין לעשות שימוש בשירות באופן אוטומטי, לרבות סקרייפינג או גישה ממוכנת, אין לנסות לעקוף מגבלות מכסה, ואין להשתמש בשירות לכל מטרה בלתי חוקית.'],
        ['הגבלת אחריות', 'השירות ניתן כמות שהוא ("AS IS"). בכפוף לדין, לא נהיה אחראים לנזק עקיף, תוצאתי או אובדן הזדמנות תעסוקתית. אחריותנו הכוללת לא תעלה על הסכום ששילמת בפועל בשלושת החודשים שקדמו לאירוע.'],
        ['שינוי התנאים', 'אנו רשאים לעדכן תנאים אלה. שינוי מהותי יובא לידיעתך באמצעות השירות או בדוא"ל, ויכנס לתוקף במועד שיצוין.'],
        ['דין וסמכות שיפוט', 'על תנאים אלה יחולו דיני מדינת ישראל, וסמכות השיפוט הבלעדית תהיה נתונה לבתי המשפט המוסמכים ב[מחוז].'],
        ['יצירת קשר', `לשאלות: ${COMPANY.email}`],
      ],
    },
    en: {
      title: 'Terms of Use',
      updated: 'Last updated: 11/08/2026',
      sections: [
        ['General', `Use of the JoBoss service (the "Service"), operated by ${COMPANY.name}, is subject to these terms. Using the Service constitutes full acceptance of them. If you do not agree, do not use the Service.`],
        ['What the Service is', 'The Service surfaces job listings from various sources, lets you mark jobs, and tailors your CV using artificial intelligence. It is not a recruitment agency and makes no promise of employment, an interview, or any other outcome.'],
        ['Applying on your behalf', 'If you enable the feature, you expressly authorise us to submit applications on your behalf to jobs you have marked, and to transmit your CV and details to employers and to third parties operating their hiring processes. You may withdraw this authorisation at any time from your account settings. You may not use this feature to submit false or misleading information.'],
        ['AI CV tailoring', 'CV tailoring is performed automatically and may contain errors. You are solely responsible for reviewing the content before it is sent and for its accuracy. The Service must not be used to misrepresent your education, experience, or qualifications.'],
        ['Job content', 'Job details come from external sources and are presented as-is. We are not responsible for their accuracy, currency, availability, or for employer conduct. Some listings may be incomplete or no longer open.'],
        ['Account and security', 'You are responsible for keeping your credentials confidential and for all activity under your account. Notify us immediately of any suspected unauthorised use.'],
        ['Subscription and billing', 'Some features require a paid plan. Billing terms, the trial period, and automatic renewal are set out on the subscription screen and shown before the transaction. You may cancel at any time from within the app; cancellation takes effect at the end of the current billing period, subject to law.'],
        ['Intellectual property', 'All rights in the Service, including design, code, and logo, are reserved. You may not copy, reproduce, reverse engineer, or make commercial use of the Service without written permission.'],
        ['Prohibited use', 'You may not access the Service by automated means, including scraping, attempt to circumvent quota limits, or use it for any unlawful purpose.'],
        ['Limitation of liability', 'The Service is provided "AS IS". Subject to law, we are not liable for indirect or consequential damage or lost employment opportunity. Our total liability shall not exceed the amount you actually paid in the three months preceding the event.'],
        ['Changes', 'We may update these terms. Material changes will be notified through the Service or by email and take effect on the date stated.'],
        ['Governing law', 'These terms are governed by the laws of the State of Israel, with exclusive jurisdiction in the competent courts of [district].'],
        ['Contact', `Questions: ${COMPANY.email}`],
      ],
    },
  },

  privacy: {
    he: {
      title: 'מדיניות פרטיות',
      updated: 'עודכן לאחרונה: 11/08/2026',
      sections: [
        ['מי אנחנו', `${COMPANY.name} (ח.פ. ${COMPANY.id}), ${COMPANY.address}. לפניות בנושא פרטיות: ${COMPANY.email}`],
        ['איזה מידע אנו אוספים', 'פרטי חשבון (שם, כתובת דוא"ל, תמונת פרופיל); פרטי קשר ופרופיל תעסוקתי (טלפון, עיר, חברה נוכחית, רמת ניסיון, זמינות, תפקידים מועדפים, מגדר — ככל שנמסר); קורות חיים שהעלית ותוכנם; מיקום מועדף ורדיוס חיפוש; היסטוריית סימון משרות והגשות; ונתוני שימוש טכניים.'],
        ['קורות חיים', 'קורות החיים שאתה מעלה מכילים מידע אישי רחב. אנו שומרים אותם לצורך הפעלת השירות, מעבדים אותם באמצעים אוטומטיים לצורך התאמה למשרות, ומעבירים אותם למעסיקים אך ורק בהתאם לפעולה שביצעת או להסמכה שנתת.'],
        ['לשם מה אנו משתמשים במידע', 'אספקת השירות והתאמת משרות; התאמת קורות חיים; הגשת מועמדות בשמך ככל שהפעלת זאת; ניהול מנוי וחיוב; אבטחת מידע ומניעת שימוש לרעה; ושיפור השירות.'],
        ['בסיס חוקי והסכמה', 'המידע נמסר מרצונך ובהסכמתך. אינך חייב למסור מידע על פי דין, אך בלעדיו לא נוכל לספק את השירות או חלקים ממנו. הסכמתך ניתנת לביטול בכל עת, בכפוף להשלכות על השימוש בשירות.'],
        ['העברה לצדדים שלישיים', 'המידע מועבר למעסיקים ולפלטפורמות גיוס בעת הגשת מועמדות; לספקי תשתית ענן (Amazon Web Services); לספק סליקה (Stripe) לצורך תשלומים; ולשירותי בינה מלאכותית לצורך התאמת קורות חיים. איננו מוכרים מידע אישי.'],
        ['העברה מחוץ לישראל', 'חלק מהשירותים מאוחסנים או מעובדים מחוץ לישראל, לרבות בארצות הברית. בעצם השימוש בשירות אתה מסכים להעברה כאמור.'],
        ['תקופת שמירה', 'המידע נשמר כל עוד חשבונך פעיל, ולאחר סגירתו לתקופה נוספת ככל שנדרש לצרכים חוקיים, חשבונאיים או להגנה מפני תביעות.'],
        ['זכויותיך', 'על פי חוק הגנת הפרטיות, אתה זכאי לעיין במידע שנאסף עליך, לבקש את תיקונו אם אינו נכון, מלא או מעודכן, ולבקש את מחיקתו. לפנייה: ' + COMPANY.email],
        ['אבטחת מידע', 'אנו נוקטים אמצעי אבטחה מקובלים לרבות הצפנה בהעברה, בקרת גישה מבוססת הרשאות והפרדת סביבות. עם זאת, אין מערכת חסינה לחלוטין, ואיננו יכולים להבטיח אבטחה מוחלטת.'],
        ['עוגיות ואחסון מקומי', 'אנו עושים שימוש באחסון מקומי בדפדפן לצורך שמירת מצב ההתחברות והעדפות (כגון שפת הממשק). ניתן למחוק אותם דרך הגדרות הדפדפן, אך הדבר עשוי לפגוע בתפקוד השירות.'],
        ['קטינים', 'השירות מיועד לבני 18 ומעלה. איננו אוספים ביודעין מידע על קטינים.'],
        ['שינויים', 'נעדכן מדיניות זו מעת לעת. שינוי מהותי יובא לידיעתך.'],
      ],
    },
    en: {
      title: 'Privacy Policy',
      updated: 'Last updated: 11/08/2026',
      sections: [
        ['Who we are', `${COMPANY.name}, ${COMPANY.address}. Privacy enquiries: ${COMPANY.email}`],
        ['What we collect', 'Account details (name, email, profile photo); contact and professional profile (phone, city, current employer, experience level, availability, preferred roles, gender — where provided); CVs you upload and their contents; preferred location and search radius; your job-marking and application history; and technical usage data.'],
        ['Your CV', 'A CV contains extensive personal information. We store it to operate the Service, process it by automated means to tailor it to jobs, and transmit it to employers only in accordance with an action you took or an authorisation you gave.'],
        ['How we use it', 'Providing the Service and matching jobs; tailoring CVs; submitting applications on your behalf where enabled; subscription and billing; security and abuse prevention; and improving the Service.'],
        ['Legal basis and consent', 'You provide this information voluntarily and with your consent. You are under no legal obligation to provide it, but without it we cannot provide the Service or parts of it. Consent may be withdrawn at any time, subject to the effect on your use of the Service.'],
        ['Third parties', 'Information is transmitted to employers and recruitment platforms when an application is submitted; to cloud infrastructure providers (Amazon Web Services); to our payment processor (Stripe); and to AI services for CV tailoring. We do not sell personal information.'],
        ['Transfers outside Israel', 'Some services store or process data outside Israel, including in the United States. By using the Service you consent to such transfers.'],
        ['Retention', 'We retain information while your account is active, and afterwards for as long as required for legal, accounting, or claim-defence purposes.'],
        ['Your rights', 'Under the Israeli Privacy Protection Law you have the right to review the information held about you, to request its correction if it is inaccurate, incomplete, or out of date, and to request its deletion. Contact: ' + COMPANY.email],
        ['Security', 'We apply accepted security measures including encryption in transit, permission-based access control, and environment separation. No system is entirely immune, and absolute security cannot be guaranteed.'],
        ['Cookies and local storage', 'We use browser local storage to keep you signed in and to remember preferences such as interface language. You may clear these via your browser settings, which may impair the Service.'],
        ['Minors', 'The Service is intended for users aged 18 and over. We do not knowingly collect information about minors.'],
        ['Changes', 'We may update this policy. Material changes will be notified to you.'],
      ],
    },
  },

  accessibility: {
    he: {
      title: 'הצהרת נגישות',
      updated: 'עודכן לאחרונה: 11/08/2026',
      sections: [
        ['המחויבות שלנו', `${COMPANY.name} רואה חשיבות במתן שירות נגיש לכלל המשתמשים, לרבות אנשים עם מוגבלות, ופועלת להנגיש את השירות בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח-1998, ולתקנות שהותקנו מכוחו.`],
        ['רמת הנגישות', 'אנו פועלים להתאמת השירות לתקן הישראלי ת"י 5568 ברמה AA, המבוסס על הנחיות WCAG 2.0. תהליך ההנגשה מתבצע באופן מתמשך.'],
        ['מה הונגש עד כה', 'ניווט מקלדת בפקדים אינטראקטיביים; סימון מצב לפקדי הפעלה/כיבוי באמצעות תפקידי ARIA; סגירת חלונות באמצעות מקש Escape; תוויות טקסטואליות לרכיבים גרפיים; ותיקון יחסי ניגודיות בטקסט.'],
        ['מגבלות ידועות', 'מסך סימון המשרות מבוסס על מחוות גרירה, ואנו פועלים להוסיף לו חלופה מלאה מבוססת מקלדת. ייתכנו רכיבים נוספים שטרם הונגשו במלואם. אנו נשמח לקבל דיווח על כל תקלת נגישות.'],
        ['פניות בנושא נגישות', `רכז הנגישות: ${COMPANY.a11yContact}. דוא"ל: ${COMPANY.email}. נשתדל לטפל בכל פנייה בהקדם.`],
      ],
    },
    en: {
      title: 'Accessibility Statement',
      updated: 'Last updated: 11/08/2026',
      sections: [
        ['Our commitment', `${COMPANY.name} is committed to providing an accessible service to all users, including people with disabilities, in accordance with the Israeli Equal Rights for Persons with Disabilities Law, 1998, and its regulations.`],
        ['Conformance level', 'We work to conform to Israeli Standard IS 5568 at Level AA, which is based on WCAG 2.0. Accessibility work is ongoing.'],
        ['What has been done', 'Keyboard navigation for interactive controls; state exposure for toggles via ARIA roles; dismissal of dialogs with the Escape key; text labels for graphical elements; and corrected text contrast ratios.'],
        ['Known limitations', 'The job-marking screen is gesture-based and a full keyboard alternative is in progress. Other components may not yet be fully accessible. We welcome reports of any accessibility issue.'],
        ['Accessibility contact', `Accessibility coordinator: ${COMPANY.a11yContact}. Email: ${COMPANY.email}. We aim to respond to every enquiry promptly.`],
      ],
    },
  },
};

export default function LegalPage() {
  const { language, t } = useTranslation();
  const navigate = useNavigate();
  const { doc } = useParams();
  const [active, setActive] = useState(doc && DOCS[doc] ? doc : 'terms');

  const lang = language === 'en' ? 'en' : 'he';
  const content = DOCS[active][lang];

  const tabs = [
    ['terms', DOCS.terms[lang].title],
    ['privacy', DOCS.privacy[lang].title],
    ['accessibility', DOCS.accessibility[lang].title],
  ];

  return (
    <div style={S.page}>
      <div style={S.head}>
        <button type="button" style={S.back} aria-label={t('settings.back')} onClick={() => navigate(-1)}>
          {lang === 'en' ? '←' : '→'}
        </button>
        <h1 style={S.title}>{content.title}</h1>
        <span style={{ width: 34, flexShrink: 0 }} />
      </div>

      <div style={S.tabs} role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            style={{ ...S.tab, ...(active === key ? S.tabActive : {}) }}
            onClick={() => setActive(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <p style={S.updated}>{content.updated}</p>

      <div style={S.card}>
        {content.sections.map(([heading, body], i) => (
          <section key={i} style={S.section}>
            <h2 style={S.h2}>{heading}</h2>
            <p style={S.body}>{body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

const S = {
  page: { maxWidth: '760px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  head: { display: 'flex', alignItems: 'center', gap: '10px' },
  back: {
    width: 34, height: 34, borderRadius: '50%', border: '1px solid #E9E4FB',
    background: 'rgba(255,255,255,0.9)', cursor: 'pointer', fontSize: 18, color: '#5A5478', flexShrink: 0,
  },
  title: { flex: 1, textAlign: 'center', fontSize: '18px', fontWeight: 900, color: '#1E2A4A', margin: 0 },
  tabs: {
    display: 'flex', gap: '5px', padding: '5px', borderRadius: '16px',
    background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(255,255,255,0.9)',
    boxShadow: '0 6px 20px rgba(108,79,212,0.08)',
  },
  tab: {
    flex: 1, padding: '9px 6px', borderRadius: '12px', border: 'none', background: 'transparent',
    cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, color: '#6B5E9E',
  },
  tabActive: { background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', color: 'white' },
  updated: { fontSize: '12px', color: '#6B5E9E', margin: 0, fontWeight: 600 },
  card: {
    background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.9)',
    borderRadius: '20px', padding: '20px', boxShadow: '0 6px 20px rgba(108,79,212,0.08)',
    display: 'flex', flexDirection: 'column', gap: '18px',
  },
  section: { display: 'flex', flexDirection: 'column', gap: '6px' },
  h2: { fontSize: '15px', fontWeight: 800, color: '#1E2A4A', margin: 0 },
  body: { fontSize: '14px', lineHeight: 1.75, color: '#3F3A52', margin: 0 },
};
