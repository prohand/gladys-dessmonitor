// End to end: the SDK's fake Gladys on one side, the fake DessMonitor cloud on
// the other, and the whole integration (src/app.js) in between.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { DessMonitorClient } from '../src/dessmonitor/client.js';
import { INVERTER_WIDGET } from '../src/capabilities/widget.js';
import { SCENE_TRIGGERS } from '../src/capabilities/triggers.js';
import { ACCOUNT, createFakeDessMonitor } from './helpers/fakeDessMonitor.js';

const SN = '96342210100001';

async function start({ config = {}, cloud = createFakeDessMonitor() } = {}) {
  let now = Date.parse('2026-11-23T10:00:00Z');
  const gladys = createFakeGladys({
    config: { username: ACCOUNT.username, password: ACCOUNT.password, ...config },
  });
  const { monitor } = registerHandlers(gladys, {
    createClient: (cfg) =>
      new DessMonitorClient({
        username: cfg.username,
        password: cfg.password,
        companyKey: cfg.company_key,
        fetch: cloud.fetch,
        now: () => now,
      }),
    now: () => now,
  });
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  // The user creates the device in Gladys.
  if (device) {
    gladys.fake.devices.push(device);
  }
  return {
    gladys,
    cloud,
    monitor,
    device,
    feature: (key) => `${device.external_id}:${key}`,
    advance: (ms) => {
      now += ms;
    },
  };
}

test('the inverters of the account are published with the features they report', async () => {
  const { gladys, device } = await start();
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.equal(device.external_id, `ext:test-integration:inverter:${SN}`);
  assert.equal(device.name, 'Garage inverter');
  assert.equal(device.poll_frequency, 60000);
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').pop()),
    [
      'pv-power',
      'pv-voltage',
      'battery-level',
      'battery-voltage',
      'load-power',
      'grid-voltage',
      'inverter-temperature',
      'energy-today',
      'energy-total',
      'operating-mode',
    ],
  );
  for (const feature of device.features) {
    for (const field of ['name', 'min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[field], undefined, `${feature.external_id}.${field}`);
    }
    assert.equal(feature.read_only, true);
  }
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.deepEqual(
    gladys.fake.transports.map((t) => t.transport),
    ['cloud'],
  );
});

test('a poll publishes the readings, then only what changed', async () => {
  const { gladys, cloud, device, feature, advance } = await start();
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  assert.equal(gladys.fake.lastState(feature('pv-power')), 1850);
  assert.equal(gladys.fake.lastState(feature('battery-level')), 87);
  assert.equal(gladys.fake.lastState(feature('energy-total')), 1520.6);
  const textState = gladys.fake.states.find(
    (s) => s.device_feature_external_id === feature('operating-mode'),
  );
  assert.equal(textState.text, 'Line Mode');

  const published = gladys.fake.states.length;
  // Polled again within the interval: skipped, nothing read.
  const reads = cloud.calls.length;
  advance(60_000);
  await gladys.fake.poll(device);
  assert.equal(cloud.calls.length, reads);

  // Five minutes later, one value moved: only it is sent again.
  advance(5 * 60_000);
  cloud.data.lastData[SN].find((p) => p.title === 'PV Power').val = '2.10';
  await gladys.fake.poll(device);
  const sent = gladys.fake.states.slice(published);
  assert.deepEqual(
    sent.map((s) => [s.device_feature_external_id.split(':').pop(), s.state]),
    [['pv-power', 2100]],
  );
});

test('status, operating mode and grid transitions fire their scene triggers once', async () => {
  const { gladys, cloud, device, advance } = await start();
  await gladys.fake.poll(device);
  assert.deepEqual(gladys.fake.sceneEvents, [], 'the first values seen fire nothing');

  advance(6 * 60_000);
  cloud.data.lastData[SN].find((p) => p.title === 'Operating mode').val = 'Battery Mode';
  cloud.data.lastData[SN].find((p) => p.title === 'Grid Voltage').val = '0';
  cloud.data.summaries[101][0].status = 4;
  await gladys.fake.poll(device);

  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.STATUS_CHANGED,
      data: { device: device.external_id, status: 'warning', previous_status: 'online' },
    },
    {
      key: SCENE_TRIGGERS.OPERATING_MODE_CHANGED,
      data: { device: device.external_id, mode: 'Battery Mode', previous_mode: 'Line Mode' },
    },
    {
      key: SCENE_TRIGGERS.GRID_CHANGED,
      data: { device: device.external_id, state: 'lost' },
    },
  ]);

  advance(6 * 60_000);
  await gladys.fake.poll(device);
  assert.equal(gladys.fake.sceneEvents.length, 3, 'no transition, no event');

  advance(6 * 60_000);
  cloud.data.lastData[SN].find((p) => p.title === 'Grid Voltage').val = '229';
  await gladys.fake.poll(device);
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.GRID_CHANGED,
    data: { device: device.external_id, state: 'restored' },
  });
});

test('an offline inverter turns its badge to unreachable and keeps its values', async () => {
  const { gladys, cloud, device, advance } = await start();
  await gladys.fake.poll(device);
  const published = gladys.fake.states.length;
  advance(6 * 60_000);
  cloud.data.summaries[101][0].status = 1;
  await gladys.fake.poll(device);
  assert.equal(gladys.fake.states.length, published, 'stale values are not re-dated');
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(gladys.fake.sceneEvents.at(-1).data.status, 'offline');

  advance(6 * 60_000);
  cloud.data.summaries[101][0].status = 0;
  await gladys.fake.poll(device);
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
});

