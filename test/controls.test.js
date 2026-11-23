import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSetting } from '../src/dessmonitor/controls.js';
import { defaultData } from './helpers/fakeDessMonitor.js';

const fields = defaultData().controlFields['96342210100001'];

test('the output priority is found by name, its option by label', () => {
  assert.deepEqual(resolveSetting(fields, 'output_priority', 'sbu'), {
    id: 'los_output_source_priority',
    value: '2',
    label: 'SBU priority',
  });
  assert.equal(resolveSetting(fields, 'output_priority', 'solar').value, '1');
  assert.equal(resolveSetting(fields, 'output_priority', 'utility').value, '0');
  assert.equal(resolveSetting(fields, 'output_priority', 'sub'), null, 'not offered');
});

test('the charger priority is never mistaken for the output priority', () => {
  assert.equal(resolveSetting(fields, 'charger_priority', 'solar_only').value, '3');
  assert.equal(resolveSetting(fields, 'charger_priority', 'solar_and_utility').value, '2');
  assert.equal(resolveSetting(fields, 'charger_priority', 'solar_first').value, '1');
  assert.equal(resolveSetting(fields, 'charger_priority', 'utility_first').value, '0');
});

test('other vendor spellings are understood', () => {
  const vendor = [
    {
      id: 'bse_eybond_ctrl_49',
      name: 'Charger source priority',
      item: [
        { key: '48', val: 'PV First' },
        { key: '49', val: 'PV Is At The Same Level As Utility' },
        { key: '50', val: 'Only PV charging is allowed' },
        { key: '51', val: 'Utility First' },
      ],
    },
    {
      id: 'bse_eybond_ctrl_50',
      name: 'Output priority',
      item: [
        { key: 'UTI', val: 'UTI' },
        { key: 'SOL', val: 'SOL' },
        { key: 'SBU', val: 'SBU' },
        { key: 'SUB', val: 'SUB' },
      ],
    },
  ];
  assert.equal(resolveSetting(vendor, 'charger_priority', 'solar_and_utility').value, '49');
  assert.equal(resolveSetting(vendor, 'charger_priority', 'solar_only').value, '50');
  assert.equal(resolveSetting(vendor, 'output_priority', 'sub').value, 'SUB');
  assert.equal(resolveSetting(vendor, 'output_priority', 'solar').value, 'SOL');
  assert.equal(resolveSetting(vendor, 'output_priority', 'utility').value, 'UTI');
});

test('an unknown setting or option resolves to nothing', () => {
  assert.equal(resolveSetting(fields, 'nope', 'sbu'), null);
  assert.equal(resolveSetting(fields, 'output_priority', 'nope'), null);
  assert.equal(resolveSetting([], 'output_priority', 'sbu'), null);
});
