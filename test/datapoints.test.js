import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURES,
  normalizeTitle,
  parseReadings,
  statusOf,
  STATUSES,
  STATUS_LABELS,
  summaryPoints,
  toNumber,
} from '../src/dessmonitor/datapoints.js';
import { LANGUAGES } from '../src/i18n.js';

test('titles are compared normalized, the platform typos fixed', () => {
  assert.equal(normalizeTitle('INV Module Termperature'), 'inv module temperature');
  assert.equal(normalizeTitle('  PV1 Input-Power (W) '), 'pv1 input power w');
  assert.equal(normalizeTitle(undefined), '');
});

test('feature keys and titles are unique', () => {
  const keys = FEATURES.map((feature) => feature.key);
  assert.equal(new Set(keys).size, keys.length);
  const titles = FEATURES.flatMap((feature) => feature.titles);
  assert.equal(new Set(titles).size, titles.length, 'a title feeds one feature only');
  for (const title of titles) {
    assert.equal(normalizeTitle(title), title, `"${title}" must be written normalized`);
  }
});

test('readings are converted to the Gladys units', () => {
  const readings = parseReadings([
    { title: 'PV Power', val: '1.85', unit: 'kW' },
    { title: 'Output Active Power', val: '640', unit: 'W' },
    { title: 'Battery Capacity', val: '87', unit: '%' },
    { title: 'INV Module Termperature', val: '105.8', unit: '°F' },
    { title: 'Grid Voltage', val: '231.2 V', unit: '' },
    { title: 'PV Generated Energy Of Today', val: '7400', unit: 'Wh' },
    { title: 'Operating mode', val: 'Battery Mode', unit: '' },
    { title: 'Output Frequency', val: '50.0', unit: 'Hz' },
  ]);
  assert.deepEqual(readings, {
    'pv-power': 1850,
    'load-power': 640,
    'battery-level': 87,
    'inverter-temperature': 41,
    'grid-voltage': 231.2,
    'energy-today': 7.4,
    'operating-mode': 'Battery Mode',
  });
});

test('the best title wins, and the first source wins over the next ones', () => {
  const readings = parseReadings(
    [
      { title: 'PV1 Input Power', val: '900', unit: 'W' },
      { title: 'PV Power', val: '1800', unit: 'W' },
    ],
    [{ name: 'Battery percentage', val: '64', unit: '%' }],
    [{ title: 'PV Power', val: '1', unit: 'W' }],
  );
  assert.equal(readings['pv-power'], 1800);
  assert.equal(readings['battery-level'], 64);
});

test('empty or placeholder values are left out', () => {
  assert.deepEqual(
    parseReadings([
      { title: 'PV Power', val: '--', unit: 'W' },
      { title: 'Operating mode', val: '--' },
      { title: 'Battery Voltage', val: null },
    ]),
    {},
  );
});

test('numbers are read from what the platform sends', () => {
  assert.equal(toNumber('1,234.5'), 1234.5);
  assert.equal(toNumber('12,5'), 12.5);
  assert.equal(toNumber('-3.2A'), -3.2);
  assert.equal(toNumber(42), 42);
  assert.equal(toNumber('abc'), null);
  assert.equal(toNumber(Number.NaN), null);
});

test('the plant summary feeds the daily and total energy', () => {
  assert.deepEqual(parseReadings(summaryPoints({ energyToday: '7.4', energyTotal: 1520.6 })), {
    'energy-today': 7.4,
    'energy-total': 1520.6,
  });
  assert.deepEqual(summaryPoints(null), []);
});

test('status codes follow the platform', () => {
  assert.equal(statusOf({ status: 0 }), STATUSES.ONLINE);
  assert.equal(statusOf({ status: '1' }), STATUSES.OFFLINE);
  assert.equal(statusOf({ status: 6 }), STATUSES.PROTOCOL_ERROR);
  assert.equal(statusOf({ status: 99 }), null);
  assert.equal(statusOf({}), null, 'no status is not "online"');
  assert.equal(statusOf({ status: true }), null);
});

test('every status reads in every language', () => {
  for (const status of Object.values(STATUSES)) {
    for (const language of LANGUAGES) {
      assert.ok(STATUS_LABELS[status][language], `${status}.${language}`);
    }
  }
});
