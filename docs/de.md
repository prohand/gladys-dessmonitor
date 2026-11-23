# DessMonitor

Diese Integration bringt die Solarwechselrichter deines **DessMonitor**-Kontos in Gladys. Es ist
das Konto, das du auf der **DessMonitor**-Website oder in der **SmartESS**-App nutzt, mit einem
Eybond-WLAN-Datenlogger am Wechselrichter (Easun, PowMr, MPP Solar und viele andere Inselanlagen-
oder Hybrid-Wechselrichter).

## Bevor du beginnst

- Dein Wechselrichter erscheint bereits in der App DessMonitor oder SmartESS.
- Du kennst Benutzername und Passwort dieses Kontos.
- Gladys 5.3 oder neuer.

Die Integration spricht über das Internet mit der DessMonitor-Cloud. Im Netzwerk ist nichts zu
installieren, kein Port zu öffnen. Das Badge der Geräte zeigt **cloud**.

## Konfiguration

Öffne **Integrationen → DessMonitor → Konfiguration**.

| Feld                              | Was einzutragen ist                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Benutzername                      | Der Benutzername deines DessMonitor/SmartESS-Kontos.                                                    |
| Passwort                          | Sein Passwort. Von Gladys gespeichert, nie in die Logs geschrieben.                                     |
| Herstellerschlüssel               | Behalte den Standardwert (`bnrl_frRFjEz8Mkn`), außer dein Installateur hat dir einen anderen gegeben.   |
| Aktualisierungsintervall (s)      | Wie oft jeder Wechselrichter gelesen wird: 60 bis 3600 Sekunden, Standard 300.                          |
| Ändern der Einstellungen erlauben | Standardmäßig aus. Schalte es ein, um Ausgangs- und Ladepriorität aus Szenen oder dem Widget zu ändern. |

Speichere und klicke dann auf **Verbindung testen**: Die Integration meldet sich neu an und listet
deine Wechselrichter, ihren Status und die Anzahl ihrer Messwerte.

> DessMonitor selbst aktualisiert die Daten alle 5 Minuten (jede Minute, wenn die
> „Erfassungsbeschleunigung“ in der App aktiv ist). Häufigeres Lesen liefert keine frischeren Werte.

## Wechselrichter hinzufügen

Öffne den Reiter **Erkennung** der Integration: Jeder Wechselrichter des Kontos steht dort unter
seinem Namen aus DessMonitor. Klicke auf **Hinzufügen**. Der Wechselrichter wird ein Gladys-Gerät,
das du einem Raum zuordnen, auf dem Dashboard anzeigen und in Szenen nutzen kannst.

## Die Messwerte

Jeder Wechselrichter erhält nur die Messwerte, die sein Datenlogger wirklich sendet. Die Namen
unten sind die Namen der Funktionen in Gladys (auf Englisch).

| Funktion                           | Einheit | Hinweise                                                       |
| ---------------------------------- | ------- | -------------------------------------------------------------- |
| Solar power (Solarleistung)        | W       | PV-Gesamtleistung (oder PV1, wenn nur PV1 gesendet wird).      |
| Solar power (PV2)                  | W       | Zweiter PV-Eingang, falls vorhanden.                           |
| Solar voltage / current            | V, A    | Solarspannung und -strom.                                      |
| Battery level (Batteriestand)      | %       |                                                                |
| Battery voltage (Batteriespannung) | V       |                                                                |
| Battery current (Batteriestrom)    | A       | Auch Lade- und Entladestrom, wenn gesendet.                    |
| Battery power (Batterieleistung)   | W       | Das Vorzeichen folgt dem Wechselrichter.                       |
| Load power (Verbrauch)             | W       | Was das Haus vom Ausgang des Wechselrichters bezieht.          |
| Output voltage / current           | V, A    | Ausgangsspannung und -strom.                                   |
| Grid power (Netzleistung)          | W       |                                                                |
| Grid voltage (Netzspannung)        | V       | Dient auch zur Erkennung eines Stromausfalls (siehe Auslöser). |
| Inverter temperature               | °C      | Temperatur des Wechselrichters.                                |
| Solar energy today / total         | kWh     | Solarenergie heute und gesamt.                                 |
| Operating mode (Betriebsmodus)     | Text    | Wie der Wechselrichter ihn nennt: „Line Mode“, „Battery Mode“… |

Nur geänderte Werte werden an Gladys gesendet, dazu jeder Wert einmal alle 30 Minuten.

Meldet DessMonitor einen Wechselrichter **offline**, wechselt sein Badge auf **nicht erreichbar**
und seine Werte bleiben unverändert: Die Cloud würde nur alte Messwerte wiederholen.

Ein Messwert aus der DessMonitor-App fehlt in Gladys? Sein Name wird noch nicht erkannt: Eröffne
ein Issue im GitHub-Repository mit dem Ergebnis von **Verbindung testen** und den Logs der
Integration.

