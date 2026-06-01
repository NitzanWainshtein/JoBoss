// Service worker — handles messages between popup and content scripts.

const API_BASE = "https://pi6i87ag1c.execute-api.us-east-1.amazonaws.com/prod";

// One-click login: the JoBoss /auth-extension page (whitelisted in
// externally_connectable) posts the user's Cognito idToken here.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type === "JOBOSS_AUTH" && message.token) {
    chrome.storage.local.set(
      { joboss_token: message.token, joboss_logged_out: false },
      () => sendResponse({ success: true })
    );
    return true; // async sendResponse
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_PROFILE") {
    fetchProfile(msg.token).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true; // keep channel open for async response
  }

  if (msg.type === "FETCH_TAILORED_CV") {
    fetchTailoredCV(msg.token, msg.jobId).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

async function fetchProfile(token) {
  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  return res.json();
}

async function fetchTailoredCV(token, jobId) {
  const res = await fetch(`${API_BASE}/tailor?jobId=${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`CV fetch failed: ${res.status}`);
  return res.json();
}
