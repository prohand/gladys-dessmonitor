# DessMonitor

Cette intégration amène dans Gladys les onduleurs solaires de votre compte **DessMonitor**. C’est le
compte que vous utilisez sur le site **DessMonitor** ou dans l’application **SmartESS**, avec un
boîtier Wi-Fi Eybond branché sur l’onduleur (Easun, PowMr, MPP Solar et beaucoup d’autres onduleurs
autonomes ou hybrides).

## Avant de commencer

- Votre onduleur apparaît déjà dans l’application DessMonitor ou SmartESS.
- Vous connaissez l’identifiant et le mot de passe de ce compte.
- Gladys 5.3 ou plus récent.

L’intégration parle au cloud DessMonitor par Internet. Rien à installer sur votre réseau, aucun
port à ouvrir. Le badge des appareils indique **cloud**.

## Configuration

Ouvrez **Intégrations → DessMonitor → Configuration**.

| Champ                                  | Que saisir                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Identifiant                            | L’identifiant de votre compte DessMonitor / SmartESS.                                                            |
| Mot de passe                           | Son mot de passe. Conservé par Gladys, jamais écrit dans les logs.                                               |
| Clé fabricant                          | Laissez la valeur par défaut (`bnrl_frRFjEz8Mkn`), sauf si votre installateur vous en a donné une autre.         |
| Intervalle de rafraîchissement (s)     | Fréquence de lecture de chaque onduleur : 60 à 3600 secondes, 300 par défaut.                                    |
| Autoriser la modification des réglages | Désactivé par défaut. Activez-le pour changer la priorité de sortie et de charge depuis les scènes ou le widget. |

Enregistrez, puis cliquez sur **Tester la connexion** : l’intégration se reconnecte et liste vos
onduleurs, leur état et le nombre de mesures de chacun.

> DessMonitor met lui-même ses données à jour toutes les 5 minutes (toutes les minutes quand
> l’« accélération de la collecte » est activée dans l’application). Lire plus souvent ne donne
> pas de valeurs plus fraîches.

## Ajouter les onduleurs

Ouvrez l’onglet **Découverte** de l’intégration : chaque onduleur du compte y figure sous le nom
qu’il porte dans DessMonitor. Cliquez sur **Ajouter**. L’onduleur devient un appareil Gladys que
vous pouvez placer dans une pièce, afficher sur le tableau de bord et utiliser dans les scènes.

## Les mesures

Chaque onduleur ne reçoit que les mesures que son boîtier envoie vraiment. Les noms ci-dessous sont
ceux des fonctionnalités dans Gladys (en anglais).

| Fonctionnalité                          | Unité | Remarques                                                             |
| --------------------------------------- | ----- | --------------------------------------------------------------------- |
| Solar power (puissance solaire)         | W     | Puissance PV totale (ou PV1 si l’onduleur n’envoie que PV1).          |
| Solar power (PV2)                       | W     | Deuxième entrée PV, s’il y en a une.                                  |
| Solar voltage / current                 | V, A  | Tension et courant solaires.                                          |
| Battery level (niveau de batterie)      | %     |                                                                       |
| Battery voltage (tension batterie)      | V     |                                                                       |
| Battery current (courant batterie)      | A     | Aussi courant de charge et de décharge quand ils sont envoyés.        |
| Battery power (puissance batterie)      | W     | Le signe suit l’onduleur.                                             |
| Load power (consommation)               | W     | Ce que la maison tire de la sortie de l’onduleur.                     |
| Output voltage / current                | V, A  | Tension et courant de sortie.                                         |
| Grid power (puissance réseau)           | W     |                                                                       |
| Grid voltage (tension réseau)           | V     | Sert aussi à détecter une coupure de courant (voir les déclencheurs). |
| Inverter temperature                    | °C    | Température de l’onduleur.                                            |
| Solar energy today / total              | kWh   | Énergie solaire du jour et totale.                                    |
| Operating mode (mode de fonctionnement) | texte | Tel que l’onduleur le dit : « Line Mode », « Battery Mode »…          |

Seules les valeurs qui changent sont envoyées à Gladys, plus chaque valeur une fois toutes les
30 minutes.

Quand DessMonitor signale un onduleur **hors ligne**, son badge passe à **injoignable** et ses
valeurs restent telles quelles : le cloud ne ferait que répéter d’anciennes mesures.

Une mesure visible dans l’application DessMonitor manque dans Gladys ? Son nom n’est pas encore
reconnu : ouvrez un ticket sur le dépôt GitHub avec le résultat de **Tester la connexion** et les
logs de l’intégration.

