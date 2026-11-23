// -----------------------------------------------------------------------------
// The "Solar inverter" dashboard widget (Gladys 5.1+), declared in the manifest
// `widgets`.
//
// Content, in the core's declarative vocabulary (no HTML):
//   - live tiles bound to the inverter's features (battery gauge, solar, load,
//     grid, battery power): they follow the published states by themselves;
//   - a status list computed here: platform status, operating mode, grid,
//     time of the last read;
//   - a "Read now" button and, when the user allowed it, two buttons opening a
//     form to change the output priority and the charger priority.
//
// The content budget of the core is 8 components, 6 tiles, 1 status list and
// 4 buttons: the tiles are capped so the buttons always fit.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';
import { FEATURE_KEYS, STATUSES, STATUS_LABELS } from '../dessmonitor/datapoints.js';
import { inverterIdOf, inverterIds } from '../devices/inverter.js';
import { errorMessage } from '../connection.js';

const logger = createLogger({ name: 'widget' });

export const INVERTER_WIDGET = 'inverter';

export const WIDGET_ACTIONS = {
  REFRESH: 'refresh',
  OUTPUT_PRIORITY: 'output_priority',
  CHARGER_PRIORITY: 'charger_priority',
};

/** Labels of the setting options, shared with the manifest (see the tests). */
export const SETTING_OPTIONS = {
  output_priority: [
    {
      value: 'sbu',
      label: {
        en: 'Solar, battery, grid (SBU)',
        fr: 'Solaire, batterie, réseau (SBU)',
        de: 'Solar, Batterie, Netz (SBU)',
        es: 'Solar, batería, red (SBU)',
      },
    },
    {
      value: 'sub',
      label: {
        en: 'Solar, grid, battery (SUB)',
        fr: 'Solaire, réseau, batterie (SUB)',
        de: 'Solar, Netz, Batterie (SUB)',
        es: 'Solar, red, batería (SUB)',
      },
    },
    {
      value: 'solar',
      label: { en: 'Solar first', fr: 'Solaire d’abord', de: 'Solar zuerst', es: 'Solar primero' },
    },
    {
      value: 'utility',
      label: { en: 'Grid first', fr: 'Réseau d’abord', de: 'Netz zuerst', es: 'Red primero' },
    },
  ],
  charger_priority: [
    {
      value: 'solar_first',
      label: { en: 'Solar first', fr: 'Solaire d’abord', de: 'Solar zuerst', es: 'Solar primero' },
    },
    {
      value: 'solar_and_utility',
      label: {
        en: 'Solar and grid',
        fr: 'Solaire et réseau',
        de: 'Solar und Netz',
        es: 'Solar y red',
      },
    },
    {
      value: 'solar_only',
      label: { en: 'Solar only', fr: 'Solaire uniquement', de: 'Nur Solar', es: 'Solo solar' },
    },
    {
      value: 'utility_first',
      label: { en: 'Grid first', fr: 'Réseau d’abord', de: 'Netz zuerst', es: 'Red primero' },
    },
  ],
};

const STATUS_COLORS = {
  [STATUSES.ONLINE]: WIDGET_COLORS.SUCCESS,
  [STATUSES.OFFLINE]: WIDGET_COLORS.DANGER,
  [STATUSES.FAULT]: WIDGET_COLORS.DANGER,
  [STATUSES.ERROR]: WIDGET_COLORS.DANGER,
  [STATUSES.PROTOCOL_ERROR]: WIDGET_COLORS.DANGER,
  [STATUSES.WARNING]: WIDGET_COLORS.WARNING,
  [STATUSES.STANDBY]: WIDGET_COLORS.NEUTRAL,
};

