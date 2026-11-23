// -----------------------------------------------------------------------------
// The integration's runtime: which inverters exist, what they last reported,
// and what changed.
//
// - discover(): lists the inverters of the account and reads each one once, so
//   the published devices carry exactly the features their datalogger reports;
// - refresh(id): reads one inverter, publishes the values that changed, fires
//   the scene triggers on each transition (status, operating mode, grid) and
//   updates its transport badge;
// - setSetting(): writes an inverter setting through the cloud (opt-in).
//
// It holds no timer: Gladys' polls drive the reads (see index.js).
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { DessMonitorClient, DessMonitorError, mask } from './dessmonitor/client.js';
import {
  FEATURE_KEYS,
  GRID_PRESENT_VOLTS,
  STATUSES,
  parseReadings,
  statusOf,
  summaryPoints,
} from './dessmonitor/datapoints.js';
import { discoverInverters, readSummaries } from './dessmonitor/inventory.js';
import { resolveSetting } from './dessmonitor/controls.js';
import { buildInverterDevice, inverterIds, inverterStates } from './devices/inverter.js';
import { SCENE_TRIGGERS } from './capabilities/triggers.js';

const logger = createLogger({ name: 'monitor' });

// An unchanged value is still re-sent every 30 minutes, so it stays recently
// dated in Gladys without spending the 300 states/minute of the host API.
const HEARTBEAT_MS = 30 * 60 * 1000;
// One plant summary serves every inverter of the plant polled in the same burst.
const SUMMARY_TTL_MS = 30 * 1000;

export class Monitor {
  /**
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
   * @param {object} [options]
   * @param {(config: object) => DessMonitorClient} [options.createClient] injected in the tests
   * @param {() => number} [options.now]
   */
  constructor(gladys, { createClient, now = Date.now } = {}) {
    this.gladys = gladys;
    this.now = now;
    this.createClient =
      createClient ??
      ((config) =>
        new DessMonitorClient({
          username: config.username,
          password: config.password,
          companyKey: config.company_key,
        }));
    this.config = null;
    this.client = null;
    this.inverters = new Map();
    this.summaries = new Map(); // pid -> { at, bySn }
    this.discovering = null;
    this.listeners = new Set();
  }

  /** Called after every refresh of an inverter (the widget listens). */
  onChange(listener) {
    this.listeners.add(listener);
  }

  /** Apply a (new) configuration. New credentials start from a fresh session. */
  configure(config) {
    const credentials = (c) => (c ? `${c.username}\n${c.password}\n${c.company_key}` : '');
    if (!this.client || credentials(config) !== credentials(this.config)) {
      this.client = isConfigured(config) ? this.createClient(config) : null;
      this.summaries.clear();
    }
    this.config = config;
  }

  get configured() {
    return Boolean(this.client);
  }

  /** The known inverters, in a stable order. */
  list() {
    return [...this.inverters.values()].sort((a, b) => String(a.alias).localeCompare(b.alias));
  }

  get(id) {
    return this.inverters.get(id) ?? null;
  }

  // --- Discovery -------------------------------------------------------------

  /** List and read every inverter of the account (one discovery at a time). */
  async discover() {
    if (!this.discovering) {
      this.discovering = this.doDiscover().finally(() => {
        this.discovering = null;
      });
    }
    return this.discovering;
  }

  async doDiscover() {
    if (!this.client) {
      this.inverters.clear();
      return [];
    }
    const found = await discoverInverters(this.client);
    const next = new Map();
    for (const inverter of found) {
      const previous = this.inverters.get(inverter.id);
      const entry = {
        ...inverter,
        readings: previous?.readings ?? {},
        mode: previous?.mode ?? null,
        gridUp: previous?.gridUp ?? null,
        lastRead: previous?.lastRead ?? null,
        lastError: null,
        needsParameters: previous?.needsParameters ?? false,
        // The status just listed wins; keep the previous one to compare.
        status: inverter.status ?? previous?.status ?? null,
      };
      try {
        await this.read(entry, inverter.summary);
      } catch (err) {
        entry.lastError = err;
        logger.warn(`First read of ${mask(entry.sn)} failed: ${err.message}`);
      }
      next.set(inverter.id, entry);
    }
    this.inverters = next;
    return this.list();
  }

  /** The Gladys discovery payload of every known inverter. */
  buildDevices() {
    return this.list().map((inverter) =>
      buildInverterDevice(this.gladys, inverter, inverter.readings),
    );
  }

  // --- Reads -----------------------------------------------------------------

  /** Read the cloud into `entry.readings` (no publication). */
  async read(entry, summary) {
    if (statusOf(summary) === STATUSES.OFFLINE && Object.keys(entry.readings).length > 0) {
      // The cloud would answer the last values it heard, hours old maybe:
      // keep what Gladys shows instead of re-dating stale readings.
      return entry.readings;
    }
    const points = await this.client.queryDeviceLastData(entry);
    let parameters = [];
    const fromPoints = parseReadings(points);
    if (entry.needsParameters || fromPoints[FEATURE_KEYS.BATTERY_LEVEL] === undefined) {
      // Some dataloggers only report the battery level among the parameters.
      parameters = await this.client.queryDeviceParameters(entry).catch(() => []);
    }
    const readings = parseReadings(points, parameters, summaryPoints(summary));
    entry.needsParameters =
      fromPoints[FEATURE_KEYS.BATTERY_LEVEL] === undefined &&
      readings[FEATURE_KEYS.BATTERY_LEVEL] !== undefined;
    entry.readings = readings;
    entry.lastRead = this.now();
    entry.lastError = null;
    return readings;
  }

