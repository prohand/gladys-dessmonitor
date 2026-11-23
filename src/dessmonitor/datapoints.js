// -----------------------------------------------------------------------------
// From DessMonitor readings to Gladys features.
//
// `queryDeviceLastData` answers a list of `{ title, val, unit }` whose titles
// depend on the datalogger model (its `devcode`): "PV Power" here, "PV1 Input
// Power" there, "SOC" or "Battery Capacity" for the same battery level, typos
// included ("INV Module Termperature"). Titles are compared once normalized
// (lower case, letters and digits only), and each Gladys feature lists the
// titles it accepts, best first: when a datalogger reports two of them, the
// first one wins.
//
// The feature `key` ends up in the feature external_id: it is stored by Gladys
// forever, never rename one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

/** Lower case, letters and digits only, the platform's typos fixed. */
export function normalizeTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/termperature/g, 'temperature')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const POWER = { unit: UNITS.WATT, convert: toWatt };
const VOLTAGE = { unit: UNITS.VOLT, convert: toVolt, min: 0, max: 1000 };
const CURRENT = { unit: UNITS.AMPERE, convert: toAmpere, min: -1000, max: 1000 };

/**
 * The Gladys features an inverter can carry, in the order they are shown.
 * `titles` are normalized titles (see normalizeTitle), best first.
 */
