# Prompt for Claude Code — apply the JoBoss redesign

Paste this into Claude Code, run from the repo root (`JoBoss/frontend`).

---

I redesigned the JoBoss mobile app's visual style (kept all layouts/flows, changed the look to a more polished glassmorphism style: soft lavender background, violet→indigo gradients with a pink accent, glass/blur cards, pill-shaped buttons, bigger radii and shadows). I already prepared updated copies of some files in `integration/` (a sibling folder next to `frontend/`, or wherever these files were placed) — apply them, then extend the same treatment to the remaining pages.

### Step 1 — copy the ready files (style-only changes, logic untouched)
Copy these over the existing files, replacing them exactly:
- `integration/global.css` → `src/styles/global.css`
- `integration/Navbar.jsx` → `src/components/Navbar.jsx`
- `integration/LoginPage.jsx` → `src/pages/LoginPage.jsx`
- `integration/DashboardPage.jsx` → `src/pages/DashboardPage.jsx`
- `integration/SubscriptionPage.jsx` → `src/pages/SubscriptionPage.jsx`
- `integration/OnboardingPage.jsx` → `src/pages/OnboardingPage.jsx`

Run `npm run dev` and confirm the app still builds and runs with no console errors.

### Step 2 — apply the same design language to the remaining 3 pages
These were NOT rewritten (too large/complex to hand-edit safely without running the app): `src/pages/SwipePage.jsx`, `src/pages/ApplicationsPage.jsx`, `src/pages/ProfilePage.jsx`.

Do a **style-only** pass on each (do not touch any JSX structure, state, hooks, or API calls — only the color/shape values inside `style={{...}}` and the `styles`/`modal` objects at the bottom of each file):

**1. Global color substitution** — replace every occurrence of these hex codes with their new equivalents, across all three files:

| Old | New | Used for |
|---|---|---|
| `#6C4FD4` | `#7C5CFF` | primary violet |
| (new, add) | `#5B3DF5` | primary gradient's darker stop — use in any `linear-gradient(135deg, #6C4FD4, #1E2A4A)` → `linear-gradient(135deg, #7C5CFF, #5B3DF5)` |
| `#4CAF50` / `#2E7D32` | `#12A96F` | success/accept green |
| `#F44336` / `#c62828` | `#FF4D67` | error/reject red |
| `#FF9800` | `#F5A623` | warning/pending orange |
| `#FF6B6B` | `#FF5E8A` | secondary pink accent |
| `#E65100` | `#C2410C` | dark orange (discovery banner, warnings) |
| `#9C27B0` | `#9C4DD4` | purple accent (interview status) |
| `#2196F3` | `#3D8BF5` | blue accent (reviewed status) |
| `#1E2A4A` | keep as-is | dark navy text — unchanged |

**2. Card surfaces** — any card with `background: 'white'` and a small `boxShadow` (job cards, application cards, profile cards, modals) should become a glass card:
```js
background: 'rgba(255,255,255,0.88)',
backdropFilter: 'blur(10px)',
border: '1px solid rgba(255,255,255,0.9)',
boxShadow: '0 6px 20px rgba(108,79,212,0.08)',
```
Increase `borderRadius` values by roughly 4-6px across the board (e.g. `16px` → `20px`, `20px` → `24px`) for a softer look.

**3. Buttons** — solid gradient buttons should use `linear-gradient(135deg, #7C5CFF, #5B3DF5)` and get a stronger colored shadow: `boxShadow: '0 12px 28px rgba(91,61,245,0.35)'`. Pill/rounded buttons (`borderRadius: '20px'` or similar) should become fully round: `borderRadius: '999px'`.

**4. Page background** — the root container's `background: 'var(--background)'` will already pick up the new lavender gradient from `global.css` — no change needed there unless a page hardcodes a background color.

**5. Bottom sheets / modals** (job detail sheet, CV preview, confirm-delete) — increase corner radius to `24px 24px 0 0` (sheets) or `20-24px` (dialogs), add `backdropFilter: 'blur(20px)'` to the overlay if not present, and apply the same color mapping table above to any inline colors.

Do this pass on `SwipePage.jsx`, `ApplicationsPage.jsx`, and `ProfilePage.jsx`. After each file, run `npm run dev`, click through that page, and confirm nothing is visually broken (overlapping text, invisible buttons, etc.) and no console errors appear before moving to the next file.

### Step 3 — final check
Run through the full app: login → onboarding → swipe → applications → profile → subscription. Confirm:
- No console errors
- All existing functionality still works (swiping, applying, tailoring CV, toggles, uploads, checkout flow)
- Visual style is consistent across all pages (lavender background, violet/pink gradients, glass cards, pill buttons)

Do not change any text copy, API calls, state logic, or component structure — this is a visual-only refresh.
