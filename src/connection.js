// -----------------------------------------------------------------------------
// What the Configuration screen says about the DessMonitor account: the
// connection status, and the answer of the "Test the connection" button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { localize, pick } from './i18n.js';
import { STATUS_LABELS } from './dessmonitor/datapoints.js';

const logger = createLogger({ name: 'connection' });

export const MESSAGES = {
  notConfigured: {
    en: 'Enter your DessMonitor username and password.',
    fr: 'Saisissez votre identifiant et votre mot de passe DessMonitor.',
    de: 'Gib deinen DessMonitor-Benutzernamen und dein Passwort ein.',
    es: 'Introduzca su usuario y su contraseña de DessMonitor.',
  },
  credentials: {
    en: 'DessMonitor refused the username, the password or the company key.',
    fr: "DessMonitor refuse l'identifiant, le mot de passe ou la clé fabricant.",
    de: 'DessMonitor lehnt Benutzername, Passwort oder Herstellerschlüssel ab.',
    es: 'DessMonitor rechaza el usuario, la contraseña o la clave de fabricante.',
  },
  unreachable: {
    en: 'The DessMonitor cloud does not answer, check the integration logs.',
    fr: 'Le cloud DessMonitor ne répond pas, consultez les logs de l’intégration.',
    de: 'Die DessMonitor-Cloud antwortet nicht, prüfe die Logs der Integration.',
    es: 'La nube DessMonitor no responde, revise los registros de la integración.',
  },
  noInverter: {
    en: 'Connected, but the account holds no inverter yet.',
    fr: 'Connecté, mais le compte ne contient encore aucun onduleur.',
    de: 'Verbunden, aber das Konto enthält noch keinen Wechselrichter.',
    es: 'Conectado, pero la cuenta todavía no contiene ningún inversor.',
  },
};

/** The message for an error of the platform or of the network. */
export function errorMessage(err) {
  return err?.isCredentials ? MESSAGES.credentials : MESSAGES.unreachable;
}

/**
 * "Test the connection": log in again, list the inverters and their status.
 * @param {import('./monitor.js').Monitor} monitor
 */
export async function testConnection(monitor) {
  if (!monitor.configured) {
    return MESSAGES.notConfigured;
  }
  monitor.client.logout();
  let inverters;
  try {
    inverters = await monitor.discover();
  } catch (err) {
    logger.warn(`Test the connection failed: ${err.message}`);
    return err?.isCredentials
      ? MESSAGES.credentials
      : localize((language) =>
          pick(language, {
            en: `The DessMonitor cloud refused the request: ${err.message}`,
            fr: `Le cloud DessMonitor a refusé la requête : ${err.message}`,
            de: `Die DessMonitor-Cloud hat die Anfrage abgelehnt: ${err.message}`,
            es: `La nube DessMonitor rechazó la solicitud: ${err.message}`,
          }),
        );
  }
  if (inverters.length === 0) {
    return MESSAGES.noInverter;
  }
  return localize((language) => {
    const lines = inverters.map((inverter) => {
      const status = inverter.status
        ? pick(language, STATUS_LABELS[inverter.status])
        : pick(language, { en: 'unknown', fr: 'inconnu', de: 'unbekannt', es: 'desconocido' });
      const features = Object.keys(inverter.readings).length;
      return pick(language, {
        en: `${inverter.alias}: ${status}, ${features} readings`,
        fr: `${inverter.alias} : ${status}, ${features} mesures`,
        de: `${inverter.alias}: ${status}, ${features} Messwerte`,
        es: `${inverter.alias}: ${status}, ${features} medidas`,
      });
    });
    const head = pick(language, {
      en: `Connected. ${inverters.length} inverter(s) found.`,
      fr: `Connecté. ${inverters.length} onduleur(s) trouvé(s).`,
      de: `Verbunden. ${inverters.length} Wechselrichter gefunden.`,
      es: `Conectado. ${inverters.length} inversor(es) encontrado(s).`,
    });
    return [head, ...lines].join('\n');
  });
}
