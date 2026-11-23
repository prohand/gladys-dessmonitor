// -----------------------------------------------------------------------------
// Which inverters the account holds.
//
// The platform nests them: account -> plants (`queryPlants`) -> dataloggers
// (`webQueryCollectorsEs`, the "PN" of the Wi-Fi plug) -> devices behind each
// datalogger (`queryCollectorDevices`: serial `sn`, protocol `devcode`, bus
// address `devaddr`). Every reading needs all four of pn/devcode/devaddr/sn.
//
// `webQueryDeviceEs` lists the same devices per plant with their alias and
// status; some accounts only answer that one, so its devices are taken too
// when they carry the four identifiers.
//
// The serial number is the platform's unique id of an inverter: it is what
// the Gladys external ids are built on.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { statusOf } from './datapoints.js';

const logger = createLogger({ name: 'inventory' });

/** The serial as an external id part: letters, digits, dashes and underscores. */
export function platformIdOf(sn) {
  return String(sn)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-');
}

function complete(device) {
  return (
    device.pn &&
    device.sn &&
    device.devcode !== undefined &&
    device.devcode !== null &&
    device.devaddr !== undefined &&
    device.devaddr !== null
  );
}

/**
 * Every inverter of the account.
 * @param {import('./client.js').DessMonitorClient} client
 * @returns {Promise<Array<object>>} `{ id, pid, plant, pn, sn, devcode, devaddr, alias, status, summary }`
 */
export async function discoverInverters(client) {
  const inverters = new Map();
  const plants = await client.queryPlants();
  for (const plant of plants) {
    const pid = plant.pid;
    if (pid === undefined || pid === null) {
      continue;
    }
    const plantName = plant.pname ?? plant.name ?? `Plant ${pid}`;
    const summaries = await client.queryPlantDevices(pid);
    const summaryBySn = new Map(summaries.filter((s) => s.sn).map((s) => [String(s.sn), s]));

    const add = (device, collector = {}) => {
      const candidate = {
        pn: device.pn ?? collector.pn,
        sn: device.sn,
        devcode: device.devcode,
        devaddr: device.devaddr,
      };
      if (!complete(candidate)) {
        return;
      }
      const sn = String(candidate.sn);
      const summary = summaryBySn.get(sn) ?? device;
      if (inverters.has(platformIdOf(sn))) {
        return;
      }
      inverters.set(platformIdOf(sn), {
        id: platformIdOf(sn),
        pid,
        plant: plantName,
        pn: String(candidate.pn),
        sn,
        devcode: Number(candidate.devcode),
        devaddr: Number(candidate.devaddr),
        alias: summary.devalias || device.devalias || collector.alias || sn,
        status: statusOf(summary),
        summary,
      });
    };

    for (const collector of await client.queryCollectors(pid)) {
      if (!collector.pn) {
        continue;
      }
      for (const device of await client.queryCollectorDevices(collector.pn)) {
        add(device, collector);
      }
    }
    for (const summary of summaries) {
      add(summary);
    }
  }
  logger.info(`Found ${inverters.size} inverter(s) in ${plants.length} plant(s)`);
  return [...inverters.values()];
}

/**
 * The latest summaries of the plants, keyed by serial number: status and the
 * daily / total energy of every inverter, in one call per plant.
 */
export async function readSummaries(client, pids) {
  const bySn = new Map();
  for (const pid of new Set(pids)) {
    for (const summary of await client.queryPlantDevices(pid)) {
      if (summary.sn) {
        bySn.set(String(summary.sn), summary);
      }
    }
  }
  return bySn;
}
