# Verification brief — JoBoss

Copy everything below the line into Claude in Chrome.

Last updated for the changes deployed on 2026-08-12 (commit `bd370c4`).

---

You are testing **JoBoss**, a Hebrew-first RTL job-search PWA, live at
**https://d231wno34rvped.cloudfront.net**. It has an English mode.

A large batch of changes shipped today and **almost none of it has been looked at in
a browser** — the person who wrote it had no way to see the app. Your job is to find
what is broken. **Do not fix anything. Only report.**

## Ground rules

- This is **production with real user data**. Writes are real.
- **Do not** cancel a subscription, delete applications, block or delete users in the
  admin panel, or change another user's plan.
- Swiping is fine but it consumes a real daily quota and creates real applications.
- Start with `Ctrl+Shift+R` to make sure you are not on a cached bundle.
- Keep the **browser console and the Network tab open the whole time.** Console
  errors matter as much as anything visible.

Report as a numbered list: what you did, what happened, verdict
(**OK / BROKEN / CAN'T TEST**), plus exact console text for anything that errors.

---

## 0. First, confirm what you are testing

Open `https://d231wno34rvped.cloudfront.net/version.json`. It should be JSON with
`"shortCommit": "bd370c4"` and `"dirty": false`.

If it returns HTML instead of JSON, stop and report that — nothing else is
meaningful.

---

## 1. The swipe deck and its paging — highest risk

This is brand new today and the most likely thing to be broken. The screen used to
download every job at once; it now fetches 50 at a time and fetches more when the
visible deck drops below 8 cards.

1. Load the swipe screen. In the **Network tab**, find the `jobs` request. Its URL
   should contain **`limit=50&offset=0`**. Report the URL exactly.
2. Does a job card appear? Is the counter/total sensible, or does it claim a
   suspicious number like 0 or 50 when there should be more?
3. **Swipe left repeatedly** (pass — this does not consume apply quota) and count.
   Somewhere after ~42 swipes a **second `jobs` request with `offset=50`** should
   appear in the Network tab, without the deck ever going empty.
   - **BROKEN** if the deck empties and shows "you're all caught up" / an empty state
     while more jobs exist.
   - **BROKEN** if you ever see **the same job twice**. Note its title if so.
   - A brief spinner in the card area between pages is expected and correct.
4. Keep going until it genuinely runs out. Does it end cleanly with the "no more
   jobs" state, or does it spin forever / error?
5. **Undo** (the middle button, appears after a swipe): does the previous card come
   back exactly once, in the right position?
6. Toggle **"show all jobs" / discovery mode** (Settings, or wherever it lives) and
   confirm the deck repopulates with lower-relevance jobs and still pages correctly.

## 2. Nothing is running on fake data

Earlier today a deploy accidentally served **mock data** — the app looked wiped:
empty admin, no profile picture, no CV, existing users pushed into onboarding. That
is fixed, but verify it is truly gone everywhere.

7. You are logged into an existing account: **you must NOT see the onboarding
   wizard.** If you do, that is a critical regression.
8. **Profile**: is the profile picture there? Is a CV listed with a real filename?
9. **Applications**: real applications with real company names?
10. **Admin** (if the account is an admin): does the users list show ~29 real users,
    and are the statistics non-zero?
11. Search the page source / console for the string `mock-user`. It must not appear
    anywhere.

## 3. The swipe Pass / Like buttons — new artwork

The ✕ and ♥ text characters were replaced with PNG artwork today.

12. The two round buttons: white circle with a red X, and a purple gradient circle
    with a white heart. Are they **the same visual size as each other** and the same
    size as the middle undo button?
13. **Is there a double circle or a double drop shadow** around either? (The artwork
    contains its own circle; the CSS circle was removed. A doubled edge means the
    removal did not take.)
14. **Look closely at the two icons: are they blurry or soft?** This is a genuine open
    question — the source art is only 70×70 pixels and the buttons render at 70 CSS
    pixels, so on a high-DPI screen they may look soft. Compare them against the
    crisp text arrow `↩` on the undo button. **Zoom the browser to 200% and say
    whether they degrade badly.** Screenshot if you can.
15. Do both buttons still work on **click**, and does **dragging** the card still
    swipe it?

## 4. The Dashboard was showing invented numbers

`/dashboard` had a hardcoded "3 swipes used" against a limit of 10 that matched no
real plan, and its upgrade button did nothing.

16. Go to `/dashboard`. Does "swipes left today" match what the swipe screen and the
    profile say? Cross-check all three.
17. The plan line should name your real plan and its real daily limit (FREE = 5,
    PREMIUM = 30, PREMIUM+ = unlimited/∞).
18. On a FREE account the **upgrade button must now navigate** to the subscription
    screen. On a paid account it should not appear.

## 5. English mode on newly translated screens

Six screens were wired into translation today. Switch to **English** and check each
for **leftover Hebrew** or **raw keys** (anything like `limit.titleSwipes`):

19. **The limit modal** — swipe right until you hit the daily cap, or tap the
    upgrade/locked prompt. Check the title, the "you used X of Y" sentence (**the
    numbers must be bold and in the right place, not the end of the sentence**), the
    countdown label, both plan cards, their feature lists, and "Maybe later".
20. **Dashboard** — every stat label, the status pills, the empty state.
21. **The mismatch warning** — tap AI CV tailoring on a poorly-matched job. The
    heading and both buttons should be English; the AI's *reason* text stays Hebrew,
    which is intentional.
22. In English, confirm the whole layout is **LTR** and that the language survives a
    reload.

## 6. Production route hygiene

23. `https://d231wno34rvped.cloudfront.net/swipe-mockup` — should **redirect to the
    app**, not render a mockup screen. Same for `/job-card-preview`.
24. `https://d231wno34rvped.cloudfront.net/this-does-not-exist` — should redirect
    home, not show a blank white page.
25. **Admin** now loads as a separate lazy chunk. Open `/admin` and watch the Network
    tab for an `AdminPage-*.js` request. Does the page render, or does it hang or
    error?

## 7. Icons, PWA, and weight

26. Sweep every screen for a **broken or missing image** (all icons were re-encoded
    and three were deleted). Report any broken-image placeholder with its location.
27. Do the icons look **noticeably worse than you would expect** anywhere? They were
    downscaled aggressively.
28. Check the **browser tab favicon** appears.
29. Try **installing the PWA** (address bar install icon, or Chrome menu → Install).
    Does it install, and is the **launcher icon sharp and uncropped** — not a huge
    blurry image, and not with its corners cut off?
30. In the Network tab, reload and report the **total transferred bytes** for a cold
    load. It should be far smaller than before; icons were 14.4MB and are now 4.4MB.

## 8. Errors and edge behaviour

31. Report **every** console error or warning, with the screen it appeared on.
32. Any screen that spins forever? Every request now has a 30-second cap, so a
      failure should surface as an error, never an endless spinner.
33. Open the app, leave it idle several minutes, come back and interact. Still works,
    or do you get thrown to login?

---

## Known and intentional — do not report

- **The admin panel is Hebrew-only**, including in English mode. Deliberate.
- **Onboarding is partly Hebrew** in English mode. Not yet translated.
- The Undo button still uses the `↩` **text character** rather than artwork —
  a pending decision, not a bug.
- Hebrew strings stored as `<option value="...">` are intentional persisted values.
  Only report them if the visible *label* is wrong.
- `dirty: false` in `version.json` is correct and expected.

---

## Finally

Three questions I actually need answered:

1. **Did the deck ever go empty or repeat a card while paging?** This is the one
   thing most likely to be subtly wrong.
2. **Are the new X / heart buttons acceptably sharp, or do they need re-exporting at
   higher resolution?**
3. What are the **top 3 things you would fix first**, and does this feel shippable?
