export interface ActivityStats {
  last2Weeks: number | null;
  last1Month: number | null;
  last3Months: number | null;
  last6Months: number | null;
}

export interface EditionCounts {
  n23: number | null;
  n26: number | null;
}

export interface StatWithEdition extends EditionCounts {
  total: number | null;
}

export interface ActivityStatsWithEdition {
  last2Weeks: StatWithEdition | null;
  last1Month: StatWithEdition | null;
  last3Months: StatWithEdition | null;
  last6Months: StatWithEdition | null;
}
