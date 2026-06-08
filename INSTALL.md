# הוראות התקנה — JoBoss

מדריך זה מיועד לאיש טכני שמתקין את המערכת על חשבון AWS נקי לחלוטין.

---

## חשוב — שני מסלולי הפעלה

| מסלול | מתי משתמשים | כיצד |
|-------|------------|------|
| **התקנה על חשבון נקי** (מסלול רשמי) | הגשה / פריסה / בדיקה | `python infrastructure/setup_all.py` — יוצר `frontend/.env` עם כל הערכים |
| **פיתוח לוקאלי קיים** (תאימות אחורה) | חברי הצוות הקיימים | `awsConfig.js` כולל fallback לערכי הצוות, אין צורך ב-.env |

> **הערה:** הערכים הקשיחים ב-`awsConfig.js` הם fallback לסביבת הפיתוח הקיימת בלבד.
> על חשבון נקי, ה-`setup_all.py` **חייב** לרוץ לפני בניית ה-frontend כדי לייצר `.env` תקין.

---

## דרישות מקדימות

| כלי | גרסה מינימלית | בדיקה |
|-----|---------------|-------|
| Python | 3.10+ | `python --version` |
| Node.js | 18+ | `node --version` |
| AWS CLI | 2.x | `aws --version` |
| boto3 | עדכני | `pip install boto3` |

### הגדרת credentials של AWS

```bash
aws configure
```

יש להזין:
- **AWS Access Key ID** — ממסוף IAM
- **AWS Secret Access Key**
- **Default region** — `us-east-1`
- **Default output format** — `json`

בדיקה שה-credentials עובדים:

```bash
aws sts get-caller-identity
```

---

## התקנה מלאה — שלב אחד

מתוך תיקיית השורש של הפרויקט:

```bash
pip install boto3
python infrastructure/setup_all.py
```

הסקריפט מבצע **9 שלבים אוטומטית**:

| שלב | פעולה |
|-----|-------|
| 1 | יצירת IAM Role עם הרשאות לכל ה-Lambdas |
| 2 | יצירת Cognito User Pool + App Client |
| 3 | יצירת 6 טבלאות DynamoDB |
| 4 | יצירת S3 bucket לאחסון קורות חיים |
| 5 | יצירת API Gateway + Cognito Authorizer |
| 6 | פריסת 9 Lambda functions |
| 7 | חיבור כל ה-routes ב-API Gateway |
| 8 | יצירת S3 bucket לפרונטאנד |
| 9 | יצירת CloudFront distribution |

בסיום הסקריפט כותב אוטומטית את קובץ `frontend/.env`.

> **הסקריפט בטוח להרצה חוזרת** — כל שלב בודק אם המשאב כבר קיים לפני יצירתו.

---

## בניית ופריסת הפרונטאנד

לאחר שהסקריפט הסתיים:

```bash
cd frontend
npm install
npm run build
cd ..
python infrastructure/setup_all.py
```

הרצה שנייה של הסקריפט מזהה שהמשאבים קיימים (מדלג עליהם) ומעלה את תוכן `frontend/dist` ל-S3.

---

## אינטגרציית Stripe (אופציונלי)

מערכת המנויים משתמשת ב-Stripe. ללא הגדרה זו המנויים לא יעבדו אך שאר המערכת תפקד.

הגדר לפני הרצת הסקריפט:

```bash
# Windows
set STRIPE_SECRET_KEY=sk_live_...
set STRIPE_WEBHOOK_SECRET=whsec_...
set STRIPE_PREMIUM_PRICE_ID=price_...
set STRIPE_PREMIUM_PLUS_PRICE_ID=price_...

# Mac/Linux
export STRIPE_SECRET_KEY=sk_live_...
```

לאחר מכן הגדר ב-Stripe Dashboard:
- Webhook URL: `https://<API_ID>.execute-api.us-east-1.amazonaws.com/prod/subscriptions/webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`

---

## פעלות זרימת נתונים / seed

הפרויקט מגיע **ללא נתוני משרות**. להוספת משרות לדוגמה:

```bash
cd backend/scripts
python seed_jobs.py
```

