// -----------------------------------------------------------------------------
// Gladys polls a device at a fixed pace read once when the user creates it, at
// most once a minute (DEVICE_POLL_FREQUENCIES). The inverters declare that
// minute, and the slower refresh interval of the configuration
// (`poll_frequency`, in seconds) is applied here by skipping the polls in
// between: the user can change it at any time without re-creating devices.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';

// Gladys' ticks drift by a few milliseconds: a read due within the next
// half-minute runs now, so a 300 s interval does not slip to 360 s.
const TOLERANCE_MS = DEVICE_POLL_FREQUENCIES.EVERY_MINUTES / 2;

/**
 * @param {(key: string) => Promise<unknown>} read the read to run when due
 * @param {() => number} [now]
 * @returns {(key: string, intervalSeconds: number) => Promise<boolean>} resolves
 *   `true` when it read, `false` when the poll was skipped. A read that throws
 *   is retried at the next poll.
 */
export function createPoller(read, now = Date.now) {
  const lastReads = new Map();
  const running = new Map();
  return async function poll(key, intervalSeconds) {
    if (running.has(key)) {
      return false;
    }
    const last = lastReads.get(key);
    if (last !== undefined && now() - last < intervalSeconds * 1000 - TOLERANCE_MS) {
      return false;
    }
    const task = read(key);
    running.set(key, task);
    try {
      await task;
      lastReads.set(key, now());
      return true;
    } finally {
      running.delete(key);
    }
  };
}
