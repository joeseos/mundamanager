export const LOCOMOTION_OPTIONS = ['Wheeled', 'Tracked', 'Walker'] as const;
export type LocomotionOption = typeof LOCOMOTION_OPTIONS[number];
