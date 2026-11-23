// -----------------------------------------------------------------------------
// Scene triggers (Gladys 5.1+), declared in the manifest `scene_triggers`.
//
// Fired by src/monitor.js with `gladys.publishSceneEvent`, one event per
// TRANSITION seen between two reads, never for the first value seen. The keys
// are stored in the users' scenes: never rename one.
// -----------------------------------------------------------------------------

export const SCENE_TRIGGERS = {
  /** The platform status of an inverter changed (online, offline, fault...). */
  STATUS_CHANGED: 'inverter_status_changed',
  /** The operating mode the inverter reports changed (Line, Battery...). */
  OPERATING_MODE_CHANGED: 'operating_mode_changed',
  /** The grid input voltage disappeared or came back. */
  GRID_CHANGED: 'grid_status_changed',
};

/** The `state` values of GRID_CHANGED. */
export const GRID_STATES = ['lost', 'restored'];
