# DessMonitor

Esta integración trae a Gladys los inversores solares de su cuenta **DessMonitor**. Es la cuenta
que usa en el sitio **DessMonitor** o en la aplicación **SmartESS**, con un registrador Wi-Fi
Eybond conectado al inversor (Easun, PowMr, MPP Solar y muchos otros inversores aislados o
híbridos).

## Antes de empezar

- Su inversor ya aparece en la aplicación DessMonitor o SmartESS.
- Conoce el usuario y la contraseña de esa cuenta.
- Gladys 5.3 o más reciente.

La integración habla con la nube DessMonitor por Internet. No hay nada que instalar en su red ni
ningún puerto que abrir. La insignia de los dispositivos indica **cloud**.

## Configuración

Abra **Integraciones → DessMonitor → Configuración**.

| Campo                          | Qué introducir                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Usuario                        | El usuario de su cuenta DessMonitor / SmartESS.                                                                 |
| Contraseña                     | Su contraseña. Guardada por Gladys, nunca escrita en los registros.                                             |
| Clave de fabricante            | Deje el valor por defecto (`bnrl_frRFjEz8Mkn`), salvo si su instalador le dio otra.                             |
| Intervalo de actualización (s) | Cada cuánto se lee cada inversor: de 60 a 3600 segundos, 300 por defecto.                                       |
| Permitir cambiar los ajustes   | Desactivado por defecto. Actívelo para cambiar la prioridad de salida y de carga desde las escenas o el widget. |

Guarde y pulse **Probar la conexión**: la integración vuelve a conectarse y lista sus inversores,
su estado y cuántas medidas envía cada uno.

> DessMonitor actualiza sus datos cada 5 minutos (cada minuto si la «aceleración de la recogida»
> está activada en la aplicación). Leer más a menudo no da valores más recientes.

## Añadir los inversores

Abra la pestaña **Descubrimiento** de la integración: cada inversor de la cuenta aparece con el
nombre que tiene en DessMonitor. Pulse **Añadir**. El inversor se convierte en un dispositivo de
Gladys que puede colocar en una habitación, mostrar en el panel y usar en escenas.

## Las medidas

Cada inversor solo recibe las medidas que su registrador envía realmente. Los nombres de abajo son
los de las funciones en Gladys (en inglés).

| Función                                 | Unidad | Notas                                                               |
| --------------------------------------- | ------ | ------------------------------------------------------------------- |
| Solar power (potencia solar)            | W      | Potencia PV total (o PV1 si el inversor solo envía PV1).            |
| Solar power (PV2)                       | W      | Segunda entrada PV, si la hay.                                      |
| Solar voltage / current                 | V, A   | Tensión y corriente solares.                                        |
| Battery level (nivel de batería)        | %      |                                                                     |
| Battery voltage (tensión de batería)    | V      |                                                                     |
| Battery current (corriente de batería)  | A      | También corriente de carga y de descarga si se envían.              |
| Battery power (potencia de batería)     | W      | El signo sigue al inversor.                                         |
| Load power (consumo)                    | W      | Lo que la casa toma de la salida del inversor.                      |
| Output voltage / current                | V, A   | Tensión y corriente de salida.                                      |
| Grid power (potencia de red)            | W      |                                                                     |
| Grid voltage (tensión de red)           | V      | También sirve para detectar un corte de luz (ver los disparadores). |
| Inverter temperature                    | °C     | Temperatura del inversor.                                           |
| Solar energy today / total              | kWh    | Energía solar del día y total.                                      |
| Operating mode (modo de funcionamiento) | texto  | Tal como lo dice el inversor: «Line Mode», «Battery Mode»…          |

Solo se envían a Gladys los valores que cambian, más cada valor una vez cada 30 minutos.

Cuando DessMonitor indica un inversor **desconectado**, su insignia pasa a **inaccesible** y sus
valores se quedan como estaban: la nube solo repetiría medidas antiguas.

¿Falta en Gladys una medida que ve en la aplicación DessMonitor? Su nombre aún no se reconoce: abra
una incidencia en el repositorio de GitHub con el resultado de **Probar la conexión** y los
registros de la integración.

