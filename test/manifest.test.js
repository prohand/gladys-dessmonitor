// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest on its own, but nothing there knows
// which handlers the code registers, nor which values it fires: these tests
// keep both sides in sync, and catch the store rules that are easiest to miss.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import { ACTIONS, registerHandlers } from '../src/app.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import { GRID_STATES, SCENE_TRIGGERS } from '../src/capabilities/triggers.js';
import { INVERTER_WIDGET, SETTING_OPTIONS } from '../src/capabilities/widget.js';
import { optionKeys } from '../src/dessmonitor/controls.js';
import { STATUSES } from '../src/dessmonitor/datapoints.js';
import { LANGUAGES } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key).sort();

const allFields = [
  ...manifest.config_schema,
  ...(manifest.actions ?? []).flatMap((a) => a.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((w) => w.settings ?? []),
  ...(manifest.scene_triggers ?? []).flatMap((t) => t.fields ?? []),
  ...(manifest.scene_actions ?? []).flatMap((a) => a.fields ?? []),
];

/** The keys of the handlers registered on the SDK, per kind. */
function registeredHandlers() {
  const gladys = createFakeGladys();
  const registered = { action: [], sceneAction: [], widgetGet: [], widgetAction: [] };
  for (const kind of Object.keys(registered)) {
    const method = `on${kind[0].toUpperCase()}${kind.slice(1)}`;
    const original = gladys[method].bind(gladys);
    gladys[method] = (key, handler) => {
      registered[kind].push(key);
      return original(key, handler);
    };
  }
  registerHandlers(gladys);
  return Object.fromEntries(Object.entries(registered).map(([k, v]) => [k, v.sort()]));
}

test('every manifest action, scene action and widget has its handler, and vice versa', () => {
  const handlers = registeredHandlers();
  assert.deepEqual(handlers.action, keysOf(manifest.actions));
  assert.deepEqual(handlers.action, Object.values(ACTIONS).sort());
  assert.deepEqual(handlers.sceneAction, keysOf(manifest.scene_actions));
  assert.deepEqual(handlers.sceneAction, Object.values(SCENE_ACTIONS).sort());
  assert.deepEqual(handlers.widgetGet, keysOf(manifest.widgets));
  assert.deepEqual(handlers.widgetAction, [INVERTER_WIDGET]);
});

test('the scene triggers the code fires are the ones the manifest declares', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), Object.values(SCENE_TRIGGERS).sort());
  const trigger = (key) => manifest.scene_triggers.find((t) => t.key === key);
  const optionsOf = (key, field) =>
    trigger(key)
      .fields.find((f) => f.key === field)
      .options.map((o) => o.value)
      .sort();
  assert.deepEqual(
    optionsOf(SCENE_TRIGGERS.STATUS_CHANGED, 'status'),
    Object.values(STATUSES).sort(),
  );
  assert.deepEqual(optionsOf(SCENE_TRIGGERS.GRID_CHANGED, 'state'), [...GRID_STATES].sort());
  // The data the code sends is made of the declared fields and variables only:
  // the core drops any other key.
  const sent = {
    [SCENE_TRIGGERS.STATUS_CHANGED]: ['device', 'status', 'previous_status'],
    [SCENE_TRIGGERS.OPERATING_MODE_CHANGED]: ['device', 'mode', 'previous_mode'],
    [SCENE_TRIGGERS.GRID_CHANGED]: ['device', 'state'],
  };
  for (const [key, dataKeys] of Object.entries(sent)) {
    const declared = new Set([
      ...trigger(key).fields.map((f) => f.key),
      ...(trigger(key).variables ?? []).map((v) => v.key),
    ]);
    for (const dataKey of dataKeys) {
      assert.ok(declared.has(dataKey), `${key}: "${dataKey}" is not declared`);
    }
  }
});

