# DessMonitor

This integration brings the solar inverters of your **DessMonitor** account into Gladys. It is the
account you use in the **DessMonitor** website or the **SmartESS** app, with an Eybond Wi-Fi
datalogger plugged into the inverter (Easun, PowMr, MPP Solar and many other off-grid or hybrid
inverters).

## Before you start

- Your inverter already shows up in the DessMonitor or SmartESS app.
- You know the username and password of that account.
- Gladys 5.3 or newer.

The integration talks to the DessMonitor cloud over the Internet. Nothing to install on your
network, no port to open. Its badge on the devices reads **cloud**.

## Configuration

Open **Integrations → DessMonitor → Configuration**.

| Field                            | What to enter                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Username                         | The username of your DessMonitor / SmartESS account.                                            |
| Password                         | Its password. Stored by Gladys, never written in the logs.                                      |
| Company key                      | Leave the default value (`bnrl_frRFjEz8Mkn`) unless your installer gave you another one.        |
| Refresh interval (s)             | How often each inverter is read: 60 to 3600 seconds, 300 by default.                            |
| Allow changing inverter settings | Off by default. Turn it on to change the output and charger priority from scenes or the widget. |

Save, then click **Test the connection**: it logs in again and lists your inverters, their status
and how many readings each one reports.

> DessMonitor itself refreshes the data every 5 minutes (every minute when "collection
> acceleration" is on in the app). Reading more often does not give fresher values.

## Add the inverters

Open the **Discovery** tab of the integration: each inverter of the account is listed under the
name it has in DessMonitor. Click **Add**. The inverter becomes a Gladys device you can put in a
room, show on the dashboard and use in scenes.

## The readings

Each inverter only gets the readings its datalogger actually reports. The names below are the
Gladys feature names.

| Feature                    | Unit | Notes                                                       |
| -------------------------- | ---- | ----------------------------------------------------------- |
| Solar power                | W    | Total PV power (or PV1 when the inverter only reports PV1). |
| Solar power (PV2)          | W    | Second PV input, when there is one.                         |
| Solar voltage / current    | V, A |                                                             |
| Battery level              | %    |                                                             |
| Battery voltage            | V    |                                                             |
| Battery current            | A    | Also charging and discharging current when reported.        |
| Battery power              | W    | The sign follows the inverter.                              |
| Load power                 | W    | What the house draws from the inverter output.              |
| Output voltage / current   | V, A |                                                             |
| Grid power                 | W    |                                                             |
| Grid voltage               | V    | Also used to detect a power cut (see the triggers).         |
| Inverter temperature       | °C   |                                                             |
| Solar energy today / total | kWh  |                                                             |
| Operating mode             | text | As the inverter says it: "Line Mode", "Battery Mode"…       |

Only the values that changed are sent to Gladys, plus every value once every 30 minutes.

When DessMonitor reports an inverter **offline**, its badge turns to **unreachable** and its values
are left as they were: the cloud would only repeat old readings.

A reading you see in the DessMonitor app is missing in Gladys? Its name is not recognized yet: open
an issue on the GitHub repository with the result of **Test the connection** and the integration
logs.

## Scenes

### Triggers

| Trigger                 | When                                                                    | Filters                   | Variables                   |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------- | --------------------------- |
| Inverter status changed | DessMonitor reports another status for an inverter.                     | inverter, new status      | `status`, `previous_status` |
| Operating mode changed  | The inverter switches mode, e.g. from Line to Battery.                  | inverter                  | `mode`, `previous_mode`     |
| Grid lost or restored   | The grid voltage at the inverter input drops below 90 V, or comes back. | inverter, lost / restored | `state`                     |

Statuses: online, offline, fault, standby, warning, error, protocol error.

A trigger fires once per change, seen between two reads: a power cut shorter than the refresh
interval may go unnoticed.

To act on a value (battery below 20 %, solar power above 3 kW…), use the standard Gladys trigger
"A device value changes" on the inverter's feature.

### Actions

| Action                   | What it does                                                                       | Outputs                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Read an inverter now     | Reads the inverter right away and publishes its values.                            | `online`, `solar_power`, `battery_level`, `load_power`, `grid_power` (empty when not reported) |
| Set the output priority  | Solar, battery, grid (SBU) · Solar, grid, battery (SUB) · Solar first · Grid first | `sent`                                                                                         |
| Set the charger priority | Solar first · Solar and grid · Solar only · Grid first                             | `sent`                                                                                         |

The two priority actions need **Allow changing inverter settings** in the configuration. They
look for the setting among those DessMonitor offers for your inverter; `sent` is `false` when
writing is turned off or when the inverter does not offer that option. DessMonitor relays the
change to the inverter within a few minutes.

Example: during off-peak hours, set the charger priority to **Solar and grid**; at the end of
off-peak hours, set it back to **Solar only**.

## The "Solar inverter" widget

Add the **Solar inverter** widget to a dashboard and pick the inverter (the first one when none is
chosen). It shows:

- live tiles: battery level, solar, load, grid (the ones the inverter reports);
- the status, the operating mode, the grid and the time of the last read;
- a **Read now** button;
- with **Allow changing inverter settings** on: **Output priority** and **Charger priority**
  buttons, each opening a short form.

## Good to know

- The integration only reads DessMonitor, except for the two priority settings, and only when you
  allow it.
- Your password is used to sign the login (its SHA-1 hash, never sent in clear) and is never
  written in the logs. Serial numbers and usernames are masked there.
- Several plants and several inverters on one account are supported.
- Changing the refresh interval takes effect at once, without re-adding the devices.

## Troubleshooting

| What you see                                                        | What to do                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "DessMonitor refused the username, the password or the company key" | Check them in the DessMonitor app. Keep the default company key unless your installer gave you another one.               |
| "Connected, but the account holds no inverter yet"                  | The account sees no device: check that the datalogger is added to a plant in the app.                                     |
| The badge reads **unreachable**                                     | DessMonitor reports the inverter offline (datalogger without Wi-Fi?), or the cloud did not answer. The next read retries. |
| A reading is missing                                                | See [The readings](#the-readings).                                                                                        |
| A priority action answers `sent: false`                             | Turn on **Allow changing inverter settings**; otherwise the inverter does not offer this option on DessMonitor.           |
