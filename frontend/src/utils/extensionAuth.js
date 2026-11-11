// Rules for the extension SSO bridge (/auth-extension).
//
// The page used to take the extension id straight from the query string and
// hand it the user's Cognito idToken. Anything the user could be persuaded to
// click — ?ext=<some other extension> — would receive a live token, provided
// that extension declares this origin in its own externally_connectable list.
// So the id is now checked against a configured allowlist before the token is
// read at all.

// Chrome assigns every extension a 32-character id drawn from a-p (a base-16
// encoding of its key, mapped onto letters). Validating the shape means a
// malformed or injected value is rejected before it reaches sendMessage, and a
// typo'd entry in configuration cannot silently widen the allowlist.
const EXTENSION_ID_RE = /^[a-p]{32}$/;

/**
 * Parse VITE_EXTENSION_IDS (comma- or whitespace-separated) into valid ids.
 * Entries that are not well-formed extension ids are dropped rather than
 * trusted — a broken allowlist should narrow, never widen.
 */
export function parseAllowedExtensionIds(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[\s,]+/)
    .map(entry => entry.trim())
    .filter(entry => EXTENSION_ID_RE.test(entry));
}

/**
 * True only for an id that is well-formed AND on the allowlist.
 *
 * Fails closed: an empty allowlist permits nothing. That means a deploy without
 * VITE_EXTENSION_IDS disables the extension login rather than allowing every
 * extension — the opposite default would make the check decorative, since the
 * variable being unset is exactly the state nobody notices.
 */
export function isAllowedExtensionId(extId, allowed) {
  if (!extId || typeof extId !== 'string') return false;
  if (!EXTENSION_ID_RE.test(extId)) return false;
  return Array.isArray(allowed) && allowed.includes(extId);
}

/**
 * Find Amplify's stored idToken for this user pool client.
 *
 * Replaces a scan for any localStorage key containing 'idToken', which would
 * return whatever token-shaped value happened to be in storage — including one
 * written by unrelated code — and send it to the extension. This matches only
 * Amplify's own key shape for the configured client:
 *   CognitoIdentityServiceProvider.<clientId>.<username>.idToken
 *
 * It stays a fallback for the case where fetchAuthSession throws but a valid
 * session is still on disk; narrowing it is the point, not removing it.
 */
export function findAmplifyIdToken(storage, clientId) {
  if (!storage || !clientId) return null;
  const prefix = `CognitoIdentityServiceProvider.${clientId}.`;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix) && key.endsWith('.idToken')) {
        const value = storage.getItem(key);
        if (value) return value;
      }
    }
  } catch {
    // Storage can throw in private mode or with site data blocked.
  }
  return null;
}
