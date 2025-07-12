// Client-safe cache tag constants (no server functions)
export const CACHE_TAGS = {
  FIGHTER_PAGE: (id: string) => `fighter-page-${id}`,
  GANG_OVERVIEW: (id: string) => `gang-overview-${id}`,
  GANG_FIGHTERS_LIST: (id: string) => `gang-fighters-${id}`,
  VEHICLE_EQUIPMENT: (id: string) => `vehicle-${id}-equipment`,
  VEHICLE_STATS: (id: string) => `vehicle-${id}-stats`,
  GANG_CREDITS: (id: string) => `gang-${id}-credits`,
  GANG_RATING: (id: string) => `gang-${id}-rating`,
  VEHICLE_PAGE: (id: string) => `vehicle-page-${id}`,
  FIGHTER_VEHICLE_DATA: (id: string) => `fighter-vehicle-${id}`,
} as const; 