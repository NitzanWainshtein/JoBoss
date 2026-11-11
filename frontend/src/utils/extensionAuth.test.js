import { describe, it, expect } from 'vitest';
import {
  parseAllowedExtensionIds,
  isAllowedExtensionId,
  findAmplifyIdToken,
} from './extensionAuth';

// Real extension ids are 32 chars of a-p.
const MINE = 'abcdefghijklmnopabcdefghijklmnop';
const OTHER = 'ponmlkjihgfedcbaponmlkjihgfedcba';

describe('parseAllowedExtensionIds', () => {
  it('reads a single id', () => {
    expect(parseAllowedExtensionIds(MINE)).toEqual([MINE]);
  });

  it('reads several, comma or whitespace separated, ignoring stray spacing', () => {
    expect(parseAllowedExtensionIds(` ${MINE}, ${OTHER} `)).toEqual([MINE, OTHER]);
    expect(parseAllowedExtensionIds(`${MINE}\n${OTHER}`)).toEqual([MINE, OTHER]);
  });

  it('is empty when the variable is unset, so nothing is allowed by default', () => {
    expect(parseAllowedExtensionIds(undefined)).toEqual([]);
    expect(parseAllowedExtensionIds('')).toEqual([]);
  });

  it('drops malformed entries instead of trusting them', () => {
    // A broken allowlist must narrow, never widen.
    expect(parseAllowedExtensionIds(`${MINE}, not-an-id, ${'z'.repeat(32)}`)).toEqual([MINE]);
    expect(parseAllowedExtensionIds('*')).toEqual([]);
  });
});

describe('isAllowedExtensionId', () => {
  it('allows an id on the list', () => {
    expect(isAllowedExtensionId(MINE, [MINE])).toBe(true);
  });

  it('refuses a different extension — the actual attack', () => {
    // ?ext=<attacker's extension> must not receive the user's idToken.
    expect(isAllowedExtensionId(OTHER, [MINE])).toBe(false);
  });

  it('refuses everything when the allowlist is empty', () => {
    // Fails closed: an unset VITE_EXTENSION_IDS disables the flow rather than
    // permitting every extension.
    expect(isAllowedExtensionId(MINE, [])).toBe(false);
  });

  it('refuses a missing or malformed id without consulting the list', () => {
    for (const bad of [null, undefined, '', 'short', `${MINE}x`, 'ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP']) {
      expect(isAllowedExtensionId(bad, [MINE, bad])).toBe(false);
    }
  });

  it('refuses a wildcard even if configuration contains one', () => {
    expect(isAllowedExtensionId('*', ['*'])).toBe(false);
  });
});

describe('findAmplifyIdToken', () => {
  const CLIENT = '5o1mg9dtkh7kjuvqu145oafv00';

  function storageOf(entries) {
    const keys = Object.keys(entries);
    return {
      length: keys.length,
      key: i => keys[i],
      getItem: k => entries[k] ?? null,
    };
  }

  it("finds Amplify's token for the configured client", () => {
    const store = storageOf({
      [`CognitoIdentityServiceProvider.${CLIENT}.someone@example.com.idToken`]: 'the-token',
    });
    expect(findAmplifyIdToken(store, CLIENT)).toBe('the-token');
  });

  it('ignores a token belonging to a different user pool client', () => {
    const store = storageOf({
      'CognitoIdentityServiceProvider.someOtherClient.u.idToken': 'wrong-pool-token',
    });
    expect(findAmplifyIdToken(store, CLIENT)).toBeNull();
  });

  it('ignores unrelated keys that merely mention idToken', () => {
    // The old code scanned for any key containing 'idToken' and would have
    // handed this to the extension.
    const store = storageOf({
      'someLibrary.cachedIdToken': 'not-ours',
      debug_idToken_backup: 'also-not-ours',
    });
    expect(findAmplifyIdToken(store, CLIENT)).toBeNull();
  });

  it('ignores Amplify keys that are not the idToken', () => {
    const store = storageOf({
      [`CognitoIdentityServiceProvider.${CLIENT}.u.accessToken`]: 'access',
      [`CognitoIdentityServiceProvider.${CLIENT}.u.refreshToken`]: 'refresh',
    });
    expect(findAmplifyIdToken(store, CLIENT)).toBeNull();
  });

  it('returns null rather than throwing when storage is unavailable', () => {
    const hostile = {
      length: 1,
      key: () => { throw new Error('SecurityError'); },
      getItem: () => null,
    };
    expect(findAmplifyIdToken(hostile, CLIENT)).toBeNull();
    expect(findAmplifyIdToken(null, CLIENT)).toBeNull();
    expect(findAmplifyIdToken(storageOf({}), '')).toBeNull();
  });
});
