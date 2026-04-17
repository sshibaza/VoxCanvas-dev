import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchHint } from '../../src/server/setup/hints.js';

describe('matchHint', () => {
  test('matches Partner Telephony license error', () => {
    const hint = matchHint('INVALID_TYPE: sObject type ConversationVendorInfo is not supported');
    assert.ok(hint);
    assert.match(hint, /Partner Telephony ライセンス/);
  });

  test('matches duplicate developer name', () => {
    const hint = matchHint('DUPLICATE_DEVELOPER_NAME: developer name is already in use');
    assert.match(hint, /同名.*Contact Center/);
  });

  test('matches missing permission set', () => {
    const hint = matchHint('Permission set "ContactCenterAdminExternalTelephony" does not exist');
    assert.match(hint, /Partner Telephony Permission Set/);
  });

  test('matches access denied', () => {
    const hint = matchHint('You do not have access to the requested resource');
    assert.match(hint, /権限不足/);
  });

  test('matches auth expired', () => {
    const hint = matchHint('No authorization information found for myorg');
    assert.match(hint, /認証切れ/);
  });

  test('returns null for unknown patterns', () => {
    assert.equal(matchHint('some random error'), null);
  });
});