export const FEATURES = [
  {
    key: 'pv-power',
    name: 'Solar power',
    category: CATEGORIES.ENERGY_PRODUCTION_SENSOR,
    type: TYPES.ENERGY_PRODUCTION_SENSOR.POWER,
    ...POWER,
    min: 0,
    max: 50000,
    titles: [
      'pv power',
      'pv total power',
      'total pv power',
      'pv input power',
      'pv charging power',
      'solar power',
      'pv1 input power',
      'pv1 charging power',
      'pv1 power',
    ],
  },
  {
    key: 'pv2-power',
    name: 'Solar power (PV2)',
    category: CATEGORIES.ENERGY_PRODUCTION_SENSOR,
    type: TYPES.ENERGY_PRODUCTION_SENSOR.POWER,
    ...POWER,
    min: 0,
    max: 50000,
    titles: ['pv2 input power', 'pv2 charging power', 'pv2 power'],
  },
  {
    key: 'pv-voltage',
    name: 'Solar voltage',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.VOLTAGE,
    ...VOLTAGE,
    titles: ['pv voltage', 'pv input voltage', 'pv1 input voltage', 'pv1 voltage'],
  },
  {
    key: 'pv-current',
    name: 'Solar current',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.CURRENT,
    ...CURRENT,
    titles: [
      'pv current',
      'pv input current',
      'pv1 input current',
      'pv1 charger current',
      'pv1 current',
    ],
  },
  {
    key: 'battery-level',
    name: 'Battery level',
    category: CATEGORIES.BATTERY_STORAGE,
    type: TYPES.BATTERY_STORAGE.BATTERY_LEVEL,
    unit: UNITS.PERCENT,
    convert: toNumber,
    min: 0,
    max: 100,
    titles: [
      'soc',
      'battery soc',
      'state of charge',
      'battery capacity',
      'battery percentage',
      'battery level',
      'bms soc',
      'bms battery soc',
    ],
  },
  {
    key: 'battery-voltage',
    name: 'Battery voltage',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.VOLTAGE,
    ...VOLTAGE,
    max: 1000,
    titles: ['battery voltage', 'batt voltage', 'bms battery voltage'],
  },
  {
    key: 'battery-current',
    name: 'Battery current',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.CURRENT,
    ...CURRENT,
    titles: ['battery current', 'batt current', 'bms battery current'],
  },
  {
    key: 'battery-charging-current',
    name: 'Battery charging current',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.CURRENT,
    ...CURRENT,
    titles: ['battery charging current', 'battery charge current'],
  },
  {
    key: 'battery-discharge-current',
    name: 'Battery discharge current',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.CURRENT,
    ...CURRENT,
    titles: ['battery discharge current'],
  },
  {
    key: 'battery-power',
    name: 'Battery power',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.POWER,
    ...POWER,
    min: -50000,
    max: 50000,
    titles: ['battery power', 'batt power', 'battery active power'],
  },
  {
    key: 'load-power',
    name: 'Load power',
    category: CATEGORIES.HOME_OUTPUT_SENSOR,
    type: TYPES.HOME_OUTPUT_SENSOR.POWER,
    ...POWER,
    min: 0,
    max: 50000,
    titles: [
      'output active power',
      'ac output active power',
      'total output active power',
      'load active power',
      'load power',
      'output power',
    ],
  },
  {
    key: 'output-voltage',
    name: 'Output voltage',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.VOLTAGE,
    ...VOLTAGE,
    titles: ['output voltage', 'ac output voltage'],
  },
  {
    key: 'output-current',
    name: 'Output current',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.CURRENT,
    ...CURRENT,
    titles: ['output current', 'ac output current', 'load current'],
  },
  {
    key: 'grid-power',
    name: 'Grid power',
    category: CATEGORIES.GRID_SENSOR,
    type: TYPES.GRID_SENSOR.POWER,
    ...POWER,
    min: -50000,
    max: 50000,
    titles: [
      'grid power',
      'grid active power',
      'ac input active power',
      'input active power',
      'mains power',
    ],
  },
  {
    key: 'grid-voltage',
    name: 'Grid voltage',
    category: CATEGORIES.ENERGY_SENSOR,
    type: TYPES.ENERGY_SENSOR.VOLTAGE,
    ...VOLTAGE,
    titles: [
      'grid voltage',
      'ac input voltage',
      'mains voltage',
      'utility voltage',
      'input voltage',
    ],
  },
  {
    key: 'inverter-temperature',
    name: 'Inverter temperature',
    category: CATEGORIES.DEVICE_TEMPERATURE_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.CELSIUS,
    convert: toCelsius,
    min: -40,
    max: 150,
    titles: [
      'inv module temperature',
      'inverter temperature',
      'heat sink temperature',
      'heatsink temperature',
      'inverter heat sink temperature',
      'ac radiator temperature',
      'temperature',
    ],
  },
  {
    key: 'energy-today',
    name: 'Solar energy today',
    category: CATEGORIES.ENERGY_PRODUCTION_SENSOR,
    type: TYPES.ENERGY_PRODUCTION_SENSOR.DAILY_PRODUCTION,
    unit: UNITS.KILOWATT_HOUR,
    convert: toKilowattHour,
    min: 0,
    max: 10000,
    titles: [
      'pv generated energy of today',
      'daily pv generation',
      'daily generation',
      'today generation',
      'energy today',
      'energytoday',
    ],
  },
  {
    key: 'energy-total',
    name: 'Solar energy total',
    category: CATEGORIES.ENERGY_PRODUCTION_SENSOR,
    type: TYPES.ENERGY_PRODUCTION_SENSOR.INDEX,
    unit: UNITS.KILOWATT_HOUR,
    convert: toKilowattHour,
    min: 0,
    max: 100000000,
    titles: [
      'pv generated energy total',
      'total pv generation',
      'total generation',
      'cumulative generation',
      'total energy',
      'energy total',
      'energytotal',
    ],
  },
  {
    key: 'operating-mode',
    name: 'Operating mode',
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.TEXT,
    text: true,
    min: 0,
    max: 0,
    titles: [
      'operating mode',
      'working state',
      'work state',
      'working mode',
      'work mode',
      'machine state',
      'the current state of the machine',
      'inverter mode',
    ],
  },
];

export const FEATURE_KEYS = Object.fromEntries(
  FEATURES.map((feature) => [feature.key.toUpperCase().replaceAll('-', '_'), feature.key]),
);

/** A grid voltage at or above this means the grid is there. */
export const GRID_PRESENT_VOLTS = 90;

/**
 * Read the platform's readings into `{ [featureKey]: number | string }`.
 *
 * @param {Array<{ title?: string, name?: string, val?: unknown, unit?: string }>} points
 *   `queryDeviceLastData` points, then `queryDeviceParsEs` parameters, then the
 *   plant summary: the first source carrying a feature wins.
 */