// The live tiles, in priority order: the first ones present are shown.
const TILES = [
  {
    key: FEATURE_KEYS.BATTERY_LEVEL,
    type: 'gauge',
    label: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  },
  {
    key: FEATURE_KEYS.PV_POWER,
    icon: 'sun',
    label: { en: 'Solar', fr: 'Solaire', de: 'Solar', es: 'Solar' },
  },
  {
    key: FEATURE_KEYS.LOAD_POWER,
    icon: 'home',
    label: { en: 'Load', fr: 'Consommation', de: 'Verbrauch', es: 'Consumo' },
  },
  {
    key: FEATURE_KEYS.GRID_POWER,
    icon: 'zap',
    label: { en: 'Grid', fr: 'Réseau', de: 'Netz', es: 'Red' },
  },
  {
    key: FEATURE_KEYS.BATTERY_POWER,
    icon: 'battery-charging',
    label: {
      en: 'Battery power',
      fr: 'Puissance batterie',
      de: 'Batterieleistung',
      es: 'Potencia batería',
    },
  },
  {
    key: FEATURE_KEYS.GRID_VOLTAGE,
    icon: 'activity',
    label: { en: 'Grid voltage', fr: 'Tension réseau', de: 'Netzspannung', es: 'Tensión red' },
  },
];

const UNKNOWN = { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' };

/** "3 min ago" in every language. */
function since(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) {
    return { en: 'Just now', fr: 'À l’instant', de: 'Gerade eben', es: 'Ahora mismo' };
  }
  if (minutes < 120) {
    return localize((language) =>
      pick(language, {
        en: `${minutes} min ago`,
        fr: `Il y a ${minutes} min`,
        de: `Vor ${minutes} Min.`,
        es: `Hace ${minutes} min`,
      }),
    );
  }
  const hours = Math.round(minutes / 60);
  return localize((language) =>
    pick(language, {
      en: `${hours} h ago`,
      fr: `Il y a ${hours} h`,
      de: `Vor ${hours} Std.`,
      es: `Hace ${hours} h`,
    }),
  );
}

function statusRows(entry, now) {
  const rows = [
    {
      label: { en: 'Status', fr: 'État', de: 'Status', es: 'Estado' },
      icon: 'cloud',
      value: entry.status ? STATUS_LABELS[entry.status] : UNKNOWN,
      color: STATUS_COLORS[entry.status] ?? WIDGET_COLORS.NEUTRAL,
    },
  ];
  const mode = entry.readings[FEATURE_KEYS.OPERATING_MODE];
  if (mode) {
    rows.push({
      label: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
      icon: 'settings',
      value: String(mode).slice(0, 40),
      color: WIDGET_COLORS.INFO,
    });
  }
  if (entry.gridUp !== null && entry.gridUp !== undefined) {
    rows.push({
      label: { en: 'Grid', fr: 'Réseau', de: 'Netz', es: 'Red' },
      icon: 'zap',
      value: entry.gridUp
        ? { en: 'Present', fr: 'Présent', de: 'Vorhanden', es: 'Presente' }
        : { en: 'Lost', fr: 'Coupé', de: 'Ausgefallen', es: 'Cortada' },
      color: entry.gridUp ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    });
  }
  rows.push({
    label: { en: 'Last read', fr: 'Dernière lecture', de: 'Letzte Abfrage', es: 'Última lectura' },
    icon: 'clock',
    value: entry.lastRead ? since(now - entry.lastRead) : UNKNOWN,
    color: entry.lastError ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
  });
  return rows;
}

function settingButton(action, setting, label, icon, device) {
  return {
    type: 'button',
    label,
    icon,
    style: 'secondary',
    action: {
      key: action,
      params: { device },
      fields: [
        {
          key: 'priority',
          type: 'select',
          label,
          required: true,
          options: SETTING_OPTIONS[setting],
        },
      ],
    },
  };
}

/**
 * The widget handlers.
 * @param {import('../monitor.js').Monitor} monitor
 */
