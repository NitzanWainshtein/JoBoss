# JoBoss — Use Cases & Feature Scenarios

**Document Type:** Software Requirements Specification — Feature Catalogue  
**Version:** 1.0 | **Date:** June 2026  
**Total Features:** 33 | **Architecture:** Full-Stack Serverless (React + Python + AWS)

---

## Table of Contents

| # | Feature | Group |
|---|---------|-------|
| [F-01](#f-01-user-registration--authentication) | User Registration & Authentication | Auth & Profile |
| [F-02](#f-02-onboarding-flow-5-step-wizard) | Onboarding Flow (5-Step Wizard) | Auth & Profile |
| [F-03](#f-03-job-discovery--swipe-interface) | Job Discovery & Swipe Interface | Job Discovery |
| [F-04](#f-04-job-filtering--matching-algorithm) | Job Filtering & Matching Algorithm | Job Discovery |
| [F-05](#f-05-swipe-recording--like--pass) | Swipe Recording — Like & Pass | Job Discovery |
| [F-06](#f-06-undo-last-swipe) | Undo Last Swipe | Job Discovery |
| [F-07](#f-07-application-tracking-dual-track-status) | Application Tracking (Dual-Track Status) | Job Discovery |
| [F-08](#f-08-auto-apply-automation) | Auto-Apply Automation | AI & Automation |
| [F-09](#f-09-ai-resume-tailoring) | AI Resume Tailoring | AI & Automation |
| [F-10](#f-10-resume-upload--management) | Resume Upload & Management | Profile & Files |
| [F-11](#f-11-profile-image-upload--removal) | Profile Image Upload & Removal | Profile & Files |
| [F-12](#f-12-subscription--stripe-payment) | Subscription & Stripe Payment | Profile & Files |
| [F-13](#f-13-daily-swipe-quota-enforcement) | Daily Swipe Quota Enforcement | Quota |
| [F-14](#f-14-admin-dashboard--statistics) | Admin Dashboard & Statistics | Administration |
| [F-15](#f-15-admin-user-management) | Admin User Management | Administration |
| [F-16](#f-16-admin-job-management) | Admin Job Management | Administration |
| [F-17](#f-17-job-importer-telegram-channel) | Job Importer — Telegram Channel | Data Pipeline |
| [F-18](#f-18-job-status-monitoring--cleanup) | Job Status Monitoring & Cleanup | Data Pipeline |
| [F-19](#f-19-chrome-extension--ats-auto-fill) | Chrome Extension — ATS Auto-Fill | Integrations |
| [F-20](#f-20-email-notification-amazon-ses) | Email Notification (Amazon SES) | Integrations |
| [F-21](#f-21-personal-dashboard) | Personal Dashboard | Dashboard & Settings |
| [F-22](#f-22-preference-mismatch-warning-modal) | Preference Mismatch Warning Modal | Swipe UX |
| [F-23](#f-23-edit-profile--change-password) | Edit Profile & Change Password | Dashboard & Settings |
| [F-24](#f-24-account-suspension-screen) | Account Suspension Screen | Auth Extended |
| [F-25](#f-25-password-reset-flow) | Password Reset Flow | Auth Extended |
| [F-26](#f-26-discovery-mode--30-minute-window) | Discovery Mode — 30-Minute Window | Swipe UX |
| [F-27](#f-27-match-score-breakdown-modal) | Match Score Breakdown Modal | Swipe UX |
| [F-28](#f-28-show-all-jobs-toggle) | Show All Jobs Toggle | Dashboard & Settings |
| [F-29](#f-29-gps-location-auto-detection) | GPS Location Auto-Detection | Dashboard & Settings |
| [F-30](#f-30-chrome-extension--direct-login) | Chrome Extension — Direct Login | Chrome Ext. Advanced |
| [F-31](#f-31-chrome-extension--sso-auth-bridge) | Chrome Extension — SSO Auth Bridge | Chrome Ext. Advanced |
| [F-32](#f-32-chrome-extension--tailored-cv-selector) | Chrome Extension — Tailored CV Selector | Chrome Ext. Advanced |
| [F-33](#f-33-chrome-extension--floating-fill-button) | Chrome Extension — Floating Fill Button | Chrome Ext. Advanced |

---

## Group 1 — Authentication & User Profile

---

### F-01: User Registration & Authentication

**Actors:** Visitor, Returning User  
**Files:** `LoginPage.jsx`, `users/handler.py`, `aws-exports.js`

**Scenario:**

A new visitor opens JoBoss for the first time. After the splash screen, they land on the Login page. They can either click "Continue with Google" to authenticate via OAuth, or register manually by entering their full name, email, and password (minimum 8 characters with an uppercase letter and a number).

If they choose Google, AWS Amplify triggers a redirect to Google's OAuth consent page. After approving, they are returned to the app with a Cognito JWT token. If they choose email registration, Cognito sends a 6-digit verification code to their email — they must enter it on the confirmation screen before they can proceed.

On every app load, the stored token is validated. If the token is valid, the system calls the `/users/me` endpoint to load the profile. If the user has no profile yet (first login), one is created automatically with default values and they are redirected to the Onboarding flow. If the account is blocked, the system returns a `403 ACCOUNT_SUSPENDED` error and the user sees the suspension screen instead.

---

### F-02: Onboarding Flow (5-Step Wizard)

**Actors:** New User  
**Files:** `OnboardingPage.jsx`, `users/handler.py`, `uploads/handler.py`, `ai/handler.py`

**Scenario:**

After a first successful login, the user is redirected to a 5-step guided wizard.

**Step 1 — Plan Selection:** The user sees a comparison of FREE, PREMIUM, and PREMIUM_PLUS tiers. They can start with FREE or click to upgrade, which opens Stripe checkout in a new tab.

**Step 2 — Resume Upload:** The user uploads their CV as a PDF. The system requests a presigned S3 URL from the backend, uploads the file directly from the browser to S3, and then sends the PDF to an AI Lambda that extracts the text and calls Claude Haiku (Amazon Bedrock) to suggest the most relevant job categories.

**Step 3 — Role Selection:** The AI-suggested roles are pre-checked. The user reviews and adjusts: selecting their desired job category (Frontend, Backend, Full Stack, Mobile, DevOps, Data Science, etc.) and experience level (Student, Junior, Mid, Senior).

**Step 4 — Location & Preferences:** The user types their preferred city or uses GPS detection. They drag a radius slider (5–100 km) to define their job search area. They also set their availability (Immediately / Within a month / Just browsing) and optionally toggle "Show All Jobs" to receive all postings regardless of match.

**Step 5 — Confirmation:** A summary of all selections is shown. The user clicks "Start" and the system saves their profile with `onboardingComplete: true`. They are redirected to the swipe feed.

---

## Group 2 — Job Discovery & Swiping

---

### F-03: Job Discovery & Swipe Interface

**Actors:** Authenticated User  
**Files:** `SwipePage.jsx`, `jobs/handler.py`

**Scenario:**

The user navigates to the main `/swipe` page. The system fetches their job pool from the backend — a ranked list of jobs that have already been filtered and scored by the matching algorithm (F-04). Jobs the user has already swiped are excluded.

The top job card is displayed front and centre, showing a background image matched to the job's technology category (e.g., a circuit board image for Backend, a design tool screenshot for UX), the company logo, job title, location, distance from the user, a match-score badge, and a short description with technology tags.

The user can swipe the card right (LIKE) or left (PASS) by dragging it, or use the on-screen heart / X buttons. Tapping the card (without dragging) opens a full-detail modal with the complete job description parsed into structured sections: Summary, Responsibilities, Requirements, Nice to Have, and Technologies.

---

### F-04: Job Filtering & Matching Algorithm

**Actors:** System (internal, runs on every `/jobs` request)  
**Files:** `jobs/handler.py` — `score_job()`, `haversine()`

**Scenario:**

Before any jobs are shown to the user, the backend runs a scoring algorithm that assigns each job a score from 0 to 100 based on three components:

- **Role Match (0–50 points):** The job's title and description are checked against keyword lists for each of 15 role categories. If the job matches the user's desired role (e.g., "Frontend Developer"), the full 50 points are awarded.
- **Experience Level (0–30 points):** The job description is scanned for level indicators (Junior, Senior, Lead, etc.). If the detected level matches the user's declared experience, 30 points are awarded.
- **Distance (0–20 points):** The straight-line distance between the user's preferred location and the job's coordinates is calculated using the Haversine formula. Jobs within 10 km score 40 points; within 30 km — 30 points; 50 km — 20 points; 80 km — 10 points; beyond — 0 points.

Jobs scoring 60 or above are placed in the "Primary Pool" and shown first. Jobs below that threshold form the "Discovery Pool," shown only after the primary pool is exhausted or if Discovery Mode (F-26) is active. All pools are sorted by score descending.

---

### F-05: Swipe Recording — Like & Pass

**Actors:** User  
**Files:** `swipes/handler.py`, `applications/handler.py`, `SwipePage.jsx`

**Scenario:**

When the user swipes RIGHT (LIKE), the system first checks whether the user still has daily quota remaining (F-13). If not, the swipe is blocked and the Limit Modal is shown. If quota is available, the system immediately updates the UI optimistically (decrements the visible counter) before the API call returns.

A record is created in the `joboss-swipes` table. Simultaneously, an application record is created in `joboss-applications` with status `pending`. A race-condition guard prevents duplicate entries if the user somehow triggers two swipes for the same job.

If the user has Auto-Apply enabled and is on a PREMIUM or PREMIUM_PLUS plan, a message is sent to the SQS queue containing the job URL, job title, company name, and user ID, triggering the auto-apply pipeline (F-08).

When the user swipes LEFT (PASS), only the swipe record is created — no application is generated.

---

### F-06: Undo Last Swipe

**Actors:** User  
**Files:** `swipes/handler.py`, `SwipePage.jsx`

**Scenario:**

Immediately after any swipe, a circular undo button with an animated countdown ring appears for 5 seconds. If the user taps it within that window, the system calls `DELETE /swipes/last`.

The backend retrieves the most recent swipe for this user (sorted by timestamp), deletes it from DynamoDB, and if the direction was LIKE, also deletes the associated application record — but only if the Auto-Apply pipeline has not yet started processing it. If auto-apply already submitted the application, the system returns a specific error ("Application already submitted by Auto-Apply") and the undo is rejected.

On the frontend, the job card is animated back into the top of the stack, and the daily swipe counter is decremented by one, restoring the quota.

---

### F-07: Application Tracking (Dual-Track Status)

**Actors:** User  
**Files:** `ApplicationsPage.jsx`, `applications/handler.py`

**Scenario:**

The Applications page displays all jobs the user has LIKED. Each application has two independent status tracks:

**Track A — User Candidacy Funnel:** Reflects real-world recruitment progress. The user manually advances this status: `SUBMITTED → REVIEWED → INTERVIEW → ACCEPTED / REJECTED`. This track is for the user's own bookkeeping.

**Track B — Auto-Apply System Status:** Reflects what the automated pipeline did. Values are: `manual` (user applied themselves), `pending` (queued for auto-apply), `pending_tailoring` (AI is tailoring the CV first), `success` (auto-apply submitted), or `failed` (with a failure reason like "unsupported ATS platform").

The page has tabs to filter by status: All, Pending, Success, Candidacy. The user can add personal notes to any application, and can select multiple applications and batch-delete them. The system also heals legacy records that were created before the dual-track system existed, converting them to the new format.

---

## Group 3 — AI & Automation

---

### F-08: Auto-Apply Automation (ECS Fargate + Playwright)

**Actors:** System (triggered on LIKE swipe)  
**Files:** `auto-apply/handler.py`, `fargate/auto-apply/apply.py`

**Scenario:**

When a PREMIUM user's LIKE swipe is queued (F-05), the Auto-Apply Lambda picks up the SQS message. It loads the user's profile (full name, email, phone number, active resume S3 key) and the job's apply URL and title. If a tailored resume was generated for this job (F-09), it is used instead of the original.

The Lambda launches an ECS Fargate task with a headless Chromium browser (Playwright). The Fargate container navigates to the apply URL, detects which Applicant Tracking System (ATS) the page belongs to — SmartRecruiters, Lever, Greenhouse, Workday, Ashby, JobVite, Taleo, iCIMS, or LinkedIn — and runs the platform-specific form-filling logic. The browser uses playwright-stealth to avoid bot detection.

The container fills in first name, last name, email, phone, and attaches the resume PDF. It then submits the form and waits for a confirmation response. The entire attempt has a 4-minute timeout.

The result (success or failure with a specific reason) is sent back to the Lambda. On success, the application record is updated to `autoApplyStatus: "success"` and a confirmation email is sent to the user via SES (F-20). On failure, the user's daily quota is refunded (`quotaExempt: true`) so they are not penalised for a failed attempt, and a failure notification email is sent.

---

### F-09: AI Resume Tailoring (Claude via Amazon Bedrock)

**Actors:** User (PREMIUM / PREMIUM_PLUS)  
**Files:** `ai/handler.py`, `ApplicationsPage.jsx`, `SwipePage.jsx`

**Scenario:**

A PREMIUM user can request an AI-tailored version of their resume for a specific job. They tap "Tailor Resume" on an application card, or they have "Auto-Tailor CV" enabled in their profile settings, which triggers tailoring automatically on every LIKE swipe.

The AI Lambda downloads the user's active resume PDF from S3, extracts all text using pdfplumber, and loads the job description. It then sends a structured prompt to Claude Haiku (Amazon Bedrock) asking it to rewrite the resume to highlight the most relevant skills, mirror the job's keywords, and optimise for ATS parsing — without fabricating experience.

The Claude-generated tailored resume (in Markdown format) is converted to a PDF using reportlab and uploaded to S3 under `tailored-resumes/{userId}/{jobId}.pdf`. A 1-hour presigned download URL is returned to the frontend.

PREMIUM users are limited to 10 tailorings per month. PREMIUM_PLUS users have no limit. The monthly counter is tracked in the user's DynamoDB record. When the limit is reached, a toast notification appears: "You have reached your 10 monthly tailoring limit."

During auto-tailoring, an animated progress banner appears on the swipe screen: "Tailoring CV for [Company]..." with a pulsing robot icon. Auto-apply is deferred until tailoring completes.

---

## Group 4 — Profile & File Management

---

### F-10: Resume Upload & Management

**Actors:** User  
**Files:** `uploads/handler.py`, `users/handler.py`, `ProfilePage.jsx`

**Scenario:**

From the Profile page, the user can upload PDF resume files (max 5 MB each). The system supports up to 3 resumes simultaneously. When a new resume is uploaded, the backend generates a presigned S3 PUT URL — the file is streamed directly from the browser to S3, bypassing the Lambda entirely to avoid the API Gateway's 7 MB payload limit.

After the upload, the frontend notifies the backend to register the new resume in the user's record with its `resumeId`, `fileName`, and `uploadedAt` timestamp. If the user already has 3 resumes, the oldest one is automatically deleted from S3 and removed from the record before the new one is added.

The user can mark any resume as "Active" by tapping a button next to it. The active resume is the one used in auto-apply and AI tailoring. Only one resume can be active at a time. The user can also delete any individual resume at any time, with a confirmation prompt.

---

### F-11: Profile Image Upload & Removal

**Actors:** User  
**Files:** `profile-image/handler.py`, `ProfilePage.jsx`

**Scenario:**

The user taps their avatar in the profile header to open a dropdown menu. They select "Upload Profile Image" and choose a photo (JPG, PNG, WebP, or GIF, max 5 MB). The image is sent to a Lambda as a base64-encoded string.

The Lambda decodes the image, opens it with the Pillow library, downscales it to a maximum of 512×512 pixels while maintaining the aspect ratio, and re-encodes it as JPEG at 85% quality. This processed image is stored in S3 as `profile-images/{userId}.jpg` with public-read access. The public URL is saved in the user's DynamoDB record.

The frontend dispatches a `profile-updated` custom event so the Navbar avatar and the profile header both refresh instantly without a page reload.

If the user selects "Remove Profile Image," the Lambda deletes the file from S3 and clears the URL in DynamoDB. The avatar reverts to the default placeholder icon.

---

### F-12: Subscription & Stripe Payment

**Actors:** User  
**Files:** `subscriptions/handler.py`, `SubscriptionPage.jsx`, `ProfilePage.jsx`

**Scenario:**

JoBoss offers three tiers: **FREE** (5 daily swipes, no AI, no auto-apply), **PREMIUM** ($9.99/month — 30 daily swipes, 10 AI tailorings/month, auto-apply), **PREMIUM_PLUS** ($19.99/month — unlimited everything, priority matching).

When the user clicks "Upgrade to PREMIUM," the backend calls the Stripe API to create a Checkout Session with a 7-day free trial period. The user is redirected to Stripe's hosted payment page where they enter their card details. After confirming, Stripe sends a `checkout.session.completed` webhook to the `/subscriptions/webhook` endpoint.

The webhook handler verifies the Stripe signature, then updates the `joboss-subscriptions` DynamoDB table with the new plan, status (`TRIALING`), and the Stripe customer ID. The user's plan in the `joboss-users` table is also updated. When the trial ends, Stripe sends a `customer.subscription.updated` event and the status changes to `ACTIVE`.

If the user cancels, Stripe sends `customer.subscription.deleted` and the plan is downgraded to FREE. The user can cancel from the Profile page's Subscription tab — the cancellation takes effect at the end of the current billing period.

---

## Group 5 — Quota Enforcement

---

### F-13: Daily Swipe Quota Enforcement

**Actors:** User, System  
**Files:** `swipes/handler.py`, `LimitModal.jsx`, `SwipePage.jsx`

**Scenario:**

Each pricing tier has a daily swipe limit enforced at the Lambda level: FREE = 5, PREMIUM = 30, PREMIUM_PLUS = unlimited. The counter resets every day at midnight UTC.

When the app loads, the frontend calls `GET /quota` to fetch the user's current usage. A quota bar is displayed at the top of the swipe screen showing "X / Y swipes today" with a colour-coded progress fill (green → orange → red as the limit approaches).

When the user attempts to swipe and the limit is already reached, the Lambda returns a `429 LIMIT_REACHED` error. On the frontend, the remaining cards in the feed are blurred with a lock overlay and an upgrade button. A `LimitModal` appears showing when the quota resets (e.g., "Resets in 3 hours 12 minutes") and offering a plan upgrade.

The frontend also performs an optimistic update: the counter decrements immediately on swipe so rapid successive swipes feel instant. If the server returns a `429`, the optimistic update is rolled back.

Failed auto-apply attempts automatically refund the quota: the Lambda sets `quotaExempt: true` on the application and decrements `dailySwipeCount` so the user is not charged for an application the system could not complete.

---

## Group 6 — Administration

---

### F-14: Admin Dashboard & Statistics

**Actors:** Admin  
**Files:** `AdminPage.jsx`, `admin/handler.py`

**Scenario:**

Only users in the Cognito `ADMIN` group can access the `/admin` route. On every load, the frontend verifies admin status by decoding the JWT claims. If the user is not in the ADMIN group, they are silently redirected to `/swipe`.

Verified admins see a statistics dashboard with real-time platform-wide metrics: total registered users, breakdown by plan (FREE / PREMIUM / PREMIUM_PLUS), total jobs in the system, and application status breakdown (pending, success, failed). The stats are fetched by scanning all three DynamoDB tables and aggregating the counts in the Lambda.

The dashboard serves as the entry point to the User Management (F-15) and Job Management (F-16) panels, accessible via tabs.

---

### F-15: Admin User Management

**Actors:** Admin  
**Files:** `admin/handler.py`, `AdminPage.jsx`

**Scenario:**

The Users tab shows a searchable, sortable table of all registered users with their email, plan, creation date, and current status. Admins can sort by registration date, plan tier, or activity.

Available actions per user:

- **Change Plan:** Instantly upgrades or downgrades the user's subscription tier in DynamoDB, taking effect on their next API call.
- **Reset Quota:** Resets the user's `dailySwipeCount` to 0 and records a `quotaResetAt` timestamp. The system counts only swipes made after that timestamp, allowing the user to start fresh mid-day.
- **Block / Unblock:** Sets `status: "blocked"` on the user. The next time they open the app, their profile fetch returns `403 ACCOUNT_SUSPENDED` and they see the suspension screen (F-24).
- **Delete User:** After a confirmation dialog showing the user's email, deletes the user record and all associated applications, swipes, and resume files. Irreversible.
- **Grant / Revoke Admin:** Adds or removes the user from the Cognito ADMIN group. This action requires the performing admin to re-enter their own password to prevent privilege escalation.

---

### F-16: Admin Job Management

**Actors:** Admin  
**Files:** `admin/handler.py`, `jobs_importer/handler.py`, `AdminPage.jsx`

**Scenario:**

The Jobs tab shows a table of all jobs in the system, including inactive ones that were deactivated by the status checker. Admins can toggle any job's `active` flag — deactivated jobs disappear from all users' swipe feeds immediately.

A "Run Job Importer" button manually triggers the Telegram importer Lambda (F-17) outside its normal schedule. The button shows a loading spinner and on completion displays a toast: "N new jobs imported."

---

## Group 7 — Data Ingestion & Maintenance

---

### F-17: Job Importer — Telegram Channel

**Actors:** System (EventBridge scheduled trigger)  
**Files:** `jobs_importer/handler.py`, `job_description_ai/handler.py`

**Scenario:**

Every few hours, an EventBridge rule triggers the jobs importer Lambda. The Lambda connects to a curated Telegram channel using the Telethon library with a stored session string (no interactive login needed), and fetches the most recent 120 messages.

For each message, the system parses the job title, company name, location string, description text, and apply URL. Before inserting, it checks whether a record with the same `source_job_id` already exists in DynamoDB — duplicates are skipped.

New jobs go through two enrichment steps: (1) The location string is sent to Nominatim (OpenStreetMap) to obtain latitude and longitude coordinates for distance calculations. (2) The raw job description is sent to a dedicated Lambda that calls Claude Haiku via Bedrock to normalise it into the standard sections format (Summary, Responsibilities, Requirements, Technologies), removing recruiter boilerplate.

Each job is stored with an `expiresAt` timestamp 10 days in the future, allowing DynamoDB's TTL feature to auto-purge stale records.

---

### F-18: Job Status Monitoring & Cleanup

**Actors:** System (daily EventBridge trigger)  
**Files:** `jobs_status_checker/handler.py`

**Scenario:**

Once per day, a scheduled Lambda scans all jobs marked `active: true`. For each job, it sends an HTTP HEAD request to the job's apply URL with a 5-second timeout.

If the response is HTTP 404 or 410 (job removed), or if the request times out, the job is marked `active: false` with a `deactivatedReason` of `"url_dead"`. Jobs older than 30 days are deactivated with reason `"ttl_expired"` regardless of URL status. Jobs that respond with HTTP 200 remain active.

Deactivated jobs disappear from all users' swipe feeds without any data deletion — admins can still see them in the Job Management panel and reactivate them manually if needed.

---

## Group 8 — Integrations & Notifications

---

### F-19: Chrome Extension — ATS Auto-Fill

**Actors:** User  
**Files:** `chrome-extension/content.js`, `chrome-extension/popup.js`, `AuthExtensionPage.jsx`

**Scenario:**

The JoBoss Chrome extension is installed from the Chrome Web Store. Once authenticated (F-30 or F-31), the extension operates in two modes:

**Popup Mode:** The user opens the extension popup on any job application page and clicks "Fill Form." The popup fetches the user's profile from the JoBoss API and passes it to the content script, which fills in all detected fields and attaches the resume.

**Content Script Mode:** The content script is automatically injected into 15+ ATS platforms including SmartRecruiters, Lever, Greenhouse, Workday, Ashby, JobVite, Taleo, iCIMS, and LinkedIn. When a form is detected on the page, a floating "⚡ Fill with JoBoss" button is injected. Clicking it triggers the same fill sequence without opening the popup.

The fill sequence handles: first name, last name, full name, email, phone, city/location (with Hebrew→English translation), current company, LinkedIn URL, GitHub/portfolio URL, and resume file attachment. Gender dropdowns are also filled by matching option text to the stored gender preference.

---

### F-20: Email Notification (Amazon SES)

**Actors:** System → User  
**Files:** `auto-apply/handler.py` — `send_ses_email()`

**Scenario:**

After every Auto-Apply attempt, the system sends a transactional email to the user's registered address via Amazon SES.

**Success email:** Subject: "✅ Applied to [Job Title] at [Company]" — body confirms that JoBoss successfully submitted the application and encourages the user to check the Applications page to track their candidacy status.

**Failure email:** Subject: "⚠️ Auto-Apply could not complete for [Job Title]" — body explains the specific reason (e.g., "The ATS platform is not supported," "Form structure changed," "Timeout"), and includes a direct link to the original apply URL so the user can apply manually. The email also notes that no swipe quota was consumed for this failed attempt.

---

## Group 9 — Personal Dashboard & Settings

---

### F-21: Personal Dashboard

**Actors:** User  
**Files:** `DashboardPage.jsx`, `applications/handler.py`

**Scenario:**

The `/dashboard` page gives the user an instant overview of their entire job search. On load, it simultaneously fetches the user's profile and full applications list.

Four stat cards are displayed: total applications submitted, number accepted (green), number pending review (yellow), and number rejected (red). Below the cards, a quota widget shows how many swipes remain today displayed as a circular badge — green if plenty remain, red if near or at the limit — alongside a label explaining the plan tier.

FREE users see a prominent "Upgrade to Premium — Unlimited Applications" call-to-action button. Below all the widgets, a scrollable list shows the complete application history with each entry showing the company name, job title, submission date, and a colour-coded status badge.

---

### F-23: Edit Profile & Change Password

**Actors:** User  
**Files:** `ProfileModals.jsx`, `ProfilePage.jsx`, `users/handler.py`

**Scenario:**

From the profile avatar in the header, a dropdown menu offers four options: Edit Personal Details, Upload Profile Image, Change Password, and Sign Out.

**Edit Profile:** A bottom-sheet modal slides up with fields for first name, last name, and email. After saving, the Lambda updates the DynamoDB record. The frontend dispatches a `profile-updated` custom event that the Navbar and all other components listen to — the displayed name and email update everywhere simultaneously without a page reload.

**Change Password:** A separate bottom-sheet modal asks for the current password and the new password (minimum 8 characters). The new password is sent to AWS Amplify's `updatePassword()` function, which calls Cognito directly. If the current password is wrong, Cognito returns `NotAuthorizedException` and a Hebrew error message is shown. On success, the modal closes with a confirmation message.

---

### F-28: Show All Jobs Toggle

**Actors:** User  
**Files:** `ProfilePage.jsx`, `SwipePage.jsx`, `users/handler.py`

**Scenario:**

In the Profile → Preferences section, the user can enable a toggle labelled "Show All Jobs." When ON, this permanently disables preference-based filtering and shows every available job in the swipe feed regardless of role match or experience level.

The setting is saved both to `localStorage` (for immediate effect on the current device) and to DynamoDB (for persistence across devices and sessions). The SwipePage reads this flag on load: if `showAllJobsPref` is true, the `filteredJobs` array equals all unseen jobs rather than only the preference-matched subset.

When enabled, no "discovery mode" countdown banner is shown because there is nothing temporary about it. The toggle overrides the temporary 30-minute Discovery Mode (F-26). The user can turn it off at any time to return to personalised matching.

---

### F-29: GPS Location Auto-Detection

**Actors:** User  
**Files:** `ProfilePage.jsx` — `handleUseCurrentLocation()`, `LocationInput.jsx`

**Scenario:**

In the Location Preferences card on the Profile page, alongside the text-based location search field, there is a button: "Detect Current Location Automatically 📍." Tapping it calls the browser's `navigator.geolocation.getCurrentPosition()` API.

If the user has not previously granted location permission, the browser shows its standard permission prompt. If they deny it, an error message appears: "Location access was denied — allow it in your browser settings." If it times out (10-second limit), a different error message is shown.

On success, the received GPS coordinates are sent to Nominatim's reverse-geocoding endpoint (`/reverse?lat=...&lon=...`). The API returns a structured address from which the city name is extracted. The city name is displayed in the location field and the raw coordinates are stored in `localStorage` and in the user's DynamoDB record. These coordinates are then used by the matching algorithm (F-04) to calculate accurate distances to each job.

---

## Group 10 — Authentication Extended

---

### F-24: Account Suspension Screen

**Actors:** Suspended User, System  
**Files:** `App.jsx` — `SuspendedScreen`, `users/handler.py`

**Scenario:**

When an admin blocks a user's account (F-15), the `status` field in DynamoDB is set to `"blocked"`. The next time that user opens the app and their profile is fetched, the Lambda returns a `403` error with the code `ACCOUNT_SUSPENDED`.

The `App.jsx` startup routine catches this specific error, sets the `isSuspended` flag to true, and prevents the normal app UI from rendering entirely. Instead, the `SuspendedScreen` component is shown full-screen: the JoBoss logo, a Hebrew message explaining the account has been suspended by the JoBoss team, a mailto link to the support address (`joboss.appteam@gmail.com`), and a "Sign Out" button.

The user cannot navigate to any other route. Clicking "Sign Out" calls Amplify's `signOut()` and redirects to the Login page.

---

### F-25: Password Reset Flow

**Actors:** User (unauthenticated)  
**Files:** `LoginPage.jsx` — modes `forgot`, `forgotConfirm`

**Scenario:**

On the Login page, a "Forgot Password" link appears below the sign-in form. Clicking it switches the form to `forgot` mode, showing only an email input and a "Send Reset Code" button.

The user enters their registered email. The system calls Amplify's `resetPassword()`, which tells Cognito to send a 6-digit verification code to the address. A success message appears: "A reset code was sent to your email."

The form switches to `forgotConfirm` mode, showing three fields: the code, the new password, and confirmation. The user enters all three and submits. Amplify calls `confirmResetPassword()` with the code and new password.

If the code is wrong, Cognito returns `CodeMismatchException` and a Hebrew error appears. If the code has expired (codes are valid for 24 hours), `ExpiredCodeException` is returned with a prompt to request a new code. On success, a confirmation message appears — "Password reset successfully! Log in now" — and the form returns to normal login mode with the fields cleared.

---

## Group 11 — Swipe UX & Discovery

---

### F-22: Preference Mismatch Warning Modal

**Actors:** User  
**Files:** `MismatchWarningModal.jsx`, `SwipePage.jsx`

**Scenario:**

Jobs that do not match the user's declared role preferences or experience level are served with `matchesPreferences: false`. These cards display colour-coded domain and level tags (e.g., "DevOps", "Senior") so the user can immediately see why the job appears outside their usual feed.

When the user swipes RIGHT on such a job, a warning modal intercepts the action before it is recorded. The modal has an animated spring-in entrance and shows: a warning icon, the heading "This job may not be a match," a message explaining that the AI detected a significant gap between the user's background and the job's requirements, and a smaller note: "You can still proceed and receive a tailored CV as best as possible."

Two buttons are shown: "Cancel" (returns to the feed without recording anything) and "Continue Anyway" (proceeds with the normal LIKE flow as if no warning had appeared). This feature ensures users make informed decisions when applying to jobs outside their profile without blocking them from doing so.

---

### F-26: Discovery Mode — 30-Minute Window

**Actors:** User  
**Files:** `SwipePage.jsx` — `discoveryUntil`, `activateDiscovery()`, `DiscoveryPreview`

**Scenario:**

When the user has swiped through every preference-matched job in the current feed and no more primary-pool jobs remain, instead of showing an empty state, the system shows a special "Primary Feed Exhausted" screen.

This screen shows an animated search emoji, a message like "You've seen all jobs in your field," a count of remaining off-field jobs (e.g., "There are 18 more jobs from other domains"), and a preview widget showing the domains and levels available in the discovery pool (e.g., "DevOps", "QA", "Senior").

A prominent orange button reads: "Show Jobs Outside Your Field — Active for 30 minutes." Tapping it sets a `discoveryUntil` timestamp 30 minutes in the future, stored in `localStorage` for persistence across navigation. The feed immediately repopulates with all unseen jobs.

An orange banner appears at the top of the feed: "🔍 Showing all jobs · expires in 28 min" — updating every minute. When the 30 minutes expire, `setTimeout` fires, the timestamp is cleared, and the feed returns to preference-matched mode. This feature gives users more content to browse without permanently disabling their personalised feed.

---

### F-27: Match Score Breakdown Modal

**Actors:** User  
**Files:** `SwipePage.jsx` — `MatchModal`, `MatchBadge`

**Scenario:**

Every job card shows a small badge in the upper-left corner of the hero image showing the match score — for example "78% התאמה ℹ️" — colour-coded green (≥70%), orange (40–70%), or grey (<40%).

Tapping this badge (without swiping the card) opens the Match Score Breakdown Modal. The modal shows three scored rows, each with a horizontal progress bar:

1. **Role Match (score/50):** Shows which of the user's desired roles matched the job's keywords (green chips, e.g., "✓ Backend") and which didn't (red chips, e.g., "✗ Mobile"). If the score is low, a yellow hint box appears: "💡 Add these keywords to your CV to improve the score:" followed by the relevant missing keywords.

2. **Experience Level (score/30):** Shows the user's declared level (e.g., "Mid") versus the levels detected in the job description (e.g., "Senior, Lead"). If there is a mismatch and the score is 0, a red suggestion box advises the user to highlight relevant experience in their CV.

3. **Distance (score/20):** Shows the exact distance in kilometres between the user and the job (e.g., "4.3 km from your location") or "Remote — full score" if the job is remote.

The user can close the modal by tapping the X button or the backdrop, returning them to the card stack.

---

## Group 12 — Chrome Extension Advanced Features

---

### F-30: Chrome Extension — Direct Login (Cognito in Popup)

**Actors:** User  
**Files:** `chrome-extension/popup.js` — `cognitoLogin()`, `mapCognitoError()`

**Scenario:**

When the user opens the extension popup for the first time and is not authenticated, a login form is displayed directly inside the popup window — no new tab is opened. The user enters their JoBoss email and password and clicks "Login."

The popup calls Cognito's `InitiateAuth` REST endpoint directly with the `USER_PASSWORD_AUTH` flow. If successful, Cognito returns an `idToken`, `accessToken`, and `refreshToken`. The `idToken` is stored in `chrome.storage.local` for persistent sessions.

All Cognito error codes are translated to Hebrew messages: `NotAuthorizedException` → "Incorrect email or password", `UserNotFoundException` → "No account found with this email", `UserNotConfirmedException` → "Account not verified — check your email", `TooManyRequestsException` → "Too many attempts — try again shortly." After successful login, the popup fetches the user profile and switches to the main view.

---

### F-31: Chrome Extension — SSO Auth Bridge

**Actors:** User (already logged into JoBoss web app)  
**Files:** `popup.js` — `getTokenFromTabs()`, `background.js` — `onMessageExternal`, `AuthExtensionPage.jsx`

**Scenario:**

As a convenient alternative to entering credentials again (F-30), users who are already logged into the JoBoss web app in their browser can transfer their existing session to the extension with a single click.

The popup offers a "Login with JoBoss App" button. Clicking it opens the JoBoss app's `/auth-extension` page in a new tab. This page immediately reads the Cognito `idToken` from `localStorage` (scanning all keys for one containing "idToken") and sends it to the extension's background service worker via `chrome.runtime.sendMessage`.

The background worker stores the token in `chrome.storage.local` and acknowledges the message. The `/auth-extension` page can then display a "Connected!" confirmation and close automatically. The extension popup detects the new token, fetches the user profile, and shows the main view — the user is authenticated without having typed a single character.

---

### F-32: Chrome Extension — Tailored CV Selector

**Actors:** User (PREMIUM / PREMIUM_PLUS)  
**Files:** `chrome-extension/popup.js` — `loadCVSelector()`, `loadTailoredCV()`

**Scenario:**

When the user opens the extension popup while on a job application page, the extension attempts to match the current tab URL against the user's application history fetched from the API. It first tries an exact URL match, then a hostname match, and finally falls back to the most recently applied job.

If a tailored CV was generated for the matched job (F-09), the popup shows a radio-button selector with two options:

- ○ Original Resume (filename from profile)
- ● Tailored CV for this job (AI-generated)

The tailored CV option is pre-selected. The system requests a fresh 1-hour presigned S3 URL for the tailored file from the backend. This URL is stored as `_selectedCvPresignedUrl` in the popup's state.

When the user clicks "Fill Form," the selected CV URL is passed to the content script for attachment to the file input on the ATS page. FREE users see neither the selector nor the tailored option — they always get their standard active resume.

---

### F-33: Chrome Extension — Floating Fill Button (ATS Page Injection)

**Actors:** User  
**Files:** `chrome-extension/content.js` — `hasApplicationForm()`, `injectFillButton()`, `fillForm()`, `attachResumeFromUrl()`

**Scenario:**

The content script is injected at `document_idle` into pages on 15+ ATS domains listed in the extension's `manifest.json`. On load, `hasApplicationForm()` scans the DOM for signals that an application form is present: URL path keywords like "apply" or "application", a `<input type="file">` element, and at least one name or email field.

If a form is detected, a floating "⚡ Fill with JoBoss" button is injected into the bottom-right corner of the page. Clicking this button does not require opening the popup.

The content script requests the user profile from the background service worker, which fetches it from the API. It then runs the fill sequence:

- **Text fields:** Filled using CSS selector patterns for each field type (first name, last name, full name, email, phone, city, current company, LinkedIn URL, portfolio/GitHub URL). Each field is filled by setting the value and dispatching a native `input` event so React-controlled inputs update their state.
- **Location normalisation:** Hebrew city names (e.g., "תל אביב") are translated to English equivalents (e.g., "Tel Aviv") using a built-in city map before being inserted into location fields.
- **Gender dropdowns:** `<select>` elements with gender labels are detected and the option matching the stored gender is selected programmatically.
- **Resume attachment:** The resume PDF is fetched from the presigned S3 URL as a Blob, wrapped in a `File` object, inserted into a `DataTransfer` object, and assigned to the file input's `.files` property. A `change` event is dispatched to trigger the ATS's own upload handler.

After completion, the floating button shows a brief success indicator: "✅ Filled" before returning to its default state.

---

*JoBoss — Use Cases & Feature Scenarios | Version 1.0 | June 2026 | 33 Features · 12 Groups*
