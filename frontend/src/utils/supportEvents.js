// Fired after anything changes a support ticket's read/unread state, so the
// navbar badges refresh immediately instead of waiting for the next poll.
export const SUPPORT_UPDATED_EVENT = 'support-updated';

export function notifySupportChanged() {
  window.dispatchEvent(new Event(SUPPORT_UPDATED_EVENT));
}
