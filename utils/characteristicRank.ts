// Profile order, used to group and sort the Advancement characteristic list.
// 1-9 are the main characteristics, 10-13 the psychology ones; the thresholds in
// fighter-advancement-list.tsx follow these numbers.
//
// Save is N26-only and sits after Attacks on that edition's statline
// (M, WS, BS, S, T, W, I, A, Sv, Ld, Cl, Wil, Int). N23 has no Save Advancement,
// so the entry simply never matches there.
export const characteristicRank: { [key: string]: number } = {
  "movement": 1,
  "weapon skill": 2,
  "ballistic skill": 3,
  "strength": 4,
  "toughness": 5,
  "wounds": 6,
  "initiative": 7,
  "attacks": 8,
  "save": 9,
  //
  "leadership": 10,
  "cool": 11,
  "willpower": 12,
  "intelligence": 13,
};
