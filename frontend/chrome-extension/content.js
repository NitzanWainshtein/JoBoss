/**
 * JoBoss content script — injected into job application pages.
 * Detects form fields and fills them from the user's stored profile.
 * Also injects a floating "Fill with JoBoss" button when a form is detected.
 */

const FIELD_PATTERNS = {
  first_name: [
    "input[name*='first' i]", "input[id*='first' i]",
    "input[placeholder*='first name' i]", "input[autocomplete='given-name']",
  ],
  last_name: [
    "input[name*='last' i]", "input[id*='last' i]",
    "input[placeholder*='last name' i]", "input[autocomplete='family-name']",
  ],
  full_name: [
    "input[name='name']", "input[name='fullName']", "input[name='full_name']",
    "input[id*='fullname' i]", "input[placeholder*='full name' i]",
    "input[placeholder*='your name' i]", "input[autocomplete='name']",
  ],
  email: [
    "input[type='email']", "input[name*='email' i]",
    "input[id*='email' i]", "input[placeholder*='email' i]",
    "input[autocomplete='email']",
  ],
  phone: [
    "input[type='tel']", "input[name*='phone' i]",
    "input[id*='phone' i]", "input[placeholder*='phone' i]",
    "input[autocomplete='tel']",
  ],
};

function getStoredProfile(cb) {
  chrome.storage.local.get(["joboss_profile", "joboss_token"], cb);
}

function fillField(selector, value) {
  const el = document.querySelector(selector);
  if (!el || !value) return false;
  // Use native input setter so React/Angular state updates
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return true;
}

function tryFillFirst(patterns, value) {
  for (const sel of patterns) {
    if (fillField(sel, value)) return true;
  }
  return false;
}

function fillForm(profile) {
  if (!profile) return 0;
  let filled = 0;

  const nameParts = (profile.fullName || profile.name || "").split(" ");
  const firstName = profile.firstName || nameParts[0] || "";
  const lastName  = profile.lastName  || nameParts.slice(1).join(" ") || "";

  // Full name (try first, common on simple forms)
  if (tryFillFirst(FIELD_PATTERNS.full_name, `${firstName} ${lastName}`.trim())) filled++;

  // Split name fields (override if they exist)
  if (tryFillFirst(FIELD_PATTERNS.first_name, firstName)) filled++;
  if (tryFillFirst(FIELD_PATTERNS.last_name, lastName)) filled++;

  if (profile.email && tryFillFirst(FIELD_PATTERNS.email, profile.email)) filled++;
  if (profile.phone && tryFillFirst(FIELD_PATTERNS.phone, profile.phone)) filled++;

  return filled;
}

function hasApplicationForm() {
  return !!(
    document.querySelector("form") ||
    document.querySelector("input[type='email']") ||
    document.querySelector("input[name*='email' i]") ||
    document.querySelector("input[name='name']")
  );
}

// ── Floating button ───────────────────────────────────────────────────────────

function injectFillButton() {
  if (document.getElementById("joboss-fill-btn")) return;

  const btn = document.createElement("button");
  btn.id = "joboss-fill-btn";
  btn.innerHTML = "⚡ Fill with JoBoss";
  Object.assign(btn.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "2147483647",
    background: "linear-gradient(135deg, #6C4FD4, #1E2A4A)",
    color: "white",
    border: "none",
    borderRadius: "24px",
    padding: "12px 20px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    fontFamily: "system-ui, sans-serif",
    transition: "transform 0.15s ease",
  });

  btn.onmouseenter = () => (btn.style.transform = "scale(1.05)");
  btn.onmouseleave = () => (btn.style.transform = "scale(1)");

  btn.addEventListener("click", () => {
    getStoredProfile(({ joboss_profile }) => {
      if (!joboss_profile) {
        showToast("⚠️ Log in to JoBoss first", "error");
        return;
      }
      const count = fillForm(joboss_profile);
      showToast(count > 0 ? `✅ Filled ${count} field${count > 1 ? "s" : ""}` : "⚠️ No fields found", count > 0 ? "success" : "warn");
    });
  });

  document.body.appendChild(btn);
}

function showToast(message, type = "success") {
  const existing = document.getElementById("joboss-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "joboss-toast";
  const bg = type === "success" ? "#4CAF50" : type === "error" ? "#F44336" : "#FF9800";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "80px",
    right: "24px",
    zIndex: "2147483647",
    background: bg,
    color: "white",
    borderRadius: "12px",
    padding: "10px 18px",
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    fontFamily: "system-ui, sans-serif",
    opacity: "1",
    transition: "opacity 0.4s ease",
  });
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  if (hasApplicationForm()) {
    injectFillButton();
  }
}

// Run on load; also watch for dynamic SPA navigation
init();

const observer = new MutationObserver(() => {
  if (hasApplicationForm()) injectFillButton();
});
observer.observe(document.body, { childList: true, subtree: true });

// Listen for messages from popup (e.g. "fill now")
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "FILL_FORM") {
    getStoredProfile(({ joboss_profile }) => {
      fillForm(joboss_profile);
    });
  }
});