---

## בדיקת ההתקנה

לאחר שה-CloudFront פעיל (כ-10 דקות מיצירתו):

1. פתח את ה-URL שהוצג בסיום הסקריפט
2. הירשם עם אימייל חדש
3. ודא שמגיע מייל אימות מ-AWS Cognito
4. התחבר ובדוק שדף ה-Swipe טוען משרות

בדיקת ה-API ישירות:

```bash
curl https://<API_ID>.execute-api.us-east-1.amazonaws.com/prod/jobs
```

---

## מבנה המשאבים שנוצרים

```
AWS Account
├── IAM
│   └── joboss-lambda-role
├── Cognito
│   └── joboss-users (User Pool + App Client)
├── DynamoDB
│   ├── joboss-users
│   ├── joboss-jobs
│   ├── joboss-swipes
│   ├── joboss-applications
│   ├── joboss-subscriptions
│   └── joboss-usage
├── S3
│   ├── joboss-resumes-<account-id>   (קורות חיים + תמונות פרופיל)
│   └── joboss-frontend-<account-id>  (קבצי האתר הסטטי)
├── Lambda (9 functions)
│   ├── joboss-users
│   ├── joboss-jobs
│   ├── joboss-swipes
│   ├── joboss-applications
│   ├── joboss-uploads
│   ├── joboss-ai-tailor
│   ├── joboss-profile-image
│   ├── joboss-admin
│   └── joboss-subscriptions
├── API Gateway
│   └── joboss-api (REST, Regional, stage: prod)
└── CloudFront
    └── distribution → joboss-frontend-<account-id>
```

---

## משתני סביבה — Frontend

הקובץ `frontend/.env` נכתב אוטומטית על ידי `setup_all.py`.
אם נדרשת הגדרה ידנית:

```env
VITE_API_URL=https://<API_ID>.execute-api.us-east-1.amazonaws.com/prod
VITE_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_CLOUDFRONT_URL=https://XXXXXXXXXXXX.cloudfront.net
VITE_COGNITO_DOMAIN=joboss.auth.us-east-1.amazoncognito.com   # רק אם משתמשים ב-Google SSO
```

---

## הרשאות IAM הנדרשות

הרול `joboss-lambda-role` שנוצר מקבל את המדיניות הבאה:

| מדיניות | שימוש |
|---------|-------|
| AWSLambdaBasicExecutionRole | כתיבה ל-CloudWatch Logs |
| AmazonDynamoDBFullAccess | קריאה וכתיבה לכל הטבלאות |
| AmazonS3FullAccess | העלאת קורות חיים ותמונות |
| AmazonBedrockFullAccess | קריאה ל-AI לניסוח קורות חיים |

---

## פתרון בעיות נפוצות

**שגיאה: `AccessDeniedException` בזמן הרצת הסקריפט**
→ ודא שמשתמש ה-AWS שלך הוא Admin או שיש לו הרשאות IAM, Lambda, DynamoDB, S3, CloudFront.

**הסקריפט נתקע ב-"Waiting 15s for role to propagate"**
→ זה נורמלי — IAM roles דורשים מעט זמן להתפשטות בתוך AWS.

**שגיאה: `ResourceConflictException` ב-Lambda**
→ Lambda קיים ומתעדכן — בטוח להתעלם.

**האתר לא נטען אחרי ה-CloudFront URL**
→ CloudFront לוקח עד 10 דקות לאחר יצירה. המתן ונסה שוב.

**הודעת אימות אימייל לא מגיעה**
→ בדוק ב-Cognito Console שהכתובת אושרה, ובדוק תיקיית spam.

---

## הסרת המערכת

להסרה מלאה של כל המשאבים, הרץ מהמסוף:

```bash
aws cloudformation delete-stack --stack-name joboss 2>/dev/null || true
aws s3 rb s3://joboss-frontend-$(aws sts get-caller-identity --query Account --output text) --force
aws s3 rb s3://joboss-resumes-$(aws sts get-caller-identity --query Account --output text) --force
```

את ה-DynamoDB, Lambda, Cognito, API Gateway ניתן למחוק דרך AWS Console.
