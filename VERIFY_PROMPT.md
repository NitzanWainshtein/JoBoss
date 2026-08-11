# Verification brief — JoBoss frontend

Copy everything below the line into Claude Code in Chrome.

---

You are testing a React + Vite mobile web app (JoBoss) running at **http://localhost:5173/**. It is a Hebrew-first RTL job-search app with an English mode. A large refactor just landed and **nothing has been visually verified** — the person who wrote it had no browser. Your job is to find what is broken.

The app talks to a **live production API**, so treat writes as real. Use a throwaway account for anything destructive. Do not delete real applications or cancel a real subscription unless you are on a test account.

Report back as a numbered list: what you tested, what happened, and a verdict (OK / BROKEN / CAN'T TEST). Include exact console errors. **Do not fix anything** — only report.

## Highest-risk items — start here

These are the places the author explicitly flagged as most likely to be wrong.

### 1. Hebrew values used as enum keys (highest risk of data loss)

Several dropdowns store a **Hebrew string as the persisted value** while showing a translated label. If translation leaked into the value, saving silently breaks.

- Go to **Profile → Settings → Job preferences**. Set "Experience level" and "Availability".
- Reload the page. **Do the selections persist?**
- Switch language to English, set them again, reload, switch back to Hebrew. Still correct?
- Then check the same fields during **onboarding** (new account) and confirm the value carries into the profile afterwards.
- **BROKEN** if a select shows a blank placeholder after reload, or shows a raw key like `profile.exp.student`.

### 2. Raw translation keys leaking to the screen

Anywhere showing text like `swipe.level.student`, `app.status.SUBMITTED`, `sub.row.analytics` is a bug. Sweep every screen in **both languages** and report every instance with the exact key and location. Pay extra attention to:
- Job-domain chips on the swipe card (frontend / backend / etc.)
- The match-score modal (levels and role chips)
- Application status pills
- Subscription plan feature lists and the comparison table

### 3. `t is not defined` crashes

This class of bug passed the build three times during the refactor. Open the browser console, then visit **every** screen in both languages: swipe, applications (both tabs), profile, settings, all settings sub-panels, subscription, login, onboarding. Report any `ReferenceError: t is not defined` with the screen it happened on.

## Newly restructured navigation — verify it holds together

Settings and Subscription just became **real routes** (`/settings`, `/subscription`) instead of in-page panels.

4. From Profile, tap **Settings ›**. URL should become `/settings`. The **Profile tab in the bottom bar must stay highlighted** (this was specifically engineered — an exact-match bug would leave no tab lit).
5. Same for **Subscription ›** → `/subscription`, Profile tab still lit.
6. Press **browser Back** from `/settings` → should return to `/profile`, not exit the app.
7. Inside Settings, open **Job preferences** and **Location & search** (sub-panels). The back arrow should go **Settings → Profile**, one level at a time.
8. Navigate directly to `http://localhost:5173/settings` and `/subscription` by typing the URL. Both should load correctly with the bottom bar intact.
9. Tap the **avatar in the top bar** → the dropdown should now contain **Settings** and **Subscription** entries that navigate correctly.
10. Confirm the old **Profile / Subscription tab strip is gone** from the profile screen.

## Layout — both bars were just re-anchored

11. The **top bar** should be flush against the top edge (it used to float with a gap). Scroll a long page — **no content should be visible in a gap above or beside it**, and nothing should be clipped underneath it.
12. The **bottom bar** should be flush to the bottom, same check.
13. On the **swipe screen**, confirm the card and the like/pass buttons are fully visible and the buttons are **not** underneath the bottom bar.
14. Resize the window (or rotate on mobile) while on each tab: the **purple highlight bubble must stay exactly behind the active tab's icon+label**. Switch tabs at several widths.

## Specific features to exercise

15. **Splash screen** — hard-reload (Ctrl+Shift+R). The logo should sit on a **white rounded tile** (it used to be a dark logo on a dark gradient and was nearly invisible), with drifting colour blobs and a sliding progress bar.
16. **Applications table** — the list should render as a table with a header row (Company / Role / Status / Updated). Check at a narrow width (~375px) that it does not squash: the date should fold under the role. Check the company logos load.
17. **Applications ⋮ menu** — open it on the **last row in the list**. Does it get clipped by the container's bottom edge? (Suspected issue: it opens downward with `overflow: hidden` on the table.)
18. **Match score modal** — on the swipe screen, tap the "% match" badge on a job card. The modal must be **fully on screen, not clipped**, and **both the top and bottom bars must disappear behind its blur**. Confirm tapping the backdrop closes it.
19. **Refresh button** on Applications — tap it. The icon should spin and the label change to "Refreshing…". Confirm it actually re-fetches.
20. **Login screen in English** — trigger a success message (e.g. password reset flow). The message must appear in **green, not red**. This was a specific bug fix.
21. **Auto-apply / auto-tailor toggles** in Settings on a FREE account: both should appear disabled, and tapping the row should navigate to `/subscription`.
22. **Language toggle** — flip to English from both the avatar menu and Settings. Confirm the whole layout flips to LTR, the setting **survives a reload**, and back-arrows/chevrons point the correct way in both directions.

## Known-acceptable, do not report

- Admin page, onboarding, and dev-only preview screens are still partly Hebrew in English mode — intentional, not yet translated.
- "Member since" and "Payment History" are absent from the profile — the API does not supply them.
- Hebrew strings inside `EXP_LEVELS`, `AVAILABILITY`, and `<option value="...">` are **intentional** persisted values. Only report them if the visible label is wrong.

## Finally

Give me your overall read: does this feel shippable, and what are the top 3 things you would fix first?
