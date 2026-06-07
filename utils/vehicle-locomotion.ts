export const LOCOMOTION_OPTIONS = ['Wheeled', 'Tracked', 'Walker', 'Skimmer'] as const;
export type LocomotionOption = typeof LOCOMOTION_OPTIONS[number];
