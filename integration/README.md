# שילוב העיצוב החדש ל-JoBoss/frontend

## שלב 1 — טוקנים גלובליים (עדיפות ראשונה, סיכון נמוך)
1. פתח את `JoBoss/frontend/src/styles/global.css`
2. החלף את התוכן בקובץ `integration/global.css` שהכנתי כאן (הוא מכיל את אותם משתני `--primary` וכו', עם ערכים מעודכנים + כמה קלאסים משותפים חדשים: `.jb-glass-card`, `.jb-hero-card`, `.jb-btn-primary`, `.jb-btn-ghost`, `.jb-chip`, `.jb-pill-toggle`)
3. הרוב הקיים בקוד שלך משתמש כבר ב-`var(--primary)` וכו' — אז שינוי הקובץ הזה לבד כבר ישנה את הצבעים והצללים בכל האפליקציה בלי לגעת בשום JSX.

זה הכי בטוח לעשות ראשון ולבדוק שהאפליקציה עדיין רצה תקין (`npm run dev`).

## שלב 2 — עמוד אחד בכל פעם
## שלב 3 — Navbar (מוכן!)
`integration/Navbar.jsx` מוכן — תעתיק אותו במקום `JoBoss/frontend/src/components/Navbar.jsx`. שיניתי רק עיצוב (header/nav צפים בסגנון זכוכית, גרדיאנט על התג הפעיל, טבעת גרדיאנט לאווטאר) — כל הלוגיקה (טעינת פרופיל, אפלוד תמונה, dropdown, ניווט) נשארה בדיוק כמו שהייתה.

## שלב 4 — מוכן להעתקה עכשיו
- `integration/LoginPage.jsx` → `src/pages/LoginPage.jsx`
- `integration/DashboardPage.jsx` → `src/pages/DashboardPage.jsx`
- `integration/SubscriptionPage.jsx` → `src/pages/SubscriptionPage.jsx`
- `integration/OnboardingPage.jsx` → `src/pages/OnboardingPage.jsx`

בכל הקבצים האלה שיניתי רק צבעים/גרדיאנטים/רדיוסים/צללים לפי העיצוב החדש — שום שינוי בלוגיקה, ב-state או בקריאות ה-API.

## שלב 5 — 3 העמודים הגדולים (SwipePage, ApplicationsPage, ProfilePage)
אלה קבצים ענקיים (1000+ שורות כל אחד) עם לוגיקת פרודקשן מסובכת — dragging, polling, sessionStorage, Stripe וכו'. לשכפל אותם ידנית עם סיכון לשגיאה זה מסוכן מדי בלי יכולת להריץ ולבדוק בפועל.

**הפתרון**: הכנתי `integration/CLAUDE_CODE_PROMPT.md` — פרומפט מוכן להעתקה לתוך Claude Code (שיש לו גישה אמיתית לקבצים ויכול להריץ ולבדוק). הוא מסביר בדיוק אילו צבעים להחליף באילו, ואיך לעדכן כרטיסים/כפתורים/מודלים לסגנון החדש — בלי לגעת בלוגיקה.

## סדר פעולות מומלץ
1. העתק את 6 הקבצים המוכנים (למעלה) + `global.css`
2. הרץ `npm run dev` ווודא שהכל עובד
3. פתח את Claude Code בתיקיית `JoBoss/frontend`, הדבק את התוכן של `integration/CLAUDE_CODE_PROMPT.md`, ותן לו להשלים את 3 העמודים הגדולים