  async summaryOf(entry) {
    const cached = this.summaries.get(entry.pid);
    if (cached && this.now() - cached.at < SUMMARY_TTL_MS) {
      return cached.bySn.get(entry.sn) ?? null;
    }
    const bySn = await readSummaries(this.client, [entry.pid]);
    this.summaries.set(entry.pid, { at: this.now(), bySn });
    return bySn.get(entry.sn) ?? null;
  }

  /**
   * Read one inverter now and publish what changed.
   * @returns {Promise<object>} the inverter entry
   */
  async refresh(id) {
    if (!this.client) {
      throw new DessMonitorError('DessMonitor account not configured');
    }
    if (!this.inverters.has(id)) {
      await this.discover();
    }
    const entry = this.inverters.get(id);
    if (!entry) {
      throw new DessMonitorError(`Unknown inverter ${id}`);
    }
    const before = {
      status: entry.status,
      mode: entry.mode,
      gridUp: entry.gridUp,
      transport: this.transportOf(entry),
    };
    try {
      const summary = await this.summaryOf(entry);
      entry.status = statusOf(summary) ?? entry.status;
      if (summary?.devalias) {
        entry.alias = summary.devalias;
      }
      await this.read(entry, summary);
    } catch (err) {
      entry.lastError = err;
      await this.publishTransportIfChanged(entry, before.transport);
      this.notify(entry);
      throw err;
    }

    await this.publishReadings(entry);
    entry.mode = entry.readings[FEATURE_KEYS.OPERATING_MODE] ?? entry.mode;
    const voltage = entry.readings[FEATURE_KEYS.GRID_VOLTAGE];
    if (entry.status !== STATUSES.OFFLINE && typeof voltage === 'number') {
      entry.gridUp = voltage >= GRID_PRESENT_VOLTS;
    }
    await this.fireTransitions(entry, before);
    await this.publishTransportIfChanged(entry, before.transport);
    this.notify(entry);
    return entry;
  }

  async publishReadings(entry) {
    if (entry.status === STATUSES.OFFLINE) {
      return;
    }
    const states = inverterStates(this.gladys, entry.id, entry.readings);
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    }
  }

  notify(entry) {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        logger.error('Change listener failed', err);
      }
    }
  }

  // --- Scene triggers ----------------------------------------------------------

  /** One scene event per transition, never on the first value seen. */
  async fireTransitions(entry, before) {
    const device = inverterIds(this.gladys, entry.id).device;
    if (before.status && entry.status && before.status !== entry.status) {
      await this.fire(SCENE_TRIGGERS.STATUS_CHANGED, {
        device,
        status: entry.status,
        previous_status: before.status,
      });
    }
    if (before.mode && entry.mode && before.mode !== entry.mode) {
      await this.fire(SCENE_TRIGGERS.OPERATING_MODE_CHANGED, {
        device,
        mode: entry.mode,
        previous_mode: before.mode,
      });
    }
    if (before.gridUp !== null && entry.gridUp !== null && before.gridUp !== entry.gridUp) {
      await this.fire(SCENE_TRIGGERS.GRID_CHANGED, {
        device,
        state: entry.gridUp ? 'restored' : 'lost',
      });
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      logger.info(`Scene trigger ${key} fired (${JSON.stringify({ ...data, device: undefined })})`);
    } catch (err) {
      // A refused event must not cost the readings of this poll.
      logger.warn(`Scene trigger ${key} refused: ${err.message}`);
    }
  }

  // --- Transport badges --------------------------------------------------------

  /** `cloud` while the platform hears the inverter, `unreachable` otherwise. */
  transportOf(entry) {
    if (entry.lastError || entry.status === STATUSES.OFFLINE) {
      return DEVICE_TRANSPORTS.UNREACHABLE;
    }
    return DEVICE_TRANSPORTS.CLOUD;
  }

  transportEntries() {
    return this.list().map((entry) => ({
      external_id: inverterIds(this.gladys, entry.id).device,
      transport: this.transportOf(entry),
    }));
  }

  async publishTransportIfChanged(entry, previous) {
    const transport = this.transportOf(entry);
    if (transport === previous) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: inverterIds(this.gladys, entry.id).device, transport },
      ]);
    } catch (err) {
      logger.warn(`Transport badge refused: ${err.message}`);
    }
  }

  /** Publish every badge (after a (re)connection or a discovery), 100 at a time. */
  async publishAllTransports() {
    const entries = this.transportEntries();
    for (let i = 0; i < entries.length; i += 100) {
      await this.gladys.publishTransports(entries.slice(i, i + 100));
    }
  }

  // --- Settings ------------------------------------------------------------------

  /**
   * Write one inverter setting (output or charger priority) through the cloud.
   * @returns {Promise<{ sent: boolean, reason?: string, label?: string }>}
   */
  async setSetting(id, setting, option) {
    if (!this.config?.allow_control) {
      return { sent: false, reason: 'disabled' };
    }
    if (!this.client) {
      return { sent: false, reason: 'not_configured' };
    }
    if (!this.inverters.has(id)) {
      await this.discover();
    }
    const entry = this.inverters.get(id);
    if (!entry) {
      return { sent: false, reason: 'unknown_inverter' };
    }
    const fields = await this.client.queryControlFields(entry);
    const target = resolveSetting(fields, setting, option);
    if (!target) {
      logger.warn(
        `Setting ${setting}=${option} not offered for ${mask(entry.sn)} (devcode ${entry.devcode})`,
      );
      return { sent: false, reason: 'unsupported' };
    }
    await this.client.setControlValue(entry, target.id, target.value);
    return { sent: true, label: target.label };
  }
}
