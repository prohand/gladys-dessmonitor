// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+), declared in the manifest `scene_actions`.
//
// `fields` arrive resolved by the core; a `"source": "devices"` field is the
// chosen device external_id. Each handler resolves the declared scalar
// `outputs`, readable by the next actions of the scene. A setting that cannot
// be written is an output (`sent: false`), not a failure: a scene action is
// never a condition, the scene author gates on the output.
//
// The keys are stored in the users' scenes: never rename one.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS, STATUSES } from '../dessmonitor/datapoints.js';
import { inverterIdOf } from '../devices/inverter.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTIONS = {
  REFRESH: 'refresh_inverter',
  SET_OUTPUT_PRIORITY: 'set_output_priority',
  SET_CHARGER_PRIORITY: 'set_charger_priority',
};

const orNull = (value) => (typeof value === 'number' ? value : null);

/**
 * The scene action handlers, keyed by their manifest key.
 * @param {import('../monitor.js').Monitor} monitor
 */
export function sceneActionHandlers(monitor) {
  const inverterOf = (gladys, fields) => {
    const id = inverterIdOf(gladys, fields.device);
    if (!id) {
      throw new Error('Choose a DessMonitor inverter');
    }
    return id;
  };

  const writer = (setting) => async (gladys, fields) => {
    const id = inverterOf(gladys, fields);
    logger.info(`Scene action ${setting} <- ${fields.priority}`);
    try {
      const result = await monitor.setSetting(id, setting, fields.priority);
      if (!result.sent) {
        logger.warn(`Scene action ${setting} not sent: ${result.reason}`);
      }
      return { sent: result.sent };
    } catch (err) {
      logger.warn(`Scene action ${setting} failed: ${err.message}`);
      return { sent: false };
    }
  };

  return {
    [SCENE_ACTIONS.REFRESH]: async (gladys, fields) => {
      const id = inverterOf(gladys, fields);
      const entry = await monitor.refresh(id);
      const { readings } = entry;
      return {
        online: entry.status !== STATUSES.OFFLINE,
        solar_power: orNull(readings[FEATURE_KEYS.PV_POWER]),
        battery_level: orNull(readings[FEATURE_KEYS.BATTERY_LEVEL]),
        load_power: orNull(readings[FEATURE_KEYS.LOAD_POWER]),
        grid_power: orNull(readings[FEATURE_KEYS.GRID_POWER]),
      };
    },
    [SCENE_ACTIONS.SET_OUTPUT_PRIORITY]: writer('output_priority'),
    [SCENE_ACTIONS.SET_CHARGER_PRIORITY]: writer('charger_priority'),
  };
}
