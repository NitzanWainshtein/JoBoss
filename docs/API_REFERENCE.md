# JoBoss — תיעוד מערכת מלא למפתחים (API Reference)

> **קהל יעד:** מפתח/ת תוכנה המכיר/ה AWS ברמה בסיסית (Lambda, API Gateway, DynamoDB, S3, SQS, Cognito).
> **סגנון:** בהשראת תיעוד Boto3 — לכל מימשק: למה הוא משמש, איך קוראים לו, הפרמטרים, הפורמטים, ומבנה התשובה.
> **עדכון אחרון:** 2026-06-12

---

## תוכן עניינים

1. [ארכיטקטורה כללית](#ארכיטקטורה-כללית)
2. [אימות (Authentication)](#אימות-authentication)
3. [מוסכמות כלליות](#מוסכמות-כלליות)
4. [Users Service — פרופיל משתמש](#1-users-service)
5. [Jobs Service — משרות](#2-jobs-service)
6. [Swipes Service — החלקות](#3-swipes-service)
7. [Applications Service — הגשות](#4-applications-service)
8. [Subscriptions Service — מנויים](#5-subscriptions-service)
9. [AI Service — התאמת קו"ח](#6-ai-service)
10. [Uploads Service — העלאת קבצים](#7-uploads-service)
11. [Profile Image Service — תמונת פרופיל](#8-profile-image-service)
12. [Admin Service — ניהול](#9-admin-service)
13. [Auto-Apply Worker — הגשה אוטומטית](#10-auto-apply-worker)
14. [Jobs Importer — ייבוא משרות](#11-jobs-importer)
15. [Jobs Status Checker — ניקוי משרות](#12-jobs-status-checker)
16. [Job Description AI — נרמול תיאורי משרה](#13-job-description-ai)
17. [טבלאות DynamoDB](#טבלאות-dynamodb)
18. [קודי שגיאה כלליים](#קודי-שגיאה-כלליים)

---

## ארכיטקטורה כללית

המערכת בנויה ממיקרו-סרביסים (AWS Lambda, Python) מאחורי API Gateway (REST), עם אחסון ב-DynamoDB ו-S3:

```
Frontend (React, S3+CloudFront)
        │ HTTPS + JWT
        ▼
API Gateway (REST API)
        │
        ├── users ──────────► joboss-users
        ├── jobs ───────────► joboss-jobs
        ├── swipes ─────────► joboss-swipes / joboss-applications ──► SQS
        ├── applications ───► joboss-applications
        ├── subscriptions ──► joboss-subscriptions ◄──► Stripe
        ├── ai ─────────────► Bedrock (Claude Haiku) + S3 resumes
        ├── uploads ────────► S3 (joboss-resumes)
        ├── profile-image ──► S3 + joboss-users
        └── admin ──────────► Cognito + כל הטבלאות

SQS (joboss-auto-apply-queue) ──► auto-apply Lambda ──► ECS Fargate (דפדפן)
EventBridge (מתוזמן) ──► jobs_importer (Telegram) / jobs_status_checker
```

| רכיב | טכנולוגיה |
|---|---|
| Frontend | React + Vite, מתארח ב-S3 `joboss-frontend-171109860478` מאחורי CloudFront `E1E8CVAQ0HQE8E` |
| Auth | AWS Cognito User Pool (JWT) |
| Backend | AWS Lambda (Python 3.x) |
| DB | DynamoDB |
| קבצים | S3 (`joboss-resumes-171109860478`, `joboss-resumes`) |
| AI | AWS Bedrock — Claude Haiku (`us.anthropic.claude-haiku-4-5-20251001-v1:0`) |
| תשלומים | Stripe (Checkout + Webhooks) |
| הגשה אוטומטית | SQS → Lambda → ECS Fargate |

---

## אימות (Authentication)

כל הקריאות (למעט `GET /jobs` ו-Webhook של Stripe) דורשות JWT של Cognito ב-Header:

```
Authorization: Bearer <idToken>
```

- ה-`userId` נגזר מה-claim `sub` שבטוקן — **לעולם לא נשלח בגוף הבקשה** (למעט קריאות AI פנימיות).
- מסלולי `/admin/*` דורשים בנוסף חברות בקבוצת Cognito בשם `ADMIN` (נבדק מתוך claim `cognito:groups`).
- משתמש חסום (`blocked=true` בטבלת users) מקבל `403` עם `{"code": "ACCOUNT_SUSPENDED"}` מכל מסלול.

---

## מוסכמות כלליות

- **פורמט:** כל הבקשות והתשובות הן `application/json`. קבצים נשלחים כ-Base64 בתוך ה-JSON.
- **תאריכים:** ISO-8601 UTC (לדוגמה `2026-06-12T14:30:00Z`).
- **מזהים:** UUID v4 כמחרוזת.
- **תשובת שגיאה אחידה:** `{"error": "<תיאור>"}` עם קוד HTTP מתאים.
- **CORS:** כל המסלולים מחזירים כותרות CORS פתוחות (`*`).
- **כסף/מכסות:** ערך `-1` משמעו "ללא הגבלה".

---

## 1. Users Service

**קובץ:** `backend/lambdas/users/handler.py` · **טבלה:** `joboss-users` · **S3:** `joboss-resumes-171109860478`

**ייעוד:** ניהול פרופיל המשתמש — פרטים אישיים, העדפות חיפוש, ניהול קורות-חיים (עד 3), ומצב Onboarding.

### `GET /users/me`

מחזיר את הפרופיל המלא של המשתמש המחובר.

**פרמטרים:** אין (ה-userId מהטוקן).

**תשובה — 200:**

```json
{
  "message": "User profile",
  "user": {
    "userId": "uuid",
    "fullName": "string — שם מלא",
    "email": "string",
    "plan": "FREE | PREMIUM | PREMIUM_PLUS",
    "role": "USER | ADMIN",
    "autoApply": "boolean — הגשה אוטומטית פעילה",
    "autoTailorCV": "boolean — התאמת קו\"ח אוטומטית ב-AI",
    "preferredLocation": "string — עיר מועדפת",
    "searchRadius": "number — רדיוס חיפוש בק\"מ",
    "latitude": "number?", "longitude": "number?",
    "preferredRoles": ["string — תפקידים מועדפים"],
    "experienceLevel": "string — סטודנט/Junior/Mid/Senior/Lead",
    "availability": "string — מיידי/תוך חודש/סתם מסתכל",
    "phone": "string?", "currentLocation": "string?", "currentCompany": "string?",
    "gender": "string?", "linkedinUrl": "string?", "githubUrl": "string?", "websiteUrl": "string?",
    "profileImageUrl": "string? — URL ציבורי של תמונת הפרופיל",
    "resumes": [
      {
        "resumeId": "uuid",
        "resumeUrl": "s3://...",
        "fileName": "string",
        "uploadedAt": "ISO-8601",
        "isActive": "boolean — הקו\"ח הפעיל להגשות"
      }
    ],
    "resumePresignedUrl": "string? — URL חתום להורדה, תקף לשעה",
    "onboardingCompleted": "boolean",
    "createdAt": "ISO-8601", "updatedAt": "ISO-8601"
  }
}
```

**שגיאות:** `401` ללא טוקן · `403` חשבון מושהה · `404` אין פרופיל (משתמש חדש → Onboarding).

### `POST /users/me`

יוצר פרופיל חדש (נקרא פעם אחת אחרי הרשמה).

**גוף הבקשה:** אותם שדות כמו ב-GET (כולם אופציונליים פרט ל-`fullName`). ולידציה: `plan` ∈ {FREE, PREMIUM}, `role` ∈ {USER, ADMIN}, `autoApply` בוליאני, `searchRadius` ≥ 0.

**תשובה:** `201` עם הפרופיל שנוצר · `409` אם כבר קיים.

### `PUT /users/me`

עדכון חלקי של הפרופיל — שולחים רק את השדות שמשתנים.

**ניהול קורות חיים** (דרך אותו endpoint):

| פעולה | גוף הבקשה | התנהגות |
|---|---|---|
| הוספת קו"ח | `{"resumeData": {"resumeId", "resumeUrl", "fileName", "uploadedAt"}}` | נוסף למערך `resumes`, הופך לפעיל; אם יש יותר מ-3 — הישן ביותר נמחק (כולל מ-S3) |
| מחיקה | `{"action": "delete", "resumeId": "uuid"}` | מסיר מהמערך ומ-S3; אם נמחק הפעיל — הראשון שנותר הופך לפעיל |
| קביעת פעיל | `{"action": "setActive", "resumeId": "uuid"}` | מסמן `isActive=true` לקו"ח הנבחר בלבד |

**תשובה:** `200` עם הפרופיל המעודכן.

---

## 2. Jobs Service

**קובץ:** `backend/lambdas/jobs/handler.py` · **טבלאות:** `joboss-jobs`, `joboss-users`

**ייעוד:** שליפת משרות פעילות עם סינון גיאוגרפי, סינון לפי העדפות המשתמש, וחישוב ציון התאמה (0-100).

### `GET /jobs`

**Query Parameters (כולם אופציונליים):**

| פרמטר | סוג | משמעות |
|---|---|---|
| `lat` | float | קו רוחב לסינון גיאוגרפי |
| `lng` | float | קו אורך |
| `radius` | float | רדיוס בק"מ (ברירת מחדל מהפרופיל) |
| `location` | string | שם מיקום חופשי (geocoded דרך Nominatim) |

אם נשלח JWT — ההעדפות (תפקידים, רמת ניסיון, מיקום) נטענות מהפרופיל ומשפיעות על הציון.

**תשובה — 200:**

```json
{
  "message": "Jobs list",
  "count": 25,
  "filters": {
    "radiusApplied": true,
    "mode": "coordinates | location-name | none",
    "prefsApplied": true,
    "remoteJobsAlwaysIncluded": true,
    "avgScore": 67
  },
  "jobs": [
    {
      "jobId": "uuid",
      "title": "string", "company": "string", "location": "string",
      "description": "string — תיאור מלא (מנורמל ע\"י AI)",
      "shortDescription": "string — תקציר",
      "applyUrl": "string — קישור הגשה חיצוני",
      "requirements": ["string"], "technologies": ["string"],
      "matchScore": "number 0-100 — ציון התאמה",
      "matchesPreferences": "boolean — האם בתחומי המשתמש",
      "jobDomains": ["frontend | backend | mobile | devops | data | ..."],
      "jobLevel": ["junior | mid | senior | student"],
      "matchBreakdown": "object — פירוט רכיבי הציון (לחלון ה-Match)",
      "distanceKm": "number? — מרחק מהמשתמש",
      "isActive": true,
      "createdAt": "ISO-8601", "expiresAt": "epoch (TTL — 10 ימים)"
    }
  ]
}
```

**חישוב הציון:** תפקידים 0-50 + רמת ניסיון 0-30 + מרחק 0-20. משרות Remote נכללות תמיד בלי קשר לרדיוס.

### `GET /jobs/{jobId}`

מחזיר משרה בודדת. **תשובה:** `200` עם `{message, job}` · `404` אם לא נמצאה.

---

## 3. Swipes Service

**קובץ:** `backend/lambdas/swipes/handler.py` · **טבלאות:** `joboss-swipes`, `joboss-applications`, `joboss-subscriptions`, `joboss-users`, `joboss-jobs` · **SQS:** `joboss-auto-apply-queue`

**ייעוד:** רישום החלטות החלקה (LIKE/PASS), אכיפת מכסה יומית, והפעלת צינור ההגשה האוטומטית.

### `POST /swipes`

**גוף הבקשה:**

| שדה | סוג | חובה | משמעות |
|---|---|---|---|
| `jobId` | string | ✓ | מזהה המשרה |
| `decision` | string | ✓ | `"LIKE"` או `"PASS"` |
| `company` | string | — | שם החברה (לשמירה ברשומת ההגשה) |
| `title` | string | — | כותרת המשרה |

**זרימת LIKE:**
1. בדיקת מכסה יומית לפי התוכנית (FREE=5, PREMIUM=30, PLUS=∞). חריגה → `429`.
2. יצירת רשומת הגשה ב-`joboss-applications` עם `autoApplyStatus`:
   - `"manual"` — אם autoApply כבוי (המשתמש יגיש ידנית)
   - `"pending"` — autoApply פעיל בלי AI → נשלחת מיד הודעת SQS
   - `"pending_tailoring"` — autoApply + התאמת AI → ההודעה תישלח ע"י ה-AI Lambda אחרי ההתאמה
3. יצירת רשומת swipe.

**תשובה — 200:**

```json
{
  "message": "Swipe recorded",
  "decision": "LIKE",
  "quota": { "plan": "FREE", "limit": 5, "used": 3, "remaining": 2, "unlimited": false, "resetAt": "ISO-8601" }
}
```

### `GET /swipes` (גם `/swipes/me`)

מחזיר `{swipes: [{userId, jobId, decision, swipedAt}]}`.

### `DELETE /swipes/{jobId}`

ביטול החלקה (Undo) — מוחק את רשומת ה-swipe **וגם** את ההגשה שנוצרה ממנה. **תשובה:** `{message: "Swipe undone"}`.

### `GET /swipes/quota`

מצב המכסה היומית. ב-PREMIUM מוחזרת גם מכסת ההתאמות החודשית:

```json
{ "plan": "PREMIUM", "limit": 30, "used": 4, "remaining": 26, "unlimited": false,
  "resetAt": "ISO-8601", "tailorLimit": 10, "tailorUsed": 2, "tailorRemaining": 8 }
```

---

## 4. Applications Service

**קובץ:** `backend/lambdas/applications/handler.py` · **טבלאות:** `joboss-applications` (מפתח: userId+jobId), `joboss-jobs`, `joboss-users`

**ייעוד:** ניהול משפך ההגשות — סטטוסים ידניים, מעקב הגשה אוטומטית, מחיקה מרובה.

**שני צירי סטטוס נפרדים:**

| שדה | ערכים | משמעות |
|---|---|---|
| `status` | `SUBMITTED` → `REVIEWED` → `INTERVIEW` → `ACCEPTED` / `REJECTED` | משפך ידני שהמשתמש מקדם |
| `autoApplyStatus` | `manual` / `pending` / `pending_tailoring` / `processing` / `completed` / `failed` | מצב צינור ההגשה האוטומטי |

### `GET /applications`

**Query:** `?status=SUBMITTED` (אופציונלי — סינון לפי סטטוס משפך).

**תשובה — 200:**

```json
{
  "applications": [
    {
      "userId": "uuid", "jobId": "uuid",
      "status": "SUBMITTED",
      "autoApplyStatus": "manual",
      "company": "string", "title": "string",
      "createdAt": "ISO-8601", "lastUpdated": "ISO-8601",
      "jobApplyUrl": "string — קישור ההגשה (מועשר מטבלת jobs)",
      "tailoredResumeUrl": "s3://...?",
      "tailoredResumePresignedUrl": "string? — URL חתום לשעה",
      "failReason": "string? — סיבת כשל בהגשה אוטומטית",
      "notes": "string?"
    }
  ]
}
```

> **Self-healing:** בזמן קריאה, רשומות ישנות עם `status: "auto_apply_*"` מומרות אוטומטית לפורמט החדש (`autoApplyStatus` + `status: SUBMITTED`).

### `POST /applications`

יצירת הגשה ידנית. **גוף:** `{jobId (חובה), company?, title?, tailoredResumeUrl?, resumeVersionId?}` → `{success, jobId}`.

### `PUT /applications`

**גוף:** `{jobId (חובה), status?, notes?, clearTailoring?: boolean}`.
- `status` חייב להיות אחד מערכי המשפך — אחרת `400`.
- `clearTailoring: true` מוחק את הקו"ח המותאם מההגשה.

### `DELETE /applications`

מחיקה מרובה. **גוף:** `{"jobIds": ["uuid", ...]}` (חובה, מערך). **תשובה:** `{"deleted": <count>}`. המחיקה מתבצעת ב-`batch_writer`.

---

## 5. Subscriptions Service

**קובץ:** `backend/lambdas/subscriptions/handler.py` · **טבלאות:** `joboss-subscriptions`, `joboss-users` · **חיצוני:** Stripe

**ייעוד:** ניהול תוכניות ומנויים בתשלום, מכסות, ועיבוד Webhooks של Stripe.

**טבלת תוכניות (TIER_LIMITS):**

| תוכנית | החלקות/יום | הגשות/יום | התאמות AI/חודש | Auto-Apply |
|---|---|---|---|---|
| `FREE` | 5 | 5 | — | ✗ |
| `PREMIUM` | 30 | ∞ | 10 | ✓ |
| `PREMIUM_PLUS` | ∞ | ∞ | ∞ | ✓ |

### `GET /subscriptions/me`

מחזיר את מצב המנוי המלא:

```json
{
  "userId": "uuid",
  "plan": "PREMIUM", "planKey": "PREMIUM",
  "planDetails": { "name": "string", "price_monthly": 29.9, "daily_swipes": 30,
                   "ai_tailoring_monthly": 10, "auto_apply": true, "trial_days": 7 },
  "plans": { "FREE": {...}, "PREMIUM": {...}, "PREMIUM_PLUS": {...} },
  "subscription": { "status": "active", "stripeSubscriptionId": "sub_...", "currentPeriodEnd": "ISO-8601" },
  "dailyLimit": 30, "used": 4, "remaining": 26, "unlimited": false, "resetAt": "ISO-8601"
}
```

### `POST /subscriptions/checkout`

**גוף:** `{"plan": "PREMIUM" | "PREMIUM_PLUS"}` → יוצר Stripe Checkout Session (כולל 7 ימי ניסיון).
**תשובה:** `{checkoutUrl, sessionId}` — מפנים את הדפדפן ל-`checkoutUrl`.

### `POST /subscriptions/consume`

צריכת יחידה אחת מהמכסה היומית. **תשובה:** מצב המכסה המעודכן · `429` אם נגמרה.

### `DELETE /subscriptions/me`

ביטול מנוי — מסומן לביטול בסוף תקופת החיוב הנוכחית (לא מיידי).

### `POST /subscriptions/webhook` *(ללא JWT — חתימת Stripe)*

מעבד אירועי Stripe: `checkout.session.completed` (שדרוג plan), `customer.subscription.deleted` (חזרה ל-FREE), `customer.subscription.updated`. האימות באמצעות `STRIPE_WEBHOOK_SECRET`. **תשובה:** `{received: true}`.

---

## 6. AI Service

**קובץ:** `backend/lambdas/ai/handler.py` · **Bedrock:** Claude Haiku · **S3:** `joboss-resumes-171109860478`

**ייעוד:** התאמת קורות-חיים למשרה ספציפית, ניתוח קו"ח להעשרת הפרופיל, והסבר כשלים בהגשה אוטומטית.

### `POST /ai/tailor-resume`

מתאים את הקו"ח הפעיל של המשתמש למשרה נתונה ושומר PDF מותאם ב-S3.

**גוף הבקשה:**

| שדה | סוג | חובה | משמעות |
|---|---|---|---|
| `jobId` | string | ✓ | המשרה להתאמה |
| `resumeId` | string | — | קו"ח ספציפי (ברירת מחדל: הפעיל) |
| `force` | boolean | — | התאמה מחדש גם אם כבר קיימת |

**תשובה — 200:**

```json
{
  "message": "Resume tailored",
  "mode": "bedrock | bedrock-pdf-extracted | mock",
  "tailoredResume": "string — הטקסט המותאם",
  "tailoredResumeUrl": "s3://.../users/{userId}/tailored/{jobId}/{id}.pdf",
  "tailoredResumeId": "uuid",
  "createdAt": "ISO-8601",
  "sourceResume": { "resumeId": "...", "fileName": "..." },
  "job": { "jobId": "...", "title": "...", "company": "..." }
}
```

**שגיאות:** `403` תוכנית FREE (אין AI) · `429` נגמרה מכסת ההתאמות החודשית · `404` משרה/קו"ח לא נמצאו.

> אם ההגשה במצב `pending_tailoring`, בסיום ההתאמה נשלחת אוטומטית הודעת SQS לתור ההגשה.

### `POST /ai/analyze-cv`

מנתח קו"ח ומחזיר `{suggestedRoles[], experienceLevel, technologies[]}`. בנוסף מעשיר את הפרופיל ברקע (טלפון, עיר, חברה נוכחית, לינקדאין, גיטהאב) — בלי לדרוס ערכים קיימים.

### `POST /ai/explain-failure`

מסביר בעברית למה הגשה אוטומטית נכשלה. **גוף:** `{jobId}`.

**תשובה:** `{explanation: {title, summary, category, action, generatedAt}, cached: boolean}` — `category` ∈ {captcha, bot_blocked, missing_data, no_form, site_error, timeout, unknown}. ההסבר נשמר על ההגשה (cache) ולא מחושב פעמיים.

---

## 7. Uploads Service

**קובץ:** `backend/lambdas/uploads/lambda_function.py` · **S3:** `joboss-resumes`

### `POST /resumes/upload`

**גוף:** `{"file": "<base64>", "fileName": "cv.pdf"}` (PDF בלבד).

**תשובה — 200:**

```json
{ "resumeId": "uuid", "resumeUrl": "s3://joboss-resumes/users/{userId}/{timestamp}_{fileName}",
  "fileName": "cv.pdf", "uploadedAt": "ISO-8601" }
```

> ההעלאה רק שומרת את הקובץ. כדי לקשר אותו לפרופיל יש לקרוא אחר-כך ל-`PUT /users/me` עם `resumeData` (ראו Users Service).

---

## 8. Profile Image Service

**קובץ:** `backend/lambdas/profile-image/handler.py` · **S3:** `joboss-resumes` · **טבלה:** `joboss-users`

### `POST /profile/image`

**גוף:** `{"image": "<base64>", "fileName": "me.png"}`.
**מגבלות:** עד 5MB; סיומות: jpg/jpeg/png/webp/gif.

**תהליך:** מחיקת התמונה הישנה מ-S3 → העלאה ל-`users/{userId}/profile/avatar_{random}.{ext}` (עם cache לשנה) → עדכון `profileImageUrl` בפרופיל.

**תשובה:** `{success: true, imageUrl: "https://..."}`.

---

## 9. Admin Service

**קובץ:** `backend/lambdas/admin/handler.py` · **אימות:** JWT + קבוצת `ADMIN` ב-Cognito

**ייעוד:** דשבורד ניהול — סטטיסטיקות, ניהול משתמשים ומשרות, הרשאות אדמין.

| Method | Path | גוף הבקשה | תשובה |
|---|---|---|---|
| GET | `/admin/stats` | — | `{totalUsers, planBreakdown, appsToday, appsThisWeek, appsThisMonth, totalApps, totalSwipes, totalLikes, aiTailoringsTotal, newUsersThisWeek, bedrockAvailable, generatedAt}` |
| GET | `/admin/users` | — | `{users: [{userId, fullName, email, plan, createdAt, lastActiveAt, blocked, aiTailoringsUsed, appCount, acceptedCount, rejectedCount, isAdmin}], total}` |
| PUT | `/admin/users/{userId}/plan` | `{plan}` | `{success, plan}` — `400` אם plan לא חוקי |
| POST | `/admin/users/{userId}/reset-quota` | — | `{success}` — מאפס מכסה יומית |
| PUT | `/admin/users/{userId}/block` | `{blocked: bool}` | `{success, blocked}` — **שולח מייל SES בעברית** למשתמש |
| POST | `/admin/users/{userId}/grant-admin` | `{password}` | `{success, email}` — `401` סיסמה שגויה |
| POST | `/admin/users/{userId}/revoke-admin` | `{password}` | `{success, email}` — `409` אם זה האדמין האחרון |
| DELETE | `/admin/users/{userId}` | — | `{success}` — מוחק מ-Cognito **ומ**-DynamoDB |
| GET | `/admin/jobs` | — | `{jobs: [{jobId, company, title, location, active, createdAt, likes, passes}], total}` |
| PUT | `/admin/jobs/{jobId}` | `{active?: bool}` | `{success, active}` — בלי גוף = toggle |
| POST | `/admin/jobs/import` | — | `{success, message}` — מפעיל את ה-Importer אסינכרונית |
| POST | `/admin/reset-my-quota` | `{plan?}` | `{success, plan}` — איפוס עצמי לבדיקות |
| POST | `/admin/reset-my-swipes` | — | `{success, deleted}` — מוחק את כל ההחלקות של האדמין |

---

## 10. Auto-Apply Worker

**קובץ:** `backend/lambdas/auto-apply/handler.py` · **טריגר:** SQS (`joboss-auto-apply-queue`) — *לא נחשף ב-API Gateway*

**ייעוד:** צרכן התור שמשגר משימת ECS Fargate המריצה דפדפן ומגישה את המועמדות בפועל.

**סכמת הודעת SQS:**

```json
{
  "userId": "uuid", "jobId": "uuid",
  "company": "string", "jobTitle": "string",
  "jobUrl": "string — applyUrl של המשרה",
  "tailoredResumeUrl": "s3://... (אופציונלי)",
  "aiTailoring": "boolean"
}
```

**זרימה:** קבלת הודעה → עדכון `autoApplyStatus="pending"` → שיגור Fargate task (cluster `joboss-cluster`, task def `joboss-auto-apply-task`, ההודעה מוזרקת כ-env var בשם `TASK_PAYLOAD`) → בכשל שיגור: `autoApplyStatus="failed"` + `failReason`.

---

## 11. Jobs Importer

**קובץ:** `backend/lambdas/jobs_importer/handler.py` · **טריגר:** EventBridge מתוזמן או הפעלה ידנית (`POST /admin/jobs/import`)

**ייעוד:** ייבוא משרות מערוץ Telegram, נרמול ב-AI, והכנסה ל-DynamoDB.

**זרימה:** התחברות ל-Telegram (telethon, עד `TG_LIMIT`=120 הודעות) → פרסור (title/company/location) → בדיקת כפילויות לפי `sourceJobId` → Geocoding (Nominatim) → משיכת תיאור מלא מ-applyUrl → נרמול AI → הכנסה עם TTL של 10 ימים.

**תשובה:** `{message, fetched, inserted, skippedDuplicates, skippedUnparsed}`.

**Env:** `TG_API_ID`, `TG_API_HASH`, `TG_SESSION_STRING`, `TG_CHANNEL`, `TG_LIMIT`, `DYNAMODB_JOBS_TABLE`.

---

## 12. Jobs Status Checker

**קובץ:** `backend/lambdas/jobs_status_checker/handler.py` · **טריגר:** EventBridge מתוזמן

**ייעוד:** סריקת משרות פעילות ובדיקה אם הן עדיין חיות (404 / "position filled"); מחיקת מתות.

**Env:** `CHECK_LIMIT` (ברירת מחדל 50), `DRY_RUN` (ברירת מחדל `"true"` — רק מדווח בלי למחוק).

**תשובה:** `{message, checked, deleted, wouldDelete, kept, dryRun}`.

---

## 13. Job Description AI

**קובץ:** `backend/lambdas/job_description_ai/handler.py` · **נקרא ע"י:** jobs_importer (פנימי)

### `POST /normalize-job-description`

**גוף:** `{action: "normalize-job-description", title, company, location, raw_description}`
**תשובה:** `{description, shortDescription}` — תיאור נקי + תקציר קצר למועמד (Claude Haiku, temp 0.2).

---

## טבלאות DynamoDB

| טבלה | מפתח | תוכן עיקרי |
|---|---|---|
| `joboss-users` | `userId` | פרופיל מלא: פרטים, העדפות, resumes[], מכסות AI, blocked, profileImageUrl |
| `joboss-jobs` | `jobId` | משרות: פרטים, applyUrl, geo, isActive, `expiresAt` (TTL 10 ימים) |
| `joboss-swipes` | `userId` + `jobId` | החלטות: decision, swipedAt |
| `joboss-applications` | `userId` + `jobId` | הגשות: status (משפך), autoApplyStatus (צינור), tailoredResumeUrl, failReason, notes |
| `joboss-subscriptions` | `userId` | plan, status, dailyApplications, limitResetAt, stripeSubscriptionId, currentPeriodEnd |

**דליי S3:**

| דלי | תוכן |
|---|---|
| `joboss-resumes` / `joboss-resumes-171109860478` | `users/{userId}/` קו"ח · `users/{userId}/tailored/{jobId}/` קו"ח מותאמים · `users/{userId}/profile/` תמונות |
| `joboss-frontend-171109860478` | קבצי ה-Frontend (מאחורי CloudFront) |
| `joboss-company-logos-171109860478` | לוגואים של חברות (legacy) |

---

## קודי שגיאה כלליים

| קוד | משמעות | מבנה |
|---|---|---|
| `400` | קלט שגוי / שדה חסר / ולידציה נכשלה | `{"error": "..."}` |
| `401` | אין טוקן או טוקן לא תקין | `{"error": "Unauthorized"}` |
| `403` | אין הרשאה (לא אדמין / פיצ'ר לא בתוכנית) **או** חשבון מושהה | `{"error": "...", "code": "ACCOUNT_SUSPENDED"?}` |
| `404` | משאב לא נמצא | `{"error": "... not found"}` |
| `405` | Method לא נתמך במסלול | `{"error": "Method not allowed"}` |
| `409` | קונפליקט (פרופיל קיים / אדמין אחרון) | `{"error": "..."}` |
| `429` | מכסה נגמרה (יומית/חודשית) | `{"error": "...", "quota": {...}}` |
| `500` | שגיאת שרת (AWS / Stripe / Bedrock) | `{"error": "..."}` |

---

## נספח: דוגמת קריאה מלאה (curl)

```bash
# קבלת טוקן נעשית בצד הלקוח דרך Amplify/Cognito. בהינתן ID_TOKEN:

# שליפת הפרופיל
curl -H "Authorization: Bearer $ID_TOKEN" \
     https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/users/me

# החלקת LIKE
curl -X POST -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" \
     -d '{"jobId":"<uuid>","decision":"LIKE","company":"Acme","title":"Backend Dev"}' \
     https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/swipes

# מחיקת הגשות מרובה
curl -X DELETE -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" \
     -d '{"jobIds":["<uuid1>","<uuid2>"]}' \
     https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/applications
```
