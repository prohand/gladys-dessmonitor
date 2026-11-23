import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('an empty config is the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(isConfigured(normalizeConfig()), false);
});

test('values typed in a form are normalized', () => {
  const config = normalizeConfig({
    username: '  jean ',
    password: ' secret ',
    company_key: '   ',
    poll_frequency: '120',
    allow_control: 'true',
  });
  assert.equal(config.username, 'jean');
  assert.equal(config.password, ' secret ', 'a password is never trimmed');
  assert.equal(config.company_key, DEFAULT_CONFIG.company_key, 'an empty key keeps the default');
  assert.equal(config.poll_frequency, 120);
  assert.equal(config.allow_control, true);
  assert.equal(isConfigured(config), true);
});

test('the refresh interval stays between one minute and one hour', () => {
  assert.equal(normalizeConfig({ poll_frequency: 5 }).poll_frequency, 60);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 300);
});

test('settings stay read-only unless explicitly allowed', () => {
  assert.equal(normalizeConfig({ allow_control: 'yes' }).allow_control, false);
  assert.equal(normalizeConfig({ allow_control: 1 }).allow_control, false);
});
