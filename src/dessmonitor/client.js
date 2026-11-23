// -----------------------------------------------------------------------------
// DessMonitor cloud client.
//
// DessMonitor (dessmonitor.com, the SmartESS / Eybond datalogger cloud) is the
// ShineMonitor platform under another host. Every call is one signed GET on
// `https://api.dessmonitor.com/public/`:
//
//   ?sign=<sha1>&salt=<ms timestamp>[&token=<token>]&action=<name>&<params...>
//
// - login (`authSource`): sign = SHA-1(salt + SHA-1(password) + actionString),
//   answered with `{ token, secret, expire }` (seconds, about 7 days);
// - every other call: sign = SHA-1(salt + secret + token + actionString).
//
// `actionString` is `&action=<name>&k=v...` EXACTLY as sent on the wire: the
// values are percent-encoded before signing. Signing the raw value while
// sending the encoded one makes the platform answer ERR_SIGN (or
// ERR_PASSWORD_VERIF_FAIL on login) for any account with a space or a reserved
// character in its username.
//
// Answers are `{ err, desc, dat }`: `err: 0` is success, anything else an
// error code of the platform (see ERROR_CODES).
//
// Secrets: the password, the token, the secret and the signed URL are never
// logged nor put into an error message.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'dessmonitor' });

export const API_BASE_URL = 'https://api.dessmonitor.com/public/';
export const DEFAULT_COMPANY_KEY = 'bnrl_frRFjEz8Mkn';
const REQUEST_TIMEOUT_MS = 30_000;
// Renew a little before the platform does, so a request never races the expiry.
const TOKEN_MARGIN_S = 300;

const APP_ID = 'gladys-dessmonitor';
const APP_VERSION = '1';

/** Error codes of the platform this integration reacts to. */
export const ERROR_CODES = {
  NONE: 0,
  SIGN: 4,
  NO_AUTH: 10,
  NO_PERMISSION: 11,
  NO_RECORD: 12,
  NOT_FOUND_COMPANY_KEY: 15,
  PASSWORD_VERIF_FAIL: 16,
  USR_DISABLED: 25,
  NOT_FOUND_USR: 261,
  DEVICE_OFFLINE: 262,
  COLLECTOR_OFFLINE: 263,
};

// A token the platform no longer accepts: log in again once and retry.
const TOKEN_REJECTED = new Set([ERROR_CODES.SIGN, ERROR_CODES.NO_AUTH]);
// The account itself is refused: retrying with the same credentials is useless.
const CREDENTIALS_REJECTED = new Set([
  ERROR_CODES.NOT_FOUND_COMPANY_KEY,
  ERROR_CODES.PASSWORD_VERIF_FAIL,
  ERROR_CODES.USR_DISABLED,
  ERROR_CODES.NOT_FOUND_USR,
]);

/** An error of the platform (`code` set) or of the transport (`code` null). */
export class DessMonitorError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'DessMonitorError';
    this.code = code;
  }

  /** The username, password or company key is refused. */
  get isCredentials() {
    return CREDENTIALS_REJECTED.has(this.code);
  }
}

export function sha1(text) {
  return createHash('sha1').update(text, 'utf8').digest('hex');
}

/**
 * Python's `quote_plus`: what the platform decodes. `encodeURIComponent`
 * leaves `!'()*` alone, the platform's decoder does not care, but the
 * signature is computed on the bytes sent, so encode them too and keep one
 * single spelling.
 */
export function quotePlus(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

/** `&action=<action>&k=v...`, values encoded: the signed AND sent string. */
export function buildActionString(action, params = {}) {
  let text = `&action=${action}`;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    text += `&${key}=${quotePlus(value)}`;
  }
  return text;
}

/** Hide all but the first characters of an identifier, for the logs. */
export function mask(value) {
  const text = String(value ?? '').trim();
  return text.length <= 3 ? '***' : `${text.slice(0, 3)}***`;
}

