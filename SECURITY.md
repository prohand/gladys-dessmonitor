# Security policy

## Supported versions

Only the latest release of the DessMonitor integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-dessmonitor](https://github.com/prohand/gladys-dessmonitor/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove usernames, passwords, tokens and serial numbers first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the DessMonitor
cloud and the inverters or dataloggers it manages (report to their manufacturer).

## How the integration handles your account

- The DessMonitor password is stored by Gladys in a secret field. The integration only keeps it in
  memory to sign the login request (SHA-1 hash, never sent in clear), and never writes it, the
  session token or a signed URL to the logs or into an error message.
- Usernames and serial numbers are masked in the logs (`963***`).
- Changing inverter settings is **off by default**: it has to be enabled in the configuration
  before a scene or the widget can write the output or charger priority.
- The container runs as a non-root user on a read-only filesystem and needs no inbound port.

## Good practices for users

- Use a DessMonitor account with the least rights you need. A "viewer" account is enough when you
  do not use the priority settings.
- Keep Gladys and the integration up to date.
