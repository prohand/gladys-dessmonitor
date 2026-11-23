# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [0.0.1] - 2026-11-23

### Added

- First version of the DessMonitor integration: the inverters of a DessMonitor / SmartESS account
  (Eybond dataloggers) appear in Gladys with the readings their datalogger reports — solar power
  and voltage, battery level, voltage, current and power, load power, grid power and voltage,
  inverter temperature, solar energy of the day and in total, operating mode.
- Refresh interval set in the configuration (5 minutes by default); only the values that changed
  are sent to Gladys.
- Transport badge per inverter: `cloud` while DessMonitor hears it, `unreachable` when it is
  offline or the cloud does not answer.
- Scene triggers: an inverter's status changed, its operating mode changed, the grid was lost or
  restored.
- Scene actions: read an inverter now (with its main values as outputs), set the output priority,
  set the charger priority. Writing settings is off until enabled in the configuration.
- "Solar inverter" dashboard widget: live battery, solar, load and grid tiles, status, mode and
  last read, a "Read now" button and, when enabled, the two priority settings.
- "Test the connection" button on the Configuration screen.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/prohand/gladys-dessmonitor/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/prohand/gladys-dessmonitor/releases/tag/v0.0.1
