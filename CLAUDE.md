# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors working in
this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime dependency:
`@gladysassistant/integration-sdk`) for solar inverters monitored on the **DessMonitor** cloud
(dessmonitor.com, the SmartESS app, Eybond Wi-Fi dataloggers — Easun, PowMr, MPP Solar…). It
started from the official template
[`GladysAssistant/integration-template-js`](https://github.com/GladysAssistant/integration-template-js);
the workflows are those of [`prohand/gladys-devmel`](https://github.com/prohand/gladys-devmel).

Cloud only (`transports: ["cloud"]`): the datalogger talks to the DessMonitor cloud, never to the
LAN. Requires Gladys 5.3+ (`keywords`). Scene triggers (status, operating mode, grid lost /
restored), scene actions (read now, output priority, charger priority) and a "Solar inverter"
widget.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/app.test.js                # one file
node --test --test-name-pattern "widget"    # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store admission checks
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on Node 22 and 24; pull
requests also run the store admission checks and build the image. Run the three commands before
pushing.

## Architecture

```
index.js                          bootstrap only: new GladysIntegration(), registerHandlers, connect
src/app.js                        every SDK handler (scan, poll, actions, scenes, widget, config)
src/monitor.js                    runtime: inverters, reads, publications, scene triggers, badges, settings
src/poller.js                     applies the configured interval to Gladys' 1-minute polls
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/connection.js                 connection status messages + "Test the connection"
src/i18n.js                       LANGUAGES (en, fr, de, es), pick, localize
src/dessmonitor/client.js         signed API client (login, token renewal, actions), DessMonitorError
src/dessmonitor/inventory.js      plants -> dataloggers -> inverters
src/dessmonitor/datapoints.js     reading titles -> Gladys features, units, status codes
src/dessmonitor/controls.js       output / charger priority: field and option found by name
src/devices/inverter.js           discovery payload + states of one inverter
src/capabilities/triggers.js      scene trigger keys
src/capabilities/scenes.js        scene action handlers
src/capabilities/widget.js        "Solar inverter" widget (content + button actions)
gladys-assistant-integration.json manifest
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys, kept in sync
test/                             node --test; test/helpers/fakeDessMonitor.js fakes the cloud
.github/scripts/changelog-release.mjs  rolls CHANGELOG.md on release (tested)
```

### The DessMonitor API, in short

- One signed GET per call on `https://api.dessmonitor.com/public/?sign=&salt=[&token=]&action=…`.
- Login `authSource` (`usr`, `company-key`, default `bnrl_frRFjEz8Mkn`):
  `sign = SHA-1(salt + SHA-1(password) + actionString)` → `{ token, secret, expire }`.
- Other calls: `sign = SHA-1(salt + secret + token + actionString)`.
- `actionString` is signed **exactly as sent**: values encoded first (`quotePlus`), or the
  platform answers ERR_SIGN for any username with a space.
- `err` codes: 4 ERR_SIGN / 10 ERR_NO_AUTH → log in again once; 15/16/25/261 → credentials;
  12 ERR_NO_RECORD → empty list.
- Readings: `queryDeviceLastData(pn, devcode, devaddr, sn)` → `[{ title, val, unit }]`, titles
  depend on the datalogger `devcode`; some only give the battery level in `queryDeviceParsEs`.
- Status per device in `webQueryDeviceEs` (per plant): 0 online, 1 offline, 2 fault, 3 standby,
  4 warning, 5 error, 6 protocol error.

## Rules

- **External ids are forever.** Devices are `gladys.externalIds('inverter', <serial>)`, features
  `<device>:<feature key>` (keys in `datapoints.js`). Never rename a feature key, a config key,
  an action, a scene trigger / action key, a trigger option value or the widget key: users store
  them.
- **Every feature carries `name`, `min`, `max`, `read_only` and `has_feedback`** (Gladys stores
  them NOT NULL; the fake Gladys of the SDK refuses a feature without them).
- **Polling**: devices are published with `poll_frequency: 60000` (an enum in ms — any other value
  makes Gladys reject the WHOLE discovery) and `should_poll: true`; the configured interval
  (seconds) is applied by `src/poller.js`, never published.
- **A transition fires one scene event**, never the first value seen; an offline inverter
  publishes nothing (the cloud would re-date stale values).
- **Settings are written only when `allow_control` is on.** A setting that cannot be written is a
  scene output (`sent: false`), not a failure.
- **Secrets.** Never log the password, the token, the secret, a signed URL; mask usernames and
  serials with `mask()`. The container rootfs is read-only; nothing is written outside `/data`.
- **Versions belong to the Release workflow** (Actions → Release). Never edit `version` in
  `package.json` or in the manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js`
  checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`
  (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version heading: the
  Release workflow moves the section and it becomes the notes of the GitHub Release.
- **Manifest.** Every text is `{ en, fr, de, es }` (labels, descriptions, placeholders, options);
  the catalog description holds 10 to 100 characters per language. `keywords` / `countries` need
  `gladys_version >=5.3.0`. `countries` is deliberately absent: DessMonitor is worldwide (a test
  pins it). `test/manifest.test.js` ties the manifest to the code: change both sides together.
- **User-facing text** (action messages, connection status, widget, toasts) is
  `{ en, fr, de, es }`, built with `src/i18n.js`; `docs/en.md`, `fr.md`, `de.md`, `es.md` are kept
  in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English. Tests
  never touch the network (`test/helpers/fakeDessMonitor.js`).
