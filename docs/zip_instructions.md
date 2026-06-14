# יצירת קובץ ZIP לאספקה

> רשימה זו תואמת את סעיפים 7 ו-26 ב-`INSTALL.md`. אם משהו משתנה כאן — יש לעדכן גם שם.

## מה לכלול / לא לכלול

| לכלול | לא לכלול |
|-------|----------|
| `frontend/src/` | `frontend/node_modules/` |
| `frontend/public/` | `frontend/dist/` |
| `frontend/package.json` | `.git/` |
| `frontend/package-lock.json` | `.tmp_lambda/` (וכל `*.zip`) |
| `frontend/vite.config.js` | `**/package/` (תיקיות build של Lambda) |
| `frontend/index.html` | `**/__pycache__/`, `**/*.pyc` |
| `backend/lambdas/` | `**/.venv/`, `**/venv/` |
| `backend/scripts/` | `frontend/.env` ו-`.env` (ערכי חשבון/secrets) |
| `backend/shared/config.example.env` (קובץ דוגמה בלבד, ללא secrets) | `*.session` (Telegram session strings) |
| `infrastructure/` | `sample.pdf`, `out*.json` |
| `docs/` | `.DS_Store`, `Thumbs.db` |
| `INSTALL.md` | `frontend/chrome-extension.*` (`.pem`/`.crx`) |
| `README.md` | `.claude/` |
| `.gitignore` | |

---

## פקודת ZIP — Windows PowerShell

```powershell
# מתוך תיקיית השורש של הפרויקט
Compress-Archive -Path `
  frontend\src, `
  frontend\public, `
  frontend\package.json, `
  frontend\package-lock.json, `
  frontend\vite.config.js, `
  frontend\index.html, `
  backend\lambdas, `
  backend\scripts, `
  backend\shared\config.example.env, `
  infrastructure, `
  docs, `
  INSTALL.md, `
  README.md, `
  .gitignore `
  -DestinationPath JoBoss_delivery.zip
```

## פקודת ZIP — Mac/Linux

```bash
zip -r JoBoss_delivery.zip \
  frontend/src \
  frontend/public \
  frontend/package.json \
  frontend/package-lock.json \
  frontend/vite.config.js \
  frontend/index.html \
  backend/lambdas \
  backend/scripts \
  backend/shared/config.example.env \
  infrastructure \
  docs \
  INSTALL.md \
  README.md \
  .gitignore \
  --exclude "**/__pycache__/*" \
  --exclude "**/*.pyc" \
  --exclude "**/.DS_Store"
```

---

## בדיקה שה-ZIP נקי

לפני שליחה, הרץ על קובץ ה-ZIP (כפי שמופיע בסעיף 7 ב-INSTALL.md):

```bash
unzip -l JoBoss_delivery.zip | grep -E "node_modules|/package/|\.DS_Store|\.tmp_lambda|jobs_importer\.zip|__pycache__|/\.env$|/\.env\.|\.session$|sample\.pdf|out.*\.json|chrome-extension\.(pem|crx)"
```

אם הפקודה לא מחזירה כלום — ה-ZIP נקי.

---

## בדיקת גודל לפני שליחה

```powershell
# Windows
(Get-Item JoBoss_delivery.zip).Length / 1MB

# Mac/Linux
du -sh JoBoss_delivery.zip
```

גודל סביר: פחות מ-5MB. אם גדול יותר — בדוק שלא נכנסו `node_modules`, `.git` או קבצי ZIP/build.

---

## לאחר יצירת ה-ZIP

1. ודא שה-ZIP מכיל `INSTALL.md` ו-`README.md` בשורש
2. תן גישת קריאה ל-GitHub Repository: [github.com/NitzanWainshtein/JoBoss](https://github.com/NitzanWainshtein/JoBoss)
3. שלח את ה-ZIP + לינק ל-Repository