## Szenen

### Auslöser

| Auslöser                                 | Wann                                                              | Filter                               | Variablen                   |
| ---------------------------------------- | ----------------------------------------------------------------- | ------------------------------------ | --------------------------- |
| Status eines Wechselrichters ändert sich | DessMonitor meldet einen anderen Status.                          | Wechselrichter, neuer Status         | `status`, `previous_status` |
| Betriebsmodus ändert sich                | Der Wechselrichter wechselt den Modus, z. B. von Line zu Battery. | Wechselrichter                       | `mode`, `previous_mode`     |
| Netz ausgefallen oder zurück             | Die Netzspannung am Eingang fällt unter 90 V oder kommt zurück.   | Wechselrichter, ausgefallen / zurück | `state`                     |

Status: online, offline, Störung, Standby, Warnung, Fehler, Protokollfehler.

Ein Auslöser feuert einmal pro Änderung zwischen zwei Abfragen: Ein Stromausfall, der kürzer als
das Aktualisierungsintervall ist, kann unbemerkt bleiben.

Um auf einen Wert zu reagieren (Batterie unter 20 %, Solar über 3 kW…), nutze den Standard-Auslöser
von Gladys „Ein Gerätewert ändert sich“ auf der Funktion des Wechselrichters.

### Aktionen

| Aktion                        | Was sie tut                                                                            | Ausgaben                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Wechselrichter jetzt abfragen | Liest den Wechselrichter sofort und veröffentlicht seine Werte.                        | `online`, `solar_power`, `battery_level`, `load_power`, `grid_power` (leer, wenn nicht gesendet) |
| Ausgangspriorität setzen      | Solar, Batterie, Netz (SBU) · Solar, Netz, Batterie (SUB) · Solar zuerst · Netz zuerst | `sent`                                                                                           |
| Ladepriorität setzen          | Solar zuerst · Solar und Netz · Nur Solar · Netz zuerst                                | `sent`                                                                                           |

Die beiden Prioritäts-Aktionen brauchen die Option **Ändern der Einstellungen erlauben**. Sie
suchen die Einstellung unter denen, die DessMonitor für deinen Wechselrichter anbietet; `sent` ist
`false`, wenn das Schreiben aus ist oder der Wechselrichter diese Option nicht anbietet.
DessMonitor überträgt die Änderung innerhalb weniger Minuten an den Wechselrichter.

Beispiel: Setze im Niedertarif die Ladepriorität auf **Solar und Netz** und am Ende des
Niedertarifs wieder auf **Nur Solar**.

## Das Widget „Solarwechselrichter“

Füge das Widget **Solarwechselrichter** einem Dashboard hinzu und wähle den Wechselrichter (ohne
Auswahl der erste). Es zeigt:

- Live-Kacheln: Batteriestand, Solar, Verbrauch, Netz (die, die der Wechselrichter sendet);
- Status, Betriebsmodus, Netz und Zeit der letzten Abfrage;
- eine Schaltfläche **Jetzt abfragen**;
- mit **Ändern der Einstellungen erlauben**: Schaltflächen **Ausgangspriorität** und
  **Ladepriorität**, die jeweils ein kurzes Formular öffnen.

## Gut zu wissen

- Die Integration liest DessMonitor nur, außer bei den beiden Prioritäts-Einstellungen, und nur,
  wenn du es erlaubst.
- Dein Passwort signiert die Anmeldung (sein SHA-1-Hash, nie im Klartext gesendet) und wird nie in
  die Logs geschrieben. Seriennummern und Benutzernamen werden dort maskiert.
- Mehrere Anlagen und mehrere Wechselrichter in einem Konto werden unterstützt.
- Eine Änderung des Aktualisierungsintervalls gilt sofort, ohne die Geräte neu hinzuzufügen.

## Fehlerbehebung

| Was du siehst                                                          | Was zu tun ist                                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| „DessMonitor lehnt Benutzername, Passwort oder Herstellerschlüssel ab“ | Prüfe sie in der DessMonitor-App. Behalte den Standard-Herstellerschlüssel, außer dein Installateur hat dir einen anderen gegeben.                    |
| „Verbunden, aber das Konto enthält noch keinen Wechselrichter“         | Das Konto sieht kein Gerät: Prüfe in der App, dass der Datenlogger einer Anlage hinzugefügt ist.                                                      |
| Das Badge zeigt **nicht erreichbar**                                   | DessMonitor meldet den Wechselrichter offline (Datenlogger ohne WLAN?), oder die Cloud hat nicht geantwortet. Die nächste Abfrage versucht es erneut. |
| Ein Messwert fehlt                                                     | Siehe [Die Messwerte](#die-messwerte).                                                                                                                |
| Eine Prioritäts-Aktion antwortet `sent: false`                         | Schalte **Ändern der Einstellungen erlauben** ein; sonst bietet der Wechselrichter diese Option auf DessMonitor nicht an.                             |
