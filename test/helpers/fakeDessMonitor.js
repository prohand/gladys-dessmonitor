// -----------------------------------------------------------------------------
// An in-memory DessMonitor cloud, behind a `fetch` the client is given.
//
// It checks what the real platform checks: the SHA-1 signature of every call
// (password hash on login, secret + token afterwards) computed over the
// action string exactly as sent, and the token. The data it serves is plain
// objects the tests edit between two reads.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

const sha1 = (text) => createHash('sha1').update(text, 'utf8').digest('hex');

export const ACCOUNT = { username: 'jean dupont', password: 'p@ss word!' };

/** One off-grid inverter whose datalogger reports a typical devcode 2376 set. */
export function defaultData() {
  return {
    plants: [{ pid: 101, pname: 'Maison' }],
    collectors: { 101: [{ pn: 'W0012345678901', alias: 'Wi-Fi plug' }] },
    collectorDevices: {
      W0012345678901: [{ pn: 'W0012345678901', sn: '96342210100001', devcode: 2376, devaddr: 1 }],
    },
    summaries: {
      101: [
        {
          pn: 'W0012345678901',
          sn: '96342210100001',
          devcode: 2376,
          devaddr: 1,
          devalias: 'Garage inverter',
          status: 0,
          energyToday: '7.4',
          energyTotal: '1520.6',
        },
      ],
    },
    lastData: {
      96342210100001: [
        { title: 'Grid Voltage', val: '231.2', unit: 'V' },
        { title: 'PV Power', val: '1.85', unit: 'kW' },
        { title: 'PV1 Input Voltage', val: '310.4', unit: 'V' },
        { title: 'Battery Voltage', val: '52.4', unit: 'V' },
        { title: 'Battery Capacity', val: '87', unit: '%' },
        { title: 'Output Active Power', val: '640', unit: 'W' },
        { title: 'INV Module Termperature', val: '41', unit: '°C' },
        { title: 'Operating mode', val: 'Line Mode', unit: '' },
        { title: 'Output Frequency', val: '50.0', unit: 'Hz' },
      ],
    },
    parameters: {},
    controlFields: {
      96342210100001: [
        {
          id: 'los_output_source_priority',
          name: 'Output Source Priority',
          item: [
            { key: '0', val: 'Utility first' },
            { key: '1', val: 'Solar first' },
            { key: '2', val: 'SBU priority' },
          ],
        },
        {
          id: 'los_charger_source_priority',
          name: 'Charger Source Priority',
          item: [
            { key: '0', val: 'Utility first' },
            { key: '1', val: 'Solar first' },
            { key: '2', val: 'Solar and utility' },
            { key: '3', val: 'Only solar' },
          ],
        },
      ],
    },
  };
}

/**
 * @returns {{ fetch: typeof fetch, data: object, calls: Array<{ action: string, params: object }>,
 *   writes: Array<object>, failNext: (action: string, err: number | 'network') => void,
 *   expireToken: () => void, logins: () => number }}
 */
export function createFakeDessMonitor({ account = ACCOUNT, data = defaultData() } = {}) {
  const calls = [];
  const writes = [];
  const failures = new Map();
  let session = null;
  let loginCount = 0;

  const answer = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });
  const error = (err, desc = `ERR_${err}`) => answer({ err, desc });

  async function fakeFetch(url) {
    const query = url.slice(url.indexOf('?') + 1);
    const actionString = url.slice(url.indexOf('&action='));
    const params = Object.fromEntries(
      query.split('&').map((pair) => {
        const [key, value = ''] = pair.split('=');
        return [key, decodeURIComponent(value.replace(/\+/g, ' '))];
      }),
    );
    const { action, sign, salt } = params;
    calls.push({ action, params });

    const failure = failures.get(action);
    if (failure !== undefined) {
      failures.delete(action);
      if (failure === 'network') {
        throw new TypeError('fetch failed');
      }
      return error(failure);
    }

    if (action === 'authSource') {
      if (sign !== sha1(`${salt}${sha1(account.password)}${actionString}`)) {
        return error(4, 'ERR_SIGN');
      }
      if (params.usr !== account.username) {
        return error(16, 'ERR_PASSWORD_VERIF_FAIL');
      }
      loginCount += 1;
      session = { token: `token-${loginCount}`, secret: `secret-${loginCount}` };
      return answer({ err: 0, desc: 'ERR_NONE', dat: { ...session, expire: 604800, role: 0 } });
    }

    if (!session || params.token !== session.token) {
      return error(10, 'ERR_NO_AUTH');
    }
    if (sign !== sha1(`${salt}${session.secret}${session.token}${actionString}`)) {
      return error(4, 'ERR_SIGN');
    }

    switch (action) {
      case 'queryPlants':
        return answer({ err: 0, dat: { total: data.plants.length, plant: data.plants } });
      case 'webQueryCollectorsEs': {
        const collector = data.collectors[params.pid] ?? [];
        return collector.length
          ? answer({ err: 0, dat: { total: collector.length, collector } })
          : error(12, 'ERR_NO_RECORD');
      }
      case 'queryCollectorDevices':
        return answer({ err: 0, dat: { dev: data.collectorDevices[params.pn] ?? [] } });
      case 'webQueryDeviceEs':
        return answer({ err: 0, dat: { device: data.summaries[params.pid] ?? [] } });
      case 'queryDeviceLastData': {
        const points = data.lastData[params.sn];
        return points ? answer({ err: 0, dat: points }) : error(258, 'ERR_NOT_FOUND_DEVICE');
      }
      case 'queryDeviceParsEs': {
        const parameter = data.parameters[params.sn];
        return parameter ? answer({ err: 0, dat: { parameter } }) : error(12, 'ERR_NO_RECORD');
      }
      case 'queryDeviceCtrlField':
        return answer({ err: 0, dat: { field: data.controlFields[params.sn] ?? [] } });
      case 'ctrlDevice':
        writes.push({ sn: params.sn, id: params.id, val: params.val });
        return answer({ err: 0, desc: 'ERR_NONE' });
      default:
        return error(256, 'ERR_NOT_FOUND_API');
    }
  }

  return {
    fetch: fakeFetch,
    data,
    calls,
    writes,
    failNext(action, err) {
      failures.set(action, err);
    },
    expireToken() {
      session = { token: 'rotated', secret: 'rotated' };
    },
    logins: () => loginCount,
  };
}