export class DessMonitorClient {
  /**
   * @param {object} options
   * @param {string} options.username DessMonitor account
   * @param {string} options.password DessMonitor password (never logged)
   * @param {string} [options.companyKey] the platform's manufacturer key
   * @param {string} [options.baseUrl]
   * @param {typeof fetch} [options.fetch] injected in the tests
   * @param {() => number} [options.now] ms clock, injected in the tests
   */
  constructor({
    username,
    password,
    companyKey = DEFAULT_COMPANY_KEY,
    baseUrl = API_BASE_URL,
    fetch: fetchImpl = globalThis.fetch,
    now = Date.now,
  }) {
    this.username = username;
    this.password = password;
    this.companyKey = companyKey || DEFAULT_COMPANY_KEY;
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
    this.now = now;
    this.session = null; // { token, secret, expiresAt (ms) }
    this.loggingIn = null;
  }

  get configured() {
    return Boolean(this.username && this.password);
  }

  /** Forget the token: the next call logs in again. */
  logout() {
    this.session = null;
  }

  async login() {
    // Concurrent polls share one login instead of racing for tokens.
    if (!this.loggingIn) {
      this.loggingIn = this.doLogin().finally(() => {
        this.loggingIn = null;
      });
    }
    return this.loggingIn;
  }

  async doLogin() {
    if (!this.configured) {
      throw new DessMonitorError('Missing username or password', ERROR_CODES.PASSWORD_VERIF_FAIL);
    }
    this.session = null;
    const salt = String(this.now());
    const actionString = buildActionString('authSource', {
      usr: this.username,
      'company-key': this.companyKey,
      source: 1,
      _app_client_: 'web',
      _app_id_: APP_ID,
      _app_version_: APP_VERSION,
    });
    const sign = sha1(`${salt}${sha1(this.password)}${actionString}`);
    const answer = await this.send('authSource', `?sign=${sign}&salt=${salt}${actionString}`);
    const { token, secret, expire } = answer.dat ?? {};
    if (typeof token !== 'string' || !token || typeof secret !== 'string' || !secret) {
      throw new DessMonitorError('Invalid login answer');
    }
    const lifetime = Number.isFinite(Number(expire)) && Number(expire) > 0 ? Number(expire) : 3600;
    this.session = {
      token,
      secret,
      expiresAt: this.now() + Math.max(lifetime - TOKEN_MARGIN_S, 60) * 1000,
    };
    logger.info(`Logged in to DessMonitor as ${mask(this.username)} (token valid ${lifetime} s)`);
    return this.session;
  }

  /**
   * Call one action, logging in first when needed. A token the platform
   * refuses (ERR_SIGN, ERR_NO_AUTH) is renewed once and the call retried.
   * @returns {Promise<any>} the `dat` of the answer
   */
  async call(action, params = {}) {
    try {
      return await this.callOnce(action, params);
    } catch (err) {
      if (err instanceof DessMonitorError && TOKEN_REJECTED.has(err.code)) {
        logger.info(`Token refused on ${action}, logging in again`);
        this.session = null;
        return this.callOnce(action, params);
      }
      throw err;
    }
  }

  async callOnce(action, params) {
    if (!this.session || this.now() >= this.session.expiresAt) {
      await this.login();
    }
    const { token, secret } = this.session;
    const salt = String(this.now());
    const actionString = buildActionString(action, params);
    const sign = sha1(`${salt}${secret}${token}${actionString}`);
    const answer = await this.send(
      action,
      `?sign=${sign}&salt=${salt}&token=${token}${actionString}`,
    );
    return answer.dat;
  }