export function createInverterWidget(monitor, { now = Date.now } = {}) {
  const pickEntry = (gladys, settings) => {
    const id = inverterIdOf(gladys, settings?.device);
    return (id && monitor.get(id)) || monitor.list()[0] || null;
  };

  return {
    async get(gladys, { settings }) {
      const entry = pickEntry(gladys, settings);
      if (!entry) {
        return {
          ttl_seconds: 300,
          components: [
            {
              type: 'text',
              text: monitor.configured
                ? {
                    en: 'No inverter found on the DessMonitor account yet.',
                    fr: 'Aucun onduleur trouvé sur le compte DessMonitor pour le moment.',
                    de: 'Noch kein Wechselrichter im DessMonitor-Konto gefunden.',
                    es: 'Todavía no se ha encontrado ningún inversor en la cuenta DessMonitor.',
                  }
                : {
                    en: 'Configure the DessMonitor account in the integration settings.',
                    fr: 'Configurez le compte DessMonitor dans les réglages de l’intégration.',
                    de: 'Richte das DessMonitor-Konto in den Einstellungen der Integration ein.',
                    es: 'Configure la cuenta DessMonitor en los ajustes de la integración.',
                  },
            },
          ],
        };
      }
      const ids = inverterIds(gladys, entry.id);
      const control = Boolean(monitor.config?.allow_control);
      const tiles = TILES.filter((tile) => entry.readings[tile.key] !== undefined)
        .slice(0, control ? 4 : 5)
        .map((tile) =>
          tile.type === 'gauge'
            ? { type: 'gauge', label: tile.label, device_feature: ids.feature(tile.key) }
            : {
                type: 'value',
                label: tile.label,
                icon: tile.icon,
                device_feature: ids.feature(tile.key),
              },
        );
      const components = [
        ...tiles,
        { type: 'status', items: statusRows(entry, now()) },
        {
          type: 'button',
          label: { en: 'Read now', fr: 'Lire maintenant', de: 'Jetzt abfragen', es: 'Leer ahora' },
          icon: 'refresh-cw',
          style: 'primary',
          action: { key: WIDGET_ACTIONS.REFRESH, params: { device: ids.device } },
        },
      ];
      if (control) {
        components.push(
          settingButton(
            WIDGET_ACTIONS.OUTPUT_PRIORITY,
            'output_priority',
            {
              en: 'Output priority',
              fr: 'Priorité de sortie',
              de: 'Ausgangspriorität',
              es: 'Prioridad de salida',
            },
            'sliders',
            ids.device,
          ),
          settingButton(
            WIDGET_ACTIONS.CHARGER_PRIORITY,
            'charger_priority',
            {
              en: 'Charger priority',
              fr: 'Priorité de charge',
              de: 'Ladepriorität',
              es: 'Prioridad de carga',
            },
            'battery-charging',
            ids.device,
          ),
        );
      }
      return { ttl_seconds: 60, components };
    },

    async action(gladys, { actionKey, params, values }) {
      logger.info(`Widget action ${actionKey}`);
      const id = inverterIdOf(gladys, params?.device);
      if (!id) {
        throw new Error('Unknown inverter');
      }
      if (actionKey === WIDGET_ACTIONS.REFRESH) {
        try {
          await monitor.refresh(id);
        } catch (err) {
          return errorMessage(err);
        }
        return {
          en: 'Inverter read.',
          fr: 'Onduleur lu.',
          de: 'Wechselrichter abgefragt.',
          es: 'Inversor leído.',
        };
      }
      if (
        actionKey === WIDGET_ACTIONS.OUTPUT_PRIORITY ||
        actionKey === WIDGET_ACTIONS.CHARGER_PRIORITY
      ) {
        let result;
        try {
          result = await monitor.setSetting(id, actionKey, values?.priority);
        } catch (err) {
          return errorMessage(err);
        }
        return settingToast(result);
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  };
}

/** The toast of a setting write. */
export function settingToast(result) {
  if (result.sent) {
    return localize((language) =>
      pick(language, {
        en: `Sent to the inverter: ${result.label}.`,
        fr: `Envoyé à l’onduleur : ${result.label}.`,
        de: `An den Wechselrichter gesendet: ${result.label}.`,
        es: `Enviado al inversor: ${result.label}.`,
      }).slice(0, 200),
    );
  }
  if (result.reason === 'disabled') {
    return {
      en: 'Changing settings is turned off in the integration configuration.',
      fr: 'La modification des réglages est désactivée dans la configuration.',
      de: 'Das Ändern von Einstellungen ist in der Konfiguration deaktiviert.',
      es: 'La modificación de ajustes está desactivada en la configuración.',
    };
  }
  return {
    en: 'This inverter does not offer this setting on DessMonitor.',
    fr: 'Cet onduleur ne propose pas ce réglage sur DessMonitor.',
    de: 'Dieser Wechselrichter bietet diese Einstellung auf DessMonitor nicht an.',
    es: 'Este inversor no ofrece este ajuste en DessMonitor.',
  };
}
