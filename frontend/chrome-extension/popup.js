const API_BASE = "https://pi6i87ag1c.execute-api.us-east-1.amazonaws.com/prod";
const COGNITO_REGION = "us-east-1";
const COGNITO_CLIENT_ID = "5o1mg9dtkh7kjuvqu145oafv00";
const JOBOSS_HOST = "d231wno34rvped.cloudfront.net";

// ── View helpers ────────────────────────────────────────────────────────────

function show(id) { document.getElementById(id).style.display = ""; }
function hide(id) { document.getElementById(id).style.display = "none"; }

function showLogin() {
  hide("loading");
  hide("main-view");
  show("login-view");
}

function showMainView() {
  hide("loading");
  hide("login-view");
  show("main-view");
}

function setStatus(msg, type) {
  const el = document.getElementById("status-msg");
  el.textContent = msg;
  el.className = `status status-${type}`;
  el.style.display = "block";
  if (type === "success") setTimeout(() => (el.style.display = "none"), 3000);
}

function setLoginError(msg) {
  const el = document.getElementById("login-error");
  if (!msg) { el.style.display = "none"; return; }
  el.textContent = msg;
  el.style.display = "block";
}

// ── Token sources ───────────────────────────────────────────────────────────

function getCachedToken() {
  return new Promise((r) =>
    chrome.storage.local.get(["joboss_token"], ({ joboss_token }) => r(joboss_token || null))
  );
}

// Extract the Cognito idToken from a tab's localStorage (fallback path).
function extractTokenFromTab(tabId) {
  return chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes("idToken")) return localStorage.getItem(key);
        }
        return null;
      },
    })
    .then((results) => results?.[0]?.result || null)
    .catch(() => null);
}

// Scan any open JoBoss tab for an existing session (fallback when nothing cached).
async function getTokenFromTabs() {
  const tabs = await new Promise((r) =>
    chrome.tabs.query({ url: `https://${JOBOSS_HOST}/*` }, r)
  );
  for (const tab of tabs) {
    const token = await extractTokenFromTab(tab.id);
    if (token) {
      await new Promise((r) => chrome.storage.local.set({ joboss_token: token }, r));
      return token;
    }
  }
  return null;
}

// ── Cognito login (direct InitiateAuth, no new tab) ─────────────────────────

async function cognitoLogin(email, password) {
  const res = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.AuthenticationResult) {
    // Surface the Cognito __type so we can map it to a Hebrew message.
    const type = (data.__type || "").split("#").pop();
    const err = new Error(data.message || type || "Login failed");
    err.cognitoType = type;
    throw err;
  }

  return data.AuthenticationResult.IdToken;
}

function mapCognitoError(err) {
  switch (err.cognitoType) {
    case "NotAuthorizedException":   return "אימייל או סיסמה שגויים";
    case "UserNotFoundException":    return "המשתמש לא נמצא";
    case "UserNotConfirmedException":return "החשבון לא אומת. השלם אימות באתר JoBoss";
    case "InvalidParameterException":return "פרטי התחברות לא תקינים";
    case "TooManyRequestsException": return "יותר מדי ניסיונות. נסה שוב מאוחר יותר";
    default:                         return "שגיאה בהתחברות. נסה שוב";
  }
}

// ── Profile ─────────────────────────────────────────────────────────────────

async function fetchProfile(token) {
  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();
  return data.user || data;
}

function populateProfile(profile) {
  const name = profile.fullName || profile.name ||
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "משתמש";
  const email = profile.email || "";
  const initial = name.charAt(0).toUpperCase();

  document.getElementById("profile-name").textContent  = name;
  document.getElementById("profile-email").textContent = email;
  document.getElementById("avatar").textContent        = initial;
}

// Track which CV presigned URL to attach when filling. Defaults to the original.
let _selectedCvPresignedUrl = null;  // null = use original from profile

// Load token → profile → main view. Returns true on success, false otherwise.
async function loadProfileAndShow(token) {
  let profile;
  try {
    profile = await fetchProfile(token);
  } catch {
    return false;
  }

  await new Promise((r) => chrome.storage.local.set({ joboss_token: token, joboss_profile: profile }, r));
  _selectedCvPresignedUrl = null;
  populateProfile(profile);
  loadTailoredCV(token);
  loadCVSelector(token, profile);
  showMainView();
  return true;
}