export function parseReadings(...sources) {
  const byTitle = new Map();
  for (const point of sources.flat()) {
    const title = normalizeTitle(point?.title ?? point?.name);
    if (title && !byTitle.has(title) && point.val !== undefined && point.val !== null) {
      byTitle.set(title, point);
    }
  }
  const readings = {};
  for (const feature of FEATURES) {
    for (const title of feature.titles) {
      const point = byTitle.get(title);
      if (!point) {
        continue;
      }
      const value = feature.text ? toText(point.val) : feature.convert(point.val, point.unit);
      if (value !== null) {
        readings[feature.key] = value;
        break;
      }
    }
  }
  return readings;
}

/** Summary fields of `webQueryDeviceEs` that read like data points. */
export function summaryPoints(summary) {
  if (!summary) {
    return [];
  }
  return ['energyToday', 'energyTotal']
    .filter((field) => summary[field] !== undefined && summary[field] !== null)
    .map((field) => ({ title: field, val: summary[field], unit: 'kWh' }));
}

// --- Values ------------------------------------------------------------------

/** First number of a value the platform may send as "230.1", "230.1 V", "1,234.5". */
export function toNumber(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const match = raw.replace(/,(?=\d{3}\b)/g, '').match(/-?\d+(?:[.,]\d+)?/);
  if (!match) {
    return null;
  }
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scaled(raw, unit, factors) {
  const value = toNumber(raw);
  if (value === null) {
    return null;
  }
  const factor =
    factors[
      String(unit ?? '')
        .trim()
        .toLowerCase()
    ] ?? 1;
  return round(value * factor);
}

function toWatt(raw, unit) {
  return scaled(raw, unit, { kw: 1000, mw: 1000000 });
}

function toVolt(raw, unit) {
  return scaled(raw, unit, { mv: 0.001, kv: 1000 });
}

function toAmpere(raw, unit) {
  return scaled(raw, unit, { ma: 0.001 });
}

function toKilowattHour(raw, unit) {
  return scaled(raw, unit, { wh: 0.001, mwh: 1000, gwh: 1000000 });
}

function toCelsius(raw, unit) {
  const value = toNumber(raw);
  if (value === null) {
    return null;
  }
  return /f$/i.test(String(unit ?? '').trim()) ? round(((value - 32) * 5) / 9, 1) : value;
}

function toText(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }
  const text = String(raw).trim();
  return text && !['-', '--', 'null', 'n/a'].includes(text.toLowerCase()) ? text : null;
}

// --- Device status -----------------------------------------------------------

/** The platform's status codes, for dataloggers and devices alike. */
export const STATUSES = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  FAULT: 'fault',
  STANDBY: 'standby',
  WARNING: 'warning',
  ERROR: 'error',
  PROTOCOL_ERROR: 'protocol_error',
};

const STATUS_BY_CODE = [
  STATUSES.ONLINE,
  STATUSES.OFFLINE,
  STATUSES.FAULT,
  STATUSES.STANDBY,
  STATUSES.WARNING,
  STATUSES.ERROR,
  STATUSES.PROTOCOL_ERROR,
];

/** The status of a device summary, `null` when the platform sent none. */
export function statusOf(summary) {
  const raw = summary?.status;
  if (raw === undefined || raw === null || raw === '' || typeof raw === 'boolean') {
    return null;
  }
  const code = Number(raw);
  return Number.isInteger(code) ? (STATUS_BY_CODE[code] ?? null) : null;
}

/** How each status reads, in the four languages. */
export const STATUS_LABELS = {
  [STATUSES.ONLINE]: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  [STATUSES.OFFLINE]: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Desconectado' },
  [STATUSES.FAULT]: { en: 'Fault', fr: 'Défaut', de: 'Störung', es: 'Avería' },
  [STATUSES.STANDBY]: { en: 'Standby', fr: 'En veille', de: 'Standby', es: 'En espera' },
  [STATUSES.WARNING]: { en: 'Warning', fr: 'Alerte', de: 'Warnung', es: 'Aviso' },
  [STATUSES.ERROR]: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  [STATUSES.PROTOCOL_ERROR]: {
    en: 'Protocol error',
    fr: 'Erreur de protocole',
    de: 'Protokollfehler',
    es: 'Error de protocolo',
  },
};
