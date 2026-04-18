import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifySfStderr } from '../../src/server/routes/setup.js';

describe('classifySfStderr', () => {
  test('demotes the sf CLI update notice to warn (used to surface as a red ERROR in the wizard log)', () => {
    // Real-world line captured from a successful deploy:
    //   " ›   Warning: @salesforce/cli update available from 2.124.7 to 2.130.9."
    assert.equal(classifySfStderr(' ›   Warning: @salesforce/cli update available from 2.124.7 to 2.130.9.'), 'warn');
    assert.equal(classifySfStderr('Warning: @salesforce/cli update available from 2.124.7 to 2.130.9.'), 'warn');
  });

  test('demotes generic "Warning:" lines to warn', () => {
    assert.equal(classifySfStderr('Warning: something non-fatal happened'), 'warn');
    assert.equal(classifySfStderr(' >   Warning: this is informational'), 'warn');
  });

  test('keeps anything else on stderr at error level', () => {
    assert.equal(classifySfStderr('Error: deploy failed'), 'error');
    assert.equal(classifySfStderr('ENOENT: no such file'), 'error');
    assert.equal(classifySfStderr(''), 'error');
  });
});
