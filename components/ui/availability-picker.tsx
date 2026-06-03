'use client';

const AVAILABILITY_NUMBERS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

export function combineAvailability(letter: 'C' | 'R' | 'E' | 'I', number: number): string;
export function combineAvailability(letter: string, number: number): string | null;
export function combineAvailability(letter: string, number: number): string | null {
  if (!letter) return null;
  if (letter === 'C' || letter === 'E') return letter;
  return `${letter}${number}`;
}

export function parseAvailability(availability: string | null | undefined): { letter: string; number: number } {
  if (!availability) return { letter: '', number: 6 };
  if (availability === 'C' || availability === 'E') return { letter: availability, number: 6 };
  if (availability === 'I') return { letter: 'I', number: 6 };
  const match = availability.match(/^([CREI])(\d+)$/);
  if (match) return { letter: match[1], number: Math.min(Math.max(parseInt(match[2]), 6), 20) };
  return { letter: '', number: 6 };
}

export function AvailabilityPicker({
  letter,
  number,
  onLetterChange,
  onNumberChange,
  allowEmpty = false,
  label,
}: {
  letter: string;
  number: number;
  onLetterChange: (letter: string) => void;
  onNumberChange: (number: number) => void;
  allowEmpty?: boolean;
  label?: string;
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-muted-foreground mb-1">{label}</label>
      )}
      <div className="flex gap-2">
        <select
          value={letter}
          onChange={(e) => {
            onLetterChange(e.target.value);
            if (!e.target.value) onNumberChange(6);
          }}
          className="p-2 border rounded-md bg-background text-base md:text-sm"
        >
          {allowEmpty && <option value="">None</option>}
          <option value="C">C</option>
          <option value="R">R</option>
          <option value="E">E</option>
          <option value="I">I</option>
        </select>
        <select
          value={number}
          onChange={(e) => onNumberChange(parseInt(e.target.value))}
          disabled={!letter || letter === 'C' || letter === 'E' || letter === 'I'}
          className="flex-1 p-2 border rounded-md bg-background text-base md:text-sm disabled:bg-muted disabled:text-gray-400"
        >
          {AVAILABILITY_NUMBERS.map(num => (
            <option key={num} value={num}>{num}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
