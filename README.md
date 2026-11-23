# DessMonitor — Gladys Assistant integration

External integration for [Gladys Assistant](https://gladysassistant.com) that brings the solar
inverters of a **DessMonitor** account (dessmonitor.com, the **SmartESS** app, Eybond Wi-Fi
dataloggers — Easun, PowMr, MPP Solar and many off-grid / hybrid inverters) into Gladys.

Built with the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js), from
the official template
[`integration-template-js`](https://github.com/GladysAssistant/integration-template-js).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md).

## What it does

- **One device per inverter**, with the readings its datalogger reports: solar power (and PV2),
  solar voltage and current, battery level, voltage, current and power, load power, output voltage
  and current, grid power and voltage, inverter temperature, solar energy of the day and in total,
  operating mode.
- **Polling** at the interval set in the configuration (5 minutes by default, the pace DessMonitor
  itself refreshes at); only the values that changed are sent to Gladys.
- **Transport badge** (`cloud` tag): `cloud` while DessMonitor hears the inverter, `unreachable`
  when it is offline or the cloud does not answer.
- **Scene triggers** (Gladys 5.1+): inverter status changed (online, offline, fault, warning…),
  operating mode changed (Line → Battery…), grid lost / restored.
- **Scene actions**: read an inverter now (its main values become scene variables), set the output
  priority (SBU, SUB, solar first, grid first), set the charger priority (e.g. allow grid charging
  during off-peak hours). Writing settings is off until enabled in the configuration.
- **Dashboard widget** "Solar inverter": live battery / solar / load / grid tiles, status, mode,
  grid and last read, a "Read now" button and, when enabled, the two priority settings.
- **Four languages**: English, French, German, Spanish.

## Store metadata

| Field            | Value                                                    |
| ---------------- | -------------------------------------------------------- |
| `type`           | `device`                                                 |
| `transports`     | `["cloud"]` — the datalogger only talks to the cloud     |
| `categories`     | `["energy"]`                                             |
| `keywords`       | SmartESS, Eybond, ShineMonitor, Easun, PowMr, MPP Solar… |
| `countries`      | not declared on purpose: DessMonitor is used worldwide   |
| `gladys_version` | `>=5.3.0` (`keywords`; scenes and widget need 5.1)       |

## How it talks to DessMonitor

Every call is a signed GET on `https://api.dessmonitor.com/public/`. The login (`authSource`) is
signed with the SHA-1 of the password — the password itself never leaves Gladys — and returns a
token and a secret that sign every following call. The token is renewed before it expires, or
once when the platform refuses it. See [`src/dessmonitor/client.js`](src/dessmonitor/client.js).

Inverters are listed plant by plant (`queryPlants` → `webQueryCollectorsEs` →
`queryCollectorDevices`, plus `webQueryDeviceEs` for alias and status), then read with
`queryDeviceLastData`. Reading titles differ from one datalogger model to the next; they are
mapped to Gladys features in [`src/dessmonitor/datapoints.js`](src/dessmonitor/datapoints.js).
A title that is not recognized is simply not published — open an issue with the "Test the
connection" output and the integration logs to get it added.

## Project structure

```
.
├─ index.js                          # bootstrap: SDK + registerHandlers + connect
├─ src/
│  ├─ app.js                         # every SDK handler
│  ├─ monitor.js                     # inverters, reads, triggers, badges, settings
│  ├─ poller.js                      # configured interval over Gladys' 1-minute polls
│  ├─ config.js                      # defaults + normalization
│  ├─ connection.js                  # status messages + "Test the connection"
│  ├─ i18n.js                        # en, fr, de, es
│  ├─ dessmonitor/                   # API client, inventory, readings, settings
│  ├─ devices/inverter.js            # discovery payload and states
│  └─ capabilities/                  # scene triggers, scene actions, widget
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, fake DessMonitor cloud + SDK fake Gladys
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, non-root, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, Release, build, GitHub releases, Dependabot
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="dessmonitor" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the integration runs in
its container.

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test
```

The tests never touch the network: [`test/helpers/fakeDessMonitor.js`](test/helpers/fakeDessMonitor.js)
plays the DessMonitor cloud (it checks the signatures like the platform does) and the SDK's
`createFakeGladys()` plays Gladys. [`test/manifest.test.js`](test/manifest.test.js) keeps the
manifest and the code in sync (handlers, trigger values, setting options, defaults, languages,
store rules).

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major` (the first release:
   `major`, which gives `1.0.0`).
3. The workflow bumps `package.json` and the manifest (`version` + `docker_image`), rolls the
   changelog, tags `vX.Y.Z`, builds the `linux/amd64` + `linux/arm64` image to
   `ghcr.io/prohand/gladys-dessmonitor`, publishes the GitHub Release and runs the store admission
   checks.

Once public, the repository needs the GitHub topic `gladys-assistant-integration` to be indexed by
the store, and **Private vulnerability reporting** turned on (see [`SECURITY.md`](SECURITY.md)).
The image package on ghcr.io must be public too.

## Credits

The DessMonitor API details come from the public ShineMonitor API documentation and from the
Home Assistant integration [`andreas-glaser/ha-dessmonitor`](https://github.com/andreas-glaser/ha-dessmonitor).
DessMonitor, SmartESS and Eybond are trademarks of their owners; this project is not affiliated
with them.

## License

Apache-2.0