test('a cloud failure is retried at the next poll, never thrown at Gladys', async () => {
  const { gladys, cloud, device, advance } = await start();
  cloud.failNext('webQueryDeviceEs', 'network');
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  advance(60_000);
  await gladys.fake.poll(device);
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
});

test('without credentials, the Configuration screen asks for them', async () => {
  const gladys = createFakeGladys({ config: {} });
  registerHandlers(gladys, { createClient: () => assert.fail('no client without credentials') });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /identifiant/);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
});

test('refused credentials are reported as such', async () => {
  const { gladys } = await start({ config: { username: 'nobody' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the username/);
});

test('"Test the connection" lists the inverters in every language', async () => {
  const { gladys } = await start();
  const ack = await gladys.fake.action('test_connection');
  assert.equal(ack.success, true);
  const { message } = ack.data;
  assert.match(message.en, /1 inverter\(s\) found/);
  assert.match(message.fr, /Garage inverter : En ligne, 10 mesures/);
  assert.ok(message.de && message.es);
});

test('the scene action "read an inverter now" answers its outputs', async () => {
  const { gladys, device } = await start();
  const ack = await gladys.fake.sceneAction('refresh_inverter', { device: device.external_id });
  assert.deepEqual(ack, {
    success: true,
    data: {
      outputs: {
        online: true,
        solar_power: 1850,
        battery_level: 87,
        load_power: 640,
        grid_power: null,
      },
    },
  });
});

test('settings are only written when the user allowed it', async () => {
  const { gladys, cloud, device } = await start();
  const fields = { device: device.external_id, priority: 'sbu' };
  assert.deepEqual(await gladys.fake.sceneAction('set_output_priority', fields), {
    success: true,
    data: { outputs: { sent: false } },
  });
  assert.deepEqual(cloud.writes, []);
});

test('an allowed setting is written with the vendor key', async () => {
  const { gladys, cloud, device } = await start({ config: { allow_control: true } });
  const output = await gladys.fake.sceneAction('set_output_priority', {
    device: device.external_id,
    priority: 'sbu',
  });
  assert.deepEqual(output.data.outputs, { sent: true });
  const charger = await gladys.fake.sceneAction('set_charger_priority', {
    device: device.external_id,
    priority: 'utility_first',
  });
  assert.deepEqual(charger.data.outputs, { sent: true });
  assert.deepEqual(cloud.writes, [
    { sn: SN, id: 'los_output_source_priority', val: '2' },
    { sn: SN, id: 'los_charger_source_priority', val: '0' },
  ]);
  const missing = await gladys.fake.sceneAction('set_output_priority', {
    device: device.external_id,
    priority: 'sub',
  });
  assert.deepEqual(
    missing.data.outputs,
    { sent: false },
    'an option the inverter lacks is an output',
  );
});

test('the widget content is rendered exactly as sent, with live tiles', async () => {
  for (const allow_control of [false, true]) {
    const { gladys, device } = await start({ config: { allow_control } });
    await gladys.fake.poll(device);
    const ack = await gladys.fake.widgetGet(INVERTER_WIDGET, {
      settings: { device: device.external_id },
    });
    assert.equal(ack.success, true);
    const { content } = ack.data;
    assert.deepEqual(validateWidgetContent(content), []);
    const featureIds = new Set(device.features.map((f) => f.external_id));
    const live = content.components.filter((c) => c.device_feature);
    assert.ok(live.length >= 3);
    for (const tile of live) {
      assert.ok(featureIds.has(tile.device_feature), tile.device_feature);
    }
    const buttons = content.components.filter((c) => c.type === 'button');
    assert.equal(buttons.length, allow_control ? 3 : 1);
  }
});

test('the widget buttons answer a short toast', async () => {
  const { gladys, cloud, device } = await start({ config: { allow_control: true } });
  const refresh = await gladys.fake.widgetAction(INVERTER_WIDGET, 'refresh', {
    device: device.external_id,
  });
  assert.equal(refresh.success, true);
  assert.equal(refresh.data.message.en, 'Inverter read.');

  const write = await gladys.fake.widgetAction(
    INVERTER_WIDGET,
    'charger_priority',
    { device: device.external_id },
    { values: { priority: 'solar_only' } },
  );
  const { message } = write.data;
  assert.match(message.fr, /Only solar/);
  assert.ok(message.en.length <= 200);
  assert.deepEqual(cloud.writes.at(-1), { sn: SN, id: 'los_charger_source_priority', val: '3' });
});

test('without any inverter the widget says why', async () => {
  const gladys = createFakeGladys({ config: {} });
  registerHandlers(gladys);
  await gladys.connect();
  const ack = await gladys.fake.widgetGet(INVERTER_WIDGET, { settings: {} });
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('every read nudges the widget', async () => {
  const { gladys, device } = await start();
  const before = gladys.fake.widgetRefreshes.length;
  await gladys.fake.poll(device);
  assert.ok(gladys.fake.widgetRefreshes.length > before);
  assert.ok(gladys.fake.widgetRefreshes.every((key) => key === INVERTER_WIDGET));
});

test('the inverters are read-only', async () => {
  const { gladys, device } = await start();
  const ack = await gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(ack.success, false);
});