test('the setting options of the scenes and of the widget are the ones the code writes', () => {
  const action = (key) => manifest.scene_actions.find((a) => a.key === key);
  for (const [actionKey, setting] of [
    [SCENE_ACTIONS.SET_OUTPUT_PRIORITY, 'output_priority'],
    [SCENE_ACTIONS.SET_CHARGER_PRIORITY, 'charger_priority'],
  ]) {
    const options = action(actionKey).fields.find((f) => f.key === 'priority').options;
    assert.deepEqual(options.map((o) => o.value).sort(), optionKeys(setting).sort());
    assert.deepEqual(options, SETTING_OPTIONS[setting], `${actionKey}: same labels as the widget`);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of ${field.key}`);
    }
  }
  const stored = manifest.config_schema.filter((f) => f.type !== 'section').map((f) => f.key);
  assert.deepEqual(stored.sort(), Object.keys(DEFAULT_CONFIG).sort());
  assert.deepEqual(Object.keys(normalizeConfig()).sort(), Object.keys(DEFAULT_CONFIG).sort());
});

test('the password is a secret field', () => {
  const password = manifest.config_schema.find((f) => f.key === 'password');
  assert.equal(password.type, 'secret');
});

const FIELD_TYPES = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];

test('every field uses a type the store accepts, and section blocks store nothing', () => {
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type ${field.type}`);
    assert.match(field.key, /^[a-z0-9_]+$/);
    if (field.placeholder !== undefined) {
      assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    }
    if (field.source !== undefined) {
      assert.equal(field.source, 'devices');
      assert.equal(field.options, undefined, `field "${field.key}": source and options`);
    }
  }
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-dessmonitor:${manifest.version}`);
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/prohand\/gladys-dessmonitor\//,
  );
});

const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('the categories stay inside the vocabulary the store indexes', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(CATEGORIES.includes(category), `unknown category "${category}"`);
  }
});

/** Whether the minimum of `gladys_version` is at least major.minor. */
function floorAtLeast(wantedMajor, wantedMinor) {
  const [major, minor] = manifest.gladys_version.replace(/^>=/, '').split('.').map(Number);
  return major > wantedMajor || (major === wantedMajor && minor >= wantedMinor);
}

test('the Gladys floor covers every field the manifest declares', () => {
  // Older cores reject an unknown manifest field: `categories` needs 4.86,
  // widgets and scenes 5.1, `keywords` and `countries` 5.3.
  assert.ok(floorAtLeast(5, 1), `got ${manifest.gladys_version}`);
  if (['keywords', 'countries'].some((field) => field in manifest)) {
    assert.ok(floorAtLeast(5, 3), `keywords/countries need 5.3.0, got ${manifest.gladys_version}`);
  }
});

test('the search keywords follow the store rules', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('DessMonitor is a worldwide cloud: no countries restriction', () => {
  // Declared, `countries` hides the integration from the catalog of every
  // instance located elsewhere. These inverters are sold everywhere, so the
  // field is deliberately left out (absent = worldwide).
  assert.equal(manifest.countries, undefined);
});

test('the manifest declares the cloud transport only', () => {
  // The datalogger only talks to the DessMonitor cloud: no local channel, so
  // no "Prefer the local connection" toggle either.
  assert.deepEqual(manifest.transports, ['cloud']);
});

/** Every multi-language object of the manifest, with where it sits. */
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => multiLanguageTexts(child, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const keys = Object.keys(node);
  if (keys.includes('en') && keys.every((key) => /^[a-z]{2}$/.test(key))) {
    return [{ path, text: node }];
  }
  return keys.flatMap((key) => multiLanguageTexts(node[key], `${path}.${key}`));
}

test('every multi-language text of the manifest carries en, fr, de and es', () => {
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 50, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('the per-language length limits of the store hold in every language', () => {
  const within = (text, min, max, where) => {
    for (const language of LANGUAGES) {
      const { length } = text[language];
      assert.ok(length >= min && length <= max, `${where}.${language}: ${length} characters`);
    }
  };
  within(manifest.description, 10, 100, 'description');
  for (const widget of manifest.widgets) {
    within(widget.label, 3, 30, `widget ${widget.key} label`);
    within(widget.description, 1, 100, `widget ${widget.key} description`);
  }
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    within(section.description, 1, 1000, `section ${section.key} description`);
  }
  for (const option of Object.values(SETTING_OPTIONS).flat()) {
    within(option.label, 1, 40, `option ${option.value}`);
  }
});