## Scènes

### Déclencheurs

| Déclencheur                      | Quand                                                                  | Filtres                   | Variables                   |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------------- | --------------------------- |
| L’état d’un onduleur change      | DessMonitor signale un autre état pour un onduleur.                    | onduleur, nouvel état     | `status`, `previous_status` |
| Le mode de fonctionnement change | L’onduleur change de mode, par exemple de Line à Battery.              | onduleur                  | `mode`, `previous_mode`     |
| Réseau coupé ou rétabli          | La tension réseau en entrée de l’onduleur passe sous 90 V, ou revient. | onduleur, coupé / rétabli | `state`                     |

États : en ligne, hors ligne, défaut, en veille, alerte, erreur, erreur de protocole.

Un déclencheur se lance une fois par changement vu entre deux lectures : une coupure plus courte
que l’intervalle de rafraîchissement peut passer inaperçue.

Pour agir sur une valeur (batterie sous 20 %, solaire au-dessus de 3 kW…), utilisez le déclencheur
standard de Gladys « La valeur d’un appareil change » sur la fonctionnalité de l’onduleur.

### Actions

| Action                        | Ce qu’elle fait                                                                                      | Sorties                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Lire un onduleur maintenant   | Lit l’onduleur tout de suite et publie ses valeurs.                                                  | `online`, `solar_power`, `battery_level`, `load_power`, `grid_power` (vides si non envoyées) |
| Changer la priorité de sortie | Solaire, batterie, réseau (SBU) · Solaire, réseau, batterie (SUB) · Solaire d’abord · Réseau d’abord | `sent`                                                                                       |
| Changer la priorité de charge | Solaire d’abord · Solaire et réseau · Solaire uniquement · Réseau d’abord                            | `sent`                                                                                       |

Les deux actions de priorité demandent l’option **Autoriser la modification des réglages**. Elles
cherchent le réglage parmi ceux que DessMonitor propose pour votre onduleur ; `sent` vaut `false`
quand l’écriture est désactivée ou que l’onduleur ne propose pas cette option. DessMonitor
transmet le changement à l’onduleur en quelques minutes.

Exemple : en heures creuses, passez la priorité de charge à **Solaire et réseau** ; à la fin des
heures creuses, remettez-la à **Solaire uniquement**.

## Le widget « Onduleur solaire »

Ajoutez le widget **Onduleur solaire** à un tableau de bord et choisissez l’onduleur (le premier
si aucun n’est choisi). Il affiche :

- des tuiles en direct : niveau de batterie, solaire, consommation, réseau (celles que l’onduleur
  envoie) ;
- l’état, le mode de fonctionnement, le réseau et l’heure de la dernière lecture ;
- un bouton **Lire maintenant** ;
- avec **Autoriser la modification des réglages** : des boutons **Priorité de sortie** et
  **Priorité de charge**, qui ouvrent chacun un petit formulaire.

## Bon à savoir

- L’intégration ne fait que lire DessMonitor, sauf pour les deux réglages de priorité, et
  seulement si vous l’autorisez.
- Votre mot de passe sert à signer la connexion (son empreinte SHA-1, jamais envoyé en clair) et
  n’est jamais écrit dans les logs. Les numéros de série et identifiants y sont masqués.
- Plusieurs centrales et plusieurs onduleurs sur un même compte sont pris en charge.
- Un changement d’intervalle de rafraîchissement s’applique tout de suite, sans rajouter les
  appareils.

## Dépannage

| Ce que vous voyez                                                         | Que faire                                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| « DessMonitor refuse l’identifiant, le mot de passe ou la clé fabricant » | Vérifiez-les dans l’application DessMonitor. Gardez la clé fabricant par défaut sauf si votre installateur vous en a donné une autre. |
| « Connecté, mais le compte ne contient encore aucun onduleur »            | Le compte ne voit aucun appareil : vérifiez que le boîtier est ajouté à une centrale dans l’application.                              |
| Le badge indique **injoignable**                                          | DessMonitor signale l’onduleur hors ligne (boîtier sans Wi-Fi ?), ou le cloud n’a pas répondu. La lecture suivante réessaie.          |
| Une mesure manque                                                         | Voir [Les mesures](#les-mesures).                                                                                                     |
| Une action de priorité répond `sent: false`                               | Activez **Autoriser la modification des réglages** ; sinon l’onduleur ne propose pas cette option sur DessMonitor.                    |
