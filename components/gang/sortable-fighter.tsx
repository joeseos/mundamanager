import { useSortable } from '@dnd-kit/react/sortable';
import { directionBiased } from '@dnd-kit/collision';
import FighterCard from './fighter-card';
import { FighterProps } from '@/types/fighter';
import { useEffect } from 'react';
import { GangPageViewMode } from './ViewModeDropdown';
import { UserPermissions } from '@/types/user-permissions';

interface SortableFighterProps {
  fighter: FighterProps;
  index: number;
  positions: Record<number, string>;
  onFighterDeleted?: (fighterId: string, fighterCost: number) => void;
  viewMode?: GangPageViewMode;
  userPermissions?: UserPermissions;
}

export function SortableFighter({ fighter, index, viewMode = 'normal', userPermissions }: SortableFighterProps) {
  // Check if user can edit to determine if drag should be enabled
  const canEdit = userPermissions?.canEdit ?? false;

  const { ref, isDragging } = useSortable({
    id: fighter.id,
    index,
    disabled: !canEdit, // Disable drag when user can't edit
    // Fighter cards vary a lot in height (killed/retired cards collapse);
    // paired with the custom onDragOver sorting in DraggableFighters this is
    // the stable combination for variable sizes (dnd-kit#1950)
    collisionDetector: directionBiased,
  });

  // Show grabbing cursor on document while dragging so it stays visible even when pointer leaves the card
  useEffect(() => {
    if (!isDragging) return;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.cursor = prevCursor;
    };
  }, [isDragging]);

  // Extract the first vehicle from the vehicles array for the FighterCard
  const vehicle = fighter.vehicles && fighter.vehicles.length > 0 ? fighter.vehicles[0] : undefined;

  return (
    <div
      ref={ref}
      style={{ position: 'relative', zIndex: isDragging ? 50 : undefined }}
      className={viewMode !== 'normal' ? 'min-w-0 w-full' : undefined}
    >
      <FighterCard
        {...fighter}
        name={fighter.fighter_name}
        type={fighter.fighter_type}
        skills={fighter.skills}
        vehicle={vehicle}
        disableLink={isDragging}
        viewMode={viewMode}
        isDragging={isDragging}
        draggable={canEdit}
      />
    </div>
  );
}