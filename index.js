// -----------------------------------------------------------------------------
// Entry point of the DessMonitor integration for Gladys Assistant.
//
// The Gladys supervisor injects GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN
// and GLADYS_INTEGRATION_SELECTOR into the container: the SDK reads them, so
// `new GladysIntegration()` is enough. Every handler is registered in
// src/app.js before connect().
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
registerHandlers(gladys);

// An unexpected rejection is logged instead of stopping the integration.
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled promise rejection', err);
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
});

logger.info('Starting the DessMonitor integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
