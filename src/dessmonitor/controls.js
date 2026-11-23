// -----------------------------------------------------------------------------
// Inverter settings written through the cloud.
//
// The platform describes the settings it can write on a device with
// `queryDeviceCtrlField`: `{ id, name, item: [{ key, val }] }`, `val` being the
// vendor's label of the option ("SBU priority", "Utility first", "Only PV"...)
// and `key` what `ctrlDevice` expects. Ids and labels change from one
// datalogger model to the next, so a setting is found by its name and an
// option by its label, with the patterns below.
//
// The cloud accepts a write and relays it to the inverter later: an accepted
// write is "sent", not "applied".
// -----------------------------------------------------------------------------

/** The settings this integration knows how to write, with their options. */
export const SETTINGS = {
  output_priority: {
    field: /output.*priorit|priorit.*output|output source/i,
    exclude: /charg/i,
    options: {
      // Order matters: "SBU" and "SUB" are checked before "solar" and "utility".
      sbu: /\bsbu\b|solar.*battery.*utility/i,
      sub: /\bsub\b|solar.*utility.*battery/i,
      solar: /^\s*(sol|solar|pv)\b|solar first|pv first/i,
      utility: /^\s*(uti|utility|mains|line|grid)\b|utility first|mains first/i,
    },
  },
  charger_priority: {
    field: /charg.*priorit|priorit.*charg|charger source/i,
    exclude: null,
    options: {
      solar_only: /only/i,
      solar_and_utility: /same|equal|\band\b|\+/i,
      solar_first: /^\s*(pv|solar|sol)\b|solar first|pv first/i,
      utility_first: /^\s*(uti|utility|mains|grid)\b|utility first|mains first/i,
    },
  },
};

/** The option keys of a setting, as the manifest lists them. */
export function optionKeys(setting) {
  return Object.keys(SETTINGS[setting].options);
}

/**
 * Find the platform field and item for one setting and option.
 * @param {Array<{ id: string, name: string, item?: Array<{ key: string, val: string }> }>} fields
 * @returns {{ id: string, value: string, label: string } | null}
 */
export function resolveSetting(fields, setting, option) {
  const spec = SETTINGS[setting];
  if (!spec || !spec.options[option]) {
    return null;
  }
  const field = fields.find(
    (candidate) =>
      candidate?.id &&
      spec.field.test(candidate.name ?? '') &&
      !(spec.exclude && spec.exclude.test(candidate.name ?? '')) &&
      Array.isArray(candidate.item) &&
      candidate.item.length > 0,
  );
  if (!field) {
    return null;
  }
  // The first option whose pattern matches an item label is that item's
  // option: "SBU priority" is sbu, never solar.
  const optionOf = (label) =>
    Object.entries(spec.options).find(([, pattern]) => pattern.test(label))?.[0];
  const item = field.item.find((candidate) => optionOf(String(candidate.val ?? '')) === option);
  if (!item) {
    return null;
  }
  return { id: String(field.id), value: String(item.key), label: String(item.val) };
}
