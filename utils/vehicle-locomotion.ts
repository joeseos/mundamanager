export const LOCOMOTION_OPTIONS = ['Wheeled', 'Tracked', 'Walker', 'Skimmer'] as const;
export type LocomotionOption = typeof LOCOMOTION_OPTIONS[number];

/** Allowed locomotion choices per vehicle type (matched by lowercase name). Unlisted types get all options. */
export const VEHICLE_TYPE_LOCOMOTION_RESTRICTIONS: Record<string, readonly LocomotionOption[]> = {
  'light vehicle':  ['Wheeled', 'Tracked'],
  'medium vehicle': ['Wheeled', 'Tracked'],
  'heavy vehicle':  ['Wheeled', 'Tracked'],
  'custom rig':     ['Wheeled', 'Tracked'],
  'walker':         ['Walker'],
};

export function getAllowedLocomotionOptions(vehicleTypeName: string): readonly LocomotionOption[] {
  return VEHICLE_TYPE_LOCOMOTION_RESTRICTIONS[vehicleTypeName.toLowerCase()] ?? LOCOMOTION_OPTIONS;
}
