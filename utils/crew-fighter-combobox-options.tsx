import { useMemo } from 'react';
import { FighterProps } from '@/types/fighter';
import { IoSkull } from 'react-icons/io5';
import { MdChair } from 'react-icons/md';
import { GiCrossedChains, GiHandcuffs } from 'react-icons/gi';
import { TbMeatOff } from 'react-icons/tb';
import { FaMedkit } from 'react-icons/fa';

export interface CrewFighterOption {
  value: string;
  displayValue: string;
  label: React.ReactNode;
}

/**
 * Returns a memoised list of Combobox options for Crew fighters who have no
 * vehicle assigned. Inactive fighters (killed, retired, etc.) are included and
 * shown with status icons so their state is visible in the picker.
 *
 * The filter and sort are both performed inside the useMemo so that no
 * intermediate array is created on every render, keeping the dependency array
 * stable at [fighters, positioning].
 */
export function useCrewFighterOptions(
  fighters: FighterProps[],
  positioning: Record<number, string> | undefined
): CrewFighterOption[] {
  return useMemo(() => {
    return fighters
      .filter(
        (f) =>
          f.fighter_class === 'Crew' &&
          (!f.vehicles || f.vehicles.length === 0)
      )
      .sort((a, b) => {
        if (!positioning) return 0;
        const indexA = Object.entries(positioning).find(([, id]) => id === a.id)?.[0];
        const indexB = Object.entries(positioning).find(([, id]) => id === b.id)?.[0];
        const posA = indexA !== undefined ? parseInt(indexA) : Infinity;
        const posB = indexB !== undefined ? parseInt(indexB) : Infinity;
        return posA - posB;
      })
      .map((f) => {
        const statusIcons: React.ReactNode[] = [];
        if (f.killed) statusIcons.push(<IoSkull className="text-gray-400 w-4 h-4" key="killed" />);
        if (f.retired) statusIcons.push(<MdChair className="text-muted-foreground w-4 h-4" key="retired" />);
        if (f.enslaved) statusIcons.push(<GiCrossedChains className="text-sky-200 w-4 h-4" key="enslaved" />);
        if (f.starved) statusIcons.push(<TbMeatOff className="text-red-500 w-4 h-4" key="starved" />);
        if (f.recovery) statusIcons.push(<FaMedkit className="text-blue-500 w-4 h-4" key="recovery" />);
        if (f.captured) statusIcons.push(<GiHandcuffs className="text-red-600 w-4 h-4" key="captured" />);

        const displayText = `${f.fighter_name} - ${f.fighter_type}${f.xp !== undefined ? ` (${f.xp} XP)` : ''}`;

        return {
          value: f.id,
          displayValue: displayText,
          label: (
            <span className="flex items-center gap-1">
              <span>{displayText}</span>
              {statusIcons.length > 0 && (
                <span className="flex items-center gap-0.5">{statusIcons}</span>
              )}
            </span>
          ),
        };
      });
  }, [fighters, positioning]);
}