// ── CV selector (Premium only) ────────────────────────────────────────────────
// Finds the application matching the current job page and renders a toggle if a
// tailored CV presigned URL is available.
async function loadCVSelector(token, profile) {
  const selectorEl = document.getElementById("cv-selector");
  if (!selectorEl) return;
  selectorEl.style.display = "none";
  _selectedCvPresignedUrl = null;

  // Plan check: use the subscription endpoint to get the real plan (not stale
  // profile.plan). Best-effort — if it fails we skip the selector silently.
  let isPremium = false;
  try {
    const subRes = await fetch(`${API_BASE}/subscriptions/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (subRes.ok) {
      const subData = await subRes.json();
      const planKey = (subData.planKey || subData.plan || "FREE").toUpperCase();
      isPremium = planKey !== "FREE";
    }
  } catch { /* silently skip */ }
  if (!isPremium) return;

  try {
    const tabs = await new Promise((r) => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const pageUrl = (tabs[0]?.url || "").toLowerCase();
    if (!pageUrl) return;

    const res = await fetch(`${API_BASE}/applications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const apps = data.applications || [];

    console.log("JoBoss CV selector — current URL:", pageUrl);
    console.log("JoBoss CV selector — jobApplyUrls:", apps.map(a => a.jobApplyUrl || "(none)"));

    // Pass 1: exact / substring URL match against jobApplyUrl.
    let match = apps.find(a => {
      const u = (a.jobApplyUrl || "").toLowerCase();
      return u && (pageUrl.includes(u) || u.includes(pageUrl));
    });

    // Pass 2: hostname match among applications that HAVE a tailored CV.
    // Useful when jobApplyUrl is populated but the paths differ, or when
    // multiple jobs from the same ATS are in play.
    if (!match) {
      let pageHost = "";
      try { pageHost = new URL(pageUrl).hostname; } catch { /* ignore */ }
      if (pageHost) {
        const tailoredApps = apps.filter(a => a.tailoredResumePresignedUrl);
        const hostMatch = tailoredApps.filter(a => {
          try { return new URL(a.jobApplyUrl || "").hostname === pageHost; } catch { return false; }
        });
        // Only auto-select if exactly one tailored CV for this site — avoids ambiguity.
        if (hostMatch.length === 1) match = hostMatch[0];
        else if (hostMatch.length > 1) {
          console.log("JoBoss CV selector — multiple tailored CVs for this host, skipping auto-select");
        }
      }
    }

    // Pass 3: if still no URL match, surface ANY tailored CV from the most recent
    // application for the current session as a best-effort fallback.
    // (Useful when jobApplyUrl is empty and the page is a known ATS.)
    if (!match) {
      const tailoredApps = apps.filter(a => a.tailoredResumePresignedUrl);
      if (tailoredApps.length === 1) {
        // Only one tailored CV total — unambiguous, show it.
        match = tailoredApps[0];
        console.log("JoBoss CV selector — single tailored CV fallback:", match.company);
      }
    }

    console.log("JoBoss CV selector — match:", match ? `${match.company} (tailored: ${!!match.tailoredResumePresignedUrl})` : "none");
    if (!match?.tailoredResumePresignedUrl) return;

    // We have a tailored CV for this job — render the selector.
    selectorEl.style.display = "flex";
    const presignedUrl = match.tailoredResumePresignedUrl;
    const originalUrl  = profile.resumePresignedUrl || "";

    // Sync the radio buttons with current selection.
    const radOriginal = document.getElementById("cv-radio-original");
    const radTailored = document.getElementById("cv-radio-tailored");
    if (!radOriginal || !radTailored) return;

    const syncSelection = () => {
      _selectedCvPresignedUrl = radTailored.checked ? presignedUrl : originalUrl;
    };
    radOriginal.addEventListener("change", syncSelection);
    radTailored.addEventListener("change", syncSelection);

    // Default to tailored.
    radTailored.checked = true;
    _selectedCvPresignedUrl = presignedUrl;
  } catch {
    // Silently ignore — CV selector is optional.
  }
}

async function loadTailoredCV(token) {
  const cvEl = document.getElementById("cv-content");
  try {
    const tabs = await new Promise((r) => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const url = tabs[0]?.url || "";

    const jobIdMatch = url.match(/jobId=([a-f0-9-]{36})/i) || url.match(/\/jobs\/([a-f0-9-]{36})/i);
    if (!jobIdMatch) return;

    const jobId = jobIdMatch[1];
    const res = await fetch(`${API_BASE}/tailor?jobId=${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const cvText = data.tailoredResume || data.cv || data.content;
    if (cvText) {
      cvEl.className = "cv-box";
      cvEl.textContent = cvText;
    }
  } catch {
    // Silently ignore — tailored CV is optional
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────

async function init() {
  // Respect an explicit logout: skip the tab-scan fallback entirely so an
  // open JoBoss session can't silently re-authenticate the user.
  const { joboss_logged_out } = await new Promise((r) =>
    chrome.storage.local.get(["joboss_logged_out"], r)
  );
  if (joboss_logged_out) { showLogin(); return; }

  // 1. Cached token (from a previous in-popup login).
  let token = await getCachedToken();
  // 2. Fallback: an existing JoBoss tab session.
  if (!token) token = await getTokenFromTabs();

  if (!token) { showLogin(); return; }

  const ok = await loadProfileAndShow(token);
  if (!ok) {
    // Stale/expired token — drop it and show the login form.
    await new Promise((r) => chrome.storage.local.remove(["joboss_token", "joboss_profile"], r));
    showLogin();
  }
}

// ── Login form handler ──────────────────────────────────────────────────────

async function doLogin() {
  const btn = document.getElementById("login-btn");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  setLoginError("");
  if (!email || !password) { setLoginError("יש למלא אימייל וסיסמה"); return; }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "מתחבר...";

  try {
    const token = await cognitoLogin(email, password);
    // Explicit login clears the logout flag so the session is restored normally.
    await new Promise((r) => chrome.storage.local.remove(["joboss_logged_out"], r));
    const ok = await loadProfileAndShow(token);
    if (!ok) setLoginError("ההתחברות הצליחה אך טעינת הפרופיל נכשלה");
  } catch (err) {
    setLoginError(mapCognitoError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function doLogout() {
  // Persist an explicit-logout flag so the tab-scan fallback on next open
  // doesn't silently re-authenticate from an open JoBoss session.
  chrome.storage.local.set({ joboss_logged_out: true }, () => {
    chrome.storage.local.remove(["joboss_token", "joboss_profile"], () => {
      document.getElementById("login-email").value = "";
      document.getElementById("login-password").value = "";
      setLoginError("");
      showLogin();
    });
  });
}

// ── Wire up ─────────────────────────────────────────────────────────────────

document.getElementById("login-btn").addEventListener("click", doLogin);
document.getElementById("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});
document.getElementById("logout-btn").addEventListener("click", doLogout);

// One-click login via the JoBoss app: open the auth bridge page, passing this
// extension's own ID so the page knows where to send the token back.
document.getElementById("sso-btn").addEventListener("click", () => {
  const url = `https://${JOBOSS_HOST}/auth-extension?ext=${chrome.runtime.id}`;
  chrome.tabs.create({ url });
  // The popup closes when the new tab opens; on reopen, init() reads the cached
  // token. The storage listener below also updates the view if the popup stays open.
});

// If the auth bridge stores a token while the popup is still open, switch to the
// profile view instantly.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.joboss_token && changes.joboss_token.newValue) {
    loadProfileAndShow(changes.joboss_token.newValue);
  }
});

document.getElementById("fill-btn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) { setStatus("לא ניתן לגשת לדף", "error"); return; }
    // Pass the selected CV presigned URL so content.js can attach the right PDF.
    const msg = { type: "FILL_FORM" };
    if (_selectedCvPresignedUrl) msg.cvPresignedUrl = _selectedCvPresignedUrl;
    chrome.tabs.sendMessage(tabs[0].id, msg, (res) => {
      if (chrome.runtime.lastError) {
        setStatus("⚠️ עמוד זה אינו נתמך", "warn");
        return;
      }
      const count = res?.count || 0;
      if (count > 0) {
        setStatus(`✅ ${count} שדות מולאו`, "success");
      } else if (res && res.hasForm === false) {
        setStatus("⚠️ עמוד זה אינו נתמך", "warn");
      } else {
        setStatus("⚠️ לא נמצאו שדות למילוי", "warn");
      }
    });
  });
});

init();
