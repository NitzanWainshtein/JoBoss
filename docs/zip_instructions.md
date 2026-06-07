# יצירת קובץ ZIP לאספקה

## מה לכלול / לא לכלול

| לכלול | לא לכלול |
|-------|----------|
| `frontend/src/` | `frontend/node_modules/` |
| `frontend/public/` | `frontend/dist/` |
| `frontend/package.json` | `.git/` |
| `frontend/package-lock.json` | `.tmp_lambda/*.zip` |
| `frontend/vite.config.js` | `**/__pycache__/` |
| `frontend/index.html` | `**/*.pyc` |
| `backend/lambdas/` | `frontend/.env` (מכיל ערכי חשבון ספציפי) |
| `backend/scripts/` | `.DS_Store` |
| `infrastructure/` | `Thumbs.db` |
| `docs/` | |
| `INSTALL.md` | |
| `README.md` | |

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
  infrastructure, `
  docs, `
  INSTALL.md, `
  README.md `
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
  infrastructure \
  docs \
  INSTALL.md \
  README.md \
  --exclude "**/__pycache__/*" \
  --exclude "**/*.pyc" \
  --exclude "**/.DS_Store"
```

---

## בדיקת גודל לפני שליחה

```powershell
# Windows
(Get-Item JoBoss_delivery.zip).Length / 1MB

# Mac/Linux
du -sh JoBoss_delivery.zip
```

גודל סביר: פחות מ-5MB. אם גדול יותר — בדוק שלא נכנסו `node_modules` או `.git`.

---

## לאחר יצירת ה-ZIP

1. ודא שה-ZIP מכיל `INSTALL.md` בשורש
2. תן גישת קריאה ל-GitHub Repository: [github.com/NitzanWainshtein/JoBoss](https://github.com/NitzanWainshtein/JoBoss)
3. שלח את ה-ZIP + לינק ל-Repository