  async send(action, query) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${query}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
    } catch (err) {
      // The cause carries the signed URL: keep only its kind.
      const kind = err?.name === 'TimeoutError' ? 'timed out' : `failed (${err?.name ?? 'Error'})`;
      throw new DessMonitorError(`Request ${action} ${kind}`);
    }
    if (!response.ok) {
      throw new DessMonitorError(`Request ${action} answered HTTP ${response.status}`);
    }
    let answer;
    try {
      answer = await response.json();
    } catch {
      throw new DessMonitorError(`Request ${action} answered an invalid JSON`);
    }
    const code = Number(answer?.err ?? 0);
    if (code !== ERROR_CODES.NONE) {
      throw new DessMonitorError(`${action}: ${answer?.desc ?? `error ${code}`} (${code})`, code);
    }
    return answer;
  }

  // --- Platform actions ------------------------------------------------------

  /** The plants (projects) of the account. */
  async queryPlants() {
    try {
      const dat = await this.call('queryPlants', { page: 0, pagesize: 50 });
      return asList(dat?.plant);
    } catch (err) {
      if (err.code === ERROR_CODES.NO_RECORD) {
        return [];
      }
      throw err;
    }
  }

  /** The dataloggers of a plant, every page. */
  async queryCollectors(pid) {
    const collectors = [];
    for (let page = 0; page < 20; page += 1) {
      let dat;
      try {
        dat = await this.call('webQueryCollectorsEs', { pid, page, pagesize: 50 });
      } catch (err) {
        if (err.code === ERROR_CODES.NO_RECORD) {
          break;
        }
        throw err;
      }
      const batch = asList(dat?.collector);
      collectors.push(...batch);
      const total = Number(dat?.total);
      if (batch.length < 50 || (total > 0 && collectors.length >= total)) {
        break;
      }
    }
    return collectors;
  }

  /** The devices (inverters) behind one datalogger. */
  async queryCollectorDevices(pn) {
    try {
      const dat = await this.call('queryCollectorDevices', { pn });
      return asList(dat?.dev);
    } catch (err) {
      if (err.code === ERROR_CODES.NO_RECORD) {
        return [];
      }
      throw err;
    }
  }

  /** Device summaries of a plant: alias, status, output power, energy. */
  async queryPlantDevices(pid) {
    try {
      const dat = await this.call('webQueryDeviceEs', { pid, page: 0, pagesize: 50 });
      return asList(dat?.device);
    } catch (err) {
      if (err.code === ERROR_CODES.NO_RECORD) {
        return [];
      }
      throw err;
    }
  }

  /** Latest readings of a device: `[{ title, val, unit }]`. */
  async queryDeviceLastData({ pn, devcode, devaddr, sn }) {
    const dat = await this.call('queryDeviceLastData', { pn, devcode, devaddr, sn, i18n: 'en' });
    return asList(dat).filter((point) => point && typeof point.title === 'string');
  }

  /**
   * Current parameters of a device: `[{ par, name, val, unit }]`. Some
   * dataloggers only report the battery level here.
   */
  async queryDeviceParameters({ pn, devcode, devaddr, sn }) {
    try {
      const dat = await this.call('queryDeviceParsEs', {
        i18n: 'en_US',
        source: 1,
        pn,
        devcode,
        devaddr,
        sn,
      });
      return asList(dat?.parameter);
    } catch (err) {
      if (err.code === ERROR_CODES.NO_RECORD) {
        return [];
      }
      throw err;
    }
  }

  /** The settings the platform can write on a device: `[{ id, name, item: [{ key, val }] }]`. */
  async queryControlFields({ pn, devcode, devaddr, sn }) {
    const dat = await this.call('queryDeviceCtrlField', {
      i18n: 'en_US',
      source: 1,
      pn,
      devcode,
      devaddr,
      sn,
    });
    return asList(dat?.field);
  }

  /** Write one setting. The platform accepts it; the inverter applies it later. */
  async setControlValue({ pn, devcode, devaddr, sn }, id, value) {
    logger.info(`Writing setting ${id} = ${value} on device ${mask(sn)}`);
    return this.call('ctrlDevice', {
      pn,
      devcode,
      devaddr,
      sn,
      id,
      val: value,
      i18n: 'en_US',
      source: 1,
    });
  }
}

function asList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined || value === null ? [] : [value];
}
