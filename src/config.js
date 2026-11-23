// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` declared in
// `gladys-assistant-integration.json`. The SDK fetches it (`gladys.getConfig()`)
// and announces every change (`gladys.onConfigUpdated()`). This module only
// provides the defaults and normalizes the received object, so the rest of the
// code never deals with `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

import { DEFAULT_COMPANY_KEY } from './dessmonitor/client.js';

// The platform refreshes its data every 5 minutes (1 minute with "collection
// acceleration"): reading more often only repeats the same values.
export const MIN_POLL_SECONDS = 60;
export const MAX_POLL_SECONDS = 3600;

// They MUST stay consistent with the `default` values of the manifest
// `config_schema` (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  company_key: DEFAULT_COMPANY_KEY,
  poll_frequency: 300,
  allow_control: false,
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const text = (value, fallback) =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const poll = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    username: text(raw.username, DEFAULT_CONFIG.username),
    // A password may start or end with a space: never trim it.
    password: typeof raw.password === 'string' ? raw.password : DEFAULT_CONFIG.password,
    company_key: text(raw.company_key, DEFAULT_CONFIG.company_key),
    poll_frequency: Number.isFinite(poll)
      ? Math.min(Math.max(Math.round(poll), MIN_POLL_SECONDS), MAX_POLL_SECONDS)
      : DEFAULT_CONFIG.poll_frequency,
    allow_control: raw.allow_control === true || raw.allow_control === 'true',
  };
}

/** Both credentials are filled in. */
export function isConfigured(config) {
  return Boolean(config.username && config.password);
}
