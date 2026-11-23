// -----------------------------------------------------------------------------
// Device type: SOLAR INVERTER (one per serial number of the account).
//
// Read-only: every feature is a reading of the DessMonitor cloud. The features
// are those the datalogger actually reports (see src/dessmonitor/datapoints.js):
// a grid-tie inverter has no battery level, an off-grid one no grid power.
//
// The device is polled by Gladys once a minute (the slowest pace Gladys
// offers); src/devices/poller.js applies the slower refresh interval of the
// configuration by skipping the polls in between.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import { FEATURES } from '../dessmonitor/datapoints.js';

export const DEVICE_TYPE = 'inverter';

/** External ids of one inverter, from its platform id (the serial number). */
export function inverterIds(gladys, inverterId) {
  return gladys.externalIds(DEVICE_TYPE, inverterId);
}

/** The inverter id an external id belongs to, `null` for another device. */
export function inverterIdOf(gladys, externalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  return externalId.slice(prefix.length).split(':')[0] || null;
}

/**
 * The discovery payload of one inverter: the features its readings carry.
 * @param {object} inverter see src/dessmonitor/inventory.js
 * @param {Record<string, number | string>} readings see parseReadings
 */
export function buildInverterDevice(gladys, inverter, readings) {
  const ids = inverterIds(gladys, inverter.id);
  return {
    name: inverter.alias,
    external_id: ids.device,
    model: `DessMonitor devcode ${inverter.devcode}`,
    // Read by Gladys when the user creates the device: the slower interval of
    // the config is applied by the poller, never published as is.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params: [
      { name: 'datalogger', value: inverter.pn },
      { name: 'serial', value: inverter.sn },
      { name: 'plant', value: String(inverter.plant) },
    ],
    features: FEATURES.filter((feature) => readings[feature.key] !== undefined).map((feature) => ({
      name: feature.name,
      external_id: ids.feature(feature.key),
      category: feature.category,
      type: feature.type,
      ...(feature.unit ? { unit: feature.unit } : {}),
      min: feature.min,
      max: feature.max,
      read_only: true,
      has_feedback: false,
      keep_history: !feature.text,
    })),
  };
}

/** The states of one inverter, in the `publishStates` format. */
export function inverterStates(gladys, inverterId, readings) {
  const ids = inverterIds(gladys, inverterId);
  return FEATURES.filter((feature) => readings[feature.key] !== undefined).map((feature) =>
    feature.text
      ? { device_feature_external_id: ids.feature(feature.key), text: readings[feature.key] }
      : { device_feature_external_id: ids.feature(feature.key), state: readings[feature.key] },
  );
}