## Escenas

### Disparadores

| Disparador                       | Cuándo                                                 | Filtros                          | Variables                   |
| -------------------------------- | ------------------------------------------------------ | -------------------------------- | --------------------------- |
| Cambia el estado de un inversor  | DessMonitor indica otro estado para un inversor.       | inversor, nuevo estado           | `status`, `previous_status` |
| Cambia el modo de funcionamiento | El inversor cambia de modo, p. ej. de Line a Battery.  | inversor                         | `mode`, `previous_mode`     |
| Red cortada o restablecida       | La tensión de red a la entrada baja de 90 V, o vuelve. | inversor, cortada / restablecida | `state`                     |

Estados: en línea, desconectado, avería, en espera, aviso, error, error de protocolo.

Un disparador se lanza una vez por cambio visto entre dos lecturas: un corte más corto que el
intervalo de actualización puede pasar desapercibido.

Para actuar sobre un valor (batería por debajo del 20 %, solar por encima de 3 kW…), use el
disparador estándar de Gladys «Cambia el valor de un dispositivo» sobre la función del inversor.

### Acciones

| Acción                         | Qué hace                                                                            | Salidas                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Leer un inversor ahora         | Lee el inversor enseguida y publica sus valores.                                    | `online`, `solar_power`, `battery_level`, `load_power`, `grid_power` (vacías si no se envían) |
| Cambiar la prioridad de salida | Solar, batería, red (SBU) · Solar, red, batería (SUB) · Solar primero · Red primero | `sent`                                                                                        |
| Cambiar la prioridad de carga  | Solar primero · Solar y red · Solo solar · Red primero                              | `sent`                                                                                        |

Las dos acciones de prioridad requieren la opción **Permitir cambiar los ajustes**. Buscan el
ajuste entre los que DessMonitor ofrece para su inversor; `sent` vale `false` cuando la escritura
está desactivada o el inversor no ofrece esa opción. DessMonitor transmite el cambio al inversor en
unos minutos.

Ejemplo: en horas valle, ponga la prioridad de carga en **Solar y red**; al final de las horas
valle, vuelva a **Solo solar**.

## El widget «Inversor solar»

Añada el widget **Inversor solar** a un panel y elija el inversor (el primero si no elige
ninguno). Muestra:

- mosaicos en directo: nivel de batería, solar, consumo, red (los que el inversor envía);
- el estado, el modo de funcionamiento, la red y la hora de la última lectura;
- un botón **Leer ahora**;
- con **Permitir cambiar los ajustes**: botones **Prioridad de salida** y **Prioridad de carga**,
  que abren cada uno un pequeño formulario.

## Bueno saber

- La integración solo lee DessMonitor, salvo para los dos ajustes de prioridad, y solo si usted lo
  permite.
- Su contraseña sirve para firmar la conexión (su huella SHA-1, nunca enviada en claro) y nunca se
  escribe en los registros. Los números de serie y usuarios se ocultan en ellos.
- Se admiten varias plantas y varios inversores en una misma cuenta.
- Un cambio del intervalo de actualización se aplica enseguida, sin volver a añadir los
  dispositivos.

## Solución de problemas

| Lo que ve                                                                | Qué hacer                                                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| «DessMonitor rechaza el usuario, la contraseña o la clave de fabricante» | Compruébelos en la aplicación DessMonitor. Conserve la clave por defecto salvo si su instalador le dio otra.                      |
| «Conectado, pero la cuenta todavía no contiene ningún inversor»          | La cuenta no ve ningún dispositivo: compruebe en la aplicación que el registrador está añadido a una planta.                      |
| La insignia indica **inaccesible**                                       | DessMonitor indica el inversor desconectado (¿registrador sin Wi-Fi?), o la nube no respondió. La siguiente lectura lo reintenta. |
| Falta una medida                                                         | Vea [Las medidas](#las-medidas).                                                                                                  |
| Una acción de prioridad responde `sent: false`                           | Active **Permitir cambiar los ajustes**; si no, el inversor no ofrece esa opción en DessMonitor.                                  |
