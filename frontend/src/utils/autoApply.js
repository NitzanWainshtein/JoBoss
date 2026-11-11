// Auto-apply status rules shared by the applications UI.

// An auto-apply record only leaves 'pending' when the Fargate bot writes its
// result as the very last thing it does. A task that dies hard (OOM, SIGKILL,
// or never scheduled at all) never gets there. The bot itself now records a
// terminal status on timeout and on SIGTERM, but a SIGKILL leaves no chance to
// — so past this window the UI treats the record as stalled rather than in
// flight, otherwise the card spins forever and the live-progress poll never
// stops.
//
// Generous on purpose: the bot's own cap is 4 minutes and the rest is queue
// time plus container start-up.
export const AUTO_APPLY_STALE_MS = 15 * 60 * 1000;

/**
 * True when a 'pending' record is old enough that nothing will ever advance it.
 * A record with no usable timestamp is left alone — a false "didn't complete"
 * is worse for the user than a slightly late one.
 */
export function isStalePending(app, now = Date.now()) {
  if (!app || app.autoApplyStatus !== 'pending') return false;
  const startedAt = new Date(app.updatedAt || app.createdAt || 0).getTime();
  if (!startedAt) return false;
  return now - startedAt >= AUTO_APPLY_STALE_MS;
}
