import { describe, it, expect } from 'vitest';
import { isStalePending, displayStatus, AUTO_APPLY_STALE_MS } from './autoApply';

// Fixed clock so the assertions don't drift with real time.
const NOW = new Date('2026-08-24T12:00:00Z').getTime();
const agoMs = ms => new Date(NOW - ms).toISOString();

describe('isStalePending', () => {
  it('treats a freshly dispatched pending record as in flight', () => {
    expect(isStalePending({ autoApplyStatus: 'pending', updatedAt: agoMs(30_000) }, NOW)).toBe(false);
  });

  it('still treats it as in flight just inside the window', () => {
    expect(isStalePending(
      { autoApplyStatus: 'pending', updatedAt: agoMs(AUTO_APPLY_STALE_MS - 1000) }, NOW,
    )).toBe(false);
  });

  // The bug this guards: a task killed by OOM/SIGKILL never writes its result,
  // so the record sat at 'pending' forever and the card spun with no way out.
  it('treats a pending record past the window as stalled', () => {
    expect(isStalePending(
      { autoApplyStatus: 'pending', updatedAt: agoMs(AUTO_APPLY_STALE_MS + 1000) }, NOW,
    )).toBe(true);
  });

  it('falls back to createdAt when the record was never updated', () => {
    expect(isStalePending(
      { autoApplyStatus: 'pending', createdAt: agoMs(AUTO_APPLY_STALE_MS * 2) }, NOW,
    )).toBe(true);
  });

  it('leaves a record with no usable timestamp alone', () => {
    expect(isStalePending({ autoApplyStatus: 'pending' }, NOW)).toBe(false);
    expect(isStalePending({ autoApplyStatus: 'pending', updatedAt: 'not-a-date' }, NOW)).toBe(false);
  });

  // Only 'pending' can stall this way — every other status is either terminal
  // or has its own staleness handling.
  it.each(['success', 'failed', 'manual', 'pending_tailoring'])(
    'never reports %s as stalled, however old', status => {
      expect(isStalePending({ autoApplyStatus: status, updatedAt: agoMs(AUTO_APPLY_STALE_MS * 10) }, NOW)).toBe(false);
    },
  );

  it('tolerates a missing record', () => {
    expect(isStalePending(undefined, NOW)).toBe(false);
  });
});

describe('displayStatus', () => {
  // The bug: "Auto-applied successfully" jobs showed "Waiting to apply".
  it('shows a successful auto-apply as Submitted, not Waiting to apply', () => {
    expect(displayStatus({ autoApplyStatus: 'success', status: 'SUBMITTED' })).toBe('REVIEWED');
    expect(displayStatus({ autoApplyStatus: 'success' })).toBe('REVIEWED');
  });

  it('never overrides a status the user set', () => {
    expect(displayStatus({ autoApplyStatus: 'success', status: 'INTERVIEW' })).toBe('INTERVIEW');
    expect(displayStatus({ autoApplyStatus: 'success', status: 'rejected' })).toBe('REJECTED');
  });

  it('leaves non-success records as they are', () => {
    expect(displayStatus({ autoApplyStatus: 'pending', status: 'SUBMITTED' })).toBe('SUBMITTED');
    expect(displayStatus({ status: 'SUBMITTED' })).toBe('SUBMITTED');
  });
});
