export const fighterCharacteristicLimits: Record<
  string,
  [string | number, string | number]
> = {
  M: ['1"', '8"'],
  WS: ['2+', '6+'],
  BS: ['2+', '6+'],
  S: [1, 6],
  T: [1, 6],
  W: [1, 6],
  I: ['2+', '6+'],
  A: [1, 10],
  Ld: ['3+', '10+'],
  Cl: ['3+', '10+'],
  Wil: ['3+', '10+'],
  Int: ['3+', '10+'],
};

export const crewCharacteristicLimits: Record<
  string,
  [string | number, string | number]
> = {
  M: ['1"', '12"'],
  Front: [3, 10],
  Side: [3, 10],
  Rear: [3, 10],
  HP: [1, 8],
  Hnd: ['3+', '10+'],
  Sv: ['2+', '6+'],
  BS: ['2+', '6+'],
  Ld: ['3+', '10+'],
  Cl: ['3+', '10+'],
  Wil: ['3+', '10+'],
  Int: ['3+', '10+'],
};
