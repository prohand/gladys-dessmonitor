// -----------------------------------------------------------------------------
// SDK wiring: every handler is registered here, BEFORE connect(). Kept apart
// from index.js so the tests drive the whole integration through the SDK's
// fake Gladys (createFakeGladys), exactly as Gladys would.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './config.js';
import { Monitor } from './monitor.js';
import { createPoller } from './poller.js';
import { inverterIdOf } from './devices/inverter.js';
import { sceneActionHandlers } from './capabilities/scenes.js';
import { INVERTER_WIDGET, createInverterWidget } from './capabilities/widget.js';
import { MESSAGES, errorMessage, testConnection } from './connection.js';

const logger = createLogger({ name: 'app' });

export const ACTIONS = { TEST_CONNECTION: 'test_connection' };

/**
 * Register every handler on `gladys`.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options] injected in the tests
 * @param {(config: object) => object} [options.createClient]
 * @param {() => number} [options.now]
 * @returns {{ monitor: Monitor }}
 */
export function registerHandlers(gladys, { createClient, now = Date.now } = {}) {
  const monitor = new Monitor(gladys, { createClient, now });
  let config = normalizeConfig();
  monitor.configure(config);

  const widget = createInverterWidget(monitor, { now });
  // Every read changes the computed rows of the widget (status, last read).
  monitor.onChange(() => gladys.requestWidgetRefresh(INVERTER_WIDGET));

  /** Discover, publish the devices and their badges, report the status. */
  async function initialize() {
    if (!isConfigured(config)) {
      await gladys.publishDiscoveredDevices([]);
      await gladys.setConnectionStatus(false, MESSAGES.notConfigured);
      return;
    }
    try {
      await monitor.discover();
    } catch (err) {
      logger.error(`DessMonitor discovery failed: ${err.message}`);
      await gladys.setConnectionStatus(false, errorMessage(err));
      return;
    }
    await gladys.publishDiscoveredDevices(monitor.buildDevices());
    try {
      await monitor.publishAllTransports();
    } catch (err) {
      logger.warn(`Transport badges refused: ${err.message}`);
    }
    gladys.requestWidgetRefresh(INVERTER_WIDGET);
    await gladys.setConnectionStatus(
      true,
      monitor.list().length === 0 ? MESSAGES.noInverter : undefined,
    );
  }

  // --- Discovery: Gladys asks for the list of devices ------------------------
  gladys.onScanRequest(async () => {
    logger.info('Scan requested');
    await initialize();
  });

  // --- Polling ----------------------------------------------------------------
  const poll = createPoller((id) => monitor.refresh(id), now);
  gladys.onPoll(async (device) => {
    const id = inverterIdOf(gladys, device.external_id);
    if (!id) {
      throw new Error(`Not a DessMonitor inverter: ${device.external_id}`);
    }
    try {
      await poll(id, config.poll_frequency);
    } catch (err) {
      // Retried at the next poll; the badge already says "unreachable".
      logger.warn(`Read of inverter ${id} failed: ${err.message}`);
    }
  });

  // --- The inverters are read-only ---------------------------------------------
  gladys.onSetValue(async (device) => {
    throw new Error(`${device.external_id} is read-only`);
  });

  // --- Manifest actions (Configuration screen) ---------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    const message = await testConnection(monitor);
    if (monitor.list().length > 0) {
      await gladys.publishDiscoveredDevices(monitor.buildDevices());
    }
    return message;
  });

  // --- Scene actions ---------------------------------------------------------
  for (const [key, handler] of Object.entries(sceneActionHandlers(monitor))) {
    gladys.onSceneAction(key, (fields) => handler(gladys, fields));
  }

  // --- Dashboard widget --------------------------------------------------------
  gladys.onWidgetGet(INVERTER_WIDGET, (request) => widget.get(gladys, request));
  gladys.onWidgetAction(INVERTER_WIDGET, (actionKey, params, { settings, values } = {}) =>
    widget.action(gladys, { actionKey, params, settings, values }),
  );

  // --- Configuration and connection ----------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated');
    config = normalizeConfig(newConfig);
    monitor.configure(config);
    await initialize();
  });

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      monitor.configure(config);
      await initialize();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Logs der Integration.',
          es: 'La inicialización falló, revise los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  return { monitor };
}
