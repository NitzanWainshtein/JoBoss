/**
 * JoBoss content script — injected into job application pages.
 * Detects form fields and fills them from the user's stored profile.
 * Also injects a floating "Fill with JoBoss" button when a form is detected.
 */

(() => {
  if (window.__jobossFillLoaded) return;
  window.__jobossFillLoaded = true;

const FIELD_PATTERNS = {
  // Email is intentionally strict — only true email inputs, never generic text fields.
  email: [
    "input[type='email']",
    "input[name='email' i]", "input[name='e-mail' i]", "input[name='emailAddress' i]",
    "input[autocomplete='email']",
    "input[id='email' i]",
  ],
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
  phone: [
    "input[type='tel']", "input[name*='phone' i]",
    "input[id*='phone' i]", "input[placeholder*='phone' i]",
    "input[autocomplete='tel']",
  ],
  location: [
    "input[name*='location' i]", "input[id*='location' i]",
    "input[name*='city' i]", "input[id*='city' i]",
    "input[placeholder*='location' i]", "input[placeholder*='city' i]",
    "input[autocomplete='address-level2']",
  ],
  company: [
    "input[name*='company' i]", "input[id*='company' i]",
    "input[name*='employer' i]", "input[id*='employer' i]",
    "input[placeholder*='company' i]", "input[placeholder*='employer' i]",
    "input[autocomplete='organization']",
  ],
  linkedin: [
    "input[name*='linkedin' i]", "input[id*='linkedin' i]",
    "input[placeholder*='linkedin' i]",
  ],
  website: [
    "input[name*='github' i]", "input[name*='website' i]",
    "input[name*='portfolio' i]", "input[id*='website' i]",
    "input[placeholder*='github' i]", "input[placeholder*='website' i]",
  ],
};

const GENDER_PATTERNS = [
  "select[name*='gender' i]", "select[id*='gender' i]",
  "select[name*='sex' i]", "select[id*='sex' i]",
];

// Map common Israeli city names (Hebrew) to their English equivalents.
const CITY_MAP = {
  'תל אביב': 'Tel Aviv', 'ירושלים': 'Jerusalem', 'חיפה': 'Haifa',
  'באר שבע': 'Beer Sheva', 'נתניה': 'Netanya', 'פתח תקווה': 'Petah Tikva',
  'ראשון לציון': 'Rishon LeZion', 'הרצליה': 'Herzliya', 'רמת גן': 'Ramat Gan',
  'כפר סבא': 'Kfar Saba', 'רעננה': 'Raanana', 'חולון': 'Holon',
  'בני ברק': 'Bnei Brak', 'אשדוד': 'Ashdod', 'אשקלון': 'Ashkelon',
};

// Normalize a location to a short English form. Takes the first segment
// (city, before any comma), maps Hebrew → English, leaves English as-is.
function normalizeLocation(value) {
  if (!value || typeof value !== "string") return "";
  const city = value.split(",")[0].trim();
  return CITY_MAP[city] || city;
}

function looksLikeEmail(value) {
  return typeof value === "string" && /\S+@\S+\.\S+/.test(value);
}

function getStoredProfile(cb) {
  chrome.storage.local.get(["joboss_profile", "joboss_token"], cb);
}

const _nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

function fillInput(input, value) {
  _nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function describeEl(el) {
  if (!el) return "(none)";
  return `<input name="${el.name || ""}" id="${el.id || ""}" type="${el.type || ""}" placeholder="${el.placeholder || ""}">`;
}

function fillField(selector, value) {
  const el = document.querySelector(selector);
  if (!el || !value) return false;
  fillInput(el, value);
  return true;
}

function tryFillFirst(fieldName, patterns, value) {
  if (!value) {
    console.log(`JoBoss skip: ${fieldName} (no value)`);
    return false;
  }
  for (const sel of patterns) {
    const el = document.querySelector(sel);
    if (el) {
      console.log(`JoBoss filling: ${fieldName} = "${value}" via selector "${sel}" → ${describeEl(el)}`);
      fillInput(el, value);
      return true;
    }
  }
  return false;
}

// Fill a <select> by matching option text against the value.
function fillSelect(selector, value) {
  const el = document.querySelector(selector);
  if (!el || !value) return false;
  const option = Array.from(el.options).find(o =>
    o.text.toLowerCase().includes(value.toLowerCase())
  );
  if (!option) return false;
  el.value = option.value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  console.log(`JoBoss filling: gender = "${value}" → option "${option.text}"`);
  return true;
}

function tryFillSelect(fieldName, patterns, value) {
  if (!value) return false;
  for (const sel of patterns) {
    if (fillSelect(sel, value)) return true;
  }
  return false;
}

function fillForm(profile) {
  if (!profile) return 0;
  console.log("JoBoss profile:", profile);
  let filled = 0;

  const rawName = profile.fullName || profile.name || "";
  // Guard: never use an email-looking value as a name (common bad-data case).
  const safeName = looksLikeEmail(rawName) ? "" : rawName;
  if (rawName && !safeName) {
    console.warn("JoBoss: profile name looks like an email, skipping name fill:", rawName);
  }
  const nameParts = safeName.split(" ");
  const firstName = (profile.firstName && !looksLikeEmail(profile.firstName)) ? profile.firstName : (nameParts[0] || "");
  const lastName  = (profile.lastName && !looksLikeEmail(profile.lastName)) ? profile.lastName : (nameParts.slice(1).join(" ") || "");

  // Location: prefer CV-extracted currentLocation, fall back to preferredLocation, then skip.
  // Always normalized to a short English city form.
  const location = normalizeLocation(profile.currentLocation || profile.preferredLocation || "");

  // Company: only fill if Bedrock confidently marked a CURRENT employer. Empty/null → skip.
  const company  = (profile.currentCompany || "").trim();
  const website  = profile.githubUrl || profile.websiteUrl || "";

  if (tryFillFirst("full_name", FIELD_PATTERNS.full_name, `${firstName} ${lastName}`.trim())) filled++;
  if (tryFillFirst("first_name", FIELD_PATTERNS.first_name, firstName)) filled++;
  if (tryFillFirst("last_name", FIELD_PATTERNS.last_name, lastName)) filled++;
  if (tryFillFirst("email", FIELD_PATTERNS.email, profile.email)) filled++;
  if (tryFillFirst("phone", FIELD_PATTERNS.phone, profile.phone)) filled++;
  if (tryFillFirst("location", FIELD_PATTERNS.location, location)) filled++;
  if (company && tryFillFirst("company", FIELD_PATTERNS.company, company)) filled++;
  if (tryFillFirst("linkedin", FIELD_PATTERNS.linkedin, profile.linkedinUrl)) filled++;
  if (tryFillFirst("website", FIELD_PATTERNS.website, website)) filled++;
  if (tryFillSelect("gender", GENDER_PATTERNS, profile.gender)) filled++;

  // Best-effort resume attachment (async — does not affect the count).
  attachResume(profile).catch(e => console.warn("JoBoss resume attach failed:", e));

  return filled;
}

// Download the user's resume PDF and attach it to a file input on the page.
async function attachResume(profile) {
  // Prefer the presigned HTTPS URL (s3:// URLs can't be fetched from the browser).
  const resumeUrl = profile.resumePresignedUrl || profile.resumeUrl || "";
  if (!resumeUrl || !/^https?:\/\//i.test(resumeUrl)) {
    if (resumeUrl) console.log("JoBoss: resume URL is not directly fetchable, skipping attach:", resumeUrl);
    return;
  }

  const fileInput = document.querySelector("input[type='file']");
  if (!fileInput) {
    console.log("JoBoss: no file input found on page");
    return;
  }

  const res = await fetch(resumeUrl);
  if (!res.ok) throw new Error(`resume fetch ${res.status}`);
  const blob = await res.blob();

  const fileName = (profile.resumeFileName || "resume.pdf").replace(/[^\w.\-]/g, "_");
  const file = new File([blob], fileName, { type: blob.type || "application/pdf" });

  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  console.log("JoBoss: attached resume", fileName, "to", describeEl(fileInput));
}

// Signals that this is a genuine job application page. Require >= 2 to show the button.
const JOB_URL_KEYWORDS = [
  "job", "career", "apply", "position", "vacancy", "opening", "recruitment",
  "greenhouse", "lever", "workday", "smartrecruiters", "ashby", "bamboohr",
];
const JOB_TEXT_KEYWORDS = ["apply", "application", "resume", "cv", "job", "position", "career"];

function hasApplicationForm() {
  let signals = 0;

  // 1. URL contains a job/ATS keyword.
  const url = location.href.toLowerCase();
  if (JOB_URL_KEYWORDS.some(k => url.includes(k))) signals++;

  // 2. Resume / file upload field present.
  if (document.querySelector("input[type='file']")) signals++;

  // 3. Name field AND email field together.
  const hasName = !!document.querySelector(
    "input[name*='name' i], input[id*='name' i], input[autocomplete='name'], input[autocomplete='given-name']"
  );
  const hasEmail = !!document.querySelector(
    "input[type='email'], input[name*='email' i], input[id*='email' i], input[autocomplete='email']"
  );
  if (hasName && hasEmail) signals++;

  // 4. Title / headings mention apply / application / resume / job terms.
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map(h => h.textContent || "")
    .join(" ");
  const text = `${document.title} ${headings}`.toLowerCase();
  if (JOB_TEXT_KEYWORDS.some(k => text.includes(k))) signals++;

  return signals >= 2;
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
      showToast(
        count > 0 ? `✅ Filled ${count} field${count > 1 ? "s" : ""}` : "⚠️ No fields found",
        count > 0 ? "success" : "warn"
      );
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

function removeFillButton() {
  const btn = document.getElementById("joboss-fill-btn");
  if (btn) btn.remove();
}

// ── Init ──────────────────────────────────────────────────────────────────────

// Re-evaluate on every DOM change: show the button only when the page still
// qualifies as a job application, and remove it when it no longer does
// (e.g. SPA navigation away from the form).
function syncFillButton() {
  if (hasApplicationForm()) injectFillButton();
  else removeFillButton();
}

syncFillButton();

let _syncScheduled = false;
const observer = new MutationObserver(() => {
  // Debounce: coalesce bursts of mutations into one stricter re-check.
  if (_syncScheduled) return;
  _syncScheduled = true;
  setTimeout(() => { _syncScheduled = false; syncFillButton(); }, 400);
});
observer.observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FILL_FORM") {
    getStoredProfile(({ joboss_profile }) => {
      const count = fillForm(joboss_profile);
      // Report back so the popup can show the right toast: success if anything
      // was filled, "unsupported" only when nothing filled AND no form present.
      sendResponse({ count, hasForm: hasApplicationForm() });
    });
    return true; // keep the channel open for the async sendResponse
  }
});

})();
