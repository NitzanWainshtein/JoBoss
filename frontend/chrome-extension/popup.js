const API_BASE = "https://pi6i87ag1c.execute-api.us-east-1.amazonaws.com/prod";

// ── Helpers ───────────────────────────────────────────────────────────────────

function show(id) { document.getElementById(id).style.display = ""; }
function hide(id) { document.getElementById(id).style.display = "none"; }

function setStatus(msg, type) {
  const el = document.getElementById("status-msg");
  el.textContent = msg;
  el.className = `status status-${type}`;
  el.style.display = "block";
  if (type === "success") setTimeout(() => (el.style.display = "none"), 3000);
}

// Read the Cognito JWT from the JoBoss app's localStorage via a content script
// injected into the active tab. Falls back to chrome.storage.
async function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["joboss_token"], ({ joboss_token }) => {
      if (joboss_token) { resolve(joboss_token); return; }

      // Try to pull the token from the active tab's localStorage
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) { resolve(null); return; }
        chrome.scripting
          .executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              // JoBoss stores the Cognito token under various Amplify keys
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.includes("idToken")) {
                  return localStorage.getItem(key);
                }
              }
              return null;
            },
          })
          .then((results) => {
            const token = results?.[0]?.result;
            if (token) chrome.storage.local.set({ joboss_token: token });
            resolve(token || null);
          })
          .catch(() => resolve(null));
      });
    });
  });
}

async function fetchProfile(token) {
  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();
  return data.user || data;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  const token = await getToken();

  if (!token) {
    hide("loading");
    show("login-view");
    return;
  }

  let profile;
  try {
    profile = await fetchProfile(token);
    chrome.storage.local.set({ joboss_profile: profile });
  } catch {
    hide("loading");
    show("login-view");
    return;
  }

  // Populate profile card
  const name = profile.fullName || profile.name ||
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "משתמש";
  const email = profile.email || "";
  const initial = name.charAt(0).toUpperCase();

  document.getElementById("profile-name").textContent  = name;
  document.getElementById("profile-email").textContent = email;
  document.getElementById("avatar").textContent        = initial;

  // Load tailored CV for current tab's job if available
  loadTailoredCV(token);

  hide("loading");
  show("main-view");
}

async function loadTailoredCV(token) {
  const cvEl = document.getElementById("cv-content");
  try {
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const url = tabs[0]?.url || "";

    // Extract jobId from URL query param or path segment (JoBoss internal format)
    const jobIdMatch = url.match(/jobId=([a-f0-9-]{36})/i) ||
                       url.match(/\/jobs\/([a-f0-9-]{36})/i);
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

// ── Fill button ───────────────────────────────────────────────────────────────

document.getElementById("fill-btn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) { setStatus("לא ניתן לגשת לדף", "error"); return; }
    chrome.tabs.sendMessage(tabs[0].id, { type: "FILL_FORM" }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not loaded on this page — inject manually
        chrome.scripting.executeScript(
          { target: { tabId: tabs[0].id }, files: ["content.js"] },
          () => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, { type: "FILL_FORM" });
              setStatus("✅ מילוי הופעל", "success");
            }, 500);
          }
        );
      } else {
        setStatus("✅ שדות מולאו", "success");
      }
    });
  });
});

init();
